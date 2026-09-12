#!/usr/bin/env bash
set -euo pipefail

# Run on the VPS as an operator with permission to stop PocketBase. The
# archive includes SQLite, WAL/SHM files, and uploaded storage as one snapshot.
PB_DATA_DIR="${PB_DATA_DIR:-/home/sirver/pb_data}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/sirver/backups/sirverchats}"
POCKETBASE_SERVICE="${POCKETBASE_SERVICE:-pocketbase}"

if [[ ! -d "${PB_DATA_DIR}" ]]; then
  echo "PocketBase data directory not found: ${PB_DATA_DIR}" >&2
  exit 1
fi

mkdir -p "${BACKUP_ROOT}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="${BACKUP_ROOT}/pb_data-${stamp}.tar.gz"

was_active=0
if systemctl is-active --quiet "${POCKETBASE_SERVICE}"; then
  was_active=1
fi

cleanup() {
  if [[ "${was_active}" == 1 ]]; then
    systemctl start "${POCKETBASE_SERVICE}"
  fi
}
trap cleanup EXIT

if [[ "${was_active}" == 1 ]]; then
  systemctl stop "${POCKETBASE_SERVICE}"
fi
tar --xattrs --acls --numeric-owner -C "$(dirname "${PB_DATA_DIR}")" \
  -czf "${archive}" "$(basename "${PB_DATA_DIR}")"
sha256sum "${archive}" > "${archive}.sha256"
echo "Created ${archive}"
