#!/usr/bin/env bash
# credentials.sh — manage the foundryvtt.com credentials stored in macOS
# Keychain for the local CI stack.
#
# Usage:
#   ./scripts/credentials.sh set       interactive — prompts for all three
#   ./scripts/credentials.sh status    show which are stored (values masked)
#   ./scripts/credentials.sh clear     remove all three from Keychain
#   ./scripts/credentials.sh export    print FOO=bar lines (use with eval)
#
# Stored under service "starforged-ci-foundry" — visible/editable in
# Keychain Access.app under that service name.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/keychain.sh
. "${SCRIPT_DIR}/lib/keychain.sh"

ACCOUNTS=(username password admin-key)

cmd="${1:-}"

case "${cmd}" in
  set)
    # Always (re)prompts and overwrites — use this to fix typos.
    prompt_credential username  "foundryvtt.com username (email or login name)" 0 >/dev/null
    prompt_credential password  "foundryvtt.com password" 1 >/dev/null
    prompt_credential admin-key "Foundry admin key (dev value, e.g. atropos-dev)" 0 >/dev/null
    printf '\n[credentials] all three stored under service "%s".\n' "${KEYCHAIN_SERVICE}"
    ;;

  status)
    printf 'service: %s\n' "${KEYCHAIN_SERVICE}"
    for a in "${ACCOUNTS[@]}"; do
      if kc_has "${a}"; then
        v="$(kc_get "${a}")"
        # Mask all but first/last char so status can be eyeballed safely.
        if (( ${#v} <= 2 )); then
          masked="**"
        else
          masked="${v:0:1}$(printf '%*s' "$(( ${#v} - 2 ))" '' | tr ' ' '*')${v: -1}"
        fi
        printf '  %-10s present  (%s)\n' "${a}" "${masked}"
      else
        printf '  %-10s MISSING\n' "${a}"
      fi
    done
    ;;

  clear)
    for a in "${ACCOUNTS[@]}"; do
      kc_delete "${a}"
      printf '[credentials] cleared %s\n' "${a}"
    done
    ;;

  export)
    # Designed for: eval "$(./scripts/credentials.sh export)"
    # Errors if anything is missing (won't silently export blanks).
    for a in "${ACCOUNTS[@]}"; do
      if ! kc_has "${a}"; then
        printf '[credentials] missing %s — run `./scripts/credentials.sh set` first.\n' "${a}" >&2
        exit 1
      fi
    done
    printf 'export FOUNDRY_USERNAME=%q\n'  "$(kc_get username)"
    printf 'export FOUNDRY_PASSWORD=%q\n'  "$(kc_get password)"
    printf 'export FOUNDRY_ADMIN_KEY=%q\n' "$(kc_get admin-key)"
    ;;

  ""|-h|--help|help)
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
    ;;

  *)
    printf 'unknown subcommand: %s\n' "${cmd}" >&2
    printf 'run `%s help` for usage.\n' "$0" >&2
    exit 2
    ;;
esac
