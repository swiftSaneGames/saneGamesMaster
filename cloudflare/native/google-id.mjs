/** Google Identity Services: verify signed ID tokens, without an OAuth client secret.
 * Login state is browser-bound, expires in storage, and can only be consumed once.
 * No access/refresh tokens or user-supplied email addresses are accepted. */
import { requireThat, json, random, sha256, cookies, cookie, equal, readJSON, verifyGoogle, allowlist, origin } from './security.mjs';

const LOGIN_COOKIE = '__Host-sg-google-id';
const SESSION_COOKIE = '__Host-sg-session';
const CLIENT_PATTERN = /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/;

export function googleStatus(env) {
  const client = String(env.GOOGLE_CLIENT_ID || '').trim();
  const validClient = client.length <= 200 && CLIENT_PATTERN.test(client);
  const missing = [];
  if (!validClient) missing.push('google_client_id');
  if (!allowlist(env).length) missing.push('allowed_emails');
  if (!env.STUDIO) missing.push('studio_storage');
  return {
    // Preserve the old status flag for clients using the code-exchange route.
    configured: missing.length === 0 && Boolean(env.GOOGLE_CLIENT_SECRET),
    ready: missing.length === 0,
    // Keep the established redirect flow when its runtime secret is configured.
    mode: env.GOOGLE_CLIENT_SECRET ? 'authorization_code' : 'google_identity',
    client_id: validClient ? client : null,
    missing,
    auth_version: 'google-id-v1'
  };
}

// Only the public login document needs Google's browser library and popup permissions.
export function googleLoginHeaders(response) {
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  response.headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' https://accounts.google.com/gsi/style; img-src 'self' data:; connect-src 'self' https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return response;
}

export function createGoogleID(providerFetch) {
  let cachedKeys = null, validUntil = 0;
  async function keys(force = false) {
    if (!force && cachedKeys && Date.now() < validUntil) return cachedKeys;
    const response = await providerFetch('https://www.googleapis.com/oauth2/v3/certs', {
      signal: AbortSignal.timeout(10000), redirect: 'manual'
    });
    requireThat(response.ok, 'Google signing keys are temporarily unavailable', 502);
    const value = await response.json();
    requireThat(Array.isArray(value.keys) && value.keys.length > 0 && value.keys.length <= 10, 'Invalid Google signing keys', 502);
    const ttl = Number((response.headers.get('Cache-Control') || '').match(/(?:^|[,\s])max-age=(\d+)/i)?.[1] || 300);
    cachedKeys = value;
    validUntil = Date.now() + Math.min(Math.max(ttl, 0), 3600) * 1000;
    return value;
  }
  function sameOriginPost(request, env) {
    requireThat(request.method === 'POST' && request.headers.get('Origin') === origin(env)
      && request.headers.get('X-SG-Login') === '1', 'Sign-in must start from this dashboard', 403);
    const site = request.headers.get('Sec-Fetch-Site');
    requireThat(!site || site === 'same-origin', 'Cross-site sign-in request rejected', 403);
  }
  return {
    async prepare(request, env, call) {
      sameOriginPost(request, env);
      const config = googleStatus(env);
      requireThat(config.ready, 'Google client ID, allowlist or storage is not configured', 503, 'sso_not_configured');
      await readJSON(request, 1024);
      const state = random(), nonce = random();
      await call(env, 'oauth_create', { id: 'gis:' + await sha256(state), data: { flow: 'google_identity', nonce, client_id: config.client_id } });
      return json({ state, nonce, client_id: config.client_id, expires_in: 600 }, 200, {
        'Set-Cookie': cookie(LOGIN_COOKIE, state, 600)
      });
    },
    async complete(request, env, call) {
      sameOriginPost(request, env);
      const config = googleStatus(env);
      requireThat(config.ready, 'Google sign-in is not configured', 503, 'sso_not_configured');
      const body = await readJSON(request, 18000), jar = cookies(request);
      requireThat(typeof body.state === 'string' && body.state.length >= 32 && body.state.length <= 128
        && equal(body.state, jar[LOGIN_COOKIE]), 'Sign-in state does not match this browser. Reload and try again.', 403, 'login_state');
      requireThat(typeof body.credential === 'string' && body.credential.length <= 16000, 'Missing Google identity', 403);
      const pending = await call(env, 'oauth_take', { id: 'gis:' + await sha256(body.state) });
      requireThat(pending.flow === 'google_identity' && pending.client_id === config.client_id, 'Invalid sign-in transaction', 403);
      let user;
      try {
        user = await verifyGoogle(body.credential, await keys(), config.client_id, pending.nonce, allowlist(env));
      } catch (error) {
        if (error.message !== 'Unknown Google signing key') throw error;
        user = await verifyGoogle(body.credential, await keys(true), config.client_id, pending.nonce, allowlist(env));
      }
      const token = random(48);
      await call(env, 'login', { user, hash: await sha256(token), old_hash: await sha256(jar[SESSION_COOKIE] || ''), csrf: random() });
      const response = json({ ok: true, redirect: '/' });
      response.headers.append('Set-Cookie', cookie(LOGIN_COOKIE, '', 0));
      response.headers.append('Set-Cookie', cookie(SESSION_COOKIE, token, 3600));
      return response;
    }
  };
}
