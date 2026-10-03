"""Offline worker tests. No Claude execution, HTTP, remote Git, or account access."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location('studio_worker', Path(__file__).resolve().parents[1] / 'scripts/studio_worker.py')
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


def result(**changes):
    value = {'summary': 'Evidence reviewed.', 'artifacts': [],
             'checks': [{'name': 'evidence review', 'status': 'pass'}], 'outcome': 'pass'}
    value.update(changes)
    return value


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        worker.STOP = False

    def config(self):
        return {'claude_command': 'claude', 'capabilities': ['studio-developer', 'studio-qa'],
                'max_turns': 12, 'model': 'opus', 'job_timeout_seconds': 120,
                'worker_name': 'test', 'state_root': self.root / 'state',
                'artifact_root': self.root / 'artifacts', 'refresh_main': False,
                'allowed_tools': {'studio-developer': ['Read', 'Edit(./**)', 'Write(./**)'], 'studio-qa': ['Read'], 'integration-writer': ['Read']}}

    def git(self, path, *args):
        command = ['git', '-C', str(path), *args]
        completed = subprocess.run(command, capture_output=True, text=True, check=True,
                                   env=worker.sanitized_environment())
        return completed.stdout.strip()

    def repository(self):
        checkout = self.root / 'repo'
        checkout.mkdir()
        self.git(checkout, 'init', '-q')
        self.git(checkout, 'remote', 'add', 'origin', 'https://github.com/example/game.git')
        self.git(checkout, 'config', 'user.name', 'Worker Fixture')
        self.git(checkout, 'config', 'user.email', 'fixture@example.invalid')
        for role in ['studio-developer', 'studio-qa', 'integration-writer']:
            for relative in ['CLAUDE.md', 'agents/COMMON.md', f'agents/{role}/prom.md', f'.claude/agents/{role}.md']:
                target = checkout / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('Test fixture contract.\n')
        (checkout / 'game.txt').write_text('original\n')
        self.git(checkout, 'add', '.')
        self.git(checkout, '-c', 'user.name=Worker Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture')
        return checkout

    def test_repository_identity_normalization(self):
        self.assertEqual(worker.canonical_repository('git@github.com:Example/Game.git'), 'https://github.com/example/game')
        self.assertEqual(worker.canonical_repository('https://github.com/example/game'), 'https://github.com/example/game')

    def test_repository_url_injection_rejected(self):
        for url in ['https://token@github.com/o/r', 'https://evil.test/o/r', 'https://github.com/o/r?x=1',
                    'https://github.com/o/r#x', '--upload-pack=evil', 'https://github.com/o/../r',
                    'https://github.com/o/r;touch x', 'ssh://git@github.com/o/r']:
            with self.subTest(url=url), self.assertRaises(worker.WorkerError):
                worker.canonical_repository(url)

    def test_artifact_path_injection_rejected(self):
        for path in ['/tmp/secret', '../key', 'x/../../key', '.git/config', 'x\\file', 'x//file',
                     '.env', 'x/.env.local', 'key.pem', 'file\nname', 'studio-artifact://x/file']:
            with self.subTest(path=path), self.assertRaises(worker.WorkerError):
                worker.safe_relative(path)

    def test_environment_scrubs_all_service_and_api_credentials(self):
        secret_names = ['STUDIO_WORKER_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
                        'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN',
                        'AWS_ACCESS_KEY_ID', 'SSH_AUTH_SOCK', 'APPLE_ID_PASSWORD',
                        'CLAUDE_CODE_USE_BEDROCK', 'CLOUDFLARE_API_TOKEN', 'GIT_CONFIG_COUNT']
        source = {name: 'sensitive' for name in secret_names}
        source.update(PATH='/usr/bin', HOME='/Users/worker', LANG='en_US.UTF-8')
        cleaned = worker.sanitized_environment(source)
        self.assertEqual(cleaned['HOME'], '/Users/worker')
        self.assertTrue(all(name not in cleaned for name in secret_names))
        self.assertEqual(cleaned['GIT_TERMINAL_PROMPT'], '0')

    def test_cli_command_pins_model_and_omits_permission_bypass(self):
        command = worker.build_command(self.config(), 'studio-developer')
        self.assertEqual(command, ['claude', '-p', '--agent', 'studio-developer', '--output-format',
                                  'json', '--max-turns', '12', '--permission-mode', 'dontAsk', '--allowedTools', 'Read,Edit(./**),Write(./**)', '--model', 'opus'])
        self.assertFalse(any('bypass' in item or 'dangerously' in item for item in command))

    def test_optional_effort_is_not_a_model(self):
        config = self.config()
        config['effort'] = 'ultracode'
        self.assertEqual(worker.build_command(config, 'studio-qa')[-2:], ['--effort', 'ultracode'])
        with self.assertRaises(worker.WorkerError):
            worker.build_command(config, '--evil')

    def test_result_rejects_unsupported_or_missing_evidence(self):
        for value in [result(checks=[]), result(outcome='pass', checks=[{'name': 'test', 'status': 'fail'}]),
                      result(artifacts=[{'path': '../secret'}]), result(approved=True),
                      result(source_commit='not-a-sha')]:
            with self.subTest(value=value), self.assertRaises(worker.WorkerError):
                worker.validate_result(value)
        self.assertEqual(worker.validate_result(result(outcome='blocked', checks=[{'name': 'device', 'status': 'not_run'}]))['outcome'], 'blocked')

    def test_declared_artifact_must_exist_and_not_escape(self):
        outside = self.root / 'outside'
        outside.write_text('private')
        workspace = self.root / 'workspace'
        workspace.mkdir()
        (workspace / 'link').symlink_to(outside)
        for path in ['missing', 'link']:
            with self.assertRaises(worker.WorkerError):
                worker.validate_result(result(artifacts=[{'path': path}]), workspace)

    def test_cli_exit_zero_does_not_replace_structured_result(self):
        stdout = self.root / 'stdout'
        stdout.write_text(json.dumps({'result': 'Done!'}))
        with self.assertRaises(worker.WorkerError):
            worker.parse_cli_result(stdout, self.root / 'result.json', self.root)

    def test_readonly_role_result_is_persisted_by_worker(self):
        stdout = self.root / 'stdout'
        stdout.write_text(json.dumps({'is_error': False, 'result': json.dumps(result())}))
        target = self.root / '.studio/results/j1.json'
        parsed = worker.parse_cli_result(stdout, target, self.root)
        self.assertEqual(parsed, result())
        self.assertEqual(json.loads(target.read_text()), result())

    def test_usage_or_auth_error_is_not_completion(self):
        stdout = self.root / 'stdout'
        stdout.write_text(json.dumps({'is_error': True, 'result': 'Usage limit'}))
        with self.assertRaises(worker.WorkerError):
            worker.parse_cli_result(stdout, self.root / 'result.json', self.root)

    def test_lease_loss_terminates_running_process(self):
        process = mock.Mock()
        process.poll.return_value = None
        api = mock.Mock()
        api.post.side_effect = worker.WorkerError('request uncertain')
        with mock.patch.object(worker, 'terminate_process') as terminate:
            with self.assertRaises(worker.LeaseLost):
                worker.supervise(process, api, {'job_id': 'j1'}, self.config(),
                                 clock=iter([0, 46]).__next__, pause=lambda _: None)
            terminate.assert_called_once_with(process)
        self.assertEqual(api.post.call_args.args[0], 'renew')

    def test_cancellation_terminates_process(self):
        process = mock.Mock()
        process.poll.return_value = None
        worker.STOP = True
        with mock.patch.object(worker, 'terminate_process') as terminate:
            with self.assertRaises(worker.WorkerError):
                worker.supervise(process, mock.Mock(), {}, self.config())
            terminate.assert_called_once()

    def test_timeout_terminates_process(self):
        process = mock.Mock()
        process.poll.return_value = None
        with mock.patch.object(worker, 'terminate_process') as terminate:
            with self.assertRaises(worker.WorkerError):
                worker.supervise(process, mock.Mock(), {}, self.config(), clock=iter([0, 121]).__next__)
            terminate.assert_called_once()

    def test_redirect_never_forwards_token(self):
        with self.assertRaises(worker.WorkerError):
            worker.RejectRedirect().redirect_request(None, None, 302, '', {}, 'https://evil.test')

    def test_checkout_remote_must_match(self):
        checkout = self.repository()
        self.assertEqual(len(worker.verify_checkout(checkout, 'https://github.com/example/game')), 40)
        with self.assertRaises(worker.WorkerError):
            worker.verify_checkout(checkout, 'https://github.com/example/other')

    def test_prepare_creates_detached_persistent_worktree(self):
        checkout = self.repository()
        config = self.config()
        config['repositories'] = {'https://github.com/example/game': checkout}
        run_root, workspace, result_path, assignment = worker.prepare_workspace(
            {'id': 'j1', 'role': 'studio-developer', 'repository_url': 'https://github.com/example/game', 'dependency_results': []},
            {'token': 'lease', 'fence': 1}, config)
        self.assertTrue((workspace / 'game.txt').exists())
        self.assertEqual(self.git(workspace, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD')
        self.assertTrue((run_root / 'assignment.json').exists())
        self.assertEqual(result_path, workspace / '.studio/results/j1.json')
        self.assertNotIn('token', json.dumps(assignment))
        with self.assertRaises(worker.WorkerError):
            worker.prepare_workspace({'id': '../../escape', 'role': 'studio-developer'}, {'token': 'x', 'fence': 1}, config)

    def test_missing_cross_machine_artifact_blocks(self):
        job = {'dependency_results': [{'id': 'd1', 'fence': 2, 'status': 'succeeded',
                    'result': result(artifacts=[{'path': 'outputs/report.md'}])}]}
        with self.assertRaisesRegex(worker.WorkerError, 'unavailable on this Mac'):
            worker.dependency_sources(job, self.config())

    def candidate_fixture(self):
        checkout = self.repository()
        config = self.config()
        config['repositories'] = {'https://github.com/example/game': checkout}
        job = {'id': 'dev1', 'role': 'studio-developer', 'repository_url': 'https://github.com/example/game', 'dependency_results': []}
        lease = {'token': 'lease', 'fence': 1}
        run_root, workspace, _, assignment = worker.prepare_workspace(job, lease, config)
        (workspace / 'game.txt').write_text('candidate\n')
        (workspace / 'feature.txt').write_text('new feature\n')
        published = worker.package_result(result(artifacts=[{'path': 'feature.txt'}]), job, lease,
                                          workspace, run_root, config, assignment)
        dependency = {'id': 'dev1', 'role': 'studio-developer', 'fence': 1, 'status': 'succeeded',
                      'repository_url': job['repository_url'], 'result': published}
        qa_job = {'id': 'qa1', 'role': 'studio-qa', 'repository_url': job['repository_url'],
                  'candidate_dependency_id': 'dev1', 'dependency_results': [dependency]}
        return checkout, config, qa_job

    def test_candidate_assembly_changes_only_detached_qa_workspace(self):
        checkout, config, job = self.candidate_fixture()
        _, workspace, _, assignment = worker.prepare_workspace(job, {'token': 'q', 'fence': 1}, config)
        self.assertEqual((workspace / 'game.txt').read_text(), 'candidate\n')
        self.assertEqual((workspace / 'feature.txt').read_text(), 'new feature\n')
        self.assertEqual((checkout / 'game.txt').read_text(), 'original\n')
        self.assertFalse((checkout / 'feature.txt').exists())
        self.assertEqual(assignment['candidate']['status'], 'isolated_candidate_only_not_integrated')
        self.assertEqual(self.git(checkout, 'status', '--porcelain'), '')

    def test_candidate_tampering_is_rejected(self):
        _, config, job = self.candidate_fixture()
        (config['artifact_root'] / 'dev1/1/changes.patch').write_text('tampered')
        with self.assertRaisesRegex(worker.WorkerError, 'hash'):
            worker.prepare_workspace(job, {'token': 'q', 'fence': 1}, config)

    def test_candidate_wrong_base_is_rejected(self):
        checkout, config, job = self.candidate_fixture()
        (checkout / 'game.txt').write_text('new main\n')
        self.git(checkout, 'add', '.')
        self.git(checkout, '-c', 'user.name=Worker Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'advance fixture')
        with self.assertRaisesRegex(worker.WorkerError, 'source identity'):
            worker.prepare_workspace(job, {'token': 'q', 'fence': 1}, config)

    def test_new_files_must_be_declared(self):
        checkout = self.repository()
        config = self.config()
        config['repositories'] = {'https://github.com/example/game': checkout}
        job = {'id': 'dev1', 'role': 'studio-developer', 'repository_url': 'https://github.com/example/game'}
        lease = {'token': 't', 'fence': 1}
        run_root, workspace, _, assignment = worker.prepare_workspace(job, lease, config)
        (workspace / 'forgotten.txt').write_text('not reported')
        with self.assertRaisesRegex(worker.WorkerError, 'missing from declared'):
            worker.package_result(result(), job, lease, workspace, run_root, config, assignment)

    def test_readonly_report_and_checkpoint_persist_as_private_text(self):
        stdout = self.root / 'stdout'
        transport = result(report='Observed evidence with dates.', checkpoint='Next: verify missing footage.')
        stdout.write_text(json.dumps({'is_error': False, 'result': json.dumps(transport)}))
        parsed = worker.parse_cli_result(stdout, self.root / '.studio/results/j1.json', self.root)
        self.assertEqual((self.root / 'report.md').read_text(), transport['report'])
        self.assertEqual((self.root / 'checkpoint.md').read_text(), transport['checkpoint'])
        self.assertNotIn('report', parsed)
        self.assertNotIn('checkpoint', parsed)

    def test_error_envelope_cannot_be_overridden_by_result_file(self):
        stdout = self.root / 'stdout'
        stdout.write_text(json.dumps({'is_error': True, 'result': 'failed'}))
        target = self.root / 'result.json'
        target.write_text(json.dumps(result()))
        with self.assertRaises(worker.WorkerError):
            worker.parse_cli_result(stdout, target, self.root)

    def test_auto_checkout_requires_initial_opt_in(self):
        config = self.config()
        config['repositories'] = {}
        with mock.patch.object(worker, 'run_command') as command:
            with self.assertRaises(worker.WorkerError):
                worker.checkout_for_job('https://github.com/example/game', config)
            command.assert_not_called()

    def test_auto_checkout_rejects_untrusted_organization(self):
        config = {**self.config(), 'repositories': {}, 'auto_checkout_private_org': 'trusted',
                  'repositories_root': self.root / 'repos'}
        with mock.patch.object(worker, 'run_command') as command:
            with self.assertRaises(worker.WorkerError):
                worker.checkout_for_job('https://github.com/other/game', config)
            command.assert_not_called()

    def test_auto_checkout_rejects_public_or_mismatched_identity(self):
        config = {**self.config(), 'repositories': {}, 'auto_checkout_private_org': 'trusted',
                  'repositories_root': self.root / 'repos'}
        for identity in [{'nameWithOwner': 'trusted/game', 'isPrivate': False},
                         {'nameWithOwner': 'other/game', 'isPrivate': True}]:
            with mock.patch.object(worker, 'run_command', return_value=json.dumps(identity)) as command:
                with self.assertRaises(worker.WorkerError):
                    worker.checkout_for_job('https://github.com/trusted/game', config)
                self.assertEqual(command.call_count, 1)

    def test_auto_checkout_rejects_symlink_destination(self):
        repos = self.root / 'repos'
        repos.mkdir()
        elsewhere = self.root / 'elsewhere'
        elsewhere.mkdir()
        (repos / 'game').symlink_to(elsewhere, target_is_directory=True)
        config = {**self.config(), 'repositories': {}, 'auto_checkout_private_org': 'trusted',
                  'repositories_root': repos}
        with self.assertRaises(worker.WorkerError):
            worker.checkout_for_job('https://github.com/trusted/game', config)

    def test_auto_checkout_constructs_exact_private_clone_without_shell(self):
        config = {**self.config(), 'repositories': {}, 'auto_checkout_private_org': 'trusted',
                  'repositories_root': self.root / 'repos'}
        with mock.patch.object(worker, 'run_command', side_effect=[json.dumps({'nameWithOwner': 'trusted/game', 'isPrivate': True}), '']) as command, \
             mock.patch.object(worker, 'verify_checkout', return_value='a' * 40):
            target = worker.checkout_for_job('https://github.com/trusted/game', config)
        self.assertEqual(target, config['repositories_root'] / 'game')
        self.assertEqual(command.call_args.args[0], ['git', 'clone', '--branch', 'main', '--', 'https://github.com/trusted/game.git', str(target)])

    def integration_fixture(self):
        checkout, config, qa_job = self.candidate_fixture()
        qa_root, qa_workspace, _, qa_assignment = worker.prepare_workspace(qa_job, {'token': 'q', 'fence': 1}, config)
        qa_report = worker.package_result(result(), qa_job, {'fence': 1}, qa_workspace, qa_root, config, qa_assignment)
        qa_dep = {'id': 'qa1', 'role': 'studio-qa', 'fence': 1, 'status': 'succeeded',
                  'repository_url': qa_job['repository_url'], 'result': qa_report}
        job = {**qa_job, 'id': 'writer1', 'role': 'integration-writer',
               'dependency_results': [qa_job['dependency_results'][0], qa_dep]}
        config['capabilities'].append('integration-writer')
        config['allow_integration'] = True
        config['default_integration_checks'] = [[sys.executable, '-c', 'pass']]
        run_root, workspace, _, assignment = worker.prepare_workspace(job, {'token': 'w', 'fence': 1}, config)
        return config, job, run_root, workspace, assignment

    def test_integration_requires_dedicated_worker_opt_in(self):
        with self.assertRaisesRegex(worker.WorkerError, 'allow_integration'):
            worker.integrate_candidate(mock.Mock(), {}, {}, self.config(), self.root, self.root, {}, result(), time.monotonic())

    def test_integration_requires_exact_successful_qa(self):
        config, job, run_root, workspace, assignment = self.integration_fixture()
        assignment['dependencies'] = [d for d in assignment['dependencies'] if d['role'] != 'studio-qa']
        with self.assertRaisesRegex(worker.WorkerError, 'independent QA'):
            worker.integrate_candidate(mock.Mock(), job, {}, config, workspace, run_root, assignment, result(), time.monotonic())

    def test_integration_blocks_remote_head_movement(self):
        config, job, run_root, workspace, assignment = self.integration_fixture()
        with mock.patch.object(worker, 'remote_main', return_value='b' * 40):
            with self.assertRaisesRegex(worker.WorkerError, 'Remote main moved'):
                worker.integrate_candidate(mock.Mock(token=None), job, {}, config, workspace, run_root, assignment, result(), time.monotonic())
        self.assertEqual(self.git(workspace, 'rev-parse', 'HEAD'), assignment['base_sha'])

    def test_integration_blocks_candidate_change_after_qa(self):
        config, job, run_root, workspace, assignment = self.integration_fixture()
        (workspace / 'game.txt').write_text('unreviewed change')
        with self.assertRaisesRegex(worker.WorkerError, 'changed after QA'):
            worker.integrate_candidate(mock.Mock(token=None), job, {}, config, workspace, run_root, assignment, result(), time.monotonic())

    def test_integration_normal_push_and_exact_remote_commit_verification(self):
        config, job, run_root, workspace, assignment = self.integration_fixture()
        original = worker.run_command
        pushes = []
        def local_only(args, **kwargs):
            if 'push' in args:
                pushes.append(args)
                return ''
            return original(args, **kwargs)
        def remote(*args):
            return self.git(workspace, 'rev-parse', 'HEAD') if pushes else assignment['base_sha']
        with mock.patch.object(worker, 'run_command', side_effect=local_only), mock.patch.object(worker, 'remote_main', side_effect=remote):
            final = worker.integrate_candidate(mock.Mock(token=None), job, {}, config, workspace, run_root, assignment, result(), time.monotonic())
        self.assertEqual(len(pushes), 1)
        self.assertEqual(pushes[0][-3:], ['push', 'origin', final['source_commit'] + ':refs/heads/main'])
        self.assertFalse(any('force' in part for part in pushes[0]))
        self.assertNotEqual(final['source_commit'], assignment['base_sha'])
        self.assertEqual(json.loads((run_root / 'integration-state.json').read_text())['state'], 'pushed_verified')
        self.assertEqual(final['checks'][-1]['name'], 'integration_remote_head')

    def test_lease_loss_before_push_preserves_commit_and_prevents_push(self):
        config, job, run_root, workspace, assignment = self.integration_fixture()
        api = mock.Mock(token=None)
        api.post.side_effect = [{}, {}, worker.LeaseLost('expired')]
        original = worker.run_command
        pushes = []
        def local_only(args, **kwargs):
            if 'push' in args:
                pushes.append(args)
                raise AssertionError('No push may start after lease loss')
            return original(args, **kwargs)
        with mock.patch.object(worker, 'run_command', side_effect=local_only), mock.patch.object(worker, 'remote_main', return_value=assignment['base_sha']):
            with self.assertRaises(worker.LeaseLost):
                worker.integrate_candidate(api, job, {}, config, workspace, run_root, assignment, result(), time.monotonic())
        self.assertEqual(pushes, [])
        self.assertEqual(json.loads((run_root / 'integration-state.json').read_text())['state'], 'committed_not_pushed')

    def test_patch_round_trip_preserves_trailing_spaces_and_crlf(self):
        checkout = self.repository()
        config = self.config()
        config['repositories'] = {'https://github.com/example/game': checkout}
        job = {'id': 'dev1', 'role': 'studio-developer', 'repository_url': 'https://github.com/example/game'}
        lease = {'token': 't', 'fence': 1}
        run_root, workspace, _, assignment = worker.prepare_workspace(job, lease, config)
        expected = b'candidate with significant trailing spaces   \r\n'
        (workspace / 'game.txt').write_bytes(expected)
        report = worker.package_result(result(), job, lease, workspace, run_root, config, assignment)
        qa_job = {**job, 'id': 'qa1', 'role': 'studio-qa', 'candidate_dependency_id': 'dev1',
                  'dependency_results': [{'id': 'dev1', 'role': 'studio-developer', 'fence': 1,
                                          'status': 'succeeded', 'result': report}]}
        _, qa_workspace, _, _ = worker.prepare_workspace(qa_job, lease, config)
        self.assertEqual((qa_workspace / 'game.txt').read_bytes(), expected)

    def test_mutating_pre_commit_hook_blocks_push(self):
        config, job, run_root, workspace, assignment = self.integration_fixture()
        hooks_path = Path(self.git(workspace, 'rev-parse', '--git-path', 'hooks'))
        if not hooks_path.is_absolute():
            hooks_path = workspace / hooks_path
        hook = hooks_path / 'pre-commit'
        hook.write_text('#!/bin/sh\nprintf "hook-modified\n" > game.txt\ngit add game.txt\n')
        hook.chmod(0o755)
        with mock.patch.object(worker, 'remote_main', return_value=assignment['base_sha']):
            with self.assertRaisesRegex(worker.WorkerError, 'hooks changed the committed tree'):
                worker.integrate_candidate(mock.Mock(token=None), job, {}, config, workspace, run_root, assignment, result(), time.monotonic())
        self.assertEqual(json.loads((run_root / 'integration-state.json').read_text())['state'], 'committed_not_pushed')

    def test_prestaged_private_runtime_file_blocks_integration(self):
        config, job, run_root, workspace, assignment = self.integration_fixture()
        private_file = workspace / '.studio/unreviewed.txt'
        private_file.write_text('Must never enter a commit')
        self.git(workspace, 'add', '-f', '.studio/unreviewed.txt')
        with self.assertRaisesRegex(worker.WorkerError, 'Unexpected staged'):
            worker.integrate_candidate(mock.Mock(token=None), job, {}, config, workspace, run_root, assignment, result(), time.monotonic())
        self.assertEqual(self.git(workspace, 'rev-parse', 'HEAD'), assignment['base_sha'])

    def test_signing_key_and_keystore_artifacts_are_rejected(self):
        for name in ['release.jks', 'android.keystore', 'identity.pfx', 'id_rsa', 'keys/id_ed25519']:
            with self.subTest(name=name), self.assertRaises(worker.WorkerError):
                worker.safe_relative(name)

    def test_dependency_context_is_copied_inside_worktree_readonly(self):
        _, config, job = self.candidate_fixture()
        _, workspace, _, assignment = worker.prepare_workspace(job, {'token': 'q', 'fence': 1}, config)
        for dependency in assignment['dependencies']:
            for filename in dependency['local_artifacts']:
                path = Path(filename)
                self.assertTrue(worker.inside(path, workspace / '.studio/dependencies'))
                self.assertEqual(path.stat().st_mode & 0o222, 0)
                self.assertTrue(path.is_file())

    def test_game_name_and_project_intent_reach_prompt(self):
        checkout = self.repository()
        config = self.config()
        config['repositories'] = {'https://github.com/example/game': checkout}
        job = {'id': 'dev1', 'title': 'Build Cozy Petrol Stop', 'role': 'studio-developer',
               'repository_url': 'https://github.com/example/game', 'instructions': 'Implement the original loop.',
               'project_context': {'title': 'Cozy Petrol Stop', 'summary': 'Manage a cafe and friendly roadside services.'}}
        _, _, _, assignment = worker.prepare_workspace(job, {'token': 't', 'fence': 1}, config)
        prompt = worker.make_prompt(job, assignment)
        self.assertIn('Build Cozy Petrol Stop', prompt)
        self.assertIn('Manage a cafe and friendly roadside services.', prompt)
        self.assertIn('untrusted scoped input', prompt)

    def release_fixture(self):
        config = self.config()
        run_root = self.root / 'run'
        run_root.mkdir()
        manifest = {'project_id': 'project1', 'version': '1.0.0', 'source_commit': 'a' * 40,
                    'artifacts': {platform: {'url': 'https://github.com/private/build', 'sha256': 'b' * 64} for platform in ['android', 'ios']},
                    'evidence': [{'key': key, 'status': 'pass', 'report_url': 'https://github.com/private/report', 'summary': 'Exact-build evidence.'} for key in sorted(worker.GATES)],
                    'blocking_issues': 0, 'launch_summary': 'Original game with reviewed launch materials.'}
        worker.atomic_json(run_root / 'release-manifest.json', manifest)
        assignment = {'dependencies': [{'role': 'integration-writer', 'status': 'succeeded', 'result': {'outcome': 'pass', 'source_commit': 'a' * 40}}]}
        report = result(source_commit='a' * 40, checks=[{'name': key, 'status': 'pass'} for key in sorted(worker.GATES)])
        job = {'id': 'release1', 'role': 'release-preparer', 'project_id': 'project1'}
        return config, run_root, manifest, assignment, report, job

    def test_release_bridge_creates_review_receipt_without_approval(self):
        config, run_root, _, assignment, report, job = self.release_fixture()
        api = mock.Mock()
        api.post.side_effect = [{}, {'candidate': {'id': 'candidate1', 'manifest_hash': 'c' * 64, 'status': 'awaiting_review'}, 'published': False}]
        final = worker.prepare_release_review(api, job, {'job_id': job['id'], 'fence': 1, 'lease_token': 'lease'}, report, assignment, run_root, config)
        self.assertEqual(final['candidate_id'], 'candidate1')
        self.assertEqual(api.post.call_args.args[0], 'candidate')
        self.assertNotIn('release_manifest', final)
        receipt = json.loads((config['artifact_root'] / 'release1/1/release-review.json').read_text())
        self.assertFalse(receipt['published'])
        self.assertEqual(receipt['status'], 'awaiting_review')

    def test_release_bridge_rejects_wrong_source_or_missing_gate(self):
        config, run_root, manifest, assignment, report, job = self.release_fixture()
        manifest['source_commit'] = 'c' * 40
        worker.atomic_json(run_root / 'release-manifest.json', manifest)
        api = mock.Mock()
        with self.assertRaises(worker.WorkerError):
            worker.prepare_release_review(api, job, {'fence': 1}, report, assignment, run_root, config)
        api.post.assert_not_called()
        manifest['source_commit'] = 'a' * 40
        manifest['evidence'][0]['status'] = 'not_run'
        worker.atomic_json(run_root / 'release-manifest.json', manifest)
        with self.assertRaises(worker.WorkerError):
            worker.prepare_release_review(api, job, {'fence': 1}, report, assignment, run_root, config)
        api.post.assert_not_called()

    def test_missing_noninteractive_permission_profile_blocks_command(self):
        config = self.config()
        config['allowed_tools'] = {}
        with self.assertRaisesRegex(worker.WorkerError, 'permission profile'):
            worker.build_command(config, 'studio-developer')

    def test_default_mode_does_not_construct_api_or_execute(self):
        with mock.patch.object(worker, 'load_config', return_value={}), \
             mock.patch.object(worker, 'doctor', return_value={'status': 'model_plan_setup_required'}), \
             mock.patch.object(worker, 'API') as api, mock.patch('builtins.print'):
            self.assertEqual(worker.main(['--config', 'unused']), 0)
            api.assert_not_called()

    def test_execute_requires_initial_model_plan_verification(self):
        with mock.patch.object(worker, 'load_config', return_value={}), \
             mock.patch.object(worker, 'doctor', return_value={'status': 'model_plan_setup_required'}), \
             mock.patch.object(worker, 'API') as api, mock.patch('builtins.print'):
            self.assertEqual(worker.main(['--config', 'unused', '--execute', '--once']), 2)
            api.assert_not_called()


if __name__ == '__main__':
    unittest.main()
