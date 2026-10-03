#!/usr/bin/env python3
"""Plan or apply one private game documentation kit. Never commit, push, or publish."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shlex
import subprocess
from pathlib import Path

MASTER = 'swiftSaneGames/saneGamesMaster'
ROOT = Path(__file__).resolve().parents[1]
SLUG = re.compile(r'[a-z][a-z0-9-]{2,50}\Z')
SHA = re.compile(r'(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})\Z')
REQUIRED = ('agents/registry.json', 'agents/COMMON.md', 'agents/README.md',
            'scripts/sync_agent_definitions.py', 'scripts/validate_agents.py',
            'scripts/check_game.py',
            'templates/agents/task.md', 'templates/agents/checkpoint.md',
            'templates/agents/handoff.md', 'templates/game/CLAUDE.md', 'templates/game/README.md')
REFERENCE = (
    'CLAUDE.md', 'README.md', 'RESEARCH.md',
    'docs/DECISIONS.md', 'docs/REQUIREMENTS_INTERVIEW.md', 'docs/AGENT_ORGANIZATION.md',
    'docs/STUDIO_BLUEPRINT.md', 'docs/HOSTED_DASHBOARD.md', 'docs/HOSTED_TESTING.md',
    'docs/REPOSITORY_COVERAGE_AUDIT.md', 'docs/SECURITY.md', 'docs/TESTING.md',
    'docs/LOGIN_RUNTIME_FIX.md', 'docs/CLAUDE_TOOLING.md', 'docs/GAME_BOOTSTRAP.md',
    'docs/TECH_STACK.md', 'docs/START_A_GAME.md',
    'docs/ORCHESTRATION.md', 'docs/OPERATIONS.md',
    'research/README.md', 'research/PRIORITIZATION.md', 'research/GAME_SHORTLIST.md',
    'research/STORE_ENROLLMENT.md', 'research/SOURCES.md', 'research/games_100.csv',
    'research/studios_20.csv', 'research/download_observations.csv',
    'scraper/README.md', 'scraper/RESEARCH_PROMPT.md',
    'cloudflare/native/models.mjs', 'cloudflare/native/store.mjs', 'cloudflare/native/worker.mjs',
    'examples/README.md', 'scripts/submit_candidate.py',
)
OPTIONAL_TOOLS = (
    '.claude/settings.json', 'scripts/agent_hooks.py', 'docs/CLAUDE_TOOLING.md',
    '.claude/skills/studio-plan/SKILL.md', '.claude/skills/claude-design-handoff/SKILL.md',
    '.claude/skills/game-implementation/SKILL.md', '.claude/skills/release-evidence/SKILL.md',
)
IGNORE = '''# Local operations, credentials and generated artifacts\n.studio/\n.worktrees/\nworktrees/\n.env\n.env.*\n!.env.example\n.dev.vars*\n.venv/\nnode_modules/\n__pycache__/\n.pytest_cache/\n.godot/\nbuild/\nbuilds/\nexports/\nartifacts/\n*.db\n*.db-*\n*.sqlite*\n*.log\n*.pem\n*.key\n*.p12\n*.pfx\n*.jks\n*.keystore\n*.mobileprovision\n*.apk\n*.aab\n*.ipa\nclient_secret*.json\noauth_credentials*.json\n.DS_Store\n'''


class BootstrapError(Exception):
    """An actionable failure without credential-bearing command output."""


def invoke(argv, cwd=None):
    try:
        return subprocess.run(argv, cwd=cwd, capture_output=True, text=True, check=False, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        raise BootstrapError(f'{argv[0]} could not complete; verify installation/access and retry discovery.') from None


def json_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + '\n').encode()


def safe_source(root, relative, required=True):
    path = root / relative
    if not path.exists():
        if required:
            raise BootstrapError(f'Missing kit source: {relative}')
        return None
    if any(p.is_symlink() for p in [path, *path.parents] if p != root.parent):
        raise BootstrapError(f'Symlink kit source rejected: {relative}')
    if not path.is_file() or not path.resolve().is_relative_to(root):
        raise BootstrapError(f'Invalid kit source: {relative}')
    return path.read_bytes()


def revision_for(root, explicit):
    if explicit:
        if not SHA.fullmatch(explicit):
            raise BootstrapError('--master-revision must be a complete 40- or 64-character Git SHA.')
        return explicit.lower(), 'explicit_revision_with_snapshot'
    result = invoke(['git', '-C', str(root), 'rev-parse', 'HEAD'])
    revision = result.stdout.strip()
    if result.returncode or not SHA.fullmatch(revision):
        raise BootstrapError('Cannot resolve master HEAD; supply --master-revision with its actual source SHA.')
    return revision.lower(), 'git_head_with_snapshot'


def check_hook_references(files):
    settings = files.get('.claude/settings.json')
    if settings is None:
        return
    try:
        value = json.loads(settings)
        if not isinstance(value, dict) or set(value) - {'hooks', 'permissions', '$schema'}:
            raise BootstrapError('Project settings contain fields outside the bootstrap allowlist.')
        for matchers in value.get('hooks', {}).values():
            for matcher in matchers:
                for hook in matcher['hooks']:
                    if hook.get('type') != 'command':
                        raise BootstrapError('Only reviewed local command hooks can be copied.')
                    parts = shlex.split(hook['command'])
                    references = []
                    for token in parts:
                        token = token.replace('${CLAUDE_PROJECT_DIR}/', '').replace('$CLAUDE_PROJECT_DIR/', '')
                        if token.startswith('scripts/'):
                            references.append(token)
                    if not references or any(ref not in files for ref in references):
                        raise BootstrapError('A copied hook references a script outside the included kit.')
    except (ValueError, KeyError, TypeError, AttributeError):
        raise BootstrapError('Project hook configuration is malformed.') from None


def build_files(root, slug, title, revision, revision_kind):
    files = {}
    for relative in REQUIRED:
        files[relative] = safe_source(root, relative)
    try:
        registry = json.loads(files['agents/registry.json'])
        roles = registry['roles']
        ids = [role['id'] for role in roles]
        if not roles or len(ids) != len(set(ids)):
            raise BootstrapError('Role registry is empty or contains duplicate IDs.')
        for role in roles:
            rid = role['id']
            if not re.fullmatch(r'[a-z][a-z0-9-]*', rid):
                raise BootstrapError('Role registry contains an invalid ID.')
            for key, expected in [('prompt', f'agents/{rid}/prom.md'),
                                  ('definition', f'.claude/agents/{rid}.md')]:
                if role[key] != expected:
                    raise BootstrapError('Role registry contains a noncanonical path.')
                files[expected] = safe_source(root, expected)
    except (ValueError, KeyError, TypeError):
        raise BootstrapError('Role registry is malformed.') from None
    for relative in REFERENCE:
        content = safe_source(root, relative, required=False)
        if content is not None:
            files['docs/studio-reference/' + relative] = content
    for relative in OPTIONAL_TOOLS:
        content = safe_source(root, relative, required=False)
        if content is not None:
            files[relative] = content
    check_hook_references(files)
    source_hash = hashlib.sha256()
    for relative, content in sorted(files.items()):
        source_hash.update(relative.encode() + b'\0' + content + b'\0')
    repository = f'swiftSaneGames/{slug}'
    context = dict(schema_version=1, game_id=slug, repository=repository,
                   master_repository=MASTER, master_revision=revision,
                   master_revision_kind=revision_kind, master_snapshot_sha256=source_hash.hexdigest(),
                   policy_reference='docs/studio-reference')
    files['studio-context.json'] = json_bytes(context)
    claude = files['templates/game/CLAUDE.md'].decode()
    claude = re.sub(r'^Replace GAME_NAME, GAME_ID, OWNER/REPOSITORY and MASTER_SHA before use\.\n', '', claude, flags=re.M)
    replacements = {'GAME_NAME': title, 'GAME_ID': slug, 'OWNER/REPOSITORY': repository, 'MASTER_SHA': revision}
    claude = re.sub(r'GAME_NAME|GAME_ID|OWNER/REPOSITORY|MASTER_SHA', lambda match: replacements[match.group()], claude)
    files['CLAUDE.md'] = (claude + '\nRead `studio-context.json` to resolve pinned studio-only references under `docs/studio-reference/`.\n').encode()
    files['prom.md'] = (f'# {title} — game session entrypoint\n\n'
        f'Work in the private repository `{repository}`, game `{slug}`. Read `CLAUDE.md`, '
        '`studio-context.json`, `agents/COMMON.md`, `agents/studio-director/prom.md`, and the current assignment. '
        'Resolve master-only policy/research/dashboard references under the policy_reference folder. '
        'These are read-only reference copies, not this game\'s runtime. Read the exact role contract and '
        'latest checkpoint before work. Scope new tasks through the director and single integration writer. '
        'Only the owner approves an exact release; do not start workers, create other repositories or publish '
        'merely because this kit exists.\n').encode()
    files['README.md'] = (f'# {title}\n\nPrivate original game project: `{repository}`.\n\n'
        'This bootstrap installs studio instructions, role contracts and continuity templates. '
        'No engine, game runtime, mobile export or advertising adapter has been selected or validated. '
        'No game build or device test has passed merely because these files exist.\n\n'
        'Run `python3 scripts/validate_agents.py` and `python3 scripts/sync_agent_definitions.py --check` '
        'to check the copied role framework. The architect must document actual build/test commands after '
        'a validated engine/export spike; the master dashboard npm commands do not apply here.\n\n'
        'Read `prom.md`, `studio-context.json` and `docs/brief/game-brief.md`. Pin studio updates deliberately; '
        'bootstrap refuses to overwrite differing files. Generic policy snapshots live under '
        '`docs/studio-reference/`; game decisions belong in `docs/decisions.md`. '
        'Store sensitive tester records and binaries in authorized private storage outside Git.\n').encode()
    files['docs/brief/game-brief.md'] = (f'# {title} — original game brief\n\nGame ID: `{slug}`.\n\n'
        'Pending agent decisions: original core loop, audience, markets/languages, controls, connectivity, '
        'visual/audio style, content depth, economy, ads/privacy design, supported devices and measured '
        'performance budgets. Record evidence and decisions before production work; no reference title '
        'authorizes copying competitor assets or source.\n').encode()
    files['docs/decisions.md'] = b'# Game decisions\n\nNo engine or gameplay decisions have been validated by bootstrap. Record decision, evidence, author, date and affected tasks here.\n'
    files['game-checks.json'] = json_bytes({'schema_version': 1, 'checks': [{
        'name': 'Godot unit and integration',
        'command': ['godot', '--headless', '--path', '.', '--script', 'res://tests/run_tests.gd'],
        'timeout_seconds': 600,
    }]})
    files['README.md'] += ('\nThe standard game check entrypoint is `python3 scripts/check_game.py`. '
        '`game-checks.json` starts with a proposed Godot test command. The developer must implement '
        'the actual test suite and validate the selected engine/toolchain, or update this configuration '
        'through a reviewed architecture decision. Missing Godot or `tests/run_tests.gd` is a failure, '
        'not a passing bootstrap check. Initial instruction-kit validation does not run nonexistent game tests.\n').encode()
    files['.gitignore'] = IGNORE.encode()
    files['bootstrap-manifest.json'] = json_bytes(dict(schema_version=1, repository=repository, game_id=slug,
        files={name: hashlib.sha256(content).hexdigest() for name, content in sorted(files.items())}))
    return files, context


def preflight_destination(destination, root, files, context):
    for path in [destination, *destination.parents]:
        if path.is_symlink():
            raise BootstrapError('Destination or a parent is a symlink; choose a direct isolated path.')
    if destination == root or destination.is_relative_to(root) or root.is_relative_to(destination):
        raise BootstrapError('Destination must be separate from the master source directory.')
    if destination.exists():
        if not destination.is_dir():
            raise BootstrapError('Destination exists and is not a directory.')
        marker = destination / 'studio-context.json'
        if marker.is_symlink():
            raise BootstrapError('Game identity file cannot be a symlink.')
        try:
            prior = json.loads(marker.read_text())
        except (OSError, ValueError):
            raise BootstrapError('Existing destination has no valid game identity; no files were overwritten.') from None
        if any(prior.get(key) != context[key] for key in ('repository', 'game_id', 'master_repository')):
            raise BootstrapError('Existing destination belongs to another game or master.')
    conflicts = []
    for relative, content in files.items():
        target = destination / relative
        if any(p.is_symlink() for p in [target, *target.parents]):
            conflicts.append(relative + ' (symlink)')
        elif target.exists() and (not target.is_file() or target.read_bytes() != content):
            conflicts.append(relative)
        elif any(p.exists() and not p.is_dir() for p in target.parents):
            conflicts.append(relative + ' (parent is not a directory)')
    if conflicts:
        raise BootstrapError('Existing files differ; resolve separately, no overwrite:\n' + '\n'.join(conflicts))


def validate_git_destination(destination, repository):
    if not (destination / '.git').exists():
        return False
    if (destination / '.git').is_symlink() or not (destination / '.git').is_dir():
        raise BootstrapError('Existing linked-worktree or symlink Git metadata requires manual integration.')
    result = invoke(['git', '-C', str(destination), 'rev-parse', '--show-toplevel'])
    if result.returncode or Path(result.stdout.strip()).resolve() != destination:
        raise BootstrapError('Existing Git repository identity does not match the destination.')
    result = invoke(['git', '-C', str(destination), 'remote', 'get-url', 'origin'])
    if result.returncode == 0:
        permitted = {f'https://github.com/{repository}', f'https://github.com/{repository}.git',
                     f'git@github.com:{repository}', f'git@github.com:{repository}.git'}
        if result.stdout.strip() not in permitted:
            raise BootstrapError('Existing origin does not match the exact game repository; no credentials were printed.')
    return True


def remote_identity(repository):
    result = invoke(['gh', 'repo', 'view', repository, '--json', 'id,nameWithOwner,isPrivate'])
    if result.returncode:
        # An authentication/network failure must not be mistaken for permission to create.
        error = result.stderr.lower()
        if 'could not resolve to a repository' in error or 'http 404' in error:
            return None
        raise BootstrapError('Cannot establish remote repository state; verify configured GitHub access.')
    try:
        data = json.loads(result.stdout)
        if data.get('nameWithOwner') != repository or data.get('isPrivate') is not True or not data.get('id'):
            raise BootstrapError('Existing remote is public, mismatched or lacks an identity; creation stopped.')
        return {'id': data['id'], 'repository': repository, 'private': True}
    except (ValueError, TypeError, AttributeError):
        raise BootstrapError('GitHub returned an invalid repository identity; creation stopped.') from None


def link_origin(destination, repository):
    result = invoke(['git', '-C', str(destination), 'remote', 'get-url', 'origin'])
    if result.returncode:
        result = invoke(['git', '-C', str(destination), 'remote', 'add', 'origin',
                         f'https://github.com/{repository}.git'])
        if result.returncode:
            raise BootstrapError('Private remote exists, but adding the local origin failed; no push occurred.')
    validate_git_destination(destination, repository)


def apply_files(destination, files):
    destination.mkdir(parents=True, exist_ok=True)
    # Persist identity first so interrupted application can resume safely.
    ordered = ['studio-context.json'] + [name for name in sorted(files) if name != 'studio-context.json']
    for relative in ordered:
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            if target.is_symlink() or not target.is_file() or target.read_bytes() != files[relative]:
                raise BootstrapError('Destination changed during application; stop and inspect before resuming.')
            continue
        try:
            with target.open('xb') as stream:
                stream.write(files[relative])
        except FileExistsError:
            raise BootstrapError('Destination changed during application; stop and inspect before resuming.') from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--slug', required=True)
    parser.add_argument('--destination', required=True, type=Path)
    parser.add_argument('--title', required=True)
    parser.add_argument('--master-root', type=Path, default=ROOT)
    parser.add_argument('--master-revision')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--plan', action='store_true', help='Default: inspect and print a plan without writing or contacting GitHub')
    mode.add_argument('--apply', action='store_true', help='Apply an inspected kit without overwriting different files')
    parser.add_argument('--init-git', action='store_true', help='Initialize an empty local main branch, without committing')
    parser.add_argument('--create-remote', action='store_true', help='With --apply, create/reuse the exact private GitHub repo; never push')
    args = parser.parse_args(argv)
    try:
        if not SLUG.fullmatch(args.slug):
            raise BootstrapError('Slug must match [a-z][a-z0-9-]{2,50}; paths and owner overrides are forbidden.')
        title = args.title.strip()
        if not title or len(title) > 100 or any(ord(c) < 32 or ord(c) == 127 for c in title):
            raise BootstrapError('Title must contain 1–100 printable characters on one line.')
        root = args.master_root.absolute()
        if root.is_symlink() or not root.is_dir():
            raise BootstrapError('Master root must be an existing direct directory.')
        root = root.resolve()
        destination = args.destination.absolute()
        # Check symlinks before resolving, so traversal cannot hide them.
        if '..' in args.destination.parts:
            raise BootstrapError('Destination must not contain parent traversal components.')
        revision, kind = revision_for(root, args.master_revision)
        files, context = build_files(root, args.slug, title, revision, kind)
        preflight_destination(destination, root, files, context)
        existing_git = validate_git_destination(destination, context['repository'])
        plan = {'mode': 'apply' if args.apply else 'plan', 'repository': context['repository'],
                'visibility': 'private', 'destination': str(destination), 'files': sorted(files),
                'master_revision': revision, 'master_snapshot_sha256': context['master_snapshot_sha256'],
                'remote_requested': args.create_remote, 'push': False,
                'source_note': 'Revision records provenance; snapshot hash identifies the copied working-tree bytes.'}
        if not args.apply:
            print(json.dumps(plan, indent=2))
            return 0
        remote = remote_identity(context['repository']) if args.create_remote else None
        apply_files(destination, files)
        if (args.init_git or args.create_remote) and not existing_git:
            result = invoke(['git', 'init', '--initial-branch=main', str(destination)])
            if result.returncode:
                raise BootstrapError('Kit exists, but Git initialization failed. No commit or push occurred.')
        if args.create_remote and remote is None:
            try:
                invoke(['gh', 'repo', 'create', context['repository'], '--private', '--source', str(destination)])
            except BootstrapError:
                pass  # A timeout may occur after creation; rediscover before deciding its outcome.
            # Always rediscover; a failed or timed-out creation may have created the repository.
            remote = remote_identity(context['repository'])
            if remote is None:
                raise BootstrapError('Remote creation is unconfirmed; local kit remains. Inspect remote state before retrying.')
        if args.create_remote and remote is not None:
            link_origin(destination, context['repository'])
        print(json.dumps({'mode': 'applied', 'repository': context['repository'], 'files': len(files),
                          'remote': remote, 'committed': False, 'pushed': False,
                          'next': 'Run the agent validator, review the diff, and use the designated integration writer.'}, indent=2))
        return 0
    except BootstrapError as exc:
        print('STOP: ' + str(exc))
        return 1
    except OSError:
        print('STOP: Filesystem operation failed; inspect local state before retrying. No commit or push occurred.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
