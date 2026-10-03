import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyGoogle, canonical, sha256, readJSON, equal, origin } from '../../cloudflare/native/security.mjs';
import { signClaims, publicJwk, FIRST, SECOND, CLIENT } from './harness.mjs';
const verify = async (claims = {}, header = {}) => verifyGoogle(await signClaims(claims, header), { keys: [publicJwk] }, CLIENT, 'expected-nonce', [FIRST, SECOND]);
test('canonical manifests produce stable hashes across object key order', async () => { assert.equal(await sha256(canonical({ b: [2, 3], a: 1 })), await sha256(canonical({ a: 1, b: [2, 3] }))); });
test('accept the Gmail owner with a signed Google identity', async () => { assert.equal((await verify()).email, FIRST); });
test('accept the university owner with a signed Google identity', async () => { assert.equal((await verify({ email: SECOND, sub: 'second-sub' })).email, SECOND); });
test('normalize allowed email case but do not broaden the allowlist', async () => { assert.equal((await verify({ email: FIRST.toUpperCase() })).email, FIRST); });
for (const [name, claims] of [
  ['unlisted Google account', { email: 'outside@example.org' }],
  ['suffix lookalike email', { email: FIRST + '.attacker.example' }],
  ['unverified email', { email_verified: false }],
  ['missing verified email claim', { email_verified: undefined }],
  ['incorrect audience', { aud: 'another-client' }],
  ['multi-audience token', { aud: [CLIENT, 'another-client'] }],
  ['incorrect authorized party', { azp: 'another-client' }],
  ['incorrect issuer', { iss: 'https://attacker.example' }],
  ['expired identity', { exp: Math.floor(Date.now() / 1000) - 1 }],
  ['future-issued identity', { iat: Math.floor(Date.now() / 1000) + 1000 }],
  ['old identity', { iat: Math.floor(Date.now() / 1000) - 1000 }],
  ['missing nonce', { nonce: undefined }],
  ['wrong nonce', { nonce: 'stolen-state' }],
  ['missing stable subject', { sub: '' }]
]) test('reject ' + name, async () => { await assert.rejects(() => verify(claims)); });
test('reject alg none', async () => { await assert.rejects(() => verify({}, { alg: 'none' })); });
test('reject unknown signing key', async () => { await assert.rejects(() => verify({}, { kid: 'attacker-key' })); });
test('reject a tampered RSA signature', async () => { const token = await signClaims(); const parts = token.split('.'); parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1); await assert.rejects(() => verifyGoogle(parts.join('.'), { keys: [publicJwk] }, CLIENT, 'expected-nonce', [FIRST])); });
test('reject oversized JWT', async () => { await assert.rejects(() => verifyGoogle('a'.repeat(20000), {}, CLIENT, '', [FIRST])); });
test('reject browser JSON arrays', async () => { await assert.rejects(() => readJSON(new Request('https://test/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[]' }))); });
test('reject oversized chunked JSON without trusting Content-Length', async () => { await assert.rejects(() => readJSON(new Request('https://test/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(66000) }) }))); });
test('reject wrong content type and malformed JSON', async () => { await assert.rejects(() => readJSON(new Request('https://test/', { method: 'POST', body: '{}' }))); await assert.rejects(() => readJSON(new Request('https://test/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))); });
test('origin validation rejects plain HTTP and embedded credentials', () => { assert.throws(() => origin({ APP_ORIGIN: 'http://app.example' })); assert.throws(() => origin({ APP_ORIGIN: 'https://user:pw@app.example/' })); });
test('string equality does not coerce types or accept prefixes', () => { assert.equal(equal('one', 'one'), true); assert.equal(equal('one', 'one-more'), false); assert.equal(equal(null, ''), false); });
