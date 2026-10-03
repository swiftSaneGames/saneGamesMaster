# Cloudflare deployment: gateway plus an existing Mac

> Historical reference: this document describes the legacy Python/Mac-origin application or its test checkpoint. The active entrypoint is `cloudflare/native/entry.mjs`. Use [the current hosted guide](HOSTED_DASHBOARD.md) and `docs/HOSTED_TESTING.md` for current operations. Do not apply old Wrangler, hostname, OAuth or process settings to the native deployment.

## What failed and what this patch changes

The supplied build #08b1329f installed Python dependencies, then failed while running `npx wrangler deploy`: Wrangler could not identify static files. The repository had neither a Worker entrypoint nor a Wrangler configuration. Retrying that source does not add either.

The new root `wrangler.jsonc` explicitly selects `cloudflare/worker.mjs` and the existing Worker name `sanegamesmasterdashboard`. This avoids static-site auto-detection. It does **not** convert the Python application into a Worker.

The existing app depends on a Python process and a persistent, on-disk SQLite database. This patch deliberately keeps both on a dedicated existing Mac. The Worker proxies the complete application, including HTML, CSS, login, APIs and approval requests; it does not publish a nonfunctional static copy.

```text
Browser at prod.sanegames.swiftsane.com
  -> Worker: sanegamesmasterdashboard
     -> HTTPS studio-origin.swiftsane.com (named Cloudflare Tunnel)
        -> cloudflared on the dedicated Mac
           -> http://127.0.0.1:8787 (FastAPI + private SQLite)
```

The two hostnames must differ. Pointing BACKEND_ORIGIN at the public Worker hostname creates a loop and the code rejects it. No game or store release is triggered by deploying this gateway.

## 1. Fix the Worker build

In Workers & Pages, open `sanegamesmasterdashboard`, then Settings > Build. Use:

| Setting | Value |
|---|---|
| Repository | `swiftSaneGames/saneGamesMaster` |
| Production branch | `main` |
| Root directory | `/` (repository root, not `dashboard/static`) |
| Build command | `npm test` |
| Deploy command | `npm run cf:deploy` |
| Build variable | `SKIP_DEPENDENCY_INSTALL=1` |

There are no npm runtime or test dependencies. `npm test` uses Node's built-in test runner. The deploy script downloads Wrangler **4.147.0**, matching the version in the supplied failing log, and deploys it with the explicit configuration. Skipping automatic dependency installation avoids installing the unrelated Python server inside the Worker build. It does not skip tests or deployment.

The existing `npx wrangler deploy` command can also find the new entrypoint; the npm script pins the CLI version. A static assets directory is intentionally not configured. Never point assets at the repository root.

Start a new production build from the updated `main`. Confirm its source includes `wrangler.jsonc` and `cloudflare/worker.mjs`; an old pinned revision still lacks the fix. A build success only installs the gateway. Until the next steps are complete, an HTTP 503 setup page is expected, **not** a working dashboard.

## 2. Prepare the dedicated Mac backend

Use a separate service account with private storage and no store-signing permissions. Do not expose `run_demo.sh` through any tunnel.

Update the checkout without overwriting local work, then install the backend:

```bash
git pull --ff-only
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Create a private environment file outside Git. `.env.production.example` documents the required values; the app does not load it automatically. Keep an existing configuration instead of overwriting it. Set file permissions to 600 and directory permissions to 700. Use:

- `APP_MODE=production`
- `BASE_URL=https://prod.sanegames.swiftsane.com`
- `STUDIO_DATA_DIR`: an absolute private path outside the checkout
- `OWNER_GITHUB_ID`: the owner's verified numeric GitHub ID
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`: a dedicated GitHub OAuth application
- `INTAKE_TOKEN`: a separate random machine-intake credential
- `GATEWAY_TOKEN`: a new random URL-safe secret shared only with this Worker

Generate the gateway secret locally with `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`. Do not paste it into chat, Git, shell command arguments, screenshots, or logs. Generate INTAKE_TOKEN independently. The gateway secret never replaces owner sign-in or approval.

Configure the GitHub OAuth callback exactly as `https://prod.sanegames.swiftsane.com/auth/callback`. The existing OAuth code must pass an actual browser login before production acceptance; mocked authentication tests are not proof of provider integration.

Load the trusted private environment file in the service shell, then run:

```bash
bash scripts/run_cloudflare_origin.sh
```

The launcher requires GATEWAY_TOKEN and uses the production server bound to loopback. When configured, the backend rejects requests without that secret. It also rejects demo mode combined with a gateway secret. Do not bind to `0.0.0.0`, open a router port or disable HTTPS checks.

## 3. Connect a named Cloudflare Tunnel

Install and authenticate `cloudflared` on that Mac using Cloudflare's documented setup. Use the dashboard's generated installation command locally; keep tunnel credentials outside the repository. A named tunnel survives restarts; a temporary Quick Tunnel address is not the production origin.

Create a published application route with:

| Tunnel route setting | Value |
|---|---|
| Hostname | `studio-origin.swiftsane.com` |
| Service | `http://127.0.0.1:8787` |
| HTTP Host Header / `httpHostHeader` | `prod.sanegames.swiftsane.com` |

