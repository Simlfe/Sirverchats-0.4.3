#!/usr/bin/env bash
set -Eeuo pipefail

# This script is deliberately conservative: it only restarts a unit when the
# corresponding local health check fails, and skips optional units that are
# not installed on a particular VPS. It never changes PocketBase data.
LOCK_FILE="${HEALTHCHECK_LOCK_FILE:-/run/lock/sirverchats-healthcheck.lock}"
POCKETBASE_SERVICE="${POCKETBASE_SERVICE:-pocketbase}"
API_V2_SERVICE="${API_V2_SERVICE:-sirverchats-api-v2}"
LEGACY_CHAT_SERVICE="${LEGACY_CHAT_SERVICE:-chat}"
CLOUDFLARED_SERVICE="${CLOUDFLARED_SERVICE:-cloudflared}"
POCKETBASE_HEALTH_URL="${POCKETBASE_HEALTH_URL:-http://127.0.0.1:5000/api/health}"
API_V2_HEALTH_URL="${API_V2_HEALTH_URL:-http://127.0.0.1:8080/api/v2/health}"
LEGACY_CHAT_HEALTH_URL="${LEGACY_CHAT_HEALTH_URL:-http://127.0.0.1:8091/ws}"

mkdir -p "$(dirname "${LOCK_FILE}")"
exec 9>"${LOCK_FILE}"
flock -n 9 || exit 0

unit_exists() {
  systemctl cat "$1" >/dev/null 2>&1
}

restart_unit() {
  local unit="$1"
  if unit_exists "${unit}"; then
    logger -t sirverchats-healthcheck "restarting failed unit ${unit}"
    systemctl restart "${unit}"
  else
    logger -t sirverchats-healthcheck "unit ${unit} is not installed; skipping"
  fi
}

check_http_or_restart() {
  local unit="$1"
  local url="$2"
  if ! unit_exists "${unit}"; then
    logger -t sirverchats-healthcheck "unit ${unit} is not installed; skipping ${url}"
    return 0
  fi
  if ! systemctl is-active --quiet "${unit}" || ! curl --fail --silent --show-error --max-time 3 "${url}" >/dev/null; then
    restart_unit "${unit}"
  fi
}

check_legacy_socket_or_restart() {
  local unit="$1"
  local url="$2"
  if ! unit_exists "${unit}"; then
    logger -t sirverchats-healthcheck "unit ${unit} is not installed; skipping ${url}"
    return 0
  fi
  local status
  status="$(curl --silent --show-error --max-time 3 -o /dev/null -w '%{http_code}' "${url}" || true)"
  # A WebSocket endpoint commonly returns 400/426 to a plain HTTP probe; both
  # prove the listener is accepting connections and should not trigger a
  # restart.  101/2xx are healthy as well.
  if ! systemctl is-active --quiet "${unit}" || [[ ! "${status}" =~ ^(101|200|201|204|400|426)$ ]]; then
    restart_unit "${unit}"
  fi
}

check_http_or_restart "${POCKETBASE_SERVICE}" "${POCKETBASE_HEALTH_URL}"
check_http_or_restart "${API_V2_SERVICE}" "${API_V2_HEALTH_URL}"
check_legacy_socket_or_restart "${LEGACY_CHAT_SERVICE}" "${LEGACY_CHAT_HEALTH_URL}"

if unit_exists "${CLOUDFLARED_SERVICE}" && ! systemctl is-active --quiet "${CLOUDFLARED_SERVICE}"; then
  restart_unit "${CLOUDFLARED_SERVICE}"
fi
