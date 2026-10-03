# Bootstrap one private original game

`scripts/bootstrap_game.py` prepares a reusable instruction kit for one explicitly selected original game. It does not select an engine, implement gameplay, start workers, commit, push, sign, deploy or publish. The repository-bootstrapper prepares it; the integration writer owns later reviewed source integration.

## Inspect the plan first

From the master checkout:

```bash
python3 scripts/bootstrap_game.py --slug happy-hotel --title "Happy Hotel" --destination /absolute/separate/path/happy-hotel --plan
```

The default is also `--plan`. It reads local source and Git identity, prints relative planned file paths and provenance, and writes nothing. It does not contact GitHub. Replace the example with the authorized original game's slug, title and exact destination. A slug must match `[a-z][a-z0-9-]{2,50}`; the owner is fixed to `swiftSaneGames`. Choose a direct isolated directory outside the master checkout. Symlinks, parent traversal and unidentified existing directories are rejected.

Use `--master-root` for another reviewed source checkout. By default, the tool reads that checkout's actual HEAD. Use `--master-revision <complete SHA>` only when supplying the known source revision explicitly, such as a reviewed materialized snapshot. A revision identifies provenance; it does not certify that dirty files match that commit. `master_snapshot_sha256` separately binds the actual copied source bytes. The bootstrap manifest lists each generated file's SHA-256.

## Apply the local kit

```bash
python3 scripts/bootstrap_game.py --slug happy-hotel --title "Happy Hotel" --destination /absolute/separate/path/happy-hotel --apply
```

Add `--init-git` when an empty local repository should be initialized on `main`. The tool makes no initial commit. An existing directory must contain matching `studio-context.json` identity. Every existing destination file in the kit must match the planned bytes; a different file stops the entire preflight with relative conflict paths. It never overwrites user work. An interrupted operation can resume using the same source snapshot and arguments; source updates require deliberate review, not a bootstrap overwrite.

The kit includes:

- Root game instructions, entry prompt, an honest README, pending game brief, decision log and protected ignore rules.
- Canonical role prompts, shared contract, registry, generated Claude definitions, agent templates and their synchronization/validation scripts.
- Explicitly listed project skills and local hook scripts when present in the reviewed master. Copied hooks must reference scripts included in the kit. Missing hook dependencies stop preflight.
- A pinned generic policy/reference kit under `docs/studio-reference/`, including available allowlisted documents, public research and native dashboard schema/source references.

Read `studio-context.json` before resolving master-only paths in a role contract. For example, master `cloudflare/native/models.mjs` resolves to `docs/studio-reference/cloudflare/native/models.mjs`; it is reference code, not a running game backend. Game source, decisions and checkpoints remain game-local. Treat the reference kit as read-only policy evidence and update it through a reviewed, versioned change. Do not add operational/private material to those generic sources.

Copying uses an exact source allowlist and registry-validated paths. It excludes `.env` files, local Claude settings, Wrangler deployment configuration, credentials, databases, binaries, arbitrary scripts and unrelated game evidence. This limits copied paths; it is not a credential scanner for the contents of approved files. Review source and generated diffs before sharing them.

If present, `docs/CLAUDE_TOOLING.md` describes copied skills/hooks. The bootstrap verifies hook file references, not Claude runtime compatibility or tool availability. Hooks and role prompts do not supply OS isolation or signing credentials.

## Optional private GitHub creation

Only after the assignment authorizes this original game and configured GitHub access exists:

```bash
python3 scripts/bootstrap_game.py --slug happy-hotel --title "Happy Hotel" --destination /absolute/separate/path/happy-hotel --apply --create-remote
```

The tool first calls `gh repo view` for exactly `swiftSaneGames/<slug>`. It reuses an existing matching private repository and rejects public/mismatched identities. Authentication/network failures stop creation rather than masquerading as a missing repository. If the exact repository is absent, it initializes local Git as needed and calls `gh repo create` with `--private --source`. It never supplies `--push` or changes repository visibility.

The CLI verifies the resulting repository identity and private status. Raw subprocess output never enters its error report. A failed or interrupted remote operation can leave an uncertain result; discover the exact remote again before retrying. Local kit files may already exist when a later Git/GitHub action fails. Inspect state instead of deleting it. The command never treats local creation, a remote repository, a source commit, and a successful push as equivalent outcomes.

## Verify before integration

From the new game directory:

```bash
python3 scripts/validate_agents.py
python3 scripts/sync_agent_definitions.py --check
```

Inspect `studio-context.json`, `bootstrap-manifest.json`, the generated files, ignore behavior and private remote identity. Use the designated writer after independent review. The architect must supply actual game build/test commands after a validated engine/export spike; `npm test` from the master dashboard is not a game command. This bootstrap supplies no game engine scaffold and cannot claim mobile compatibility.

The master's offline regression command is:

```bash
python3 -m unittest discover -s tests -p 'test_bootstrap_game.py' -v
```

Tests use temporary files and mocked GitHub subprocesses. They never create a remote repository or use credentials. Actual GitHub account permissions and Claude execution require separate authorized verification.
