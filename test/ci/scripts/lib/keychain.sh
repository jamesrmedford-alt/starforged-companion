# keychain.sh — macOS Keychain helpers for the Foundry CI stack.
#
# Sourced, not executed. Provides:
#   kc_get <account>            → echoes value, exits 1 if not found
#   kc_set <account> <value>    → stores/overwrites value
#   kc_delete <account>         → removes the entry (no-op if absent)
#   kc_has <account>            → 0 if present, 1 if not
#   ensure_credential <account> <prompt> <hidden:0|1>
#                               → echoes value; prompts and stores if missing
#
# All entries live under one service name so they're easy to find in
# Keychain Access.app and easy to nuke as a group.

KEYCHAIN_SERVICE="${KEYCHAIN_SERVICE:-starforged-ci-foundry}"

_kc_require_darwin() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    printf '[keychain] this stack uses macOS Keychain for credentials.\n' >&2
    printf '[keychain] non-Darwin host detected (%s). Run on macOS, or wire up an alternative.\n' "$(uname -s)" >&2
    return 1
  fi
  command -v security >/dev/null 2>&1 || {
    printf '[keychain] `security` binary not found — is this really macOS?\n' >&2
    return 1
  }
}

kc_get() {
  local account="$1"
  _kc_require_darwin || return 1
  security find-generic-password \
    -a "${account}" -s "${KEYCHAIN_SERVICE}" -w 2>/dev/null
}

kc_set() {
  local account="$1" value="$2"
  _kc_require_darwin || return 1
  # -U: update if it already exists (default is to fail on duplicate).
  security add-generic-password \
    -a "${account}" -s "${KEYCHAIN_SERVICE}" -w "${value}" -U
}

kc_delete() {
  local account="$1"
  _kc_require_darwin || return 1
  security delete-generic-password \
    -a "${account}" -s "${KEYCHAIN_SERVICE}" >/dev/null 2>&1 || true
}

kc_has() {
  local account="$1"
  kc_get "${account}" >/dev/null 2>&1
}

# ensure_credential: read from Keychain, prompt+store if missing, echo value.
# Used by start.sh to bootstrap on first run without separate setup steps.
ensure_credential() {
  local account="$1" prompt="$2" hidden="${3:-0}"
  local value
  if value="$(kc_get "${account}")" && [[ -n "${value}" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  # No stored value — prompt. Write the prompt to stderr so this function
  # is safe to use in `$(...)` capture.
  printf '\n[keychain] no %s stored — prompting once and saving to Keychain.\n' "${account}" >&2
  printf '[keychain] (service: %s, account: %s)\n' "${KEYCHAIN_SERVICE}" "${account}" >&2

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
  printf '[keychain] stored. macOS may prompt for Keychain access on first read — pick "Always Allow".\n' >&2
  printf '%s' "${value}"
}
