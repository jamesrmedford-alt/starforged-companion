# keychain.sh — credential resolver for the Foundry CI stack.
#
# Sourced, not executed. Provides:
#   kc_get <account>            → echoes value, exits 1 if not found
#   kc_set <account> <value>    → stores/overwrites value
#   kc_delete <account>         → removes the entry (no-op if absent)
#   kc_has <account>            → 0 if present, 1 if not
#   ensure_credential <account> <prompt> <hidden:0|1>
#                               → echoes value; prompts and stores if missing
#
# Two resolution paths:
#   - macOS (developer machine): stores under the macOS Keychain at
#     service `starforged-ci-foundry`; prompts and saves on first run.
#   - Non-Darwin / CI: reads from FOUNDRY_USERNAME / FOUNDRY_PASSWORD /
#     FOUNDRY_ADMIN_KEY environment variables. GitHub Actions surfaces
#     these from repo secrets; see .github/workflows/e2e.yml. kc_set /
#     kc_delete are no-ops in this mode — secrets are managed by the
#     CI platform, not by this script.
#
# The same e2e.sh orchestrator works in both environments because
# ensure_credential branches transparently.

KEYCHAIN_SERVICE="${KEYCHAIN_SERVICE:-starforged-ci-foundry}"

# Map an account name to its environment-variable equivalent. Kept as an
# explicit case (not ${var^^}) because Apple's bash 3.2 lacks uppercase
# parameter expansion.
_kc_env_var_for() {
  case "$1" in
    username)  printf 'FOUNDRY_USERNAME'  ;;
    password)  printf 'FOUNDRY_PASSWORD'  ;;
    admin-key) printf 'FOUNDRY_ADMIN_KEY' ;;
    *)         printf 'FOUNDRY_UNKNOWN'   ;;
  esac
}

# True when the script should read from env vars instead of macOS Keychain.
# CI runners (GitHub Actions sets CI=true), non-Darwin hosts, or any host
# where the `security` binary isn't present.
_kc_env_mode() {
  [[ -n "${CI:-}" ]] && return 0
  [[ "$(uname -s)" != "Darwin" ]] && return 0
  command -v security >/dev/null 2>&1 || return 0
  return 1
}

kc_get() {
  local account="$1"
  if _kc_env_mode; then
    local envvar value
    envvar="$(_kc_env_var_for "${account}")"
    # printenv returns nonzero when the var is unset; `|| true` keeps
    # set -e happy. Safer than indirect expansion + eval for values
    # that might contain whitespace or shell metachars.
    value="$(printenv "${envvar}" 2>/dev/null || true)"
    [[ -n "${value}" ]] || return 1
    printf '%s' "${value}"
    return 0
  fi
  security find-generic-password \
    -a "${account}" -s "${KEYCHAIN_SERVICE}" -w 2>/dev/null
}

kc_set() {
  local account="$1" value="$2"
  if _kc_env_mode; then
    # Read-only in env mode — secrets are managed by the CI platform.
    return 0
  fi
  # -U: update if it already exists (default is to fail on duplicate).
  security add-generic-password \
    -a "${account}" -s "${KEYCHAIN_SERVICE}" -w "${value}" -U
}

kc_delete() {
  local account="$1"
  if _kc_env_mode; then
    return 0
  fi
  security delete-generic-password \
    -a "${account}" -s "${KEYCHAIN_SERVICE}" >/dev/null 2>&1 || true
}

kc_has() {
  local account="$1"
  kc_get "${account}" >/dev/null 2>&1
}

# ensure_credential: read from Keychain (or env), prompt+store if missing
# and a TTY is available, echo value. Used by start.sh / e2e.sh to
# bootstrap on first run.
ensure_credential() {
  local account="$1" prompt="$2" hidden="${3:-0}"
  local value
  if value="$(kc_get "${account}")" && [[ -n "${value}" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  # In env mode (CI), a missing var is a hard error — there's no TTY to
  # prompt against and no Keychain to write to. Fail loudly with the
  # name of the missing secret so the operator can fix the workflow.
  if _kc_env_mode; then
    local envvar
    envvar="$(_kc_env_var_for "${account}")"
    printf '[keychain] missing required credential: %s\n' "${envvar}" >&2
    printf '[keychain] set it as a GitHub repo secret (Settings → Secrets and variables → Actions)\n' >&2
    return 1
  fi

  prompt_credential "${account}" "${prompt}" "${hidden}"
}

# prompt_credential: ALWAYS prompts and stores, even if a value already exists.
# Echoes the new value. Used by `credentials.sh set` so users can fix typos.
# Macs only — env mode would have no TTY.
prompt_credential() {
  local account="$1" prompt="$2" hidden="${3:-0}"
  local value

  if _kc_env_mode; then
    printf '[keychain] prompt_credential called in env mode — not supported.\n' >&2
    return 1
  fi

  printf '\n[keychain] storing %s (service: %s)\n' "${account}" "${KEYCHAIN_SERVICE}" >&2

  if [[ "${hidden}" == "1" ]]; then
    read -rsp "  ${prompt}: " value </dev/tty
    printf '\n' >&2
  else
    read -rp  "  ${prompt}: " value </dev/tty
  fi

  if [[ -z "${value}" ]]; then
    printf '[keychain] no value entered — aborting.\n' >&2
    return 1
  fi

  kc_set "${account}" "${value}" >/dev/null
  printf '%s' "${value}"
}
