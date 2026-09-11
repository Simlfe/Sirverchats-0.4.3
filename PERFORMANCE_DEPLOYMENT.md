# Performance release runbook

The code and migration in this release are safe to stage first. Production data is not modified by the frontend build.

The home VPS has now been backed up and upgraded to PocketBase 0.22.50 with
the performance indexes applied. The verified web `dist` bundle is also live
on its current static host; the Cloudflare Pages workflow remains the durable
deployment path once its project/secrets are configured.

## PocketBase staging/production

1. Stop the PocketBase service before copying its data directory. Make one archive containing `pb_data`, including `data.db-wal`, `data.db-shm`, the request-log database, and `storage/`.
2. Verify the archive can be listed and is stored off the VPS before starting the service again.
3. Run the checked-in migration with PocketBase `0.22.50`, then verify the new indexes with `EXPLAIN QUERY PLAN` for channel and DM history queries.
4. Keep the frontend SDK pinned to `pocketbase@0.21.5` for this compatible server patch. A breaking SDK/server upgrade is a separate project.
5. Monitor request rate, 404s, message/DM p95 latency, RSS, realtime reconnects, and call completion for 24 hours.

Install the checked-in log-retention timer as root (`pocketbase-log-retention.*`
and `pocketbase-prune-logs.sh`). It keeps the internal request log database to
14 days and runs a safe stopped-service `VACUUM` weekly; the first run should
always follow the backup step above.

## Cloudflare Pages

Create a Pages project named `sirverchats` with `main` as the production branch and:

- Build command: `npm ci && npm run build`
- Output directory: `dist`
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub secrets for the checked-in deployment workflow

`public/_redirects` provides the SPA fallback. `public/_headers` gives hashed assets one-year immutable caching while HTML revalidates. PocketBase, chat WebSocket signalling, and LiveKit remain on the VPS.

## LiveKit CORS

The Vite proxy and preview path allow `https://app.sirverdata.top`, `https://sirverdata.top`, and `http://tauri.localhost`, return `204` for `OPTIONS`, and deny unknown origins. The production chat service must use the same allow-list (or its equivalent dynamic subdomain rule) before the Pages deployment is promoted.

For an Nginx-terminated chat endpoint, put the `map` at `http` scope and the
`location` inside the `server` block for `chat.sirverdata.top` (and keep the Go
handler's own CORS policy aligned):

```nginx
map $http_origin $chat_cors_origin {
    default "";
    "https://app.sirverdata.top" $http_origin;
    "https://sirverdata.top" $http_origin;
    "http://tauri.localhost" $http_origin;
}

location /livekit/token {
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin $chat_cors_origin always;
        add_header Access-Control-Allow-Methods "POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        add_header Vary Origin always;
        return 204;
    }
    add_header Access-Control-Allow-Origin $chat_cors_origin always;
    add_header Vary Origin always;
    proxy_pass http://127.0.0.1:8080;
}
```

After editing the VPS, run `sudo nginx -t && sudo systemctl reload nginx`, then
verify both preflight and the token response:

```sh
curl -i -X OPTIONS https://chat.sirverdata.top/livekit/token \
  -H 'Origin: https://app.sirverdata.top' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization'
curl -i -X POST https://chat.sirverdata.top/livekit/token \
  -H 'Origin: https://app.sirverdata.top' \
  -H 'Content-Type: application/json' \
  -d '{"identity":"test","name":"test","room":"test"}'
```
