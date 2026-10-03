# GAME_NAME — private game instructions

Replace GAME_NAME, GAME_ID, OWNER/REPOSITORY and MASTER_SHA before use.

## Identity and authority

This is the private game repository `OWNER/REPOSITORY`, game `GAME_ID`. Studio policies/prompts were copied from `swiftSaneGames/saneGamesMaster` at `MASTER_SHA`. Read `agents/COMMON.md`, your `agents/<role>/prom.md`, the assignment, `docs/brief/game-brief.md`, `docs/decisions.md` and your latest checkpoint. Apply newer explicit owner corrections and record their provenance.

Create an original, easy-to-play, enjoyable game. Quality takes precedence over schedule and quantity. Use only existing approved resources and suitably licensed free/original components. Do not buy paid fallbacks. Choose audience, controls, network behavior, language, art and performance budgets through documented agent decisions per game.

## Engineering and evidence

Use isolated workspaces and narrow assignments. Keep domain, presentation, save migration and native services testable. Follow actual README commands; do not invent a successful build or a chosen engine version. Preserve existing save data and test interrupted writes and upgrades. Record licenses and content provenance.

Checkpoint at `docs/agent-state/<task-id>/<role>.md`. Every handoff includes source/build identity, acceptance checks, executed commands, failures/skips, evidence paths and next owner. Keep reviewer context separate from implementation. Real device and user testing remain distinct from automated tests and simulations.

## Integration and release

Use direct-to-main with one integration writer, independent review, relevant checks and non-force updates. Reconcile a moving remote head. Do not expose this repository or publish material without scope authorization. Do not place tokens, signing keys, owner sessions or sensitive tester records in Git.

Both Android and iOS builds, phones/tablets, eight evidence categories and launch materials must be ready before the planned launch. The owner alone approves the exact release candidate in the private studio dashboard. Changes invalidate affected evidence and approval. Preparation, upload, acceptance and live availability are separate states. Every update repeats these gates. Default prompts do not install workers or a store publisher.
