# Sirver Core Features List

## Implemented Features
- **Realtime Chat**: Instant message sending, rich text, image & attachment previews, code blocks, and reply chains.
- **Global Theme Engine**: Dark & Light mode toggle, persisted user preference, glassmorphism UI, Avocado Green `#7BAE37` accent styling.
- **Spaces & Channels**: Multi-space management with custom banners, channel filtering, and active channel switching.
- **User Profiles**: Custom banners, avatars, profile themes, roles, status tracking, and direct message shortcuts.
- **Authentication**: Seamless signup, login, and profile creation via PocketBase.
- **In-App Downloads Manager**: Full local download tracking, speed monitoring, and file integrity validation via IndexedDB.
- **Cross-Platform Automatic Update System**: Silent background update check on launch via PocketBase `app_updates`, background installer download, Web Crypto SHA-256 verification, channel subscriptions (`stable`/`beta`/`nightly`), mandatory update overlays, and interactive toast prompts.

## Native 0.5.0 client

- **One native Flutter codebase**: Android, Windows, Linux, and Web share the
  same business logic and adaptive UI. Android and desktop releases are not
  WebViews; the existing React/Capacitor/Tauri builds remain legacy fallback
  releases.
- **Fast conversation loading**: 30-message initial pages, 50-message cursor
  pages, strict timestamp/ID tie-breaking, anchored prepends, cached-first
  rendering, cancellable single-flight requests, and a 500-message active
  memory window backed by a 100 MB Drift LRU cache.
- **Native calls and presence**: LiveKit media is joined only when a call is
  opened, while one WebSocket carries ephemeral ringing/presence events and
  lifecycle transitions persist through the v2 gateway.
- **Platform adapters**: File picking, notifications/FCM, an isolated
  credential-store abstraction, window/tray integration points, thumbnails,
  and deep links are isolated so platform implementations can evolve without
  changing chat state.