The Host Header override is required because FastAPI checks the canonical public hostname. Cloudflare supplies the HTTPS forwarding context and the launcher trusts only the loopback proxy. Verify this on the actual route; do not weaken host or scheme validation to silence an error.

For a locally managed named tunnel, `deploy/cloudflare/tunnel.example.yml` is a template. Replace its UUID and credential path in a private copy; validate the ingress before starting it. If using a dashboard-managed tunnel, enter equivalent settings there rather than mixing configuration ownership.

Check that swiftsane.com is an active Cloudflare zone and that the origin hostname has a valid edge certificate. Never disable origin TLS verification or select Flexible SSL to work around errors. The local tunnel-to-app hop is loopback HTTP; the remote Worker-to-Tunnel connection is HTTPS.

## 4. Configure the Worker runtime

In the Worker's **Settings > Variables and Secrets** (not Build variables), add:

| Name | Type | Value |
|---|---|---|
| `BACKEND_ORIGIN` | Text | `https://studio-origin.swiftsane.com` |
| `GATEWAY_TOKEN` | Secret | Exactly the same new secret stored on the dedicated Mac |
| `PUBLIC_ORIGIN` | Text, optional | `https://prod.sanegames.swiftsane.com` (already the code default) |

Save and deploy the runtime configuration. `keep_vars: true` prevents routine code deployments from deleting dashboard-managed text variables. Never put the gateway token in Wrangler vars or the repository. Do not put GitHub OAuth or App Store secrets into this Worker; those are not needed at the edge.

Attach **the Worker Custom Domain** `prod.sanegames.swiftsane.com` in Domains / Domains & Routes. Do not also point this hostname directly at the origin tunnel. Cloudflare's Worker Custom Domain workflow creates DNS and the certificate for the exact hostname, including a multi-level subdomain. Confirm certificate issuance before testing. This is distinct from assuming a normal `*.swiftsane.com` Universal SSL certificate covers it.

Do not remove unrelated existing DNS records. If the exact hostname already serves an application, review that conflict before replacing anything. No DNS or Cloudflare account configuration has been changed by committing this patch.

## 5. Acceptance tests before trusting the dashboard

| Check | Expected result |
|---|---|
| `/__gateway/health` | Gateway status with `backend: not_checked`; this is liveness only |
| `/healthz` on the custom domain | Backend JSON `{"status":"ok"}` after origin validation |
| `/` without a session | Redirect to the real `/login` page |
| `/api/state` without a session | 401; never demo records or an HTML fallback |
| Browser GitHub sign-in as owner | Correct callback; Secure/HttpOnly host-only session; production state |
| Another GitHub user | Denied access |
| Direct request to the origin hostname without the gateway secret | Denied; no dashboard or private data |
| Valid machine intake credential | Can submit candidates, cannot approve them |
| Missing CSRF or a changed candidate hash | Approval rejected |
| Mac stopped / tunnel disconnected | 502; no cached private page or optimistic success |
| `workers.dev` or preview URL after setup | 421 for app routes; use the canonical custom domain |
| Restart Mac/app | Database survives; verify private backup restoration separately |

Run all owner-approved release checks as well. The application has no automated store-upload adapter, and approval still does not publish a game.

Use only one active SQLite primary. Do not point one tunnel at three independently written databases. Establish restart supervision for FastAPI and cloudflared on the dedicated account after the manual checks pass. Until then, closing the service shell or restarting the Mac interrupts availability.

## Security and failure behavior

The Worker never caches private responses, follows upstream redirects, logs request URLs, retries writes or creates approvals. It forwards cookies and CSRF headers to the actual backend. Requests are capped at 64 KiB. It refuses responses from a backend that has not confirmed production gateway configuration. The confirmation is a deployment-mode marker over the authenticated HTTPS origin hop, not a new owner authentication mechanism or a security attestation.

A timeout can occur after a write has succeeded. Read the release state before retrying. Do not log OAuth query strings, Authorization, Cookie or gateway headers while diagnosing connectivity. No end-to-end availability or free-tier capacity claim follows from unit tests; verify current account allowances without enabling paid overages.

## Verification performed for this patch

- 30 Node tests passed, including routing, body limits, cookie/redirect handling, secret replacement and failure behavior.
- 55 Python tests passed: the existing 36 plus 19 new origin/gateway checks.
- Wrangler configuration parses and the entrypoint exists; JavaScript syntax passes.
- The full Wrangler CLI/workerd dry-run was **not executed** in this environment: the npm registry lookup failed with `EAI_AGAIN` and Wrangler was not installed. Run `npm run cf:check` where npm is reachable.
- No actual Cloudflare deployment, DNS/tunnel change, GitHub OAuth callback or physical-Mac operation was verified by these tests. Cloudflare's next build must confirm CLI deployment.

## Official references checked on 2026-10-03

- [Wrangler entrypoint configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers build settings and separate runtime variables](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Skip automatic dependency installation](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Worker runtime secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Worker Custom Domains and their certificates](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Tunnel origin parameters](https://developers.cloudflare.com/tunnel/configuration/)
- [Locally managed tunnel configuration](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/)
- [Worker Request redirect security](https://developers.cloudflare.com/workers/runtime-apis/request/)

