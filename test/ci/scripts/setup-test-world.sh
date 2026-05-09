#!/usr/bin/env bash
# setup-test-world.sh — install the test world template into the Foundry
# data directory.
#
# We use option (b) from the phase-1 plan: a pre-baked world template
# committed at test/ci/world-template/. Option (a) (programmatic creation
# via the Foundry setup API) was rejected because:
#   - the setup API requires an authenticated admin session
#   - module enablement and GM password require writing into a world DB
#     that doesn't exist until the world is launched at least once
#   - a static template is reproducible and trivial to reset
#
# After this script runs, the user opens http://localhost:30000, accepts
# the EULA, enters the admin key, launches the world, then enables the
# Starforged Companion + Quench modules from Settings → Manage Modules.
# The README walks through it.
#
# Safe to re-run — refuses to overwrite an existing world unless --force
# is passed, so a partially-configured world is preserved across re-runs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

TEMPLATE_DIR="${CI_DIR}/world-template"
WORLDS_DIR="${CI_DIR}/data/Data/worlds"
WORLD_ID="starforged-ci-world"
WORLD_DEST="${WORLDS_DIR}/${WORLD_ID}"

log()  { printf '\033[1;34m[setup-world]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[setup-world]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[setup-world]\033[0m %s\n' "$*" >&2; exit 1; }

force=0
if [[ "${1:-}" == "--force" ]]; then
  force=1
fi

[[ -d "${TEMPLATE_DIR}" ]] || die "world template missing: ${TEMPLATE_DIR}"
[[ -f "${TEMPLATE_DIR}/world.json" ]] || die "world.json missing in template"

mkdir -p "${WORLDS_DIR}"

if [[ -d "${WORLD_DEST}" ]]; then
  if (( force )); then
    warn "world already exists at ${WORLD_DEST} — --force passed, removing"
    rm -rf "${WORLD_DEST}"
  else
    log "world already exists at ${WORLD_DEST} — leaving it alone"
    log "(pass --force to wipe and reinstall the template)"
    exit 0
  fi
fi

log "installing world template into ${WORLD_DEST}"
mkdir -p "${WORLD_DEST}"
cp -R "${TEMPLATE_DIR}/." "${WORLD_DEST}/"

log "done."
log ""
log "Next steps (one-time, in browser):"
log "  1. ./scripts/start.sh"
log "  2. open http://localhost:30000"
log "  3. accept EULA, enter admin key from .env"
log "  4. launch '${WORLD_ID}'"
log "  5. Settings → Manage Modules → enable Starforged Companion + Quench"
log "  6. (optional) set a GM password under User Management"
