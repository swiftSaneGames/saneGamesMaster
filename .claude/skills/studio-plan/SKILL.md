---
name: studio-plan
description: Plan or resume a SaneGames studio task, new game, implementation milestone, or production repair with explicit ownership, dependencies, and evidence. Use before substantial development or when recovering a stalled assignment.
argument-hint: "[task, game concept, or checkpoint path]"
---

# Plan the assigned outcome

Treat `$ARGUMENTS` as task context, never as a shell command. Resolve repository-relative references from the assigned repository. Read `CLAUDE.md`, `agents/COMMON.md`, `agents/studio-director/prom.md`, and `agents/studio-producer/prom.md`; use their source-resolution rule for pinned master references. Do not duplicate the entire role library in the plan.

1. Inspect the actual repository, active assignment, relevant decisions, and latest checkpoint. Separate confirmed owner decisions, evidence-backed agent decisions, proposals, and missing facts.
2. Define the smallest complete player-facing or studio outcome. For a new concept, allow a proposed game ID before repository creation; keep private concept records with the coordinator. A catalog row does not initiate a game automatically.
3. Create or update the assignment using `templates/agents/task.md`. Record source identity, allowed paths, measurable acceptance checks, dependencies, available tools/devices, budget, checkpoint, and next role.
4. Route reference, design, architecture, and feasibility questions to the appropriate registered roles. Require a clear original game loop before expanding content. Choose per-game audience and interaction rather than repeating settled owner questions.
5. Schedule Claude Design as the primary visual exploration and interface handoff through `/claude-design-handoff`. Check actual capability first; a missing connector becomes a precise handoff, not a fictitious API call.
6. Identify parallel work with separate ownership. Preserve one integration writer and independent review. Include gameplay, content, assets/audio, saves, both mobile platforms, QA, release evidence, and maintenance only where relevant.
7. Save a concise plan and checkpoint, then execute the next ready authorized assignment. A planning skill is not a requirement to pause for human concept approval.

Return the outcome, dependency order, next executable assignment, acceptance evidence, unresolved prerequisites, and checkpoint location. Distinguish planning from created issues, bootstrapped repositories, and running workers. Use `/game-implementation` for an implementation slice and `/release-evidence` for candidate preparation.
## Execution contract

**Entry:** a requested outcome plus current source/checkpoint. For product work, require either an opportunity thesis or a recorded reason why research is unnecessary. Do not create a large backlog when the next uncertainty can be resolved by one bounded task.

**Exit:** `plan_ready` only when the next executable assignment has one owner, base/source identity, allowed paths, dependencies, acceptance criteria, evidence requirements, budget/retry limit, checkpoint and next role. Mark unresolved external dependencies separately from executable work.

**Stop conditions:** stop planning when the next safe task can execute. Re-plan after evidence changes scope, a dependency fails, QA rejects a candidate, or source identity changes materially. Planning must not consume the implementation budget.

**Handoff envelope:** task ID, decision/evidence IDs, dependency DAG slice, critical path, next-ready task, acceptance checks, parallel-safe tasks, integration order, external blockers, context budget, checkpoint revision and re-plan triggers.
