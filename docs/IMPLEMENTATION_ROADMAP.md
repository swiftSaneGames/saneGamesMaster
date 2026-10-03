# Implementation roadmap

The 2026-10-03 framework change adds detailed contracts, executable coordination, worker/bootstrap tooling, project skills/hooks, and a 500-reference discovery library. Operational readiness still needs real evidence. GitHub issues below carry role ownership, scope, deliverables and acceptance criteria for the next Claude sessions.

| Priority | Work item | Exit evidence |
|---|---|---|
| P1 | [#1 Validate the deployed studio and connect the three Mac workers](https://github.com/swiftSaneGames/saneGamesMaster/issues/1) | Real deployment, three authenticated Macs, safe fixture pipeline and owner-only review. |
| P1 | [#2 Build and validate the reusable Godot mobile game foundation](https://github.com/swiftSaneGames/saneGamesMaster/issues/2) | Both mobile exports, deterministic game tests, saves and measured device performance. |
| P1 | [#3 Implement restricted signing and approval-bound store publication](https://github.com/swiftSaneGames/saneGamesMaster/issues/3) | Verified approval/artifact binding, restricted signing, idempotent uploads and actual store receipts. |
| P1 | [#4 Add tested hosted backup, restoration and audit recovery](https://github.com/swiftSaneGames/saneGamesMaster/issues/4) | A demonstrated isolated restore with safe session/lease reconciliation. |
| P2 | [#5 Validate native advertising, privacy and audience-specific behavior](https://github.com/swiftSaneGames/saneGamesMaster/issues/5) | Actual native SDK behavior, duplicate-reward resistance and truthful privacy disclosures. |
| P2 | [#6 Turn the 500-reference catalog into a playtested, demand-informed shortlist](https://github.com/swiftSaneGames/saneGamesMaster/issues/6) | Direct evidence of suitability and comparable sourced demand; no fabricated rankings. |

## Order and execution

Complete environment acceptance and a game foundation in parallel where independent. Validate advertising before committing a game's data/privacy design. Keep signing/publication blocked until its authorization and byte-verification adapter passes tests. Recovery work protects operating state before scaling. Research can progress in a bounded lane without starting hundreds of repositories.

Use root `prom.md` to run the organization. The producer converts each issue into small tasks, records dependencies and named output owners, then uses the configured queue or scoped local execution. Keep GitHub issue status, durable job state, source commit, evidence status and store status distinct. The current framework does not claim continuous bidirectional GitHub issue synchronization.

A checklist closes only with inspectable artifacts and the exact tests actually run. For missing devices/accounts/credentials, record the specific dependency and continue independent work. Do not substitute confident prose for deployment or playtest evidence. No paid service or automatic owner approval follows from these issues.
