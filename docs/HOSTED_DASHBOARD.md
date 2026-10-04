# Fully hosted studio dashboard

Target: `https://dashboard.sanegames.swiftsane.com`. Worker: `sanegamesmasterdashboard`.

## Architecture

Browser -> Cloudflare Worker -> Static Assets and SQLite-backed StudioStore Durable Object. Google handles sign-in. No Mac backend, tunnel or local database is required.

The Wrangler entrypoint is `cloudflare/native/entry.mjs`. Assets come only from `cloudflare/public`. Research is generated from the repository during build and returned only through authenticated APIs. `run_worker_first=true` prevents static-file routing from bypassing authorization.

Preserve the STUDIO binding, StudioStore class, studio-native-v1 migration and sanegames-primary-v1 object name across deployments. They identify the persistent database. Production does not seed demo projects.

## Cloudflare build

Repository swiftSaneGames/saneGamesMaster; production branch main; root `/`; build command `npm test`; deploy command `npm run cf:deploy`; build variable `SKIP_DEPENDENCY_INSTALL=1`. Node 22.16.0 is declared in .node-version. No npm runtime dependencies are required. The deploy command downloads pinned Wrangler.

Deploy the new source commit, not a retry of an old pinned build. A successful build does not prove Google account authentication works.

For the optional repository picker and read-only GitHub metadata connection, configure the `GITHUB_TOKEN` runtime secret and verify it in Settings using [Connect GitHub](GITHUB_SYNC.md). The chat's GitHub connection and a source push do not install that secret in Cloudflare.

## Google sign-in: client-secret blocker fixed

The sign-in page now supports Google Identity Services ID tokens when `GOOGLE_CLIENT_SECRET` is absent. This flow uses the public web-client ID already in wrangler.jsonc. It does not exchange authorization codes, require a client secret, or bypass authentication.

**Required Google-console setting:** Google Auth Platform -> Clients -> select the existing Web application -> Authorized JavaScript origins -> add this exact origin and Save:

```text
https://dashboard.sanegames.swiftsane.com
```

Do not append `/login` or another path in the JavaScript origins field. Google enforces this setting independently of our code. A registered redirect URI is a different setting and does not substitute for an authorized JavaScript origin. This setting cannot be verified or edited through the currently available account connections.

Use External audience. Keep both accounts as test users while the app is in Testing. Both exact, verified Google accounts receive owner access:

- singhjatin1603@gmail.com
- 23csu141@ncuindia.edu

The university email must be usable as a Google account; its identity policy can independently restrict access. The application never trusts an email typed into the browser. It verifies the Google signature, issuer, audience, expiry, nonce and verified-email claim before applying the exact allowlist. The stable Google subject is pinned at first sign-in; a changed subject cannot silently take over an allowed address.

### Optional existing redirect flow

When a `GOOGLE_CLIENT_SECRET` runtime secret is already configured, the existing server authorization-code flow remains selected. Its exact authorized redirect URI remains:

```text
https://dashboard.sanegames.swiftsane.com/auth/google/callback
```

The new ID-token flow does not require that secret. To use it when an invalid or obsolete secret is already set, remove `GOOGLE_CLIENT_SECRET` from Cloudflare runtime settings and redeploy, or configure a valid rotated secret for the redirect flow. Never put a secret in GitHub or chat. Revoke the previously screenshot-exposed secret in Google independently of this code change.

### What the new flow does

1. `/auth/status` reports `ready`, `mode`, `missing`, and public `client_id`. `configured` preserves the older meaning: authorization-code flow ready. In ID-token mode, `ready=true` and `configured=false` is normal.
2. The login page obtains a 10-minute one-time state and nonce through a same-origin JSON POST.
3. Google's official SDK renders the sign-in button and returns a signed ID token to the browser callback.
4. The browser POSTs the credential and state to `/auth/google/credential`. It does not decode the credential into a trusted identity.
5. The Worker checks request origin, a custom header, the browser's HttpOnly state cookie, stored state, Google signature and claims, and the allowlist.
6. Only successful verification creates an expiring HttpOnly owner session. Failed, replayed, expired, cross-site or non-allowlisted submissions create no session.

Only the login document permits the Google SDK, its frame/styles/connect endpoints and the popup bridge. Private workspace pages retain the tighter Content Security Policy. A missing or blocked Google script displays a retry message; it does not grant access.

Use HTTPS and the canonical hostname. Worker URLs redirect to the configured origin. Existing DNS and routes are not overwritten.

## Verification

Local regression run for this patch: **111 tests passed** (77 existing plus 34 ID-token checks). Tests include signed test-key credentials for both accounts, refused outsiders, replay, expiry, wrong audience/issuer/nonce, origin enforcement, rate limits, and access after session creation. Node syntax checks passed.

These use test RSA keys and a local SQLite adapter, not live Google credentials or the Cloudflare runtime. A browser bridge test was attempted but blocked by this environment's browser policy; no successful new browser or real-Google end-to-end test is claimed.

Production checklist:

1. `/auth/status` reports `ready=true` and the intended mode. In ID-token mode it reports `auth_version=google-id-v1`.
2. `/login` displays the Google button instead of the missing-secret warning.
3. Complete real Google sign-in separately with both allowed accounts. A third account must receive no session.
4. Signed-out `/api/state` remains inaccessible; sign-out invalidates the session.
5. Projects and shortlists persist across sign-out and redeployment.
6. Failed evidence gates, stale manifests and agent credentials cannot approve releases.

## Boundaries

Approval records are bound to exact candidate manifests. Owner mutations require a session, matching origin and CSRF protection. Approvals require recent authentication. Store publication is owner-recorded, not automatically uploaded or independently verified. Source now includes durable worker orchestration and isolated Git integration; configure and verify the [Mac workers](WORKER_SETUP.md) before claiming they are connected. Operations distinguishes implementation from fresh heartbeats and completed jobs.

Metadata export omits sessions and credentials and is not full disaster recovery. Cloudflare administrators can modify storage; the activity log is not externally immutable. Keep permissions narrow. Do not enable paid services to work around a free-plan limit.

## Official references

- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/identity/gsi/web/reference/js-reference
- https://developers.google.com/identity/gsi/web/guides/integrate
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://developers.cloudflare.com/workers/configuration/secrets/
