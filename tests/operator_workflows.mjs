/**
 * Real operator workflows: Chromium UI → native Worker → SQLite store.
 * Run after npm run build:
 *   CHROMIUM_PATH=/path/to/chromium node tests/operator_workflows.mjs
 * Playwright may be installed locally or in CODEX_PRIMARY_RUNTIME_NODE_MODULES.
 * Every browser request is intercepted and passed through the real handler, with
 * its actual cookies, Origin and CSRF token. Only Google's test identity provider
 * is synthetic. These are isolated test records, not live production evidence.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { harness, manifest, ORIGIN } from './native/harness.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw new Error('Install Playwright or set CODEX_PRIMARY_RUNTIME_NODE_MODULES.');
  playwright = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'));
}
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-operator-workflows-'));
const dbFile = path.join(directory, 'studio.sqlite');
const workerToken = 'isolated-browser-worker-' + 'w'.repeat(48);
const config = { WORKER_TOKENS_JSON: JSON.stringify({ 'browser-test-mac': workerToken }) };
let h = harness(config, dbFile);
const owner = await h.login();
assert.equal(owner.response.status, 303, 'The signed synthetic Google flow must issue a real test session');
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
const equals = owner.cookie.indexOf('=');
await context.addCookies([{ name: owner.cookie.slice(0, equals), value: owner.cookie.slice(equals + 1), url: ORIGIN, secure: true, httpOnly: true, sameSite: 'Lax' }]);
const calls = [], routeErrors = [], unexpectedOutbound = [], browserErrors = [], securityErrors = [];
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== ORIGIN) {
    unexpectedOutbound.push(request.url());
    await route.abort('blockedbyclient');
    return;
  }
  try {
    const headers = await request.allHeaders();
    const method = request.method();
    // Never supply a missing CSRF or Origin on the browser's behalf.
    const response = await h.request(url.pathname + url.search, {
      method, headers,
      ...(!['GET', 'HEAD'].includes(method) ? { body: request.postDataBuffer() } : {}),
    });
    const body = Buffer.from(await response.arrayBuffer());
    calls.push({ path: url.pathname, method, status: response.status, csrf: headers['x-csrf-token'], origin: headers.origin, body: request.postData() });
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    // Keep CSP and all security headers: do not make the UI work by weakening them.
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
  } catch (error) {
    routeErrors.push(error.stack || String(error));
    await route.fulfill({ status: 500, body: 'Isolated test adapter failure' });
  }
});
const page = await context.newPage();
await page.clock.install({ time: Date.now() });
page.setDefaultTimeout(10000);
page.on('pageerror', error => browserErrors.push(error.message));
page.on('console', message => { if (/Content Security Policy|Refused to (?:load|execute|apply)|violates.*directive/i.test(message.text())) securityErrors.push(message.text()); });
async function json(response, status = 200) {
  const result = await response.json();
  assert.equal(typeof response.status === 'function' ? response.status() : response.status, status, JSON.stringify(result));
  return result;
}
const state = () => h.as(owner, '/api/state').then(response => json(response));
const machine = (action, payload) => h.request('/api/worker/' + action, {
  method: 'POST', headers: { Authorization: 'Bearer ' + workerToken, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
}).then(response => json(response));
async function mutation(pathname, action, status = 200) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === pathname && !['GET', 'HEAD'].includes(r.request().method()));
  await action();
  return json(await response, status);
}
async function closeDialog() {
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('#modal').waitFor({ state: 'hidden' });
}
async function nav(route) {
  await page.locator(`#nav a[href="#${route}"]`).click();
  await page.waitForFunction(expected => location.hash === '#' + expected, route);
  const heading = { pipeline: 'Games', overview: 'Overview', reviews: 'Builds & reviews', operations: 'Work queue' }[route];
  if (heading) await page.locator('#main').getByRole('heading', { name: heading, exact: true }).waitFor();
}
async function refresh() {
  const done = page.waitForResponse(r => new URL(r.url()).pathname === '/api/state');
  await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
  await done;
}
async function openGame(id) {
  await nav('pipeline');
  await page.locator('#game-query').fill('');
  await page.locator('#game-stage').selectOption('');
  await page.locator(`#game-results [data-action="project"][data-id="${id}"]`).first().click();
  await page.waitForFunction(expected => location.hash === '#project/' + expected, id);
}
const gameTitle = 'Browser Fixture Garden';
const repository = 'https://github.com/swiftSaneGames/browser-fixture-garden';
const feedback = 'The Android save resets after reopening. Preserve the puzzle state, add an interruption regression, and return both exact platform builds for review.';
let game, other, primaryCandidate, otherCandidate, followupId;
try {
  await page.goto(ORIGIN + '/#overview');
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  assert.equal((await state()).projects.length, 0);

  // Create a linked game entirely through the operator UI.
  await page.locator('[data-action="new-project"]').first().click();
  await page.getByLabel('Working title', { exact: true }).fill(gameTitle);
  await page.locator('#project-category').selectOption('Puzzle');
  await page.locator('#project-repo').fill(repository);
  await page.locator('#project-summary').fill('Original relaxing garden puzzles with offline progress and accessible controls. Synthetic browser regression record only.');
  const created = await mutation('/api/projects', () => page.locator('#project-form button[type="submit"]').click());
  game = created.project;
  assert.equal(game.repository_url, repository);
  await page.waitForFunction(id => location.hash === '#project/' + id, game.id);
  await page.getByRole('heading', { name: gameTitle, exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: /Repository/ }).getAttribute('href'), repository);
  assert.equal(await page.getByRole('button', { name: 'Start production pipeline', exact: true }).isEnabled(), true);

  const planned = await mutation('/api/projects/' + game.id + '/plan', () => page.getByRole('button', { name: 'Start production pipeline', exact: true }).click());
  assert.equal(planned.jobs.length, 10);
  await page.waitForFunction(() => location.hash === '#operations');
  await page.locator('#job-project-filter').waitFor();
  assert.equal(await page.locator('#job-project-filter').inputValue(), game.id);
  assert.equal((await state()).jobs.length, 10, 'The UI must create actual durable jobs');
  assert.equal(await page.locator('#jobs-list tbody tr').count(), 10);
  await page.getByLabel('Search assignments', { exact: true }).fill(planned.jobs[0].title);
  assert.equal(await page.locator('#jobs-list tbody tr').count(), 1, 'Search must filter persisted assignment records');
  await page.getByLabel('Search assignments', { exact: true }).fill('');
  await page.locator('#job-status-filter').selectOption('running');
  await page.getByRole('heading', { name: 'No jobs match these filters', exact: true }).waitFor();
  await page.locator('#job-status-filter').selectOption('queued');
  assert.equal(await page.locator('#jobs-list tbody tr').count(), 10);
  await page.locator('#job-status-filter').selectOption('');
  await openGame(game.id);
  assert.equal(await page.getByRole('button', { name: 'Start production pipeline', exact: true }).count(), 0, 'Started pipelines must present existing work instead of another start action');
  await page.getByRole('button', { name: 'View production jobs', exact: true }).click();
  assert.equal(calls.filter(c => c.path === '/api/projects/' + game.id + '/plan').length, 1);

  // The agent reads its real scoped assignment and reports a checkpoint through
  // machine credentials. An update is visible without fabricating completion.
  await machine('heartbeat', { name: 'Isolated browser test Mac', capabilities: ['studio-researcher'] });
  const claimed = await machine('claim', {});
  assert.equal(claimed.job.project_id, game.id);
  assert.equal(claimed.job.project_context.title, gameTitle, 'The worker must receive this game’s brief');
  const checkpoint = 'Reviewed the original garden brief; collecting evidence for its offline puzzle loop.';
  await machine('progress', {
    job_id: claimed.job.id, lease_token: claimed.lease.token, fence: claimed.lease.fence,
    progress: { update_id: 'browser-milestone-one', phase: 'executing', summary: checkpoint, completed: ['Original concept and audience reviewed.'], next_step: 'Compare reference evidence and record sources.', blocker: '' },
  });
  const reported = (await state()).jobs.find(j => j.id === claimed.job.id);
  assert.equal(reported.status, 'running');
  assert.equal(reported.result, null);
  assert.equal(reported.progress.summary, checkpoint);
  await refresh();
  await page.getByLabel('Search assignments', { exact: true }).fill('collecting evidence');
  await page.locator('#job-status-filter').selectOption('running');
  assert.equal(await page.locator('#jobs-list tbody tr').count(), 1);
  await page.locator('#jobs-list').getByText(checkpoint, { exact: false }).waitFor();
  await page.locator(`#jobs-list [data-action="inspect-job"][data-id="${claimed.job.id}"]`).first().click();
  await page.locator('#modal').getByText(checkpoint, { exact: true }).first().waitFor();
  await closeDialog();
  await page.getByLabel('Search assignments', { exact: true }).fill('');
  await page.locator('#job-status-filter').selectOption('');
  await openGame(game.id);
  await page.locator('#main .agent-updates').getByText(checkpoint, { exact: true }).waitFor();
  await nav('overview');
  await page.locator('#main .agent-updates').getByText(checkpoint, { exact: true }).waitFor();
  assert.equal((await state()).releases.length, 0, 'A checkpoint must not create or approve a release');
  const nextCheckpoint = 'Reference comparison recorded; preparing the original puzzle scope handoff.';
  await machine('progress', {
    job_id: claimed.job.id, lease_token: claimed.lease.token, fence: claimed.lease.fence,
    progress: { update_id: 'browser-milestone-two', phase: 'executing', summary: nextCheckpoint, completed: ['Original concept and audience reviewed.', 'Reference comparison recorded.'], next_step: 'Write the scoped design handoff.', blocker: '' },
  });
  const automaticSnapshot = page.waitForResponse(r => new URL(r.url()).pathname === '/api/state');
  await page.clock.fastForward(31000);
  await automaticSnapshot;
  await page.locator('#main .agent-updates').getByText(nextCheckpoint, { exact: true }).waitFor();
  assert.equal((await state()).jobs.find(j => j.id === claimed.job.id).status, 'running');

  // Add another real project to prove all game and release filters are scoped.
  other = (await json(await h.as(owner, '/api/projects', 'POST', {
    title: 'Browser Fixture Orchard', category: 'Puzzle', summary: 'Independent second synthetic game.', repository_url: 'https://github.com/swiftSaneGames/browser-fixture-orchard',
  }))).project;
  await refresh();
  await nav('pipeline');
  await page.locator('#game-results').getByText(other.title, { exact: true }).waitFor();
  await page.locator('#main').getByLabel('Search games', { exact: true }).fill('Orchard');
  assert.equal(await page.locator('#game-results tbody tr').count(), 1);
  assert.equal(await page.locator('#game-results').getByText(gameTitle, { exact: true }).count(), 0);
  await page.locator('#game-stage').selectOption('live');
  await page.getByRole('heading', { name: 'No games match', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  assert.equal(await page.locator('#game-results tbody tr').count(), 2);

  const primaryManifest = manifest(game.id, {
    version: '0.3.0',
    artifacts: { android: { url: repository + '/releases/download/v0.3.0/garden.apk', sha256: 'b'.repeat(64) }, ios: { url: 'https://testflight.apple.com/join/Garden03', sha256: 'c'.repeat(64) } },
    evidence: manifest(game.id).evidence.map(e => ({ ...e, status: e.key === 'save_migration' ? 'fail' : 'pass' })), blocking_issues: 1,
  });
  const otherManifest = manifest(other.id, { version: '0.7.0', source_commit: 'd'.repeat(40) });
  otherCandidate = (await json(await h.as(owner, '/api/candidates', 'POST', otherManifest))).candidate;
  await refresh();
  await openGame(game.id);
  await page.getByRole('button', { name: 'Submit candidate', exact: true }).click();
  assert.equal(await page.locator('#candidate-project').inputValue(), game.id, 'Candidate submission must inherit the open game');
  const templateDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download template', exact: true }).click();
  const template = JSON.parse(fs.readFileSync(await (await templateDownload).path(), 'utf8'));
  assert.equal(template.project_id, game.id, 'Downloaded template must use the selected game, never the first project');
  assert.ok(template.evidence.every(gate => gate.status === 'not_run'), 'Templates must not assert completed checks');
  const candidatesBeforeMismatch = (await state()).releases.length;
  await page.getByLabel('Manifest JSON', { exact: true }).fill(JSON.stringify(otherManifest));
  await page.locator('#candidate-form button[type="submit"]').click();
  await page.locator('#form-error').waitFor({ state: 'visible' });
  assert.equal((await state()).releases.length, candidatesBeforeMismatch, 'A manifest for another game must not silently submit in this workspace');
  await page.getByLabel('Manifest JSON', { exact: true }).fill(JSON.stringify(primaryManifest));
  primaryCandidate = (await mutation('/api/candidates', () => page.locator('#candidate-form button[type="submit"]').click())).candidate;
  await page.locator('#modal').waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Latest candidate · 0.3.0', exact: true }).waitFor();
  for (const platform of ['android', 'ios']) assert.equal(await page.locator(`.build-summary a[href="${primaryManifest.artifacts[platform].url}"]`).count(), 1, 'Workspace must expose the exact submitted ' + platform + ' build');
  assert.equal(await page.locator('.build-summary').getByText('0.7.0', { exact: true }).count(), 0);
  await page.locator(`.build-summary [data-action="release"][data-id="${primaryCandidate.id}"]`).click();
  assert.equal(await page.locator('#modal .gate-row').count(), 8);
  assert.equal(await page.getByRole('button', { name: 'Approve these builds', exact: true }).isDisabled(), true, 'Failed evidence must disable approval');
  for (const platform of ['android', 'ios']) assert.equal(await page.locator(`#modal a[href="${primaryManifest.artifacts[platform].url}"]`).count(), 1);
  await closeDialog();

  // Passing reports alone are not human verification: approval without attestations fails.
  await nav('reviews');
  await page.locator('#release-project').selectOption(other.id);
  assert.equal(await page.locator('#release-results tbody tr').count(), 1);
  await page.locator(`#release-results [data-action="release"][data-id="${otherCandidate.id}"]`).click();
  await page.locator('#confirmation').fill('APPROVE 0.7.0');
  await mutation('/api/releases/' + otherCandidate.id + '/decision', () => page.getByRole('button', { name: 'Approve these builds', exact: true }).click(), 422);
  await page.locator('#form-error').waitFor({ state: 'visible' });
  assert.equal((await state()).releases.find(r => r.id === otherCandidate.id).status, 'awaiting_review');
  await closeDialog();
  await page.locator('#release-project').selectOption(game.id);
  await page.locator('#release-query').fill('0.7.0');
  await page.getByRole('heading', { name: 'No candidates match', exact: true }).waitFor();
  await page.locator('#release-query').fill('0.3.0');
  assert.equal(await page.locator('#release-results tbody tr').count(), 1);
  await page.locator(`#release-results [data-action="release"][data-id="${primaryCandidate.id}"]`).click();
  await page.getByLabel('Feedback / requested changes', { exact: true }).fill(feedback);
  const jobsBeforeFeedback = (await state()).jobs.length;
  await mutation('/api/releases/' + primaryCandidate.id + '/decision', () => page.getByRole('button', { name: 'Request changes', exact: true }).click());
  await page.locator('#modal').getByRole('button', { name: 'Assign review follow-up', exact: true }).waitFor();
  await closeDialog();
  let saved = await state();
  assert.equal(saved.releases.find(r => r.id === primaryCandidate.id).decision.note, feedback);
  assert.equal(saved.projects.find(p => p.id === game.id).stage, 'building');
  assert.equal(saved.jobs.length, jobsBeforeFeedback, 'Recording review feedback must not pretend that follow-up work was queued');

  await openGame(game.id);
  await page.locator('#main').getByText(feedback, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Assign review follow-up', exact: true }).click();
  assert.equal(await page.locator('#job-project').inputValue(), game.id);
  const instructions = await page.locator('#job-instructions').inputValue();
  assert.ok(instructions.includes(feedback), 'Follow-up must carry the exact owner feedback');
  assert.ok(instructions.includes('0.3.0'), 'Follow-up must name the reviewed version');
  assert.ok(instructions.includes(primaryCandidate.manifest_hash), 'Follow-up must identify the exact reviewed manifest');
  const followup = (await mutation('/api/jobs', () => page.getByRole('button', { name: 'Queue assignment', exact: true }).click())).job;
  followupId = followup.id;
  assert.equal(followup.project_id, game.id);
  assert.equal(followup.instructions, instructions);
  assert.equal((await state()).jobs.length, jobsBeforeFeedback + 1);
  await page.waitForFunction(() => location.hash === '#operations');
  await page.getByLabel('Search assignments', { exact: true }).fill(followup.title);
  assert.equal(await page.locator('#jobs-list tbody tr').count(), 1);
  await page.locator(`#jobs-list [data-action="inspect-job"][data-id="${followup.id}"]`).first().click();
  await page.locator('#modal').getByText(instructions, { exact: true }).waitFor();
  await closeDialog();

  // Regression: an unlinked game must never borrow another game's repository
  // when its requested changes are turned into an assignment.
  const unlinked = (await json(await h.as(owner, '/api/projects', 'POST', {
    title: 'Browser Fixture Without Repository', category: 'Puzzle', summary: 'Synthetic unlinked game for follow-up isolation.',
  }))).project;
  const unlinkedRelease = (await json(await h.as(owner, '/api/candidates', 'POST', manifest(unlinked.id)))).candidate;
  await json(await h.as(owner, '/api/releases/' + unlinkedRelease.id + '/decision', 'POST', {
    action: 'request_changes', manifest_hash: unlinkedRelease.manifest_hash, note: 'Repair this unlinked game only; do not use another game repository.',
  }));
  await refresh();
  await openGame(unlinked.id);
  assert.equal(await page.getByRole('button', { name: 'Assign review follow-up', exact: true }).isDisabled(), true);
  await page.locator(`.build-summary [data-action="release"][data-id="${unlinkedRelease.id}"]`).click();
  assert.equal(await page.locator('#modal').getByRole('button', { name: 'Assign review follow-up', exact: true }).isDisabled(), true);
  await closeDialog();
  assert.equal((await state()).jobs.length, jobsBeforeFeedback + 1);
  assert.equal((await state()).jobs.some(j => j.project_id === unlinked.id), false);
  await nav('operations');

  // The same real workflow remains usable at phone width, including its modal.
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Queue must not overflow the viewport');
  await page.locator(`#jobs-list [data-action="inspect-job"][data-id="${followup.id}"]`).first().click();
  assert.equal(await page.evaluate(() => document.querySelector('#modal').scrollWidth <= document.querySelector('#modal').clientWidth), true, 'Evidence dialog must not overflow');
  await closeDialog();

  const writes = calls.filter(c => !['GET', 'HEAD'].includes(c.method));
  assert.ok(writes.length >= 5);
  assert.ok(writes.every(c => c.csrf === owner.csrf && c.origin === ORIGIN), 'Real UI mutations must supply their own session CSRF and correct Origin');
  assert.equal(calls.some(c => c.path.endsWith('/publication')), false, 'No operator workflow may record a store release implicitly');
  assert.equal((await state()).releases.some(r => ['approved', 'released'].includes(r.status)), false);
  assert.deepEqual(unexpectedOutbound, [], 'No unknown network request may leave the isolated workflow');
  assert.deepEqual(routeErrors, []);
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(securityErrors, [], 'The actual production CSP must permit this interface');

  // Reconstruct the real store to prove that the UI's successful states persisted.
  h.close(); h = harness(config, dbFile);
  saved = await state();
  assert.equal(saved.jobs.find(j => j.id === followupId).instructions, instructions);
  assert.equal(saved.releases.find(r => r.id === primaryCandidate.id).decision.note, feedback);
  assert.equal(saved.projects.find(p => p.id === game.id).repository_url, repository);
  console.log('Real native/SQLite browser workflows passed: linked game creation, one pipeline, work/search filters, scoped worker assignment/progress and automatic polling, scoped candidates and exact builds, gate/attestation failures, review feedback, explicit version-bound follow-up, CSRF/CSP, mobile controls and durable reload. Google identity and game records are synthetic; no live deployment, model, device or store action occurred.');
} catch (error) {
  if (process.env.BROWSER_OUTPUT) {
    fs.mkdirSync(process.env.BROWSER_OUTPUT, { recursive: true });
    await page.screenshot({ path: path.join(process.env.BROWSER_OUTPUT, 'operator-workflow-failure.png'), fullPage: true }).catch(() => {});
  }
  if (routeErrors.length) console.error(routeErrors.join('\n'));
  throw error;
} finally {
  await context.close(); await browser.close(); h.close(); fs.rmSync(directory, { recursive: true, force: true });
}
