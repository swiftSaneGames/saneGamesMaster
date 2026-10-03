# Claude Code skills, hooks and Design workflow

This repository contains project-local Claude Code skills and hook helpers. They supplement the detailed agent contracts. They do not install Claude, configure an account, run a studio scheduler, or provide store publishing. Nothing here installs a personal ChatGPT skill or changes global Claude settings.

## Start on an authorized Mac

1. Open the intended repository and inspect `CLAUDE.md`, `.claude/settings.json`, and `scripts/agent_hooks.py` before trusting project code.
2. Run `claude --version` and `claude --help` to check the installed CLI. Use the supported installation/update process if a needed capability is absent; record the actual result.
3. Confirm subscription authentication and included usage through the installed product. Do not introduce API keys, credits, extra usage, or billing changes to make a workflow run.
4. Open Claude Code in this repository. Inspect `/hooks`, the slash-command menu, and `/agents` where supported. Verify discovery rather than assuming that files prove activation. Managed policy may disable project hooks.
5. Invoke `/studio-plan` with the task, then use the applicable Design, implementation, and evidence workflows. Existing owner authorization remains valid; these commands do not create extra concept-approval gates.

The committed settings contain no model, effort, permission allowlist, or bypass mode. Each registered agent inherits its launching session's model. Resolve master-only references in copied game repositories through `studio-context.policy_reference` or the assigned read-only pinned master checkout, as defined by COMMON. Do not import production settings or private data merely to satisfy a documentation link.

## Model and effort choices

The owner's preferred models are Opus 5.5 and Fable 5.1. Check the installed account's `/model` menu and actual startup model before choosing. Aliases can resolve differently across providers and versions. Prefer an available included-plan choice; do not silently buy access to satisfy a preference.

After confirming availability, a session-specific launch can use `claude --model opus`. Use `fable` or an exact supported identifier only after verifying its billing status. Official documentation warns that Fable can consume usage credits, including without an interactive consent prompt in `-p` or SDK runs. Do not start unattended Fable jobs without establishing included-plan eligibility.

Ultracode is a workflow setting, not a model identifier. An optional supported launch uses `claude --model opus --effort ultracode`; this enables Ultracode and `xhigh` effort. Verify `--help` and the session's actual mode. Avoid making every small task expensive or changing shared defaults. Checkpoint when included usage ends. See [model configuration](https://code.claude.com/docs/en/model-config), checked 2026-10-03.

## Project skills

Skills provide short entry workflows and load the full role contracts only when needed. They add no tool grants or model overrides. Inputs remain task text; no skill interpolates user arguments into executable commands.

| Command | Outcome | Main contracts |
|---|---|---|
| `/studio-plan` | Scoped plan, dependencies, assignments and continuation | Director and producer |
| `/claude-design-handoff` | Claude Design brief, inspected export and implementation specification | Art/UX, design and QA |
| `/game-implementation` | Tested implementation slice and independent-review handoff | Developer and relevant specialists |
| `/release-evidence` | Exact two-platform candidate and truthful evidence pack | QA and release preparer |

