# Hosted dashboard test scope

Run `npm test` with Node 22.13 or newer. The pretest step builds the private research bundle.

The 77 native tests exercise real local SQLite through a Durable Object adapter and signed, mocked Google identity tokens. Coverage includes both allowed owners, unauthorized accounts, JWT claims/signatures, one-time OAuth state, sessions, CSRF/origin checks, project/task persistence, optimistic concurrency, research access, manifests, evidence gates, recent-auth approval, superseding candidates, intake isolation, publication records and logout.

These tests do not sign in to real Google, provision Cloudflare, validate the production TLS certificate, launch Claude or publish a game. The Node SQLite adapter is not Cloudflare workerd. A deployed smoke test must independently confirm the Durable Object migration, runtime bindings, asset routing, both real accounts and persistence.

The frontend files can be syntax-checked with `node --check cloudflare/public/assets/app.js` and `node --check cloudflare/public/assets/login.js`. Visual previews from earlier local sessions are not production screenshots. The old gateway and Python test suites cover legacy code, not this deployment.
