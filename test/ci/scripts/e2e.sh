#!/usr/bin/env bash
# e2e.sh — Phase 2 end-to-end test runner.
#
# Runs the full Quench suite against a fresh Foundry world inside Docker,
# driven by a Cypress container that walks the manual first-launch
# ritual (EULA → admin key → launch world → enable modules → run Quench
# → assert no failures).
#
# What "fresh world" means here:
#   - ./data/ (the Foundry userData bind-mount) is wiped except for
#     ./data/container_cache/ (the felddy-cached Foundry zip — preserved
#     so we don't re-download ~100 MB per run).
#   - install-deps.sh re-stages foundry-ironsworn + Quench + the module
#     from the working tree.
#   - setup-test-world.sh re-stages the world template.
#   - Foundry boots, Cypress drives it through the first-launch flow.
#
# Typical runtime: ~3–5 minutes per invocation. Designed for per-PR CI
# gating (Phase 3), not per-commit — at this cost a per-commit gate
# would burn ~15 minutes per developer push.
#
# Flags:
#   --keep        Don't tear down Foundry on exit. Useful for poking
#                 around manually after a failed run. Cypress artifacts
#                 (screenshots, videos) end up in cypress/artifacts/.
#   --no-rebuild  Skip the data/ wipe + install-deps + setup-world step.
#                 Use when iterating on the Cypress spec itself against
#                 a known-good world. Foundry must already be running.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib/keychain.sh
. "${SCRIPT_DIR}/lib/keychain.sh"

# ---- args -----------------------------------------------------------------

keep=0
rebuild=1
for arg in "$@"; do
  case "${arg}" in
    --keep)       keep=1 ;;
    --no-rebuild) rebuild=0 ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf '[e2e] unknown arg: %s\n' "${arg}" >&2
      exit 2
      ;;
  esac
done

cd "${CI_DIR}"

log()  { printf '\033[1;34m[e2e]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[e2e]\033[0m %s\n' "$*" >&2; }

# ---- credentials ----------------------------------------------------------

log "loading credentials from Keychain"
FOUNDRY_USERNAME="$(ensure_credential username  "foundryvtt.com username (email or login name)" 0)"
FOUNDRY_PASSWORD="$(ensure_credential password  "foundryvtt.com password"                       1)"
FOUNDRY_ADMIN_KEY="$(ensure_credential admin-key "Foundry admin key (dev value, e.g. atropos-dev)" 0)"
export FOUNDRY_USERNAME FOUNDRY_PASSWORD FOUNDRY_ADMIN_KEY

# ---- compose file selection ----------------------------------------------

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.e2e.yml)

# ---- fresh-world reset ----------------------------------------------------

if (( rebuild )); then
  log "tearing down any running stack"
  docker compose "${COMPOSE_FILES[@]}" down --remove-orphans >/dev/null 2>&1 || true

  log "wiping ./data (preserving container_cache/ to avoid Foundry-zip re-download)"
  if [[ -d ./data ]]; then
    if [[ -d ./data/container_cache ]]; then
      tmp_cache="$(mktemp -d)"
      mv ./data/container_cache "${tmp_cache}/"
      rm -rf ./data
      mkdir -p ./data
      mv "${tmp_cache}/container_cache" ./data/
      rmdir "${tmp_cache}"
    else
      rm -rf ./data
      mkdir -p ./data
    fi
  fi

  log "installing module + system + Quench into ./data"
  ./scripts/install-deps.sh

  log "installing test world template"
  ./scripts/setup-test-world.sh

  # The felddy/foundryvtt container runs as uid:gid 1000:1000 inside.
  # On Linux hosts (GitHub Actions runners), bind-mounted directories
  # preserve host ownership, and the runner user (uid 1001) is not
  # 1000. Without this chown, the container's entrypoint hits
  # "Volume write test failed" and aborts with "insufficient
  # permissions on /data" — see
  # https://github.com/felddy/foundryvtt-docker/discussions/1197.
  #
  # macOS Docker Desktop magic-mounts files with permissive perms so
  # this isn't needed there. Gate by CI=true so the chown only runs
  # in the environment that needs it.
  if [[ -n "${CI:-}" ]]; then
    log "CI mode: chowning ./data to 1000:1000 for felddy container"
    sudo chown -R 1000:1000 ./data 2>/dev/null \
      || warn "chown failed — container may hit /data permission errors"
  fi
fi

# ---- start Foundry --------------------------------------------------------

if (( rebuild )); then
  log "starting Foundry"
  docker compose "${COMPOSE_FILES[@]}" up -d foundry

  log "waiting for Foundry to accept connections"
  if ! "${SCRIPT_DIR}/wait-for-foundry.sh"; then
    warn "Foundry did not become ready — recent container logs:"
    docker compose "${COMPOSE_FILES[@]}" logs --tail 60 foundry || true
    exit 1
  fi
fi

# ---- run Cypress ----------------------------------------------------------

mkdir -p "${CI_DIR}/cypress/artifacts/screenshots" "${CI_DIR}/cypress/artifacts/videos"

log "pre-pulling cypress image (quietly — pull-progress noise was evicting cy.task diagnostics from the 50 KB sticky-comment tail)"
docker compose "${COMPOSE_FILES[@]}" --profile e2e pull --quiet cypress 2>&1 \
  | grep -vE "^(Pulling|Pulled |Waiting|Downloading|Verifying|Extracting|Pull complete|Status|Digest|[a-f0-9]{12} )" \
  || true

log "running Cypress (cypress/included:14)"
set +e
docker compose "${COMPOSE_FILES[@]}" --profile e2e run --rm --quiet-pull cypress
cy_exit=$?
set -e

# ---- teardown -------------------------------------------------------------

if (( keep )); then
  log "leaving Foundry running (--keep)"
  log "tear down later with: docker compose ${COMPOSE_FILES[*]} down"
else
  log "tearing down Foundry"
  docker compose "${COMPOSE_FILES[@]}" down >/dev/null 2>&1 || true
fi

if (( cy_exit == 0 )); then
  log "PASSED"
else
  warn "FAILED (cypress exit ${cy_exit})"
  warn "artifacts: cypress/artifacts/screenshots/ and cypress/artifacts/videos/"
fi

exit "${cy_exit}"
