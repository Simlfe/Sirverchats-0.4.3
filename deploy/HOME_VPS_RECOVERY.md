# Home VPS recovery and gateway rollout

The home VPS is the authoritative data source. This runbook is intentionally
operator-driven: it preserves the existing Cloudflare named tunnel and never
creates a hostname, rotates a credential, or deletes PocketBase data.

## Before changing services

Once the machine is powered on and SSH is reachable, identify the installed
units and data paths first:

```sh
systemctl list-unit-files | grep -Ei 'pocketbase|chat|cloudflared|sirver'
sudo find /home -maxdepth 4 -type d -name pb_data -print
sudo cloudflared tunnel list
```

Make a stopped-service backup using `backup-pocketbase.sh`, overriding
`PB_DATA_DIR` if the discovered path differs. Confirm the archive and checksum
exist off the VPS before continuing.

## Install/recover the services

Copy the checked-in files into place, preserving any existing environment and
Cloudflare credentials:

```sh
sudo install -m 0755 deploy/sirverchats-healthcheck.sh /usr/local/sbin/sirverchats-healthcheck.sh
sudo install -m 0644 deploy/sirverchats-api-v2.service /etc/systemd/system/sirverchats-api-v2.service
sudo install -m 0644 deploy/cloudflared-sirverchats.service /etc/systemd/system/cloudflared-sirverchats.service
sudo install -m 0644 deploy/sirverchats-healthcheck.service /etc/systemd/system/sirverchats-healthcheck.service
sudo install -m 0644 deploy/sirverchats-healthcheck.timer /etc/systemd/system/sirverchats-healthcheck.timer
```

Set `/etc/sirverchats/api-v2.env` so the gateway uses loopback PocketBase:

```dotenv
POCKETBASE_URL=http://127.0.0.1:5000
ALLOWED_ORIGINS=https://app.sirverdata.top,https://sirverdata.top,http://tauri.localhost
```

Copy `cloudflared-config.yml.example` to `/etc/cloudflared/config.yml`, then
replace only its tunnel ID and credentials filename with the values from the
existing named tunnel. Verify the ingress remains:

```text
api.sirverdata.top   -> http://127.0.0.1:5000
chat.sirverdata.top  -> http://127.0.0.1:8080
```

If the legacy chat unit or its health URL has a different name, set the
corresponding variables in the health timer's environment before enabling it:
`LEGACY_CHAT_SERVICE`, `LEGACY_CHAT_HEALTH_URL`, and (if needed)
`CLOUDFLARED_SERVICE`.

Reload and enable the units. Use the existing PocketBase and legacy chat unit
names discovered above rather than inventing replacements:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now <existing-pocketbase-unit> sirverchats-api-v2.service cloudflared.service
sudo systemctl enable --now sirverchats-healthcheck.timer
sudo nginx -t && sudo systemctl reload nginx
```

Configure the machine not to suspend while plugged in (the exact command is
distribution-specific) and enable the firmware/systemd automatic recovery
option if the hardware supports it.

## Smoke checks

```sh
curl -fsS http://127.0.0.1:5000/api/health
curl -fsS http://127.0.0.1:8080/api/v2/health
curl -i -X OPTIONS https://chat.sirverdata.top/api/v2/bootstrap \
  -H 'Origin: https://app.sirverdata.top' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization'
curl -i https://api.sirverdata.top/api/health
curl -i https://chat.sirverdata.top/api/v2/health
sudo systemctl --no-pager --full status pocketbase sirverchats-api-v2 cloudflared-sirverchats
```

For an authenticated bootstrap/message check, use a temporary smoke account
and its normal PocketBase bearer token; do not put that token in logs or this
repository. Monitor tunnel reconnects, HTTP 530s, request rate, gateway
`Server-Timing`, PocketBase p95 latency, and realtime reconnects for 24 hours.
