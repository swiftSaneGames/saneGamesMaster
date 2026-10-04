/** Read-only GitHub metadata. Tokens and provider URLs never cross into public state. */
import { AppError, requireThat, sha256, equal } from './security.mjs';

export const GITHUB_ORG = 'swiftSaneGames';
export const GITHUB_FRESH_SECONDS = 900;
const MAX_REPOSITORIES = 500;
const SYNC_LEASE_MS = 75000;
const MESSAGES = Object.freeze({
  github_not_configured: 'Configure the server GitHub secret before syncing.',
  github_credential_changed: 'GitHub credentials changed. Sync to verify current access.',
  github_auth_failed: 'GitHub rejected the server credential. Check its validity and organization access.',
  github_provider_rate_limited: 'GitHub rate-limited the request. Try again after the provider limit resets.',
  github_provider_unavailable: 'GitHub metadata is temporarily unavailable. The previous snapshot was preserved.',
  github_timeout: 'GitHub sync timed out. The previous snapshot was preserved.',
  github_redirect: 'GitHub returned an unexpected redirect. No credentials were forwarded.',
  github_invalid_response: 'GitHub returned invalid or oversized metadata. The previous snapshot was preserved.',
  github_capacity: 'More than 500 repositories are visible. This connector supports 500; no partial snapshot was saved.',
  github_interrupted: 'The previous sync did not finish. Start another sync.',
  github_in_progress: 'A GitHub sync is already in progress.',
  github_sync_superseded: 'This sync was superseded or its credentials changed. Refresh the connection status.'
});
export const githubMessage = code => MESSAGES[code] || MESSAGES.github_provider_unavailable;
function fail(code, status = 502) { throw new AppError(status, githubMessage(code), code); }
export async function githubCredential(env) {
  const token = env.GITHUB_TOKEN;
  const configured = typeof token === 'string' && token.length >= 20 && token.length <= 512 && !/[\s\x00-\x1f\x7f]/.test(token);
  return { configured, hash: configured ? await sha256(token) : '' };
}
function timestamp(value) {
  if (value === null) return null;
  requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)), githubMessage('github_invalid_response'), 502, 'github_invalid_response');
  return new Date(value).toISOString();
}
/** Ignore unrelated owners and construct URLs from validated identities, never provider link fields. */
export function normalizeGitHubRepository(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.owner?.login !== 'string' || value.owner.login.toLowerCase() !== GITHUB_ORG.toLowerCase()) return null;
  const valid = Number.isSafeInteger(value.id) && value.id > 0 && typeof value.name === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(value.name) && value.name !== '.' && value.name !== '..'
    && typeof value.full_name === 'string' && value.full_name.toLowerCase() === (GITHUB_ORG + '/' + value.name).toLowerCase()
    && typeof value.private === 'boolean' && typeof value.archived === 'boolean' && typeof value.disabled === 'boolean'
    && typeof value.default_branch === 'string' && value.default_branch.length >= 1 && value.default_branch.length <= 255 && !/[\x00-\x20\x7f<>"`\\]/.test(value.default_branch);
  requireThat(valid, githubMessage('github_invalid_response'), 502, 'github_invalid_response');
  return { id: value.id, full_name: GITHUB_ORG + '/' + value.name, name: value.name, url: 'https://github.com/' + GITHUB_ORG + '/' + value.name,
    private: value.private, archived: value.archived, disabled: value.disabled, default_branch: value.default_branch,
    pushed_at: timestamp(value.pushed_at), updated_at: timestamp(value.updated_at) };
}
async function boundedJSON(response, maxBytes, signal) {
  const advertised = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised > maxBytes) fail('github_invalid_response');
  const reader = response.body?.getReader();
  if (!reader) fail('github_invalid_response');
  const chunks = []; let total = 0;
  try {
    for (;;) {
      if (signal.aborted) fail('github_timeout', 504);
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); fail('github_invalid_response'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('github_invalid_response'); }
}
/** Test injection permits only a fetch implementation and a shorter timeout, never custom URLs. */
export async function fetchGitHubRepositories(token, providerFetch, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 30000));
  const request = async (path, maxBytes) => {
    let response;
    try {
      response = await providerFetch('https://api.github.com' + path, { method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'SaneGames-Studio-Metadata' } });
    } catch { fail(controller.signal.aborted ? 'github_timeout' : 'github_provider_unavailable', controller.signal.aborted ? 504 : 502); }
    if (response.status >= 300 && response.status < 400) fail('github_redirect');
    if (response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))) fail('github_provider_rate_limited');
    if ([401, 403, 404].includes(response.status)) fail('github_auth_failed');
    if (response.status !== 200) fail('github_provider_unavailable');
    try { return { value: await boundedJSON(response, maxBytes, controller.signal), next: /(?:^|,)\s*<[^>]+>\s*;\s*rel="next"/.test(response.headers.get('link') || '') }; }
    catch (error) { if (error instanceof AppError) throw error; fail(controller.signal.aborted ? 'github_timeout' : 'github_invalid_response', controller.signal.aborted ? 504 : 502); }
  };
  try {
    const { value: identity } = await request('/user', 65536);
    if (!identity || !Number.isSafeInteger(identity.id) || identity.id <= 0 || typeof identity.login !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(identity.login)) fail('github_auth_failed');
    const repositories = [], ids = new Set(), names = new Set(); let observed = 0;
    for (let page = 1; page <= 6; page++) {
      const { value, next } = await request('/orgs/' + GITHUB_ORG + '/repos?type=all&sort=full_name&direction=asc&per_page=100&page=' + page, 2 * 1024 * 1024);
      if (!Array.isArray(value) || value.length > 100) fail('github_invalid_response');
      observed += value.length;
      if (observed > MAX_REPOSITORIES) fail('github_capacity');
      for (const item of value) {
        const repository = normalizeGitHubRepository(item); if (!repository) continue;
        if (ids.has(repository.id) || names.has(repository.full_name.toLowerCase())) fail('github_invalid_response');
        ids.add(repository.id); names.add(repository.full_name.toLowerCase()); repositories.push(repository);
      }
      if (value.length < 100 && !next) {
        const serialized = JSON.stringify(repositories);
        if (serialized.includes(token) || serialized.includes(JSON.stringify(token).slice(1, -1))) fail('github_invalid_response');
        return repositories.sort((a, b) => a.full_name.localeCompare(b.full_name));
      }
      if (page === 6) fail('github_capacity');
    }
    fail('github_capacity');
  } finally { clearTimeout(timer); }
}

