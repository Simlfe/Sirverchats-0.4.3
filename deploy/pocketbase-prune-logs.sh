#!/usr/bin/env bash
set -euo pipefail

PB_DATA_DIR="${PB_DATA_DIR:-/home/sirver/pb_app/pb_data}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ ! -f "$PB_DATA_DIR/logs.db" ]]; then
  exit 0
fi

was_active=0
if systemctl is-active --quiet pocketbase; then
  was_active=1
  systemctl stop pocketbase
fi

restart() {
  if [[ "$was_active" == 1 ]]; then
    systemctl start pocketbase
  fi
}
trap restart EXIT

python3 - "$PB_DATA_DIR/logs.db" "$RETENTION_DAYS" <<'PY'
import sqlite3
import sys

path, days = sys.argv[1], int(sys.argv[2])
con = sqlite3.connect(path)
con.execute("DELETE FROM _logs WHERE created < datetime('now', ?)", (f'-{days} days',))
con.commit()
con.execute('VACUUM')
con.close()
PY
