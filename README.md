# SirverChats

The current client is the native Flutter workspace in [`native/`](native/):
one Dart codebase for Android, Windows, Linux, and Flutter Web. It talks to the
versioned gateway at `https://chat.sirverdata.top/api/v2`, uses cursor-paginated
conversation history with a local Drift cache, and connects to LiveKit only
when a call is opened. Android and desktop builds are native binaries, not
WebViews. The root React/Vite/Capacitor/Tauri project remains the legacy 0.4.x
fallback line.

Quick start:

```sh
cd native
flutter pub get
dart run build_runner build
flutter run -d chrome       # or windows
```

Build/release details, gateway deployment, CORS, Pages, signing secrets, and
the legacy rollback path are documented in [`DEPLOY_CROSS_PLATFORM.md`](DEPLOY_CROSS_PLATFORM.md)
and [`native/README.md`](native/README.md).

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/83992f20-c6fc-4f8c-92f0-36e2e51de861

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