/** Transactions remain synchronous; all remote reads finish outside the Durable Object. */
export class GitHubSnapshot {
  constructor(store) {
    this.store = store;
    store.sql.exec('CREATE TABLE IF NOT EXISTS github_snapshot (id TEXT PRIMARY KEY, data TEXT NOT NULL);');
  }
  read() { const row = this.store.row('SELECT data FROM github_snapshot WHERE id=?', 'studio'); return row ? JSON.parse(row.data) : {}; }
  save(value) { this.store.sql.exec('INSERT INTO github_snapshot(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', 'studio', JSON.stringify(value)); }
  view(credential) {
    const data = this.read(), now = Date.now(), sameSuccess = credential.configured && equal(data.credential_hash, credential.hash), sameAttempt = credential.configured && equal(data.attempt_hash, credential.hash);
    let status = 'unverified', errorCode = null;
    if (!credential.configured) status = 'not_configured';
    else if (sameAttempt && data.active_until > now) status = 'syncing';
    else if (sameAttempt && (data.error_code || data.active_until)) { status = 'error'; errorCode = data.error_code || 'github_interrupted'; }
    else if (sameSuccess) status = now - Date.parse(data.last_synced_at) < GITHUB_FRESH_SECONDS * 1000 ? 'connected' : 'stale';
    else if (data.credential_hash || data.attempt_hash) errorCode = 'github_credential_changed';
    return { configured: credential.configured, status, last_synced_at: sameSuccess ? data.last_synced_at : null,
      last_attempt_at: sameAttempt ? data.last_attempt_at : null, error: errorCode ? githubMessage(errorCode) : null, error_code: errorCode,
      repositories: sameSuccess ? data.repositories : [], read_only: true, freshness_seconds: GITHUB_FRESH_SECONDS, scope: 'token_visible_swiftSaneGames_repositories' };
  }
  begin(payload, credential, actor) {
    if (!credential.configured) fail('github_not_configured', 503);
    requireThat(equal(payload.credential_hash, credential.hash), githubMessage('github_sync_superseded'), 409, 'github_sync_superseded');
    const data = this.read();
    requireThat(!data.active_until || data.active_until <= Date.now() || !equal(data.attempt_hash, credential.hash), githubMessage('github_in_progress'), 409, 'github_in_progress');
    data.generation = crypto.randomUUID(); data.active_until = Date.now() + SYNC_LEASE_MS; data.attempt_hash = credential.hash;
    data.last_attempt_at = new Date().toISOString(); data.error_code = null; this.save(data);
    this.store.log(actor, 'github_sync_started', 'studio'); return { generation: data.generation };
  }
  finish(payload, credential, actor) {
    const data = this.read();
    requireThat(credential.configured && equal(payload.credential_hash, credential.hash) && equal(data.attempt_hash, credential.hash) && data.generation === payload.generation && data.active_until > Date.now(), githubMessage('github_sync_superseded'), 409, 'github_sync_superseded');
    data.active_until = null;
    if (payload.error_code) {
      data.error_code = Object.hasOwn(MESSAGES, payload.error_code) ? payload.error_code : 'github_provider_unavailable';
      this.store.log(actor, 'github_sync_failed', 'studio', { code: data.error_code });
    } else {
      requireThat(Array.isArray(payload.repositories) && payload.repositories.length <= MAX_REPOSITORIES, githubMessage('github_invalid_response'), 502, 'github_invalid_response');
      data.repositories = payload.repositories; data.credential_hash = credential.hash; data.last_synced_at = new Date().toISOString(); data.error_code = null;
      this.store.log(actor, 'github_sync_succeeded', 'studio', { repository_count: data.repositories.length });
    }
    this.save(data); return { github: this.view(credential) };
  }
}
