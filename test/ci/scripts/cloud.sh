#!/usr/bin/env bash
#
# Run the Foundry test stack inside a sandboxed Linux session — a Claude Code
# cloud session, or any Linux box that is like one — and drive it from the
# session's own browser.
#
# What is different there, and what this script does about each (the CI path,
# e2e.sh, is unchanged — see test/ci/README.md → "Running in a cloud session"
# and rules/ci-e2e.md → "Cloud sessions"):
#
#   - Outbound HTTPS leaves through a proxy on the session's loopback
#     (HTTPS_PROXY), re-signed by its own CA. A container on Docker's bridge
#     network cannot reach that proxy, so Foundry runs on the HOST network,
#     with the proxy address and the CA bundle handed to it.
#   - The felddy image starts Foundry with a clean environment (HOME, NODE_*,
#     TZ only), which drops the proxy address: Foundry's own requests — the
#     licence signature — then never leave. A copy of the image's launcher
#     with the proxy variables added to that pass-list is mounted over it.
#   - Docker Hub rate-limits anonymous pulls from shared addresses, so the
#     curl, Cypress and Playwright images are not used: downloads use the
#     host's curl, and the suites run on the session's own Playwright and
#     Chromium (playwright/first-launch.mjs does what the Cypress spec's
#     first-launch ritual does; playwright/quench.mjs runs Quench).
#   - The GitHub API is closed to other repositories, so the system and
#     Quench are fetched by their release download addresses, not looked up.
#   - The machine can restart between commands: Docker stops and the proxy's
#     port changes. `up` is safe to run again — the Foundry download and the
#     signed licence are kept in ./data.
#
# Network: besides package registries, the session must be allowed
#   ghcr.io, pkg-containers.githubusercontent.com   (the Foundry image)
#   foundryvtt.com, r2.foundryvtt.com               (sign-in, the download)
#   api.foundryvtt.com                              (the licence signature)
#   github.com and its release-asset hosts          (the system, Quench)
#   api.anthropic.com                               (--record and a live
#                                                   `explore` only)
#
# Credentials come from the environment and are never printed:
#   FOUNDRY_USERNAME, FOUNDRY_PASSWORD   your foundryvtt.com account
#   FOUNDRY_ADMIN_KEY                    optional; one is generated per data dir
#   ANTHROPIC_API_KEY                    `playthroughs --record` and a live
#                                        `explore` only. In a Claude Code cloud
#                                        session, store it on the environment
#                                        as PLAYTEST_ANTHROPIC_API_KEY instead:
#                                        a variable named ANTHROPIC_API_KEY did
#                                        not reach the session's shell
#                                        (2026-11-22), and this script reads
#                                        either name.
#
# Usage:
#   ./scripts/cloud.sh up [--fresh]            start Foundry, launch the world,
#                                              enable the modules; --fresh
#                                              resets the world to its template
#   ./scripts/cloud.sh playthroughs [--record] the scripted playthroughs
#                                              (PLAYTHROUGH=<name> runs one)
#   ./scripts/cloud.sh explore [--rehearse | --replay <run folder>]
#                                              an AI player at the table, an
#                                              observer scoring its goal
#                                              (issue #302 slice D). Live by
#                                              default: real models, spend
#                                              capped by playwright/
#                                              explore.config.json. --rehearse:
#                                              the same path with the model API
#                                              stood in for — no key, no spend
#                                              (EXPLORE_REHEARSAL_FORGET=1: a
#                                              narrator that keeps nothing).
#                                              --replay: an earlier run's
#                                              actions, dice and replies again,
#                                              no key. EXPLORE_CHARTER picks
#                                              the charter (memory).
#   ./scripts/cloud.sh multiplayer             the second-client suite
#   ./scripts/cloud.sh quench                  the Quench batches
#   ./scripts/cloud.sh status                  what is running
#   ./scripts/cloud.sh down                    remove the container
#
# The module is copied from the working tree on every `up`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${CI_DIR}/../.." && pwd)"
DATA_DIR="${CI_DIR}/data"
USER_DATA_DIR="${DATA_DIR}/Data"
STATE_DIR="${DATA_DIR}/cloud"            # under data/: git-ignored with it
PW_DIR="${CI_DIR}/playwright"

