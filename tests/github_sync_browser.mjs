/** Read-only GitHub sync UI regression with isolated synthetic responses.
 * node tests/github_sync_browser.mjs --static
 * CHROMIUM_PATH=/path/to/chromium node tests/github_sync_browser.mjs
 * No real GitHub, deployment, authentication or repository mutation is performed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = path.resolve(import.meta.dirname, '..');
const script = fs.readFileSync(path.join(root, 'cloudflare/public/assets/app.js'), 'utf8');
const now = new Date().toISOString();
const repo = (name, extra = {}) => ({ id: name, full_name: `swiftSaneGames/${name}`, name, url: `https://github.com/swiftSaneGames/${name}`, private: true, archived: false, disabled: false, default_branch: 'main', pushed_at: now, updated_at: now, ...extra });
const repositories = [repo('orchard-game'), repo('public-game', { private: false }), repo('archived-game', { archived: true }), repo('disabled-game', { disabled: true }), repo('saneGamesMaster'), repo('.github'), repo('wrong-org', { full_name: 'other/wrong-org', url: 'https://github.com/other/wrong-org' }), repo('unsafe', { url: 'https://example.invalid/swiftSaneGames/unsafe' })];
const github = { configured: true, status: 'unverified', repositories: [], last_synced_at: null, last_attempt_at: null, error: null, freshness_seconds: 900, read_only: true, scope: 'token_visible_swiftSaneGames_repositories' };
const baseState = { user: { name: 'Fixture Owner', email: 'fixture@example.invalid', csrf: 'fixture-csrf' }, projects: [], tasks: [], releases: [], events: [], pins: [], jobs: [], workers: [], job_roles: [], integrations: { agent_intake: false, github_sync: false }, allowed_emails: ['fixture@example.invalid'], hosting: 'Isolated fixture', app_origin: 'https://studio-fixture.invalid', github };
const catalog = { roles: [], games: [], studios: [], discovery_games: [], concepts: [], documents: [{ id: 'github_sync', title: 'GitHub synchronization', file: 'docs/GITHUB_SYNC.md', content: '# GitHub setup\nConfigure the read-only service credential.' }] };
function staticChecks() {
  const context = vm.createContext({ URL, Date, Intl, document: { querySelector: () => null } });
  vm.runInContext(script.slice(0, script.indexOf("document.addEventListener('click'")) + `\nglobalThis.fixture=(d,c)=>{data=d;catalog=c;};globalThis.h={githubSnapshot,selectableGithubRepositories,githubSettingsPanel,githubRepositoryPicker,repositoryMetadata};`, context);
  const state = structuredClone(baseState); context.fixture(state, catalog);
  assert.equal(context.h.githubSnapshot().label, 'Ready to verify');
  state.github.configured = false; assert.equal(context.h.githubSnapshot().label, 'Setup required');
  assert.match(context.h.githubSettingsPanel(), /data-action="github-sync" disabled/);
  state.github = { ...github, status: 'connected', last_synced_at: now, repositories };
  assert.equal(context.h.githubSnapshot().label, 'Connected');
  assert.equal(context.h.selectableGithubRepositories().length, 1);
  assert.equal(context.h.selectableGithubRepositories()[0].name, 'orchard-game');
  assert.match(context.h.githubRepositoryPicker(repositories[0].url), /orchard-game" selected/);
  assert.match(context.h.githubRepositoryPicker(repositories[0].url + '.git/'), /orchard-game" selected/);
  state.github.last_synced_at = new Date(Date.now() - 16 * 60000).toISOString();
  assert.equal(context.h.githubSnapshot().label, 'Cached data is stale');
  state.github.status = 'error'; state.github.error = '<img src=x onerror=alert(1)>';
  assert.match(context.h.githubSettingsPanel(), /&lt;img/); assert.doesNotMatch(context.h.githubSettingsPanel(), /<img src=x/);
  assert.equal(context.h.selectableGithubRepositories().length, 1, 'Same-credential failure preserves usable cached choices with a warning');
  assert.match(context.h.repositoryMetadata({ repository_url: 'https://github.com/swiftSaneGames/not-selected' }), /absence from the cached selection does not prove/);
  assert.match(context.h.repositoryMetadata({ repository_url: repositories[0].url }), /Latest push reported by GitHub/);
  delete state.github; assert.equal(context.h.githubSnapshot().label, 'Service unavailable');
  console.log('GitHub UI static checks passed: truthful connection states, scope filtering, stale/error cache, escaping, unknown manual links and metadata-only claims.');
}
async function browserChecks() {
  const require = createRequire(import.meta.url); let playwright;
  try { playwright = require('playwright'); } catch { playwright = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || '', 'playwright')); }
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  let state = structuredClone(baseState), syncMode = 'success', syncs = 0, holdNextState = false, releaseHeldState;
  let announceHeldState; const heldStateStarted = new Promise(resolve => { announceHeldState = resolve; });
  const mutations = [], outbound = [], errors = [];
  if (process.env.BROWSER_OUTPUT) fs.mkdirSync(process.env.BROWSER_OUTPUT, { recursive: true });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== baseState.app_origin) { outbound.push(req.url()); return route.abort(); }
    if (req.method() === 'POST') {
      assert.equal(req.headers()['x-csrf-token'], 'fixture-csrf');
      mutations.push({ path: url.pathname, body: req.postDataJSON() });
      if (url.pathname === '/api/github/sync') {
        syncs++;
        assert.deepEqual(req.postDataJSON(), {});
        state.github.last_attempt_at = new Date().toISOString();
        if (syncMode === 'error') { state.github.status = 'error'; state.github.error = 'Fixture GitHub permission denied.'; return route.fulfill({ status: 502, json: { error: state.github.error } }); }
        state.github = { ...github, status: 'connected', repositories: structuredClone(repositories), last_attempt_at: new Date().toISOString(), last_synced_at: new Date().toISOString() };
        state.integrations.github_sync = true;
        return route.fulfill({ json: { github: state.github } });
      }
      if (url.pathname === '/api/projects') {
        const body = req.postDataJSON(), project = { ...body, id: 'created-game', stage: 'research', updated_at: new Date().toISOString() };
        state.projects.push(project); return route.fulfill({ status: 201, json: { project } });
      }
      throw new Error('Unexpected mutation ' + url.pathname);
    }
    if (url.pathname === '/api/state') { const snapshot = structuredClone(state); if (holdNextState) { holdNextState = false; await new Promise(resolve => { releaseHeldState = resolve; announceHeldState(); }); } return route.fulfill({ json: snapshot }); }
    if (url.pathname === '/api/catalog') return route.fulfill({ json: catalog });
    if (url.pathname === '/api/docs/github_sync') return route.fulfill({ json: catalog.documents[0] });
    const assets = { '/': 'index.html', '/assets/app.js': 'assets/app.js', '/assets/style.css': 'assets/style.css', '/assets/studio-mascot.png': 'assets/studio-mascot.png' };
    if (!assets[url.pathname]) throw new Error('Unexpected fixture route ' + url.pathname);
    const name = assets[url.pathname], types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    return route.fulfill({ body: fs.readFileSync(path.join(root, 'cloudflare/public', name)), contentType: types[path.extname(name)] });
  });
  try {
    const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
    const nav = async name => { await page.evaluate(value => { location.hash = value; }, name); await page.locator('main h1').waitFor(); };
    await page.goto(baseState.app_origin + '/#settings');
    await page.getByText('Ready to verify', { exact: true }).waitFor();
    assert.equal(syncs, 0, 'Opening settings must not fetch GitHub implicitly');
    await page.getByRole('button', { name: 'GitHub setup guide', exact: true }).click();
    await page.locator('.doc-reader').getByText('Configure the read-only service credential.').waitFor();
    await page.keyboard.press('Escape');
    holdNextState = true;
    await page.locator('[data-action="refresh"]').click();
    await heldStateStarted;
    const syncResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/github/sync');
    await page.getByRole('button', { name: 'Sync repositories', exact: true }).click();
    await syncResponse;
    releaseHeldState();
    await page.locator('.github-settings').getByText('Connected', { exact: true }).waitFor();
    assert.match(await page.locator('.github-settings').textContent(), /8 total · 1 private, active game choices/, 'A held older state response must not overwrite the successful sync');
    assert.equal(syncs, 1);
    if (process.env.BROWSER_OUTPUT) await page.screenshot({ path: path.join(process.env.BROWSER_OUTPUT, 'github-settings-desktop.png'), fullPage: true });
    await nav('pipeline'); await page.getByRole('button', { name: 'New game', exact: true }).first().click();
    await page.getByLabel('Working title').fill('Orchard Game');
    await page.getByLabel('Distinctive gameplay & content scope').fill('An original orchard puzzle with a calm harvesting loop.');
    assert.equal(await page.locator('#project-github-repo option').count(), 2, 'Only one eligible game choice plus manual URL option');
    await page.getByLabel('Choose from GitHub').selectOption(repositories[0].url);
    assert.equal(await page.locator('#project-repo').inputValue(), repositories[0].url);
    if (process.env.BROWSER_OUTPUT) await page.screenshot({ path: path.join(process.env.BROWSER_OUTPUT, 'github-picker-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Refresh repository list', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh repository list', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('[data-action="github-sync"]').disabled);
    assert.equal(await page.getByLabel('Working title').inputValue(), 'Orchard Game');
    assert.equal(await page.getByLabel('Distinctive gameplay & content scope').inputValue(), 'An original orchard puzzle with a calm harvesting loop.');
    assert.equal(await page.locator('#project-repo').inputValue(), repositories[0].url, 'Refreshing options preserves the selected URL');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('heading', { name: 'Orchard Game', exact: true }).waitFor();
    assert.equal(mutations.find(m => m.path === '/api/projects').body.repository_url, repositories[0].url);
    await page.locator('.repository-metadata').getByText('main', { exact: true }).waitFor();
    assert.equal(syncs, 2, 'Opening a game reads cached metadata without an implicit sync');
    state.github.status = 'stale'; state.github.last_synced_at = new Date(Date.now() - 20 * 60000).toISOString();
    await page.locator('[data-action="refresh"]').click();
    await page.getByText('Cached data is stale', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Edit game', exact: true }).click();
    await page.getByLabel('Working title').fill('Unsaved manual draft');
    await page.locator('#project-repo').fill('https://github.com/swiftSaneGames/not-selected');
    assert.equal(await page.locator('#project-github-repo').inputValue(), '');
    syncMode = 'error';
    await page.getByRole('button', { name: 'Refresh repository list', exact: true }).click();
    await page.locator('#github-repository-picker').getByText('Sync failed', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Working title').inputValue(), 'Unsaved manual draft');
    assert.equal(await page.locator('#project-repo').inputValue(), 'https://github.com/swiftSaneGames/not-selected');
    assert.equal(await page.locator('#project-github-repo option').count(), 2, 'Error state retains cached choices');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.querySelector('#modal').scrollWidth <= document.querySelector('#modal').clientWidth), true, 'GitHub picker must fit the mobile dialog');
    if (process.env.BROWSER_OUTPUT) await page.screenshot({ path: path.join(process.env.BROWSER_OUTPUT, 'github-picker-mobile.png'), fullPage: true });
    await page.keyboard.press('Escape');
    state.github = { ...github, configured: false, status: 'not_configured', repositories: [] };
    await nav('settings'); await page.locator('[data-action="refresh"]').click();
    await page.getByText('Setup required', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Sync repositories', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Settings must fit mobile width');
    if (process.env.BROWSER_OUTPUT) { await page.screenshot({ path: path.join(process.env.BROWSER_OUTPUT, 'github-settings-setup-mobile.png'), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: path.join(process.env.BROWSER_OUTPUT, 'github-settings-setup-desktop.png'), fullPage: true }); }
    await nav('pipeline'); await page.getByRole('button', { name: 'New game', exact: true }).first().click();
    assert.equal(await page.locator('#project-github-repo').isDisabled(), true);
    assert.equal(await page.locator('#project-repo').isEnabled(), true, 'Manual URL remains available without a configured connector');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    assert.ok(mutations.every(m => ['/api/github/sync', '/api/projects'].includes(m.path)), 'Sync flow must not queue, approve or publish');
    console.log('GitHub UI browser checks passed: Settings sync, CSRF, eligible picker, selected URL submission, cache-only views, metadata, delayed older-snapshot race, draft-preserving refresh/error, stale/setup states and mobile fallback. Synthetic API fixtures; no live connection claimed.');
  } finally { await context.close(); await browser.close(); }
}
staticChecks();
if (!process.argv.includes('--static')) await browserChecks();
