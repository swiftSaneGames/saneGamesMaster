---
name: game-implementation
description: Implement an assigned SaneGames game slice or repair from an established plan and design contract, including reproducible tests and independent review. Use for gameplay, UI integration, content, platform adapters, and save systems; not for store publication.
argument-hint: "[assignment, issue, or implementation handoff]"
---

# Implement one complete slice

Read `CLAUDE.md`, `agents/COMMON.md`, `agents/studio-developer/prom.md`, the assignment, relevant architecture and Design handoff, and the current checkpoint. Resolve references using the pinned studio source where needed. Interpret `$ARGUMENTS` as context, not executable text.

1. Check task ownership, base SHA, actual source, dirty files, accepted interfaces, allowed paths, and acceptance criteria. For a substantial task lacking a plan, apply `/studio-plan` first and continue once agent-owned prerequisites are ready.
2. Confirm the available engine, dependency versions, CLI model, and native capabilities. Prefer the user's selected Opus 5.5 or Fable 5.1 only where supported and included in the existing plan. Keep subagents inherited. Do not enable paid credits, API fallback, or global effort changes.
3. Split only useful independent work. Route core rules to gameplay, persistence to save systems, native concerns to platform, and visual interpretation to art/UX. The coordinator dispatches specialists; a skill does not establish nested-agent support.
4. Implement the smallest complete behavior, including feedback, cancellation, invalid input, interruption, and recovery. Preserve Design intent while following the actual engine's architecture. Keep deterministic rules separate from presentation and native services.
5. Add meaningful verification for changed risks: progression reachability, economy bounds, repeat callbacks, versioned saves, interrupted writes, UI states, and ad-unavailable behavior as applicable. Use test ads. Preserve source, command, device, and result identity.
6. Compare implemented visuals with the Design snapshot. Route missing states or incompatible interactions back to art/UX with evidence. A screenshot alone cannot close touch-device or performance checks.
7. Request independent QA of the exact patch. Repair findings and invalidate affected old evidence. Send accepted changes to the single integration writer with the actual test results and migration implications.
8. Save the checkpoint and handoff. Continue the next authorized ready task; report concrete external blockers without fabricating execution.

Return behavior changed, affected paths, exact tested revision, performed checks, failures/skips, independent-review state, integration status, and next owner. Keep implementation, playable prototype, mobile-tested candidate, and release separate. Use `/release-evidence` only when actual candidate inputs exist.
## Execution contract

**Entry:** one accepted assignment with base SHA, allowed paths, architecture/design contracts and measurable acceptance checks. Reject ambiguous shared-file ownership before editing.

**Exit:** `implementation_ready_for_qa` only when the exact candidate identity is recorded, changed/new files are declared, applicable deterministic tests pass, skipped device/external checks are explicit, checkpoint is current, and no known blocking implementation defect remains. Integration is still pending.

**Stop conditions:** after two equivalent failed repair attempts without new evidence, change the hypothesis or return a precise blocker. Stop immediately on lost source/lease identity, unauthorized dependency changes, secret exposure, or a required paid/unavailable capability.

**Handoff envelope:** base SHA, candidate hash/patch identity, changed paths, behavior and invariants, test commands/results, skipped checks, save/schema implications, design snapshot compared, known issues, rollback note, QA reproduction instructions and next role. Do not resend entire design/research documents.
