import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { harness, ORIGIN, FIRST, SECOND } from './harness.mjs';
import { createHandler } from '../../cloudflare/native/worker.mjs';
import { fetchGitHubRepositories, githubCredential } from '../../cloudflare/native/github.mjs';

const TOKEN = 'github_pat_fixture_' + 'q'.repeat(60);
const SECOND_TOKEN = 'github_pat_rotated_' + 'z'.repeat(60);
function repo(id = 1, changes = {}) {
  return { id, name: 'cozy-game-' + id, full_name: 'swiftSaneGames/cozy-game-' + id, owner: { login: 'swiftSaneGames' }, private: true, archived: false, disabled: false, default_branch: 'main', pushed_at: '2026-10-04T00:00:00Z', updated_at: '2026-10-04T01:00:00Z', html_url: 'https://evil.example/ignore-me', description: 'Untrusted ignored text', ...changes };
}
async function fixture(t, overrides = {}, file = ':memory:') {
  const h = harness({ GITHUB_TOKEN: TOKEN, WORKER_TOKENS_JSON: JSON.stringify({ 'test-worker': 'w'.repeat(48) }), ...overrides }, file);
  t.after(() => h.close()); const owner = await h.login(); const calls = [];
  let remote = async url => url.endsWith('/user') ? Response.json({ id: 9, login: 'studio-operator' }) : Response.json([repo()]);
  const worker = createHandler(async (url, init) => { calls.push({ url, init }); return remote(url, init); });
  const sync = (body = {}, extra = {}, login = owner) => worker.fetch(new Request(ORIGIN + '/api/github/sync', { method: 'POST', headers: { Cookie: login.cookie, Origin: ORIGIN, 'Content-Type': 'application/json', 'X-CSRF-Token': login.csrf, ...extra }, body: JSON.stringify(body) }), h.env);
  return { h, owner, calls, sync, setRemote: value => { remote = value; }, state: async () => (await h.as(owner, '/api/state')).json() };
}
async function body(response, status = 200) { const value = await response.json(); assert.equal(response.status, status, JSON.stringify(value)); return value; }

