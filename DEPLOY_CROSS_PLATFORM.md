# SirverChats multi-platform deployment

SirverChats uses the React/Vite client as the web UI and packages that same
client with Tauri for Android, Windows, and Linux. The Tauri shells use the
existing PocketBase/WebSocket/LiveKit integrations and do not require a
separate UI implementation. The Flutter workspace in `native/` is retained as
an experimental fallback and is not used for production web or release builds.

## Local Tauri builds

From the repository root:

```sh
npm ci
npm run lint
npm run test:unit
npm run build
npx tauri build
npx tauri android build --ci --apk --aab
```

Tauri outputs desktop bundles under `src-tauri/target/release/bundle` and
Android APK/AAB files under `src-tauri/gen/android/app/build/outputs`.
The existing application identifier is preserved as `top.sirverdata.app` so
installed users can upgrade without a package migration.

## GitHub Actions

`native-ci.yml` runs TypeScript checks, unit tests, the React production build,
API gateway tests, and Tauri Android/Windows/Linux builds before packaging.
`native-release.yml` publishes Tauri release artifacts to GitHub Releases on
`v*` tags. The old Capacitor/Flutter workflows remain only as source history;
they are not used by production deployment.

## Cloudflare Pages

The Pages workflow builds the root React app with `npm run build` and deploys
`dist` to the existing `sirverchats` project. SPA fallback and cache headers
are copied from `public/` by Vite.

`app.sirverdata.top` is attached to the production Pages deployment. The
Flutter deployment remains in Pages history for rollback if needed.

Tag releases require the Android signing secrets documented in
`native/README.md`; ordinary CI builds remain unsigned/debug-signed so pull
requests do not depend on private release material.

## API and LiveKit

Deploy `backend/api-v2` on the home VPS with
`deploy/sirverchats-api-v2.service`. Nginx should include
`deploy/chat-api-v2.nginx.conf` in the `chat.sirverdata.top` TLS server and
forward `/api/v2`, `/api/v2/ws`, and `/livekit/token` to `127.0.0.1:8080`.

Set the Istanbul LiveKit token endpoint and internal shared secret only in
`/etc/sirverchats/api-v2.env`. Never put LiveKit credentials in native builds,
Cloudflare, or GitHub artifacts.

Before production migration, stop PocketBase for a consistent `pb_data`/WAL/
storage backup, apply the checked-in indexes, then run `sudo nginx -t && sudo
systemctl reload nginx`. `deploy/backup-pocketbase.sh` provides the stopped-
service archive/checksum procedure (set `PB_DATA_DIR` if the VPS uses a
different location). Verify both OPTIONS and POST responses include the
requesting allowed origin.
