import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker, { handleRequest } from './worker.mjs';

const PUBLIC = 'https://prod.sanegames.swiftsane.com';
const TOKEN = 'unit-test-not-a-real-secret-' + 'x'.repeat(48);
const ENV = { BACKEND_ORIGIN: 'https://studio-origin.swiftsane.com', GATEWAY_TOKEN: TOKEN };
const request = (path = '/', init = {}) => new Request(PUBLIC + path, init);
const production = (body = 'ok', init = {}) => new Response(body, {
  ...init, headers: { 'X-Studio-Origin-Mode': 'production', ...(init.headers || {}) },
});
const never = () => { throw new Error('upstream must not be called'); };

// No third-party test dependencies or real accounts are used by this suite.
test('Wrangler deploys the native application while this gateway stays historical', () => {
  const cfg = JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url)));
  assert.equal(cfg.name, 'sanegamesmasterdashboard');
  assert.equal(cfg.main, 'cloudflare/native/entry.mjs');
  assert.ok(fs.existsSync(new URL('../' + cfg.main, import.meta.url)));
  assert.equal(cfg.keep_vars, true);
  assert.equal(cfg.preview_urls, false);
  assert.equal(cfg.assets.directory, 'cloudflare/public', 'serve only the explicit frontend directory');
  assert.equal(cfg.assets.run_worker_first, true, 'native authentication must run before asset delivery');
});
test('missing configuration returns explicit 503 instead of a fake dashboard', async () => {
  const r = await handleRequest(request(), {}, never);
  assert.equal(r.status, 503);
  assert.match(await r.text(), /not the working dashboard/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('API setup error is JSON, never an HTML SPA fallback', async () => {
  const r = await handleRequest(request('/api/state'), {}, never);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'backend_not_configured');
});
test('gateway liveness explicitly does not claim backend readiness', async () => {
  const r = await handleRequest(request('/__gateway/health'), ENV, never);
  assert.deepEqual(await r.json(), { gateway: 'ok', backend_configured: true, backend: 'not_checked' });
});
test('default export ignores Cloudflare execution context as a fetch implementation', async () => {
  const r = await worker.fetch(request('/__gateway/health'), ENV, { waitUntil() {} });
  assert.equal((await r.json()).backend, 'not_checked');
});
for (const backend of [
  'http://origin.example.com', 'https://u:p@origin.example.com',
  'https://origin.example.com/path', 'https://origin.example.com?x=1',
  'https://origin.example.com/#fragment', 'https://origin.example.com:444',
  PUBLIC, 'https://127.0.0.1', 'https://localhost', 'not a URL',
]) {
  test(`rejects invalid backend origin ${backend}`, async () => {
    const r = await handleRequest(request(), { ...ENV, BACKEND_ORIGIN: backend }, never);
    assert.equal(r.status, 503);
  });
}
test('missing, short and invalid gateway credentials fail closed', async () => {
  for (const token of [undefined, '', 'short', 'a'.repeat(201), 'a'.repeat(45) + ' space']) {
    assert.equal((await handleRequest(request(), { ...ENV, GATEWAY_TOKEN: token }, never)).status, 503);
  }
});
test('Worker preview hostname cannot forward credentials to the backend', async () => {
  const r = await handleRequest(new Request('https://example.workers.dev/api/state'), ENV, never);
  assert.equal(r.status, 421);
});
test('HTTP cannot reach production through the gateway', async () => {
  const r = await handleRequest(new Request(PUBLIC.replace('https:', 'http:') + '/'), ENV, never);
  assert.equal(r.status, 421);
});
test('unsupported methods return a proper allow header', async () => {
  const r = await handleRequest(request('/api/state', { method: 'DELETE' }), ENV, never);
  assert.equal(r.status, 405);
  assert.equal(r.headers.get('allow'), 'GET, HEAD, POST');
});
test('path and query cannot choose a different origin', async () => {
  let captured;
  const r = await handleRequest(request('//attacker.example/path?backend=https://evil.example'), ENV, async r => {
    captured = new URL(r.url); return production();
  });
  assert.equal(r.status, 200);
  assert.equal(captured.origin, ENV.BACKEND_ORIGIN);
  assert.equal(captured.pathname, '//attacker.example/path');
});
test('proxy preserves cookies, CSRF, JSON, intake auth and uses the server-side gateway secret', async () => {
  const payload = JSON.stringify({ action: 'request_changes' });
  const r = await handleRequest(request('/api/releases/rc-test/decision', {
    method: 'POST', body: payload, headers: {
      'Content-Type': 'application/json', 'Cookie': '__Host-studio-session=test-fixture',
      'X-CSRF-Token': 'csrf-fixture', 'Origin': PUBLIC,
      'Authorization': 'Bearer intake-fixture', 'X-Studio-Gateway-Token': 'attacker-supplied',
      'X-Forwarded-For': 'spoofed', 'X-Forwarded-Proto': 'http',
    },
  }), ENV, async r => {
    assert.equal(r.url, ENV.BACKEND_ORIGIN + '/api/releases/rc-test/decision');
    assert.equal(r.redirect, 'manual');
    assert.equal(r.cache, 'no-store');
    assert.equal(r.headers.get('x-studio-gateway-token'), TOKEN);
    assert.equal(r.headers.get('cookie'), '__Host-studio-session=test-fixture');
    assert.equal(r.headers.get('x-csrf-token'), 'csrf-fixture');
    assert.equal(r.headers.get('origin'), PUBLIC);
    assert.equal(r.headers.get('authorization'), 'Bearer intake-fixture');
    assert.equal(r.headers.get('x-forwarded-for'), null);
    assert.equal(r.headers.get('x-forwarded-proto'), 'https');
    assert.equal(await r.text(), payload);
    return production('{}', { headers: { 'Content-Type': 'application/json' } });
  });
  assert.equal(r.status, 200);
});
test('OAuth redirect and multiple cookies survive without an upstream follow', async () => {
  let calls = 0;
  const r = await handleRequest(request('/auth/github'), ENV, async r => {
    calls++;
    assert.equal(r.redirect, 'manual');
    const headers = new Headers({
      'X-Studio-Origin-Mode': 'production',
      Location: 'https://github.com/login/oauth/authorize?state=fixture',
    });
    headers.append('Set-Cookie', '__Host-studio-oauth=fixture; Secure; HttpOnly; Path=/');
    headers.append('Set-Cookie', '__Host-studio-session=fixture; Secure; HttpOnly; Path=/');
    return new Response(null, { status: 303, headers });
  });
  assert.equal(calls, 1);
  assert.equal(r.status, 303);
  assert.equal(r.headers.getSetCookie().length, 2);
  assert.match(r.headers.get('location'), /^https:\/\/github.com\//);
});
test('origin-relative login redirects stay on the canonical public domain', async () => {
  const r = await handleRequest(request(), ENV, async () => production(null, { status: 303, headers: { Location: '/login' } }));
  assert.equal(r.headers.get('location'), PUBLIC + '/login');
});
test('a stale backend or a demo never returns its body to the browser', async () => {
  const r = await handleRequest(request('/api/state'), ENV, async () => new Response('PRIVATE DEMO DATA'));
  assert.equal(r.status, 502);
  assert.doesNotMatch(await r.text(), /PRIVATE DEMO/);
});
test('upstream network errors disclose no exception or secret and never retry', async () => {
  let calls = 0;
  const r = await handleRequest(request('/api/projects', { method: 'POST', body: '{}' }), ENV, async () => {
    calls++; throw new Error(TOKEN);
  });
  assert.equal(calls, 1);
  assert.equal(r.status, 502);
  assert.doesNotMatch(await r.text(), new RegExp(TOKEN));
});
test('response strips gateway headers and blocks caches', async () => {
  const r = await handleRequest(request('/api/state'), ENV, async () => production('{}', { headers: {
    'X-Studio-Gateway-Token': TOKEN, 'Cache-Control': 'public, max-age=3600',
  } }));
  assert.equal(r.headers.get('x-studio-gateway-token'), null);
  assert.equal(r.headers.get('x-studio-origin-mode'), null);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('cloudflare-cdn-cache-control'), 'no-store');
});
test('64 KiB payload is accepted but larger payload is rejected before fetch', async () => {
  assert.equal((await handleRequest(request('/api/projects', { method: 'POST', body: 'a'.repeat(65536) }), ENV, async () => production())).status, 200);
  assert.equal((await handleRequest(request('/api/projects', { method: 'POST', body: 'a'.repeat(65537) }), ENV, never)).status, 413);
});
test('a false small Content-Length does not evade body size enforcement', async () => {
  const r = await handleRequest(request('/api/projects', { method: 'POST', body: 'a'.repeat(65537), headers: { 'Content-Length': '1' } }), ENV, never);
  assert.equal(r.status, 413);
});
test('HEAD returns no body in both unconfigured and proxied modes', async () => {
  const a = await handleRequest(request('/', { method: 'HEAD' }), {}, never);
  assert.equal(await a.text(), '');
  const b = await handleRequest(request('/healthz', { method: 'HEAD' }), ENV, async () => production(null));
  assert.equal(await b.text(), '');
});
test('backend authorization failures remain authorization failures', async () => {
  const r = await handleRequest(request('/api/state'), ENV, async () => production('{"detail":"Owner sign-in required"}', { status: 401 }));
  assert.equal(r.status, 401);
});
