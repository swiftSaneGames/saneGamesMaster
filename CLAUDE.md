# SaneGames master-repository instructions

## Purpose and current state

Operate a quality-first casual game studio. The master repository is `swiftSaneGames/saneGamesMaster`, not a game repository. Its source targets public reuse, but the existing GitHub visibility is private; do not change visibility without explicit authorization. The current implementation is a dashboard foundation. Read README.md, docs/DECISIONS.md and docs/TESTING.md before work. Never report planned integrations as implemented.

## Agreed operating model

- The portfolio ambition is 100 finished games. Sixty days is aspirational; never ship failed or unfinished work to satisfy it.
- Primary genres: business simulation and idle management. Decision games, puzzles and arcade games are also allowed. Large multiplayer shooters are out of scope.
- Start from original code and legitimately licensed components. Competitor games are references, not assets or source code to extract.
- Three Macs are available. One Claude Max 20x subscription is shared. No paid API fallback, paid cloud, paid assets or contractors without a new owner decision.
- Existing hardware, the Claude subscription, a domain and store enrollment are available. Do not interpret these as permission to purchase other services.
- Each game has a separate **private** repository. Reusable master code and generic operating documents are **public**.
- Use direct commits to main. One designated writer serializes pushes per repository. Use isolated working copies for parallel agents. Review, tests, a diff check and secret checks still precede each push.
- Never force-push, discard another agent's work or overwrite an unknown remote history. Fetch and reconcile before pushing. No CI deployment on every main commit.
- Agents evaluate concepts, prototypes and architecture without human approval checkpoints. The owner supplies optional gameplay recordings when reference evidence is insufficient.
- The only scheduled human gate is the final review of exact Android and iOS builds and launch materials in the private dashboard. Agents never self-approve.
- Both mobile platforms need readiness before either planned launch. Store review and actual availability are separate external events.
- Target a meaningful update every 30 days. Reserve maintenance capacity; urgent defects take priority and larger expansions follow player demand.
- Target markets follow supported download-demand research. Label estimates and dates. Never infer country rankings from worldwide totals.

## Implementation discipline

1. Choose a small task with explicit acceptance criteria. Save a concise handoff before long work.
2. Inspect current files and tests. Preserve existing working behavior.
3. Implement in isolation; run targeted tests and then the complete backend suite.
4. Ask an independent reviewer role to inspect the diff and the actual evidence. A different prompt is not a different security principal.
5. The designated writer checks secrets and private data, inspects the diff, and commits directly to main. Push only through configured access; never embed credentials in URLs or source.
6. Report local commit IDs, real test results and verified push status separately. A commit is not a remote push, a dashboard approval is not a store submission, and submission is not publication.

## Dashboard trust boundary

The intake agent can submit project records and candidates. It cannot approve a release through the HTTP API. Store-signing workers are separate from dashboard and development workers. Do not give agents the owner's browser cookies or the ability to modify production approvals. An agent with service-account or database administration rights could bypass application rules; OS isolation and deployment ownership must enforce the separation.

Approval is bound to a manifest containing the source commit, both artifact hashes, evidence and launch summary. A changed candidate invalidates earlier approval. The future publishing worker must verify the actual downloaded artifact bytes, evidence provenance and current approval again before any upload. This dashboard presently validates structure and reported gate status, not the truth of external test reports.

## Quality and research rules

Never fabricate played-game observations, download numbers, test results, installed integrations or a deployment. Distinguish direct gameplay, video observations and inference. Put evidence in private game repositories. Track third-party asset licenses and required attribution. Prefer original mechanics combinations, visual identity, names and progression.

Use eight evidence categories: automated tests; Android device testing; iOS device testing; save migration; performance; privacy/advertising; license review; launch materials. The final owner review does not replace these checks. Audience, connectivity and art direction are chosen per game.

No credentials, signing keys, production databases, game binaries, private manifests or user data may enter the public tree. Never paste secrets into chat. Stop paid-overage paths rather than enabling billing.

## Current work queue

Keep the dashboard usable locally. Complete deployment isolation and real OAuth/TLS tests before public hosting. Implement repository access only after configured authorization; do not reuse exposed credentials. Worker orchestration, store adapters, full role prompts, market catalog and game templates remain separate unfinished workstreams.
