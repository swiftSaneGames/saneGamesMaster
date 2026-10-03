/** Catch browser/Node fetch options that Cloudflare's runtime does not implement. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, signClaims, publicJwk, FIRST, SECOND, ORIGIN } from './harness.mjs';
import { createHandler } from '../../cloudflare/native/worker.mjs';

function client(h, provider) {
  const worker = createHandler(async (url, init) => {
    assert.equal(init.redirect, 'manual', 'Every Google request must use the edge-supported no-follow mode');
    return provider(url, init);
  });
  const request = (route, init = {}) => worker.fetch(new Request(ORIGIN + route, init), h.env);
  const post = (route, body, cookie = '') => request(route, { method: 'POST', headers: {
    Origin: ORIGIN, 'Content-Type': 'application/json', 'X-SG-Login': '1', Cookie: cookie
  }, body: JSON.stringify(body) });
  return { request, post };
}
async function prepare(c) {
  const r = await c.post('/auth/google/prepare', {});
  assert.equal(r.status, 200);
  return { ...await r.json(), cookie: r.headers.getSetCookie()[0].split(';')[0] };
}

for (const email of [FIRST, SECOND]) test('edge-supported identity-token fetch completes for ' + email, async () => {
  const h = harness({ GOOGLE_CLIENT_SECRET: '' });
  try {
    const c = client(h, async url => {
      assert.equal(url, 'https://www.googleapis.com/oauth2/v3/certs');
      return Response.json({ keys: [publicJwk] });
    });
    const p = await prepare(c);
    const r = await c.post('/auth/google/credential', { state: p.state, credential: await signClaims({ email, nonce: p.nonce }) }, p.cookie);
    assert.equal(r.status, 200, await r.text());
    const cookie = r.headers.getSetCookie().find(x => x.startsWith('__Host-sg-session=')).split(';')[0];
    assert.equal((await c.request('/api/state', { headers: { Cookie: cookie } })).status, 200);
  } finally { h.close(); }
});

for (const status of [301, 302, 303, 307, 308]) test('ID-token verification rejects a ' + status + ' key redirect without issuing a session', async () => {
  const h = harness({ GOOGLE_CLIENT_SECRET: '' }); let calls = 0;
  try {
    const c = client(h, async url => {
      assert.equal(url, 'https://www.googleapis.com/oauth2/v3/certs'); calls++;
      return new Response(null, { status, headers: { Location: 'https://untrusted.example.test/keys' } });
    });
    const p = await prepare(c);
    const r = await c.post('/auth/google/credential', { state: p.state, credential: await signClaims({ nonce: p.nonce }) }, p.cookie);
    assert.equal(r.status, 502, await r.text());
    assert.equal(calls, 1); assert.equal(r.headers.get('Set-Cookie'), null);
    assert.equal(h.store.row('SELECT count(*) AS n FROM sessions').n, 0);
  } finally { h.close(); }
});

for (const redirectAt of ['token', 'keys', 'neither']) test('authorization-code flow preserves redirect rejection: ' + redirectAt, async () => {
  const h = harness(); let nonce = ''; const calls = [];
  try {
    const c = client(h, async url => {
      calls.push(url);
      const isToken = url === 'https://oauth2.googleapis.com/token';
      assert.ok(isToken || url === 'https://www.googleapis.com/oauth2/v3/certs');
      if ((isToken && redirectAt === 'token') || (!isToken && redirectAt === 'keys')) {
        return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example.test/' } });
      }
      return isToken ? Response.json({ id_token: await signClaims({ nonce }) }) : Response.json({ keys: [publicJwk] });
    });
    const start = await c.request('/auth/google');
    assert.equal(start.status, 303);
    const url = new URL(start.headers.get('Location')); nonce = url.searchParams.get('nonce');
    const callback = await c.request('/auth/google/callback?' + new URLSearchParams({ code: 'disposable', state: url.searchParams.get('state') }), {
      headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] }
    });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get('Location'), redirectAt === 'neither' ? '/' : '/login?error=sign_in_failed');
    assert.equal(h.store.row('SELECT count(*) AS n FROM sessions').n, redirectAt === 'neither' ? 1 : 0);
    assert.equal(calls.length, redirectAt === 'token' ? 1 : 2);
  } finally { h.close(); }
});
