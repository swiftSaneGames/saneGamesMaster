# Mac worker setup and operating contract

`scripts/studio_worker.py` implements a bounded worker around the installed Claude Code subscription CLI. It can claim jobs, preserve isolated work, consume predecessor artifacts, renew leases, return structured evidence, and perform reviewed source integration on a separately configured writer. It does not install Claude, authenticate accounts, enable paid APIs, approve releases, or publish store builds. These instructions and offline tests do not establish that any Mac is running the worker.

## Initial setup

Use Python 3.12 or newer, Git, and an installed Claude Code CLI on a dedicated studio OS account. Install and authenticate tools through their supported procedures. The account must have its own authorized subscription session and only the repository access its tasks need. All three Macs share the owner's existing subscription allowance; three processes do not create three allowances.

1. Integrate the current master source and generic agent contracts before launching a worker. Each game must contain `CLAUDE.md`, `agents/COMMON.md`, its canonical role prompts, and `.claude/agents` definitions from the studio bootstrap. The runner deliberately refuses missing contracts instead of inventing a role.
2. Copy `config/worker.example.json` to private local configuration outside a repository. Replace all paths with real absolute paths. Set `server_url` to the verified HTTPS dashboard origin. The example matches the current configured `APP_ORIGIN`; this file alone does not prove live deployment or login.
3. Configure a private `state_root` outside source checkouts. It holds job worktrees, logs, assignment records, checkpoints, and integration journals. Configure a separate private `artifact_root` for dependency evidence. Do not place either directory inside the public-suitable master or any game source checkout.
4. Register this worker's secret in the server's `WORKER_TOKENS_JSON` secret mapping, using the backend's documented worker-ID-to-secret format. Supply only its own secret through `STUDIO_WORKER_TOKEN` in the worker process environment. Use a strong unique secret of at least 40 characters. Never commit credentials or place them in configuration, a command URL, or a task description.
5. Set `capabilities` to registered role IDs this Mac can support. This is a dispatch filter, not proof that devices, SDKs, design tools, or signing capabilities exist. Device roles must report unavailable evidence as `not_run` and block the relevant gate.
6. In the installed Claude interface, inspect `/model` and subscription/billing status. Confirm the selected model and effort fit the included plan, with paid overages disabled. Copy the exact output of `claude --version` into `model_verified_cli_version`, then set `included_plan_verified` to `true`. Repeat this initial compatibility check when the CLI version changes.

7. Review each role's `allowed_tools` rules and set `permissions_verified: true` only after confirming them against the installed CLI. The runner uses `--permission-mode dontAsk` plus those explicit rules. Calls outside the approved profile fail instead of waiting for a person. The sample grants worktree-scoped edits and selected test/read commands, never a broad Bash allowance. Add specific build/test commands as needed during initial environment setup. Review user/project Claude settings, hooks, MCP servers, and credential helpers too: ordinary headless mode loads them. Tool availability in a subagent definition alone does not preapprove tool calls. See the [official headless permission guidance](https://code.claude.com/docs/en/headless). Bare mode is unsuitable here because it skips subscription authentication.

The worker pins `model: "opus"` by default rather than inheriting an unknown saved model. Model labels and available aliases depend on the installed client/account. Use only an ID verified in that client's `/model` selector. Fable or another model with separate credit requirements is not authorized merely because it appears in a menu. The initial included-plan attestation must cover the exact configured choice. It is not a per-job approval gate.

