# SirverChats multi-platform deployment

SirverChats now has a native Flutter client in `native/` for Android,
Windows, Linux, and Web. It shares one Dart UI/data layer and does not embed
the React site in a WebView. The root React/Vite, Capacitor, and Tauri projects
remain the legacy `0.4.3` line and are kept for existing installations and
rollback.

## Local Flutter builds

From `native/`:

```sh
flutter pub get
dart run build_runner build
flutter build web --release
flutter build apk --release
flutter build appbundle --release
flutter build windows --release
flutter build linux --release
./tool/package-linux.sh 0.5.0
```

Flutter Web output is `native/build/web`. Linux packaging produces a relocatable
tarball and Debian package; CI additionally creates an AppImage when
`appimagetool` is available. Android uses application ID
`top.sirverdata.chat.native`; Windows and Linux use `top.sirverdata.desktop`.

## GitHub Actions

`native-ci.yml` runs formatting, analysis, unit/widget/integration tests, and
Web/Android/Windows/Linux builds before packaging. `native-release.yml` adds
release artifacts to GitHub Releases on `v*` tags. The legacy packaging
workflows are manual-only and remain available under the `legacy-v*` tag.

## Cloudflare Pages

The Pages workflow builds from `native/` and deploys `native/build/web` to the
existing `sirverchats` project. `native/web/drift_worker.js` and
`native/web/sqlite3.wasm` are shipped with the build so Drift can persist pages
in IndexedDB. SPA fallback and cache headers are copied into the Flutter output
by the workflow.

Attach `app.sirverdata.top` to Pages only after the native parity checks pass.
The previous React deployment stays in Pages history for rollback.

Tag releases require the Android signing secrets documented in
`native/README.md`; ordinary CI builds remain unsigned/debug-signed so pull
requests do not depend on private release material.

## API and LiveKit

Deploy `backend/api-v2` on the home VPS with
`deploy/sirverchats-api-v2.service`. Nginx should include
`deploy/chat-api-v2.nginx.conf` in the `chat.sirverdata.top` TLS server and
forward `/api/v2`, `/api/v2/ws`, and `/livekit/token` to `127.0.0.1:8080`.

Set the Istanbul LiveKit token endpoint and internal shared secret only in
`/etc/sirverchats/api-v2.env`. Never put LiveKit credentials in Flutter builds,
Cloudflare, or GitHub artifacts.

Before production migration, stop PocketBase for a consistent `pb_data`/WAL/
storage backup, apply the checked-in indexes, then run `sudo nginx -t && sudo
systemctl reload nginx`. `deploy/backup-pocketbase.sh` provides the stopped-
service archive/checksum procedure (set `PB_DATA_DIR` if the VPS uses a
different location). Verify both OPTIONS and POST responses include the
requesting allowed origin.
