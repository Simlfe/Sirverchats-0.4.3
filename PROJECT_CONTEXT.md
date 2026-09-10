# Sirver Project Context & Architecture

## Overview
**Sirver** is a modern, high-performance real-time chat and workspace collaboration platform built with React, Vite, Tailwind CSS, PocketBase, and WebSockets.

## Key Architectural Principles
- **Frontend Stack**: React 18, Vite, Framer Motion, Lucide Icons, Tailwind CSS v4.
- **Backend Service**: PocketBase (handling authentication, collections, subscriptions, and file storage).
- **Styling Architecture**: Centralized theme system (`/src/theme/tokens.ts`, `/src/context/ThemeContext.tsx`, `index.css`) supporting Dark and Light modes.
- **Realtime**: PocketBase SDK realtime subscriptions for messages, channels, servers, and user status.
