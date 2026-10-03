# Cloudflare-native dashboard

> Historical reference: this document describes the legacy Python/Mac-origin application or its test checkpoint. The active entrypoint is `cloudflare/native/entry.mjs`. Use [the current hosted guide](docs/HOSTED_DASHBOARD.md) and `docs/HOSTED_TESTING.md` for current operations. Do not apply old Wrangler, hostname, OAuth or process settings to the native deployment.

Use [docs/HOSTED_DASHBOARD.md](docs/HOSTED_DASHBOARD.md).

The root Wrangler configuration now deploys `cloudflare/native/entry.mjs`, static assets and a SQLite-backed Durable Object. The earlier Mac/Tunnel setup in `docs/CLOUDFLARE.md` is superseded for this deployment. Do not configure BACKEND_ORIGIN or run the demo to publish this application.

Cloudflare build: `npm test`. Deploy: `npm run cf:deploy`. Root: `/`. Build variable: `SKIP_DEPENDENCY_INSTALL=1`. Production secret: `GOOGLE_CLIENT_SECRET`, entered only in Cloudflare runtime Secrets.

A code push, a successful Cloudflare build, and successful Google login are distinct verification steps.

