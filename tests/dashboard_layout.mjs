/** Redesign regression using synthetic state. Pass --static for dependency-free checks.
 * CHROMIUM_PATH=/path/to/chromium BROWSER_OUTPUT=/tmp/preview node tests/dashboard_layout.mjs
 * No production requests, login or worker execution occur.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import research from '../cloudflare/generated/research.mjs';
const root = path.resolve(import.meta.dirname, '..');
const script=fs.readFileSync(root+'/cloudflare/public/assets/app.js','utf8');
const roles=JSON.parse(fs.readFileSync(root+'/agents/registry.json','utf8')).roles.map(r=>({...r,content:'Fixture prompt'}));
const elements={'#agent-results':{},'#agent-count':{},'#jobs-list':{},'#job-count':{}};
const context=vm.createContext({ URL,Date,Intl,crypto: {randomUUID:()=> 'fixture-id'},document:{querySelector:s=>elements[s]||null,querySelectorAll:()=>[]} });
vm.runInContext(script.slice(0,script.indexOf("document.addEventListener('click'"))+`
globalThis.fixture=(d,c)=>{data=d;catalog=c;};
globalThis.helpers={matchingAgents,agentCard,agentsPage,overview,renderAgents,renderJobs,newJobModal,progressEvents};
modal=(title,subtitle,content)=>{globalThis.dialog={title,subtitle,content};};
`,context);
const state={projects:[],jobs:[],workers:[],job_roles:roles.map(r=>r.id),tasks:[],releases:[],events:[]};
const catalog={roles,documents:[],games:[],concepts:[]};
context.fixture(state,catalog);
assert.equal(context.helpers.matchingAgents().length,29);
assert.match(context.helpers.agentsPage(),/data-page="handbook"/);
assert.match(context.helpers.agentsPage(),/<strong>8<\/strong> departments/);
vm.runInContext("agentDepartment='engineering'",context);
assert.equal(context.helpers.matchingAgents().length,6);
vm.runInContext("agentQuery='save';agentDepartment=''",context);
assert.ok(context.helpers.matchingAgents().some(r=>r.id==='save-systems-engineer'));
vm.runInContext("agentQuery='unknown-role-xyz'",context);
context.helpers.renderAgents();
assert.match(elements['#agent-results'].innerHTML,/No roles found/);
assert.equal(elements['#agent-count'].textContent,'0 of 29 roles');
vm.runInContext("agentQuery=''",context);
const injected=context.helpers.agentCard({...roles[0],id:'studio-<script>x</script>',description:'<img src=x onerror=alert(1)>',parent:'<svg onload=alert(1)>'});
assert.doesNotMatch(injected,/<script|<img src=x|<svg onload/);
assert.match(injected,/&lt;img/);
assert.match(context.helpers.overview(),/Set up production/);
assert.doesNotMatch(context.helpers.overview(),/data-action="project"/);
const project={id:'p1',title:'Original Garden',stage:'building',category:'Puzzle',repository_url:'https://github.com/example/game'};
state.projects=[project];state.jobs=[{id:'j1',role:'studio-developer',project_id:'p1',title:'Implement game',status:'running'},{id:'j2',role:'studio-qa',project_id:'p1',title:'Verify game',status:'queued'}];
assert.match(context.helpers.agentCard(roles.find(r=>r.id==='studio-developer')),/1 running/);
assert.match(context.helpers.agentCard(roles.find(r=>r.id==='studio-developer')),/data-action="assign-role"/);
vm.runInContext("jobRoleFilter='studio-qa'",context);
context.helpers.renderJobs();
assert.equal(elements['#job-count'].textContent,'1 job');
assert.match(elements['#jobs-list'].innerHTML,/Verify game/);
assert.doesNotMatch(elements['#jobs-list'].innerHTML,/Implement game/);
context.helpers.newJobModal('p1','studio-qa');
assert.match(context.dialog.content,/<option value="studio-qa" selected>/);
assert.match(context.helpers.overview(),/Original Garden/);
assert.match(context.helpers.overview(),/1 \/ 2 jobs succeeded|0 \/ 2 jobs succeeded/);
const progressAt = new Date().toISOString();
state.jobs[0].progress_history = [{ summary: 'Older checkpoint', reported_at: progressAt }, { summary: 'Newest checkpoint', reported_at: progressAt }];
assert.equal(context.helpers.progressEvents('p1')[0].update.summary, 'Newest checkpoint', 'Same-second progress must retain newest stored order');
console.log('Dashboard redesign behavior checks passed: actual 29-role/8-department mapping, search, empty filter, safe rendering, truthful empty overview, job-derived role state, role assignment preselection and job filtering.');

async function browserChecks() {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); }
  catch { playwright = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || '', 'playwright')); }
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const output = process.env.BROWSER_OUTPUT;
  if (output) fs.mkdirSync(output, { recursive: true });
  const now = new Date().toISOString(), errors = [], mutations = [], unexpected = [];
  const browserState = {
    user: { name: 'Fixture Owner', email: 'fixture@example.invalid', csrf: 'fixture-csrf' },
    projects: [
      { ...project, id: 'p1', title: 'Little Orchard', summary: 'Synthetic project: a calm harvesting puzzle.', updated_at: now },
      { ...project, id: 'p2', title: 'Pocket Paper Town', stage: 'design', category: 'Business simulation', summary: 'Synthetic project: build a cozy paper village.', updated_at: now },
    ],
    jobs: [
      { id: 'j1', project_id: 'p1', role: 'studio-developer', title: 'Build the harvesting loop', status: 'running', worker_id: 'fixture-mac', lease_expires_at: new Date(Date.now() + 60000).toISOString(), progress: { update_id: 'fixture-step', phase: 'executing', summary: 'Implemented harvesting input; preparing the save recovery checks.', completed: ['Harvest input connected to game state'], next_step: 'Run save recovery checks.', blocker: '', reported_at: now, worker_id: 'fixture-mac', fence: 1, source: 'worker_reported_not_independently_verified' } },
      { id: 'j2', project_id: 'p1', role: 'studio-qa', title: 'Verify save interruption recovery', status: 'queued' },
      { id: 'j3', project_id: 'p2', role: 'studio-designer', title: 'Define the first five levels', status: 'succeeded', result: { outcome: 'pass', summary: 'Synthetic design handoff.', checks: [], artifacts: [] } },
      { id: 'j4', project_id: 'p2', role: 'studio-art-ux', title: 'Review the touch targets', status: 'blocked', blocked_reason: 'Fixture blocker: awaiting the design handoff.' },
    ].map(j => ({ attempts: 1, max_attempts: 2, retry_count: 0, dependencies: [], instructions: 'Synthetic assignment only.', updated_at: now, ...j })),
    workers: [{ id: 'fixture-mac', name: 'Fixture Mac', capabilities: ['studio-developer', 'studio-qa'], last_seen_at: now, online: true }],
    job_roles: roles.map(r => r.id), job_queue: { progress_updates: true }, tasks: [], releases: [], pins: [],
    events: [{ event: 'project_created', actor: 'Fixture Owner', at: now }, { event: 'job_queued', actor: 'Fixture coordinator', at: now }],
    integrations: { agent_intake: false }, allowed_emails: ['fixture@example.invalid'], hosting: 'Synthetic UI fixture', app_origin: 'https://studio-fixture.invalid',
  };
  const browserCatalog = {
    roles: roles.map(r => ({ ...r, file: r.prompt, content: fs.readFileSync(path.join(root, 'agents/COMMON.md'), 'utf8') + '\n\n' + fs.readFileSync(path.join(root, r.prompt), 'utf8') })),
    documents: research.documents,
    games: research.games, discovery_games: research.discoveryGames, concepts: research.concepts, studios: research.studios,
  };
  await browserContext.route('**/*', async intercepted => {
    const request = intercepted.request(), url = new URL(request.url());
    if (url.origin !== 'https://studio-fixture.invalid') { unexpected.push(url.origin); return intercepted.abort(); }
    if (request.method() !== 'GET') { mutations.push(url.pathname); return intercepted.fulfill({ status: 500, json: { error: 'No mutations belong in this layout fixture.' } }); }
    if (url.pathname === '/api/state') return intercepted.fulfill({ json: browserState });
    if (url.pathname === '/api/catalog') return intercepted.fulfill({ json: browserCatalog });
    if (url.pathname.startsWith('/api/docs/')) { const document = browserCatalog.documents.find(d => d.id === url.pathname.split('/').pop()); return intercepted.fulfill({ status: document ? 200 : 404, json: document || { error: 'Missing fixture document' } }); }
    if (url.pathname === '/auth/status') return intercepted.fulfill({ json: { ready: true, configured: true, mode: 'authorization_code' } });
    const assets = { '/': 'index.html', '/login': 'login.html', '/privacy': 'privacy.html', '/assets/app.js': 'assets/app.js', '/assets/style.css': 'assets/style.css', '/assets/login.js': 'assets/login.js', '/assets/google-login.css': 'assets/google-login.css', '/assets/studio-mascot.png': 'assets/studio-mascot.png' };
    if (!Object.hasOwn(assets, url.pathname)) { unexpected.push(url.pathname); return intercepted.fulfill({ status: 404, body: 'Unknown fixture route' }); }
    const filename = assets[url.pathname], types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    return intercepted.fulfill({ body: fs.readFileSync(path.join(root, 'cloudflare/public', filename)), contentType: types[path.extname(filename)] });
  });
  try {
    const page = await browserContext.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const noOverflow = async label => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label} overflows its viewport`);
    const screenshot = async name => {
      if (!output) return;
      await page.locator('#toast').waitFor({ state: 'hidden' });
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
      await page.screenshot({ path: path.join(output, name + '.png'), fullPage: !name.startsWith('agents-') });
    };
    const go = async routeName => { await page.goto('https://studio-fixture.invalid/#' + routeName); await page.locator('main h1').waitFor(); await page.waitForFunction(() => !document.querySelector('.loading')); await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); };
    await go('agents');
    assert.equal(await page.locator('.role-card').count(), 29);
    assert.equal(await page.locator('#agent-count').textContent(), '29 of 29 roles');
    assert.equal(await page.locator('img[src="/assets/studio-mascot.png"]').first().evaluate(img => img.complete && img.naturalWidth === 60), true);
    await noOverflow('Desktop agents'); await screenshot('agents-desktop');
    await page.evaluate(() => { window.scrollTo({ top: 400, behavior: 'instant' }); document.querySelector('[data-action="refresh"]').click(); });
    await page.getByText('Workspace refreshed.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.scrollY), 400, 'A status refresh must preserve the reading position');
    await page.locator('[data-action="agent-department"][data-id="engineering"]').click();
    assert.equal(await page.locator('.role-card').count(), 6);
    assert.equal(await page.locator('[data-id="engineering"]').getAttribute('aria-pressed'), 'true');
    await page.getByLabel('Search agent roles or responsibilities').fill('save');
    assert.equal(await page.locator('.role-card').count(), 1);
    await page.getByRole('heading', { name: 'Save Systems Engineer', exact: true }).waitFor();
    await page.getByLabel('Search agent roles or responsibilities').fill('unknown-role-xyz');
    await page.getByRole('heading', { name: 'No roles found' }).waitFor();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    assert.equal(await page.locator('.role-card').count(), 29);
    await page.getByRole('button', { name: 'Assign Developer', exact: true }).click();
    assert.equal(await page.locator('#job-role').inputValue(), 'studio-developer');
    await page.keyboard.press('Escape');
    await page.locator('[data-action="role"][data-id="studio-developer"]').filter({ hasText: 'Read role prompt' }).click();
    await page.getByRole('button', { name: 'Copy complete prompt', exact: true }).waitFor();
    assert.match(await page.locator('.doc-reader').textContent(), /Shared execution contract/);
    await page.keyboard.press('Escape');
    await page.locator('[data-action="role-jobs"][data-id="studio-developer"]').click();
    await page.getByRole('heading', { name: 'Work queue', exact: true }).waitFor();
    await page.waitForFunction(() => window.scrollY === 0);
    assert.equal(await page.locator('#job-role-filter').inputValue(), 'studio-developer');
    assert.equal(await page.locator('.job-card').count(), 1);
    await go('overview'); await noOverflow('Desktop overview'); await screenshot('overview-desktop');
    await page.getByText('Implemented harvesting input; preparing the save recovery checks.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)');
    assert.equal(await page.locator('.studio-hero,.agents-header,.hero').count(), 0, 'No promotional hero belongs in production');
    assert.equal(await page.locator('.production-project').count(), 2);
    for (const routeName of ['pipeline', 'reviews', 'workers', 'operations', 'research', 'studios', 'maintenance', 'handbook', 'activity', 'settings', 'project/p1']) { await go(routeName); await noOverflow('Desktop ' + routeName); }
    await go('overview');
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow('Mobile overview'); await screenshot('overview-mobile');
    await go('agents'); await noOverflow('Mobile agents'); await screenshot('agents-mobile');
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    assert.equal(await page.locator('#menu-button').getAttribute('aria-expanded'), 'true');
    await page.locator('#nav a[href="#operations"]').click();
    await page.getByRole('heading', { name: 'Work queue', exact: true }).waitFor();
    assert.equal(await page.locator('#menu-button').getAttribute('aria-expanded'), 'false');
    await noOverflow('Mobile operations');
    for (const routeName of ['pipeline', 'reviews', 'workers', 'research', 'studios', 'maintenance', 'handbook', 'activity', 'settings', 'project/p1']) { await go(routeName); await noOverflow('Mobile ' + routeName); }
    await go('workers'); await screenshot('workers-mobile');
    await page.goto('https://studio-fixture.invalid/login');
    await page.getByRole('heading', { name: 'Sign in to your studio', exact: true }).waitFor();
    await noOverflow('Mobile login'); await screenshot('login-mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await noOverflow('Desktop login'); await screenshot('login-desktop');
    assert.deepEqual(mutations, []);
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    console.log('Offline Chromium redesign checks passed: 29 real role definitions, search/department/clear controls, role assignment preselection, prompt modal, role job navigation, 1440px/390px layouts, navigation, mascot and login. Synthetic data only; no live login, mutation or deployment.');
  } finally { await browserContext.close(); await browser.close(); }
}

if (!process.argv.includes('--static')) await browserChecks();
