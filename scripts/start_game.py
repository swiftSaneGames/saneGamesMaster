#!/usr/bin/env python3
"""Plan or prepare one named original game; enqueue only verified private source."""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import re
import tempfile
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

import bootstrap_game as bootstrap

CATEGORIES = ('Business simulation', 'Idle management', 'Decision simulation', 'Puzzle', 'Arcade', 'Steering')
PROJECT_ID = re.compile(r'p-[a-f0-9-]{1,60}\Z')
JOB_ID = re.compile(r'j-[a-f0-9-]{1,60}\Z')
MAX_RESPONSE = 2 * 1024 * 1024


class StartError(Exception):
    """A public-safe operation error; never include HTTP bodies or credentials."""


def derive_slug(title):
    text = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode().lower()
    value = re.sub(r'[^a-z0-9]+', '-', text).strip('-')[:51].rstrip('-')
    if not bootstrap.SLUG.fullmatch(value):
        raise StartError('Cannot derive a valid slug; supply --slug matching [a-z][a-z0-9-]{2,50}.')
    return value


def server_origin(value):
    try:
        parsed = urllib.parse.urlsplit(value)
        if (any(ord(c) < 33 or ord(c) == 127 for c in value) or parsed.scheme != 'https'
                or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.path not in ('', '/')
                or parsed.port not in (None, 443)
                or not re.fullmatch(r'[A-Za-z0-9.-]+', parsed.hostname)
                or parsed.hostname.startswith('.') or parsed.hostname.endswith('.')):
            raise ValueError
        return 'https://' + parsed.hostname.lower()
    except (ValueError, TypeError, AttributeError):
        raise StartError('--server-url must be an HTTPS origin without credentials, extra ports, paths, queries or fragments.') from None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, origin, token):
        self.origin = server_origin(origin)
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, path, payload=None, authenticated=True):
        if not path.startswith('/') or path.startswith('//'):
            raise StartError('Invalid internal API path.')
        headers = {'Accept': 'application/json'}
        if authenticated:
            headers['Authorization'] = 'Bearer ' + self.token
        data = None
        if payload is not None:
            data = json.dumps(payload).encode()
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(self.origin + path, data=data, headers=headers,
                                         method='POST' if payload is not None else 'GET')
        try:
            with self.opener.open(request, timeout=30) as response:
                if not 200 <= response.status < 300:
                    raise StartError(f'Dashboard returned HTTP {response.status}; redirects are forbidden.')
                content = response.read(MAX_RESPONSE + 1)
                if len(content) > MAX_RESPONSE:
                    raise StartError('Dashboard response exceeded the allowed size; verify state before retrying.')
                value = json.loads(content)
                if not isinstance(value, dict):
                    raise StartError('Dashboard returned an invalid response; verify state before retrying.')
                return value
        except urllib.error.HTTPError as exc:
            raise StartError(f'Dashboard returned HTTP {exc.code}; no response body or credentials were logged.') from None
        except (OSError, urllib.error.URLError, ValueError):
            raise StartError('Dashboard response is unavailable or invalid; the pending operation may have completed. Retry with the same identity.') from None

    def verify(self):
        data = self.request('/healthz', authenticated=False)
        if data.get('status') != 'ok' or data.get('component') != 'cloudflare-native-worker':
            raise StartError('The supplied origin does not identify the expected native studio dashboard.')


def read_context(destination, repository, slug):
    for path in [destination, *destination.parents]:
        if path.is_symlink():
            raise StartError('Destination must not traverse a symlink.')
    context_path = destination / 'studio-context.json'
    if context_path.is_symlink():
        raise StartError('Game identity must not be a symlink.')
    try:
        value = json.loads(context_path.read_text())
    except (OSError, ValueError):
        raise StartError('Existing destination is not an identifiable bootstrapped game; preserve it and choose the correct directory.') from None
    if not isinstance(value, dict) or any(value.get(key) != expected for key, expected in (
            ('game_id', slug), ('repository', repository), ('master_repository', bootstrap.MASTER))):
        raise StartError('Existing destination belongs to a different game or master.')
    return value


