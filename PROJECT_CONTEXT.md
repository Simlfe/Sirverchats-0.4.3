# Sirver Project Context & Architecture

## Overview
**Sirver** is a modern, high-performance real-time chat and workspace collaboration platform built with React, Vite, Tailwind CSS, PocketBase, and WebSockets.

## Key Architectural Principles
- **Frontend Stack**: React 18, Vite, Framer Motion, Lucide Icons, Tailwind CSS v4.
- **Backend Service**: PocketBase (handling authentication, collections, subscriptions, and file storage).
- **Styling Architecture**: Centralized theme system (`/src/theme/tokens.ts`, `/src/context/ThemeContext.tsx`, `index.css`) supporting Dark and Light modes.
- **Realtime**: PocketBase SDK realtime subscriptions for messages, channels, servers, and user status.

## Native client (Tauri 0.4.x)

The production UI is the root React/Vite client. Tauri packages the same
source for Android, Windows, and Linux, keeping behavior and theme styling
identical across the app family without a second UI rewrite. The Flutter
workspace under `/native` is retained as an experimental fallback and is not
deployed.

- **UI/state**: React 19, Vite, Tailwind, and the existing optimized chat
  renderer run inside Tauri's native WebView shell.
- **Data**: PocketBase SDK `0.21.5` talks to the existing service; message
  caching and cursor pagination remain shared with the web client.
- **Realtime/calls**: The existing WebSocket and LiveKit integrations are
  used by browser and Tauri clients, with the legacy `/ws` bridge preserved.
- **Backend**: `backend/api-v2` remains the versioned gateway next to
  PocketBase. `deploy/` contains the systemd and Nginx fragments; credentials
  are environment-only and never shipped to clients.
