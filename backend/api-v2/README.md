# SirverChats API v2 gateway

The gateway runs next to PocketBase on the home VPS. It provides the stable
`/api/v2` contract used by the native client, keeps legacy `/ws` and
`/livekit/token` compatibility routes available, and never exposes PocketBase
admin or LiveKit signing credentials.

## Configuration

Copy `.env.example` to the service environment and set:

- `POCKETBASE_URL`: internal/public PocketBase base URL.
- `LIVEKIT_TOKEN_SERVICE_URL`: private token endpoint on the Istanbul VPS.
- `LIVEKIT_INTERNAL_TOKEN`: shared secret expected by that private endpoint.
- `CHAT_UPSTREAM_WS`: existing chat WebSocket URL while realtime migration is staged.
- `ALLOWED_ORIGINS`: comma-separated browser origins.

Run `npm ci --omit=dev` and `npm start`. The process listens on
`127.0.0.1:8080`; Nginx terminates TLS and forwards `/api/v2`, `/api/v2/ws`,
and `/livekit/token`.

The gateway itself returns one reflected `Access-Control-Allow-Origin` for the
configured app/root/Tauri origins (and HTTPS `*.sirverdata.top` previews),
credentials, methods, and headers. The Nginx fragment repeats that policy for
preflight responses; place its `map` directives in the `http` block and its
`location` blocks inside the `chat.sirverdata.top` TLS server.

## Message pagination

`GET /api/v2/conversations/{channel|dm}/{id}/messages` accepts `limit`,
`beforeCreated`, and `beforeId`. The gateway requests `limit + 1` records from
PocketBase, orders by `created DESC, id DESC`, applies the strict ID tie-breaker,
and returns chronological items with `{items,nextCursor,hasMore}`.

After enabling the VPS gateway and Nginx fragment, verify the production CORS
path with:

```sh
curl -i -X OPTIONS https://chat.sirverdata.top/livekit/token \
  -H 'Origin: https://app.sirverdata.top' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization'

curl -i -X POST https://chat.sirverdata.top/livekit/token \
  -H 'Origin: https://app.sirverdata.top' \
  -H 'Authorization: Bearer <PocketBase access token>' \
  -H 'Content-Type: application/json' \
  -d '{"identity":"test","name":"test","room":"test"}'
```

Both responses should include `Access-Control-Allow-Origin:
https://app.sirverdata.top`; the POST additionally requires the configured
PocketBase bearer and Istanbul token broker and must not expose its internal
secret. An unauthenticated POST still returns the CORS header, but is rejected
with `401`.

## Deployment safety

Deploy the gateway beside a backed-up PocketBase staging copy first. Set the
Istanbul token URL and internal secret only in the service environment. Do not
put either value in Flutter `--dart-define` flags, GitHub artifacts, or browser
configuration.