IMAGE="ghcr.io/felddy/foundryvtt:13"
CONTAINER="starforged-ci-foundry"
HOSTNAME_PIN="starforged-ci-host"        # the licence is fingerprinted to it
WORLD_ID="starforged-ci-world"
BASE_URL="${BASE_URL:-http://localhost:30000}"
QUENCH_MANIFEST="https://github.com/Ethaks/FVTT-Quench/releases/latest/download/module.json"

log()  { printf '\033[1;34m[cloud]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[cloud]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[cloud]\033[0m %s\n' "$*" >&2; exit 1; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"; }

# The one pin of the system's version is install-deps.sh's.
ironsworn_version() {
  sed -n 's/^IRONSWORN_VERSION="\([^"]*\)".*/\1/p' "${SCRIPT_DIR}/install-deps.sh" | head -1
}

# Foundry's log without what should not be repeated: the account name, a
# licence key, a presigned address's signature.
foundry_logs() {
  docker logs "$@" "${CONTAINER}" 2>&1 \
    | sed -E 's/\x1b\[[0-9;]*m//g' \
    | sed -E "s/${FOUNDRY_USERNAME:-<no-username>}/<username>/Ig" \
    | sed -E 's/[A-Z0-9]{4}(-[A-Z0-9]{4}){5}/<licence>/g; s/(verify|sig|token|Signature|Expires)=[^& ]+/\1=***/g'
}

as_owner() {  # the image runs as uid 1000 and must own the bind mount
  if [[ "$(id -u)" == 0 ]]; then chown -R 1000:1000 "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo chown -R 1000:1000 "$@" || warn "chown failed — the container may not be able to write ./data"
  fi
}

ensure_docker() {
  require_cmd docker
  docker info >/dev/null 2>&1 && return 0
  [[ "$(id -u)" == 0 ]] && command -v dockerd >/dev/null 2>&1 \
    || die "the Docker daemon is not running, and this user cannot start it"
  mkdir -p "${STATE_DIR}"
  # A machine that restarted keeps /var/run: the pid files left there name
  # processes that are gone, and once another process has taken one of those
  # numbers the daemon waits for "its" containerd and gives up.
  if ! pgrep -x dockerd >/dev/null 2>&1 && ! pgrep -x containerd >/dev/null 2>&1; then
    rm -f /var/run/docker.pid /var/run/docker/containerd/containerd.pid
  fi
  log "starting the Docker daemon"
  (nohup dockerd >>"${STATE_DIR}/dockerd.log" 2>&1 &)
  local i
  for i in $(seq 1 120); do
    docker info >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  die "the Docker daemon did not come up — see ${STATE_DIR}/dockerd.log"
}

fetch_zip() {  # url dest
  local url="$1" dest="$2" tmp
  tmp="$(mktemp -d)"
  log "  fetching ${url}"
  curl -fsSL "${url}" -o "${tmp}/pkg.zip" || { rm -rf "${tmp}"; die "download failed: ${url}"; }
  rm -rf "${dest}"; mkdir -p "${dest}"
  unzip -q "${tmp}/pkg.zip" -d "${tmp}/x"
  shopt -s nullglob dotglob; local entries=( "${tmp}/x"/* ); shopt -u nullglob dotglob
  if [[ ${#entries[@]} -eq 1 && -d "${entries[0]}" ]]; then cp -R "${entries[0]}/." "${dest}/"; else cp -R "${tmp}/x/." "${dest}/"; fi
  rm -rf "${tmp}"
}

json_field() {  # file key
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2]) or "")' "$1" "$2"
}

stage() {  # fresh(0|1)
  local fresh="$1" version system_dir quench_dir module_dir world_dir
  require_cmd curl; require_cmd unzip; require_cmd python3
  version="$(ironsworn_version)"; [[ -n "${version}" ]] || die "could not read IRONSWORN_VERSION from install-deps.sh"
  system_dir="${USER_DATA_DIR}/systems/foundry-ironsworn"
  quench_dir="${USER_DATA_DIR}/modules/quench"
  module_dir="${USER_DATA_DIR}/modules/starforged-companion"
  world_dir="${USER_DATA_DIR}/worlds/${WORLD_ID}"
  mkdir -p "${USER_DATA_DIR}/systems" "${USER_DATA_DIR}/modules" "${USER_DATA_DIR}/worlds" "${STATE_DIR}"

  if [[ ! -f "${system_dir}/system.json" || "$(json_field "${system_dir}/system.json" version)" != "${version}" ]]; then
    log "installing foundry-ironsworn v${version}"
    fetch_zip "https://github.com/ben/foundry-ironsworn/releases/download/${version}/ironsworn.zip" "${system_dir}"
    [[ -f "${system_dir}/system.json" ]] || die "foundry-ironsworn system.json missing after extract"
  fi
  if [[ ! -f "${quench_dir}/module.json" ]]; then
    log "installing Quench (latest)"
    local manifest; manifest="$(mktemp)"
    curl -fsSL "${QUENCH_MANIFEST}" -o "${manifest}" || die "could not read Quench's manifest"
    fetch_zip "$(json_field "${manifest}" download)" "${quench_dir}"
    rm -f "${manifest}"
    [[ -f "${quench_dir}/module.json" ]] || die "quench module.json missing after extract"
  fi

  log "installing starforged-companion (from the working tree)"
  rm -rf "${module_dir}"; mkdir -p "${module_dir}"
  local entry
  for entry in module.json src lang styles packs; do
    [[ -e "${REPO_ROOT}/${entry}" ]] && cp -R "${REPO_ROOT}/${entry}" "${module_dir}/"
  done
  [[ -f "${module_dir}/module.json" ]] || die "module.json missing in the installed module"

  if (( fresh )) || [[ ! -f "${world_dir}/world.json" ]]; then
    log "installing the test world from its template"
    rm -rf "${world_dir}"; mkdir -p "${world_dir}"
    cp -R "${CI_DIR}/world-template/." "${world_dir}/"
  fi
  as_owner "${DATA_DIR}"
}

# The image's launcher with the proxy address let through to Foundry.
launcher_overlay() {
  local out="${STATE_DIR}/launcher.sh" original="${STATE_DIR}/launcher.orig.sh"
  local passlist="ENV_VAR_PASSLIST_REGEX='^HOME\$ ^NODE_.+\$ ^TZ\$'"
  docker run --rm --entrypoint cat "${IMAGE}" /home/node/launcher.sh >"${original}"
  grep -qF "${passlist}" "${original}" \
    || die "the image's launcher no longer has the environment pass-list this script extends — read /home/node/launcher.sh in ${IMAGE}"
  python3 - "${original}" "${out}" "${passlist}" <<'PY'
import sys
src, out, old = sys.argv[1:4]
text = open(src).read()
new = old[:-1] + " ^HTTPS_PROXY$ ^https_proxy$ ^NO_PROXY$ ^no_proxy$'"
open(out, "w").write(text.replace(old, new))
PY
  chmod 755 "${out}"
  printf '%s' "${out}"
}

admin_key() {
  if [[ -n "${FOUNDRY_ADMIN_KEY:-}" ]]; then printf '%s' "${FOUNDRY_ADMIN_KEY}"; return; fi
  local file="${STATE_DIR}/admin.key"
  if [[ ! -s "${file}" ]]; then
    mkdir -p "${STATE_DIR}"
    ( umask 077; head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' >"${file}" )
  fi
  cat "${file}"
}

start_foundry() {
  [[ -n "${FOUNDRY_USERNAME:-}" && -n "${FOUNDRY_PASSWORD:-}" ]] \
    || die "set FOUNDRY_USERNAME and FOUNDRY_PASSWORD (your foundryvtt.com account) in the session's environment"
  export FOUNDRY_USERNAME FOUNDRY_PASSWORD
  FOUNDRY_ADMIN_KEY="$(admin_key)"; export FOUNDRY_ADMIN_KEY

  docker image inspect "${IMAGE}" >/dev/null 2>&1 || { log "pulling ${IMAGE}"; docker pull -q "${IMAGE}" >/dev/null; }

  local args=( -d --name "${CONTAINER}" --init --network host --hostname "${HOSTNAME_PIN}"
    -v "${DATA_DIR}:/data"
    -e FOUNDRY_USERNAME -e FOUNDRY_PASSWORD -e FOUNDRY_ADMIN_KEY
    -e FOUNDRY_TELEMETRY=false -e CONTAINER_CACHE=/data/container_cache -e "FOUNDRY_HOSTNAME=${HOSTNAME_PIN}" )
  local proxy="${HTTPS_PROXY:-${https_proxy:-}}"
  if [[ -n "${proxy}" ]]; then
    local ca="${SSL_CERT_FILE:-${CURL_CA_BUNDLE:-}}"
    [[ -f "${ca}" ]] || die "HTTPS_PROXY is set but no CA bundle was found (SSL_CERT_FILE / CURL_CA_BUNDLE)"
    log "Foundry will reach the network through the session proxy"
    args+=( -v "${ca}:/ccr/ca-bundle.crt:ro" -v "$(launcher_overlay):/home/node/launcher.sh:ro"
      -e "HTTPS_PROXY=${proxy}" -e "https_proxy=${proxy}" -e NO_PROXY=localhost,127.0.0.1 -e no_proxy=localhost,127.0.0.1
      -e NODE_EXTRA_CA_CERTS=/ccr/ca-bundle.crt -e SSL_CERT_FILE=/ccr/ca-bundle.crt -e CURL_CA_BUNDLE=/ccr/ca-bundle.crt
      -e NODE_USE_ENV_PROXY=1 )
  fi

  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  log "starting Foundry"
  docker run "${args[@]}" "${IMAGE}" >/dev/null

  local i
  for i in $(seq 1 300); do
    if docker logs "${CONTAINER}" 2>&1 | grep -q "Server started and listening"; then log "Foundry is listening at ${BASE_URL}"; return 0; fi
    if [[ "$(docker inspect -f '{{.State.Running}}' "${CONTAINER}" 2>/dev/null)" != "true" ]]; then break; fi
    sleep 1
  done
  warn "Foundry did not start — its log:"
  foundry_logs --tail 40 | grep -E "Entrypoint|Authenticate|License|ReleaseURL|\[(warn|error)\]" | grep -v "Logging in as\|logged in as\|license key" >&2 || true
  exit 1
}

# The session's own Playwright, where the suites' `import "playwright"` finds it.
ensure_playwright() {
  require_cmd node
  [[ -e "${PW_DIR}/node_modules/playwright/package.json" ]] && return 0
  local global
  global="$(cd / && node -e 'process.stdout.write(require("path").dirname(require.resolve("playwright/package.json")))' 2>/dev/null || true)"
  if [[ -n "${global}" ]]; then
    mkdir -p "${PW_DIR}/node_modules"
    ln -sfn "${global}" "${PW_DIR}/node_modules/playwright"
    return 0
  fi
  warn "no Playwright in this session — installing the pinned one (it needs its own browser: npx playwright install chromium)"
  ( cd "${PW_DIR}" && npm ci --no-audit --no-fund --loglevel=error )
}

run_suite() {  # script.mjs [env assignments are the caller's]
  ensure_playwright
  docker inspect -f '{{.State.Running}}' "${CONTAINER}" 2>/dev/null | grep -q true \
    || die "Foundry is not running — ./scripts/cloud.sh up"
  mkdir -p "${PW_DIR}/artifacts"
  ( cd "${PW_DIR}" && BASE_URL="${BASE_URL}" node "$1" )
}

cmd_up() {
  local fresh=0
  [[ "${1:-}" == "--fresh" ]] && fresh=1
  ensure_docker
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true   # the world's files are replaced under it
  stage "${fresh}"
  start_foundry
  ensure_playwright
  log "first launch: licence, admin key, world, modules"
  ( cd "${PW_DIR}" && BASE_URL="${BASE_URL}" FOUNDRY_ADMIN_KEY="$(admin_key)" node first-launch.mjs ) \
    || { warn "first launch failed — recent Foundry log:"; foundry_logs --tail 30 | grep -E "\[(warn|error)\]|Error" >&2 || true; exit 1; }
  log "ready: ${BASE_URL} (world ${WORLD_ID})"
}

# The Claude key for a run that calls a model, under either name (see the header).
claude_key() { printf '%s' "${ANTHROPIC_API_KEY:-${PLAYTEST_ANTHROPIC_API_KEY:-}}"; }

cmd_playthroughs() {
  local mode=replay
  [[ "${1:-}" == "--record" ]] && mode=record
  if [[ "${mode}" == record && -z "$(claude_key)" ]]; then
    die "--record answers Claude for real: set ANTHROPIC_API_KEY (or PLAYTEST_ANTHROPIC_API_KEY) first"
  fi
  log "running the playthroughs (${mode} Claude replies)"
  if [[ "${mode}" == record ]]; then export ANTHROPIC_API_KEY; ANTHROPIC_API_KEY="$(claude_key)"; fi
  PLAYTHROUGH_MODE="${mode}" PLAYTHROUGH_COMMIT="$(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || true)" \
    run_suite playthrough.mjs
}

cmd_explore() {
  local mode=live replay=""
  case "${1:-}" in
    "")       ;;
    --rehearse) mode=rehearsal ;;
    --replay) mode=replay
              [[ -n "${2:-}" && -f "${2}/replay.json" ]] || die "--replay needs the folder of the run to replay (playwright/artifacts/explore/<run>, with its replay.json)"
              replay="$(cd "${2}" && pwd)" ;;
    *)        die "explore takes --rehearse, --replay <run folder>, or nothing (a live run)" ;;
  esac
  if [[ "${mode}" == live ]]; then
    [[ -n "$(claude_key)" ]] || die "a live run calls Claude for real: set ANTHROPIC_API_KEY (or PLAYTEST_ANTHROPIC_API_KEY) first — or rehearse it (--rehearse)"
    export ANTHROPIC_API_KEY; ANTHROPIC_API_KEY="$(claude_key)"
    log "running the ${EXPLORE_CHARTER:-memory} charter LIVE — real models, spend capped by playwright/explore.config.json"
  else
    unset ANTHROPIC_API_KEY
    log "running the ${EXPLORE_CHARTER:-memory} charter (${mode}: no key, no model call)"
  fi
  EXPLORE_MODE="${mode}" EXPLORE_REPLAY="${replay}" EXPLORE_COMMIT="$(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || true)" \
    run_suite explore.mjs
}

cmd_status() {
  docker info >/dev/null 2>&1 || { log "the Docker daemon is not running"; return 0; }
  log "container: $(docker ps -a --filter "name=^${CONTAINER}\$" --format '{{.Status}}' | head -1 || true)"
  log "Foundry:   $(curl -s -o /dev/null -m 5 -w '%{http_code}' "${BASE_URL}/" 2>/dev/null || echo unreachable) at ${BASE_URL}"
}

case "${1:-}" in
  up)           shift; cmd_up "$@" ;;
  playthroughs) shift; cmd_playthroughs "$@" ;;
  explore)      shift; cmd_explore "$@" ;;
  multiplayer)  log "running the multiplayer suite"; run_suite multiplayer.mjs ;;
  quench)       log "running the Quench batches"; run_suite quench.mjs ;;
  status)       cmd_status ;;
  down)         docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true; log "container removed (./data is kept)" ;;
  -h|--help|"") sed -n '2,76p' "$0" | sed 's/^# \{0,1\}//' ;;
  *)            die "unknown command: $1 (try --help)" ;;
esac
