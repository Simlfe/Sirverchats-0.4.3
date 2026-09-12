# SirverChats native client

This directory is the Flutter client for Android, Windows, Linux, and Web. It
does not load the React site in a WebView. The legacy React/Capacitor/Tauri
client remains at the repository root for rollback and existing installations.

## Local development

```sh
flutter pub get
dart run build_runner build
flutter run -d chrome
flutter run -d windows
```

The Web build uses Drift's SQLite WASM/worker files in `web/` and persists
conversation pages in IndexedDB. Native builds use an application SQLite file.

Authentication is isolated behind `NativeCredentialStore`. The checked-in
baseline uses the platform sandbox/origin-scoped `shared_preferences` store so
all four targets build without a native keyring dependency; production device
distributions should swap this adapter for Android Keystore, Windows
Credential Manager, and the Linux keyring before broad release.

Override service endpoints when testing a staging gateway:

```sh
flutter run \
  --dart-define=SIRVER_API_BASE_URL=https://chat.sirverdata.top/api/v2 \
  --dart-define=SIRVER_REALTIME_URL=wss://chat.sirverdata.top/api/v2/ws \
  --dart-define=SIRVER_LIVEKIT_URL=wss://sfu.sirverdata.top
```

## Release builds

```sh
flutter build web --release
flutter build appbundle --release
flutter build apk --release
flutter build windows --release
flutter build linux --release
./tool/package-linux.sh 0.5.0
```

Android uses `top.sirverdata.chat.native`; Windows and Linux use
`top.sirverdata.desktop`. The new clients use existing PocketBase accounts and
data through the versioned gateway.

## Android release signing

The normal CI workflow produces a debug-signed release artifact for build
verification. Tag releases (`v*`) require these GitHub Actions secrets before
the signed APK/AAB job runs:

- `ANDROID_KEYSTORE_BASE64` — base64-encoded upload keystore (`.jks`)
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `FIREBASE_GOOGLE_SERVICES_JSON_BASE64` — base64-encoded Firebase Android
  configuration used by FCM background ringing

`android/key.properties.example` documents the local format. The keystore and
generated `key.properties` are ignored and are never included in artifacts or
Flutter `--dart-define` values.
