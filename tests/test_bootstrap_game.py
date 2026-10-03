"""Offline bootstrap regressions. No GitHub calls, repositories or credentials required."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('bootstrap_game', Path(__file__).resolve().parents[1] / 'scripts/bootstrap_game.py')
bootstrap = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bootstrap)
SHA = 'a' * 40


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'master'
        self.root.mkdir()
        self.destination = Path(self.temp.name) / 'game'
        for relative in bootstrap.REQUIRED:
            self.write(relative, '# Generic studio text\n')
        self.write('agents/registry.json', json.dumps({'roles': [{
            'id': 'studio-director', 'prompt': 'agents/studio-director/prom.md',
            'definition': '.claude/agents/studio-director.md'}]}))
        self.write('agents/studio-director/prom.md', '# Director\n')
        self.write('.claude/agents/studio-director.md', '# Generated director\n')
        self.write('templates/game/CLAUDE.md', '# GAME_NAME\nGAME_ID OWNER/REPOSITORY MASTER_SHA\n')
        self.write('docs/DECISIONS.md', '# Confirmed generic decisions\n')
        self.write('cloudflare/native/models.mjs', '// reference schema, not a running app\n')
        self.argv = ['--slug', 'happy-hotel', '--title', 'Happy Hotel', '--destination', str(self.destination),
                     '--master-root', str(self.root), '--master-revision', SHA]

    def write(self, relative, content):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def call(self, extra=(), argv=None):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = bootstrap.main([*(self.argv if argv is None else argv), *extra])
        return code, out.getvalue()

    def test_default_plan_has_no_writes_or_remote_commands(self):
        with patch.object(bootstrap, 'invoke', side_effect=AssertionError('No process needed')):
            code, out = self.call(['--create-remote'])
        self.assertEqual(code, 0, out)
        self.assertFalse(self.destination.exists())
        self.assertEqual(json.loads(out)['mode'], 'plan')
        self.assertFalse(json.loads(out)['push'])

    def test_slug_rejects_traversal_owner_overrides_and_shell_text(self):
        for bad in ['../escape', 'xx', 'evil/name', '-bad', 'Uppercase', 'x;whoami', 'a' * 52]:
            with self.subTest(bad=bad):
                args = ['--slug=' + bad, *self.argv[2:]]
                code, _ = self.call(['--apply'], args)
                self.assertEqual(code, 1)
                self.assertFalse(self.destination.exists())

    def test_apply_is_repeatable_and_pins_exact_local_snapshot(self):
        code, out = self.call(['--apply'])
        self.assertEqual(code, 0, out)
        before = {str(p.relative_to(self.destination)): p.read_bytes()
                  for p in self.destination.rglob('*') if p.is_file()}
        code, out = self.call(['--apply'])
        self.assertEqual(code, 0, out)
        after = {str(p.relative_to(self.destination)): p.read_bytes()
                 for p in self.destination.rglob('*') if p.is_file()}
        self.assertEqual(before, after)
        context = json.loads((self.destination / 'studio-context.json').read_text())
        self.assertEqual(context['master_revision'], SHA)
        self.assertEqual(len(context['master_snapshot_sha256']), 64)
        self.assertEqual(context['policy_reference'], 'docs/studio-reference')
        self.assertTrue((self.destination / 'docs/studio-reference/cloudflare/native/models.mjs').exists())
        self.assertFalse((self.destination / 'cloudflare').exists())
        self.assertIn('Happy Hotel', (self.destination / 'CLAUDE.md').read_text())
        self.assertNotIn('OWNER/REPOSITORY', (self.destination / 'CLAUDE.md').read_text())

    def test_changed_user_file_stops_before_any_new_file(self):
        self.assertEqual(self.call(['--apply'])[0], 0)
        (self.destination / 'README.md').write_text('Existing user work\n')
        (self.destination / 'prom.md').unlink()
        code, out = self.call(['--apply'])
        self.assertEqual(code, 1)
        self.assertIn('README.md', out)
        self.assertEqual((self.destination / 'README.md').read_text(), 'Existing user work\n')
        self.assertFalse((self.destination / 'prom.md').exists())

    def test_existing_unidentified_or_different_game_directory_rejected(self):
        self.destination.mkdir()
        self.assertEqual(self.call(['--apply'])[0], 1)
        (self.destination / 'studio-context.json').write_text(json.dumps({
            'repository': 'swiftSaneGames/other-game', 'game_id': 'other-game', 'master_repository': bootstrap.MASTER}))
        self.assertEqual(self.call(['--apply'])[0], 1)
        self.assertFalse((self.destination / 'CLAUDE.md').exists())

    def test_exact_allowlist_excludes_secrets_binaries_and_unknown_claude_files(self):
        for relative in ['.env', '.env.production', 'wrangler.jsonc', '.claude/settings.local.json',
                         '.claude/secret.txt', 'docs/private-customer.md', 'release/app.ipa', 'keys/private.pem',
                         'agents/studio-director/secret.txt', 'scripts/unreviewed.py']:
            self.write(relative, 'NEVER_COPY_SECRET_MARKER')
        code, out = self.call(['--apply'])
        self.assertEqual(code, 0, out)
        for path in self.destination.rglob('*'):
            if path.is_file():
                self.assertNotIn(b'NEVER_COPY_SECRET_MARKER', path.read_bytes(), str(path))

    def test_registry_cannot_copy_arbitrary_files(self):
        self.write('agents/registry.json', json.dumps({'roles': [{
            'id': 'studio-director', 'prompt': '../secret', 'definition': '.claude/agents/studio-director.md'}]}))
        self.assertEqual(self.call(['--apply'])[0], 1)
        self.assertFalse(self.destination.exists())

    def test_symlink_source_or_destination_rejected(self):
        self.write('private.txt', 'do not copy')
        source = self.root / 'agents/COMMON.md'
        source.unlink()
        source.symlink_to(self.root / 'private.txt')
        self.assertEqual(self.call(['--apply'])[0], 1)
        source.unlink()
        source.write_text('Shared contract')
        outside = Path(self.temp.name) / 'outside'
        outside.mkdir()
        self.destination.symlink_to(outside, target_is_directory=True)
        self.assertEqual(self.call(['--apply'])[0], 1)
        self.assertEqual(list(outside.iterdir()), [])

    def test_optional_hook_requires_its_exact_local_script(self):
        settings = {'hooks': {'SessionStart': [{'hooks': [{
            'type': 'command', 'command': 'python3 "${CLAUDE_PROJECT_DIR}/scripts/agent_hooks.py" session-start'}]}]}}
        self.write('.claude/settings.json', json.dumps(settings))
        self.assertEqual(self.call(['--apply'])[0], 1)
        self.assertFalse(self.destination.exists())
        self.write('scripts/agent_hooks.py', '# Reviewed local hook\n')
        code, out = self.call(['--apply'])
        self.assertEqual(code, 0, out)
        self.assertTrue((self.destination / 'scripts/agent_hooks.py').is_file())

    def test_existing_public_remote_fails_before_local_write(self):
        def fake(argv, cwd=None):
            self.assertEqual(argv[:3], ['gh', 'repo', 'view'])
            return subprocess.CompletedProcess(argv, 0, json.dumps({
                'id': 'R_1', 'nameWithOwner': 'swiftSaneGames/happy-hotel', 'isPrivate': False}), '')
        with patch.object(bootstrap, 'invoke', side_effect=fake):
            code, out = self.call(['--apply', '--create-remote'])
        self.assertEqual(code, 1)
        self.assertIn('public, mismatched', out)
        self.assertFalse(self.destination.exists())

    def test_existing_private_remote_reused_without_create_or_push(self):
        calls = []
        def fake(argv, cwd=None):
            calls.append(argv)
            if argv[:3] == ['gh', 'repo', 'view']:
                return subprocess.CompletedProcess(argv, 0, json.dumps({
                    'id': 'R_1', 'nameWithOwner': 'swiftSaneGames/happy-hotel', 'isPrivate': True}), '')
            return subprocess.CompletedProcess(argv, 0, '', '')
        with patch.object(bootstrap, 'invoke', side_effect=fake):
            code, out = self.call(['--apply', '--create-remote'])
        self.assertEqual(code, 0, out)
        self.assertFalse(any('create' in argv or 'push' in argv for argv in calls))
        self.assertTrue(json.loads(out)['remote']['private'])

    def test_new_remote_command_is_explicit_private_argv_without_push(self):
        calls = []
        views = 0
        def fake(argv, cwd=None):
            nonlocal views
            calls.append(argv)
            if argv[:3] == ['gh', 'repo', 'view']:
                views += 1
                if views == 1:
                    return subprocess.CompletedProcess(argv, 1, '', 'GraphQL: Could not resolve to a Repository')
                return subprocess.CompletedProcess(argv, 0, json.dumps({
                    'id': 'R_2', 'nameWithOwner': 'swiftSaneGames/happy-hotel', 'isPrivate': True}), '')
            return subprocess.CompletedProcess(argv, 0, '', '')
        with patch.object(bootstrap, 'invoke', side_effect=fake):
            code, out = self.call(['--apply', '--create-remote'])
        self.assertEqual(code, 0, out)
        command = next(argv for argv in calls if argv[:3] == ['gh', 'repo', 'create'])
        self.assertEqual(command, ['gh', 'repo', 'create', 'swiftSaneGames/happy-hotel', '--private', '--source', str(self.destination)])
        self.assertFalse(any('push' in argv or '--public' in argv for argv in calls))

    def test_remote_auth_error_is_not_absence_and_does_not_print_credentials(self):
        with patch.object(bootstrap, 'invoke', return_value=subprocess.CompletedProcess(
                ['gh'], 1, '', 'authentication failed token=DO_NOT_PRINT')) as mocked:
            code, out = self.call(['--apply', '--create-remote'])
        self.assertEqual(code, 1)
        self.assertNotIn('DO_NOT_PRINT', out)
        self.assertEqual(mocked.call_count, 1)
        self.assertFalse(self.destination.exists())

    def test_reused_remote_connects_missing_origin_without_push(self):
        calls = []
        def fake(argv, cwd=None):
            calls.append(argv)
            return subprocess.CompletedProcess(argv, 1 if 'get-url' in argv else 0, '', '')
        with patch.object(bootstrap, 'invoke', side_effect=fake):
            bootstrap.link_origin(self.destination, 'swiftSaneGames/happy-hotel')
        self.assertEqual(calls[-1], ['git', '-C', str(self.destination), 'remote', 'add', 'origin',
                                   'https://github.com/swiftSaneGames/happy-hotel.git'])
        self.assertFalse(any('push' in argv for argv in calls))


if __name__ == '__main__':
    unittest.main()
