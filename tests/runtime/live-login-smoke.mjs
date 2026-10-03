/** Public, non-destructive checks only. No real owner credentials or sessions.
 * Creates one expiring sign-in state and submits a deliberately invalid credential.
 * Logs status/error codes only; cookies, nonces and response bodies stay out of logs.
 */
import assert from 'node:assert/strict';
const origin = 'https://dashboard.sanegames.swiftsane.com';
async function request(route, init = {}) {
  const r = await fetch(origin + route, { redirect: 'manual', signal: AbortSignal.timeout(15000), ...init });
  let data = {}; try { data = await r.json(); } catch {}
  const fields = { route, http_status: r.status };
  if (typeof data.code === 'string') fields.code = data.code;
  if (typeof data.error === 'string') fields.error = data.error.slice(0, 200);
  if (route === '/auth/status') { fields.ready = data.ready; fields.mode = data.mode; fields.auth_version = data.auth_version; }
  console.log(JSON.stringify(fields));
  return { response: r, data };
}
const headers = { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', 'X-SG-Login': '1' };
try {
  await request('/healthz');
  const status = await request('/auth/status');
  assert.equal(status.response.status, 200);
  assert.equal(status.data.ready, true, 'deployed SSO configuration is not ready');
  const unauth = await request('/api/state');
  assert.equal(unauth.response.status, 401, 'unsigned API should reject access without a server failure');
  const prepared = await request('/auth/google/prepare', { method: 'POST', headers, body: '{}' });
  assert.equal(prepared.response.status, 200, 'deployed login-state creation failed');
  const cookie = prepared.response.headers.getSetCookie().find(c => c.startsWith('__Host-sg-google-id='))?.split(';')[0];
  assert.ok(cookie, 'secure login-state cookie missing');
  const refused = await request('/auth/google/credential', { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ state: prepared.data.state, credential: 'deliberately-invalid-no-user-identity' }) });
  assert.equal(refused.response.status, 403, 'invalid credential must be rejected rather than causing a server failure');
  assert.ok(!refused.response.headers.getSetCookie().some(c => c.startsWith('__Host-sg-session=')), 'invalid identity received a session');
  console.log('PASS: live public configuration, database handshake and invalid-identity rejection. Real Google owner sign-in not tested.');
} catch (error) {
  console.error('Public login smoke check failed:', error.message);
  process.exitCode = 1;
}
