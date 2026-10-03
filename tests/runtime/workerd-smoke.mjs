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
const { Miniflare, convertV4MiniflareOptions } = tools('miniflare');
const { build } = tools('esbuild');
const config = JSON.parse(await fs.readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
const origin = 'https://runtime-test.example';
const client = 'runtime-tests.apps.googleusercontent.com';
const emails = ['owner-one@example.test', 'owner-two@example.test'];
const workerTokens = Object.fromEntries(['runtime-one', 'runtime-two'].map(id => [id, 'disposable-' + webcrypto.randomUUID() + webcrypto.randomUUID()]));
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
  runtime = new Miniflare(convertV4MiniflareOptions({
    name: 'sanegames-runtime-test', modules: true, script: compiled.outputFiles[0].text,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags || [],
    bindings: { APP_ORIGIN: origin, ALLOWED_EMAILS: emails.join(','), GOOGLE_CLIENT_ID: client, WORKER_TOKENS_JSON: JSON.stringify(workerTokens) },
    durableObjects: { STUDIO: { className: 'StudioStore', useSQLite: true } },
    resourcePersistencePath: path.join(temp, 'storage'), outboundService: provider, cf: false,
    serviceBindings: { ASSETS: async request => {
      const filename = path.resolve(root, 'cloudflare/public', '.' + new URL(request.url).pathname);
      const assets = path.join(root, 'cloudflare/public') + path.sep;
      if (!filename.startsWith(assets)) return new Response('Not found', { status: 404 });
      try { return new Response(await fs.readFile(filename), { headers: { 'Content-Type': filename.endsWith('.html') ? 'text/html' : 'text/plain' } }); }
      catch { return new Response('Not found', { status: 404 }); }
    } }
  }));
  await runtime.ready;
}
const dispatch = (route, init = {}) => runtime.dispatchFetch(origin + route, { redirect: 'manual', ...init });
const post = (route, body, cookie = '', csrf = '') => dispatch(route, { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'X-SG-Login': '1', 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf }, body: JSON.stringify(body) });
const workerPost = (route, body = {}, worker = 'runtime-one', token = workerTokens[worker]) => dispatch(route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
const leaseIdentity = claim => ({ job_id: claim.job.id, lease_token: claim.lease.token, fence: claim.lease.fence });
const reportedResult = () => ({ outcome: 'pass', summary: 'Synthetic queue protocol result in disposable workerd. No game, device, or human testing occurred.', source_commit: 'a'.repeat(40), artifacts: [{ path: 'docs/qa/disposable-runtime-fixture.md', description: 'Synthetic relative artifact reference; not a real game report.' }], checks: [{ name: 'synthetic protocol fixture', status: 'pass', details: 'Verifies result storage only; no gameplay quality claim.' }] });
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
  const created = await expectJSON(await post('/api/projects', { title: 'Runtime persistence check', category: 'Business simulation', summary: 'Disposable automated test project.', repository_url: 'https://github.com/swiftSaneGames/disposable-runtime-fixture' }, cookie, state.user.csrf), 200, 'create project');
  assert.equal(created.project.repository_url, 'https://github.com/swiftSaneGames/disposable-runtime-fixture');
  await expectJSON(await workerPost('/api/worker/heartbeat', {}, 'runtime-one', ''), 401, 'deny missing worker credential');
  await expectJSON(await workerPost('/api/worker/heartbeat', {}, 'runtime-one', 'incorrect-fixture-credential'), 401, 'deny incorrect worker credential');
  await expectJSON(await workerPost('/api/jobs', {}), 401, 'worker credential does not authorize owner job creation');
  await expectJSON(await workerPost('/api/releases/r-123/decision', {}), 401, 'worker credential does not authorize release decisions');
  await expectJSON(await workerPost('/api/worker/claim'), 409, 'claim requires a registered heartbeat');
  for (const id of Object.keys(workerTokens)) {
    const heartbeat = await expectJSON(await workerPost('/api/worker/heartbeat', { worker_id: 'forged-worker-id', name: 'Disposable ' + id, capabilities: ['studio-developer'] }, id), 200, 'register worker heartbeat');
    assert.equal(heartbeat.worker.id, id, 'worker identity must derive from its credential');
    assert.equal(heartbeat.worker.online, true);
    assert.ok(Date.parse(heartbeat.worker.last_seen_at));
  }
  const assignment = { project_id: created.project.id, role: 'studio-developer', title: 'Disposable runtime queue check', instructions: 'Synthetic queue lifecycle only. Do not access a real repository or execute game development.', idempotency_key: 'runtime-smoke:first', max_attempts: 2 };
  const first = await expectJSON(await post('/api/jobs', assignment, cookie, state.user.csrf), 200, 'enqueue bounded assignment');
  const duplicate = await expectJSON(await post('/api/jobs', assignment, cookie, state.user.csrf), 200, 'repeat idempotent enqueue');
  assert.equal(duplicate.job.id, first.job.id);
  assert.equal(duplicate.idempotent, true);
  const next = await expectJSON(await post('/api/jobs', { ...assignment, title: 'Dependent disposable runtime check', idempotency_key: 'runtime-smoke:second', dependencies: [first.job.id] }, cookie, state.user.csrf), 200, 'enqueue dependent assignment');
  const claimed = await expectJSON(await workerPost('/api/worker/claim'), 200, 'claim first assignment');
  assert.equal(claimed.job.id, first.job.id);
  assert.equal(claimed.job.status, 'running');
  assert.equal(claimed.job.attempts, 1);
  assert.ok(Number.isSafeInteger(claimed.lease.fence) && claimed.lease.fence > 0);
  assert.ok(claimed.lease.token.length > 40);
  const parallel = await expectJSON(await workerPost('/api/worker/claim', {}, 'runtime-two'), 200, 'repository lease and dependency prevent parallel claim');
  assert.equal(parallel.job, null);
  const renewed = await expectJSON(await workerPost('/api/worker/renew', leaseIdentity(claimed)), 200, 'renew active lease');
  assert.equal(renewed.lease.token, claimed.lease.token);
  assert.equal(renewed.lease.fence, claimed.lease.fence);
  assert.ok(Date.parse(renewed.lease.expires_at) >= Date.parse(claimed.lease.expires_at));
  await expectJSON(await workerPost('/api/worker/renew', leaseIdentity(claimed), 'runtime-two'), 409, 'reject lease used by another worker');
  console.log('PASS: worker auth boundary, heartbeat, idempotent enqueue, dependency-aware claim, repository exclusion and renewal');
  await runtime.dispose(); runtime = null;
  await start();
  const reopened = await expectJSON(await dispatch('/api/state', { headers: { Cookie: cookie } }), 200, 'session and data after restart');
  assert.equal(reopened.projects.length, 1);
  assert.equal(reopened.projects[0].title, 'Runtime persistence check');
  assert.equal(reopened.jobs.length, 2);
  assert.equal(reopened.jobs.find(j => j.id === first.job.id).status, 'running');
  assert.equal(reopened.jobs.find(j => j.id === first.job.id).fence, claimed.lease.fence);
  assert.deepEqual(reopened.workers.map(w => w.id).sort(), Object.keys(workerTokens).sort());
  for (const forbidden of [...Object.values(workerTokens), claimed.lease.token, 'input_fingerprint']) assert.ok(!JSON.stringify(reopened).includes(forbidden), 'owner state exposed worker authentication or lease secrets');
  const afterRestart = await expectJSON(await workerPost('/api/worker/renew', leaseIdentity(claimed)), 200, 'persisted lease remains renewable after restart');
  assert.equal(afterRestart.lease.fence, claimed.lease.fence);
  await expectJSON(await post('/api/jobs/' + first.job.id + '/cancel', {}, cookie, reopened.user.csrf), 200, 'cancel running fixture to invalidate its lease');
  await expectJSON(await workerPost('/api/worker/complete', { ...leaseIdentity(claimed), result: reportedResult() }), 409, 'cancelled pre-restart claim cannot complete');
  await expectJSON(await post('/api/jobs/' + first.job.id + '/retry', {}, cookie, reopened.user.csrf), 200, 'retry cancelled fixture');
  const replacement = await expectJSON(await workerPost('/api/worker/claim', {}, 'runtime-two'), 200, 'new worker reclaims cancelled fixture');
  assert.equal(replacement.job.id, first.job.id);
  assert.ok(replacement.lease.fence > claimed.lease.fence, 'repository fencing counter must survive restart');
  assert.notEqual(replacement.lease.token, claimed.lease.token);
  await expectJSON(await workerPost('/api/worker/renew', leaseIdentity(claimed)), 409, 'old worker cannot renew after higher fence');
  await expectJSON(await workerPost('/api/worker/complete', { ...leaseIdentity(replacement), fence: claimed.lease.fence, result: reportedResult() }, 'runtime-two'), 409, 'current worker cannot complete using an old fence');
  const completed = await expectJSON(await workerPost('/api/worker/complete', { ...leaseIdentity(replacement), result: reportedResult() }, 'runtime-two'), 200, 'complete current fenced assignment');
  assert.equal(completed.job.status, 'succeeded');
  assert.equal(completed.job.result.outcome, 'pass');
  assert.equal(completed.job.result.evidence_status, 'worker_reported_not_independently_verified');
  assert.equal(completed.job.result.release_approved, false);
  assert.equal(completed.quality_approved, false);
  assert.equal(completed.published, false);
  await expectJSON(await workerPost('/api/worker/complete', { ...leaseIdentity(replacement), result: reportedResult() }, 'runtime-two'), 409, 'completion cannot replay');
  const dependent = await expectJSON(await workerPost('/api/worker/claim'), 200, 'completed prerequisite unlocks dependent assignment');
  assert.equal(dependent.job.id, next.job.id);
  assert.ok(dependent.lease.fence > replacement.lease.fence);
  assert.equal(dependent.job.dependency_results[0].id, first.job.id);
  assert.equal(dependent.job.dependency_results[0].result.source_commit, 'a'.repeat(40));
  await expectJSON(await workerPost('/api/worker/complete', { ...leaseIdentity(dependent), result: reportedResult() }), 200, 'complete dependent assignment');
  const idle = await expectJSON(await workerPost('/api/worker/claim'), 200, 'empty queue returns no work');
  assert.equal(idle.job, null);
  const final = await expectJSON(await dispatch('/api/state', { headers: { Cookie: cookie } }), 200, 'inspect durable results');
  assert.ok(final.jobs.every(j => j.status === 'succeeded'));
  assert.equal(final.releases.length, 0);
  assert.ok(final.projects.every(p => p.stage !== 'live'));
  assert.ok(final.events.some(e => e.event === 'job_completed'));
  console.log('PASS: sessions/projects/workers/jobs/leases survive restart; stale and cross-worker fences rejected; structured results unlock dependencies without release approval');
  console.log('All workerd login, durable queue and restart checks passed. Google responses and job results were synthetic; no live worker, game test, production login or publication is claimed.');
} finally {
  if (runtime) await runtime.dispose();
  await fs.rm(temp, { recursive: true, force: true });
}
