/** Run the production lifecycle adapter in workerd, not the node:sqlite test double.
 * All identities, signing keys, sessions and databases in this test are disposable.
 * Never deploy this harness or accept its generated keys in production.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '../..');
const tools = createRequire(path.join(root, 'node_modules/wrangler/package.json'));
const { Miniflare } = tools('miniflare');
const { build } = tools('esbuild');
const config = JSON.parse(await fs.readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
const origin = 'https://runtime-test.example';
const client = 'runtime-tests.apps.googleusercontent.com';
const emails = ['owner-one@example.test', 'owner-two@example.test'];
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-workerd-'));
const pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const publicKey = { ...await webcrypto.subtle.exportKey('jwk', pair.publicKey), kid: 'disposable-test-key', use: 'sig', alg: 'RS256' };
const b64 = value => Buffer.from(value).toString('base64url');
async function credential(nonce, email, sub) {
  const now = Math.floor(Date.now() / 1000);
  const part = b64(JSON.stringify({ alg: 'RS256', kid: publicKey.kid })) + '.' + b64(JSON.stringify({ iss: 'https://accounts.google.com', aud: client, sub, email, email_verified: true, nonce, iat: now, exp: now + 3600, name: 'Disposable test owner' }));
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(part));
  return part + '.' + b64(signature);
}
const compiled = await build({
  absWorkingDir: root, entryPoints: [config.main], bundle: true, write: false,
  format: 'esm', platform: 'neutral', target: 'es2022', external: ['cloudflare:workers'],
  plugins: [{ name: 'test-only-error-details', setup(plugin) {
    plugin.onLoad({ filter: /cloudflare\/native\/(worker|store)\.mjs$/ }, async args => {
      const source = await fs.readFile(args.path, 'utf8');
      return { contents: source.replaceAll('catch (error) {', 'catch (error) { console.error("[runtime-test]", error.name, error.message);'), loader: 'js' };
    });
  } }]
});
// Miniflare 5 replaces fetchMock with an outboundService handler.
const provider = request => {
  if (request.method === 'GET' && request.url === 'https://www.googleapis.com/oauth2/v3/certs') {
    return Response.json({ keys: [publicKey] }, { headers: { 'Cache-Control': 'max-age=60' } });
  }
  throw new Error('Unexpected outbound request in isolated runtime test');
};
let runtime;
async function start() {
  runtime = new Miniflare({
    name: 'sanegames-runtime-test', modules: true, script: compiled.outputFiles[0].text,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags || [],
    bindings: { APP_ORIGIN: origin, ALLOWED_EMAILS: emails.join(','), GOOGLE_CLIENT_ID: client },
    durableObjects: { STUDIO: { className: 'StudioStore', useSQLite: true } },
    durableObjectsPersist: path.join(temp, 'storage'), outboundService: provider, cf: false,
    serviceBindings: { ASSETS: async request => {
      const filename = path.resolve(root, 'cloudflare/public', '.' + new URL(request.url).pathname);
      const assets = path.join(root, 'cloudflare/public') + path.sep;
      if (!filename.startsWith(assets)) return new Response('Not found', { status: 404 });
      try { return new Response(await fs.readFile(filename), { headers: { 'Content-Type': filename.endsWith('.html') ? 'text/html' : 'text/plain' } }); }
      catch { return new Response('Not found', { status: 404 }); }
    } }
  });
  await runtime.ready;
}
const dispatch = (route, init = {}) => runtime.dispatchFetch(origin + route, { redirect: 'manual', ...init });
const post = (route, body, cookie = '', csrf = '') => dispatch(route, { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'X-SG-Login': '1', 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf }, body: JSON.stringify(body) });
function jar(response, prefix) { return response.headers.getSetCookie().find(c => c.startsWith(prefix + '=') && !c.startsWith(prefix + '=;'))?.split(';')[0] || ''; }
async function expectJSON(response, status, label) {
  const text = await response.text();
  assert.equal(response.status, status, label + ': ' + text.slice(0, 1000));
  return JSON.parse(text);
}
async function login(email, sub, expected = 200) {
  const prepared = await post('/auth/google/prepare', {});
  const cookie = jar(prepared, '__Host-sg-google-id');
  const pending = await expectJSON(prepared, 200, 'prepare Google sign-in');
  assert.ok(cookie, 'browser-bound state cookie missing');
  const payload = { state: pending.state, credential: await credential(pending.nonce, email, sub) };
  const result = await post('/auth/google/credential', payload, cookie);
  const session = jar(result, '__Host-sg-session');
  await expectJSON(result, expected, 'verify signed credential');
  if (expected === 200) {
    assert.ok(session, 'owner session cookie missing');
    const replay = await post('/auth/google/credential', payload, cookie);
    await expectJSON(replay, 403, 'reject replayed credential');
  } else assert.equal(session, '', 'refused account received a session');
  return session;
}
try {
  await start();
  const status = await expectJSON(await dispatch('/auth/status'), 200, 'SSO status');
  assert.equal(status.ready, true);
  await expectJSON(await dispatch('/api/state'), 401, 'deny signed-out workspace');
  for (let i = 0; i < emails.length; i++) {
    const cookie = await login(emails[i], 'test-sub-' + i);
    const state = await expectJSON(await dispatch('/api/state', { headers: { Cookie: cookie } }), 200, 'open authenticated workspace');
    assert.equal(state.user.email, emails[i]);
    const home = await dispatch('/', { headers: { Cookie: cookie } });
    assert.equal(home.status, 200); await home.text();
    console.log('PASS: signed token, session, private dashboard, replay rejection; owner ' + (i + 1));
  }
  await login('outsider@example.test', 'outsider-sub', 403);
  console.log('PASS: non-allowlisted account rejected');
  const cookie = await login(emails[0], 'test-sub-0');
  const state = await expectJSON(await dispatch('/api/state', { headers: { Cookie: cookie } }), 200, 'load session');
  await expectJSON(await post('/api/projects', { title: 'Runtime persistence check', category: 'Business simulation', summary: 'Disposable automated test project.' }, cookie, state.user.csrf), 200, 'create project');
  await runtime.dispose(); runtime = null;
  await start();
  const reopened = await expectJSON(await dispatch('/api/state', { headers: { Cookie: cookie } }), 200, 'session and data after restart');
  assert.equal(reopened.projects.length, 1);
  assert.equal(reopened.projects[0].title, 'Runtime persistence check');
  console.log('PASS: project and session survive workerd restart');
  console.log('All workerd login and persistence checks passed. Google responses were mocked; no production login is claimed.');
} finally {
  if (runtime) await runtime.dispose();
  await fs.rm(temp, { recursive: true, force: true });
}
