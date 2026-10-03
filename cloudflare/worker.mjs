/**
 * HTTPS gateway only. FastAPI, SQLite, authentication and approvals run on a Mac.
 * No static/demo fallback, local database, cached private data or automatic retries.
 */
const DEFAULT_PUBLIC_ORIGIN = "https://prod.sanegames.swiftsane.com";
const MAX_BODY = 65536;
const METHODS = new Set(["GET", "HEAD", "POST"]);
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,200}$/;
const HOP_HEADERS = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length",
];

function origin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port ||
        u.pathname !== "/" || u.search || u.hash) return null;
    if (!u.hostname.includes(".") || /^[0-9.]+$/.test(u.hostname) ||
        u.hostname.includes(":") || u.hostname.endsWith(".localhost")) return null;
    return u;
  } catch { return null; }
}

function configuration(env) {
  const publicOrigin = origin(env.PUBLIC_ORIGIN || DEFAULT_PUBLIC_ORIGIN);
  const backend = origin(env.BACKEND_ORIGIN);
  const token = env.GATEWAY_TOKEN;
  if (!publicOrigin || !backend || publicOrigin.hostname === backend.hostname ||
      typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  return { publicOrigin, backend, token };
}

function safeHeaders(headers = undefined) {
  const h = new Headers(headers);
  h.set("Cache-Control", "no-store");
  h.set("CDN-Cache-Control", "no-store");
  h.set("Cloudflare-CDN-Cache-Control", "no-store");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "no-referrer");
  h.set("X-Robots-Tag", "noindex, nofollow");
  h.set("Strict-Transport-Security", "max-age=31536000");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  h.delete("x-studio-gateway-token");
  h.delete("x-studio-origin-mode");
  return h;
}

function message(request, status, code, detail) {
  const headers = safeHeaders();
  headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if (status === 503 || status === 502) headers.set("Retry-After", "30");
  if (status === 405) headers.set("Allow", "GET, HEAD, POST");
  const isPage = request.method === "GET" && new URL(request.url).pathname === "/";
  headers.set("Content-Type", isPage ? "text/html; charset=utf-8" : "application/json; charset=utf-8");
  // All detail strings are hard-coded; never reflect URLs, secrets or upstream errors.
  const body = isPage
    ? `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SaneGames - setup required</title><main><h1>SaneGames Studio</h1><h2>Backend connection required</h2><p>${detail}</p><p>This is a gateway status page, not the working dashboard. Follow docs/CLOUDFLARE.md in saneGamesMaster. No demo data or approvals are available here.</p></main></html>`
    : JSON.stringify({ error: code, detail });
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}

async function boundedBody(request) {
  if (!request.body) return undefined;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) {
    throw new RangeError("body_limit");
  }
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw new RangeError("body_limit");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function handleRequest(request, env = {}, fetcher = fetch) {
  const input = new URL(request.url);
  if (!METHODS.has(request.method)) {
    return message(request, 405, "method_not_allowed", "This dashboard supports GET, HEAD and POST.");
  }
  const config = configuration(env);
  if (input.pathname === "/__gateway/health" && request.method !== "POST") {
    return new Response(request.method === "HEAD" ? null : JSON.stringify({
      gateway: "ok", backend_configured: Boolean(config), backend: "not_checked",
    }), { headers: safeHeaders({ "Content-Type": "application/json" }) });
  }
  if (!config) {
    return message(request, 503, "backend_not_configured", "The Worker is installed, but its production backend is not configured.");
  }
  if (input.origin !== config.publicOrigin.origin) {
    return message(request, 421, "wrong_public_origin", "Use the configured dashboard custom domain. Preview URLs cannot access the backend.");
  }
  if (request.headers.has("upgrade")) {
    return message(request, 400, "unsupported_upgrade", "Connection upgrades are not supported.");
  }
  let body;
  try { body = await boundedBody(request); }
  catch (error) {
    return message(request, error instanceof RangeError ? 413 : 400, "invalid_body", "Request body must be valid and no larger than 64 KiB.");
  }
  // Assign path/search independently: a //path must never change the upstream host.
  const target = new URL(config.backend.origin);
  target.pathname = input.pathname;
  target.search = input.search;
  const headers = new Headers(request.headers);
  for (const name of (headers.get("connection") || "").split(",")) {
    if (name.trim()) headers.delete(name.trim());
  }
  for (const name of [...HOP_HEADERS, "forwarded", "x-forwarded-for", "x-forwarded-host", "x-real-ip"]) {
    headers.delete(name);
  }
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-Studio-Gateway-Token", config.token);
  try {
    const upstream = await fetcher(new Request(target, {
      method: request.method, headers, body, redirect: "manual", cache: "no-store",
      signal: AbortSignal.timeout(25000),
    }));
    // A stale backend or a demo server must not masquerade as production.
    if (upstream.headers.get("x-studio-origin-mode") !== "production") {
      if (upstream.body) await upstream.body.cancel();
      return message(request, 502, "origin_not_ready", "The backend did not confirm the production gateway configuration.");
    }
    const responseHeaders = safeHeaders(upstream.headers);
    const location = responseHeaders.get("location");
    if (location) {
      const destination = new URL(location, target);
      if (destination.origin === config.backend.origin) {
        destination.protocol = config.publicOrigin.protocol;
        destination.host = config.publicOrigin.host;
        responseHeaders.set("location", destination.toString());
      }
    }
    // Do not follow OAuth redirects or retry writes. Preserve status and Set-Cookie.
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status, statusText: upstream.statusText, headers: responseHeaders,
    });
  } catch {
    return message(request, 502, "backend_unavailable", "The backend could not be reached. A write may have completed; check its status before retrying.");
  }
}

export default {
  fetch(request, env) { return handleRequest(request, env); },
};
