# Hosted dashboard test scope

Run `npm test` with Node 22.13 or newer. The pretest step builds the private research bundle.

The native suite exercises real local SQLite through a Durable Object adapter and signed, mocked Google identity tokens. The 2026-10-03 prompt audit reran the baseline and counted 121 passing cases across the four native suites; earlier 77/111 counts describe historical checkpoints. Coverage includes both allowed owners, unauthorized accounts, JWT claims/signatures, one-time OAuth state, sessions, CSRF/origin checks, project/task persistence, optimistic concurrency, research access, manifests, evidence gates, recent-auth approval, superseding candidates, intake isolation, publication records and logout.

Prompt checks: `python3 scripts/validate_agents.py` validates coverage, hierarchy, generated definitions and support templates. `python3 scripts/sync_agent_definitions.py --check` detects definition drift. These static checks do not validate Claude execution or prove that agents obey instructions.

These tests do not sign in to real Google, provision Cloudflare, validate the production TLS certificate, launch Claude or publish a game. The Node SQLite adapter is not Cloudflare workerd. A deployed smoke test must independently confirm the Durable Object migration, runtime bindings, asset routing, both real accounts and persistence.

The frontend files can be syntax-checked with `node --check cloudflare/public/assets/app.js` and `node --check cloudflare/public/assets/login.js`. Visual previews from earlier local sessions are not production screenshots. The old gateway and Python test suites cover legacy code, not this deployment.

## Framework verification — 2026-10-03

| Check | Observed result | Scope |
|---|---|---|
| Native source suites | **154 cases passed** | 50 application, 34 Google ID, 27 security, 10 redirect, 31 queue and 2 complete-catalog cases. |
| Python studio tooling | **105 cases passed** | 46 worker, 25 hook, 16 game-name kickoff, 14 bootstrap and 4 game-check runner tests. |
| Legacy Python regression | **55 passed**, one upstream deprecation warning | `tests/test_dashboard.py` and `tests/test_gateway_origin.py`; isolated pinned development environment. |
| Historical gateway regression | **30 passed** | Corrected the obsolete deployment assertion to require the native entrypoint and authenticated frontend asset routing. |
| Real local workerd smoke | **Passed** | Disposable signed identities, SQLite, worker credentials, jobs, claims, renewal, restart persistence, higher fences, stale/cross-worker rejection and completion without approval. |
| Agent/research validation | **Passed** | 29 full contracts and generated definitions; 100-reference study and 500 unique verified-listing identities. |
| Frontend static checks | **Passed** | Syntax, escaped data, rollout fallback, job controls, reference filtering/pagination and explicit category choice. |
| Browser fixture | **Not run** | Chromium unavailable; attempted downloads returned invalid/truncated archives. No visual or interaction acceptance claimed. |

The 344 automated test cases above cover distinct native, tooling and historical suites. Additional workerd assertions and validators are not included in that count. Expected failure messages inside negative tests do not indicate a failed suite.

Independent reviewers reproduced and verified fixes for candidate whitespace/CRLF preservation, commit-hook mutation, unreviewed staged-file injection, exact candidate provenance, release-review handoff and queue-capacity rollback. Mocks still replace real GitHub/Claude/store actions in tooling tests. Workerd uses disposable local state and mocked Google responses; it is not a production sign-in test.

To reproduce the local runtime test after `npm run build`:

```bash
npm install --no-save --package-lock=false wrangler@4.147.0
node tests/runtime/workerd-smoke.mjs
```

No Cloudflare deployment, connected Mac, authenticated Claude Design session, actual model job, physical-device game test, signed game build or store submission was performed in this framework change. Complete [environment acceptance](IMPLEMENTATION_ROADMAP.md) before describing the studio as operational. Keep a separate exact-build evidence ledger for each real game.


## Dashboard redesign verification — 2026-10-03

The later dashboard change was checked independently after the framework checkpoint above. `npm test` passed all seven native source files; the four new branding cases cover the exact PNG, favicon links, public MIME/security headers and preservation of private routes. Both UI static fixtures passed.

A temporary Chromium installation subsequently became available. Both full Playwright fixtures (`tests/browser_jobs.mjs` and `tests/dashboard_layout.mjs`) passed with synthetic accounts and operations data. The layout fixture uses the actual role registry and research catalog. It checks department and search filtering, prompt reading, assignment preselection, role-job navigation, mobile menus, route scroll reset, refresh scroll preservation, overflow and console errors. Desktop and mobile agents, overview and sign-in screenshots were visually inspected. See [the design preview](DASHBOARD_DESIGN.md).

The favicon PNG matches the supplied image byte-for-byte. No authentication policy, owner approval requirement, storage schema or external service was added by the redesign. These browser checks are offline fixtures: they do not prove Cloudflare deployment, real account sign-in or worker execution.