def ensure_local(args, slug, repository, destination):
    if destination.exists():
        read_context(destination, repository, slug)
    else:
        command = ['--slug', slug, '--title', args.game_name, '--destination', str(destination),
                   '--master-root', str(args.master_root), '--apply']
        if args.master_revision:
            command += ['--master-revision', args.master_revision]
        # Keep bootstrap JSON separate from this command's structured result.
        with contextlib.redirect_stdout(io.StringIO()):
            status = bootstrap.main(command)
        if status:
            raise StartError('Local bootstrap stopped; run bootstrap_game.py --plan with the same identity to inspect conflicts.')
    for relative in ('scripts/validate_agents.py', 'scripts/sync_agent_definitions.py'):
        target = destination / relative
        if target.is_symlink() or not target.is_file():
            raise StartError('The local kit is missing its safe validation scripts.')
        command = ['python3', relative] + (['--check'] if 'sync_agent' in relative else [])
        if bootstrap.invoke(command, cwd=destination).returncode:
            raise StartError('The local agent kit failed validation; inspect it before repository creation or enqueue.')


def ensure_remote(destination, repository, create):
    existing_git = bootstrap.validate_git_destination(destination, repository)
    identity = bootstrap.remote_identity(repository)
    if identity is None and not create:
        raise StartError('The exact private repository does not exist; use authorized --create-remote setup before enqueue.')
    if create:
        if not existing_git:
            if bootstrap.invoke(['git', 'init', '--initial-branch=main', str(destination)]).returncode:
                raise StartError('Local Git initialization failed; no source was committed or pushed.')
        if identity is None:
            try:
                bootstrap.invoke(['gh', 'repo', 'create', repository, '--private', '--source', str(destination)])
            except bootstrap.BootstrapError:
                pass
            identity = bootstrap.remote_identity(repository)
            if identity is None:
                raise StartError('Private remote creation is unconfirmed; discover the same repository before retrying.')
        bootstrap.link_origin(destination, repository)
    return identity


def verified_source(destination, repository):
    if not bootstrap.validate_git_destination(destination, repository):
        raise StartError('Enqueue requires an independently reviewed initial commit on main, normally pushed by the integration writer.')
    commands = [('branch', ['branch', '--show-current']), ('head', ['rev-parse', 'HEAD']),
                ('changes', ['status', '--porcelain']), ('origin', ['remote', 'get-url', 'origin'])]
    values = {}
    for label, command in commands:
        result = bootstrap.invoke(['git', '-C', str(destination), *command])
        if result.returncode:
            raise StartError('Enqueue requires committed, clean main source and the exact private origin; the integration writer must complete setup.')
        values[label] = result.stdout.strip()
    if values['branch'] != 'main' or not bootstrap.SHA.fullmatch(values['head']) or values['changes']:
        raise StartError('Enqueue requires a clean reviewed main commit; complete initial integration before creating dashboard jobs.')
    remote = bootstrap.invoke(['git', '-C', str(destination), 'ls-remote', 'origin', 'refs/heads/main'])
    lines = remote.stdout.strip().splitlines()
    if remote.returncode or len(lines) != 1 or lines[0].split() != [values['head'], 'refs/heads/main']:
        raise StartError('Remote main does not match the local reviewed HEAD; reconcile through the integration writer before enqueue.')
    return values['head']


def initial_paths(destination, repository):
    """Verify an exact generated-kit inventory, never an arbitrary git add directory."""
    try:
        inventory = json.loads((destination / 'bootstrap-manifest.json').read_text())
        registry = json.loads((destination / 'agents/registry.json').read_text())
        context = json.loads((destination / 'studio-context.json').read_text())
        if inventory.get('repository') != repository or inventory.get('game_id') != context.get('game_id'):
            raise ValueError
        hashes = inventory['files']
        if not isinstance(hashes, dict) or not hashes:
            raise ValueError
        allowed = set(bootstrap.REQUIRED) | set(bootstrap.OPTIONAL_TOOLS)
        allowed |= {'docs/studio-reference/' + name for name in bootstrap.REFERENCE}
        allowed |= {'CLAUDE.md', 'README.md', 'prom.md', 'studio-context.json', '.gitignore', 'game-checks.json',
                    'docs/brief/game-brief.md', 'docs/decisions.md'}
        for role in registry['roles']:
            rid = role['id']
            if not re.fullmatch(r'[a-z][a-z0-9-]*', rid):
                raise ValueError
            allowed |= {f'agents/{rid}/prom.md', f'.claude/agents/{rid}.md'}
        if set(hashes) - allowed or not set(bootstrap.REQUIRED) <= set(hashes):
            raise ValueError
        for relative, expected in hashes.items():
            path = destination / relative
            if (not isinstance(expected, str) or not re.fullmatch(r'[a-f0-9]{64}', expected)
                    or any(p.is_symlink() for p in [path, *path.parents])
                    or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected):
                raise ValueError
        return sorted([*hashes, 'bootstrap-manifest.json'])
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        raise StartError('Initial source must match the reviewed generated kit inventory; changed or unknown files require normal integration.') from None


