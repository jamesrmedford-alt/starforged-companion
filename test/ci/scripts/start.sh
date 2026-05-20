#!/usr/bin/env bash
# start.sh — boot the Foundry CI stack and tail its logs.
#
# Credentials come from macOS Keychain (service: starforged-ci-foundry).
# On first run, you'll be prompted for username/password/admin-key and
# they'll be saved to Keychain. Subsequent runs are silent.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib/keychain.sh
. "${SCRIPT_DIR}/lib/keychain.sh"

cd "${CI_DIR}"

# Bootstrap any missing credentials. ensure_credential prompts on stderr
# and saves to Keychain when no stored value exists.
FOUNDRY_USERNAME="$(ensure_credential username  "foundryvtt.com username (email or login name)" 0)"
FOUNDRY_PASSWORD="$(ensure_credential password  "foundryvtt.com password"                       1)"
FOUNDRY_ADMIN_KEY="$(ensure_credential admin-key "Foundry admin key (dev value, e.g. atropos-dev)" 0)"

# Export so docker-compose's ${VAR:?} interpolation can pick them up.
export FOUNDRY_USERNAME FOUNDRY_PASSWORD FOUNDRY_ADMIN_KEY

docker compose up -d

cat <<EOF

  Foundry is starting up. First boot can take a minute while the
  installer downloads the Foundry zip.

  URL:                http://localhost:30000
  Admin key:          ${FOUNDRY_ADMIN_KEY}
  World to launch:    starforged-ci-world

  Tailing container logs (Ctrl+C to detach — server keeps running):

EOF

exec docker compose logs -f
