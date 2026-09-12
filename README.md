# SirverChats

The production client is the React/Vite app in `src/`. It is served on the web
and packaged unchanged with Tauri 2 for Android, Windows, and Linux, so every
platform uses the same restored UI and chat/call behavior. It talks to the
versioned gateway at `https://chat.sirverdata.top/api/v2`, keeps the optimized
cursor-paginated conversation history, and connects to LiveKit when a call is
opened. The Flutter workspace in [`native/`](native/) is retained as an
experimental fallback and is not used for production deployment.

Quick start:

```sh
npm ci
npm run lint
npm run test:unit
npm run dev
```

Build Tauri apps with:

```sh
npm run build
npx tauri build                         # Windows/Linux
npx tauri android build --ci --apk --aab
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
