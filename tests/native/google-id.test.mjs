import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, signClaims, FIRST, SECOND, CLIENT, ORIGIN, project } from './harness.mjs';
import { sha256 } from '../../cloudflare/native/security.mjs';

function post(h, path, body, jar = '', overrides = {}) {
  return h.request(path, { method: 'POST', headers: {
    Origin: ORIGIN, 'X-SG-Login': '1', 'Content-Type': 'application/json',
    Cookie: jar, ...overrides
  }, body: JSON.stringify(body) });
}
async function prepare(h) {
  const response = await post(h, '/auth/google/prepare', {});
  assert.equal(response.status, 200);
  return { ...await response.json(), cookie: response.headers.get('set-cookie').split(';')[0], response };
}
async function complete(h, pending, claims = {}, headers = {}) {
  return post(h, '/auth/google/credential', {
    state: pending.state, credential: await signClaims({ nonce: pending.nonce, ...claims })
  }, pending.cookie, headers);
}
const noSecret = () => harness({ GOOGLE_CLIENT_SECRET: '' });

for (const [email, sub] of [[FIRST, 'gis-first'], [SECOND, 'gis-second']]) {
  test('ID-token sign-in works without a secret for ' + email, async () => {
    const h = noSecret(); const pending = await prepare(h);
    const response = await complete(h, pending, { email, sub });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, redirect: '/' });
    const session = response.headers.getSetCookie().find(c => c.startsWith('__Host-sg-session='));
    assert.match(session, /HttpOnly; Secure; SameSite=Lax/);
    const state = await (await h.request('/api/state', { headers: { Cookie: session.split(';')[0] } })).json();
    assert.equal(state.user.email, email); assert.equal(state.user.role, 'owner');
    assert.equal(h.tokenFetches, 0, 'no OAuth code exchange or client secret was used');
    const result = await h.as({ cookie: session.split(';')[0], csrf: state.user.csrf }, '/api/projects', 'POST', project);
    assert.equal(result.status, 200); h.close();
  });
}
test('status advertises ID-token mode, public ID and no secret values', async () => {
  const h = noSecret(); const response = await h.request('/auth/status'); const data = await response.json();
  assert.equal(data.ready, true); assert.equal(data.configured, false); assert.equal(data.mode, 'google_identity'); assert.equal(data.client_id, CLIENT);
  assert.deepEqual(data.missing, []); assert.equal('client_secret' in data, false); assert.equal('allowed_emails' in data, false);
  assert.equal(response.headers.get('Cache-Control'), 'no-store'); h.close();
});
test('configured redirect flow remains available for existing deployments', async () => {
  const h = harness(); assert.equal((await (await h.request('/auth/status')).json()).mode, 'authorization_code');
  assert.equal((await h.login()).response.status, 303); h.close();
});
for (const [env, missing] of [
  [{ GOOGLE_CLIENT_ID: '' }, 'google_client_id'], [{ GOOGLE_CLIENT_ID: 'not-a-client' }, 'google_client_id'],
  [{ ALLOWED_EMAILS: '' }, 'allowed_emails']
]) test('missing ' + missing + ' fails closed: ' + JSON.stringify(env), async () => {
  const h = harness({ GOOGLE_CLIENT_SECRET: '', ...env }); const data = await (await h.request('/auth/status')).json();
  assert.equal(data.ready, false); assert.ok(data.missing.includes(missing));
  assert.equal((await post(h, '/auth/google/prepare', {})).status, 503);
  assert.equal((await h.request('/api/state')).status, 401); h.close();
});
test('missing database binding is reported without exposing private settings', async () => {
  const h = noSecret(); delete h.env.STUDIO;
  const data = await (await h.request('/auth/status')).json(); assert.ok(data.missing.includes('studio_storage'));
  assert.equal(data.ready, false); h.close();
});
test('prepare returns a browser-bound secure cookie and separate unpredictable nonce', async () => {
  const h = noSecret(); const a = await prepare(h), b = await prepare(h);
  assert.notEqual(a.state, b.state); assert.notEqual(a.state, a.nonce); assert.equal(a.expires_in, 600);
  assert.match(a.response.headers.get('Set-Cookie'), /__Host-sg-google-id=.*HttpOnly; Secure; SameSite=Lax/);
  assert.equal(a.response.headers.get('Cache-Control'), 'no-store'); h.close();
});
for (const [name, headers] of [
  ['foreign origin', { Origin: 'https://attacker.example' }], ['null origin', { Origin: 'null' }],
  ['missing origin', { Origin: '' }], ['missing custom header', { 'X-SG-Login': '' }],
  ['cross-site fetch', { 'Sec-Fetch-Site': 'cross-site' }], ['sibling subdomain fetch', { 'Sec-Fetch-Site': 'same-site' }]
]) test('reject ' + name + ' before making any login state', async () => {
  const h = noSecret(); assert.equal((await post(h, '/auth/google/prepare', {}, '', headers)).status, 403);
  assert.equal(h.store.row('SELECT count(*) AS n FROM oauth_states').n, 0); h.close();
});
for (const [name, claims] of [
  ['unlisted account', { email: 'outsider@example.com' }], ['email suffix spoof', { email: FIRST + '.evil.test' }],
  ['unverified account', { email_verified: false }], ['bad issuer', { iss: 'https://attacker.example' }],
  ['wrong audience', { aud: 'other-client.apps.googleusercontent.com' }], ['incorrect nonce', { nonce: 'wrong' }],
  ['expired token', { exp: 1 }], ['missing subject', { sub: '' }]
]) test('ID-token endpoint rejects ' + name + ' and leaves private routes closed', async () => {
  const h = noSecret(); const pending = await prepare(h); const response = await complete(h, pending, claims);
  assert.equal(response.status, 403); assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(h.store.row('SELECT count(*) AS n FROM sessions').n, 0);
  assert.equal((await h.request('/api/state')).status, 401); assert.equal(h.tokenFetches, 0); h.close();
});
test('state cannot be reused after a successful login', async () => {
  const h = noSecret(); const pending = await prepare(h); assert.equal((await complete(h, pending)).status, 200);
  assert.equal((await complete(h, pending)).status, 403); assert.equal(h.store.row('SELECT count(*) AS n FROM sessions').n, 1); h.close();
});
test('state is consumed even when the provider token is rejected', async () => {
  const h = noSecret(); const pending = await prepare(h); assert.equal((await complete(h, pending, { nonce: 'wrong' })).status, 403);
  assert.equal((await complete(h, pending)).status, 403); h.close();
});
test('expired browser state cannot establish a session', async () => {
  const h = noSecret(); const pending = await prepare(h); h.store.sql.exec('UPDATE oauth_states SET expires=1');
  assert.equal((await complete(h, pending)).status, 403); h.close();
});
test('signed credential without its browser cookie is rejected', async () => {
  const h = noSecret(); const pending = await prepare(h); pending.cookie = '';
  assert.equal((await complete(h, pending)).status, 403); h.close();
});
test('two browsers cannot swap their pending states', async () => {
  const h = noSecret(); const a = await prepare(h), b = await prepare(h); a.cookie = b.cookie;
  assert.equal((await complete(h, a)).status, 403); h.close();
});
test('ID-token completion rejects cross-origin submissions', async () => {
  const h = noSecret(); const pending = await prepare(h);
  assert.equal((await complete(h, pending, {}, { Origin: 'https://attacker.example' })).status, 403); h.close();
});
test('state cannot be relabeled from another authentication flow', async () => {
  const h = noSecret(); const pending = await prepare(h);
  h.store.sql.exec('UPDATE oauth_states SET data=? WHERE id=?', JSON.stringify({ flow: 'other', nonce: pending.nonce, client_id: CLIENT }), 'gis:' + await sha256(pending.state));
  assert.equal((await complete(h, pending)).status, 403); h.close();
});
test('JSON-only endpoint rejects form submissions and oversized credentials', async () => {
  const h = noSecret(); const pending = await prepare(h);
  assert.equal((await post(h, '/auth/google/credential', {}, pending.cookie, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post(h, '/auth/google/credential', { state: pending.state, credential: 'x'.repeat(18000) }, pending.cookie)).status, 413); h.close();
});
test('concurrent credential submissions produce only one owner session', async () => {
  const h = noSecret(); const pending = await prepare(h); const statuses = await Promise.all([complete(h, pending), complete(h, pending)]);
  assert.deepEqual(statuses.map(r => r.status).sort(), [200, 403]); h.close();
});
test('preparation is rate limited rather than issuing unlimited browser state', async () => {
  const h = noSecret(); let r; for (let i = 0; i < 31; i++) r = await post(h, '/auth/google/prepare', {});
  assert.equal(r.status, 429); h.close();
});
test('only the login document allows the Google SDK and popup bridge', async () => {
  const h = noSecret(); const login = await h.request('/login'); const csp = login.headers.get('Content-Security-Policy');
  assert.match(csp, /script-src 'self' https:\/\/accounts.google.com\/gsi\/client/);
  assert.match(csp, /frame-src https:\/\/accounts.google.com\/gsi\//);
  assert.ok(!csp.includes('unsafe-inline')); assert.ok(!csp.includes('*'));
  assert.equal(login.headers.get('Cross-Origin-Opener-Policy'), 'same-origin-allow-popups');
  assert.equal(login.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  const privacy = await h.request('/privacy'); assert.ok(!privacy.headers.get('Content-Security-Policy').includes('accounts.google.com')); h.close();
});
