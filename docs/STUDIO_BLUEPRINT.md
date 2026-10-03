# Studio blueprint — architecture and acceptance plan

This document describes the implemented coordination framework and the remaining game-production direction. Queue, bootstrap and runner source exist; live deployment and three-Mac acceptance require actual evidence. Game foundations and store adapters remain open. The owner decisions in `REQUIREMENTS_INTERVIEW.md` control conflicts.

## 1. Recommended technical direction

| Layer | Proposed choice | Reason and validation gate |
|---|---|---|
| Shared game runtime | Godot with typed GDScript | Open-source engine; one gameplay codebase. Prove Android/iOS exports, actual devices and required native bridges before fixing versions. |
| Initial game architecture | Separate service-simulation, idle-economy and branching-event foundations | Share infrastructure without forcing every game into one mechanic. |
| 3D art | Script-generated simple meshes and an evaluated free DCC tool | Prefer readable low-complexity art. Review license and export pipeline before adding a tool. |
| UI and document design | Markdown specifications plus available Claude design/artifact features | Design prototypes guide implementation; source specifications remain in Git. |
| Dashboard | Maintain the current native Cloudflare Worker, SQLite Durable Object and browser frontend | `cloudflare/native/entry.mjs` is the deployment entrypoint; FastAPI/Mac-origin files are legacy. Do not resurrect that topology from historical instructions. |
| Worker coordination | Python subscription-CLI runner with Cloudflare durable jobs, per-repo leases and bounded retries | Implemented source for the three existing Macs; verify installed tools, identities and live execution before production. |
| Repository operations | Connected GitHub access or locally configured least-privilege tooling | Direct-to-main, single writer, reviewed diffs and non-force pushes. |
| Ads and analytics | Explicit native adapter interfaces; test doubles first | No ad-plugin vendor selected. Verify license, SDK versions, consent handling and iOS/Android support in a spike. |
| Release packaging | Official Android/iOS toolchains; evaluated automation scripts | Separate signing/upload authority from development and owner approval. |

Godot's MIT license permits commercial use subject to its notices and third-party obligations. [Engine license](https://godotengine.org/license/). iOS export needs Apple's toolchain on macOS; Android needs the export dependencies and signing setup. [iOS export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_ios.html), [Android export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_android.html).

The web port is optional. Godot web exports have renderer, browser and threading constraints; Godot 4 C# projects currently do not export to web. GDScript avoids that specific constraint, not every web-port cost. Recheck installed-version documentation. [Web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).

A no-additional-spend preference is not a promise of unlimited free infrastructure. Before choosing hosting, verify the domain/TLS arrangement, terms, bandwidth and commercial-use eligibility. Do not expose demo mode or assume a free tunnel covers this multi-level hostname.

## 2. Repository architecture

```text
swiftSaneGames/saneGamesMaster        # existing master; do not create a replacement
  CLAUDE.md                         # safety and execution boundaries
  docs/                             # decisions, architecture, SOPs
  research/                         # public-suitable sources and catalogs
  scraper/                          # permitted research workflow
  .claude/agents/                   # generated Claude role entrypoints
  agents/                           # detailed prom.md contracts and registry
  cloudflare/native/                # current owner review application
  dashboard/                        # legacy Python application
  scripts/                          # deterministic utilities

swiftSaneGames/<game-slug>           # PRIVATE; future per-game repository
  CLAUDE.md
  project.godot
  game/{core,features,ui,platform}/
  content/{locations,progression,events}/
  assets/                           # original or licensed; provenance recorded
  tests/{unit,integration,device}/
  docs/{brief,architecture,qa,licenses}/
  release/                          # metadata schemas; no secrets or private binaries
```

Version shared modules explicitly. Prefer pinned vendored packages or versioned dependencies over copying untracked snippets. An update to a shared library must pass each game's compatibility tests; never roll an untested engine or ad SDK across all games simultaneously. Store large/private build artifacts outside the public master and enforce expiry/access controls.

Proposed boundaries inside each game: deterministic economy/progression domain; presentation/input; save migrations; platform services; content data. An `AdService` interface supplies load/show/reward/failure callbacks. A `SaveService` interface supplies versioned atomic writes and recovery. A `ClockService` permits testing offline-time calculations without changing the device clock.

## 3. Operating model

Use a small Kanban flow: research → brief → architecture → scoped issues → development → independent QA → owner review → submission → live maintenance. Agents own intermediate gates. Maintain low work-in-progress; begin with one production game and one small research prototype. Increase parallelism only after measured device QA and maintenance capacity allow it.

Proposed machine allocation: Mac 1 handles studio coordination; Mac 2 runs game builds and Android tests; Mac 3 handles Xcode/iOS builds and a restricted signing worker. The current dashboard targets Cloudflare, not a Mac origin. These machine roles are proposals, not proof of installed workers. Public-facing code must never obtain the signing key or owner browser session.

