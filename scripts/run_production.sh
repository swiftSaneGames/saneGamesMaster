#!/usr/bin/env bash
# Configure environment in the dedicated service account, outside the checkout.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
: "${APP_MODE:?Set APP_MODE=production in the service environment}"
if [ "$APP_MODE" != production ]; then
  echo 'Refusing: this launcher requires production mode.' >&2; exit 1
fi
: "${OWNER_GITHUB_ID:?Set the numeric owner ID}"
: "${GITHUB_CLIENT_ID:?Configure a dedicated OAuth app}"
: "${GITHUB_CLIENT_SECRET:?Configure the OAuth secret outside Git}"
: "${INTAKE_TOKEN:?Configure a dedicated agent intake credential}"
: "${STUDIO_DATA_DIR:?Set a private state directory outside the repository}"
export BASE_URL="${BASE_URL:-https://prod.sanegames.swiftsane.com}"
# Caddy is the only trusted local reverse proxy. Never bind this process publicly.
# Access logs are disabled so OAuth codes cannot enter ordinary request logs.
exec .venv/bin/python -m uvicorn dashboard.main:create_app --factory \
  --host 127.0.0.1 --port 8787 --workers 1 \
  --proxy-headers --forwarded-allow-ips=127.0.0.1 --no-access-log
