# Sirver Project Context & Architecture

## Overview
**Sirver** is a modern, high-performance real-time chat and workspace collaboration platform built with React, Vite, Tailwind CSS, PocketBase, and WebSockets.

## Key Architectural Principles
- **Frontend Stack**: React 18, Vite, Framer Motion, Lucide Icons, Tailwind CSS v4.
- **Backend Service**: PocketBase (handling authentication, collections, subscriptions, and file storage).
- **Styling Architecture**: Centralized theme system (`/src/theme/tokens.ts`, `/src/context/ThemeContext.tsx`, `index.css`) supporting Dark and Light modes.
- **Realtime**: PocketBase SDK realtime subscriptions for messages, channels, servers, and user status.

## Native client (0.5.x)

The repository also contains a shared Flutter workspace under `/native`. It is
the native client for Android (`top.sirverdata.chat.native`), Windows, Linux
(`top.sirverdata.desktop`), and Flutter Web. Android and desktop builds do not
embed the legacy React page or a WebView. The React/Capacitor/Tauri application
remains available as the 0.4.x legacy line while parity is validated.

- **UI/state**: Flutter Material 3 with Riverpod and adaptive server/channel/DM
  navigation. Cached messages render immediately and the active feed is capped
  at 500 items in memory.
- **Data**: Dio talks to `https://chat.sirverdata.top/api/v2`; Drift provides a
  SQLite cache on native platforms and a Wasm/IndexedDB-backed cache on Web.
  History uses the shared `{created,id}` cursor contract (30 newest, 50 older)
  and a global 100 MB LRU budget.
- **Realtime/calls**: One authenticated WebSocket carries normalized message
  and ephemeral call events. LiveKit media connects directly to
  `wss://sfu.sirverdata.top`; durable call records are lifecycle transitions.
- **Backend**: `backend/api-v2` is the versioned gateway staged next to
  PocketBase. `deploy/` contains the systemd and Nginx fragments; credentials
  are environment-only and never shipped to clients.
