# SaneGames hosted studio

The deployment entrypoint is now `cloudflare/native/entry.mjs`. This is the Cloudflare-hosted dashboard, not the earlier Mac-origin gateway.

## Deploy

Existing Worker: `sanegamesmasterdashboard`. Repository: `swiftSaneGames/saneGamesMaster`, branch `main`.

| Cloudflare build setting | Value |
|---|---|
| Root directory | `/` |
| Build command | `npm test` |
| Deploy command | `npm run cf:deploy` |
| Build variable | `SKIP_DEPENDENCY_INSTALL=1` |

The interface, API and SQLite Durable Object run on Cloudflare. No Mac server or tunnel is required. Google sign-in needs the `GOOGLE_CLIENT_SECRET` runtime secret; the public client ID and two-account allowlist are already in `wrangler.jsonc`. Never commit a real secret.

Read [hosted deployment](docs/HOSTED_DASHBOARD.md) and [test scope](docs/HOSTED_TESTING.md). After deploying this revision, `/healthz` identifies `cloudflare-native-worker` version `0.2.0`; `/login` serves the styled Google sign-in page. The old "Backend connection required" page belongs to a different entrypoint.

## Application scope

Research library (100 references, 20 studios, 12 concepts), persisted shortlists, original projects and role tasks, release-manifest reviews, maintenance targets, activity, handbook and metadata export. Google sign-in permits only the configured verified accounts. Agents cannot approve releases through the intake credential.

No running Claude workers, automatic GitHub synchronization or store-publishing integration is claimed. References are not a verified download ranking. Build reports and manual store records require owner verification.

## Tests

Node 22.13 or newer:

```bash
npm test
```

The native suite uses real local SQLite and signed, mocked Google identities. A local pass is not a successful Cloudflare deployment or real Google login. Legacy Python and gateway files remain for reference; Wrangler does not deploy them.
