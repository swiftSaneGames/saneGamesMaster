# Agent prompt directory

This directory contains **29 detailed role contracts**: a studio director, the ten original roles, and eighteen additional specialists. Every role has its own `prom.md`, plus a generated entrypoint under `.claude/agents/`. The organizational hierarchy describes accountability; it is not a running distributed agent system.

## Start or resume

1. Read root [prom.md](../prom.md), [CLAUDE.md](../CLAUDE.md) and [COMMON.md](COMMON.md).
2. Give the coordinator a concrete task using [the assignment template](../templates/agents/task.md), including repository, base SHA, output and acceptance checks.
3. The coordinator dispatches only relevant roles. Each reads its full prompt and current checkpoint. Specialists return further delegation requests to the coordinator.
4. Persist [checkpoints](../templates/agents/checkpoint.md) and [handoffs](../templates/agents/handoff.md) in the private game's task records. Read-only roles return text for coordinator persistence.
5. Route independently reviewed changes through the one integration writer. Final exact-build approval remains the owner's private dashboard action.

Read only the role context needed for the assignment. Do not load every prompt into every agent. Long contracts establish responsibilities; concise checkpoints preserve current work.

## Registered roles

| Role | Organizational parent | Dashboard category |
|---|---|---|
| [studio-director](studio-director/prom.md) | Owner assignment | `producer` |
| [studio-researcher](studio-researcher/prom.md) | studio-director | `researcher` |
| [reference-player](reference-player/prom.md) | studio-researcher | `researcher` |
| [market-analyst](market-analyst/prom.md) | studio-researcher | `researcher` |
| [studio-designer](studio-designer/prom.md) | studio-director | `designer` |
| [economy-designer](economy-designer/prom.md) | studio-designer | `designer` |
| [content-designer](content-designer/prom.md) | studio-designer | `designer` |
| [studio-architect](studio-architect/prom.md) | studio-director | `architect` |
| [platform-engineer](platform-engineer/prom.md) | studio-architect | `architect` |
| [security-reviewer](security-reviewer/prom.md) | studio-architect | `architect` |
| [studio-producer](studio-producer/prom.md) | studio-director | `producer` |
| [repository-bootstrapper](repository-bootstrapper/prom.md) | studio-producer | `producer` |
| [integration-writer](integration-writer/prom.md) | studio-producer | `producer` |
| [studio-developer](studio-developer/prom.md) | studio-director | `developer` |
| [gameplay-engineer](gameplay-engineer/prom.md) | studio-developer | `developer` |
| [save-systems-engineer](save-systems-engineer/prom.md) | studio-developer | `developer` |
| [studio-art-ux](studio-art-ux/prom.md) | studio-director | `art-ux` |
| [asset-artist](asset-artist/prom.md) | studio-art-ux | `art-ux` |
| [audio-designer](audio-designer/prom.md) | studio-art-ux | `art-ux` |
| [studio-qa](studio-qa/prom.md) | studio-director | `qa` |
| [device-tester](device-tester/prom.md) | studio-qa | `qa` |
| [performance-tester](performance-tester/prom.md) | studio-qa | `qa` |
| [uat-coordinator](uat-coordinator/prom.md) | studio-qa | `qa` |
| [release-preparer](release-preparer/prom.md) | studio-director | `release` |
| [store-compliance](store-compliance/prom.md) | release-preparer | `release` |
| [launch-marketer](launch-marketer/prom.md) | release-preparer | `release` |
| [studio-liveops](studio-liveops/prom.md) | studio-director | `liveops` |
| [player-feedback-analyst](player-feedback-analyst/prom.md) | studio-liveops | `liveops` |
| [dashboard-reviewer](dashboard-reviewer/prom.md) | studio-director | `qa` |

The nine dashboard categories already exist in `cloudflare/native/models.mjs`. This change maps specialists to those categories; it does not modify the task API enum or add a worker queue. The dashboard's role browser displays these full contracts and labels them as definitions, not connected processes.

## How Claude Code loads them

Canonical sources are `agents/registry.json`, `agents/COMMON.md` and `agents/<role>/prom.md`. Generated `.claude/agents/<role>.md` files contain name, description, explicit tools, inherited model and instructions to read the complete contract. A file called `prom.md` alone is not assumed to auto-load. Start a session in the correct repository and verify the registered agents through the installed CLI's agent interface before relying on dispatch.

Only the director definition grants the Agent tool. All other roles execute as coordinator-dispatched tasks even when the organization chart calls them children. This keeps execution compatible with differing installed nesting limits. If dispatch or tools are unavailable, report the limitation and use explicit sequential handoffs without falsely claiming independent execution. Do not enable bypass-permission modes.

The tool lists deliberately constrain research and review roles. Read-only roles hand report text back; Bash remains powerful despite a role's read-only workflow. Enforce production/signing/owner identity separation outside the prompt. Tools, subscriptions and credentials are not installed by these definitions.

## Maintain and validate

Edit canonical sources, then run:

```bash
python3 scripts/sync_agent_definitions.py
python3 scripts/validate_agents.py
python3 scripts/sync_agent_definitions.py --check
npm test  # master repository only; games use their own README build/test commands
```

The validator checks original-role coverage, one prompt/definition per registry entry, required sections, minimum contract depth, parent integrity, dashboard mapping, default dispatch permissions and generated-file drift. It does not prove prompt obedience, game quality or real device testing.

For a new role, add an explicit parent/category/tool set to the registry, write its prompt with the standard ten sections, regenerate, and independently review scope and handoffs. Do not merely copy another role's text. Pin the master revision when copying into a private game repository; use [the bootstrap kit](../templates/game/README.md). Reconcile game-specific overrides before syncing future prompt updates.

## Remaining work

See [the repository coverage audit](../docs/REPOSITORY_COVERAGE_AUDIT.md). Worker orchestration, automatic repository synchronization, game-runtime scaffolds, native-ad/export validation, current demand ranking, physical-device evidence and store adapters remain separate engineering or research work.

Compatibility reference: [official Claude Code subagent documentation](https://code.claude.com/docs/en/sub-agents), checked 2026-10-03 for file-based definitions and tool allowlists. Verify the installed CLI before using version-dependent features; no SDK, nested-spawn or runtime-success guarantee follows from this reference.