test('absent or malformed GitHub configuration never appears connected or makes remote requests', async t => {
  for (const token of [undefined, '', 'short', TOKEN + '\n']) {
    const f = await fixture(t, { GITHUB_TOKEN: token });
    const state = await f.state(); assert.equal(state.github.configured, false); assert.equal(state.github.status, 'not_configured'); assert.equal(state.integrations.github_sync, false);
    await body(await f.sync(), 503); assert.equal(f.calls.length, 0);
  }
});
test('a configured but unverified credential remains unverified; state reads never fetch GitHub', async t => {
  const f = await fixture(t); const state = await f.state();
  assert.equal(state.github.configured, true); assert.equal(state.github.status, 'unverified'); assert.equal(state.integrations.github_sync, false);
  assert.deepEqual(state.github.repositories, []); assert.equal(state.github.last_synced_at, null); assert.equal(state.github.read_only, true); assert.equal(f.calls.length, 0);
});
test('authenticated sync uses fixed read-only API requests and persists only canonical metadata', async t => {
  const f = await fixture(t); const before = await f.state();
  f.setRemote(async url => url.endsWith('/user') ? Response.json({ id: 9, login: 'studio-operator', token: TOKEN }) : Response.json([
    repo(1, { owner: { login: 'SWIFTSANEGAMES' }, full_name: 'SWIFTSANEGAMES/cozy-game-1', description: TOKEN, clone_url: 'https://credential@evil.example' }),
    repo(2, { owner: { login: 'other-org' }, full_name: 'other-org/cozy-game-2' }),
    repo(3, { name: '.github', full_name: 'swiftSaneGames/.github', private: false })
  ]));
  const synced = await body(await f.sync()); assert.equal(synced.github.status, 'connected'); assert.equal(synced.github.repositories.length, 2);
  const first = synced.github.repositories.find(r => r.id === 1);
  assert.deepEqual(Object.keys(first), ['id', 'full_name', 'name', 'url', 'private', 'archived', 'disabled', 'default_branch', 'pushed_at', 'updated_at']);
  assert.equal(first.url, 'https://github.com/swiftSaneGames/cozy-game-1'); assert.equal(first.full_name, 'swiftSaneGames/cozy-game-1');
  assert.equal(f.calls[0].url, 'https://api.github.com/user'); assert.equal(f.calls[1].url, 'https://api.github.com/orgs/swiftSaneGames/repos?type=all&sort=full_name&direction=asc&per_page=100&page=1');
  for (const { init } of f.calls) { assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual'); assert.equal(init.headers.Authorization, 'Bearer ' + TOKEN); assert.equal(init.headers['X-GitHub-Api-Version'], '2026-03-10'); assert.ok(init.signal instanceof AbortSignal); }
  const after = await f.state(); assert.equal(after.integrations.github_sync, true); for (const key of ['projects', 'jobs', 'releases']) assert.deepEqual(after[key], before[key]);
  const internal = JSON.stringify(f.h.store.github.read()); assert.ok(!internal.includes(TOKEN));
  for (const endpoint of ['/api/state', '/api/export']) {
    const text = await (await f.h.as(f.owner, endpoint)).text(); for (const forbidden of [TOKEN, 'credential_hash', 'attempt_hash', 'generation', 'active_until', 'evil.example']) assert.ok(!text.includes(forbidden), forbidden);
  }
});
test('GitHub sync requires owner session, same origin and CSRF before any provider request', async t => {
  const f = await fixture(t);
  for (const headers of [{ Cookie: '' }, { 'X-CSRF-Token': '' }, { Origin: 'https://evil.example' }, { Cookie: '', Authorization: 'Bearer ' + TOKEN }, { Cookie: '', Authorization: 'Bearer ' + f.h.env.INTAKE_TOKEN }, { Cookie: '', Authorization: 'Bearer ' + 'w'.repeat(48) }]) {
    const response = await f.sync({}, headers); assert.ok([401, 403].includes(response.status));
  }
  f.h.env.ALLOWED_EMAILS = SECOND; await body(await f.sync(), 403); assert.equal(f.calls.length, 0);
});
test('sync body cannot supply credentials, organization, URLs or arbitrary options', async t => {
  const f = await fixture(t);
  for (const payload of [{ token: TOKEN }, { organization: 'elsewhere' }, { url: 'https://evil.example' }, { repositories: [repo()] }]) await body(await f.sync(payload), 422);
  assert.equal(f.calls.length, 0);
});
test('owner sync attempts are limited to two per minute', async t => {
  const f = await fixture(t); await body(await f.sync()); await body(await f.sync()); await body(await f.sync(), 429); assert.equal(f.calls.length, 4);
});
for (const [status, headers, expected] of [
  [401, {}, 'github_auth_failed'], [403, {}, 'github_auth_failed'], [404, {}, 'github_auth_failed'],
  [403, { 'x-ratelimit-remaining': '0' }, 'github_provider_rate_limited'], [429, {}, 'github_provider_rate_limited'],
  [302, { Location: 'https://evil.example/steal' }, 'github_redirect'], [500, {}, 'github_provider_unavailable']
]) test('provider HTTP ' + status + ' stays sanitized and preserves prior success: ' + expected, async t => {
  const f = await fixture(t); const original = (await body(await f.sync())).github;
  f.setRemote(async () => Response.json({ message: TOKEN, trace: 'secret-provider-diagnostic' }, { status, headers }));
  const response = await body(await f.sync(), 502); assert.equal(response.code, expected); assert.ok(!JSON.stringify(response).includes(TOKEN));
  const state = await f.state(); assert.equal(state.github.status, 'error'); assert.equal(state.github.error_code, expected); assert.equal(state.integrations.github_sync, false);
  assert.equal(state.github.last_synced_at, original.last_synced_at); assert.deepEqual(state.github.repositories, original.repositories);
  assert.equal(f.calls.length, 3); assert.ok(!JSON.stringify(state).includes('secret-provider-diagnostic'));
});
test('identity verification precedes organization listing; anonymous-shaped success is not authentication', async t => {
  const f = await fixture(t); f.setRemote(async () => Response.json({ message: 'Public endpoint success' }));
  assert.equal((await body(await f.sync(), 502)).code, 'github_auth_failed'); assert.equal(f.calls.length, 1); assert.equal((await f.state()).integrations.github_sync, false);
});
test('pagination uses derived fixed URLs and does not follow provider Link targets', async t => {
  const f = await fixture(t);
  f.setRemote(async url => {
    if (url.endsWith('/user')) return Response.json({ id: 9, login: 'studio-operator' });
    const page = Number(new URL(url).searchParams.get('page'));
    return page === 1 ? Response.json(Array.from({ length: 100 }, (_, i) => repo(i + 1)), { headers: { Link: '<https://evil.example/steal>; rel="next"' } }) : Response.json([repo(101)]);
  });
  assert.equal((await body(await f.sync())).github.repositories.length, 101); assert.equal(f.calls.length, 3); assert.ok(f.calls.every(c => c.url.startsWith('https://api.github.com/')));
});
test('exactly 500 repositories requires an empty overflow probe; larger snapshots fail without partial overwrite', async t => {
  const f = await fixture(t); let overflow = false;
  f.setRemote(async url => {
    if (url.endsWith('/user')) return Response.json({ id: 9, login: 'studio-operator' });
    const page = Number(new URL(url).searchParams.get('page'));
    return Response.json(page <= 5 ? Array.from({ length: 100 }, (_, i) => repo((page - 1) * 100 + i + 1)) : overflow ? [repo(501)] : []);
  });
  const original = (await body(await f.sync())).github; assert.equal(original.repositories.length, 500); assert.equal(f.calls.length, 7);
  overflow = true; assert.equal((await body(await f.sync(), 502)).code, 'github_capacity');
  const state = await f.state(); assert.equal(state.github.status, 'error'); assert.equal(state.github.repositories.length, 500); assert.equal(state.github.last_synced_at, original.last_synced_at);
});
test('invalid provider schemas, identities, booleans, names, dates and duplicate records fail closed', async t => {
  const patches = [{ name: '../outside' }, { full_name: 'other/cozy-game-1' }, { id: '1' }, { private: 'true' }, { disabled: 'false' }, { default_branch: '<script>' }, { updated_at: 'not-a-date' }, { default_branch: TOKEN }];
  for (const patch of patches) {
    const f = await fixture(t); f.setRemote(async url => url.endsWith('/user') ? Response.json({ id: 9, login: 'studio-operator' }) : Response.json([repo(1, patch)]));
    assert.equal((await body(await f.sync(), 502)).code, 'github_invalid_response'); assert.deepEqual((await f.state()).github.repositories, []);
  }
  const f = await fixture(t); f.setRemote(async url => url.endsWith('/user') ? Response.json({ id: 9, login: 'studio-operator' }) : Response.json([repo(1), repo(1)]));
  await body(await f.sync(), 502);
});
test('response byte bounds, malformed JSON and transport failures never persist provider content', async t => {
  for (const response of [() => new Response('{unfinished'), () => new Response('x'.repeat(65537)), () => new Response('{}', { headers: { 'Content-Length': '99999999' } }), () => { throw new Error(TOKEN); }]) {
    const f = await fixture(t); f.setRemote(async () => response()); const error = await body(await f.sync(), 502);
    assert.ok(!JSON.stringify(error).includes(TOKEN)); assert.equal((await f.state()).github.status, 'error');
  }
});
test('provider timeout aborts the request and returns a fixed diagnostic', async () => {
  let signal;
  await assert.rejects(fetchGitHubRepositories(TOKEN, async (url, init) => {
    signal = init.signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error(TOKEN)), { once: true }));
  }, 5), error => error.code === 'github_timeout' && error.status === 504 && !error.message.includes(TOKEN));
  assert.equal(signal.aborted, true);
});
test('credential rotation and removal immediately hide old repository visibility', async t => {
  const f = await fixture(t); await body(await f.sync()); f.h.env.GITHUB_TOKEN = SECOND_TOKEN;
  let state = await f.state(); assert.equal(state.github.status, 'unverified'); assert.equal(state.github.last_synced_at, null); assert.deepEqual(state.github.repositories, []); assert.equal(state.integrations.github_sync, false);
  await body(await f.sync()); state = await f.state(); assert.equal(state.github.status, 'connected'); assert.equal(f.calls.at(-1).init.headers.Authorization, 'Bearer ' + SECOND_TOKEN);
  delete f.h.env.GITHUB_TOKEN; state = await f.state(); assert.equal(state.github.status, 'not_configured'); assert.deepEqual(state.github.repositories, []); assert.equal(state.github.last_attempt_at, null);
  const exported = await (await f.h.as(f.owner, '/api/export')).text(); assert.ok(!exported.includes('credential_hash')); assert.ok(!exported.includes(SECOND_TOKEN));
});
test('freshness expires at fifteen minutes without remote requests', async t => {
  const f = await fixture(t); await body(await f.sync()); const current = Date.now(); t.mock.method(Date, 'now', () => current + 900001);
  const state = await f.state(); assert.equal(state.github.status, 'stale'); assert.equal(state.integrations.github_sync, false); assert.equal(state.github.repositories.length, 1); assert.equal(f.calls.length, 2);
});
test('in-flight sync generation rejects overlap and late writes after a replacement sync', async t => {
  const f = await fixture(t); let unblock, entered; const reached = new Promise(resolve => { entered = resolve; });
  f.setRemote(async url => { if (url.endsWith('/user')) return Response.json({ id: 9, login: 'studio-operator' }); entered(); return new Promise(resolve => { unblock = resolve; }); });
  const old = f.sync(); await reached;
  assert.equal((await f.state()).github.status, 'syncing'); await body(await f.sync(), 409);
  const now = Date.now(); t.mock.method(Date, 'now', () => now + 76000);
  assert.equal((await f.state()).github.error_code, 'github_interrupted');
  f.setRemote(async url => url.endsWith('/user') ? Response.json({ id: 9, login: 'studio-operator' }) : Response.json([repo(2)]));
  await body(await f.sync()); unblock(Response.json([repo(1)])); await body(await old, 409);
  assert.deepEqual((await f.state()).github.repositories.map(r => r.id), [2]);
});
test('rotation during a provider request prevents stale credential data from committing', async t => {
  const f = await fixture(t);
  f.setRemote(async url => { if (url.endsWith('/user')) return Response.json({ id: 9, login: 'studio-operator' }); f.h.env.GITHUB_TOKEN = SECOND_TOKEN; return Response.json([repo()]); });
  await body(await f.sync(), 409); assert.equal((await f.state()).github.status, 'unverified'); assert.deepEqual((await f.state()).github.repositories, []);
});
test('successful metadata survives Durable Object reconstruction without exporting token fingerprints', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-github-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'studio.db'); const f = await fixture(t, {}, file); await body(await f.sync());
  const again = harness({ GITHUB_TOKEN: TOKEN }, file); t.after(() => again.close());
  const state = await body(await again.as(f.owner, '/api/state')); assert.equal(state.github.status, 'connected'); assert.equal(state.github.repositories.length, 1);
  const fingerprint = (await githubCredential(again.env)).hash; assert.ok(!JSON.stringify(state).includes(fingerprint));
});
