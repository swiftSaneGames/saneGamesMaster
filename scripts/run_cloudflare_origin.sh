#!/usr/bin/env bash
# Run on the dedicated Mac, with private production environment already loaded.
set -euo pipefail
: "${GATEWAY_TOKEN:?Set the same dedicated gateway secret in the Mac environment and Worker}"
exec bash "$(dirname "$0")/run_production.sh"
