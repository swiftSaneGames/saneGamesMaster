import research from '../generated/research.mjs';
import { StudioStore } from './store.mjs';
import { AppError, requireThat, json, random, sha256, challenge, canonical, cookies, cookie, equal, readJSON, verifyGoogle, allowlist, origin } from './security.mjs';
import { manifestInput } from './models.mjs';
import { googleStatus, googleLoginHeaders, createGoogleID } from './google-id.mjs';
export { StudioStore };
const SESSION = '__Host-sg-session', OAUTH = '__Host-sg-oauth';
const publicAssets = new Set(['/assets/style.css', '/assets/app.js', '/assets/login.js', '/assets/google-login.css']);
const secureHeaders = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
function secure(response) { const r = new Response(response.body, response); for (const [k, v] of Object.entries(secureHeaders)) r.headers.set(k, v); return r; }
const redirect = (location, extra = {}) => new Response(null, { status: 303, headers: { Location: location, ...extra } });
const configured = env => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && allowlist(env).length);
async function call(env, op, payload = {}, session_hash = '', csrf = '', agent = false) {
  requireThat(env.STUDIO, 'Cloudflare storage binding is unavailable', 503);
  const stub = env.STUDIO.get(env.STUDIO.idFromName('sanegames-primary-v1'));
  const r = await stub.fetch('https://studio.internal/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, payload, session_hash, csrf, agent }) });
  const data = await r.json(); if (!r.ok) throw new AppError(r.status, data.error || 'Studio operation failed', data.code); return data;
}
/** Dependency injection is for tests only. Production always uses the platform fetch. */
export function createHandler(providerFetch = (...args) => fetch(...args)) {
  const googleID = createGoogleID(providerFetch);
  let keyCache = null, keysUntil = 0;
  async function keys(force = false) {
    if (!force && keyCache && keysUntil > Date.now()) return keyCache;
    const r = await providerFetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(10000), redirect: 'error' });
    requireThat(r.ok, 'Google signing keys are unavailable', 502);
    const value = await r.json(); requireThat(Array.isArray(value.keys) && value.keys.length <= 10, 'Invalid Google keys', 502);
    keyCache = value; keysUntil = Date.now() + 3600000; return value;
  }
  return { async fetch(request, env) {
    let url;
    try {
      url = new URL(request.url); const appOrigin = origin(env);
      if (url.protocol !== 'https:' || url.origin !== appOrigin) {
        requireThat(['GET', 'HEAD'].includes(request.method), 'Use the configured HTTPS application origin', 403);
        // Do not forward an OAuth code or other sensitive query to another origin.
        return secure(new Response(null, { status: 308, headers: { Location: appOrigin + (url.pathname.startsWith('/auth/') ? '/login' : url.pathname) } }));
      }
      const path = url.pathname, method = request.method, jar = cookies(request);
      if (method === 'GET' && path === '/healthz') return secure(json({ status: 'ok', component: 'cloudflare-native-worker', version: '0.2.0' }));
      if (method === 'GET' && path === '/auth/status') return secure(json(googleStatus(env)));
      if (method === 'GET' && publicAssets.has(path)) return secure(await env.ASSETS.fetch(request));
      if (method === 'GET' && ['/login', '/privacy'].includes(path)) {
        const page = secure(await env.ASSETS.fetch(new Request(appOrigin + (path === '/login' ? '/login.html' : '/privacy.html'))));
        return path === '/login' ? googleLoginHeaders(page) : page;
      }
      if (path.startsWith('/auth/') || path.startsWith('/api/intake/')) {
        const key = await sha256((request.headers.get('CF-Connecting-IP') || 'unknown') + ':' + (path.startsWith('/auth/') ? 'auth' : 'intake'));
        await call(env, 'rate', { key, limit: 30 });
      }
      if (method === 'POST' && path === '/auth/google/prepare') return secure(await googleID.prepare(request, env, call));
      if (method === 'POST' && path === '/auth/google/credential') return secure(await googleID.complete(request, env, call));
      if (method === 'GET' && path === '/auth/google') {
        requireThat(configured(env), 'Google sign-in requires its Cloudflare secrets', 503, 'sso_not_configured');
        const state = random(), nonce = random(), verifier = random(48);
        await call(env, 'oauth_create', { id: await sha256(state), data: { nonce, verifier } });
        const query = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: appOrigin + '/auth/google/callback', response_type: 'code', scope: 'openid email profile', state, nonce, prompt: 'select_account', code_challenge: await challenge(verifier), code_challenge_method: 'S256' });
        return secure(redirect('https://accounts.google.com/o/oauth2/v2/auth?' + query, { 'Set-Cookie': cookie(OAUTH, state, 600) }));
      }
      if (method === 'GET' && path === '/auth/google/callback') {
        try {
          requireThat(configured(env), 'SSO not configured', 503);
          const state = url.searchParams.get('state'), code = url.searchParams.get('code');
          requireThat(state && code && state.length <= 200 && code.length <= 2000 && equal(state, jar[OAUTH]), 'Invalid sign-in state', 403);
          const pending = await call(env, 'oauth_take', { id: await sha256(state) });
          const r = await providerFetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(10000), redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: appOrigin + '/auth/google/callback', code_verifier: pending.verifier }) });
          requireThat(r.ok, 'Google token exchange failed', 403);
          const tokens = await r.json(); let jwks = await keys();
          let user;
          try { user = await verifyGoogle(tokens.id_token, jwks, env.GOOGLE_CLIENT_ID, pending.nonce, allowlist(env)); }
          catch (e) { if (e.message !== 'Unknown Google signing key') throw e; jwks = await keys(true); user = await verifyGoogle(tokens.id_token, jwks, env.GOOGLE_CLIENT_ID, pending.nonce, allowlist(env)); }
          const token = random(48);
          await call(env, 'login', { user, hash: await sha256(token), old_hash: await sha256(jar[SESSION] || ''), csrf: random() });
          const response = redirect('/'); response.headers.append('Set-Cookie', cookie(OAUTH, '', 0)); response.headers.append('Set-Cookie', cookie(SESSION, token, 3600)); return secure(response);
        } catch (error) {
          const reason = error.code === 'not_allowed' ? 'not_allowed' : 'sign_in_failed';
          return secure(redirect('/login?error=' + reason, { 'Set-Cookie': cookie(OAUTH, '', 0) }));
        }
      }
      const sessionHash = await sha256(jar[SESSION] || ''), csrf = request.headers.get('X-CSRF-Token') || '';
      if (path.startsWith('/api/intake/')) {
        requireThat(method === 'POST', 'Method not allowed', 405);
        requireThat(typeof env.INTAKE_TOKEN === 'string' && env.INTAKE_TOKEN.length >= 40 && equal(request.headers.get('Authorization'), 'Bearer ' + env.INTAKE_TOKEN), 'Intake credentials are invalid', 401);
        const body = await readJSON(request); let result;
        if (path === '/api/intake/projects') result = await call(env, 'project_create', body, '', '', true);
        else if (path === '/api/intake/releases') { const manifest = manifestInput(body, env); result = await call(env, 'candidate_create', { manifest, hash: await sha256(canonical(manifest)) }, '', '', true); }
        else if (path === '/api/intake/tasks') result = await call(env, 'task_update', body, '', '', true);
        else throw new AppError(404, 'Unknown intake endpoint');
        return secure(json(result, 201));
      }
      if (method === 'GET' && path === '/') {
        try { await call(env, 'session', {}, sessionHash); } catch (e) { if ([401, 403].includes(e.status)) return secure(redirect('/login')); throw e; }
        return secure(await env.ASSETS.fetch(new Request(appOrigin + '/index.html')));
      }
      // Protected documents and catalog never pass directly through the asset binding.
      const user = await call(env, 'session', {}, sessionHash);
      if (method === 'GET' && path === '/api/state') {
        const state = await call(env, 'state', {}, sessionHash);
        return secure(json({ ...state, hosting: 'Cloudflare Workers + SQLite Durable Objects', app_origin: appOrigin, integrations: { google_sso: true, hosted_database: true, agent_intake: Boolean(env.INTAKE_TOKEN?.length >= 40), github_sync: false, mac_workers: false, store_publishing: false }, allowed_emails: allowlist(env) }));
      }
      if (method === 'GET' && path === '/api/catalog') return secure(json({ games: research.games, studios: research.studios, concepts: research.concepts, documents: research.documents.map(({ content, ...meta }) => meta), roles: research.roles, research_date: research.research_date, ranking_status: research.ranking_status }));
      if (method === 'GET' && path.startsWith('/api/docs/')) { const d = research.documents.find(d => d.id === path.slice('/api/docs/'.length)); requireThat(d, 'Document not found', 404); return secure(json(d)); }
      if (method === 'GET' && path === '/api/export') {
        const data = await call(env, 'export', {}, sessionHash); delete data.user;
        return secure(json({ schema_version: 1, exported_at: new Date().toISOString(), note: 'Metadata export; no sessions or credentials. Release history limited to latest 200 and audit to latest 2000.', ...data }, 200, { 'Content-Disposition': 'attachment; filename="sanegames-studio-export.json"' }));
      }
      if (method === 'GET' && ['/api/export/games.csv', '/api/export/studios.csv'].includes(path)) return secure(new Response(path.includes('games.csv') ? research.gamesCSV : research.studiosCSV, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${path.split('/').pop()}"` } }));
      requireThat(['POST', 'PATCH'].includes(method), 'Not found', 404);
      requireThat(request.headers.get('Origin') === appOrigin && equal(csrf, user.csrf), 'Request origin or security token is invalid', 403);
      const writeKey = await sha256(user.sub + ':write'); await call(env, 'rate', { key: writeKey, limit: 60 });
      const body = await readJSON(request); let result;
      if (path === '/auth/logout' && method === 'POST') { await call(env, 'logout', {}, sessionHash, csrf); return secure(json({ ok: true }, 200, { 'Set-Cookie': cookie(SESSION, '', 0) })); }
      else if (path === '/api/projects' && method === 'POST') result = await call(env, 'project_create', body, sessionHash, csrf);
      else if (/^\/api\/projects\/p-[a-f0-9-]+$/.test(path) && method === 'PATCH') result = await call(env, 'project_update', { ...body, id: path.split('/')[3] }, sessionHash, csrf);
      else if (/^\/api\/tasks\/t-[a-f0-9-]+$/.test(path) && method === 'PATCH') result = await call(env, 'task_update', { ...body, id: path.split('/')[3] }, sessionHash, csrf);
      else if (path === '/api/research/pin' && method === 'POST') result = await call(env, 'pin', body, sessionHash, csrf);
      else if (path === '/api/candidates' && method === 'POST') { const manifest = manifestInput(body, env); result = await call(env, 'candidate_create', { manifest, hash: await sha256(canonical(manifest)) }, sessionHash, csrf); }
      else if (/^\/api\/releases\/r-[a-f0-9-]+\/decision$/.test(path) && method === 'POST') result = await call(env, 'decision', { ...body, id: path.split('/')[3] }, sessionHash, csrf);
      else if (/^\/api\/releases\/r-[a-f0-9-]+\/publication$/.test(path) && method === 'POST') result = await call(env, 'record_publication', { ...body, id: path.split('/')[3] }, sessionHash, csrf);
      else throw new AppError(404, 'Unknown endpoint');
      return secure(json(result));
    } catch (error) {
      const status = error instanceof AppError ? error.status : 503;
      return secure(json({ error: error instanceof AppError ? error.message : 'Service temporarily unavailable. Try again shortly.', code: error.code || 'service_unavailable' }, status, status === 429 ? { 'Retry-After': '60' } : {}));
    }
  } };
}
export default createHandler();
