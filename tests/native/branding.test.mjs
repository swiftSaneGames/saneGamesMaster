import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness } from './harness.mjs';

const mascotPath = '/assets/studio-mascot.png';
const mascot = fs.readFileSync(new URL('../../cloudflare/public' + mascotPath, import.meta.url));
const icon = /<link\b(?=[^>]*\brel="icon")(?=[^>]*\btype="image\/png")(?=[^>]*\bhref="\/assets\/studio-mascot\.png")(?=[^>]*\bsizes="60x60")[^>]*>/;

test('signed-out favicon returns the exact supplied PNG with image MIME and security headers', async t => {
  const h = harness(); t.after(() => h.close());
  const response = await h.request(mascotPath);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mascot);
  assert.deepEqual(mascot.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(mascot.readUInt32BE(16), 60);
  assert.equal(mascot.readUInt32BE(20), 60);
});

test('both public entry pages link the locally served favicon without broadening their image policy', async t => {
  const h = harness(); t.after(() => h.close());
  for (const route of ['/login', '/privacy']) {
    const response = await h.request(route);
    assert.equal(response.status, 200);
    assert.match(await response.text(), icon);
    assert.match(response.headers.get('Content-Security-Policy'), /img-src 'self' data:;/);
  }
});

test('the authenticated workspace links the favicon and keeps its private-page CSP', async t => {
  const h = harness(); t.after(() => h.close());
  const login = await h.login();
  const response = await h.as(login, '/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), icon);
  assert.doesNotMatch(response.headers.get('Content-Security-Policy'), /accounts\.google\.com/);
});

test('public branding does not expose private pages, APIs, or arbitrary asset paths', async t => {
  const h = harness(); t.after(() => h.close());
  assert.equal((await h.request('/')).status, 303);
  for (const route of ['/index.html', '/api/state', '/api/catalog', '/api/docs/prom', '/assets/unlisted.png', '/assets/../index.html']) {
    assert.equal((await h.request(route)).status, 401, route);
  }
  assert.equal((await h.request(mascotPath, { method: 'POST' })).status, 401);
});
