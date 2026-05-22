#!/usr/bin/env bash
# wait-for-foundry.sh — block until Foundry's HTTP endpoint accepts
# connections. Fresh-install boots take ~30 s while felddy downloads
# and extracts the licensed Foundry zip; warm boots are ~5 s.
#
# Exits 0 once the endpoint responds 2xx/3xx, 1 on timeout.

set -euo pipefail

URL="${FOUNDRY_URL:-http://localhost:30000}"
TIMEOUT_SECONDS="${WAIT_FOUNDRY_TIMEOUT:-180}"
deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))

printf '[wait-for-foundry] polling %s (timeout %ss)\n' "${URL}" "${TIMEOUT_SECONDS}"

while (( $(date +%s) < deadline )); do
  # `-o /dev/null -w "%{http_code}"` returns the HTTP code; treat any
  # 2xx/3xx as ready. Foundry's setup screen returns 200.
  code="$(curl -sS -o /dev/null -w "%{http_code}" "${URL}/" 2>/dev/null || true)"
  if [[ "${code}" =~ ^[23] ]]; then
    elapsed=$(( $(date +%s) - (deadline - TIMEOUT_SECONDS) ))
    printf '[wait-for-foundry] ready after %ss (HTTP %s)\n' "${elapsed}" "${code}"
    exit 0
  fi
  sleep 2
done

printf '[wait-for-foundry] timed out after %ss\n' "${TIMEOUT_SECONDS}" >&2
exit 1