`effort` is optional. For a verified supporting CLI, `"effort": "ultracode"` becomes `--effort ultracode`; Ultracode is an effort setting, not a fabricated model ID. Doctor requires the installed CLI to advertise `--effort` before passing it. Leave it `null` unless availability and subscription cost have been checked. See the [official model configuration documentation](https://code.claude.com/docs/en/model-config) for the current installed-version guidance.

## Verify before execution

The default invocation is read-only with respect to accounts, jobs, models, and remote repositories:

```bash
python3 scripts/studio_worker.py --config /absolute/private/worker.json
python3 scripts/studio_worker.py --config /absolute/private/worker.json --doctor
```

Doctor checks configuration, the registry, local checkout roots/origins, installed CLI help flags, CLI version, model-plan setup state, and the reviewed permission profile. It does not claim jobs, call authentication endpoints, launch a model, clone, fetch, push, or deploy. It cannot prove an account's remaining allowance. `model_plan_setup_required` means initial setup remains incomplete.

After initial access and budget setup, explicit execution can process one job or a bounded queue:

```bash
python3 scripts/studio_worker.py --config /absolute/private/worker.json --execute --once
python3 scripts/studio_worker.py --config /absolute/private/worker.json --execute
```

The loop stops at `max_jobs`, `max_idle_polls`, cancellation, a nonpassing outcome, or an error. `permission_profile_setup_required` identifies incomplete unattended tool permissions. It never loops indefinitely through quota, authentication, or task failures. No daemon or launch service is installed automatically. A local file lock prevents two processes from using the same state directory simultaneously.

## Repository scope and automatic private checkouts

The default is an explicit mapping from exact GitHub repository URLs to absolute local checkout roots. HTTPS and ordinary `git@github.com:owner/repository.git` origin forms normalize to the same identity. Other hosts, embedded credentials, URL queries/fragments, path traversal, and mismatched origins are rejected.

For name-only game intake after initial setup, opt into exactly one trusted organization:

```json
{
  "auto_checkout_private_org": "swiftSaneGames",
  "repositories_root": "/Users/studio/work/private-games"
}
```

Add these fields to the configuration; they do not replace the other settings. The worker requires GitHub CLI authentication through the dedicated OS account. For an unmapped assigned repository, it verifies `gh repo view` returns the exact `nameWithOwner` and `isPrivate: true`, then clones `main` into a sanitized child of `repositories_root`. It never creates a repository, changes visibility, overwrites an existing checkout, or follows a checkout symlink outside that root. The studio's separate intake/bootstrap workflow creates the private repository and initial contracts.

With `refresh_main: true`, explicit execution fetches the allowlisted origin's `main` and creates a detached worktree from the verified fetched SHA. The original checkout's branch and files remain unchanged. `false` supports explicitly offline/local review, but may produce a stale candidate that the integration writer correctly rejects. A release job with a successful integration dependency uses that exact integrated commit, after checking that it belongs to the fetched main history.

## Private artifacts across Macs

A dependency's artifact path is relative, such as `candidate.json` or `outputs/docs/brief/game-design.md`. Resolve it as:

```text
<artifact_root>/<dependency job ID>/<dependency fence>/<artifact path>
```

A same-Mac worker can reuse its local artifact root. Multiple Macs need the same private artifact contents through an already configured, authorized shared filesystem or a controlled evidence synchronization process. The mount paths can differ because the API stores relative paths. Merely giving three Macs similarly named local directories does not share files. Missing dependency files stop the job with a concrete error; the worker never pretends another Mac's absolute worktree path is accessible.

After resolving the assigned dependency artifacts, the worker copies them into `.studio/dependencies` inside the isolated worktree, with read-only file modes and a 128 MiB aggregate limit. Prompts point to these exact local copies, so unattended Read calls do not require broad access to the shared artifact root. These modes are workflow protections, not an OS security boundary. The prompt also retains the actual job title and authoritative project-context snapshot as untrusted scoped input.

`source-state.json` records the originating local worktree for recovery only. `changes.patch`, `candidate.json`, and declared new files carry the actual candidate. The worker preserves worktrees rather than deleting unfinished work. Large or sensitive build evidence needs an appropriate existing private artifact arrangement; this runner does not purchase storage or install a sharing service.

## Candidate assembly and evidence identity

Every task starts in a separate detached worktree. A job may name one explicit `candidate_dependency_id`. The worker validates that dependency's exact repository, base SHA, fence, patch hash, new-file hashes, modes, and manifest. It rejects traversal, symlinks, submodules, missing/overwriting files, oversized content, and incompatible bases. It runs `git apply --check` before assembling the candidate. The original main checkout remains untouched. Patches retain raw bytes, including CRLF and trailing whitespace. Agents must leave source edits unstaged; only the deterministic writer stages the exact reviewed path set.

This allows QA, repair development, marketing, and compliance to inspect the actual candidate without assuming uncommitted work exists in a fresh clone. Multiple ambiguous candidate sources require an explicit assignment decision. Context from failed QA remains evidence, not authority to merge unrelated changes.

`candidate_base_sha` identifies the source baseline. `candidate_sha256` hashes a canonical manifest containing the repository, baseline, exact patch hash, and sorted new-file path/hash/mode records. An uncommitted candidate is **not** identified by `source_commit`. QA reports the candidate identity and immutable `candidate.json`; integration and release use an actual source commit. These are worker-reported artifacts, not proof that the server independently reran tests or verified every byte.

QA preserves the candidate unchanged and must return a substantive `report` through the text channel described below; the worker publishes it as `report.md`. Recovery notes use the optional checkpoint field. A changed source candidate invalidates the earlier evidence. Release preparation must rerun required checks against the final integrated SHA and exact Android/iOS artifacts.

## Progress in the dashboard

The runner reports lifecycle steps and, for roles with existing write permission, relays validated `.studio/progress.json` updates. Model credentials remain outside the subprocess. Current backend/runner versions are required; an unavailable progress endpoint stops before launching Claude. See [how Claude reads work and reports progress](CLAUDE_DASHBOARD_WORKFLOW.md) for the owner workflow, progress schema, limits and retention. Read-only roles keep their existing permissions and return detailed findings through the final result channel.

## Structured result channel

The CLI invocation uses verified `-p`, `--agent`, `--output-format json`, `--max-turns`, and the configured model/optional effort. No permission-bypass flag is used. The assignment arrives through stdin.

Every agent must produce this structured result, either in `.studio/results/<job-id>.json` inside its private worktree or as the JSON object encoded in the CLI envelope's `.result` text:

```json
{
  "summary": "What actually changed or was verified.",
  "artifacts": [{"path": "docs/brief/example.md", "description": "Existing output in this worktree."}],
  "checks": [{"name": "example review", "status": "pass", "details": "Actual procedure and outcome."}],
  "outcome": "pass"
}
```

Use `pass`, `fail`, or `not_run` for checks; use `pass`, `fail`, or `blocked` for the outcome. A zero CLI exit code is insufficient. A failed check cannot accompany a passing outcome. QA cannot pass with unperformed checks. Pipeline QA needs all eight actual gate names: `automated_tests`, `android_device`, `ios_device`, `save_migration`, `performance`, `privacy_ads`, `licenses`, and `launch_materials`.

Read-only researchers can include optional `report` (24,000 characters) and `checkpoint` (12,000 characters) strings in that same object. The worker persists them privately as `report.md` and `checkpoint.md`, removes those transport fields, and reports their artifact paths. No write permission is added to the research role. Other roles can use this channel too. Newly created source files must appear in `artifacts`; inherited candidate files carry forward automatically.

The runner adds the authoritative candidate identity after packaging. It limits agent-declared artifacts to 35, total reported artifacts to 40, checks to 80, the patch to 20 MiB, and copied candidate/output files to 64 MiB. Existing backend summary, path, and detail limits also apply. Signing keys, environment files, and unsafe artifact paths are rejected.

## Designated integration writer

Only one configured writer may integrate each repository. Other worker accounts should have read-only GitHub access. On that writer, add `integration-writer` to capabilities, configure `allow_integration: true`, and configure repository verification commands. This is initial trusted-worker setup; no routine owner code-approval gate is added.

`integration_checks` maps exact repositories to arrays of command arguments. `default_integration_checks` provides the initial standard for new private games. The example uses `python3 scripts/check_game.py`; bootstrap must install that entrypoint, and the architect/developer must supply real engine tests. Missing test infrastructure fails the gate rather than passing placeholder checks.

The model reviews the isolated candidate but does not run the commit or push. After Git creates a commit, the worker rechecks its tree, changed-file bytes, and executable modes against the frozen reviewed candidate, catching hook or filter changes before pushing. The deterministic worker requires successful independent QA for the exact candidate, runs configured checks with lease renewal, checks source/secret boundaries, verifies main has not moved, commits the unchanged candidate, renews ownership, and performs a normal non-force push. It verifies the remote head equals the resulting commit before reporting `source_commit`. A source change, failed check, moved remote, unknown origin, or lost lease blocks integration. Existing Git hooks and credential helpers must be reviewed during writer setup.

GitHub write access belongs only to the dedicated writer's existing OS credential configuration. API tokens and SSH-agent environment variables are not passed to Claude or test commands. Do not grant signing, owner-browser, production-admin, or release-approval access to this worker.

Queue fencing cannot retract a Git push already accepted by GitHub. The runner renews immediately before starting a push and uses a bounded command, but a small external side-effect window remains. `integration-state.json` records committed, pending-push, and remotely verified states. If transport fails during push, inspect remote main and this journal before retrying. Never force-push or repeat an uncertain push blindly.

## Lease, interruption, and security behavior

The backend leases jobs for 180 seconds. During model execution and integration checks, the worker renews every 45 seconds and sends heartbeats. Lease loss or uncertain renewal terminates the subprocess group. Timeouts and SIGINT/SIGTERM stop new work and preserve private state. A local commit may survive a cancelled integration; the journal identifies it.

A passing release-preparer may return a bounded `release_manifest` object through the structured text channel. The worker stores it privately, checks its integrated source, both mobile artifact identities, and all eight gates, and calls `/api/worker/candidate`. It reports the returned `candidate_id` and a private `release-review.json` receipt only after the server confirms `awaiting_review` and `published: false`. This creates the owner review item; it never approves the candidate or uploads to a store. A pending request journal requires reconciliation after transport uncertainty.

The subprocess environment uses a small allowlist. It excludes `STUDIO_WORKER_TOKEN`, Anthropic/OpenAI API credentials, alternate-provider settings, GitHub/cloud tokens, SSH-agent handles, and signing variables. Authentication and usage errors stop the loop without paid fallback. HTTPS redirects are rejected, and environment proxy settings cannot silently forward the worker secret. Raw stderr stays in private local files and is never sent as a failure message.

Environment filtering and prompts are workflow controls, not an OS sandbox. A shell-capable agent under the same OS identity can access files and capabilities that identity owns. Use separate dedicated identities, least-privilege repository access, protected private artifact storage, and no owner/signing credentials. Do not describe different role prompts as separate security principals.

## Verification and remaining setup

Run the offline stdlib suite:

```bash
python3 -m unittest discover -s tests -p test_studio_worker.py -v
```

Tests use temporary local repositories and mocks. They cover command construction, credential filtering, path/origin rejection, read-only reports, invalid results, candidate assembly/tampering, missing shared evidence, cancellation, lease loss, trusted-org cloning decisions, and guarded integration. Simulated pushes do not verify live GitHub access, Claude subscription behavior, shared mounts, real devices, or a deployed backend. Those initial environment checks must complete on the actual Macs before claiming an operational studio.
