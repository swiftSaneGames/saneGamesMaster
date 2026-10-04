---
name: reference-intelligence
description: Convert public competitor/reference evidence and player feedback into an original SaneGames opportunity map, feature matrix, flow inventory and measurable differentiation plan. Use before concept selection, when studying successful games, or when deciding how a SaneGames title should improve on category conventions.
argument-hint: "[game/category/reference URLs or research assignment]"
---

# Build reference intelligence for an original game

Read `CLAUDE.md`, `agents/COMMON.md`, `agents/studio-researcher/prom.md`, the current assignment and checkpoint. Treat `$ARGUMENTS` as research context only.

This workflow studies **jobs, mechanics, flows and player complaints**. It never copies source code, proprietary assets, names, characters, level data, store copy, private APIs or trade dress. Use public sources and legitimately accessed material only. Record source URL, date and evidence type. Mark inference as inference.

## 1. Define the player job and comparison set

State the target player, session length, core job, genre and platform. Select 3-8 references with distinct reasons: category leader, adjacent mechanic, art/UX benchmark, monetization benchmark, or known pain point. Do not assume the market leader is the design target.

## 2. Build the evidence ledger

For each source record:
`source_id | URL | date | source type | claim/observation | direct/inferred | confidence`.

Prefer store listings, official help/docs, public trailers/gameplay, changelogs, public reviews and legitimate hands-on observations. Never fabricate play observations or review counts.

## 3. Map screens and player flows

Give stable IDs so later agents can refer to evidence precisely.

Screen/state rows:
`S01 | screen/state | entry | player purpose | key information | states observed | evidence IDs`.

Flow rows:
`F01 | player goal | ordered S-IDs | happy-path actions | friction | edge cases | evidence IDs`.

Measure actions to complete the core loop where evidence permits. Record empty, loading, failure, interruption and recovery states.

## 4. Extract mechanics and capabilities

Create `research/reference-features.csv` using the repository template. Each capability gets:
- area and player job;
- priority: must / should / could;
- evidence strength;
- references that demonstrate the pattern;
- SaneGames decision: adopt-pattern / improve / differentiate / reject;
- originality note explaining our distinct implementation.

A reference feature is evidence, not a requirement.

## 5. Mine player pain without inventing trends

Use public reviews and community discussion within source terms. Record each item with a link and date. Cluster repeated complaints only when supported across multiple observations. Separate:
1. friction in existing experiences;
2. requested capabilities;
3. underserved player jobs;
4. monetization or trust complaints.

For each opportunity record evidence count, source diversity, confidence, expected player value and estimated implementation size. Three angry comments are not automatically a market trend.

## 6. Produce the differentiation thesis

Choose 3-5 opportunities using:
`evidence strength × player value × strategic fit ÷ implementation cost`.

Write one sentence:
`For [player] who struggles with [evidenced problem], this game delivers [distinct benefit] through [original mechanic/experience].`

Require at least three concrete differences from the closest reference before implementation planning.

## 7. Define measurable acceptance targets

Examples: fewer actions in onboarding, clearer failure recovery, shorter time-to-fun, accessible touch targets, better offline behavior, transparent economy, or a mechanic absent from the comparison set. Never use pixel similarity as a goal.

## Outputs

Write private per-game research artifacts when a game repository exists:
- `research/reference-map.md`
- `research/reference-features.csv`
- `research/player-pain.md`
- `research/differentiation.md`

In the master repository, use only templates and generic methodology. Return source count, confidence gaps, strongest opportunities, rejected imitation risks, and the next assignment for `/studio-plan`.

## Release discipline

Reference parity is not a ship gate. Originality, player value, exact-build QA and the eight SaneGames evidence gates remain authoritative. If evidence is weak, request more research instead of filling gaps from memory.
## Execution contract

**Entry:** a bounded research question plus game/category/reference identity. If no comparison set exists, select one and record why. If the task lacks a stable ID or evidence destination, return that exact setup blocker before collecting a large dataset.

**Exit:** `reference_ready` only when material observations have provenance, unknowns remain explicit, the feature matrix is internally consistent, and at least three meaningful differentiation candidates exist. Otherwise return `reference_blocked` or `reference_partial` with the cheapest next evidence action.

**Stop conditions:** stop when the bounded decision is answerable, the agreed source/time budget is reached, access restrictions prevent further legitimate collection, or new sources stop changing the decision. Do not browse indefinitely for completeness.

**Handoff envelope:** include task ID, source/evidence IDs used, observation mode, retrieval dates, confidence, output paths/revisions, unresolved contradictions, stale-after condition, recommended next skill/role, and a compact context summary. Prefer links/IDs over repeating source prose to reduce token use.