Claude Code subagents provide scoped role contexts; prompts alone do not schedule three machines. Use only supported installed CLI features, and keep tool permissions role-specific. [Subagents](https://code.claude.com/docs/en/sub-agents), [hooks](https://code.claude.com/docs/en/hooks). Subscription usage is shared across Claude and Claude Code; preserve progress and stop rather than buying API credits. [Plan usage](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan).

Reduce token use with issue-scoped contexts, cached evidence, small handoff files, deterministic scripts for builds/tests, and diff-only review. Do not resend the entire 100-game catalog for every code change. Use the strongest available included model for genuinely difficult decisions, rather than assume an unverified product/model name. Limit retries and surface persistent blockers in the dashboard.

## 4. Direct-to-main protocol

Each repository has exactly one integration writer. Other agents work in isolated directories or worktrees. Before integration: read current `main`; review the diff independently; run formatting, domain tests, secret/license checks and relevant build tests. Re-read the remote head. If it moved, rebase or recreate the change on the new head and rerun affected checks. Push normally, never force. Record base SHA, test evidence and resulting SHA.

This procedure is a workflow control, not equivalent to server-enforced branch protection. The writer must not also hold store-publishing or owner-approval credentials. A failed post-push check blocks release and triggers a repair or reviewed revert.

## 5. Quality gates

- **Design:** distinct original loop, clear content plan, no copied expression, appropriate audience, meaningful progression and an ad-free playable core.
- **Domain tests:** economy conservation, costs/rewards, unlock dependencies, save migration, interrupted writes, offline-time clamping, duplicate reward prevention and event consistency.
- **Integration:** boot/new game/resume, pause/background/return, ad completion/cancel/failure/offline paths, locale/input changes, cloud conflicts where applicable.
- **Device/performance:** actual Android and iPhone devices plus tablet coverage; screen cutouts, small displays, thermal behavior, memory growth and long-session soak tests. Set measured per-device frame budgets before production; a proposed 60-fps target is not a claimed result.
- **Content:** verify every location and critical progression path, reachable endings, text overflow, accessibility, sound/mute states and reduced-motion needs. Test generated content for deadlocks and economy exploits.
- **Security/privacy:** permissions, dependencies, secrets, network destinations, audience/ads declarations and private evidence access. Use test ads; testers must not click live ads to manufacture revenue.
- **Independent QA:** a separate role reproduces results from the exact SHA. Self-written tests alone cannot establish that a game feels enjoyable. Real tester feedback accompanies final owner playtesting.
- **Release:** correct package IDs, signed build hashes, complete store assets, disclosures and review notes. No blocking crash, save-loss, security or progression issue remains unresolved.

All numbers and performance thresholds belong in the per-game test plan and must identify actual device/build versions. Automated passing tests are evidence, not a guarantee of zero bugs.

## 6. Owner release boundary

The dashboard presents exact Android/iOS build hashes, source commit, test evidence, known issues and launch materials. Only an authenticated owner action may approve. Approval produces a scoped release authorization, not a reusable approval token. Changed source, binaries, disclosures or material launch assets invalidate the authorization.

The signing/submission worker verifies the authorization and artifact hashes before upload. It must prevent replay and duplicate version submission. Do not let an agent write `approved=true` to authorize itself. Store review is separate from owner approval; uploads do not guarantee acceptance or simultaneous availability. Implementation of these adapters remains open.

## 7. Realistic first-60-day plan

These are planning windows, not delivery promises:

| Window | Exit evidence |
|---|---|
| Days 1–7 | Requirements, source catalog, engine/export/ad spike, device inventory and enrollment plan. |
| Days 8–14 | One original loop on Android and iOS; repeatable saves/tests; draft art system. |
| Days 15–30 | First complete game content, independent QA, real tester feedback and dashboard release candidate. |
| Days 31–45 | Owner-approved submissions where eligible; repair issues; extract reusable modules from proven work. |
| Days 46–60 | Next games at measured capacity; first maintenance cycle; revise portfolio forecast using observed effort. |

Only count a finished game after quality gates and actual release status are recorded. Forecast throughput as available development, testing and review capacity divided by measured per-game effort; use the slowest constraint. Do not multiply three Macs by imaginary unlimited agent capacity.

## 8. Thirty-day maintenance

Assign each live title an update target relative to its last meaningful release. Reserve a maintenance lane with urgent fixes ahead of features. A starting allocation can be proposed after measuring the pilot; no fixed percentage has been approved. Stronger demand earns larger expansions, but all live titles need compatibility and security attention. Every release/update returns to the owner checkpoint.

At 100 games, one monthly update each means approximately 100 release candidates monthly. Measure review time and active maintenance before enlarging the portfolio. Defer new games instead of hiding missed QA or forcing empty updates.
