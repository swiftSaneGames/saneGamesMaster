/** Test-only adapters. Never imported by the production Worker. */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { StudioStore } from '../../cloudflare/native/store.mjs';
import { createHandler } from '../../cloudflare/native/worker.mjs';
import { base64url, random } from '../../cloudflare/native/security.mjs';
export const CLIENT = 'unit-tests.apps.googleusercontent.com';
export const ORIGIN = 'https://dashboard.sanegames.swiftsane.com';
export const FIRST = 'singhjatin1603@gmail.com', SECOND = '23csu141@ncuindia.edu';
const root = path.resolve(import.meta.dirname, '../..');
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
export const publicJwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-google-key', use: 'sig', alg: 'RS256' };
export async function signClaims(overrides = {}, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: 'https://accounts.google.com', aud: CLIENT, azp: CLIENT, sub: 'test-google-sub-1', email: FIRST, email_verified: true, name: 'Studio Test Owner', iat: now, exp: now + 3600, nonce: 'expected-nonce', ...overrides };
  const encode = v => base64url(new TextEncoder().encode(JSON.stringify(v)));
  const prefix = encode({ alg: 'RS256', kid: 'test-google-key', ...header }) + '.' + encode(claims);
  return prefix + '.' + base64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(prefix)));
}
export function databaseContext(file = ':memory:') {
  const db = new DatabaseSync(file);
  const sql = { exec(query, ...params) {
    // Schema initialization consists of multiple CREATE statements, with no parameters.
    if (!params.length && query.trim().startsWith('CREATE TABLE')) { db.exec(query); return []; }
    const statement = db.prepare(query);
    const all = statement.all(...params);
    all.toArray = () => all; all.one = () => { if (all.length !== 1) throw new Error('Expected one row'); return all[0]; }; return all;
  } };
  return { db, storage: { sql, transactionSync(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } } } };
}
export function harness(overrides = {}, dbFile = ':memory:') {
  const env = { APP_ORIGIN: ORIGIN, ALLOWED_EMAILS: FIRST + ',' + SECOND, GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 'unit-test-only-secret', INTAKE_TOKEN: 'unit-test-intake-' + 'x'.repeat(40), ...overrides };
  const ctx = databaseContext(dbFile); const store = new StudioStore(ctx, env);
  env.STUDIO = { idFromName: name => name, get: () => ({ fetch: (url, init) => store.fetch(new Request(url, init)) }) };
  env.ASSETS = { fetch: async request => {
    const pathname = new URL(request.url).pathname;
    const file = path.resolve(root, 'cloudflare/public', '.' + pathname);
    if (!file.startsWith(path.join(root, 'cloudflare/public') + path.sep) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
    const types = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
    return new Response(fs.readFileSync(file), { headers: { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' } });
  } };
  const codes = new Map(); let tokenFetches = 0;
  const provider = async (url, init) => {
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [publicJwk] });
    if (url === 'https://oauth2.googleapis.com/token') { tokenFetches++; const form = new URLSearchParams(init.body); const claims = codes.get(form.get('code')); if (!claims) return Response.json({ error: 'invalid_grant' }, { status: 400 }); codes.delete(form.get('code')); return Response.json({ id_token: await signClaims(claims), access_token: 'test-only-not-persisted' }); }
    throw new Error('Unexpected external request: ' + url);
  };
  const worker = createHandler(provider);
  const request = (p, init = {}) => worker.fetch(new Request(env.APP_ORIGIN + p, init), env);
  async function login(email = FIRST, sub = email === FIRST ? 'test-google-sub-1' : 'test-google-sub-2') {
    const start = await request('/auth/google'); const location = new URL(start.headers.get('location')); const code = random();
    codes.set(code, { nonce: location.searchParams.get('nonce'), email, sub });
    const response = await request('/auth/google/callback?' + new URLSearchParams({ code, state: location.searchParams.get('state') }), { headers: { Cookie: start.headers.get('set-cookie').split(';')[0] } });
    const session = response.headers.getSetCookie().find(c => c.startsWith('__Host-sg-session='));
    const jar = session?.split(';')[0] || '';
    const state = session ? await (await request('/api/state', { headers: { Cookie: jar } })).json() : null;
    return { response, cookie: jar, state, csrf: state?.user.csrf, start, authURL: location, code };
  }
  function as(login, path, method = 'GET', body, extra = {}) {
    return request(path, { method, headers: { Cookie: login.cookie, Origin: env.APP_ORIGIN, 'X-CSRF-Token': login.csrf || '', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  }
  return { env, ctx, store, codes, worker, request, login, as, get tokenFetches() { return tokenFetches; }, close: () => ctx.db.close() };
}
export const project = { title: 'Test Pizza Routes', category: 'Business simulation', summary: 'An original routing and kitchen-management concept.' };
export function manifest(project_id, overrides = {}) {
  return { project_id, version: '1.0.0', source_commit: 'a'.repeat(40), artifacts: { android: { url: 'https://github.com/swiftSaneGames/test/releases/1', sha256: 'b'.repeat(64) }, ios: { url: 'https://testflight.apple.com/join/testing', sha256: 'c'.repeat(64) } }, evidence: ['automated_tests','android_device','ios_device','save_migration','performance','privacy_ads','licenses','launch_materials'].map(key => ({ key, status: 'pass', report_url: 'https://github.com/swiftSaneGames/test/issues/1', summary: 'Test fixture only. Not real device evidence.' })), blocking_issues: 0, launch_summary: 'Test-only launch pack for a simulated integration test.', ...overrides };
}
