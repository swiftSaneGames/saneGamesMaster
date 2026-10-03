# Start an original game from its name

Give the studio director the original game's name and the configured repository/workspace access. The director chooses a safe slug and isolated destination, uses the bootstrapper for preparation, and uses an independent review plus the integration writer for initial source. Routine setup needs no additional owner product-approval gate. The final exact-build release decision remains owner-only.

`scripts/start_game.py` implements the setup and intake stages. It never starts Claude, installs a model, buys capacity, signs a build or publishes a game. Authenticated workers must already have account configuration and either exact repository mappings or the explicitly configured private-organization checkout policy. A durable queued job is not evidence that an agent started.

## Plan without side effects

```bash
python3 scripts/start_game.py "Happy Hotel" --destination /absolute/separate/path/happy-hotel --create-remote --initialize-source --enqueue --server-url https://dashboard.sanegames.swiftsane.com --plan
```

Replace the example name with the selected original concept. The CLI derives an ASCII slug; use `--slug` when the derived identifier is unsuitable. The repository owner is fixed to `swiftSaneGames`. `--destination` must identify a separate isolated path outside the master. Default execution is also plan-only: no files, GitHub calls, dashboard requests, commits or pushes occur.

`--category` accepts a supported dashboard category and defaults to `Business simulation`; that default starts discovery and does not establish the final design. `--summary` supplies optional product intent. Audience, connectivity, art, platform feasibility and other project choices remain documented agent decisions. `--master-root` and `--master-revision` select the reviewed source kit/provenance when needed.

## Execute authorized setup

After the assigned agents inspect the plan and generated framework, the coordinator can run:

```bash
python3 scripts/start_game.py "Happy Hotel" --destination /absolute/separate/path/happy-hotel --execute --create-remote --initialize-source --enqueue --server-url https://dashboard.sanegames.swiftsane.com
```

Set `INTAKE_TOKEN` through local protected configuration first. Never put the token in CLI arguments, a source file, screenshots or the game README. GitHub access uses the existing authenticated `gh` configuration. The user supplies authorization and access; the CLI does not create account permissions.

The options select explicit stages:

| Option | Actual effect |
|---|---|
| `--execute` | Create or safely reuse the local game kit and run its copied agent validators. |
| `--create-remote` | Verify or create exactly one private `swiftSaneGames/<slug>` repository and link its origin. |
| `--initialize-source` | For an unborn local `main` and empty verified private remote, validate and commit only the generated kit, then make a normal initial push. |
| `--enqueue` | Verify clean reviewed local `main` equals remote `main`, then submit the project and idempotent initial plan. |

Omit remote/enqueue options for a local preparation session. An existing game kit keeps its pinned source and current files; starting a game again does not overwrite later design or implementation work. Broken or conflicting identity/validation state stops the command.

## Initial source gate

The designated integration writer owns `--initialize-source`; independent agent review precedes that operation. The CLI verifies the bootstrap inventory and exact file hashes, rejects unknown files and staged user work, runs the copied role validators, and checks ignores for secrets, builds, worktrees and local state. It stages only inventory paths, never `git add .` or an arbitrary directory.

Initialization requires an empty remote. The CLI checks remote emptiness again immediately before pushing, rechecks private identity, and uses a normal `HEAD:refs/heads/main` push. It verifies the resulting remote SHA. A concurrent remote change blocks the operation; force-push is never a recovery option. Existing local commits are preserved; existing remote history requires ordinary clone/reconciliation through the integration writer. The CLI does not override Git author identity, signing policy or hooks. It checks the resulting commit's paths and bytes before pushing.

This first commit contains the instruction kit, not a tested game. `game-checks.json` and `scripts/check_game.py` provide the later game test entrypoint. The developer must implement real game tests and establish the engine/toolchain. Missing game tests never become a passing release gate.

## Dashboard intake and continuity

Enqueue requires the exact repository to exist privately, a clean committed `main`, and a matching remote SHA. Empty or unpushed repositories fail before any project/plan POST. The CLI first checks that the supplied HTTPS origin identifies the native studio dashboard. It disables redirects and never logs HTTP bodies, bearer values or raw subprocess errors.

The project request includes the original name, summary, category and exact repository URL. The backend uses that URL to reuse an existing project. The initial plan uses `idempotency_key: initial`, so retrying the same request does not create another initial pipeline. The response identifies queued or existing jobs; only a configured worker can claim them.

Before and after external stages, `.studio/start-game.json` records nonsecret identity, source SHA, project/job IDs and progress. `.studio/` stays ignored. An interrupted request remains `project_request_pending`, `plan_request_pending` or an initial-source stage; do not infer failure means no remote effect. Retry using the same game, repository, destination and server. The backend reconciles the stable project/plan identity. If an initial commit succeeded but its push is uncertain, the writer inspects that exact local commit and remote main before a normal retry; the CLI never creates a replacement initial commit over existing history.

## Worker readiness

Configure exact private repository checkouts on each worker, or use the trusted `auto_checkout_private_org` policy with default game integration checks described in [worker setup](WORKER_SETUP.md). The latter allows newly created private games to enter production without manually editing every Mac's mapping for every title. Verify subscription/model access locally and start the worker using that guide. Do not store intake or worker credentials in game source. The start command does not fabricate a registered/running worker or claim device testing.

After the first dispatch, discovery/design/architecture tasks establish the original game. Independent QA can block missing hardware or evidence. Any release still requires both platform artifacts, all eight evidence categories and the owner's dashboard approval.

## Offline checks

```bash
python3 -m unittest discover -s tests -p 'test_start_game.py' -v
```

These tests mock GitHub, Git initialization/push and HTTPS. They cover safe planning, slug/origin checks, private/source gates, stable intake retries, pending checkpoints, token redaction, redirects and concurrent initial-source changes. They do not create a real game repository or prove live worker execution.