def initialize_source(destination, repository, progress=lambda stage: None):
    """One initial commit for a verified empty private repository; never replace history."""
    if not bootstrap.validate_git_destination(destination, repository):
        if bootstrap.invoke(['git', 'init', '--initial-branch=main', str(destination)]).returncode:
            raise StartError('Initial source Git setup failed; no commit or push occurred.')
    bootstrap.link_origin(destination, repository)
    head = bootstrap.invoke(['git', '-C', str(destination), 'rev-parse', '--verify', 'HEAD'])
    if head.returncode == 0:
        if not bootstrap.SHA.fullmatch(head.stdout.strip()):
            raise StartError('Existing source has an invalid HEAD identity.')
        return {'committed': False, 'pushed': False, 'source_commit': head.stdout.strip()}
    branch = bootstrap.invoke(['git', '-C', str(destination), 'symbolic-ref', '--short', 'HEAD'])
    if branch.returncode or branch.stdout.strip() != 'main':
        raise StartError('Initial source requires an unborn main branch; preserve other branch/history state.')
    files = initial_paths(destination, repository)
    expected_bytes = {name: (destination / name).read_bytes() for name in files}
    staged = bootstrap.invoke(['git', '-C', str(destination), 'diff', '--cached', '--name-only'])
    unknown = bootstrap.invoke(['git', '-C', str(destination), 'ls-files', '--others', '--exclude-standard'])
    if staged.returncode or staged.stdout.strip() or unknown.returncode or set(unknown.stdout.splitlines()) != set(files):
        raise StartError('Initial source requires an empty index and exactly the reviewed kit files; preserve extra user work.')
    ignored = ['.env', '.studio/start-game.json', 'private.key', 'builds/game.apk', '.worktrees/check']
    check = bootstrap.invoke(['git', '-C', str(destination), 'check-ignore', '--no-index', '--', *ignored])
    if check.returncode or set(check.stdout.splitlines()) != set(ignored):
        raise StartError('Initial source ignore checks failed for local state, secrets or build outputs.')
    remote = bootstrap.invoke(['git', '-C', str(destination), 'ls-remote', 'origin'])
    if remote.returncode or remote.stdout.strip():
        raise StartError('Initial source requires an empty remote; clone/reconcile existing history through the writer.')
    progress('initial_commit_pending')
    if bootstrap.invoke(['git', '-C', str(destination), 'add', '--', *files]).returncode:
        raise StartError('Initial source staging failed; inspect the index before retrying.')
    staged = bootstrap.invoke(['git', '-C', str(destination), 'diff', '--cached', '--name-only'])
    checks = bootstrap.invoke(['git', '-C', str(destination), 'diff', '--cached', '--check'])
    if staged.returncode or set(staged.stdout.splitlines()) != set(files) or checks.returncode:
        raise StartError('Staged initial source differs from the reviewed inventory or failed whitespace checks; no commit occurred.')
    if bootstrap.invoke(['git', '-C', str(destination), 'commit', '-m', 'Initialize reviewed original game studio kit']).returncode:
        raise StartError('Initial commit failed; inspect configured Git identity/hooks and the index. No push occurred.')
    head = bootstrap.invoke(['git', '-C', str(destination), 'rev-parse', 'HEAD'])
    if head.returncode or not bootstrap.SHA.fullmatch(head.stdout.strip()):
        raise StartError('Initial commit identity is unconfirmed; inspect local state before retrying.')
    sha = head.stdout.strip()
    tree = bootstrap.invoke(['git', '-C', str(destination), 'ls-tree', '-r', '--name-only', 'HEAD'])
    if tree.returncode or set(tree.stdout.splitlines()) != set(files):
        raise StartError('The initial commit contains unexpected paths; preserve it for review and do not push.')
    for name in files:
        blob = bootstrap.invoke(['git', '-C', str(destination), 'show', f'HEAD:{name}'])
        if blob.returncode or blob.stdout.encode() != expected_bytes[name]:
            raise StartError('The initial commit differs from the reviewed kit bytes; preserve it for review and do not push.')
    progress('initial_commit_created')
    remote = bootstrap.invoke(['git', '-C', str(destination), 'ls-remote', 'origin'])
    if remote.returncode or remote.stdout.strip():
        raise StartError('Remote changed before the initial push; local commit is preserved. Reconcile without overwriting remote history.')
    if bootstrap.remote_identity(repository) is None:
        raise StartError('The private remote identity is no longer verified; initial push stopped.')
    progress('initial_push_pending')
    bootstrap.invoke(['git', '-C', str(destination), 'push', 'origin', 'HEAD:refs/heads/main'])
    published = bootstrap.invoke(['git', '-C', str(destination), 'ls-remote', 'origin', 'refs/heads/main'])
    if published.returncode or published.stdout.split() != [sha, 'refs/heads/main']:
        raise StartError('Initial push is unconfirmed; local commit is preserved. Inspect exact remote main before retrying.')
    progress('initial_source_published')
    return {'committed': True, 'pushed': True, 'source_commit': sha}


