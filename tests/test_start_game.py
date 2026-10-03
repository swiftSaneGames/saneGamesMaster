"""Offline game-start tests; subprocesses and HTTPS are mocked."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import start_game as start

SHA = 'a' * 40
REPO = 'swiftSaneGames/happy-hotel'
URL = 'https://github.com/' + REPO
TOKEN = 'private-intake-secret-' + 'x' * 40


class FakeClient:
    calls = []
    fail_plan = False
    def __init__(self, origin, token):
        self.origin = origin
    def verify(self):
        self.calls.append(('verify', None))
    def request(self, path, payload=None, authenticated=True):
        self.calls.append((path, payload))
        if path == '/api/intake/projects':
            return {'project': {'id': 'p-abcd', 'repository_url': URL}, 'idempotent': True}
        if self.fail_plan:
            raise start.StartError('Dashboard response is unavailable; pending operation may have completed.')
        return {'jobs': [{'id': 'j-abcd', 'project_id': 'p-abcd'}], 'agents_started': False}


class StartTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.game = Path(self.temp.name) / 'happy-hotel'
        self.master = Path(self.temp.name) / 'master'
        self.master.mkdir()
        self.args = ['Happy Hotel', '--destination', str(self.game), '--master-root', str(self.master)]
        FakeClient.calls = []
        FakeClient.fail_plan = False

    def local(self, args, slug, repository, destination):
        destination.mkdir(exist_ok=True)
        (destination / 'README.md').write_text('Reviewed kit\n')

    def run_main(self, more=()):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            result = start.main([*self.args, *more])
        return result, out.getvalue()

    def execute_context(self):
        stack = contextlib.ExitStack()
        stack.enter_context(patch.object(start, 'ensure_local', side_effect=self.local))
        stack.enter_context(patch.object(start, 'ensure_remote', return_value={'id': 'R_1', 'private': True}))
        stack.enter_context(patch.object(start, 'verified_source', return_value=SHA))
        stack.enter_context(patch.object(start, 'Client', FakeClient))
        stack.enter_context(patch.dict(os.environ, {'INTAKE_TOKEN': TOKEN}))
        return stack

    def test_name_only_plan_lists_side_effects_without_running_them(self):
        with patch.object(start, 'ensure_local', side_effect=AssertionError('must not run')):
            code, out = self.run_main(['--create-remote', '--initialize-source'])
        self.assertEqual(code, 0)
        plan = json.loads(out)
        self.assertEqual(plan['repository'], REPO)
        self.assertEqual(plan['initial_source_effects'], ['stage exact kit', 'initial commit', 'normal main push'])
        self.assertFalse(plan['writes'])
        self.assertFalse(self.game.exists())

    def test_slug_derivation_and_invalid_explicit_paths(self):
        self.assertEqual(start.derive_slug('Café Garden!'), 'cafe-garden')
        for value in ['../escape', 'Other/repo', 'x', 'a;touch bad']:
            with self.subTest(value=value):
                code, _ = self.run_main(['--slug', value, '--execute'])
                self.assertEqual(code, 1)
                self.assertFalse(self.game.exists())

    def test_https_origin_validation(self):
        for value in ['http://studio.example', 'https://user:secret@studio.example',
                      'https://studio.example/api', 'https://studio.example?token=x',
                      'https://studio.example/#x', 'https://studio.example:444', 'https://bad host']:
            with self.subTest(value=value):
                with self.assertRaises(start.StartError):
                    start.server_origin(value)
        self.assertEqual(start.server_origin('https://STUDIO.example/'), 'https://studio.example')

    def test_execute_local_never_contacts_remote_without_flags(self):
        with patch.object(start, 'ensure_local', side_effect=self.local), patch.object(start, 'ensure_remote') as remote:
            code, out = self.run_main(['--execute'])
        self.assertEqual(code, 0, out)
        remote.assert_not_called()
        self.assertFalse(json.loads(out)['enqueued'])
        self.assertNotIn(TOKEN, (self.game / '.studio/start-game.json').read_text())

    def test_enqueue_checks_source_and_remote_before_http(self):
        with self.execute_context(), patch.object(start, 'verified_source', side_effect=start.StartError('No reviewed HEAD')):
            code, out = self.run_main(['--execute', '--enqueue', '--server-url', 'https://studio.example'])
        self.assertEqual(code, 1)
        self.assertEqual(FakeClient.calls, [])
        self.assertNotIn(TOKEN, out)
        self.assertEqual(json.loads((self.game / '.studio/start-game.json').read_text())['stage'], 'source_verification_pending')

    def test_public_remote_rejection_prevents_any_http(self):
        with self.execute_context(), patch.object(start, 'ensure_remote', side_effect=start.bootstrap.BootstrapError('Existing remote is public')):
            code, _ = self.run_main(['--execute', '--enqueue', '--server-url', 'https://studio.example'])
        self.assertEqual(code, 1)
        self.assertEqual(FakeClient.calls, [])

    def test_repeated_enqueue_uses_same_repo_and_initial_idempotency_key(self):
        with self.execute_context():
            for _ in range(2):
                code, out = self.run_main(['--execute', '--enqueue', '--server-url', 'https://studio.example'])
                self.assertEqual(code, 0, out)
        creates = [body for path, body in FakeClient.calls if path == '/api/intake/projects']
        plans = [body for path, body in FakeClient.calls if path.endswith('/plan')]
        self.assertEqual(len(creates), 2)
        self.assertTrue(all(body['repository_url'] == URL for body in creates))
        self.assertEqual(plans, [{'idempotency_key': 'initial'}] * 2)
        self.assertFalse(json.loads(out)['workers_started'])
        self.assertNotIn(TOKEN, out)
        self.assertNotIn(TOKEN, (self.game / '.studio/start-game.json').read_text())

    def test_uncertain_plan_retains_project_id_and_pending_stage(self):
        with self.execute_context():
            FakeClient.fail_plan = True
            code, out = self.run_main(['--execute', '--enqueue', '--server-url', 'https://studio.example'])
        self.assertEqual(code, 1)
        state = json.loads((self.game / '.studio/start-game.json').read_text())
        self.assertEqual(state['project_id'], 'p-abcd')
        self.assertEqual(state['stage'], 'plan_request_pending')
        self.assertNotIn(TOKEN, out)

    def test_missing_token_fails_before_local_changes(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(start, 'ensure_local') as local:
            code, out = self.run_main(['--execute', '--enqueue', '--server-url', 'https://studio.example'])
        self.assertEqual(code, 1)
        local.assert_not_called()
        self.assertNotIn(TOKEN, out)

    def test_client_refuses_redirect_and_never_logs_response_body_or_token(self):
        class Redirect:
            status = 302
            def __enter__(self): return self
            def __exit__(self, *args): return None
            def read(self, size): return TOKEN.encode()
        client = start.Client('https://studio.example', TOKEN)
        with patch.object(client.opener, 'open', return_value=Redirect()) as mocked:
            with self.assertRaises(start.StartError) as caught:
                client.request('/api/intake/projects', {})
        self.assertNotIn(TOKEN, str(caught.exception))
        self.assertEqual(mocked.call_count, 1)
        self.assertIsNone(start.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.example'))

    def test_health_probe_sends_no_bearer(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): return None
            def read(self, size): return b'{"status":"ok","component":"cloudflare-native-worker"}'
        client = start.Client('https://studio.example', TOKEN)
        with patch.object(client.opener, 'open', return_value=Response()) as mocked:
            client.verify()
        self.assertFalse(mocked.call_args.args[0].has_header('Authorization'))

    def test_initial_inventory_rejects_a_secret_path_even_with_valid_hash(self):
        self.game.mkdir()
        contents = {name: b'Generic kit content\n' for name in start.bootstrap.REQUIRED}
        contents['agents/registry.json'] = b'{"roles":[{"id":"studio-director"}]}'
        contents['studio-context.json'] = json.dumps({'game_id': 'happy-hotel'}).encode()
        contents['.env'] = b'SECRET_MUST_NOT_BE_STAGED\n'
        for name, data in contents.items():
            path = self.game / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        (self.game / 'bootstrap-manifest.json').write_text(json.dumps({
            'repository': REPO, 'game_id': 'happy-hotel',
            'files': {name: hashlib.sha256(data).hexdigest() for name, data in contents.items()}}))
        with self.assertRaisesRegex(start.StartError, 'reviewed generated kit inventory'):
            start.initial_paths(self.game, REPO)

    def git_fake(self, advanced=False, extra_staged=False, extra_tree=False):
        calls = []
        staged = False
        remote_reads = 0
        def invoke(argv, cwd=None):
            nonlocal staged, remote_reads
            calls.append(argv)
            command = argv[3:]
            output, code = '', 0
            if command == ['rev-parse', '--verify', 'HEAD']:
                code = 1
            elif command == ['symbolic-ref', '--short', 'HEAD']:
                output = 'main\n'
            elif command == ['diff', '--cached', '--name-only']:
                output = 'README.md\n' if staged else ('private.key\n' if extra_staged else '')
            elif command == ['ls-files', '--others', '--exclude-standard']:
                output = 'README.md\n'
            elif command[:1] == ['check-ignore']:
                output = '\n'.join(command[3:]) + '\n'
            elif command == ['ls-remote', 'origin']:
                remote_reads += 1
                if advanced and remote_reads == 2:
                    output = 'b' * 40 + '\trefs/heads/main\n'
            elif command[:1] == ['add']:
                staged = True
            elif command == ['rev-parse', 'HEAD']:
                output = SHA + '\n'
            elif command == ['ls-tree', '-r', '--name-only', 'HEAD']:
                output = 'README.md\n' + ('extra.txt\n' if extra_tree else '')
            elif command == ['show', 'HEAD:README.md']:
                output = 'Reviewed kit\n'
            elif command == ['ls-remote', 'origin', 'refs/heads/main']:
                output = SHA + '\trefs/heads/main\n'
            return subprocess.CompletedProcess(argv, code, output, '')
        return invoke, calls

    def initialize(self, **kwargs):
        self.game.mkdir()
        (self.game / 'README.md').write_text('Reviewed kit\n')
        fake, calls = self.git_fake(**kwargs)
        stack = contextlib.ExitStack()
        stack.enter_context(patch.object(start.bootstrap, 'validate_git_destination', return_value=True))
        stack.enter_context(patch.object(start.bootstrap, 'link_origin'))
        stack.enter_context(patch.object(start.bootstrap, 'remote_identity', return_value={'id': 'R_1', 'private': True}))
        stack.enter_context(patch.object(start, 'initial_paths', return_value=['README.md']))
        stack.enter_context(patch.object(start.bootstrap, 'invoke', side_effect=fake))
        return stack, calls

    def test_initial_source_commits_named_files_and_normal_push_only(self):
        stack, calls = self.initialize()
        with stack:
            result = start.initialize_source(self.game, REPO)
        self.assertTrue(result['committed'])
        self.assertTrue(result['pushed'])
        self.assertIn(['git', '-C', str(self.game), 'add', '--', 'README.md'], calls)
        self.assertIn(['git', '-C', str(self.game), 'push', 'origin', 'HEAD:refs/heads/main'], calls)
        self.assertFalse(any('--force' in call or '--all' in call for call in calls))

    def test_remote_advance_after_initial_commit_blocks_push(self):
        stack, calls = self.initialize(advanced=True)
        with stack, self.assertRaisesRegex(start.StartError, 'Remote changed'):
            start.initialize_source(self.game, REPO)
        self.assertTrue(any('commit' in call for call in calls))
        self.assertFalse(any('push' in call for call in calls))

    def test_extra_staged_file_blocks_commit(self):
        stack, calls = self.initialize(extra_staged=True)
        with stack, self.assertRaisesRegex(start.StartError, 'empty index'):
            start.initialize_source(self.game, REPO)
        self.assertFalse(any('commit' in call or 'push' in call for call in calls))

    def test_commit_hook_extra_file_blocks_push(self):
        stack, calls = self.initialize(extra_tree=True)
        with stack, self.assertRaisesRegex(start.StartError, 'unexpected paths'):
            start.initialize_source(self.game, REPO)
        self.assertFalse(any('push' in call for call in calls))


if __name__ == '__main__':
    unittest.main()