These are repository workflows, not promises that every external capability exists. Use only the stages relevant to the assignment. Read [Claude skills documentation](https://code.claude.com/docs/en/skills) for current discovery and invocation behavior; checked 2026-10-03.

## Claude Design is the primary visual workflow

Use Claude Design for visual exploration, UI flows, prototypes, and design-to-code handoffs. Keep runtime gameplay, save reliability, native bridges and physical-device testing with the engineering and QA roles. A prototype does not establish a finished mobile game.

The current [Claude Design guide](https://support.claude.com/en/articles/14604416-get-started-with-claude-design) documents `/design`, `/design-sync`, and export/handoff routes. Check which are actually available to this account and CLI before use. Design and Claude Code share the subscription usage pool. The original [Anthropic announcement](https://www.anthropic.com/news/claude-design-anthropic-labs) describes the visual-product and handoff intent; use the current guide for changing product behavior. Both checked 2026-10-03.

1. Art/UX prepares a focused brief from the game requirements, states, audience, controls and target displays.
2. Use the supported Design capability or authorized product session. Include only necessary, permitted private material.
3. Inspect and refine actual output against readability, consistency, accessibility and interaction criteria.
4. Obtain the supported bundle/export and preserve a snapshot. Record source identity, date, file inventory and checksums; do not rely on an editable link as permanent version history.
5. Map visual tokens, components, assets and behavior into the selected engine with explicit acceptance cases.
6. Implement and compare the result on actual target builds. Return design differences to art/UX and functional defects to engineering.

When the adapter or account is unavailable, produce `design_handoff_pending`: the complete brief, required exports, output destinations, exact blocker and next operator action. Continue unrelated authorized work. Do not fabricate a connector, API, completed design session or automatic synchronization. Do not substitute a generic tool without acknowledging the primary Design preference.

## Hook behavior and limits

The two handlers in `.claude/settings.json` call `scripts/agent_hooks.py` with a five-second timeout. They read bounded JSON from stdin. They make no network requests, write no files, run no subprocesses, inspect no transcript contents, and retain no logs.

| Event | Behavior | Deliberate limits |
|---|---|---|
| `SessionStart` | Injects a concise protocol and checkpoint reminder. Checks whether core contract files exist beside the helper. | Does not save checkpoints, inspect assignments, select models, start agents, or verify external tools. |
| `PreToolUse`, matching `Write|Edit` | Returns a deny decision for obvious secret/signing files and stored approval records. Ordinary edits receive no decision. | Does not intercept Bash, other tools, hard links, path races, or external processes. |

Protected filenames are `.env` and `.env.*`, except dummy files ending `.example`; signing/private-key suffixes `.p12`, `.pfx`, `.jks`, `.keystore`, `.mobileprovision`, `.key`; standard private SSH key filenames; and paths under a `.studio/approvals` directory. Public certificate/key files do not match the private-key rules solely because they use `.pem` or `.pub`. This is a naming check, not secret-content detection; example files still need review for accidental secrets.

The guard checks normalized and symlink-resolved paths. Relative paths require an absolute `cwd`; Claude normally supplies absolute paths. On POSIX, ambiguous backslash paths are rejected rather than misread as Windows paths. Invalid edit metadata receives a generic denial with no raw input. An invalid SessionStart payload yields a nonblocking generic reminder error. Ordinary source files, including approval-service code and security documentation, remain editable.

There is no environment-variable bypass, Stop loop, blanket shell filter, automatic test run, or extra human approval checkpoint. A protected-file task belongs to the existing credential/approval operator workflow. Do not work around a denial by changing tools. Genuine hook maintenance is an explicit reviewed source change.

This helper reduces accidental edits. It is not OS isolation or a guarantee against an agent with shell, hook-editing or administrator access. Keep credentials and signing authority outside development identities. Missing Python, disabled hooks or command timeout can prevent execution; normal platform permissions still govern actions. Absence of hook output is never release evidence.

Schema reference: [Claude hook documentation](https://code.claude.com/docs/en/hooks), checked 2026-10-03. `SessionStart` uses `hookSpecificOutput.additionalContext`; the edit guard uses a `PreToolUse` deny decision. Returning no decision preserves normal permission handling.

## Validate and copy deliberately

Run the helper's account-free tests from the repository root:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_agent_hooks.py -v
python3 scripts/validate_agents.py
```

The tests exercise safe edits, sensitive filenames, symlink/traversal cases, malformed metadata, bounded input, privacy, CLI output and configuration scope. They do not execute Claude, certify its installed hook integration, or verify a Design account. Confirm activation in a trusted real session separately.

For a private game, copy only the explicit skill paths, the reviewed project settings, this document, and `scripts/agent_hooks.py` alongside its complete prompt kit. Do not overwrite existing project settings wholesale: reconcile hook entries and preserve unrelated configuration. Review the resulting settings and rerun tests where available. Update through a reviewed Git change with the pinned master revision; do not copy unknown `.claude` folders or personal settings.
