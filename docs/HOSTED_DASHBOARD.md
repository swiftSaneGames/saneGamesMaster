# Fully hosted studio dashboard

Target: `https://dashboard.sanegames.swiftsane.com`. Worker: `sanegamesmasterdashboard`.

## Architecture

Browser -> Cloudflare Worker -> Static Assets and SQLite-backed StudioStore Durable Object. Google OpenID Connect handles sign-in. No Mac backend, tunnel or local database is required.

The Wrangler entrypoint is `cloudflare/native/entry.mjs`. Assets come only from `cloudflare/public`. Research is generated from the repository during build and returned only through authenticated APIs. `run_worker_first=true` prevents static-file routing from bypassing authorization.

Preserve the STUDIO binding, StudioStore class, studio-native-v1 migration and sanegames-primary-v1 object name across deployments. They identify the persistent database. Production does not seed demo projects.

## Cloudflare build

Repository swiftSaneGames/saneGamesMaster; production branch main; root `/`; build command `npm test`; deploy command `npm run cf:deploy`; build variable `SKIP_DEPENDENCY_INSTALL=1`. Node 22.16.0 is declared in .node-version. No npm runtime dependencies are required. The deploy command downloads pinned Wrangler.

Deploy the new source commit, not a retry of an old pinned build. Runtime Google credentials are separate from build variables. The login screen remains available without a secret; workspace data remains locked.

## Google SSO

The public OAuth client ID and exact allowlist are configured in wrangler.jsonc. Both allowed accounts receive owner access:

- singhjatin1603@gmail.com
- 23csu141@ncuindia.edu

Set a rotated `GOOGLE_CLIENT_SECRET` using Workers & Pages -> sanegamesmasterdashboard -> Settings -> Variables and Secrets -> Add -> Secret. Never enter it in Git or chat. A screenshot-exposed secret must be rotated in Google first.

Configure the Google web client with this exact redirect URI:

```
https://dashboard.sanegames.swiftsane.com/auth/google/callback
```

Use External audience and add both accounts as test users while Google remains in Testing. The university email must be usable as a Google account; the university's identity policy may independently restrict access. The application never accepts a browser-supplied email as authentication.

Use a Cloudflare Worker Custom Domain for dashboard.sanegames.swiftsane.com, with an active TLS certificate. APP_ORIGIN and the Google redirect URI must use the same hostname. Existing DNS and routes are not overwritten by this repository.

## Verify

1. `/healthz` returns component `cloudflare-native-worker` and version `0.2.0`.
2. Signed-out `/` redirects to the styled `/login` page; `/api/state` rejects access.
3. Both allowed Google accounts can sign in; a third account receives no session.
4. A project and shortlist persist across sign-out, another device and redeployment.
5. Failed evidence gates and stale manifests prevent approval; agent credentials cannot approve.

These are deployment checks, not claims that they have already passed in the owner's accounts. No Cloudflare or Google administration connection is available to the assistant; runtime secrets require account-owner configuration.

## Boundaries

Approval records are bound to exact candidate manifests. Owner mutations require a session, matching origin and CSRF protection. Approvals require recent authentication. Store publication is owner-recorded, not automatically uploaded or independently verified. Agent orchestration and GitHub synchronization are not connected.

Metadata export omits sessions and credentials and is not full disaster recovery. Cloudflare administrators can modify storage; the activity log is not externally immutable. Keep account permissions narrow. Do not enable paid services to work around a free-plan limit.

## Official references

- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.google.com/identity/openid-connect/openid-connect
