#!/usr/bin/env bash
# reset.sh — DESTROY the test world and all Foundry data.
#
# This wipes:
#   - the running container and its anonymous volumes
#   - test/ci/data/ (Foundry zip, systems, modules, worlds, settings, logs)
#
# After running this you must re-run:
#   1. scripts/install-deps.sh
#   2. scripts/setup-test-world.sh
#   3. scripts/start.sh
#
# This will NOT touch your repo, your .env, or anything outside test/ci/.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${CI_DIR}"

if [[ "${1:-}" != "--yes" ]]; then
  cat <<'EOF'

  WARNING: this will destroy the test world and ALL Foundry CI data.
  Your repo, .env, and everything outside test/ci/ will be untouched.

  Re-run with --yes to proceed:

      ./scripts/reset.sh --yes

EOF
  exit 1
fi

docker compose down -v || true

if [[ -d ./data ]]; then
  printf '[reset] removing %s\n' "$(pwd)/data"
  rm -rf ./data
fi

printf '[reset] done. Re-run scripts/install-deps.sh + scripts/setup-test-world.sh.\n'
