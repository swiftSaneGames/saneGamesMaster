/** Security helpers shared by the hosted Worker and its tests. No browser-supplied identity is trusted. */
export class AppError extends Error {
  constructor(status, message, code = 'request_failed') { super(message); this.status = status; this.code = code; }
}
export const requireThat = (test, message, status = 422, code = 'invalid_input') => { if (!test) throw new AppError(status, message, code); };
export const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
export const random = (size = 32) => base64url(crypto.getRandomValues(new Uint8Array(size)));
export function base64url(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
export function decode64(value) {
  requireThat(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value), 'Invalid token', 403);
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
}
export const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('');
export const challenge = async value => base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export function allowlist(env) {
  return String(env.ALLOWED_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
}
export function origin(env) {
  const u = new URL(env.APP_ORIGIN);
  requireThat(u.protocol === 'https:' && u.pathname === '/' && !u.search && !u.hash && !u.username && !u.password, 'Invalid application origin', 503);
  return u.origin;
}
export function cookies(request) {
  return Object.fromEntries((request.headers.get('cookie') || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));
}
export function cookie(name, value, age) { return `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`; }
export async function readJSON(request, limit = 65536) {
  requireThat((request.headers.get('content-type') || '').split(';')[0] === 'application/json', 'Send application/json', 415);
  requireThat(Number(request.headers.get('content-length') || 0) <= limit, 'Request is too large', 413);
  const reader = request.body?.getReader(); let total = 0; const chunks = [];
  if (reader) { for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > limit) { await reader.cancel(); throw new AppError(413, 'Request is too large'); } chunks.push(value); } }
  const bytes = new Uint8Array(total); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  try { const value = JSON.parse(new TextDecoder().decode(bytes)); requireThat(value && !Array.isArray(value) && typeof value === 'object', 'Send a JSON object'); return value; }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError(400, 'Invalid JSON'); }
}
export function text(value, field, max = 2000, min = 0) {
  requireThat(typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), `Invalid ${field}`);
  return value.trim();
}
export function httpsURL(value, field, hosts) {
  let u; try { u = new URL(value); } catch { throw new AppError(422, `Invalid ${field}`); }
  requireThat(u.protocol === 'https:' && !u.username && !u.password && !u.port && value.length <= 2048, `Invalid ${field}`);
  requireThat(!hosts || hosts.includes(u.hostname), `Unapproved host for ${field}`);
  return u.href;
}
/** Verify signature and claims locally against Google's JWKs. No tokeninfo dependency or unsigned-token acceptance. */
export async function verifyGoogle(token, jwks, clientId, nonce, permitted, now = Math.floor(Date.now() / 1000)) {
  try {
    requireThat(typeof token === 'string' && token.length <= 16000, 'Invalid Google identity', 403);
    const parts = token.split('.'); requireThat(parts.length === 3, 'Invalid Google identity', 403);
    const header = JSON.parse(new TextDecoder().decode(decode64(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode64(parts[1])));
    requireThat(header.alg === 'RS256' && typeof header.kid === 'string', 'Invalid Google signature', 403);
    const jwk = jwks.keys?.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256'));
    requireThat(jwk, 'Unknown Google signing key', 403);
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    requireThat(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode64(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])), 'Invalid Google signature', 403);
    requireThat(['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss), 'Invalid issuer', 403);
    // Google's web-server ID tokens have a single audience. Reject unexpected multi-audience tokens.
    requireThat(claims.aud === clientId && (!claims.azp || claims.azp === clientId), 'Invalid audience', 403);
    requireThat(Number.isFinite(claims.exp) && claims.exp > now && Number.isFinite(claims.iat) && claims.iat <= now + 60 && claims.iat > now - 600, 'Expired Google identity', 403);
    requireThat(equal(claims.nonce, nonce), 'Invalid sign-in nonce', 403);
    requireThat(claims.email_verified === true || claims.email_verified === 'true', 'Email is not verified', 403);
    const email = String(claims.email || '').trim().toLowerCase();
    requireThat(permitted.includes(email), 'This Google account is not allowed', 403, 'not_allowed');
    requireThat(typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub.length <= 255, 'Invalid Google subject', 403);
    return { sub: claims.sub, email, name: String(claims.name || email.split('@')[0]).slice(0, 100) };
  } catch (error) { if (error instanceof AppError) throw error; throw new AppError(403, 'Google identity could not be verified'); }
}
