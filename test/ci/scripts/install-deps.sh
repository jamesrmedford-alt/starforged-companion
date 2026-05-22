#!/usr/bin/env bash
# install-deps.sh — populate ./data/Data/{systems,modules,worlds} BEFORE
# Foundry boots, so that on first launch the test world list and module
# list are already populated.
#
# Run this from the host (not from inside a container) any time you want
# to refresh the installed system, Quench, or the module under test from
# your working tree. Safe to re-run — it overwrites in place.
#
# Phase 1 of the CI work. No Cypress / no GH Actions involvement.

set -euo pipefail

# ---- paths ----------------------------------------------------------------

# Resolve repo paths regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${CI_DIR}/../.." && pwd)"

DATA_DIR="${CI_DIR}/data"
USER_DATA_DIR="${DATA_DIR}/Data"
SYSTEMS_DIR="${USER_DATA_DIR}/systems"
MODULES_DIR="${USER_DATA_DIR}/modules"
WORLDS_DIR="${USER_DATA_DIR}/worlds"

# ---- pinned versions ------------------------------------------------------

IRONSWORN_VERSION="1.27.0"
IRONSWORN_REPO="ben/foundry-ironsworn"
QUENCH_REPO="Ethaks/FVTT-Quench"

# ---- helpers --------------------------------------------------------------

log()  { printf '\033[1;34m[install-deps]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[install-deps]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[install-deps]\033[0m %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

require_cmd docker  # used for SSL-clean curl (see CURL_IMAGE below)
require_cmd unzip
require_cmd python3 # used to parse GitHub release JSON without jq

# macOS hosts often have a broken curl SSL setup — Anaconda and other
# third-party tools set CURL_CA_BUNDLE / SSL_CERT_FILE to stale paths,
# and the user hits `curl: (60) SSL certificate problem`. Route through
# a containerised curl with a known-good cert chain instead. Docker is
# already required by the rest of the CI stack so this is free.
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:8.10.1}"

docker_curl() {
  docker run --rm "${CURL_IMAGE}" "$@"
}

# Discover a release-asset URL for a given GitHub repo + tag (or "latest").
# Picks the first .zip asset that doesn't look like a sourcemap. Echoes the
# browser_download_url to stdout.
github_release_zip_url() {
  local repo="$1" tag="$2" api_url
  if [[ "${tag}" == "latest" ]]; then
    api_url="https://api.github.com/repos/${repo}/releases/latest"
  else
    api_url="https://api.github.com/repos/${repo}/releases/tags/${tag}"
  fi

  # Bash 3.2 (Apple's default on macOS) treats `"${arr[@]}"` as "unbound
  # variable" under `set -u` when the array is empty — a well-known
  # pre-4.4 bug. The `${arr[@]+"${arr[@]}"}` form sidesteps it: only
  # expands when arr is set, no-ops otherwise.
  local auth_args=()
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    auth_args=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
  fi

  docker_curl -fsSL ${auth_args[@]+"${auth_args[@]}"} \
    -H "Accept: application/vnd.github+json" \
    "${api_url}" \
  | python3 -c '
import json, sys
data = json.load(sys.stdin)
assets = data.get("assets", [])
candidates = [a["browser_download_url"] for a in assets
              if a.get("name", "").endswith(".zip")
              and "map" not in a.get("name", "").lower()]
if not candidates:
    sys.stderr.write("no .zip asset found in release\n")
    sys.exit(1)
print(candidates[0])
'
}

# Download $1 to a tmp file, extract into $2 (which is wiped first), then
# remove the zip. If the zip contains a single top-level directory, its
# contents are flattened into $2 (so foundry-ironsworn.zip → systems/foundry-ironsworn/...).
download_and_extract() {
  local url="$1" dest="$2"
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "${tmpdir}"' RETURN

  log "  fetching ${url}"
  # Pipe the container's stdout to a host file. `set -o pipefail` makes
  # the script bail with curl's non-zero on any HTTP/network error.
  docker_curl -fsSL "${url}" > "${tmpdir}/pkg.zip"

  rm -rf "${dest}"
  mkdir -p "${dest}"

  unzip -q "${tmpdir}/pkg.zip" -d "${tmpdir}/extracted"

  # Flatten if the archive root is a single directory (common Foundry layout).
  shopt -s nullglob dotglob
  local entries=( "${tmpdir}/extracted"/* )
  shopt -u nullglob dotglob
  if [[ ${#entries[@]} -eq 1 && -d "${entries[0]}" ]]; then
    cp -R "${entries[0]}/." "${dest}/"
  else
    cp -R "${tmpdir}/extracted/." "${dest}/"
  fi
}

# ---- preflight ------------------------------------------------------------

log "repo root:    ${REPO_ROOT}"
log "ci dir:       ${CI_DIR}"
log "data dir:     ${DATA_DIR}"

mkdir -p "${SYSTEMS_DIR}" "${MODULES_DIR}" "${WORLDS_DIR}"

# ---- 1. foundry-ironsworn system -----------------------------------------

log "installing foundry-ironsworn v${IRONSWORN_VERSION}"
ironsworn_url="$(github_release_zip_url "${IRONSWORN_REPO}" "v${IRONSWORN_VERSION}")"
download_and_extract "${ironsworn_url}" "${SYSTEMS_DIR}/foundry-ironsworn"
[[ -f "${SYSTEMS_DIR}/foundry-ironsworn/system.json" ]] \
  || die "foundry-ironsworn system.json missing after extract — release layout changed?"

# ---- 2. Quench module -----------------------------------------------------

log "installing Quench (latest)"
quench_url="$(github_release_zip_url "${QUENCH_REPO}" "latest")"
download_and_extract "${quench_url}" "${MODULES_DIR}/quench"
[[ -f "${MODULES_DIR}/quench/module.json" ]] \
  || die "quench module.json missing after extract — release layout changed?"

# ---- 3. starforged-companion (this repo) ---------------------------------
#
# Build-step install: copy the working tree into the modules dir, mirroring
# what an end-user install would look like. NOT a bind mount — that way the
# test environment exercises the same loading path as production.
#
# If you change which files ship with the module, update INSTALLABLE below.

INSTALLABLE=(
  "module.json"
  "src"
  "lang"
  "styles"
  "packs"
)

log "installing starforged-companion (from working tree)"
SC_DEST="${MODULES_DIR}/starforged-companion"
rm -rf "${SC_DEST}"
mkdir -p "${SC_DEST}"
for entry in "${INSTALLABLE[@]}"; do
  src="${REPO_ROOT}/${entry}"
  if [[ ! -e "${src}" ]]; then
    warn "skipping missing path: ${entry}"
    continue
  fi
  cp -R "${src}" "${SC_DEST}/"
done
[[ -f "${SC_DEST}/module.json" ]] \
  || die "module.json missing in installed module — copy step failed"

# ---- 4. world template ----------------------------------------------------

# setup-test-world.sh handles this — keep it as a separate step so users
# can re-run install-deps.sh without recreating the world.

log "done. Next: ./scripts/setup-test-world.sh, then ./scripts/start.sh"
