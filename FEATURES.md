# Sirver Core Features List

## Implemented Features
- **Realtime Chat**: Instant message sending, rich text, image & attachment previews, code blocks, and reply chains.
- **Global Theme Engine**: Dark & Light mode toggle, persisted user preference, glassmorphism UI, Avocado Green `#7BAE37` accent styling.
- **Spaces & Channels**: Multi-space management with custom banners, channel filtering, and active channel switching.
- **User Profiles**: Custom banners, avatars, profile themes, roles, status tracking, and direct message shortcuts.
- **Authentication**: Seamless signup, login, and profile creation via PocketBase.
- **In-App Downloads Manager**: Full local download tracking, speed monitoring, and file integrity validation via IndexedDB.
- **Cross-Platform Automatic Update System**: Silent background update check on launch via PocketBase `app_updates`, background installer download, Web Crypto SHA-256 verification, channel subscriptions (`stable`/`beta`/`nightly`), mandatory update overlays, and interactive toast prompts.

## Native 0.4.3 client

- **One React/Tauri client**: Android, Windows, and Linux package the same
  optimized React UI used on the web; no separate Flutter UI is used in
  production.
- **Fast conversation loading**: Cursor pagination, cached-first rendering,
  anchored prepends, and the active message-window optimizations are shared by
  browser and Tauri shells.
- **Native calls and presence**: LiveKit media and the existing WebSocket
  signaling work in the Tauri WebView, while lifecycle transitions persist
  through the v2 gateway.
- **Platform adapters**: Tauri plugins handle windows, tray actions, file
  dialogs, downloads, updates, deep links, and Android packaging while the
  React feature components remain shared.
