#!/usr/bin/env bash
# start.sh — boot the Foundry CI stack and tail its logs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${CI_DIR}"

if [[ ! -f .env ]]; then
  printf '\033[1;31m[start]\033[0m .env missing — copy .env.example to .env first.\n' >&2
  exit 1
fi

# Source the admin key so we can echo it back to the user without making
# them go look it up.
# shellcheck disable=SC1091
set -a; . ./.env; set +a

docker compose up -d

cat <<EOF

  Foundry is starting up. First boot can take a minute while the
  installer downloads the Foundry zip.

  URL:                http://localhost:30000
  Admin key:          ${FOUNDRY_ADMIN_KEY:-(unset — check .env)}
  World to launch:    starforged-ci-world

  Tailing container logs (Ctrl+C to detach — server keeps running):

EOF

exec docker compose logs -f