def checkpoint_path(destination):
    folder = destination / '.studio'
    target = folder / 'start-game.json'
    if folder.is_symlink() or target.is_symlink() or (folder.exists() and not folder.is_dir()):
        raise StartError('Start checkpoint path is not a safe local directory.')
    return target


def load_checkpoint(destination, repository, title, origin):
    path = checkpoint_path(destination)
    state = {'schema_version': 1, 'repository': repository, 'title': title, 'server_url': origin,
             'idempotency_key': 'initial', 'stage': 'local_ready'}
    if path.exists():
        try:
            existing = json.loads(path.read_text())
            if not isinstance(existing, dict) or any(existing.get(key) != state[key]
                    for key in ('schema_version', 'repository', 'title', 'idempotency_key')):
                raise ValueError
            if origin and existing.get('server_url') and existing['server_url'] != origin:
                raise ValueError
            if not origin and existing.get('server_url'):
                state['server_url'] = server_origin(existing['server_url'])
            if existing.get('project_id') and not PROJECT_ID.fullmatch(existing['project_id']):
                raise ValueError
            state.update({key: existing[key] for key in ('stage', 'project_id', 'source_commit', 'job_ids') if key in existing})
        except (OSError, ValueError, TypeError):
            raise StartError('Start checkpoint conflicts with this assignment; inspect the prior operation before retrying.') from None
    return state


def save_checkpoint(destination, state):
    target = checkpoint_path(destination)
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix='.start-game-', dir=target.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(state, stream, indent=2, sort_keys=True)
            stream.write('\n')
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)


