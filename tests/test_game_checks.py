import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('check_game', Path(__file__).resolve().parents[1] / 'scripts/check_game.py')
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


class GameChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def config(self, items):
        (self.root / 'game-checks.json').write_text(json.dumps({'schema_version': 1, 'checks': items}))

    def test_absent_or_empty_checks_fail(self):
        self.assertEqual(checks.run(self.root), 1)
        self.config([])
        self.assertEqual(checks.run(self.root), 1)

    def test_validate_every_command_before_execution(self):
        self.config([{'name': 'real', 'command': ['godot']}, {'name': 'bad', 'command': 'shell code'}])
        with patch.object(checks.subprocess, 'run') as execute:
            self.assertEqual(checks.run(self.root), 1)
            execute.assert_not_called()

    def test_fails_missing_runtime_timeout_or_failure(self):
        self.config([{'name': 'test', 'command': ['godot'], 'timeout_seconds': 5}])
        for error in [FileNotFoundError(), subprocess.TimeoutExpired(['godot'], 5)]:
            with patch.object(checks.subprocess, 'run', side_effect=error):
                self.assertEqual(checks.run(self.root), 1)
        with patch.object(checks.subprocess, 'run', return_value=subprocess.CompletedProcess(['godot'], 1)):
            self.assertEqual(checks.run(self.root), 1)

    def test_argv_and_directory_are_preserved(self):
        self.config([{'name': 'real', 'command': ['godot', 'space in argument'], 'timeout_seconds': 9}])
        with patch.object(checks.subprocess, 'run', return_value=subprocess.CompletedProcess(['godot'], 0)) as execute:
            self.assertEqual(checks.run(self.root), 0)
            execute.assert_called_once_with(['godot', 'space in argument'], cwd=self.root, timeout=9, check=False)


if __name__ == '__main__':
    unittest.main()
