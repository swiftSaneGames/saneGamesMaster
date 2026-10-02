#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install -r requirements.txt
export APP_MODE=demo
export BASE_URL=http://127.0.0.1:8787
export STUDIO_DATA_DIR="$PWD/var/demo"
printf '\nLocal demo: http://127.0.0.1:8787\nDemo actions never publish games. Press Ctrl+C to stop.\n\n'
exec .venv/bin/python -m uvicorn dashboard.main:create_app --factory --host 127.0.0.1 --port 8787 --no-access-log
