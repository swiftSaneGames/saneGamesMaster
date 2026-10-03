#!/usr/bin/env python3
"""Run the private game's declared checks; missing commands/tests fail, never pass."""
import json
from pathlib import Path
import subprocess
import sys


def run(root):
    try:
        config = json.loads((root / 'game-checks.json').read_text())
        checks = config['checks']
        if config.get('schema_version') != 1 or not isinstance(checks, list) or not 1 <= len(checks) <= 30:
            raise ValueError()
        for item in checks:
            command, timeout = item['command'], item.get('timeout_seconds', 600)
            if not isinstance(item.get('name'), str) or not item['name'].strip():
                raise ValueError()
            if not isinstance(command, list) or not command or len(command) > 40 or any(not isinstance(v, str) or not v or '\0' in v for v in command):
                raise ValueError()
            if isinstance(timeout, bool) or not isinstance(timeout, int) or not 1 <= timeout <= 1800:
                raise ValueError()
    except (OSError, ValueError, KeyError, TypeError):
        print('FAIL: game-checks.json must declare nonempty, reviewable game test commands.', file=sys.stderr)
        return 1
    failures = 0
    for item in checks:
        print('CHECK:', item['name'], flush=True)
        try:
            result = subprocess.run(item['command'], cwd=root, timeout=item.get('timeout_seconds', 600), check=False)
            failed = result.returncode != 0
        except (OSError, subprocess.TimeoutExpired):
            print('FAIL: test executable unavailable or time limit exceeded.', file=sys.stderr)
            failed = True
        failures += failed
        print(('FAIL' if failed else 'PASS') + ': ' + item['name'], flush=True)
    print(f'{len(checks)} declared checks; {failures} failed. This is not physical-device or owner-release approval.')
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(run(Path(__file__).resolve().parents[1]))
