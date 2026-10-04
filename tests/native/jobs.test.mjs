import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { harness, project, manifest } from './harness.mjs';
import { JOB_ROLES, LEASE_SECONDS, PIPELINE_GATES } from '../../cloudflare/native/jobs.mjs';

const TOKENS = { 'mac-one': 'worker-one-test-' + 'a'.repeat(45), 'mac-two': 'worker-two-test-' + 'b'.repeat(45) };
const config = { WORKER_TOKENS_JSON: JSON.stringify(TOKENS) };
const result = overrides => ({ summary: 'Synthetic successful execution for queue tests only.', artifacts: [{ path: 'candidate.json' }, { path: 'report.md' }], checks: [{ name: 'synthetic unit fixture', status: 'pass' }], outcome: 'pass', source_commit: 'a'.repeat(40), candidate_base_sha: 'b'.repeat(40), candidate_sha256: 'd'.repeat(64), ...overrides });
async function machine(h, action, body = {}, id = 'mac-one', token = TOKENS[id]) {
  return h.request('/api/worker/' + action, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
async function body(response, status = 200) { const value = await response.json(); assert.equal(response.status, status, JSON.stringify(value)); return value; }
async function game(h, owner, slug = 'queue-test') {
  let p = (await body(await h.as(owner, '/api/projects', 'POST', project))).project;
  return (await body(await h.as(owner, '/api/projects/' + p.id, 'PATCH', { ...p, repository_url: 'https://github.com/swiftSaneGames/' + slug }))).project;
}
async function setup(options = {}, dbFile) {
  const h = harness({ ...config, ...options }, dbFile), owner = await h.login(), p = await game(h, owner);
  return { h, owner, p };
}
function input(p, overrides = {}) { return { project_id: p.id, role: 'studio-developer', title: 'Implement queue test fixture', instructions: 'Create only the explicitly assigned synthetic fixture.', idempotency_key: 'test:' + crypto.randomUUID(), ...overrides }; }
async function enqueue(h, owner, p, overrides = {}) { return (await body(await h.as(owner, '/api/jobs', 'POST', input(p, overrides)))).job; }
async function heartbeat(h, id = 'mac-one', roles = JOB_ROLES) { return body(await machine(h, 'heartbeat', { name: 'Test worker', capabilities: roles }, id)); }
async function claim(h, id = 'mac-one') { return body(await machine(h, 'claim', {}, id)); }
function lease(claimed) { return { job_id: claimed.job.id, lease_token: claimed.lease.token, fence: claimed.lease.fence }; }
async function complete(h, claimed, overrides = {}, id = 'mac-one') {
  const checks = ['qa', 'release'].includes(claimed.job.pipeline_step) ? PIPELINE_GATES.map(name => ({ name, status: 'pass', details: 'Synthetic fixture only, not device evidence' })) : undefined;
  const value = result({ ...(checks ? { checks } : {}), ...overrides });
  if (claimed.job.pipeline_step === 'qa') delete value.source_commit;
  if (claimed.job.pipeline_step === 'release' && value.outcome === 'pass') {
    const prepared = await body(await machine(h, 'candidate', { ...lease(claimed), manifest: manifest(claimed.job.project_id, { source_commit: value.source_commit }) }, id));
    value.candidate_id = prepared.candidate.id;
  }
  return body(await machine(h, 'complete', { ...lease(claimed), result: value }, id));
}
async function state(h, owner) { return body(await h.as(owner, '/api/state')); }

 test('job roles exactly match the authoritative registry', () => {
  const registry = JSON.parse(fs.readFileSync(new URL('../../agents/registry.json', import.meta.url)));
  assert.deepEqual([...JOB_ROLES].sort(), registry.roles.map(r => r.id).sort());
});
test('worker credentials fail closed for absent, weak, duplicate or malformed configuration', async () => {
  for (const value of ['', 'not json', '[]', JSON.stringify({ worker: 'short' }), JSON.stringify({ a: TOKENS['mac-one'], b: TOKENS['mac-one'] })]) {
    const h = harness({ WORKER_TOKENS_JSON: value });
    assert.ok([401, 503].includes((await machine(h, 'heartbeat')).status)); h.close();
  }
});
test('worker identity derives only from bearer credential and cannot reach owner APIs', async () => {
  const { h, owner, p } = await setup();
  const observed = await body(await machine(h, 'heartbeat', { worker_id: 'mac-two', name: 'Unit machine', capabilities: ['studio-developer'] }));
  assert.equal(observed.worker.id, 'mac-one');
  assert.equal((await machine(h, 'claim', {}, 'mac-two', 'wrong')).status, 401);
  for (const [route, method, payload] of [['/api/state', 'GET'], ['/api/jobs', 'POST', input(p)], ['/api/releases/r-123/decision', 'POST', {}]]) {
    const response = await h.request(route, { method, headers: { Authorization: 'Bearer ' + TOKENS['mac-one'], 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    assert.equal(response.status, 401);
  }
  assert.equal((await h.as(owner, '/api/jobs', 'POST', input(p), { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await machine(h, 'approve')).status, 404); h.close();
});
test('job enqueue validates configured game repository, role, bounds and dependencies', async () => {
  const { h, owner, p } = await setup();
  const other = (await body(await h.as(owner, '/api/projects', 'POST', project))).project;
  assert.equal((await h.as(owner, '/api/jobs', 'POST', input(other))).status, 422);
  for (const change of [{ role: 'invented' }, { max_attempts: 0 }, { max_attempts: 6 }, { instructions: 'x'.repeat(16001) }, { idempotency_key: '' }, { dependencies: ['j-missing'] }]) assert.ok([404, 422].includes((await h.as(owner, '/api/jobs', 'POST', input(p, change))).status));
  const master = await game(h, owner, 'saneGamesMaster');
  assert.equal((await h.as(owner, '/api/jobs', 'POST', input(master))).status, 422);
  const dep = await enqueue(h, owner, p); const another = await game(h, owner, 'other-game');
  assert.equal((await h.as(owner, '/api/jobs', 'POST', input(another, { dependencies: [dep.id] }))).status, 422); h.close();
});
test('enqueue is transactionally idempotent and conflicting payload reuse is rejected', async () => {
  const { h, owner, p } = await setup(); const data = input(p);
  const responses = await Promise.all([h.as(owner, '/api/jobs', 'POST', data), h.as(owner, '/api/jobs', 'POST', data)]);
  const [a, b] = await Promise.all(responses.map(r => body(r))); assert.equal(a.job.id, b.job.id); assert.equal(a.idempotent, false); assert.equal(b.idempotent, true);
  assert.equal((await h.as(owner, '/api/jobs', 'POST', { ...data, instructions: 'Different instructions' })).status, 409);
  assert.equal((await state(h, owner)).jobs.length, 1); h.close();
});
test('claim requires heartbeat and enforces capabilities and completed prerequisites', async () => {
  const { h, owner, p } = await setup(); const first = await enqueue(h, owner, p, { role: 'studio-researcher' });
  await enqueue(h, owner, p, { dependencies: [first.id] });
  assert.equal((await machine(h, 'claim')).status, 409); await heartbeat(h, 'mac-one', ['studio-developer']); assert.equal((await claim(h)).job, null);
  await heartbeat(h, 'mac-one', JOB_ROLES); const a = await claim(h); assert.equal(a.job.id, first.id);
  await complete(h, a); const b = await claim(h); assert.equal(b.job.role, 'studio-developer'); assert.equal(b.job.dependency_results[0].status, 'succeeded'); assert.equal(b.job.dependency_results[0].fence, a.lease.fence); assert.equal(b.job.dependency_results[0].result.source_commit, 'a'.repeat(40)); h.close();
});
test('simultaneous claims serialize each repository but independent repositories can run', async () => {
  const { h, owner, p } = await setup(); await enqueue(h, owner, p); await enqueue(h, owner, p);
  await heartbeat(h); await heartbeat(h, 'mac-two');
  const claims = await Promise.all([claim(h), claim(h, 'mac-two')]); assert.equal(claims.filter(c => c.job).length, 1);
  const other = await game(h, owner, 'independent-game'); await enqueue(h, owner, other);
  const idle = claims[0].job ? 'mac-two' : 'mac-one'; const parallel = await claim(h, idle); assert.equal(parallel.job.project_id, other.id);
  assert.equal((await machine(h, 'claim', {}, idle)).status, 409); h.close();
});
test('repository leases normalize GitHub name case across duplicate project references', async () => {
  const { h, owner, p } = await setup(); const repeated = await body(await h.as(owner, '/api/projects', 'POST', { ...project, repository_url: 'https://github.com/swiftSaneGames/QUEUE-TEST.git/' }));
  assert.equal(repeated.idempotent, true); const duplicate = repeated.project; assert.equal(duplicate.id, p.id);
  await enqueue(h, owner, p); await enqueue(h, owner, duplicate); await heartbeat(h); await heartbeat(h, 'mac-two');
  assert.ok((await claim(h)).job); assert.equal((await claim(h, 'mac-two')).job, null); h.close();
});
test('expiry recovers durable work with a new fence and rejects stale or cross-worker mutation', async () => {
  const { h, owner, p } = await setup(); await enqueue(h, owner, p); await heartbeat(h); await heartbeat(h, 'mac-two');
  const first = await claim(h); assert.equal((await machine(h, 'renew', lease(first), 'mac-two')).status, 409);
  h.store.sql.exec('UPDATE repository_leases SET expires=? WHERE job_id=?', 1, first.job.id);
  assert.equal((await machine(h, 'complete', { ...lease(first), result: result() })).status, 409);
  const second = await claim(h, 'mac-two'); assert.equal(second.job.id, first.job.id); assert.equal(second.job.attempts, 2); assert.ok(second.lease.fence > first.lease.fence);
  assert.equal((await machine(h, 'renew', lease(first))).status, 409);
  await complete(h, second, {}, 'mac-two'); assert.equal((await state(h, owner)).jobs[0].status, 'succeeded'); h.close();
});
test('renew extends the matching lease and expiry exhausts a bounded final attempt', async () => {
  const { h, owner, p } = await setup(); await enqueue(h, owner, p, { max_attempts: 1 }); await heartbeat(h); const a = await claim(h);
  h.store.sql.exec('UPDATE repository_leases SET expires=? WHERE job_id=?', Math.floor(Date.now() / 1000) + 5, a.job.id);
  const renewed = await body(await machine(h, 'renew', lease(a))); assert.ok(Date.parse(renewed.lease.expires_at) > Date.now() + (LEASE_SECONDS - 2) * 1000);
  h.store.sql.exec('UPDATE repository_leases SET expires=1 WHERE job_id=?', a.job.id);
  assert.equal((await claim(h)).job, null); assert.equal((await state(h, owner)).jobs[0].status, 'failed'); h.close();
});
test('retryable execution failures stop at max_attempts and owner retries remain bounded', async () => {
  const { h, owner, p } = await setup(); const job = await enqueue(h, owner, p, { max_attempts: 2 }); await heartbeat(h);
  for (let attempt = 1; attempt <= 2; attempt++) { const a = await claim(h); const r = await body(await machine(h, 'fail', { ...lease(a), error: 'Synthetic runtime interruption', retryable: true })); assert.equal(r.job.status, attempt === 1 ? 'queued' : 'failed'); }
  assert.equal((await claim(h)).job, null);
  for (let n = 0; n < 3; n++) { await body(await h.as(owner, '/api/jobs/' + job.id + '/retry', 'POST', {})); const a = await claim(h); await body(await machine(h, 'fail', { ...lease(a), error: 'Unrecoverable synthetic failure', retryable: false })); }
  assert.equal((await h.as(owner, '/api/jobs/' + job.id + '/retry', 'POST', {})).status, 409); h.close();
});
test('cancel invalidates a live lease and blocks descendants until an explicit resolved retry', async () => {
  const { h, owner, p } = await setup(); const first = await enqueue(h, owner, p); const next = await enqueue(h, owner, p, { dependencies: [first.id] }); await heartbeat(h); const a = await claim(h);
  await body(await h.as(owner, '/api/jobs/' + first.id + '/cancel', 'POST', {}));
  assert.equal((await machine(h, 'complete', { ...lease(a), result: result() })).status, 409);
  assert.equal((await state(h, owner)).jobs.find(j => j.id === next.id).status, 'blocked');
  assert.equal((await h.as(owner, '/api/jobs/' + next.id + '/retry', 'POST', {})).status, 409);
  await body(await h.as(owner, '/api/jobs/' + first.id + '/retry', 'POST', {})); await complete(h, await claim(h)); assert.equal((await claim(h)).job.id, next.id); h.close();
});
test('structured completion separates task outcome from quality/release approval', async () => {
  const { h, owner, p } = await setup(); await enqueue(h, owner, p); await heartbeat(h); const a = await claim(h);
  for (const value of [{ summary: 'empty' }, result({ artifacts: [{ path: '../secret' }] }), result({ artifacts: [{ path: 'https://outside.example' }] }), result({ checks: [{ name: 'regression', status: 'fail' }] }), result({ source_commit: 'invented' })]) assert.equal((await machine(h, 'complete', { ...lease(a), result: value })).status, 422);
  const done = await complete(h, a); assert.equal(done.quality_approved, false); assert.equal(done.published, false); assert.equal(done.job.result.release_approved, false); assert.equal(done.job.result.evidence_status, 'worker_reported_not_independently_verified');
  assert.equal((await machine(h, 'complete', { ...lease(a), result: result() })).status, 409); assert.equal((await state(h, owner)).releases.length, 0); h.close();
});
test('QA cannot mark unperformed checks as pass and blocked evidence stops downstream work', async () => {
  const { h, owner, p } = await setup(); const qa = await enqueue(h, owner, p, { role: 'studio-qa' }); const release = await enqueue(h, owner, p, { role: 'release-preparer', dependencies: [qa.id] }); await heartbeat(h); const a = await claim(h);
  for (const checks of [[], [{ name: 'actual iOS device', status: 'not_run' }]]) assert.equal((await machine(h, 'complete', { ...lease(a), result: result({ checks }) })).status, 422);
  await complete(h, a, { outcome: 'blocked', checks: [{ name: 'actual iOS device', status: 'not_run' }] });
  assert.equal((await state(h, owner)).jobs.find(j => j.id === release.id).status, 'blocked'); assert.equal((await claim(h)).job, null); h.close();
});
test('owner state and exports omit credentials, lease tokens and internal fingerprints', async () => {
  const { h, owner, p } = await setup(); await enqueue(h, owner, p); await heartbeat(h); const a = await claim(h);
  for (const route of ['/api/state', '/api/export']) { const raw = await (await h.as(owner, route)).text(); for (const forbidden of [...Object.values(TOKENS), a.lease.token, 'input_fingerprint']) assert.ok(!raw.includes(forbidden)); }
  assert.equal((await machine(h, 'fail', { ...lease(a), error: TOKENS['mac-one'], retryable: false })).status, 422);
  assert.equal((await machine(h, 'complete', { ...lease(a), result: result({ summary: a.lease.token }) })).status, 422); h.close();
});
test('pipeline creation is idempotent and queues real project work without starting workers', async () => {
  const { h, owner, p } = await setup(); const a = await body(await h.as(owner, '/api/projects/' + p.id + '/plan', 'POST', {})); const b = await body(await h.as(owner, '/api/projects/' + p.id + '/plan', 'POST', {}));
  assert.equal(a.jobs.length, 10); assert.equal(b.idempotent, true); assert.deepEqual(a.jobs.map(j => j.id), b.jobs.map(j => j.id)); assert.equal(a.agents_started, false);
  assert.equal(a.jobs.find(j => j.role === 'studio-developer').dependencies.length, 2); assert.equal(a.jobs.at(-1).role, 'release-preparer'); assert.equal((await state(h, owner)).workers.length, 0); h.close();
});
test('QA failure schedules at most two automatic repair cycles and fences off release on exhaustion', async () => {
  const { h, owner, p } = await setup(); await body(await h.as(owner, '/api/projects/' + p.id + '/plan', 'POST', {})); await heartbeat(h);
  let qaFailures = 0, processed = 0;
  for (;;) { const a = await claim(h); if (!a.job) break; assert.ok(++processed < 20); if (a.job.role === 'studio-qa') { qaFailures++; const done = await complete(h, a, { outcome: 'fail', checks: [{ name: 'save recovery', status: 'fail' }] }); assert.equal(done.repair_jobs.length, qaFailures < 3 ? 4 : 0); } else { assert.notEqual(a.job.role, 'integration-writer'); assert.notEqual(a.job.role, 'release-preparer'); await complete(h, a); } }
  assert.equal(qaFailures, 3); const s = await state(h, owner); assert.equal(s.jobs.length, 18); assert.ok(s.jobs.filter(j => ['integration-writer', 'release-preparer'].includes(j.role)).every(j => j.status === 'blocked')); assert.equal(s.releases.length, 0); h.close();
});
test('repair carries failed QA evidence and a fresh passing QA unlocks integration before release', async () => {
  const { h, owner, p } = await setup(); await body(await h.as(owner, '/api/projects/' + p.id + '/plan', 'POST', {})); await heartbeat(h);
  let failed = false, lastRoles = [];
  for (;;) { const a = await claim(h); if (!a.job) break; lastRoles.push(a.job.role); if (a.job.role === 'studio-qa' && !failed) { failed = true; await complete(h, a, { outcome: 'fail', checks: [{ name: 'save fault', status: 'fail' }] }); } else { if (a.job.pipeline_step === 'repair') assert.ok(a.job.dependency_results.some(d => d.role === 'studio-qa' && d.status === 'failed')); await complete(h, a); } }
  assert.deepEqual(lastRoles.slice(-3), ['studio-qa', 'integration-writer', 'release-preparer']); const s = await state(h, owner); assert.equal(s.releases.length, 1); assert.equal(s.releases[0].status, 'awaiting_review'); assert.ok(!s.projects.some(p => p.stage === 'live')); h.close();
});
test('jobs, workers and active fencing survive storage reconstruction', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-jobs-')), file = path.join(dir, 'studio.db');
  const { h, owner, p } = await setup({}, file); const job = await enqueue(h, owner, p); await heartbeat(h); const a = await claim(h); h.close();
  const again = harness(config, file); const s = await state(again, owner); assert.equal(s.jobs[0].id, job.id); assert.equal(s.jobs[0].status, 'running'); assert.equal(s.workers[0].id, 'mac-one'); await complete(again, a); again.close(); fs.rmSync(dir, { recursive: true });
});
test('machine endpoints enforce persistent rate limits and request size limits', async () => {
  const h = harness(config); const large = await machine(h, 'heartbeat', { name: 'x'.repeat(70000) }); assert.equal(large.status, 413);
  let response; for (let i = 0; i < 120; i++) response = await machine(h, 'heartbeat', {}); assert.equal(response.status, 429); h.close();
});

test('intake can idempotently start a configured game and plan but cannot manage or approve jobs', async () => {
  const h = harness(config);
  const intake = (route, payload) => h.request(route, { method: 'POST', headers: { Authorization: 'Bearer ' + h.env.INTAKE_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = { ...project, repository_url: 'https://github.com/swiftSaneGames/intake-pilot' };
  const a = await body(await intake('/api/intake/projects', data), 201), b = await body(await intake('/api/intake/projects', data), 201);
  assert.equal(a.project.id, b.project.id); assert.equal(b.idempotent, true); assert.equal(a.project.repository_visibility, 'unverified_worker_must_check_private');
  const plan = await body(await intake('/api/intake/projects/' + a.project.id + '/plan', {}), 201); assert.equal(plan.jobs.length, 10);
  const again = await body(await intake('/api/intake/projects/' + a.project.id + '/plan', {}), 201); assert.equal(again.idempotent, true);
  assert.equal((await intake('/api/intake/jobs/' + plan.jobs[0].id + '/cancel', {})).status, 404);
  assert.equal((await intake('/api/jobs/' + plan.jobs[0].id + '/cancel', {})).status, 401); h.close();
});
test('pipeline QA candidate provenance survives repairs and eight categories are mandatory', async () => {
  const { h, owner, p } = await setup(); const plan = await body(await h.as(owner, '/api/projects/' + p.id + '/plan', 'POST', {}));
  const dev = plan.jobs.find(j => j.role === 'studio-developer'), qa = plan.jobs.find(j => j.role === 'studio-qa'); assert.equal(qa.candidate_dependency_id, dev.id);
  await heartbeat(h); let candidate;
  for (;;) { candidate = await claim(h); if (candidate.job.role === 'studio-qa') break; await complete(h, candidate); }
  assert.equal((await machine(h, 'complete', { ...lease(candidate), result: result() })).status, 422);
  const failure = await complete(h, candidate, { outcome: 'fail', checks: [{ name: 'save_migration', status: 'fail' }] });
  assert.equal(failure.repair_jobs[0].candidate_dependency_id, dev.id); assert.equal(failure.repair_jobs.at(-1).candidate_dependency_id, failure.repair_jobs[0].id);
  const repair = await claim(h); assert.ok(repair.job.dependency_results.some(d => d.id === dev.id)); h.close();
});
test('a removed project repository blocks its jobs without starving unrelated ready work', async () => {
  const { h, owner, p } = await setup(); const old = await enqueue(h, owner, p); const other = await game(h, owner, 'still-ready'); const ready = await enqueue(h, owner, other);
  await body(await h.as(owner, '/api/projects/' + p.id, 'PATCH', { ...p, repository_url: '' })); await heartbeat(h);
  assert.equal((await claim(h)).job.id, ready.id); assert.equal((await state(h, owner)).jobs.find(j => j.id === old.id).blocked_reason, 'repository_changed'); h.close();
});

async function plannedUntil(role) {
  const context = await setup(); const { h, owner, p } = context;
  await body(await h.as(owner, '/api/projects/' + p.id + '/plan', 'POST', {})); await heartbeat(h);
  for (let step = 0; step < 15; step++) { const active = await claim(h); assert.ok(active.job); if (active.job.role === role) return { ...context, active }; await complete(h, active); }
  throw new Error('Requested pipeline stage was not reached');
}
test('launch and compliance operate on the explicit development candidate', async () => {
  const { h, owner, p } = await setup(); const plan = await body(await h.as(owner, '/api/projects/' + p.id + '/plan', 'POST', {})); const dev = plan.jobs.find(j => j.role === 'studio-developer');
  for (const role of ['launch-marketer', 'store-compliance']) assert.equal(plan.jobs.find(j => j.role === role).candidate_dependency_id, dev.id); h.close();
});
test('QA rejects missing reports, absent candidate identity, forged hashes and base-as-commit claims', async () => {
  const { h, active } = await plannedUntil('studio-qa'); const good = result({ source_commit: undefined, checks: PIPELINE_GATES.map(name => ({ name, status: 'pass' })) });
  for (const patch of [{ artifacts: [] }, { artifacts: [{ path: 'candidate.json' }] }, { candidate_sha256: undefined }, { candidate_base_sha: undefined }, { candidate_sha256: 'e'.repeat(64) }, { source_commit: 'b'.repeat(40) }]) {
    const response = await machine(h, 'complete', { ...lease(active), result: { ...good, ...patch } }); assert.ok([409, 422].includes(response.status));
  }
  await complete(h, active); h.close();
});
test('integration refuses a candidate other than the one independently reviewed', async () => {
  const { h, active } = await plannedUntil('integration-writer');
  for (const patch of [{ source_commit: undefined }, { candidate_sha256: 'e'.repeat(64) }, { artifacts: [] }, { checks: [{ name: 'regression', status: 'not_run' }] }]) {
    const response = await machine(h, 'complete', { ...lease(active), result: result(patch) }); assert.ok([409, 422].includes(response.status));
  }
  await complete(h, active); h.close();
});
test('only an active release preparer can create an exact, idempotent owner-review candidate', async () => {
  const wrong = await plannedUntil('studio-developer');
  assert.equal((await machine(wrong.h, 'candidate', { ...lease(wrong.active), manifest: manifest(wrong.p.id) })).status, 403); wrong.h.close();
  const { h, owner, p, active } = await plannedUntil('release-preparer');
  const ready = result({ checks: PIPELINE_GATES.map(name => ({ name, status: 'pass' })) });
  assert.equal((await machine(h, 'complete', { ...lease(active), result: ready })).status, 409);
  for (const change of [{ project_id: 'p-other' }, { source_commit: 'f'.repeat(40) }, { blocking_issues: 1 }]) assert.equal((await machine(h, 'candidate', { ...lease(active), manifest: manifest(p.id, change) })).status, 409);
  const request = { ...lease(active), manifest: manifest(p.id) };
  const a = await body(await machine(h, 'candidate', request)), b = await body(await machine(h, 'candidate', request));
  assert.equal(a.candidate.id, b.candidate.id); assert.equal(b.idempotent, true); assert.equal(a.candidate.status, 'awaiting_review'); assert.equal(a.published, false);
  assert.equal((await machine(h, 'complete', { ...lease(active), result: { ...ready, source_commit: 'c'.repeat(40), candidate_id: a.candidate.id } })).status, 409);
  await body(await machine(h, 'complete', { ...lease(active), result: { ...ready, candidate_id: a.candidate.id } }));
  const s = await state(h, owner); assert.equal(s.releases.length, 1); assert.equal(s.releases[0].decision, null); assert.equal(s.projects[0].stage, 'review'); h.close();
});
test('expired or mismatched release leases cannot submit a dashboard candidate', async () => {
  const { h, p, active } = await plannedUntil('release-preparer'); await heartbeat(h, 'mac-two');
  const request = { ...lease(active), manifest: manifest(p.id) };
  assert.equal((await machine(h, 'candidate', request, 'mac-two')).status, 409);
  h.store.sql.exec('UPDATE repository_leases SET expires=1 WHERE job_id=?', active.job.id);
  assert.equal((await machine(h, 'candidate', request)).status, 409); assert.equal(h.store.row('SELECT COUNT(*) AS n FROM releases').n, 0); h.close();
});
for (const scope of ['project', 'studio']) test('QA failure evidence survives automatic repair capacity exhaustion: ' + scope, async () => {
  const { h, owner, p, active } = await plannedUntil('studio-qa');
  const existing = h.store.row('SELECT COUNT(*) AS n FROM jobs').n, target = scope === 'project' ? 499 : 4999;
  const fillerProject = scope === 'project' ? p.id : (await game(h, owner, 'capacity-fixtures')).id;
  for (let n = existing; n < target; n++) {
    const id = 'j-fill-' + n, filler = { id, project_id: fillerProject, status: 'cancelled', dependencies: [], result: null };
    h.store.sql.exec('INSERT INTO jobs VALUES(?,?,?,?,?,?)', id, fillerProject, 'filler:' + n, 'cancelled', 'swiftSanegames/capacity-fixtures', JSON.stringify(filler));
  }
  const done = await complete(h, active, { outcome: 'fail', checks: [{ name: 'save_migration', status: 'fail' }], summary: 'Reproduced synthetic save-loss failure' });
  assert.equal(done.job.status, 'failed'); assert.equal(done.job.result.summary, 'Reproduced synthetic save-loss failure'); assert.equal(done.job.repair_blocker.reason, 'queue_capacity'); assert.equal(done.repair_jobs.length, 0);
  assert.equal(h.store.row('SELECT COUNT(*) AS n FROM jobs').n, target); assert.equal(h.store.row('SELECT COUNT(*) AS n FROM repository_leases').n, 0); h.close();
});

test('a named kickoff preserves its bounded original brief through queued and claimed instructions', async () => {
  const { h, owner } = await setup();
  const intent = { ...project, title: 'Saffron Station Stories', category: 'Business simulation', summary: 'Build an original petrol-station management game with approachable controls, friendly roadside customers and staff progression.', references: ['G001'] };
  const p = (await body(await h.as(owner, '/api/projects', 'POST', { ...intent, repository_url: 'https://github.com/swiftSaneGames/saffron-station-stories' }))).project;
  const plan = await body(await h.as(owner, '/api/projects/' + p.id + '/plan', 'POST', {}));
  for (const job of plan.jobs) {
    assert.ok(job.instructions.includes(intent.title)); assert.ok(job.instructions.includes(intent.summary));
    assert.equal(job.project_context.category, intent.category); assert.deepEqual(job.project_context.references, ['G001']); assert.equal(job.project_context.reference_game_id, null);
    assert.match(job.instructions, /untrusted task data/);
  }
  await heartbeat(h); const active = await claim(h);
  assert.equal(active.job.project_id, p.id); assert.ok(active.job.instructions.includes(intent.title)); assert.ok(active.job.instructions.includes(intent.summary));
  assert.equal(active.job.project_context.title, intent.title); h.close();
});

function progress(overrides = {}) {
  return { update_id: 'milestone-1', phase: 'executing', summary: 'Reviewed the game brief.', completed: ['Original scope recorded.'], next_step: 'Implement the scoped loop.', blocker: '', ...overrides };
}
async function activeJob() {
  const context = await setup(); await enqueue(context.h, context.owner, context.p); await heartbeat(context.h);
  return { ...context, active: await claim(context.h) };
}
test('leased progress persists server identity without changing outcome, approval or lease', async () => {
  const { h, owner, active } = await activeJob();
  const response = await body(await machine(h, 'progress', { ...lease(active), progress: progress() }));
  assert.equal(response.idempotent, false); assert.equal(response.progress.worker_id, 'mac-one'); assert.equal(response.progress.fence, active.lease.fence);
  assert.ok(Math.abs(Date.parse(response.progress.reported_at) - Date.now()) < 2000);
  assert.equal(response.progress.source, 'worker_reported_not_independently_verified');
  const stateValue = await state(h, owner), job = stateValue.jobs[0];
  assert.equal(job.status, 'running'); assert.equal(job.result, null); assert.equal(job.lease_expires_at, active.job.lease_expires_at); assert.equal(job.progress_history.length, 1);
  assert.equal(stateValue.releases.length, 0); assert.equal(stateValue.job_queue.progress_updates, true); assert.equal(stateValue.job_queue.progress_history_global, 400);
  assert.ok(!JSON.stringify(stateValue).includes('progress_recent')); h.close();
});
test('progress rejects public, owner, intake and other-worker callers', async () => {
  const { h, owner, active } = await activeJob(), payload = { ...lease(active), progress: progress() };
  assert.equal((await h.request('/api/worker/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).status, 401);
  assert.equal((await h.as(owner, '/api/worker/progress', 'POST', payload)).status, 401);
  assert.equal((await h.request('/api/worker/progress', { method: 'POST', headers: { Authorization: 'Bearer ' + h.env.INTAKE_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).status, 401);
  assert.equal((await machine(h, 'progress', payload, 'mac-two')).status, 409);
  assert.equal((await machine(h, 'progress', { ...payload, fence: payload.fence + 1 })).status, 409);
  assert.equal((await machine(h, 'progress', { ...payload, lease_token: 'wrong' })).status, 409);
  assert.equal((await state(h, owner)).jobs[0].progress, null); h.close();
});
test('expired and cancelled leases cannot publish even an otherwise idempotent update', async () => {
  const { h, owner, active } = await activeJob(), payload = { ...lease(active), progress: progress() };
  await body(await machine(h, 'progress', payload));
  h.store.sql.exec('UPDATE repository_leases SET expires=1 WHERE job_id=?', active.job.id);
  assert.equal((await machine(h, 'progress', payload)).status, 409);
  const next = await claim(h); assert.ok(next.lease.fence > active.lease.fence); assert.equal(next.job.progress, null);
  await body(await h.as(owner, '/api/jobs/' + next.job.id + '/cancel', 'POST', {}));
  assert.equal((await machine(h, 'progress', { ...lease(next), progress: progress() })).status, 409); h.close();
});
test('progress validates every bounded field, rejects invented authority and filters credentials', async () => {
  const { h, active } = await activeJob(); h.env.GOOGLE_CLIENT_SECRET = 'escaped-credential-"' + 'q'.repeat(40);
  for (const patch of [{ update_id: '../outside' }, { phase: 'succeeded' }, { completed: Array(9).fill('x') }, { completed: ['x'.repeat(241)] }, { summary: '' }, { summary: 'x'.repeat(1201) }, { next_step: 'x'.repeat(501) }, { blocker: null }, { reported_at: '2000-01-01' }, { worker_id: 'owner' }, { approved: true }, { summary: TOKENS['mac-one'] }, { summary: active.lease.token }, { summary: h.env.INTAKE_TOKEN }, { summary: h.env.GOOGLE_CLIENT_SECRET }, { summary: '😀'.repeat(601) }]) {
    const response = await machine(h, 'progress', { ...lease(active), progress: progress(patch) }); assert.equal(response.status, 422, JSON.stringify(patch));
  }
  assert.equal((await machine(h, 'progress', { ...lease(active), progress: progress({ summary: '界'.repeat(1200), completed: Array(8).fill('界'.repeat(240)) }) })).status, 413);
  await body(await machine(h, 'progress', { ...lease(active), progress: progress({ phase: 'blocked', blocker: 'A physical iOS device is unavailable.' }) }));
  assert.equal(h.store.jobs.get(active.job.id).status, 'running'); h.close();
});
test('progress replay is idempotent, unchanged content stays quiet and ID conflicts fail', async () => {
  const { h, owner, active } = await activeJob(), payload = { ...lease(active), progress: progress() };
  const first = await body(await machine(h, 'progress', payload));
  for (const change of [{}, { update_id: 'milestone-2' }]) {
    const again = await body(await machine(h, 'progress', { ...payload, progress: progress(change) })); assert.equal(again.idempotent, true); assert.deepEqual(again.progress, first.progress);
  }
  const conflict = await machine(h, 'progress', { ...payload, progress: progress({ summary: 'Changed content.' }) }); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).code, 'progress_conflict');
  assert.equal((await state(h, owner)).jobs[0].progress_history.length, 1); h.close();
});
test('progress rate is bounded independently of event retention', async () => {
  const { h, active } = await activeJob();
  for (let i = 0; i < 12; i++) await body(await machine(h, 'progress', { ...lease(active), progress: progress({ update_id: 'update-' + i, summary: 'Completed step ' + i }) }));
  h.store.sql.exec('DELETE FROM job_progress');
  const response = await machine(h, 'progress', { ...lease(active), progress: progress({ update_id: 'update-13', summary: 'One more step' }) });
  assert.equal(response.status, 429); assert.equal((await response.json()).code, 'progress_rate_limited'); h.close();
});
test('progress history is bounded per job and globally without bloating queue scans', async t => {
  const { h, owner, p } = await setup(); await heartbeat(h); let now = Date.now(); t.mock.method(Date, 'now', () => now);
  for (let jobIndex = 0; jobIndex < 11; jobIndex++) {
    await enqueue(h, owner, p); const active = await claim(h); h.store.sql.exec('UPDATE repository_leases SET expires=? WHERE job_id=?', Math.floor(now / 1000) + 1000, active.job.id);
    for (let i = 0; i < 41; i++) {
      now += 6000;
      h.store.jobs.progress('mac-one', { ...lease(active), progress: progress({ update_id: 'step-' + i, summary: 'Observed step ' + i }) });
    }
    assert.equal(h.store.row('SELECT COUNT(*) AS n FROM job_progress WHERE job_id=?', active.job.id).n, 40);
    assert.ok(!Object.hasOwn(h.store.jobs.get(active.job.id), 'progress_history'));
    await complete(h, active);
  }
  assert.equal(h.store.row('SELECT COUNT(*) AS n FROM job_progress').n, 400);
  const value = await state(h, owner); assert.equal(value.jobs.flatMap(j => j.progress_history).length, 400); assert.ok(value.jobs.every(j => j.progress_history.length <= 40)); h.close();
});
test('progress and idempotency survive Durable Object reconstruction', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-progress-')), file = path.join(dir, 'studio.db');
  const { h, owner, p } = await setup({}, file); await enqueue(h, owner, p); await heartbeat(h); const active = await claim(h);
  const payload = { ...lease(active), progress: progress() }; await body(await machine(h, 'progress', payload)); h.close();
  const again = harness(config, file); assert.equal((await body(await machine(again, 'progress', payload))).idempotent, true);
  assert.equal((await state(again, owner)).jobs[0].progress_history.length, 1); again.close(); fs.rmSync(dir, { recursive: true });
});