def enqueue(client, destination, state, title, summary, category, repository_url):
    client.verify()
    state['stage'] = 'project_request_pending'
    save_checkpoint(destination, state)
    result = client.request('/api/intake/projects', {'title': title, 'summary': summary, 'category': category,
        'audience': 'per_game', 'connectivity': 'per_game', 'repository_url': repository_url})
    project = result.get('project', {})
    project_id = project.get('id') if isinstance(project, dict) else None
    if (not isinstance(project_id, str) or not PROJECT_ID.fullmatch(project_id)
            or project.get('repository_url') != repository_url):
        raise StartError('Project response does not match the exact repository; inspect the pending record before retrying.')
    if state.get('project_id') and state['project_id'] != project_id:
        raise StartError('Project identity changed across retries; stop and inspect dashboard state.')
    state.update(project_id=project_id, stage='project_created')
    save_checkpoint(destination, state)
    state['stage'] = 'plan_request_pending'
    save_checkpoint(destination, state)
    result = client.request(f'/api/intake/projects/{project_id}/plan', {'idempotency_key': 'initial'})
    jobs = result.get('jobs')
    if (not isinstance(jobs, list) or not jobs or any(not isinstance(job, dict)
            or not isinstance(job.get('id'), str) or not JOB_ID.fullmatch(job['id'])
            or job.get('project_id') != project_id for job in jobs)):
        raise StartError('Plan response is invalid; the idempotent initial plan may already exist. Inspect or retry the same operation.')
    ids = [job['id'] for job in jobs]
    if len(ids) != len(set(ids)):
        raise StartError('Plan response contains duplicate jobs; inspect the initial plan before proceeding.')
    state.update(stage='pipeline_recorded', job_ids=ids)
    save_checkpoint(destination, state)
    return ids


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game_name')
    parser.add_argument('--slug')
    parser.add_argument('--destination', required=True, type=Path)
    parser.add_argument('--master-root', type=Path, default=bootstrap.ROOT)
    parser.add_argument('--master-revision')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--plan', action='store_true', help='Default: no writes or network calls')
    mode.add_argument('--execute', action='store_true', help='Prepare the local game kit and selected setup stages')
    parser.add_argument('--create-remote', action='store_true', help='Explicitly create or reuse the exact private game repository')
    parser.add_argument('--initialize-source', action='store_true', help='Commit the verified initial kit and normally push main only when both local HEAD and the private remote are empty')
    parser.add_argument('--enqueue', action='store_true', help='Queue the initial plan only after private remote and reviewed source verification')
    parser.add_argument('--server-url')
    parser.add_argument('--category', choices=CATEGORIES, default='Business simulation')
    parser.add_argument('--summary')
    args = parser.parse_args(argv)
    try:
        title = args.game_name.strip()
        if len(title) < 3 or len(title) > 100 or any(ord(c) < 32 or ord(c) == 127 for c in title):
            raise StartError('Game name must contain 3–100 printable characters on one line.')
        args.game_name = title
        slug = args.slug if args.slug is not None else derive_slug(title)
        if not bootstrap.SLUG.fullmatch(slug):
            raise StartError('--slug must match [a-z][a-z0-9-]{2,50}; paths and owner overrides are forbidden.')
        if '..' in args.destination.parts:
            raise StartError('Destination cannot contain parent traversal.')
        destination = args.destination.absolute()
        root = args.master_root.resolve()
        if destination == root or destination.is_relative_to(root) or root.is_relative_to(destination):
            raise StartError('Game destination must be separate from the master source directory.')
        for path in [destination, *destination.parents]:
            if path.is_symlink():
                raise StartError('Destination must not traverse a symlink.')
        origin = server_origin(args.server_url) if args.server_url else None
        if args.enqueue and not origin:
            raise StartError('--enqueue requires the verified studio --server-url.')
        repository = f'swiftSaneGames/{slug}'
        repository_url = f'https://github.com/{repository}'
        summary = args.summary or f'Create an original, easy-to-play {title} game. Agents must establish the design and validate both mobile platforms.'
        if not 1 <= len(summary) <= 4000 or any(ord(c) < 32 and c not in '\n\t' for c in summary):
            raise StartError('Summary must contain 1–4000 valid text characters.')
        if not args.execute:
            print(json.dumps({'mode': 'plan', 'title': title, 'repository': repository, 'destination': str(destination),
                'create_remote': args.create_remote, 'enqueue': args.enqueue, 'server_url': origin,
                'initialize_source': args.initialize_source,
                'initial_source_effects': ['stage exact kit', 'initial commit', 'normal main push'] if args.initialize_source else [],
                'source_gate': 'clean reviewed main commit matching the verified private remote',
                'workers_started': False, 'writes': False}, indent=2))
            return 0
        token = os.getenv('INTAKE_TOKEN', '') if args.enqueue else ''
        if args.enqueue and (len(token) < 40 or '\r' in token or '\n' in token):
            raise StartError('Set a valid INTAKE_TOKEN through local secret configuration; never place it in command arguments.')
        ensure_local(args, slug, repository, destination)
        state = load_checkpoint(destination, repository, title, origin)
        save_checkpoint(destination, state)
        remote = ensure_remote(destination, repository, args.create_remote) if args.create_remote or args.enqueue or args.initialize_source else None
        source = {'committed': False, 'pushed': False}
        if args.initialize_source:
            def record_stage(stage):
                state['stage'] = stage
                save_checkpoint(destination, state)
            source = initialize_source(destination, repository, record_stage)
            state['source_commit'] = source['source_commit']
            save_checkpoint(destination, state)
        if args.enqueue:
            state['stage'] = 'source_verification_pending'
            save_checkpoint(destination, state)
            state['source_commit'] = verified_source(destination, repository)
            ids = enqueue(Client(origin, token), destination, state, title, summary, args.category, repository_url)
            print(json.dumps({'mode': 'pipeline_recorded', 'repository': repository, 'project_id': state['project_id'],
                'job_ids': ids, 'workers_started': False, **source,
                'execution': 'Initial jobs queued or already present; execution requires a separately configured authenticated worker.'}, indent=2))
        else:
            print(json.dumps({'mode': 'local_ready', 'repository': repository, 'remote_private_verified': remote is not None,
                'enqueued': False, 'workers_started': False, **source,
                'next': 'Have the integration writer review and publish initial main source, configure the worker repository mapping, then enqueue.'}, indent=2))
        return 0
    except (StartError, bootstrap.BootstrapError) as exc:
        print('STOP: ' + str(exc))
        return 1
    except OSError:
        print('STOP: Local state could not be saved. Inspect the checkpoint and remote state before retrying.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
