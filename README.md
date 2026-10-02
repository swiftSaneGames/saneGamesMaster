# SaneGames Studio Control

A release-review dashboard and the first source checkpoint for the SaneGames studio master repository.

**Master repository:** `swiftSaneGames/saneGamesMaster`

The existing repository is private. The source is structured for the agreed public-master/private-games model; visibility has not been changed.

**Intended deployment hostname:** `prod.sanegames.swiftsane.com`

The hostname is a deployment target, not a live-deployment claim. The current application is **v0.1, a tested local foundation**, not a complete game factory or a production-approved internet service.

## Implemented

- Responsive overview, portfolio, release-review, maintenance and activity screens.
- Project records and candidate intake endpoints.
- Android and iOS build references, SHA-256 fields and an immutable candidate manifest.
- Eight mandatory evidence gates; an agent cannot approve through its intake credential.
- Owner approval or change requests, with confirmation and playtesting attestations.
- SQLite-backed state, expiring sessions, CSRF/origin checks and a hash-chained application audit log.
- GitHub OAuth sign-in code for a configured numeric owner ID, with an account-level two-factor check.
- Clearly labeled, loopback-only demo mode. Production starts without sample projects.

## Not implemented or not verified

- Dashboard-driven GitHub repository creation and synchronization are **not implemented**. Uploading this source repository does not connect the dashboard to GitHub workers.
- Claude orchestration, Mac worker coordination and the game-generation pipeline are **not implemented**.
- Google Play and App Store upload adapters are **not implemented**. Approval records do not upload or publish anything.
- Real GitHub OAuth, TLS, DNS, reverse-proxy behavior and end-to-end browser cookie transport have **not been validated**.
- The 30-day maintenance view is implemented; automatic scheduling from real store release events is **not connected**.
- No complete competitor catalog, final game-engine selection or released game is included in this checkpoint.

## Local demo

Use Python 3.11 or newer. This checkpoint was exercised with Python 3.13. Do not expose demo mode to the internet.

```bash
bash scripts/run_demo.sh
```

Open `http://127.0.0.1:8787` locally. The launcher creates `.venv`, installs pinned dependencies and creates ignored demo state under `var/demo`. All sample projects, build links and QA evidence are fictional.

## Backend tests

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
```

The current suite contains **36 tests**. See `docs/TESTING.md` for the exact scope and untested production boundaries.

## Browser tests

Playwright is optional and is not a runtime dependency. Install it and Chromium in the development environment to run either test script:

```bash
.venv/bin/python -m pip install playwright
.venv/bin/python -m playwright install chromium
.venv/bin/python tests/browser_smoke.py
```

`tests/browser_smoke.py` starts a local HTTP server and tests browser behavior. `tests/browser_offline.py` instead uses an in-process test bridge for restricted environments. **An offline bridge pass is not a network end-to-end pass.** Output goes to ignored `test-results/` unless `BROWSER_OUTPUT` is set.

## Production preparation

Read `docs/DEPLOYMENT.md` and `docs/SECURITY.md` before configuring any public endpoint. The `.env.production.example` file documents variables; the application does not automatically load it. Keep actual configuration outside this public checkout.

Do not publish the loopback demo, place production state inside Git, or give coding agents the owner's browser session. No store-signing credential belongs on the internet-facing dashboard host.

## Repository map

```text
CLAUDE.md                  Agent instructions and studio boundaries
README.md                  Checkpoint capabilities and setup
 dashboard/                FastAPI, SQLite and browser UI
 docs/                     Decisions, deployment, security and test scope
 scripts/                  Local launch, backup and intake utilities
 tests/                    Backend tests and optional browser checks
 .claude/agents/            Initial dashboard reviewer/release role prompts
 scraper/                  Evidence-first reference-research instructions
 examples/                 Instructions for private candidate manifests
```

This master repository contains reusable studio software and instructions. Actual games, original production assets, private research, release manifests, operational data and secrets belong in private storage or separate private game repositories.

Public visibility does not select an open-source license. The owner still needs to choose a license for original master-repository code before presenting it as reusable open source.
