#!/usr/bin/env bash
# stop.sh — shut down the Foundry CI stack. Preserves data/.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${CI_DIR}"
docker compose down
