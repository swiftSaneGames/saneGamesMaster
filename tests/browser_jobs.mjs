/** Operations UI checks against synthetic fixtures, not production or worker execution.
 * node tests/browser_jobs.mjs --static
 * CHROMIUM_PATH=/path/to/chromium node tests/browser_jobs.mjs
 * Browser checks need Playwright locally or CODEX_PRIMARY_RUNTIME_NODE_MODULES.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const script = read('cloudflare/public/assets/app.js');
const now = new Date().toISOString();
const project = { id: 'project-one', title: 'Fixture Garden', category: 'Business simulation', stage: 'building', audience: 'per_game', connectivity: 'offline', repository_url: 'https://github.com/swiftSaneGames/fixture-private', summary: 'An original fixture for interface checks.', updated_at: now };
const fixtureJob = (id, status, extra = {}) => ({ id, project_id: project.id, role: 'studio-developer', title: `Fixture ${id}`, instructions: 'Run the assigned checks and return exact evidence.', repository_url: project.repository_url, status, attempts: 1, max_attempts: 2, retry_count: 0, dependencies: [], updated_at: now, ...extra });
const fixtures = {
  user: { name: 'Fixture Owner', email: 'fixture@example.invalid', csrf: 'fixture-csrf' }, projects: [project], tasks: [], releases: [], events: [], pins: [], allowed_emails: ['fixture@example.invalid'], integrations: { agent_intake: false }, hosting: 'Synthetic UI fixture', app_origin: 'https://studio-fixture.invalid',
  jobs: [
    fixtureJob('queued-one', 'queued'),
    fixtureJob('running-one', 'running', { worker_id: 'worker-one', lease_expires_at: new Date(Date.now() + 60000).toISOString() }),
    fixtureJob('passed-one', 'succeeded', { result: { outcome: 'pass', summary: 'Fixture checks completed.', artifacts: [{ path: 'docs/qa/report.md', description: 'Synthetic report' }], checks: [{ name: 'Save recovery', status: 'pass', details: 'Fixture only.' }] } }),
    fixtureJob('failed-one', 'failed', { last_error: 'Fixture failure: investigate before retry.', dependencies: ['passed-one'] }),
    fixtureJob('blocked-one', 'blocked', { dependencies: ['queued-one'], blocked_reason: 'Waiting for its prerequisite.' }),
  ],
  workers: [{ id: 'worker-one', name: 'Fixture Mac', capabilities: ['studio-developer'], last_seen_at: now, online: true }],
  job_roles: ['studio-developer', 'studio-qa'],
};
const discovery = Array.from({ length: 52 }, (_, i) => ({ game_id: `REF-${String(i + 1).padStart(4, '0')}`, title: `Discovery fixture ${i + 1}`, developer: i % 2 ? 'Second Studio' : 'First Studio', package_id: `test.fixture${i}`, play_url: `https://play.google.com/store/apps/details?id=test.fixture${i}`, category: i % 2 ? 'Puzzle' : 'Simulation', complexity: i % 2 ? 'small_loop_estimate' : 'vertical_slice_estimate', verified_at: now, verification_status: 'direct_play_listing_verified', notes: 'Not playtested. Scope remains an estimate.' }));
const catalog = { games: [], discovery_games: discovery, studios: [], concepts: [], roles: [{ id: 'studio-developer', description: 'Actual role description', content: 'Fixture role' }], documents: [{ id: 'worker_setup', title: 'Worker setup', file: 'docs/WORKER_SETUP.md', content: '# Setup\nSynthetic fixture.' }] };

function staticChecks() {
  const elements = { '#discovery-results': {}, '#discovery-count': {} };
  const context = vm.createContext({ URL, Date, Intl, document: { querySelector: selector => elements[selector] || null } });
  new vm.Script(script); // Validate the whole file, including handlers.
  vm.runInContext(script.slice(0, script.indexOf("document.addEventListener('click'")) + `
    globalThis.fixture = (d, c) => { data = d; catalog = c; refreshTime = '12:00'; };
    globalThis.helpers = { operationsPage, projectOperations, jobCard, jobActions, retryBlocker, recentWorker, workerSummary, agentsPage, inspectJob, researchPage, discoveryCard, discoveryMatches, renderDiscoveryResults, discoveryIdea, originalProjectForm: projectForm };
    modal = (title, subtitle, content) => { globalThis.dialog = { title, subtitle, content }; };
    projectForm = project => { globalThis.proposedProject = project; };
  `, context);
  context.fixture(structuredClone(fixtures), catalog);
  const h = context.helpers;
  assert.match(h.operationsPage(), /1 worker recently seen/);
  assert.match(h.operationsPage(), /data-id="worker_setup"/);
  assert.match(h.operationsPage(), /Fixture Mac/);
  assert.equal(h.recentWorker({ last_seen_at: new Date(Date.now() - 240000).toISOString() }), false);
  assert.equal(h.recentWorker({ last_seen_at: 'invalid' }), false);
  assert.equal(h.retryBlocker(fixtures.jobs[3]), '');
  assert.match(h.retryBlocker(fixtures.jobs[4]), /Every dependency/);
  assert.match(h.retryBlocker(fixtureJob('exhausted', 'failed', { retry_count: 3 })), /Three manual retries/);
  assert.doesNotMatch(h.jobActions(fixtures.jobs[2]), /data-action="(?:retry|cancel)-job"/);
  assert.match(h.projectOperations({ ...project, repository_url: '' }), /data-action="start-pipeline"[^>]*disabled/);
  assert.match(h.agentsPage(), /Actual role description/);
  assert.match(h.researchPage(), /52 game references/);
  assert.match(h.researchPage(), /Discovery references, not rankings/);
  h.renderDiscoveryResults();
  assert.equal((elements['#discovery-results'].innerHTML.match(/class="discovery-card"/g) || []).length, 25);
  vm.runInContext("discoveryPageIndex = 2;", context);
  h.renderDiscoveryResults();
  assert.equal((elements['#discovery-results'].innerHTML.match(/class="discovery-card"/g) || []).length, 2);
  vm.runInContext("query = 'Second Studio'; discoveryCategory = 'Puzzle'; discoveryComplexity = 'small_loop_estimate';", context);
  assert.equal(h.discoveryMatches().length, 26);
  h.discoveryIdea('REF-0001');
  assert.equal(context.proposedProject.title, '');
  assert.equal(context.proposedProject.references, undefined);
  assert.equal(context.proposedProject.category, '', 'An unsupported source genre must require an explicit category choice');
  h.originalProjectForm(context.proposedProject);
  assert.match(context.dialog.content, /id="project-category" name="category" required/);
  assert.match(context.dialog.content, /option value="" disabled selected/);
  assert.match(context.proposedProject.summary, /https:\/\/play.google.com/);
  assert.doesNotMatch(context.proposedProject.summary, /REF-0001/);
  assert.doesNotMatch(h.discoveryCard({ ...discovery[0], title: '<img src=x>', developer: '<script>bad</script>', notes: '<svg/onload=alert(1)>' }), /<img|<script|<svg\/onload/);
  const malicious = fixtureJob('escaped', 'failed', { title: '<img src=x onerror=alert(1)>', result: { outcome: 'fail', summary: '<script>alert(1)</script>', artifacts: [{ path: '<svg/onload=alert(1)>', description: '<img src=x>' }], checks: [{ name: '<img src=x>', status: 'fail', details: '<script>bad</script>' }] } });
  const escaped = h.jobCard(malicious);
  assert.doesNotMatch(escaped, /<img|<script/);
  assert.match(escaped, /&lt;img/);
  context.fixture({ ...structuredClone(fixtures), jobs: [malicious] }, catalog);
  h.inspectJob(malicious.id);
  assert.doesNotMatch(context.dialog.content, /<img|<script|<svg\/onload/);
  assert.match(context.dialog.content, /&lt;svg/);
  context.fixture({ ...structuredClone(fixtures), workers: [] }, catalog);
  assert.match(h.operationsPage(), /No workers registered/);
  const legacy = structuredClone(fixtures); delete legacy.jobs; delete legacy.workers; delete legacy.job_roles;
  context.fixture(legacy, catalog);
  assert.match(h.operationsPage(), /Queue not available/);
  assert.match(h.operationsPage(), /data-action="new-job" disabled/);
  console.log('Static UI checks passed: rollout fallback, worker freshness, escaping, dependency/retry limits, repository prerequisite, discovery filters/pagination, original-idea identity separation.');
}

async function browserChecks() {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); }
  catch { if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw new Error('Install Playwright or set CODEX_PRIMARY_RUNTIME_NODE_MODULES to run browser fixtures.'); playwright = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright')); }
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const errors = [], calls = [];
  let state = structuredClone(fixtures);
  const context = await browser.newContext({ viewport: { width: 1366, height: 960 } });
  await context.route('https://studio-fixture.invalid/**', async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    if (method === 'POST') {
      assert.equal(req.headers()['x-csrf-token'], 'fixture-csrf');
      calls.push({ path: url.pathname, body: req.postDataJSON() });
      if (url.pathname === '/api/jobs') { const body = req.postDataJSON(); assert.ok(body.idempotency_key); assert.equal(body.max_attempts, 2); state.jobs.push(fixtureJob('created-one', 'queued', body)); }
      else if (/\/retry$/.test(url.pathname)) { const job = state.jobs.find(j => url.pathname.includes(j.id)); job.status = 'queued'; job.retry_count++; }
      else if (/\/cancel$/.test(url.pathname)) { const job = state.jobs.find(j => url.pathname.includes(j.id)); job.status = 'cancelled'; }
      else if (/\/plan$/.test(url.pathname)) assert.equal(req.postDataJSON().idempotency_key, 'initial');
      else throw new Error('Unexpected mutation ' + url.pathname);
      return route.fulfill({ json: { message: 'Fixture change saved.' } });
    }
    if (url.pathname === '/api/state') return route.fulfill({ json: state });
    if (url.pathname === '/api/catalog') return route.fulfill({ json: catalog });
    if (url.pathname === '/api/docs/worker_setup') return route.fulfill({ json: catalog.documents[0] });
    const assets = { '/': ['cloudflare/public/index.html', 'text/html'], '/assets/app.js': ['cloudflare/public/assets/app.js', 'text/javascript'], '/assets/style.css': ['cloudflare/public/assets/style.css', 'text/css'] };
    if (assets[url.pathname]) { const [file, contentType] = assets[url.pathname]; return route.fulfill({ body: read(file), contentType }); }
    return route.fulfill({ status: 404, json: { error: 'Unknown fixture path' } });
  });
  try {
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://studio-fixture.invalid/#operations');
    await page.getByRole('heading', { name: 'Studio operations', exact: true }).waitFor();
    await page.getByText('1 worker recently seen', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-action="retry-job"][data-id="blocked-one"]').isDisabled(), true);
    await page.locator('[data-action="inspect-job"][data-id="passed-one"]').click();
    await page.getByText('docs/qa/report.md', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal').isVisible(), false);
    await page.getByRole('button', { name: 'Assign a role', exact: true }).click();
    await page.getByLabel('Assignment title').fill('Verify fixture save recovery');
    await page.getByLabel('Scope, acceptance criteria, and evidence').fill('Test interruption and save recovery with reproducible fixture evidence.');
    await page.getByRole('button', { name: 'Queue assignment', exact: true }).click();
    await page.getByRole('heading', { name: 'Verify fixture save recovery', exact: true }).waitFor();
    await page.locator('[data-action="retry-job"][data-id="failed-one"]').click();
    await page.locator('[data-action="cancel-job"][data-id="queued-one"]').click();
    await page.getByRole('button', { name: 'Cancel job', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#modal').open);
    await page.evaluate(() => { location.hash = 'project/project-one'; });
    await page.getByRole('button', { name: 'Start production pipeline', exact: true }).click();
    await page.getByRole('heading', { name: 'Studio operations', exact: true }).waitFor();
    assert.ok(calls.some(c => c.path.endsWith('/plan')));
    assert.ok(calls.some(c => c.path.endsWith('/cancel')));
    assert.ok(calls.some(c => c.path.endsWith('/retry')));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Operations overflows mobile viewport');
    await page.locator('[data-action="inspect-job"][data-id="passed-one"]').click();
    assert.equal(await page.evaluate(() => document.querySelector('#modal').scrollWidth <= document.querySelector('#modal').clientWidth), true, 'Job dialog overflows');
    await page.keyboard.press('Escape');
    state.workers = [];
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.getByText('No workers registered', { exact: true }).waitFor();
    delete state.jobs; delete state.workers; delete state.job_roles;
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.getByText('Queue not available', { exact: true }).waitFor();
    await page.evaluate(() => { location.hash = 'reviews'; });
    await page.getByRole('heading', { name: 'Release reviews', exact: true }).waitFor();
    assert.equal(calls.filter(c => /decision|publication/.test(c.path)).length, 0);
    assert.deepEqual(errors, []);
    const output = process.env.BROWSER_OUTPUT;
    if (output) { fs.mkdirSync(output, { recursive: true }); await page.evaluate(() => { location.hash = 'operations'; }); await page.getByRole('heading', { name: 'Studio operations', exact: true }).waitFor(); await page.screenshot({ path: path.join(output, 'operations-mobile.png'), fullPage: true }); }
    console.log('Offline Chromium fixture checks passed: assignment/plan/retry/cancel CSRF requests, evidence dialog/Escape, mobile width, empty/rollout states, release route unchanged. Not a live backend, worker, OAuth, or production check.');
  } finally { await context.close(); await browser.close(); }
}

staticChecks();
if (!process.argv.includes('--static')) await browserChecks();
