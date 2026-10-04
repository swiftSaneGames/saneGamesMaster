# Reference intelligence for SaneGames

## Purpose

SaneGames may learn from successful games without becoming a copy studio. Reference intelligence converts public evidence into decisions about player jobs, mechanics, friction and opportunities. It complements the existing researcher, market analyst, reference player, designer, QA and release roles.

## Pipeline

`sources -> evidence ledger -> screens/states -> player flows -> capability matrix -> player pain -> differentiation thesis -> studio plan -> implementation -> QA -> release evidence`

The pipeline deliberately separates **observation** from **decision**. A competitor capability can be rejected. A popular flow can be simplified. A player complaint can become a differentiator.

## Evidence model

Every material observation should carry a source, date, evidence type and confidence. Stable IDs make handoffs auditable:

- `E-###`: evidence item
- `S##`: screen or meaningful state
- `F##`: player flow
- `RF-###`: reference capability
- `OP-###`: improvement opportunity

Direct gameplay, public video, store material, documentation, review evidence and inference must remain distinguishable.

## Scoring

### Capability priority

Use must / should / could for the player job, not for imitation. A must-have means the SaneGames concept cannot deliver its chosen job without it.

### Opportunity score

Rank candidate improvements using evidence strength, player value, strategic fit and implementation cost. Keep the raw factors visible. Do not collapse weak evidence into a confident number.

### Product parity

Measure **job parity and behavior quality**, not pixel similarity. Useful comparisons include completion actions, time-to-fun, error recovery, accessibility, offline behavior, economy clarity and retention-loop comprehensibility.

## Player-feedback rule

No invented reviews, ratings, counts or quotes. Preserve URLs and dates. Prefer repeated themes across sources. Label small or single-source clusters as weak evidence. Competitor reviews are research material, never testimonials for SaneGames.

## Originality gate

Before a concept leaves research, document at least three meaningful differences from its closest reference. Differences can come from mechanics, progression, audience, interaction, theme, content structure, economy or accessibility. Palette swaps and renamed assets do not count.

Never import competitor source, proprietary assets, characters, copy, private APIs, level data or screenshots into a shipped game. Reference screenshots, when legitimately obtained, remain private research evidence only.

## QA additions

For each implemented player flow, QA should cover:
- happy path;
- empty and invalid input;
- interruption and recovery;
- repeated/double actions;
- expired state where applicable;
- second-user isolation where applicable;
- offline/slow-network behavior where applicable;
- mobile/touch layout;
- keyboard and accessibility behavior where applicable;
- console/runtime errors and unexpected 5xx responses for web tooling.

A reproduced S1/S2 defect blocks candidate readiness. Fixes should gain regression coverage where practical.

## Release integration

This methodology does not replace SaneGames' eight evidence categories. Release readiness still requires the exact candidate's automated, Android, iOS, save-migration, performance, privacy/ads, license and launch-material evidence. Reference research cannot approve a release.
