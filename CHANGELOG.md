# Sirver Application Changelog

## [Unreleased] - 2026-09-13
### UI alignment and mobile viewport hardening
- Added the missing Tailwind `xs` breakpoint so compact phone controls, chat
  headers, and media-player layouts use their intended responsive rules.
- Hardened flex-shell sizing with `min-width`/`min-height` constraints to stop
  long channel names, feeds, and drawers from forcing horizontal or vertical
  overflow.
- Synced navigation/member drawer swipe geometry with their CSS widths and
  added frame-coalesced member-drawer dragging for a smooth, gap-free snap.
- Made chat headers and feed padding responsive on narrow screens, and kept
  fixed drawers, popovers, context menus, galleries, and search dialogs within
  dynamic mobile viewport and safe-area bounds.
- Added deterministic media preview sizing and responsive reaction-picker
  placement to avoid collapsed cards and clipped controls while media or the
  mobile keyboard is active.

## [Unreleased] - 2026-09-12
### React/Tauri UI restoration
- Restored the optimized React UI as the production Cloudflare Pages build for
  `app.sirverdata.top`.
- Switched Android packaging from Capacitor to the existing Tauri 2 Android
  target; Windows and Linux continue to use the same Tauri shell.
- Updated cross-platform CI, release workflows, local build scripts, and
  deployment documentation so Tauri is the default packaging path. The
  Flutter workspace remains an experimental fallback and is not deployed.
- Retained the versioned API gateway, CORS fixes, pagination, indexes, and
  PocketBase backup from the performance deployment.

## [Unreleased] - 2026-09-11
### Performance & Reliability
- Fixed the ChatPanel initial-load race so a missing scroll ref cannot leave a conversation permanently hidden behind the loading overlay; added a bounded safety timeout.
- Re-enabled real message windowing with overscan and scroll-anchor compensation for long histories.
- Split authenticated workspace components and the update service version constant out of the initial browser bundle; optional display fonts now load only when selected.
- Prevented unauthenticated pages from opening the persistent chat WebSocket and removed duplicate delayed message lookups from realtime handling.
- Added bounded WebSocket send queues, write deadlines, PocketBase request timeouts, and non-blocking broadcasts to protect the chat service from slow clients.
- Replaced fixed-size DM/server history with a shared `(created,id)` cursor contract, 30-message initial loads, 50-message older pages, per-conversation request generations, and cache-safe anchored prepends.
- Removed destructive 150-message offline trims, realtime create double-fetches, server-wide ping history scans, calls-table voice polling, and no-op notification writes.
- Switched feed media preloading to four nearby thumbnails, kept cached content visible during refresh, and removed channel-keyed ChatPanel remounts that caused blank navigation frames.
- Added PocketBase performance indexes in `pb_migrations/202609120002_performance_indexes.js`, pinned the compatible JavaScript SDK to 0.21.5, and added cursor tests plus a 300 KiB initial-JavaScript CI budget.
- Added Cloudflare Pages SPA redirects/cache headers and an optional deployment workflow for `app.sirverdata.top`; the React/Capacitor/Tauri implementation remains the legacy fallback while the native Flutter line is validated.

## [0.4.5] - 2026-09-11
### Performance: Deep Performance Audit & Main-Thread Unblocking
- **Eliminated Synchronous LocalStorage in Critical Render Loops (`src/pocketbase.ts`, `src/components/ChatPanel.tsx`, `src/App.tsx`)**:
  - Implemented in-memory Maps (`serverMembersCache`, `negativeServerMembersCache`, `serverRolesCache`) in `PocketBaseService`. `getCachedServerMember` and `getCachedServerRoles` now return instantaneously without blocking the browser thread on repeated disk reads.
  - Implemented `fastLocalCache` in `src/pocketbase.ts` to cache key profile and server preference items in memory, eliminating up to 15 synchronous `localStorage.getItem` calls on every single message and member rendered via `getEffectiveProfile`, `getServerIconUrl`, and `getServerBannerUrl`.
  - Refactored `ChatPanel.tsx` member list mapping and mention parsers to eliminate synchronous `localStorage.getItem` reads inside iterative loops.
  - Removed synchronous `localStorage.getItem` queries from the outgoing message mention targeting loop in `App.tsx`.
- **O(1) User Lookups & Promise Deduplication (`src/pocketbase.ts`, `src/components/ChatPanel.tsx`)**:
  - Added `usersMapCache` in `PocketBaseService` to replace O(N) linear array searches in `getCachedUser(userId)` with instant O(1) Map lookups.
  - Added request deduplication (`pendingUserFetches`) and negative caching (`negativeUserFetches`) to `fetchUserById` to prevent concurrent network stampedes during render passes.
  - Added memoized `allUsersMap` and `userNameLookupMap` in `ChatPanel.tsx` to accelerate `@mention` parsing and sender display resolution without scanning arrays.
- **In-Memory User Settings Cache (`src/lib/userSettings.ts`)**:
  - Replaced synchronous `localStorage.getItem('user_settings')` on every component read with an in-memory cached state, synchronized via window event listeners.
- **SQLite Database Write Lock & Voice Presence Throttling (`src/pocketbase.ts`, `src/services/voicePresenceStore.ts`)**:
  - Relaxed voice presence heartbeat and pruning frequency from 3 seconds to 10 seconds, and throttled database synchronization to once every 45-60 seconds (or immediately on state change).
  - Removed destructive `delete` queries executed during read cycles in `fetchVoicePresences`, and cached voice presences in memory for 10 seconds.
- **Relaxed Periodic Background Intervals (`src/components/DiscoveryCenter.tsx`, `src/components/ChannelList.tsx`)**:
  - Relaxed presence ticks and friends synchronization intervals from 15s to 60s, and guarded them with `!document.hidden` to halt timer processing when tabs are inactive.
- **Capped Offline IndexedDB Message Retention (`src/services/offlineCacheService.ts`)**:
- Reworked channel message history retention so pagination pages are merged losslessly; the active UI window is bounded separately from the IndexedDB history cache.

## [0.4.4] - 2026-09-11
### Fix: DM Call Signaling & Incoming Ringing
- **Realtime Signaling Fast-Path (`src/App.tsx`, `src/services/callSignaling.ts`)**:
  - Added an immediate fast-path in `subscribeToPrivateMessages` and `subscribeToMessages` for `INCOMING_CALL:` and `CALL_SIGNAL:` messages that directly invokes `callSignalingService.handleIncomingCallPayload` before any async user fetches or chat bubble rendering.
  - Automatically deletes ephemeral signaling records from PocketBase upon receipt so they do not clutter chat history or database storage.
  - Synchronized `callSignalingService.setCurrentUser(currentUser)` on login/state changes and added a resilient fallback to stored authentication in `getCurrentUser()`.
  - Fixed recipient checks in `callSignaling.ts` and `MediaContext.tsx` to ensure incoming calls reliably trigger the ringing UI (`FloatingCallWindow`) and sound.
- **Audio Context & Ringtone Resilience (`src/lib/sounds.ts`)**:
  - Expanded interaction listeners for audio context unlocking to include `pointerdown`, `mousedown`, `touchstart`, `touchend`, `keydown`, and `focus`.
  - Added a one-time user-gesture resume fallback to `playRingtoneSound` to ensure audio playback triggers immediately upon user touch/click even if the browser autoplay policy temporarily restricted background audio.

### Performance: Browser and Mobile Web Optimization
- **Prevented Main-Thread Periodic Re-renders (`src/components/ChatPanel.tsx`, `src/context/MediaContext.tsx`)**:
  - Fixed an infinite re-render loop in `ChatPanel.tsx`'s presence timer that was creating a new array reference every 15 seconds without updating user offline status. Throttled the interval to 60s, checked page visibility, and mutated state conditionally.
  - Constrained the camera telemetry polling in `MediaContext.tsx` to only run when actively in a room with the camera enabled, eliminating unconditional 1-second interval re-renders across the entire application.
- **Eliminated Database Lock Contention (`src/pocketbase.ts`, `src/App.tsx`)**:
  - Throttled `sendHeartbeat` in `pocketbase.ts` to at most once per 90 seconds, and updated `App.tsx` presence heartbeat interval from 25s to 90s (skipping when the page is hidden), eliminating SQLite write-lock contention that delayed database queries for up to a minute.
- **Eliminated LocalStorage Congestion & Blocking Scans (`src/lib/storageManager.ts`, `src/services/offlineCacheService.ts`, `src/pocketbase.ts`, `src/main.tsx`)**:
  - Removed synchronous startup scan of all localStorage keys in `storageManager.ts` and deferred `cleanupStorageQuota` in `main.tsx` to `requestIdleCallback`.
  - Throttled `cleanupStorageQuota` so it cannot execute more than once every 30 seconds.
  - Removed large synchronous `localStorage.setItem` writes for offline servers, channels, and direct messages in `offlineCacheService.ts`, utilizing non-blocking in-memory Maps and IndexedDB instead.
  - Removed synchronous `localStorage.setItem('cached_all_users', ...)` from `pocketbase.ts`, relying on memory caching with an extended 3-minute TTL and single-user lookup via `fetchUserById`.

## [0.4.3] - 2026-09-10
### Fix: Webpage Icon Display & Social Preview (Favicons, Manifest & Open Graph)
- **Webpage Icon & Favicon Suite (`public/`, `index.html`)**:
  - Placed complete favicon suite in `public/` including `favicon.ico` (multi-resolution 16px to 256px), `favicon.svg` (crisp vector icon), `favicon-32x32.png`, `favicon-16x16.png`, `apple-touch-icon.png` (180x180), and PWA icons (`icon-192x192.png`, `icon-512x512.png`).
  - Updated `index.html` with `<link rel="icon">`, `<link rel="apple-touch-icon">`, and `<link rel="manifest">` tags, resolving the missing tab icon and browser default page icon issue.
- **Social Link & Page Preview (`index.html`, `public/og-preview.png`)**:
  - Generated a 1200x630 high-resolution Open Graph card featuring the SirverData logo, Avocado Green (`#7BAE37`) accents, ecosystem tags, and crisp branding.
  - Added comprehensive Open Graph (`og:title`, `og:description`, `og:image`, `og:site_name`, `og:url`) and Twitter Card (`twitter:card`, `twitter:image`, `twitter:title`, `twitter:description`) meta tags to `index.html`.
- **Pre-Hydration Visual Shell (`index.html`)**:
  - Embedded a styled loading splash inside `<div id="root">` with an animated pulse glow and app icon, ensuring instantaneous branded rendering during page loading.
### Fix: GitHub Actions CI/CD Pipeline & Live Web Shell Synchronization
- **Live Web Page Loading Configuration (`capacitor.config.ts`, `android/app/src/main/assets/capacitor.config.json`)**:
  - Configured `server.url = 'https://app.sirverdata.top'` and `cleartext = true` in Capacitor configuration, ensuring mobile APK builds act as native live web shells loading the hosted web application directly while preserving native plugins (notifications, status bar).
- **Tauri Native Metadata Synchronization (`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `android/app/build.gradle`)**:
  - Aligned desktop and mobile binary versions to `0.4.3`.
  - Constrained Tauri bundle targets to explicit `['deb', 'appimage', 'nsis']`, eliminating failures on Linux runners caused by uninstalled `rpmbuild`.
- **Linux CI/CD Workflow Hardening (`.github/workflows/build-linux.yml`)**:
  - Added `libfuse2t64` / `libfuse2` and `squashfs-tools` to the system package installation, resolving the fatal `dlopen(): error loading libfuse.so.2` error during AppImage bundling on Ubuntu 24.04 runners.
  - Added clean `npm install` (`rm -f package-lock.json`) and explicit `--bundles deb,appimage` build flags.
- **Android CI/CD Workflow Hardening (`.github/workflows/build-android.yml`)**:
  - Removed rigid pre-cached `gradle-version` override in `gradle/actions/setup-gradle@v4` to let the Gradle wrapper (`gradle-8.14.3-all.zip`) build the project natively.
  - Added `rm -f package-lock.json` and resilient `sdkmanager --licenses` fallback.
### Fix: PocketBase Realtime Users Subscription Error Mitigation
- **Resilient Users Realtime Subscription (`src/pocketbase.ts`)**:
  - Prevented premature subscription attempts before user authentication is verified (`!this.pb.authStore.isValid`).
  - Added graceful fallback to individual user record subscription (`collection('users').subscribe(activeUserId)`) if collection-wide wildcard (`*`) subscription is rejected by PocketBase collection API rules (400/403 "Something went wrong").
  - Silenced unhelpful warning logs that cluttered the application console.
### Feature: Desktop-Only TitleBar & Bottom-Right Version Indicator
- **Desktop-Only TitleBar (`src/components/TitleBar.tsx`)**:
  - Bound TitleBar rendering strictly to `isTauriEnvironment()`, ensuring the top bar is completely hidden when accessed through web browsers or mobile web, while remaining active in native desktop applications for window controls.
- **Bottom-Right Version Watermark (`src/App.tsx`)**:
  - Positioned the application version indicator (`v0.4.3`) in the bottom-right corner of the viewport (`fixed bottom-1.5 right-2.5`).
  - Rendered in discreet, borderless typography (`font-mono text-[11px] text-[var(--theme-text-muted)] opacity-50 pointer-events-none`) so it does not interfere with chat interactions or UI buttons.
- **Application Version Synchronization**:
  - Aligned `CURRENT_APP_VERSION` to `0.4.3` in `src/services/updateService.ts`.
  - Updated `package.json`, `metadata.json`, `versions.json`, and `versions` static tracking assets to `0.4.3`.

## [4.60.76] - 2026-09-10
### Fix: Instant Empty DM Channel Presentation & Zero-Latency Empty State Caching
- **Instant Empty Channel Reveal (`src/components/ChatPanel.tsx`)**:
  - Eliminated the 120ms delay timer and the brittle lock check (`initialChannelLoadLockRef.current.active`) that previously left genuinely empty DM channels (0 messages) locked in skeleton loading mode until the 12-second watchdog expired.
  - Immediately marks `isInitialLoadReady = true` and unlocks scroll state as soon as `sortedMessages.length === 0` and initial loading concludes, rendering the conversation greeting and empty state without delay.
- **Empty Array State Caching (`src/pocketbase.ts`, `src/App.tsx`)**:
  - Fixed cache validation checks across `App.tsx` (`loadMessages`, `handleSelectDmChannel`, and active channel effect) and `pocketbase.ts` (`fetchDirectMessages`) that previously required `items.length > 0`, which mistakenly treated empty channels as cache misses and triggered redundant re-fetches.
  - Formally caches empty DM state (`items: []`, `hasMore: false`) across L1 memory cache and IndexedDB offline storage upon confirmation of 0 messages, enabling subsequent visits to open in 0ms without network overhead.
  - Bypassed unnecessary secondary chat server scans when `targetServerId` was already resolved and confirmed to have 0 records.
- **Immediate State Synchronization (`src/App.tsx`)**:
  - Explicitly invokes `setIsInitialLoadingChannel(false)` and `setIsLoadingMore(false)` upon receiving a 0-item result from `fetchDirectMessages` instead of waiting for watchdog timer fallbacks.
  - Corrected `setMessages` in `loadMessages` to preserve only active optimistic pending messages when the server confirms 0 messages, rather than retaining stale items from prior channels.
### Fix: LocalStorage Quota Exceeded Elimination, Resilient Auth Store & 400/404 API Error Prevention
- **Resilient Auth Store (`src/lib/storageManager.ts`, `src/pocketbase.ts`)**:
  - Implemented `ResilientAuthStore` extending `BaseAuthStore` to guard against browser `QuotaExceededError` when saving `pocketbase_auth`.
  - Added proactive quota cleanup and multi-tier persistence (localStorage -> sessionStorage -> in-memory) ensuring login and auth refresh never fail due to filled client storage.
  - Linked `ResilientAuthStore` directly to `PocketBase` instance lifecycle in `PocketBaseService` constructor and `setServerUrl`.
- **Storage Quota Preservation (`src/lib/storageManager.ts`, `src/components/ServerSettingsModal.tsx`, `src/components/SettingsModal.tsx`)**:
  - Automatically diverts non-critical large strings (>50KB, such as base64 images and server banners) into `sessionStorage` instead of exhausting `localStorage`.
  - Replaced uncompressed `localStorage.setItem` for server banners, server icons, and member profiles with `safeLocalStorageSet`.
  - Added proactive quota cleanup on application startup in `main.tsx` and before authentication actions in `login()`.
- **API Error Mitigation (404 on `voice_presences` & 400 on `app_settings_admin`) (`src/pocketbase.ts`)**:
  - Guarded `voice_presences` queries with `voicePresencesSupported` flag (defaulting to false to prevent 404 spam since voice presence uses the `calls` collection defined in `DATABASE.md`).
  - Updated `getAdminAppSettings()` and `saveAdminAppSettings()` to query without the `filter: 'key = "admin_settings"'` parameter that triggered `400 Bad Request` on schemas lacking a `key` column, and gracefully fall back to the standard `app_config` collection and safe local cache.
### Fix: React Key Collision Elimination & Message Deduplication Architecture
- **Message Sorter Deduplication (`src/components/ChatPanel.tsx`)**:
  - Separated `uniqueMessagesMap` (canonical collection keyed exclusively by unique message ID) from `lookup` (multi-key index supporting both permanent ID and optimistic `temp_id` for reply navigation).
  - Fixed root-cause bug where setting both `msg.id` and `temp_id` on the same `Map` caused `Array.from(map.values())` to contain duplicate references to the same message object.
- **Render Key Guarding (`src/components/ChatPanel.tsx`)**:
  - Wrapped `visibleSlice.map` with key-tracking logic (`seenRowKeys`) ensuring every rendered wrapper (`msg-wrapper-${msgKey}`) and inner container (`msg-inner-${msgKey}`) has a guaranteed unique React key across every render frame.
  - Eliminated the `Encountered two children with the same key ... msg-wrapper-optimistic-...` console warnings.
- **Optimistic State Reconciler (`src/App.tsx`, `src/lib/messageDiff.ts`)**:
  - Enhanced `mergeMessageListPreservingReferences` to index both `item.id` and `temp_id` during incoming message array deduplication.
  - Cleaned up confirmed messages in `setMessages` and realtime handlers (`subscribeToPrivateMessages`, `subscribeToMessages`) by clearing temporary IDs upon server confirmation and preserving confirmed records if realtime delivery precedes HTTP response.

## [4.60.73] - 2026-09-09
### Fix: Reaction Toolbar Timestamp Clearance, DM Fast Loading & Duplicate Prevention
- **Reaction Toolbar Clearance (`src/components/ChatPanel.tsx`)**:
  - Elevated reaction bar position to `-top-[44px] end-1 sm:end-2` to guarantee complete vertical clearance above the message timestamp (`Jul 22 08:17 PM`) and perfect horizontal flush alignment with the message edge.
- **Fast Resilient DM Loading (`src/pocketbase.ts`, `src/App.tsx`)**:
  - Eliminated premature 4500ms timeout aborts by expanding the query allowance to 12s, accommodating remote network latency and cold-starts.
  - Added zero-join raw query fallback (`getList(1, 40)` without relation expansion) when table joins take longer than normal, guaranteeing immediate response.
  - Implemented multi-chat-server fallback resolution: if a conversation has historical messages in an alternate `private_chat_servers` record, the system detects and loads them automatically.
  - Protected in-memory and IndexedDB caches in `src/App.tsx` from being overwritten when network requests return 0 items or encounter transient network errors.
  - Enhanced cache key resolution (`dm-user-{id}`, `dm-server-{id}`) so cached messages are located synchronously on the very first frame of switching chats.
- **Duplicate Message Prevention (`src/App.tsx`)**:
  - Fixed race condition between optimistic message resolution in `handleSendMessage` and realtime subscription events in `subscribeToPrivateMessages`.
  - Added duplicate detection in `setMessages` to gracefully reconcile optimistic placeholders with incoming realtime records without duplicating bubbles.

## [4.60.72] - 2026-09-09
### UI/UX & Performance: Reactions Toolbar Precision Alignment & Instant DM Loading Fix
- **Actions & Reactions Toolbar Positioning (`src/components/ChatPanel.tsx`)**:
  - Positioned toolbar at `absolute -top-[34px] end-2 sm:end-3 z-30` so it rests gracefully on the top border of the hovered message without hiding or overlapping the message body or timestamp.
  - Aligned toolbar horizontally with the timestamp at the end of the message panel (`end-2 sm:end-3`), ensuring clean right-aligned alignment in LTR and left-aligned alignment in RTL.
- **Direct Message Performance & Reliability Optimization (`src/pocketbase.ts`, `src/App.tsx`)**:
  - Implemented timeout wrapper `withTimeout` on PocketBase queries to eliminate infinite hangs.
  - Integrated dual-layer (in-memory + IndexedDB) cache lookup for DM channels and messages, guaranteeing instant message rendering on channel switch.
  - Added multi-key cache resolution across `dm-server-{id}`, `dm-user-{id}`, and server IDs.
  - Added a 4-second safety watchdog in `loadMessages` to guarantee the loading spinner never locks up the chat view, and prevented empty state overrides when cached messages exist.

## [4.60.71] - 2026-09-09
### Design System: Universal Theme Token Alignment & Contrast Migration
- **Centralized Accent Contrast Migration (`src/components/*`)**:
  - Replaced hardcoded `text-white` on `bg-accent` buttons, badges, and active items with dynamic `var(--theme-accent-contrast, #ffffff)` to guarantee high contrast across all light, dark, and custom themes (including avocado green, light themes, pastel palettes, and dark monochrome).
  - Migrated components:
    - `MusicPlayer.tsx`: Play/pause buttons, active playlist track items, disk animations, and streaming video controls.
    - `VoicePanel.tsx`: Voice connect/disconnect buttons, channel action controls, and media status badges.
    - `DownloadsTabContent.tsx`: Download filter pills and manual download trigger buttons.
    - `UpdatesTabContent.tsx`: Check for updates, manual download, and rollback actions.
    - `ErrorBoundary.tsx`: Application reload and recovery action buttons.
    - `AttachmentDownloadControl.tsx`: Media attachment download buttons.
    - `ParticipantTile.tsx`: Screen share badges and stream indicators.
    - `ChannelMediaGalleryModal.tsx`: Jump-to-message buttons and gallery preview actions.
    - `ServerSettingsModal.tsx`: Server icon placeholder and channel preset buttons.
    - `AuthScreen.tsx`: Server URL configuration button and guest mode triggers.
    - `ChatPanel.tsx`: Message send button, inline message edit save buttons, mention autocomplete selections, and EXR image card previews.
    - `UserProfileModal.tsx`: Profile bio save action button.
    - `DiscoveryCenter.tsx`: Friend and user DM quick-action buttons with `hover:text-[var(--theme-accent-contrast,#ffffff)]`.
    - `SettingsModal.tsx`: Status selector dropdown items aligned with `--theme-bg-card`, `--theme-border`, `--theme-text-primary`, and `--theme-bg-tertiary`.
    - `NotificationsPopover.tsx`: Unread notification card text aligned with `--theme-text-primary`.
- **Theme Guide Sync (`THEME_GUIDE.md`)**:
  - Updated the migration status tracker to document full theme token conformance across all active UI components and modals.

## [4.60.70] - 2026-09-08
### Bug Fix: Voice Screen Participant Disconnect UI Synchronization
- **Voice Screen Grid Disconnection Sync (`src/components/VoicePanel.tsx`)**:
  - Resolved bug where a user leaving a voice channel disappears from the left sidebar panel immediately, but continues lingering in the main voice grid for up to 20 seconds.
  - Root cause: `RealtimeMediaProvider.ts` maintains a 20-second connection stabilization grace period (`isPendingDisconnect: true`, `connectionState: 'reconnecting'`) to protect against transient packet drops and socket blips. `voicePresenceStore` removes departing participants immediately, but `VoicePanel.tsx` formed an unfiltered union of presence and media participants without validating whether users were pending disconnect or already gone from channel presence.
  - In `displayParticipants`, filtered out media participants whose state is `isPendingDisconnect` or `disconnected` whenever they no longer exist in the channel's `voicePresenceStore`. Participants who leave now immediately exit both the sidebar channel member list and the main voice grid in perfect synchronization.

## [4.60.69] - 2026-09-08
### Feature: Live Web Shell & Complete Updater UI Removal
- **Native Live Web Shell Integration (`src/services/liveShellService.ts`, `src-tauri/capabilities/default.json`, `src/main.tsx`)**:
  - Implemented `LiveShellService` to allow desktop applications (Tauri, AppImage, Linux `.deb`, Windows `.exe`) to seamlessly load the live web application from `https://app.sirverdata.top`.
  - Added remote capability URL permissions in `src-tauri/capabilities/default.json` for `https://app.sirverdata.top` and `https://app.sirverdata.top/*`, allowing the live web application to invoke native desktop APIs (frameless window controls, tray, notifications, audio devices).
  - Implemented intelligent availability probing: At app startup, the desktop shell probes the remote endpoint with a fast timeout. If active, it smoothly transitions to the live web app; if offline, unreachable, or returning 404, it safely falls back to the bundled local client without interruption.
  - Implemented seamless session state handoff (`auth_handoff`) to preserve authenticated user state between local and remote environments.
- **Removed Updater UI & Background Polling (`src/components/SettingsModal.tsx`, `src/App.tsx`)**:
  - Completely removed the "Updates & Releases" tab from the Settings navigation and modal content.
  - Removed all updater UI components: download banners, progress notifications, interrupted update popups, restart toasts, and mandatory update overlays.
  - Disabled automatic background GitHub update polling in `App.tsx` on startup, shifting entirely to the continuous Live Web delivery model.

## [4.60.68] - 2026-09-08
### Root-Cause Fix: Linux WebKitGTK WebRTC Permissions, Audio Device Handling & Voice Channel Join Flow
- **Linux WebKitGTK WebRTC & Microphone Permission Handler (`src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`)**:
  - Identified root cause of voice channels and calls doing nothing on Linux: In Tauri applications on Linux (`webkit2gtk`), the engine does not provide a default native GUI dialog for `getUserMedia` permission requests and defaults to denying all media requests with `NotAllowedError`.
  - Added Linux target dependency `webkit2gtk = { version = "2.0", default-features = false, features = ["v2_40"] }` to `src-tauri/Cargo.toml`.
  - In `src-tauri/src/lib.rs`, registered a custom `connect_permission_request` signal handler on the `webkit2gtk::WebView` to automatically allow media stream / microphone permission requests.
  - Enabled WebKit WebRTC settings (`settings.set_enable_webrtc(true)`, `settings.set_enable_media_stream(true)`, `settings.set_enable_mediasource(true)`) for Linux webviews.
- **VoicePanel Auto-Join & Connection State Deadlock Fix (`src/components/VoicePanel.tsx`)**:
  - Discovered a critical UI bug where `const isConnectingToThisChannel = !isConnectedToThisChannel;` caused `isConnectingToThisChannel` to be permanently `true` whenever the user was disconnected.
  - This prevented the initial auto-join from running (`!isConnectingToThisChannel` evaluated to `false`) and rendered the Preview/Join gateway completely unreachable, leaving the UI stuck on "Establishing media session..." indefinitely when permission or connection failed.
  - Corrected `isConnectingToThisChannel` to only be `true` when actively joining (`isAttemptingJoin || activeRoom.roomId === channel.id && (connectionState === 'connecting' || connectionState === 'joining')`).
  - Added interactive error banner in the preview screen with "Grant Permission & Retry" and "Join Listen-Only" fallback actions.
- **Microphone Probe Stream Caching & Graceful Listen-Only Fallback (`src/utils/permissions.ts`, `src/media/RealtimeMediaProvider.ts`, `src/context/MediaContext.tsx`, `src/components/DMCallOverlay.tsx`)**:
  - Implemented `consumeProbedAudioStream()` so the audio stream opened during permission verification is retained and adopted directly by `RealtimeMediaProvider.enableMicrophone()` instead of immediately stopping and opening hardware a second time.
  - Added detection and clear error messages for `NotFoundError` / `DevicesNotFoundError` when no audio input device is connected on Linux.
  - Added `{ listenOnly: true }` support in `MediaContext.joinVoiceRoom` so users can join voice channels in listen-only mode if their system microphone is unavailable or denied.
  - Hardened `acceptCall` and DM call session initialization to handle microphone permission gracefully and clear broken state if connection fails.
### Root-Cause Fix: In-App Updates Without Browser Redirection & Accurate Version Discovery
- **Completely Eliminated Browser Redirection on Update (`src/services/downloadManager.ts`, `src/services/updateService.ts`, `src/components/DownloadsTabContent.tsx`)**:
  - Identified root cause of unwanted browser launch on app startup: When an update download failed (e.g., non-existent URL or network error), `DownloadManager.fallbackDirectBrowserDownload` and `openFile` triggered `window.open` / `<a target="_blank">` navigation to the URL, sending the user to a 404 page in an external browser.
  - Added strict guards (`item.attachmentId?.startsWith('app_update_')`) preventing `DownloadManager`, `fallbackDirectBrowserDownload`, `openFile`, and `openContainingFolder` from ever calling `window.open` or triggering direct browser navigation for internal updates.
  - Update failures now cleanly update state within the application (`status: 'error'`, `status: 'failed'`), keeping all error handling, retry prompts, and notifications 100% inside the app UI without any external browser interaction.
- **Accurate Repository Manifest Version Resolution (`src/services/updateService.ts`)**:
  - Resolved root cause of false update detection: Previously, the regex in `checkGitHubReposAndVersions` extracted `4.0` from repo name `Sirverchats-4.0` even though the repo's authoritative `versions` and `versions.json` files specified `1.0`.
  - Prioritized explicit `versions`, `versions.json`, and `version.txt` manifest files inside the repository over repository titles. If a repository defines an explicit version manifest, the versions inside that file are authoritative.
  - Added support for `versions.json` schemas (`versions` array, `current_version`, `version`).
- **Verified Download URL Resolution & 404 Prevention (`src/services/updateService.ts`)**:
  - Replaced hardcoded `archive/refs/tags/v${ver}.zip` URLs with `resolveDownloadUrlForVersion(owner, repo, version, platform)`.
  - Searches GitHub Releases for compiled platform binaries (`.exe`/`.msi` for Windows, `.apk` for Android, `.AppImage`/`.deb` for Linux).
  - Probes existence of release tag archives or default branch archives with HEAD verification before assigning download URLs.
  - If no downloadable release package is published yet, the update state remains safely in `'available'` without initiating auto-downloads or broken 404 links.

## [4.60.66] - 2026-09-08
### Root-Cause Fix: Windows Cross-Platform Native Binaries & Android Gradle Wrapper Entry Point
- **Windows Native Toolchain Resolution (`package.json`, `.github/workflows/build-windows.yml`, `build-windows.ps1`, `build-windows.bat`)**:
  - Identified root cause of `Cannot find module '../lightningcss.win32-x64-msvc.node'` and `@rollup/rollup-win32-x64-msvc`: A Linux-generated `package-lock.json` checked into Git restricts npm on Windows runners from installing Windows native platform binaries.
  - Added full Windows native prebuilts to `optionalDependencies` in `package.json`: `lightningcss-win32-x64-msvc`, `@rollup/rollup-win32-x64-msvc`, `@tailwindcss/oxide-win32-x64-msvc`, and `@esbuild/win32-x64`.
  - In `.github/workflows/build-windows.yml`, `build-windows.ps1`, and `build-windows.bat`, added logic to remove the Linux-generated `package-lock.json` prior to `npm install` on Windows runners, forcing fresh native platform dependency resolution, followed by explicit installation of all 4 native packages.
- **Android Official Gradle Wrapper Checksum Fix (`android/gradle/wrapper/gradle-wrapper.jar`, `src-tauri/gen/android/gradle/wrapper/gradle-wrapper.jar`, `.github/workflows/build-android.yml`)**:
  - Replaced all wrapper jars in the workspace (`android/...` and `src-tauri/gen/...`) with the official Gradle v8.14.3 release binary directly matching the official Gradle registry SHA-256 (`7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172`).
  - This guarantees `gradle/actions/setup-gradle@v4` checksum validation passes cleanly on CI without flagging unknown or modified JAR files.

## [4.60.65] - 2026-09-08
### Fix Windows Rollup Native Binary Error & Android Gradle Wrapper Jar Corruption
- **Windows Rollup Optional Dependency Fix (`package.json`, `.github/workflows/build-windows.yml`, `build-windows.ps1`, `build-windows.bat`)**:
  - Resolved `Cannot find module @rollup/rollup-win32-x64-msvc (npm issue #4828)` during `npm run build` (`vite build`) on Windows.
  - Added `@rollup/rollup-win32-x64-msvc` to `optionalDependencies` in `package.json`.
  - Added explicit installation fallback (`npm install --no-save @rollup/rollup-win32-x64-msvc`) to `.github/workflows/build-windows.yml`, `build-windows.ps1`, and `build-windows.bat` to ensure native Windows compilation succeeds even if npm skips optional dependencies during lockfile evaluation.
- **Android Gradle Wrapper Repair & Gitattributes (`android/gradle/wrapper/gradle-wrapper.jar`, `.gitattributes`, `.github/workflows/build-android.yml`)**:
  - Fixed `Error: Invalid or corrupt jarfile ... gradle-wrapper.jar` during `./gradlew assembleDebug`.
  - Replaced corrupted `android/gradle/wrapper/gradle-wrapper.jar` with a clean, fully verified Gradle 8.14.3 wrapper binary.
  - Created root `.gitattributes` file declaring `*.jar binary` (along with `.aar`, `.so`, images, and executables) to prevent Git CRLF line-ending corruption during checkout and commits.
  - Integrated `gradle/actions/setup-gradle@v4` with explicit `gradle-version: '8.14.3'` in `.github/workflows/build-android.yml`.
  - Added self-healing wrapper integrity check (`unzip -t`) with automatic regeneration (`gradle wrapper --gradle-version 8.14.3`) in the Android CI pipeline.

## [4.60.64] - 2026-09-08
### Fix CI/CD Workflows: Node 24 Action Runner Migration, Android Java Imports & Windows Tauri Bundler
- **GitHub Actions Workflows Upgrade (`.github/workflows/build-android.yml`, `.github/workflows/build-windows.yml`, `.github/workflows/build-linux.yml`)**:
  - Upgraded action versions to their native Node 24 runtimes: `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@v6`, and `softprops/action-gh-release@v3`.
  - Removed deprecated `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` and `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` environment flags that caused GitHub runner deprecation warnings and unhandled action crashes under Node 24.
- **Android Compilation Fix (`android/app/src/main/java/com/sirverdata/chat/MainActivity.java`)**:
  - Added missing `import com.getcapacitor.BridgeActivity;` and `import android.webkit.WebView;` to `MainActivity.java` to resolve `cannot find symbol` compiler errors in Gradle `./gradlew assembleDebug`.
- **Windows Desktop Bundle Compatibility (`src-tauri/tauri.conf.json`, `.github/workflows/build-windows.yml`)**:
  - Normalized `bundle.targets` in `tauri.conf.json` to `"all"` so platform-specific packagers (NSIS on Windows, DEB/AppImage on Linux) build without cross-platform target collision errors.
  - Streamlined `npx tauri build --ci` and `--no-sign` execution flags in the Windows GitHub Actions workflow.
### Automatic Rollback & Safe Fallback for Deleted / Faulty Releases
- **Faulty Version Deletion & Auto-Rollback Engine (`src/services/updateService.ts`)**:
  - Implemented automatic rollback detection in `checkGitHubReposAndVersions`.
  - If the currently running application version is no longer found on GitHub (and is higher than the available releases on GitHub), the app detects that the release was intentionally retracted or deleted by the developer.
  - Aggregates all verified releases across all repos matching the prefix and manifests, sorts them by semantic version, and automatically targets the **highest available verified release before it**.
  - Sets `isRollback: true` and flags the rollback as mandatory so clients safely downgrade without manual intervention or corrupt data.
- **Rollback UI States (`src/App.tsx`, `src/components/UpdatesTabContent.tsx`)**:
  - Added dedicated amber alert banner and rollback modal stating: *"Safe Version Rollback: Current version deleted from GitHub — rolling back to last stable"*.
  - Added visual rollback explanation and instructions in the Updates settings panel.

## [4.60.62] - 2026-09-07
### Automatic Repo-Name Version Detection for Single-Step Pushes
- **Zero-Extra-Files Push-to-Update (`src/services/updateService.ts`)**:
  - Enhanced `checkGitHubReposAndVersions` so simply pushing a new repo (e.g. `sirverchats-1.0`) is **100% sufficient on its own** without creating any extra files.
  - Automatically extracts semantic version numbers directly from the repository name pattern (e.g. `sirverchats-1.0` $\rightarrow$ `v1.0`, `sirverchats-0.2` $\rightarrow$ `v0.2`).
  - Seamlessly falls back to `versions`, `versions.txt`, or `updates/latest.json` if present.
  - Compares the extracted version against the running app (`v0.3.8`) and triggers the in-place update notification immediately.

## [4.60.61] - 2026-09-07
### GitHub Multi-Repo Double-Check & Simple 'versions' File Support
- **Dual-Phase GitHub Repo & 'versions' Manifest Detection (`src/services/updateService.ts`)**:
  - Implemented `checkGitHubReposAndVersions(owner, prefix)` to support checking across versioned repositories (e.g. `sirverchats`, `sirverchats-0.1`, `sirverchats-0.2`).
  - Added support for reading a simple, plain text file named `versions` with one version per line (e.g. `0.0.1`, `0.0.2`, `0.1.0`), finding the highest version number and comparing it against the local app version.
  - Automatically fetches matching public repositories from GitHub and scans candidate manifests (`versions`, `versions.txt`, `version.txt`).
- **User Update Preferences (`src/lib/userSettings.ts`, `src/components/UpdatesTabContent.tsx`, `src/App.tsx`)**:
  - Added `githubOwner` (defaults to `Simlfe`) and `repoPrefix` (defaults to `sirverchats`) fields to user update settings.
  - Added configuration cards in the Updates settings tab with clear visual examples and live editing.
  - Updated floating in-place update notification banner to display the exact detected source repository.

## [4.60.60] - 2026-09-07
### In-Place Internal Auto-Updater: Zero Setup Re-Installation & Background Stream Delivery
- **Native In-Place Desktop Auto-Updater (`src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `updates/latest.json`)**:
  - Configured `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` with `createUpdaterArtifacts: true`.
  - Registered Tauri plugins (`tauri_plugin_updater` and `tauri_plugin_process`) and declared permissions in `capabilities/default.json` (`updater:default`, `updater:allow-check`, `updater:allow-download-and-install`, `process:default`, `process:allow-restart`).
  - Added repository updater manifest `updates/latest.json` for multi-platform delivery without manual installers.
- **In-Place Internal Update Engine (`src/services/updateService.ts`)**:
  - Implemented dynamic, guarded access to native Tauri updater APIs for desktop and fallback channel synchronization.
  - Automatically queries update endpoints for new versions; streams updates directly in the background with progress reporting (content length, chunks, percentages).
  - Uses `downloadAndInstall()` to replace application binaries in-place inside the application directory without running any setup `.exe`, `.msi`, `.msix`, or installer wizards.
  - Implemented seamless 1-click `relaunch()` via `@tauri-apps/plugin-process`, immediately restarting the application with the new version.
- **Modernized Updates UI (`src/components/UpdatesTabContent.tsx`, `src/App.tsx`)**:
  - Removed manual `.msi` download prompts and installer execution handlers.
  - Added dedicated "Continuous In-Place Auto-Updater (Zero Re-installation)" status card displaying real-time stream progress, version info, and release notes.
  - Added global non-intrusive floating toast notification in `src/App.tsx` when an internal update is ready to restart, allowing 1-click seamless restarts from any screen.

## [4.60.59] - 2026-09-07
### Automated Build Tooling: 1-Click Windows BAT Files for All Platforms & Arch Linux x86_64 Calling Verification
- **Automated Batch Files for Windows (`build-android.bat`, `build-windows.bat`, `build-linux.bat`, `build-arch.bat`)**:
  - `build-android.bat`: Verifies Node.js and Java JDK 17+, builds production web bundle, synchronizes Capacitor assets (`npx cap sync android`), and invokes `android\gradlew.bat assembleDebug` to produce `app-debug.apk`.
  - `build-windows.bat`: Checks Rust MSVC and Node.js, compiles Tauri desktop app, and packages NSIS `.exe` installer and WiX `.msi` in `src-tauri\target\release\bundle\`.
  - `build-linux.bat`: Detects WSL (Windows Subsystem for Linux) and runs `build-linux.sh` directly, or gives 1-command Docker/GitHub Actions build instructions.
  - `build-arch.bat`: Automatically targets Arch Linux (x86_64) via WSL Arch, Docker, or `makepkg -si`, packaging `.pkg.tar.zst` and native binaries.
- **Arch Linux (x86_64) Microphone & Video Calling Audit (`arch/PKGBUILD`, `arch/build-arch.sh`, `src-tauri/tauri.conf.json`, `src/utils/permissions.ts`, `src/media/RealtimeMediaProvider.ts`)**:
  - Explicitly registered GStreamer multimedia and WebRTC pipeline dependencies in `arch/PKGBUILD`: `gst-plugins-base`, `gst-plugins-good` (v4l2 webcam and pulse audio), `gst-plugins-bad` (WebRTC SRTP/DTLS negotiation in WebKitGTK), `gst-libav`, `gst-plugin-pipewire`, and optional dependencies `pipewire-pulse`, `wireplumber`, and `v4l-utils`.
  - Enabled `bundleMediaFramework: true` in `src-tauri/tauri.conf.json` for Linux AppImage packaging.
  - Fixed WebKitGTK permission handling in `src/utils/permissions.ts` by bypassing premature Permission API `'denied'` statuses so WebKit2GTK prompts for microphone access properly.
  - Added universal `{ video: true }` constraint fallback in `RealtimeMediaProvider.ts` to ensure desktop Linux webcams without mobile `facingMode` constraints acquire streams successfully.
  - Published comprehensive multi-platform guide in `DEPLOY_CROSS_PLATFORM.md`.

## [4.60.58] - 2026-09-07
### Deployment & Distribution: Multi-Platform Compilation (Windows, Linux Arch, Android) & CI/CD Pipelines
- **Arch Linux & Linux Native Packaging (`arch/PKGBUILD`, `arch/sirverdata.desktop`, `arch/build-arch.sh`, `build-linux.sh`, `.github/workflows/build-linux.yml`)**:
  - Authored standard Arch Linux `PKGBUILD` and FreeDesktop `.desktop` launcher entry for packaging via `makepkg -si` into pacman packages (`.pkg.tar.zst`).
  - Added GitHub Actions workflow for Linux desktop builds compiling AppImage, Debian `.deb`, and standalone ELF binaries.
  - Added Linux bundle configurations in `src-tauri/tauri.conf.json` with required system dependencies (`webkit2gtk-4.1`, `libappindicator3-1`, `librsvg2-2`).
- **Android APK Build Automation (`.github/workflows/build-android.yml`, `build-android.sh`, `package.json`)**:
  - Configured automated GitHub Actions workflow compiling Android debug and release APKs via Gradle and Capacitor.
  - Added local one-click build script `build-android.sh` and NPM scripts (`npm run build:android:apk`, `npm run build:android:release`).
- **Windows Desktop Build Automation (`.github/workflows/build-windows.yml`, `build-windows.bat`, `build-windows.ps1`, `DEPLOY_WINDOWS.md`)**:
  - Configured automated CI/CD pipeline targeting `windows-latest` with Rust MSVC toolchain, Node.js 20, and `tauri-apps/tauri-action`.
  - Added non-admin `currentUser` NSIS `.exe` installer and WiX `.msi` packaging.
  - Authored unified multi-platform guide (`DEPLOY_CROSS_PLATFORM.md`).
### Direct Calling Audit: Signaling Reliability, Audio Autoplay Unlocking & Multi-Tab Synchronization
- **Browser Autoplay Audio Policy Resolution (`src/lib/sounds.ts`)**:
  - Implemented automatic WebAudio `AudioContext` unlocking on user gesture events (`click`, `touchstart`, `keydown`).
  - Added explicit `unlockAudioContext` export triggered on outgoing invite dispatch and incoming call acceptance to guarantee ringtone and join sound playback.
- **Cross-Tab Call Synchronization & Race Condition Elimination (`src/services/callSignaling.ts`)**:
  - Integrated `BroadcastChannel('sirver_call_signaling')` and `localStorage` storage-event fallback for real-time signaling event synchronization across multiple browser tabs.
  - Ensured answering or declining a call in one tab immediately stops ringing and updates the call state across all other open tabs.
  - Added `fallbackEvent` parameter to `acceptCall`, `declineCall`, `cancelCall`, and `endCall` to prevent missing caller data during microtask transitions.
- **MediaContext & Component Cleanup (`src/context/MediaContext.tsx`, `src/App.tsx`)**:
  - Converted signaling subscription in `MediaContext` to stable ref-based state tracking (`outgoingCallRef`, `incomingCallRef`, `activeRoomRef`, `currentUserRef`), eliminating repeated listener re-subscriptions.
  - Removed duplicate `FloatingCallWindow` instance in `src/App.tsx`, preventing dual audio playback and conflicting button event handlers.
  - Enhanced `call_accept` flow so the caller connects immediately and deterministically to the WebRTC media session once answered.
### Build & Type Resolution: Type Import Alignment & State Cleanup
- **Type Import Alignment (`src/App.tsx`)**:
  - Added missing `Call` interface import from `./types` for active call instances.
- **State Cleanup & Linter Verification (`src/App.tsx`)**:
  - Removed obsolete `setMountedChannelsMap` references in channel navigation and deletion handlers, aligning with strict conditional active panel mounting.
  - Verified full TypeScript compilation and zero-warning linter pass.

## [4.60.54] - 2026-08-22
### Performance & Feature Fix: On-Demand Media Buffering, Live GIF Playback Synchronization & Settings Optimization
- **On-Demand "Buffer on Click" Architecture for Media (`src/components/MusicPlayer.tsx`, `src/components/SmartVideoLinkPreview.tsx`, `src/components/ChatPanel.tsx`)**:
  - Implemented deferred media stream loading across all video and audio players (`SmartVideoPlayer`, `AudioAttachmentPlayer`, `MultiAudioAttachmentPlayer`, and `GlobalMusicPlayer`).
  - Media elements start in an unactivated preview state without mounting or downloading heavy streamable files until the user explicitly clicks play (`preload="none"`, `src` unassigned until interaction).
  - On user play, the stream attaches with `preload="auto"`, starts buffering, and presents responsive visual buffering feedback (spinning loaders and status messaging).
  - Added buffered range tracking (`bufferedPct`) and two-tone progress gradients on scrubbers, enabling faster seeking and visualizing loaded portions.
  - Video link previews in chat now display an interactive preview card first without opening network connections to media files until clicked.
- **Immediate GIF Animation Playback Control (`src/lib/userSettings.ts`, `src/components/SmartGifImage.tsx`, `src/components/GifImage.tsx`, `src/components/Avatar.tsx`, `src/components/UploadedImagePreview.tsx`)**:
  - Wired `gif-playback-setting-changed` custom event dispatch directly on setting selection in Settings Modal.
  - Connected `SmartGifImage`, `GifImage`, `Avatar`, and `UploadedImagePreview` components to listen to this event and immediately synchronize their active playback mode (`always`, `hover`, or `never`) without requiring a page reload.
  - Stored state in `dataset.gifPlayback` on document root for immediate CSS-level control.
- **Settings Modal & Theme Performance Optimization (`src/components/SettingsModal.tsx`)**:
  - Memoized theme list filtering via `useMemo` on category and search query changes.
  - Added `loading="lazy"` and `decoding="async"` to theme preview art thumbnails to eliminate opening delays.
### Performance & Bug Fix: Ultra-Fast Older Chunk Loading, Zero-Jump Scroll Anchoring & Strict Message Deduplication
- **Sub-Millisecond Older Messages Pagination (`src/pocketbase.ts`, `src/App.tsx`)**:
  - Replaced complex nested OR filter conditions in `fetchMessages` with streamlined, direct B-tree indexed range queries (`created < "${formattedBefore}"`), eliminating 30-second query slowdowns and full table scans.
  - Increased pagination chunk batch size to 25 items per request to reduce network roundtrips and ensure smooth scrolling history.
- **Zero-Jump Scroll Anchoring (`src/components/ChatPanel.tsx`, `src/index.css`)**:
  - Upgraded scroll restoration inside `useLayoutEffect` to anchor directly to the topmost visible message element ID (`anchorMsgId`) offset, guaranteeing mathematically exact scroll positions during prepend.
  - Removed disruptive `content-visibility: auto` and `contain-intrinsic-size` from message rows which were causing height miscalculations and viewport jumps during scroll-up.
  - Calibrated proactive lookahead threshold (`Math.min(500, Math.max(300, clientHeight * 0.7))`) to prevent premature or redundant fetch cycles.
- **Strict Multi-Layer Message Deduplication (`src/lib/messageDiff.ts`, `src/components/ChatPanel.tsx`)**:
  - Enhanced `mergeMessageListPreservingReferences` with ID and `temp_id` deduplication filters while preserving exact object references to avoid unneeded React re-renders.
  - Hardened `sortedMessages` in `ChatPanel.tsx` with duplicate tracking for both real server IDs and optimistic `temp_id` keys, preventing duplicate message renders when scrolling.

## [4.60.52] - 2026-08-21
### UI/UX: Native Chat Loading Skeleton & Smooth Gliding Mode Switcher Pill
- **Redesigned Chat Loading Skeleton (`src/components/ChatPanel.tsx`)**:
  - Replaced generic circular skeleton placeholders with authentic Sirver layout structures.
  - Implemented branded squircle (`rounded-xl`) avatar placeholders matching user profiles and member cards.
  - Added full message author header rows (username bar, role/tag badge, monospace timestamp), realistic multiline text streams, consecutive message gutters without repeating avatars, reply branches with corner indicators, and media card placeholders.
  - Integrated theme-aware date divider lines and subtle Avocado Green loader pill.
- **Fluid Sliding Navigation Pill (`src/components/ChannelList.tsx`)**:
  - Upgraded the Channels vs DMs mode switcher using Framer Motion's shared `layoutId="activeSidebarTabPill"`.
  - The highlight pill now glides smoothly left and right between Channels and DMs tabs with spring physics (`stiffness: 500, damping: 38`), supporting both LTR and RTL orientations seamlessly.

## [4.60.51] - 2026-08-21
### Performance: Staged 10-Message Instant Ingestion & Proactive Lookahead Pagination
- **Cache-First 10-Message Instant First Paint (`src/App.tsx`)**:
  - When a channel is opened or selected, instantly loads the last 10 messages from memory L1 / IndexedDB cache for a 0ms instant first render.
  - If not found in cache, fetches the latest 10 messages from PocketBase/server.
- **Silent Non-Blocking Background Staging (`src/App.tsx`)**:
  - Automatically and smoothly stages the next 10 older messages in the background after 450-500ms when idle, prepending them into the cache and chat list with zero layout shift (CLS = 0) and without resizing the chat feed.
- **Proactive Lookahead Older Message Loading (`src/components/ChatPanel.tsx`, `src/App.tsx`)**:
  - Upgraded scroll lookahead threshold (`Math.max(900, clientHeight * 1.6)`), pre-fetching older messages seamlessly well before the user reaches the top of the viewport.
  - If user starts scrolling immediately, cancels pending background idle timers and proceeds with smooth on-demand pagination, prioritizing cache hits before network fetches.

## [4.60.50] - 2026-08-21
### Performance: Deep Chat Rendering Audit, Zero-CLS Stability & Main Thread Unblocking
- **Eliminated Scroll Layout Thrashing & DOM Reflows (`src/components/ChatPanel.tsx`)**:
  - Removed synchronous `el.offsetHeight` DOM measurements inside inline message ref callbacks that were forcing multiple synchronous layout reflow passes during React renders.
  - Eliminated continuous full-feed DOM query anchor scans (`getLiveViewportAnchor`) inside the high-speed scrolling animation frame.
  - Streamlined pagination threshold check with constant-time evaluation to guarantee 60fps / 120fps smooth scrolling.
- **Non-Blocking Background Media Preloading (`src/components/ChatPanel.tsx`)**:
  - Wrapped proactive image, attachment, and external URL preloading in `window.requestIdleCallback` (with asynchronous microtask fallback), preventing network fetch and canvas decoding from competing with user typing, gestures, or chat transitions.
- **Zero Layout Shift (CLS = 0) & Layout Containment (`src/index.css`, `src/components/ChatPanel.tsx`)**:
  - Applied `.chat-scroll-container` with strict `overflow-anchor: auto !important;`, `scroll-behavior: auto;`, and `contain: layout paint;`.
  - Added `.chat-message-row` with `contain: layout style;` and `content-visibility: auto; contain-intrinsic-size: 0 48px;` ensuring off-screen messages do not waste CPU cycles during large channel loads.
  - Hardware-accelerated GPU transitions for sidebar drawers, mode switches, menu navigation, and theme changes (`gpu-layer`, `transform: translate3d(0, 0, 0)`).

- **Avatar Processor Optimization Safeguard (`src/services/avatarProcessor.ts`)**:
  - Removed obsolete on-load profile mutation attempting to submit non-existent schema fields (`avatar_processed`, `avatar_original`) to PocketBase, resolving `Failed to process and optimize avatar on load: Failed to load the submitted data due to invalid formatting`.
  - Image optimization is seamlessly handled during profile and server upload flows in modal settings components.
- **Call Signaling Payload Parsing Resiliency (`src/services/callSignaling.ts`, `src/App.tsx`)**:
  - Implemented safe nested JSON extraction and balanced delimiter parsing in `handleIncomingCallPayload`, preventing `Expected property name or '}' in JSON` syntax warnings on non-JSON notifications and malformed message strings.
  - Refined unread notification signal filtering in `App.tsx` to strictly target active `INCOMING_CALL:` and `CALL_SIGNAL:` patterns rather than arbitrary call log IDs.

## [4.60.48] - 2026-08-21
### Fix: Cross-Component Render State Warning & PocketBase Private Chat Server Query Resilience
- **React Render-Cycle Safe State Dispatching (`src/context/MediaContext.tsx`)**:
  - Wrapped `pbService.authStore.onChange`, `realtimeMediaProvider.subscribe`, and `callSignalingService.subscribe` state updates in `queueMicrotask` to eliminate the React error: `"Cannot update a component (MediaProvider) while rendering a different component (App)"`.
- **Private Chat Server Query Resilience (`src/pocketbase.ts`)**:
  - Rewrote `getUserPrivateChatServers` and `getOrCreatePrivateChatServer` to use resilient multi-tier fallback querying (`users ~ id` -> `user1/user2` column queries -> `private_chat_members` parallel queries) preventing PocketBase 400 bad request filter evaluation failures and eliminating repeated console warnings.

## [4.60.47] - 2026-08-18
### Fix: Hide Chromecast Icon for Videos & Eliminate Link Preview Freeze
- **Hide Chromecast & Remote Playback Controls (`src/index.css`, `src/components/video/VideoPlayer.tsx`, `src/components/MusicPlayer.tsx`)**:
  - Added global CSS rules targeting `-webkit-media-controls-cast-button`, `-webkit-media-controls-remote-playback-button`, `-webkit-media-controls-overlay-cast-button`, and `-internal-media-controls-cast-button` to completely eliminate the Chrome Cast icon across all video and audio players.
  - Added `disableRemotePlayback={true}` to all HTML5 `<video>` and `<audio>` elements (`SmartVideoPlayer`, `VideoPlayer`, `AudioAttachmentPlayer`, `GlobalMusicPlayer`).
- **Eliminated UI Freeze on Link Previews (`src/components/SmartVideoLinkPreview.tsx`, `src/components/MusicPlayer.tsx`, `src/components/SmartWebLinkPreview.tsx`, `src/components/SocialEmbeds.tsx`, `src/components/ChatPanel.tsx`)**:
  - **YouTube Preview (`SmartYouTubePlayer`)**: Defaulted thumbnail source to `hqdefault.jpg` directly, eliminating cascading 404 image errors and synchronous state reset cycles. Added `loading="lazy"` and `decoding="async"`.
  - **Smart Video Link Preview (`SmartVideoLinkPreview`)**: Deferred canvas poster generation to background `requestIdleCallback` / non-blocking timeout, preventing heavy video element creation from locking the main UI thread during message rendering.
  - **Component Memoization & Async Loading**: Wrapped `SmartYouTubePlayer`, `SmartVideoLinkPreview`, `SmartWebLinkPreview`, `SmartInstagramEmbed`, `SmartTikTokEmbed`, `SmartFacebookEmbed`, `SmartRedditEmbed`, and `MessageLinkPreviewCard` in `React.memo` to eliminate unnecessary re-renders during typing and scrolling.
  - **Chat Render Loop Optimization (`ChatPanel.tsx`)**: Removed synchronous API calls from inside message render passes.

## [4.60.46] - 2026-08-18
### Feature: Progressive Buffered Video Streaming with Smooth Back-and-Forth Seeking
- **Progressive Stream Buffering (`src/components/MusicPlayer.tsx`, `src/components/ChatPanel.tsx`)**:
  - Replaced blocking full-file downloads with progressive HTTP 206 chunked range buffering via `preload="metadata"` and smart stream fetching in `SmartVideoPlayer`.
  - Videos start playback immediately upon loading initial metadata and header frames without waiting hours to download large files.
- **Visual Buffer Track & Real-Time Buffered Ranges (`src/components/MusicPlayer.tsx`)**:
  - Implemented real-time `video.buffered` inspection calculating all cached chunks and rendering a visual buffered progress bar overlaid behind the seekbar (showing exactly how much video has been buffered ahead).
  - Added live buffering indicator overlay with smooth fade transitions during chunk fetching or connection stalls.
- **Smooth Back-and-Forth Seeking & Scrubbing Controls (`src/components/MusicPlayer.tsx`)**:
  - Added dedicated quick-jump navigation buttons: **-5s** (rewind 5 seconds) and **+5s** (fast-forward 5 seconds) with animated directional ripple feedback.
  - Added double-click / double-tap support on left and right sides of the video for rapid ±5s seeking.
  - Implemented precision scrub track with hover timestamp tooltip for seamless frame scrubbing across the entire duration.
- **Enhanced Player Controls & Playback Speed (`src/components/MusicPlayer.tsx`)**:
  - Added playback speed selector (`0.5x`, `0.75x`, `1x`, `1.25x`, `1.5x`, `2x`), volume slider with mute toggle, Picture-in-Picture (PiP), and native fullscreen toggle.
  - Controls auto-hide after 2.5 seconds of inactivity during playback and re-appear on hover or mouse movement.
- **Lightbox Video Integration (`src/components/ChatPanel.tsx`)**:
  - Replaced the basic lightbox `<video>` element with the progressive buffered `SmartVideoPlayer` across image/video attachment modals.

## [4.60.45] - 2026-08-18
### Fix: Chat Scroll Jumping & Jitter on Input/Size Adjustments & Media Loading
- **Native CSS Scroll Anchoring (`src/components/ChatPanel.tsx`)**:
  - Enabled browser-native `overflowAnchor: "auto"` on the primary message feed container and added a zero-height scroll bottom anchor element, ensuring visible messages stay rock-solid in place when messages or media load above or inside the viewport.
- **Stabilized Container Resize Handling (`src/components/ChatPanel.tsx`)**:
  - Refactored `ResizeObserver` to avoid continuous height-change scroll recalculation loops during textarea multi-line auto-expansion, reply banner toggles, or attachments tray updates.
  - Pinned users at the bottom stay anchored smoothly while users reading earlier messages experience zero layout shifts or bouncing when chat sizes adjust.
- **Eliminated Media Load Scroll Jumps (`src/components/ChatPanel.tsx`)**:
  - Prevented image and attachment `onLoad` triggers from forcibly overwriting `scrollTop` during active browsing, eliminating the bouncing behavior when channels with multiple media items load.
- **Optimized Layout Effects (`src/components/ChatPanel.tsx`)**:
  - Prevented `useLayoutEffect` from resetting scroll positions on reactive state updates, guaranteeing stable message rendering.

## [4.60.44] - 2026-08-18
### Polish: Clean Dividing Borders & Header Borders on Server & Channels List Panel
- **Matching Sidebar Borders (`src/App.tsx`, `src/components/ChannelList.tsx`)**:
  - Added crisp separating dividing border (`${lang === 'ar' ? 'border-l' : 'border-r'} border-[var(--theme-border)]`) on both the mobile channels drawer and desktop channel list to match the border styling of the server members panel.
  - Added bottom header border (`border-b border-[var(--theme-border)]`) on the server switcher top bar in `ChannelList.tsx`, matching the `h-14` header bar of the server members list.

## [4.60.43] - 2026-08-18
### Polish: Solid Opaque Menus & Side Panels for Mobile with Preserved Wallpaper Transparency
- **Mobile Side Panels & Drawers (`src/index.css`, `src/App.tsx`, `src/components/ChatPanel.tsx`)**:
  - Removed transparency effects from mobile sliding side panels (channel navigation drawer and member list drawer), ensuring their backgrounds and nested components are 100% solid and opaque (`var(--theme-bg-secondary)`).
  - Eliminated backdrop text bleed-through where messages and buttons from the underlying chat would show through sliding drawers.
- **Mobile Menus, Popovers, Dropdowns & Modals (`src/index.css`, `src/components/NotificationsPopover.tsx`, `src/components/PinnedMessagesPopover.tsx`)**:
  - Enforced solid, opaque surfaces across all popovers, context menus, select dropdowns, action sheets, and modal dialogs on mobile viewports.
- **Preserved Theme Background Wallpaper & Chat Translucency**:
  - Retained background image and wallpaper theme transparency for the primary chat stream and app background so theme wallpapers continue to show through and render faithfully behind text channel messages.

## [4.60.42] - 2026-08-18
### Fix: Mobile Side Panels Overlaying Top Channel Panel
- **Mobile Channels & Navigation Drawer (`src/App.tsx`)**:
  - Converted the mobile channels drawer backdrop and sliding panel to `fixed inset-0` and `fixed inset-y-0` with `z-[70]` so that opening the sidebar on mobile completely and smoothly overlays the entire viewport height from `top: 0` to `bottom: 0`, covering over the top channel banner and header controls.
  - Adjusted width to `w-[78vw] max-w-[320px]` for an optimal mobile reading and navigation experience.
- **Mobile Server Members List Drawer (`src/components/ChatPanel.tsx`)**:
  - Updated the mobile server members list backdrop and drawer panel to `fixed inset-0` and `fixed inset-y-0` with `z-[70]`, ensuring the member list slide-over spans full screen height over the top channel panel with its own integrated top header and search bar.

## [4.60.41] - 2026-08-18
### Fix & Polish: Call Log Card Formatting in Notifications List & Reliable Real-Time Ringing
- **Enhanced Notifications List Call Card UI (`src/components/NotificationsPopover.tsx`)**:
  - Replaced unformatted JSON and generic text notifications with rich, themed call log cards for all incoming/outgoing call statuses:
    - **Missed Call** (`missed`): Rose red badge, `PhoneMissed` / `VideoOff` icon, caller name, timestamp, and clear localized subtitle ("📹 Missed Video Call (No answer)" / "📞 Missed Voice Call (No answer)").
    - **Declined Call** (`declined`): Amber badge, `PhoneOff` icon, and status description ("Call was declined").
    - **Cancelled Call** (`cancelled`): Neutral badge, `PhoneOff` icon, and status description ("Call was cancelled").
    - **Ended / Connected Call** (`ended`): Accent green badge, `Phone` / `Video` icon, caller details, and exact formatted call duration ("Call ended • Duration: mm:ss").
  - Added avatar corner status badge indicating call type (`Phone` / `Video` / `PhoneMissed` / `PhoneOff`) alongside the user avatar.
  - Added direct message context tag ("Direct Message • Call Log") linking directly to the private DM conversation.
- **Persistent Ephemeral Signal Filtering (`src/components/NotificationsPopover.tsx`)**:
  - Filtered all ephemeral `INCOMING_CALL:` signaling strings from the notification list, ensuring ringing signals only drive the `FloatingCallWindow` ring overlay while historical call logs are cleanly stored and displayed.

## [4.60.40] - 2026-08-18
### Fix: Real-Time Incoming Call Ringing & Floating Window Mount
- **Mounted `FloatingCallWindow` in Main Application Tree (`src/App.tsx`)**:
  - Mounted `<FloatingCallWindow />` into `App.tsx` overlay layer, ensuring incoming call ringing cards, outgoing call screens, and active call overlays appear immediately on screen with full interactive controls (Answer, Reject, Mute Ringtone, Cam/Mic toggles).
- **Call Log & Signal Notification Formatting (`src/services/notificationService.ts`, `src/App.tsx`)**:
  - Formatted call log notifications with localized, human-friendly titles ("📞 Missed Voice Call" / "📹 Missed Video Call") and snippet descriptions, ensuring raw serialized JSON strings are never displayed in notifications or toasts.
  - Ensured incoming call signals (`INCOMING_CALL:`) bypass standard notification toasts and directly route to the real-time ringing interface in `FloatingCallWindow`.

## [4.60.39] - 2026-08-17
### Feature & Polish: Independent Font Customization, Anime/Gaming Theme Typography & Server Profile Isolation
- **Theme Defaults & Circular Dependency Resolution (`src/theme/themeDefaults.ts`, `src/theme/builtinThemes.ts`, `src/theme/extendedThemes.ts`)**:
  - Extracted `DEFAULT_LAYOUT_SETTINGS`, `AVAILABLE_FONTS`, `FontOption`, and `createThemeLayout` into a clean base `src/theme/themeDefaults.ts` module, completely resolving runtime circular dependency (`ReferenceError: Cannot access 'DEFAULT_LAYOUT_SETTINGS' before initialization`) during module bundling and evaluation.
- **Independent Font Family Selection (`src/components/SettingsModal.tsx`, `src/theme/builtinThemes.ts`, `src/index.css`)**:
  - Added dedicated Typography & Font Family controls in Appearance Settings allowing users to choose custom font families independently from active themes.
  - Implemented categorized font selection dropdown (Modern UI, Display / Sci-Fi, Friendly / Rounded, Serif / Elegant, Monospace / Code) with live dual-language English & Arabic specimen previews.
  - Added `Nunito` and `Cinzel Decorative` font weights to global typography styles and HTML Google Fonts preloads.
- **Anime & Gaming Theme Typography Integration (`src/theme/extendedThemes.ts`, `src/theme/builtinThemes.ts`)**:
  - Integrated dedicated `createThemeLayout` stacks across all extended anime and gaming themes (Demon Slayer, One Piece Gear 5, JJK Gojo, Bleach TYBW, Cyberpunk Matrix, Arcane Hextech, Vice City, Dark Souls, Elden Ring, Valorant Radiant).
- **Server Profile & Member Data Scoping (`src/pocketbase.ts`, `src/components/UserProfileModal.tsx`)**:
  - Strictly scoped local storage overrides (`server_avatar`, `server_banner`, `server_name`, `server_color`, `server_bio`) to the authenticated user (`isSelf` / `isCurrentAuthUser`), ensuring other users' profile cards and member list displays always accurately reflect backend server member records.
  - Ensured `UserProfileModal` loads cached server member data instantaneously and resets state cleanly when viewing non-server contexts.
- **Settings Modal Theme Contrast (`src/components/SettingsModal.tsx`)**:
  - Updated Settings Modal content and wrapper containers to `--theme-bg-primary`, creating clean contrast with the `--theme-bg-secondary` sidebar navigation.

## [4.60.38] - 2026-08-17
### Fix & Theme Consistency: Modal Token Alignment, Search Filter Styling & Auth Screen Polish
- **Advanced Search & Filter Theming (`src/components/AdvancedSearchModal.tsx`)**:
  - Replaced hardcoded slate background classes with universal semantic theme tokens (`bg-[var(--theme-bg-secondary)]`, `border-[var(--theme-border)]`, `text-[var(--theme-text-primary)]`).
  - Styled search inputs, filter pills, date pickers, dropdowns, and message result rows with proper theme variables for seamless dark and light mode rendering.
- **Server Settings & Modal Layout Consistency (`src/components/ServerSettingsModal.tsx`, `src/components/SettingsModal.tsx`)**:
  - Aligned background, borders, and sidebar navigation in `ServerSettingsModal` and `SettingsModal` with CSS theme variables (`--theme-bg-secondary`, `--theme-bg-primary`, `--theme-border`).
  - Harmonized active tab indicators, hover states, and close button highlights across all modal tabs.
- **Auth Screen Cleanliness (`src/components/AuthScreen.tsx`)**:
  - Cleaned up redundant ambient light accents and legacy server URL button from the login view for a crisp, focused authentication interface.

## [4.60.37] - 2026-08-17
### Fix & Polish: Real-Time Call Signaling Reliability, Action Toolbar Layout & Wallpaper Translucency Tuning
- **Bidirectional Call Signaling Synchronization (`src/services/callSignaling.ts`, `src/context/MediaContext.tsx`)**:
  - Implemented comprehensive `CALL_SIGNAL:` payload handling for `call_accept`, `call_decline`, `call_cancel`, `call_end`, and `call_busy` events via both active WebSockets and PocketBase notification fallback.
  - Added strict self-calling filters preventing callers from receiving incoming call triggers for their own outbound calls, and ensuring counterpart users receive immediate disconnect events upon call cancellation or termination.
  - Streamlined `MediaContext` call event handling to gracefully close media rooms and clean up participants when calls end or are rejected.
- **Message Action Toolbar Positioning (`src/components/ChatPanel.tsx`)**:
  - Repositioned the hover action toolbar (`-top-3 end-20 sm:end-28`) so quick reactions and context action buttons no longer overlap message timestamp indicators.
- **Wallpaper Opacity & Glass Translucency Balance (`src/theme/adminThemeService.ts`, `src/index.css`)**:
  - Balanced wallpaper opacity limits and background alpha layers across dark and light modes so custom and built-in backgrounds remain crisp while preserving text readability and panel contrast.

## [4.60.36] - 2026-08-17
### Fix & Refinement: Ephemeral Call Signaling Suppression & Floating Call Window State Integration
- **Incoming Call Floating Panel Routing (`src/services/callSignaling.ts`, `src/context/MediaContext.tsx`, `src/App.tsx`)**:
  - Replaced verbose JSON payload system notifications with direct routing to the interactive `FloatingCallWindow` overlay.
  - Subscribed `MediaContext` to `CallSignalingService` incoming call events with live PocketBase auth syncing, triggering the interactive floating card with **Answer**, **Reject**, and **Mute Ringtone** actions.
- **Ephemeral Notification Suppression & History Sanitization (`src/services/notificationService.ts`, `src/components/NotificationsPopover.tsx`, `src/App.tsx`)**:
  - Suppressed raw `INCOMING_CALL:` signaling objects from generating long native notification banners or system toasts.
  - Sanitized notification lists on login and realtime sync so ephemeral call signaling JSON strings are never saved to user notification history.
  - Formatted historic call log notifications in `NotificationsPopover` with clean, localized call type summaries and duration indicators instead of raw bracketed logs.

## [4.60.35] - 2026-08-17
### Fix & Performance: Call Log Text Sanitization, Universal DM Calling, Settings Preloading & Spacious UI Layout
- **Call Log Code Exposure Elimination (`src/services/callLogService.ts`, `src/components/ChatPanel.tsx`)**:
  - Rewrote `parseCallLog` with comprehensive regex patterns supporting standard bracket syntax, generic payload formatting, and incoming call signatures so raw serialized strings (`[CALL_LOG:...]`, `INCOMING_CALL:...`) never render as raw code or unformatted text.
  - Added `getCallLogSnippet` helper returning clean human-friendly localized descriptions ("📞 Voice Call Ended (0:15)", "📹 Missed Video Call") for chat previews, notifications, and search results.
  - Migrated call log card styling in `ChatPanel` to full theme tokens (`bg-[var(--theme-bg-card)]`, `border-[var(--theme-border)]`, `text-[var(--theme-text-primary)]`).
- **Universal Direct Call Flow & Floating Window Visibility (`src/App.tsx`, `src/components/FloatingCallWindow.tsx`)**:
  - Enhanced `handleStartCall` to comprehensively resolve target users across DM channels, `@username` chats, and private 1-on-1 servers.
  - Refined `FloatingCallWindow` animation transitions so incoming, outgoing, and connected call states crossfade cleanly with ultra-high z-index (`z-[99999]`) and direct pointer interaction.
- **Settings Modal Performance & Sizing Optimization (`src/App.tsx`, `src/components/SettingsModal.tsx`)**:
  - Proactively preloads `SettingsModal`, `GlobalThemeManagerTab`, and related chunks on app initialization for instantaneous opening on first click.
  - Enlarged the desktop Settings modal layout to `md:max-w-6xl lg:max-w-7xl xl:max-w-[1420px] md:h-[92vh] md:w-[95vw]` with increased padding (`p-6 md:p-8 space-y-8`) to prevent any cramped feeling.

## [4.60.34] - 2026-08-17
### Fix & Feature: Floating Call Window Experience, Direct Call Options & Notification Sanitization
- **In-Window Incoming Call Management (`src/components/FloatingCallWindow.tsx`, `src/services/callSignaling.ts`)**:
  - Replaced ambiguous generic notifications with a dedicated 3-button incoming call floating action card containing **Answer** (green, phone icon, starts call immediately), **Reject** (red, phone-off icon, cancels ring immediately), and **Mute Ringtone** (amber/neutral, bell-off icon, silences audio without declining).
  - Added `handleIncomingCallPayload` in `CallSignalingService` for instant handling of incoming calls across WebSockets and PocketBase notification events.
- **Background Call Session & Live Duration Counting (`src/components/FloatingCallWindow.tsx`, `src/context/MediaContext.tsx`, `src/App.tsx`)**:
  - Answering or starting a call no longer forces full-screen transitions; calls stay contained within the `FloatingCallWindow` while the user remains in their active text chat or channel.
  - Implemented 2-digit zero-padded live duration timer (`00:01`, `00:02`, ...) with live connected status indicator.
  - Added full default call controls directly in the floating window: **Mute Mic**, **Deafen Sound**, **Toggle Camera**, **Screen Share**, **Audio Mixer**, and **Disconnect / End Call**.
  - Added miniature participant avatar strip with active speaker green glowing borders (`isSpeaking`) and mute badges.
- **Notification Toast Sanitization (`src/App.tsx`, `src/services/notificationService.ts`)**:
  - Filtered raw JSON call events (`INCOMING_CALL:`, `call_*`) out of standard in-app text toasts to prevent "see there / View" generic message popups.
  - Formatted native desktop/mobile call notifications with clear titles and localized strings ("Incoming Call from [Name]").

## [4.60.33] - 2026-08-17
### Feature: Dual Image Slots per Theme, Persistence Overrides, Database Wallpaper Deletion & Login Screen Refinement
- **Dual Wallpaper Slot Architecture (`src/theme/adminThemeService.ts`, `src/components/SettingsModal.tsx`, `src/components/GlobalThemeManagerTab.tsx`)**:
  - Enhanced `ThemeDefinition` with `backgroundImage2` and `activeImageIndex` (0 or 1) allowing every theme to store 2 background images.
  - Implemented dual-slot controls in both the user Settings Modal (Appearance tab) and the Admin Theme Manager with slot selection tabs, individual upload/URL paste/preset pickers, thumbnail previews, active index toggle, and instant theme preview.
- **Theme Image Persistence Overrides (`src/theme/adminThemeService.ts`, `src/context/ThemeContext.tsx`)**:
  - Implemented `sirver_theme_image_overrides_v1` local storage synchronization ensuring custom user image selections for built-in and custom themes permanently persist across app restarts and never revert to older defaults.
  - Integrated live event dispatchers (`themes-updated`, `custom-wallpapers-updated`) to synchronize theme previews, theme cards, and background layers instantly without full reload.
- **Server Attachment & Custom Wallpaper Deletion (`src/pocketbase.ts`, `src/theme/adminThemeService.ts`)**:
  - Updated `deleteAttachmentRecord` with a `force: true` parameter for direct deletion of wallpaper attachments from the PocketBase database.
  - Added direct deletion buttons in the Wallpaper Presets Gallery allowing users and admins to remove unwanted custom wallpapers from both local presets and remote database records.
- **Login Screen Ambient Pulse Fix (`src/components/AuthScreen.tsx`)**:
  - Removed pulsing scale/opacity animation (`animate-pulse`) from the large ambient background circle in the authentication/login screen for a stable, clean presentation.

## [4.60.32] - 2026-08-17
### Feature: Custom Theme Wallpapers, Local Uploads, Image URL Ingestion & Server Attachments Persistence
- **Server Attachments Wallpaper Ingestion (`src/theme/adminThemeService.ts`, `src/pocketbase.ts`)**:
  - Implemented `uploadWallpaperFileToServer` and `saveWallpaperUrlToServer` to persist custom uploaded wallpaper files and fetched image URLs directly into the PocketBase `attachments` collection.
  - Linked attachment records with server URL resolution (`getAttachmentUrl`), custom metadata (`attachmentId`, `isCustom`, `uploadedAt`), and local persistence in `localStorage` (`sirver_custom_wallpapers_v1`).
- **High-Res Wallpaper Presets Library in Theme Manager & Settings Modal (`src/components/GlobalThemeManagerTab.tsx`, `src/components/SettingsModal.tsx`)**:
  - Added a full High-Res Wallpaper Presets Gallery and Server Attachments Manager in both `GlobalThemeManagerTab` and `SettingsModal` (Appearance tab).
  - Supported:
    - **Local File Upload**: One-click upload of any local image file with automatic upload to server attachments and addition to presets.
    - **Image URL Ingestion**: Pasting any image URL, saving to server attachments with CORS fallback, and immediate addition to presets.
    - **Gallery & Filtering**: Searchable and filterable gallery tabs (**All**, **Uploaded / Custom**, **Anime**, **Games**, **Action & Neon**, **Aesthetic**) with live preview, checkmark indicator for the active wallpaper, and deletion of custom items.
    - **Fine-Tuning Controls**: Real-time opacity sliders, blur sliders, and background fit modes (Cover, Contain, Repeat, Center).

## [4.60.31] - 2026-08-17
### Fix: Theme Wallpaper Artwork Visibility Behind Solid Color Backgrounds
- **Dynamic Background Transparency & Frosted Glass Layering (`src/theme/adminThemeService.ts`, `src/index.css`, `src/App.tsx`)**:
  - Fixed the issue where theme background wallpapers were obscured behind opaque solid color backgrounds.
  - Updated `applyThemeTokensAndLayout` in `adminThemeService.ts` to conditionally set `root.style.backgroundColor` and `document.body.style.backgroundColor` to `transparent` whenever an active theme wallpaper is applied.
  - Added `.app-root-container` and comprehensive `.has-theme-wallpaper` rules in `src/index.css` to render main panels (`ChatPanel`, `ChannelList`, `TitleBar`, `ServerList`, `VoicePanel`) with sophisticated frosted glass translucency (`color-mix` with `backdrop-filter: blur()`).
  - Ensured theme background art (AOT, Zero Two, Naruto, Valorant, One Piece, Elden Ring, Cyberpunk, etc.) shines through clearly with high contrast and readable text across all devices.

## [4.60.30] - 2026-08-17
### Fix: PocketBase Type Alignments, Duplicate Function Resolution & Search Message Attachment Types
- **PocketBase Service Typing & Duplication Cleanup (`src/pocketbase.ts`, `src/types.ts`)**:
  - Resolved duplicate `transferServerOwnership` function definitions by consolidating the full server ownership transfer logic, local cache updates, and event dispatches into a single authoritative method.
  - Imported `ServerEmoji` into `src/pocketbase.ts` and strongly typed `fetchServerEmojis` remote and local collections.
  - Added `attachments?: (Attachment | string)[]` property to `Message` type in `src/types.ts` to support search filters and attachments querying in `AdvancedSearchModal.tsx`.
  - Updated `MemberContextMenu.tsx` invocation of `transferServerOwnership` to match the canonical 2-argument signature.

## [4.60.29] - 2026-08-17
### Fix: Theme Text Spacing & Width Fitting, Settings Center Sidebar Truncation, and Categorized Anime & Game Themes
- **Theme Text Fitting & Typography Spacing Fix (`src/index.css`, `src/theme/builtinThemes.ts`, `src/theme/extendedThemes.ts`)**:
  - Refined `--font-sans` cascade, typography letter-spacing (`-0.01em`), and text rendering across all themes to ensure UI texts, headings, and labels never stretch overly wide or distort.
  - Standardized font pairings so body UI typography uses compact, clean sans fonts (`Plus Jakarta Sans` / `Cairo` / `Tajawal`) while keeping distinct decorative display fonts for headings where appropriate.
- **Settings Center Truncation Fix (`src/components/SettingsModal.tsx`)**:
  - Expanded sidebar navigation column width (`w-full md:w-72 lg:w-80 min-w-[270px]`) and adjusted header flex layout to guarantee "Settings Center" / "مركز الإعدادات" fits gracefully without truncating to "Settings Cen.." across all font sizes and themes.
- **Categorized Themes Sectioning (`src/components/SettingsModal.tsx`)**:
  - Grouped all themes into visually separated category blocks (**Anime & Manga**, **Gaming & Esports**, **Action & Neon**, **Core & Aesthetic**) when browsing the "All" view, complete with category icons, count badges, and clean dividers.
- **Extended Anime & Gaming Theme Additions (`src/theme/extendedThemes.ts`, `src/theme/builtinThemes.ts`)**:
  - Added 8 new popular themes with custom HD wallpaper art and bilingual Arabic/English localization:
    - **Naruto (Hidden Leaf / Nine Tails)**: Hokage orange, leaf chakra green, and Nine-Tails dark aesthetics.
    - **One Piece (Straw Hat / Gear 5)**: Sun God Gear 5 white & Straw Hat crimson pirate theme.
    - **Jujutsu Kaisen (JJK / Domain Expansion)**: Unlimited Void blue, cursed energy indigo, and Sukuna crimson theme.
    - **Bleach (Thousand-Year Blood War)**: Bankai white, Getsuga Tensho obsidian black, and soul reaper purple theme.
    - **Minecraft (Overworld & Redstone)**: Creeper green, diamond cyan, and redstone block theme with blocky pixel art.
    - **League of Legends (LoL / Hextech)**: Hextech blue, Piltover gold, and Zaun chemtech emerald theme.
    - **GTA Vice City (Synthwave 80s)**: Retro neon pink, Miami teal, and palm sunset aesthetics.
    - **Dark Souls / Elden Ring (Bonfire & Abyss)**: Bonfire ember orange, Lordran ash slate, and abyss black theme.

## [4.60.28] - 2026-08-17
### Feature: Categorized Theme Library, Wallpaper Background Images & Arabic Font Engine
- **Universal Arabic Font Fallback Engine (`src/theme/adminThemeService.ts`, `index.html`)**:
  - Implemented `ensureArabicFallback` utility dynamically appending premium Arabic typography (`'Cairo'`, `'Tajawal'`, `'Alexandria'`, `'Almarai'`, `'IBM Plex Sans Arabic'`) to English font stacks.
  - Ensures clean rendering of Arabic characters without missing glyphs or ugly default system fonts across all themes.
  - Linked Arabic Google Fonts (`Cairo`, `Tajawal`, `Alexandria`, `Almarai`, `IBM Plex Sans Arabic`) into `index.html`.
- **Wallpaper Background Image System (`src/index.css`, `src/App.tsx`, `src/theme/builtinThemes.ts`, `src/theme/adminThemeService.ts`)**:
  - Added full wallpaper background support via `--theme-bg-image`, `--theme-bg-opacity`, `--theme-bg-blur`, `--theme-bg-fit`, and `--theme-bg-position` CSS custom variables.
  - Created a dedicated `#theme-wallpaper-layer` in `App.tsx` positioned fixed behind all UI panels with `pointer-events-none`, non-blocking performance, and smooth transitions.
  - Added custom wallpaper image URL inputs, opacity sliders (5% to 85%), blur sliders (0px to 20px), and background fit configuration in both user settings and admin theme managers.
- **Categorized Themes with Anime, Games, and Action Titles (`src/theme/builtinThemes.ts`)**:
  - Organized all themes into 5 distinct categories: **Anime**, **Games**, **Action & Neon**, **Aesthetic**, and **Core**.
  - Added dedicated iconic themes with custom wallpapers:
    - **Attack on Titan (AOT)**: Scout Regiment green & titan crimson theme with wall scout wallpaper.
    - **Zero Two (Darling in the Franxx)**: Darling red and strelizia cyan theme with Zero Two art.
    - **Valorant**: Radiant tactical red & spike cyan theme with agent wallpaper.
    - **Demon Slayer (Kimetsu)**: Nichirin green & flame orange theme with Tanjiro/Nezuko art.
    - **Solo Leveling (Shadow Monarch)**: Shadow monarch purple & dark necromancer aura theme.
    - **Elden Ring (Tarnished Gold)**: Erdtree gold and grace yellow theme with Lands Between wallpaper.
    - **Cyberpunk 2077 (Night City)**: Neon yellow & braindance cyan theme with Night City backdrop.
    - **Genshin Impact (Teyvat Astral)**: Anemo cyan & celestia gold theme with astral sky wallpaper.
    - **Ghost of Tsushima**: Bushido crimson & autumn leaves theme with samurai backdrop.
  - Every theme contains localized bilingual names (`nameAr`) and descriptions (`descriptionAr`) for both English and Arabic.
- **Category Tabs & Search Filter (`src/components/SettingsModal.tsx`, `src/components/GlobalThemeManagerTab.tsx`)**:
  - Added fast category tab filters (All, Anime, Games, Action & Neon, Core & Aesthetic) with icons.
  - Added live theme search input searching names, IDs, descriptions, and tags in both English and Arabic.
  - Added wallpaper art preview cards, wallpaper badges, and live wallpaper preset picker.

## [4.60.27] - 2026-08-16
### Fix: Universal Dynamic Theme Background & Font Cascading + 26 Built-in Themes
- **Fix: CSS Variable Conflict & Background Color Stagnation (`src/index.css`, `src/theme/adminThemeService.ts`)**:
  - Eliminated static `.light` and `.dark` background/surface token definitions in `src/index.css` that were overriding dynamic CSS variable injections.
  - Updated `applyThemeTokensAndLayout` and `resolveFinalThemeTokens` to explicitly update root/body background colors and apply mode-specific variant palettes for both Light and Dark modes.
  - Implemented dynamic `--theme-titlebar-bg`, `--theme-glass-bg`, and `--theme-glass-border` CSS tokens matching the selected theme.
- **Fix: Universal Font Family Cascading (`src/App.tsx`, `src/index.css`, `src/theme/adminThemeService.ts`)**:
  - Replaced hardcoded font class with dynamic `font-sans` inheriting `--font-family`, ensuring font selections and theme layouts propagate uniformly across all navigation panels, headers, message bubbles, settings modals, and profile cards.
- **Added 8 New Distinct Built-in Themes (Total: 26 Themes) (`src/theme/builtinThemes.ts`)**:
  - Added **Emerald Forest**, **Sunset Coral**, **Nordic Aurora**, **Miami Vice Neon**, **Vintage Manuscript**, **Cosmic Nebula**, **Harajuku Pop**, and **Solar Plasma** with customized palettes, contrast levels, and distinct font configurations.

## [4.60.26] - 2026-08-16
### Feature: 18 Distinct Custom Themes & Comprehensive Google Fonts Registry
- **Fix: System Theme Preservation & Realtime Database Synchronization (`src/context/ThemeContext.tsx`, `src/components/GlobalThemeManagerTab.tsx`)**:
  - Added deterministic built-in theme merging (`mergeWithBuiltinThemes`) so that remote PocketBase synchronization and localStorage reloads always retain all 18 built-in system themes rather than being overwritten by older database snapshots.
  - Made the theme selector in **Settings > Appearance** always visible and interactive, allowing instant one-click theme switching with automatic activation of custom theme mode.
- **Fix: Module Initialization Order & Circular Dependency (`src/theme/builtinThemes.ts`, `src/theme/adminThemeService.ts`)**:
  - Resolved `ReferenceError: Cannot access 'DEFAULT_LAYOUT_SETTINGS' before initialization` by refactoring layout defaults into `builtinThemes.ts` with type-only imports and re-exporting through `adminThemeService.ts`.
- **18 Complete Built-in Themes (`src/theme/builtinThemes.ts`, `src/theme/adminThemeService.ts`)**:
  - Implemented 18 fully configured, distinct theme presets that transform backgrounds, text contrast, accents, borders, and typography:
    1. **Sirver Classic (Avocado)**: Crisp forest/avocado green accents with balanced contrast.
    2. **Cyber Neon**: High-tech synthwave dark palette with glowing cyan and neon pink/purple accents.
    3. **Sunset Glow**: Warm twilight oranges, rose golds, and amber dusk hues.
    4. **Midnight Obsidian**: Deep OLED pitch-black backdrop with pure monochrome white accents.
    5. **Emerald Matrix**: Terminal-inspired hacker aesthetic with vivid phosphor emerald greens.
    6. **Tokyo Vaporwave**: Dreamy 80s retro-futurism with neon magenta and pastel purple.
    7. **Nordic Frost**: Serene Arctic coolness featuring deep navy and glacier sky-blue accents.
    8. **Crimson Eclipse**: Dramatic blood-orange and deep ruby red highlights on slate carbon.
    9. **Royal Amethyst**: Regal deep purple, violet luminescence, and golden warm undertones.
    10. **Mocha Espresso**: Warm, earthy coffee browns, creamy latte tones, and cozy amber accents.
    11. **Solar Flare**: Radiant amber, vibrant gold, and energized sunbeam highlights.
    12. **Sakura Blossom**: Soft Japanese cherry blossom pinks, delicate rose petals, and clean contrast.
    13. **Retro Terminal (Amber CRT)**: Vintage phosphor amber computer terminal aesthetic.
    14. **Deep Ocean**: Bioluminescent deep-sea abyss with electric turquoise and aquamarine.
    15. **Lavender Mist**: Calming pastel lavender, soothing soft lilac, and gentle slate contrasts.
    16. **Volcanic Magma**: Scorching magma red-orange accents against volcanic basalt rock.
    17. **Forest Moss**: Calming woodland tones with earthy moss green and subtle sage highlights.
    18. **Synthwave 84**: 80s arcade neon sunset gradient with hot pink and electric violet.
- **Dynamic Google Fonts Registry (`index.html`, `src/index.css`, `src/theme/builtinThemes.ts`)**:
  - Integrated 15 Google Fonts including **Inter**, **Roboto**, **Outfit**, **Plus Jakarta Sans**, **Poppins**, **JetBrains Mono**, **Fira Code**, **Space Grotesk**, **Cinzel**, **Playfair Display**, **Orbitron**, **Press Start 2P**, **Courier Prime**, **Cairo**, and **Tajawal**.
  - Enabled font inheritance across all themes and custom theme editors with 0ms layout shift and instant hot-switching.
- **Enhanced Theme Preview Cards (`src/components/SettingsModal.tsx`)**:
  - Upgraded the Theme Selector in Settings > Appearance with live color preview swatches (dark background + accent dot), font name badges, light/dark accent indicators, and instant selection feedback.

## [4.60.25] - 2026-08-16
### Fix: Message Context Menu Viewport Clamping & Server Settings Roles Contrast
- **Message Context Menu Viewport Bounds Protection (`src/components/MessageContextMenu.tsx`, `src/components/ChatPanel.tsx`)**:
  - Created a dedicated `MessageContextMenu` component rendered via `createPortal` with dynamic horizontal and vertical viewport boundary calculation.
  - Implemented boundary collision detection so that right-clicking messages near the screen edge, app borders, or bottom chat bar automatically shifts the menu inward to remain fully visible, accessible, and clickable.
  - Added resize and scroll event listeners with fallback positioning and escape key dismissal.
- **Server Settings & Roles Modal Background Contrast (`src/components/ServerSettingsModal.tsx`)**:
  - Added a darkened blurred backdrop (`bg-black/75 backdrop-blur-xs`) behind the server settings modal.
  - Elevated the modal container and sidebar with high-contrast surfaces (`bg-slate-100` / `bg-slate-950`) and distinctive borders to prevent blending with the background app.
  - Redesigned the Roles creation form, role badges, and member assignment cards with theme-aware high-contrast container styling in both dark and light modes for optimal legibility.

## [4.60.24] - 2026-08-16
### Fix: PocketBase Authorization Mismatch & Realtime SSE Synchronization
- **Auth Store Lifecycle & Realtime Reconnection (`src/pocketbase.ts`)**:
  - Implemented `authStore.onChange` handler to automatically abort stale requests with `pb.cancelAllRequests()` and cleanly reset realtime SSE subscriptions when tokens change or refresh.
  - Added an `afterSend` response interceptor to intercept `400` status errors caused by authorization mismatches ("The current and the previous request authorization don't match") and automatically recover by resetting SSE client subscriptions.
  - Added explicit cancellation and realtime disconnection during `logout()` and `login()` lifecycles to prevent token collisions.
  - Enhanced error catching across `subscribeToMessages`, `subscribeToPrivateMessages`, and `subscribeToUsers` to seamlessly handle auth changes without unhandled promise rejections.
### Performance Optimization: Instant Chat and Channel Loading
- **Non-blocking Message Merging & Asynchronous Persistence (`src/services/offlineCacheService.ts`)**:
  - Separated synchronous in-memory UI cache updates (`mergeChannelMessagesSync`) from heavy IndexedDB persistence routines.
  - Backgrounded IndexedDB writes to guarantee 0ms UI lockup during channel navigation and message ingestion.
- **PocketBase Auto-cancellation Prevention & Request Key Optimization (`src/pocketbase.ts`)**:
  - Added `requestKey: null` across `fetchChannels`, `fetchMessages`, `fetchAllUsers`, and `fetchServerMessages` to eliminate request auto-cancellation aborts during rapid channel switching.
  - Primed user cache and channel metadata cache to eliminate redundant roundtrips.
- **Streamlined Channel & Server Loading Lifecycle (`src/App.tsx`)**:
  - Optimized `loadChannels` and active server/channel effect dependencies to prevent duplicate fetching cycles.
  - Preserved active channel state during background channel synchronization and deferred non-critical server message sweeps to prioritize active channel responsiveness.

## [4.60.22] - 2026-08-16
### YouTube Preview Layout Fix & Partial Button Removal
- **Refined YouTube Preview Card (`src/components/MusicPlayer.tsx`)**:
  - Removed awkwardly positioned partial/duplicate mini YouTube button badge on the side of the preview card.
  - Implemented a clean, unified top badge bar with a YouTube brand indicator on the start side and "External Player" badge on the end side using RTL-aware layout styling (`inset-x-3`).
  - Added a prominent centered play button with hover scaling and smooth dark vignette gradient overlay.
  - Implemented a multi-tier thumbnail resolution fallback chain (`maxresdefault` -> `sddefault` -> `hqdefault` -> `mqdefault`) to guarantee reliable thumbnail rendering across all video resolutions.
- **Enhanced YouTube URL Parsing (`src/components/ChatPanel.tsx`)**:
  - Expanded YouTube URL detection and video ID extraction regex to support `shorts/`, `embed/`, `live/`, and complex parameter URLs seamlessly.

## [4.60.21] - 2026-08-16
### Proactive Media Preloading & Instant Scroll Readiness
- **Proactive Scroll Preloading (`src/components/ChatPanel.tsx`)**:
  - Implemented `preloadMediaForRange` and `preloadedMediaUrlsRef` in `ChatPanel.tsx` that scans message attachments and preview links within a 40-message window.
  - Automatically triggers background prefetching and decoding on channel view and as soon as scrolling begins (`handleScrollFeed`), so images, attachments, and GIF previews are already decoded and ready before the user scrolls to them.
- **Eager Loading & Aspect Ratio Preservation (`src/components/UploadedImagePreview.tsx`, `src/components/ExternalImagePreview.tsx`)**:
  - Removed lazy loading delays (`loading="lazy"`) and restricted IntersectionObservers that previously stalled loading until media entered the middle of the screen.
  - Set `loading="eager"` and `decoding="async"`, and enabled instant asynchronous canvas / bitmap processing into memory cache (`uploadedPreviewCache`).
- **Smooth GIF Playback Readiness (`src/components/SmartGifImage.tsx`)**:
  - Expanded observer margin to `1500px` for seamless pre-rendering of animated media.

## [4.60.20] - 2026-08-16
### Continuous Message Timestamp Placement on Opposite Side
- **Avatar Gutter Cleanup & Timestamp Repositioning (`src/components/ChatPanel.tsx`)**:
  - Removed timestamps from under the avatar column (`app-message-gutter`) in continuous messages, restoring it as a clean indentation spacer.
  - Positioned the timestamp on the opposite side of the avatar (`top-1 end-2 sm:end-3`), matching the normal message timestamp alignment.

## [4.60.19] - 2026-08-16
### Nested Reactions & Attachments Directly Below Text
- **Snug Reaction Attachment (`src/components/ChatPanel.tsx`, `src/components/MessageReactions.tsx`)**:
  - Moved `MessageReactionChips` and attachments directly inside the inner `flex-1 min-w-0` message body container.
  - Eliminated the extra gap caused by the avatar height (40px) on short 1-line messages, ensuring reaction chips and the quick add button appear directly below the text without floating down in the middle of nowhere.
  - Docked the hover action toolbar cleanly at `top-1 end-2 sm:end-3` within the message row.

## [4.60.18] - 2026-08-16
### Docked Message Actions Toolbar & Indented Reaction Chips Attached to Message Content
- **Docked Actions Toolbar (`src/components/ChatPanel.tsx`)**:
  - Anchored the message actions & reactions toolbar directly at the top-end corner (`top-1 end-2 sm:end-3`) opposite the avatar when hovered, docking it cleanly inside the message row rather than floating with disruptive negative offsets.
- **Reaction Chips Alignment & Tight Spacing (`src/components/ChatPanel.tsx`, `src/components/MessageReactions.tsx`)**:
  - Aligned reaction chips to the start of the message text using `ms-13` (matching the avatar gutter + flex gap), preventing reactions from starting under the avatar or floating ambiguously between messages.
  - Tightened top margins (`mt-0.5`) so reactions and the reaction picker button stay snug and directly attached to the message text/attachments.

## [4.60.17] - 2026-08-16
### Message Actions Toolbar Position Refinement & Non-blocking Interactions
- **Optimized Vertical Clearance (`src/components/ChatPanel.tsx`)**:
  - Adjusted message options & quick reactions toolbar position lower (`-bottom-5`) so it clears the text baseline and never obscures the message text content.
  - Added `pointer-events-none group-hover:pointer-events-auto` so the toolbar cannot block clicks on background text, reaction chips, attachments, or links when inactive.

## [4.60.16] - 2026-08-16
### Message Actions Toolbar Positioned on Lower Message Area Close to Avatar
- **Message Actions Bar Placement (`src/components/ChatPanel.tsx`)**:
  - Positioned the hover options & quick reactions toolbar on the lower part of the message container (`-bottom-3.5`) close to the avatar side (`start-12 sm:start-14`).
  - This keeps the toolbar easily accessible next to the message without having to travel across wide screens, while ensuring it never covers the reply reference link, author name, timestamp, or message header.

## [4.60.15] - 2026-08-16
### Fixed Message Options Bar Covering Reply Reference Link
- **Message Actions Toolbar Repositioning (`src/components/ChatPanel.tsx`)**:
  - Repositioned the hover message actions & quick reactions toolbar to the opposite corner (`-top-3.5 end-2 sm:end-4`), completely separating it from the reply reference banner (`ms-13` on the start side).
  - Restored continuous message timestamps to the start avatar gutter on hover (`w-10 app-message-gutter text-center`), ensuring that clicking reply links and previewing referenced messages is completely unobstructed.

## [4.60.14] - 2026-08-16
### Continuous Message Timestamps & Dynamic Viewer Language in Shared Message Previews
- **Continuous Message Timestamp & Toolbar Alignment (`src/components/ChatPanel.tsx`)**:
  - Relocated continuous message timestamps from the left/start avatar gutter to the empty area on the opposite side (`top-1 end-2 sm:end-4`), displaying cleanly on hover.
  - Left avatar gutter on continuous messages now acts as an empty indentation spacer, keeping the hover message options toolbar consistently positioned on the start/username side (`start-16 sm:start-24`).
- **Dynamic Language Resolution for Shared Message Previews (`src/components/MessageLinkPreview.tsx`, `src/components/ChatPanel.tsx`)**:
  - Updated `MessageLinkPreviewCard` and `FormattedMessageContent` to dynamically resolve language using active locale and props, preventing shared message preview cards from being locked to the sender's language (such as showing Arabic "رسالة مشاركة" to an English viewer).
  - Added `lang` dependency comparison to `FormattedMessageContent` memo comparator so localized rich text components re-render immediately upon language switch.

## [4.60.13] - 2026-08-16
### Repositioned Message Timestamp & Actions Options Toolbar
- **Message Timestamp Relocation (`src/components/ChatPanel.tsx`)**:
  - Moved message timestamp from directly beside the username to the empty area on the opposite side of the message header (`justify-between`), keeping the header uncluttered and clean in both English and Arabic modes.
- **Message Actions & Reactions Bar Proximity (`src/components/ChatPanel.tsx`)**:
  - Re-anchored the hover message actions & quick reactions toolbar (`start-16 sm:start-24`, `-top-3.5`) closer to the username side where the timestamp previously sat, allowing for quick and intuitive reaction access without spanning across to the far edge of the screen.

## [4.60.12] - 2026-08-16
### Fixed Reaction Removal Flickering & Multiple State Render Cycles
- **Prevented Redundant Server Fetch Cycles on Updates (`src/App.tsx`)**:
  - Restricted asynchronous `pbService.getMessageById` background fetches to brand new `create` actions rather than existing message `update` events, eliminating the delayed second/third message state overwrites that caused reaction chips to flicker or blink when removed.
  - Added message equality guards (`isSingleMessageEqual`) inside realtime message and private message update handlers to preserve state references when optimistic local reactions match incoming server updates.
- **Visual State Comparison Optimization (`src/lib/messageDiff.ts`)**:
  - Adjusted `isSingleMessageEqual` to prevent pure backend timestamp fluctuations from invalidating identical UI/reaction states.
- **Synchronized Demo Mode Reactions in `getMessageById` (`src/pocketbase.ts`)**:
  - Ensured `getMessageById` in demo mode preserves stored message reactions from local storage to prevent optimistic removals from getting wiped by demo fetch operations.
### Fixed Arabic Reaction Chip Alignment on the Right Side with Correct Word Reading Order
- **RTL Positional Alignment & Visual Ordering (`src/components/MessageReactions.tsx`)**:
  - Restored `dir={lang === "ar" ? "rtl" : "ltr"}` to `MessageReactionChips` so reactions stay aligned to the right side of the message in Arabic mode (matching message header and text alignment).
  - Dynamically reversed the rendered array in RTL mode (`displayReactions = [...reactionsList].reverse()`) so that when the browser places items in right-to-left order, the visual sequence across the screen spells words (e.g. "G-O-T") in the correct intended order without shifting container alignment.

## [4.60.10] - 2026-08-16
### Fixed Reaction Chip Reading Direction across Arabic & English Modes
- **Consistent LTR Flow for Reactions (`src/components/MessageReactions.tsx`)**:
  - Enforced `dir="ltr"` on `MessageReactionChips` container so reaction chips consistently flow in chronological order from left to right in both Arabic and English modes.
  - Ensures letter emoji combinations (e.g. spelling "GOT") and reaction sequences display in their intended left-to-right reading order regardless of the active UI language.

## [4.60.9] - 2026-08-16
### Added Shift+Click Multi-Emoji Reaction Support & Stable Anchor Positioning
- **Shift+Click Multi-Emoji Reactions (`src/components/MessageReactions.tsx`, `src/components/ChatPanel.tsx`)**:
  - Holding `Shift` while clicking any emoji (both in the quick bar and emoji grid) now adds/toggles the reaction on the message while keeping the emoji menu open so users can select multiple reactions in one continuous flow.
  - Added subtle helpful footer indicator in the picker ("Shift + Click to add multiple reactions" / "اضغط Shift + النقر لإضافة عدة تفاعلات").
- **Fixed Picker Positioning Geometry (`src/components/MessageReactions.tsx`)**:
  - Replaced arbitrary left/right flip calculations with anchor center viewport geometry.
  - Aligns smoothly with trigger buttons on left and right sides without jumping side to side across the screen.
  - Clamps coordinates to safe viewport margins (`topPos`, `leftPos`) and preserves fixed anchor state during optimistic additions.

## [4.60.8] - 2026-08-16
### Added Letters & Numbers Reaction Category in Message Reactions
- **Letters Emoji Category (`src/components/MessageReactions.tsx`)**:
  - Added dedicated "Letters" ("حروف") category to `EMOJI_CATEGORIES` containing all regional indicator letter emojis (🇦 to 🇿), word badges (🆗, 🆒, 🆓, 🆕, 🆘, 🆙, 🆚, 🅰️, 🅱️, 🆎, 🅾️, 🆑, 🆖, 🅿️, ℹ️, Ⓜ️), number badges (0️⃣ to 🔟, #️⃣, *️⃣), and alphanumeric badges (🔤, 🔡, 🔠, 🔢).
  - Expanded search keywords in `EMOJI_KEYWORDS` across English and Arabic for instant fuzzy filtering of letters, numbers, and badge reactions.

## [4.60.7] - 2026-08-16
### Fixed Message Reactions Sorting & Positional Order Preservation
- **Ordered Array Reaction Structure (`src/components/MessageReactions.tsx`, `src/pocketbase.ts`, `src/App.tsx`)**:
  - Replaced object map reaction serialization with ordered array structures `[{ emoji: string, users: string[] }]` to prevent Go/PocketBase and JavaScript engines from resorting reactions alphabetically or altering key orders during updates and round-trips.
  - Implemented `toggleReactionInList` to strictly preserve existing reaction chip positions when users vote or unvote on existing emojis, and append new emojis chronologically to the end of the array.
  - Updated `parseReactions` to preserve initial insertion appearance order (`orderList`) during parsing and deduplication.

## [4.60.6] - 2026-08-16
### Fixed Message Reaction Rendering, Multi-Format Payload Parsing & Theme Tokens
- **Universal Multi-Format Reactions Parser (`src/components/MessageReactions.tsx`, `src/lib/messageDiff.ts`, `src/pocketbase.ts`)**:
  - Implemented a resilient, multi-layer parser supporting all formats: JSON strings, double-stringified JSON, object maps (`{ "👍": ["u1", "u2"] }`), arrays of reaction objects (`[{ emoji, users }]`), count objects, and PocketBase expanded records (`msg.reactions`, `msg.expand?.reactions`, `msg.reactions_list`, `msg.message_reactions`).
  - Added user ID normalization and emoji deduplication across all formats.
- **Tailwind v4 & Theme Token Class Alignment (`src/index.css`, `src/components/MessageReactions.tsx`)**:
  - Registered `--color-accent` and `--color-accent-contrast` within Tailwind `@theme` in `src/index.css` to ensure full compilation of `bg-accent`, `text-accent`, and `border-accent`.
  - Upgraded reaction chips in light and dark modes to use valid theme tokens (`--accent-color`, `--theme-bg-secondary`, `--theme-border`, `--theme-text-primary`) and high-contrast active reaction indicators.
- **Optimistic State & Cache Pipeline (`src/App.tsx`, `src/lib/messageDiff.ts`)**:
  - Unified optimistic state updating in `handleToggleReaction` using `parseReactions` so state toggles produce clean, normalized reaction maps across `messages`, `messagesCache`, `serverMessages`, and `serverMessagesCache`.
  - Updated `isSingleMessageEqual` in `src/lib/messageDiff.ts` to compare parsed normalized reactions so reference checks never miss reaction updates.
### Fixed Message Reaction Synchronization, Diffing & Realtime Updates
- **Reactions Diffing Precision (`src/lib/messageDiff.ts`)**:
  - Replaced shallow length comparisons in `isSingleMessageEqual` with complete reaction state verification (`JSON.stringify(pReactions) !== JSON.stringify(nReactions)`).
  - Ensured that toggling reactions properly updates memoized message list references and triggers reactive visual chip re-renders immediately.
- **Realtime Private Messages Updates (`src/App.tsx`)**:
  - Added dedicated `e.action === 'update'` listener for private messages / DM subscriptions, ensuring reactions and edits on direct messages propagate in realtime to all participants.
- **Optimistic State & Cache Synchronization (`src/App.tsx`)**:
  - Enhanced `handleToggleReaction` to optimistically update both `messages` and `messagesCache`, as well as `serverMessages` and `serverMessagesCache` seamlessly.
- **PocketBase Fallback & Resilience (`src/pocketbase.ts`, `src/components/MessageReactions.tsx`)**:
  - Added bidirectional collection fallback between standard channel messages and private messages in `toggleMessageReaction`.
  - Added explicit event propagation stoppage on reaction buttons and chips to prevent accidental message click triggers.

## [4.60.4] - 2026-08-16
### Fixed getBoundingClientRect Null Safety and Chat Panel Resilience
- **DOM Measurement & Anchor Guarding (`src/components/ChatPanel.tsx`)**:
  - Added null safety checks around all `getBoundingClientRect()` calls in `handleOpenReactionPicker`, mention click handlers, and message context menu actions.
  - Added fallback target resolution (`e.currentTarget || e.target.closest('button, div, span')`) so measuring coordinates always succeeds without throwing runtime errors if an inner SVG icon or text node received the event.
  - Ensured `currentUser?.id` is optional-chained across all `useMemo` dependency arrays.

## [4.60.3] - 2026-08-16
### Fixed Emoji Categories Reference Error & Circular Dependency
- **Resolved Initialization Order (`src/components/MessageReactions.tsx`, `src/components/ChatPanel.tsx`)**:
  - Eliminated the circular module dependency between `ChatPanel.tsx` and `MessageReactions.tsx`.
  - Moved `EMOJI_CATEGORIES`, `QUICK_REACTION_EMOJIS`, `parseReactions`, and `getReactionTooltip` definitions directly into `MessageReactions.tsx` and re-exported them through `ChatPanel.tsx`.
  - Fixed runtime `ReferenceError: Cannot access 'EMOJI_CATEGORIES' before initialization` on initial application mount.

## [4.60.2] - 2026-08-16
### Fixed Message Reaction Picker Reliability, Positioning, and Interaction
- **Rock-Solid Reaction Picker Portal (`src/components/MessageReactions.tsx`, `src/components/ChatPanel.tsx`)**:
  - Replaced the nested message-level picker with a dedicated top-level `createPortal` with viewport anchoring via `getBoundingClientRect()`.
  - Fixed an issue where the picker was inside the memoized message list without reactive dependencies, preventing it from showing or causing it to get clipped by `overflow-y-auto` message containers.
  - Eliminated the `mousedown` / `click` event race condition so clicking the "Add reaction" button toggles the menu open/closed reliably without reopening.
  - Added smart viewport position calculation that automatically flips the picker above or below the target button based on available vertical space, and clamps horizontally for both LTR and RTL layouts.
  - Fixed performance freezes by pre-indexing emoji categories and adding high-performance English and Arabic keyword lookups for instant, lag-free searching.

## [4.60.1] - 2026-08-16
### Fixed Message Text Font Sizing & Streamlined Message Reactions UX
- **Message Font Size Correction (`src/components/ChatPanel.tsx`)**:
  - Fixed an issue where regular text messages and short phrases were unintentionally matching emoji detection and rendering at oversized header sizes.
  - Rewrote `isEmojiOnlyMessage` with strict grapheme segmentation and character verification, ensuring text containing any letters, digits, or standard punctuation always renders in standard chat typography (`text-sm leading-relaxed`).
  - Reserved enlarged typography exclusively for messages that contain only 1 to 6 standalone pictographic emojis and zero text.
- **Streamlined Message Reactions Interaction (`src/components/ChatPanel.tsx`, `src/components/MessageReactions.tsx`)**:
  - Anchored the reaction picker directly to the action toolbar button and reaction chips row with smart placement.
  - Streamlined the message context menu by removing redundant duplicate buttons and keeping the single quick reactions bar with instant emoji selection and expandable picker.
  - Ensured both quick reaction emojis and custom picked emojis immediately reflect with optimistic reaction chips under the message.

## [4.60.0] - 2026-08-16
### Fixed Arabic (RTL) Emoji-Only Message Alignment & Integrated Message Reactions
- **RTL Emoji-Only Message Alignment (`src/components/ChatPanel.tsx`)**:
  - Fixed alignment of emoji-only messages in Arabic (RTL) mode to render correctly on the right side of the screen matching standard messages.
  - Replaced browser-heuristic `dir="auto"` with explicit `dir={lang === "ar" ? "rtl" : "ltr"}` and `text-start` with `style={{ textAlign: lang === "ar" ? "right" : "left" }}`.
  - Enhanced `isEmojiOnlyMessage` detection regex to support up to 24 emojis, skin tone modifiers, zero-width joiners, and emoji sequences.
  - Added dedicated styling and font scale adjustments (`text-3xl sm:text-4xl` for short emoji messages and `text-2xl sm:text-3xl` for longer sequences) with consistent text direction.
- **Message Reactions Integration (`src/components/ChatPanel.tsx`, `src/App.tsx`)**:
  - Connected the PocketBase database `reactions` schema to the message rendering pipeline.
  - Added `<MessageReactionChips>` below messages displaying active reaction counts, highlighted user reactions, and interactive member tooltips.
  - Added Quick Reactions bar (`👍`, `❤️`, `😂`) and a reaction picker button (`SmilePlus`) to the message hover action toolbar.
  - Added an interactive `<MessageReactionPicker>` with emoji category browsing and search.
  - Added Quick Reactions and "Add Reaction" (`إضافة تفاعل`) options to the message context menu (right-click / long-press).
  - Wired optimistic UI state updates and PocketBase realtime synchronization for seamless multi-user reactions.

### Fixed Profile Card Options Menu Positioning & Visibility
- **Profile Card Options Dropdown (`src/components/UserProfileModal.tsx`)**:
  - Fixed options dropdown menu clipping inside the profile card by upgrading its positioning from hardcoded `right-0` to bidirectional `ltr:right-0 rtl:left-0`.
  - In RTL (Arabic mode), anchored the menu to the left edge of the button to expand inwards into the card rather than extending past the left edge and being clipped by `overflow-hidden`.
  - Replaced bottom offset with `bottom-full mb-2`, positioning the popover directly above the options button with sufficient headroom inside the card.
  - Aligned menu item text to `text-start` for seamless text direction in both Arabic and English.
  - Added an outside-click dismisser backdrop to conveniently close the dropdown when clicking anywhere outside.

## [4.58.0] - 2026-08-16
### Optimized DM Loading Speed & Grouped Consecutive Blocked Messages
- **High-Speed DM Loading (`src/pocketbase.ts`, `src/App.tsx`)**:
  - Added dual-layer caching (in-memory + local storage) for private chat servers (`cached_pcs_${userId}`), eliminating redundant server resolution lookups when opening DMs.
  - Parallelized membership checks and added `requestKey: null` to avoid request cancellations when resolving private chat servers.
  - Implemented cache-first resolution in `App.tsx` before fetching direct messages for instant DM channel transitions.
- **Grouped Consecutive Blocked Messages (`src/components/ChatPanel.tsx`)**:
  - Implemented `blockedClustersMap` to identify and group continuous messages sent by blocked users into single consolidated clusters.
  - Replaced repetitive individual "Show" / "Hide" buttons with a single unified toggle button (`Show all` / `Hide all`) for continuous messages.
  - When hidden, consecutive blocked messages collapse into a single compact placeholder indicating the count of hidden messages.
  - When revealed, continuous messages flow cleanly with a single header badge and one "Hide all" toggle button.
  - Virtual scroll height calculation is dynamically adjusted so hidden consecutive messages occupy zero space, ensuring jitter-free scrolling.

## [4.57.0] - 2026-08-16
### Fixed Channel Selection Scroll Position (Start at Bottom) & Channel Loading Performance
- **Channel Scroll Position Pinning (`src/components/ChatPanel.tsx`)**:
  - Configured channel activation to unconditionally scroll to the bottom on channel switch/selection (`executeScroll("initial")`), ensuring users always land on the newest messages when pressing a channel.
  - Enhanced `useLayoutEffect` on message list changes to firmly maintain scroll alignment at the bottom as items render, media items expand, and font layout completes.
  - Immediate `isInitialLoadReady` transition to avoid viewport flash or lingering loading overlays once initial bottom anchoring is applied.
- **Channel Loading Speed Optimization (`src/pocketbase.ts`, `src/App.tsx`, `src/components/ChatPanel.tsx`)**:
  - Implemented high-speed metadata caching for channels (`channelMetaCache`), server owners (`serverOwnerCache`), and member roles (`memberRoleCache`) in `PocketBaseService`, eliminating sequential blocking network roundtrips on every channel message fetch.
  - Automatically populate channel metadata cache when server channels are fetched or cached.
  - Switched DM channel loading to non-blocking cache-first retrieval with background synchronization in `App.tsx`.
  - Refined message preload threshold in `handleScrollFeed` from 2500px to 180px and added bottom-state guards (`!isAtBottom` and `!initialChannelLoadLock`) to prevent redundant auto-pagination requests when opening channels.

## [4.56.0] - 2026-08-16
### Fixed Authentication Error Handling and Session Validation
- **Resilient Login & Fallback Resolution (`src/pocketbase.ts`)**:
  - Added whitespace trimming and mixed-case username fallback resolution during authentication.
  - Implemented `refreshAuth()` in `PocketBaseService` to validate and refresh JWT tokens against the PocketBase backend in the background.
  - Added graceful session-expired dispatch (`auth-session-expired`) when tokens are invalid, revoked, or expired.
- **Enhanced Auth Error Messages & Localization (`src/components/AuthScreen.tsx`, `src/services/localization.ts`)**:
  - Intercepted raw PocketBase `Failed to authenticate.` error responses and mapped them to clear, localized messages in both English and Arabic.
  - Extracted nested field-level validation errors from PocketBase response payloads (e.g. duplicate email/username) for instant user clarity.
  - Fixed the username input placeholder in login mode to dynamically show "Username or Email".
- **Background Session Verification (`src/App.tsx`)**:
  - Added background session validation on application mount to proactively verify active tokens and cleanly reset unauthenticated sessions.
### Fixed Server Members List Toggle Responsiveness (Single-Click Instant Open/Close)
- **Single-Click Instant Toggle (`src/components/ChatPanel.tsx`)**:
  - Eliminated the mobile transition lockout (`isOverlayTransitioning` guard and 180ms delay) that was dropping user clicks during rapid interactions.
  - Resolved the React state updater side-effect issue where synchronous `dispatchEvent` inside `setState` caused double-inversion and conflicting state updates across mounted channel instances.
  - Added source-isolated `sirverdata_pc_members_panel_changed` event broadcasting via `queueMicrotask` to prevent self-triggering update loops.
  - Added `type="button"` and `e.stopPropagation()` to the top bar Members button and backdrop handlers to prevent click bubbling and accidental closes.
  - Added a dedicated Close button (`X`) in the desktop Server Members header for direct one-click closing.
  - Fixed `activeOverlay === "pinned"` reset state from `"none"` to `null`.

## [4.54.0] - 2026-08-16
### Fixed Server Members List Toggle and Drawer Rendering
- **Server Members List Toggle Fix (`src/components/ChatPanel.tsx`, `src/App.tsx`)**:
  - Fixed `isDmChannel` evaluation so server channels without explicit `server` props or with delayed server resolutions are not mistakenly categorized as DM channels.
  - Added robust `displayServer` fallback resolution to retrieve server metadata from `lastServerRef`, `pbService.getCachedServers()`, or channel references.
  - Enhanced `targetServer` lookup in `App.tsx` to ensure server instances are always accurately passed to `ChatPanel`.
  - Refactored `useBackHandler("chat-member-list-mobile")` to strictly track mobile overlays (`!isDesktop && activeOverlay === "members"`), preventing back-stack collisions from closing the desktop panel.
- **Instant Members Hydration & Background Sync (`src/pocketbase.ts`, `src/components/ChatPanel.tsx`)**:
  - Added `getCachedServers` method to `PocketBaseService` for offline and immediate cache access.
  - Connected member loading, roles loading, and user presence sync to `targetServerId`, guaranteeing zero-lag hydration when opening the members list.
- **Theme Token Adherence (`THEME_GUIDE.md`)**:
  - Updated the members toggle button and panel styling to consume centralized theme tokens (`var(--theme-bg-tertiary)`, `var(--theme-bg-secondary)`, `var(--theme-border)`, `var(--theme-text-primary)`, `var(--theme-text-muted)`, and `var(--accent-color)`).
### Video & YouTube Links External Player Launchers with Theme-Tokenized Previews
- **YouTube Link Preview Upgrade (`src/components/MusicPlayer.tsx`)**:
  - Replaced inline iframe playback with a high-definition video thumbnail preview card.
  - Clicking the YouTube card or play button directly opens the video in the external player/browser via `openExternalUrl(url)`.
  - Added YouTube brand badge, external player indicator badge, and fallback thumbnail resolution handling (`maxresdefault.jpg` -> `hqdefault.jpg`).
- **Direct Video Link Previews (`src/components/SmartVideoLinkPreview.tsx`, `src/components/ChatPanel.tsx`)**:
  - Created `SmartVideoLinkPreview` component for `.mp4`, `.webm`, `.mov`, `.ogg` link previews.
  - Automatically captures background video poster thumbnails and durations using metadata canvas extraction with fallback.
  - Completely removed inline `<video controls>` embedding from chat links, replacing it with an external player launch card.
- **Social Media Video Previews (`src/components/SocialEmbeds.tsx`)**:
  - Updated `SmartInstagramEmbed`, `SmartTikTokEmbed`, `SmartFacebookEmbed`, and `SmartRedditEmbed` to launch the external player/browser immediately upon click without loading heavy iframe embeds.
- **Theme Token Adherence (`THEME_GUIDE.md`)**:
  - All new and updated preview components strictly consume centralized CSS design tokens (`var(--theme-bg-card)`, `var(--theme-bg-secondary)`, `var(--theme-border)`, `var(--theme-text-primary)`, `var(--theme-text-muted)`, `var(--accent-color)`).

## [4.52.0] - 2026-08-16
### Instant Local-First Chat & Channel Switching with Zero-Jitter Loading
- **3-Tier Synchronous Caching (`src/services/offlineCacheService.ts`, `src/App.tsx`)**:
  - Implemented a high-performance synchronous L1 in-memory cache and L2 local cache for servers, channels, direct messages, and chat messages.
  - Added synchronous lookup methods (`getCachedMessagesSync`, `getChannelsSync`, `getDmChannelsSync`, `getServersSync`) to achieve 0ms instantaneous rendering on channel and mode switching.
- **Race-Condition & Stale-Render Protection (`src/App.tsx`)**:
  - Added atomic sequence request tokens (`loadMessagesSeqRef`) ensuring rapid sequential switches never glitch or display stale channel data.
  - Channels and DMs keep the chat hidden behind a theme-tokenized placeholder skeleton until data is fully loaded and settled.
  - Render optimized to maintain a single active `ChatPanel` instance, completely eliminating memory bloat from inactive background panels.
- **Theme Token Alignment & Smooth Background Loading (`src/components/ChatPanel.tsx`)**:
  - Replaced abrupt loader boxes with subtle theme-tokenized skeleton rows during initial loads.
  - Background synchronization happens seamlessly and non-blockingly without stuttering animations or user interactions.

## [4.51.0] - 2026-08-16
### Seamless Zero-Jitter Chat Transitions with Post-Scroll Fade Animation
- **Smooth Chat Fade & Pre-Render Scroll Lock (`src/components/ChatPanel.tsx`)**:
  - Implemented seamless fade animations when switching between channels and direct messages (`opacity-0` -> `opacity-100` with `transition-opacity duration-200 ease-out`).
  - Messages feed remains completely hidden and zero-movement during the layout computation and initial scroll positioning stage.
  - Added double `requestAnimationFrame` stabilization to ensure that all DOM nodes, message heights, attachments, and typography metrics have completely resolved before `scrollTop` is anchored to the bottom.
  - Reveals the messages container with a smooth fade-in only *after* the feed is fully settled at the bottom, eliminating all visual jumpiness, upward snapping, and erratic loading shifts.
  - Added a centered loading indicator while the conversation is being fetched and positioned.

## [4.50.0] - 2026-08-16
### Instant Server Members List Loading & Stale-While-Revalidate Caching
- **Instant Zero-Delay Hydration (`src/components/ChatPanel.tsx`, `src/pocketbase.ts`)**:
  - Pre-hydrated `serverMembers`, `serverRoles`, and `allUsersList` directly from localStorage and memory caches (`getCachedServerMembers`, `getCachedServerRoles`, `getCachedUsers`) upon mount and on server switch, eliminating visual lag.
  - Eliminated the blocking `Promise.all` that delayed rendering the member list until all three remote API requests completed; replaced with asynchronous, independent progressive state updates (Stale-While-Revalidate).
- **Persistent Local Caching (`src/pocketbase.ts`)**:
  - Added localStorage persistence for `cached_all_users` and `cached_server_members_${serverId}` so member data remains immediately available even across refreshes and cold app boots.
- **Redundant Fetch Elimination (`src/components/ChatPanel.tsx`)**:
  - Replaced the duplicate asynchronous `fetchServerMembers` invocation inside `serverMembersMap` with a memoized mapping derived directly from active and cached member state.

### Reliable 2-Second Delayed Outgoing Ringtone & Full Server Member List Population
- **Decoupled Outgoing Ringtone Timer (`src/services/callSignaling.ts`)**:
  - Fixed timer collision where `clearTimeoutTimer` was clearing `outgoingSoundTimer` immediately during initial call invite dispatch.
  - Ringback audio now reliably starts exactly 2 seconds after the call screen appears if the call remains open and unanswered.
  - Automatically cancels the timer if the call is answered, declined, or cancelled within that 2-second window.
- **Server Members List Population (`src/components/ChatPanel.tsx`, `src/pocketbase.ts`)**:
  - Enhanced `unifiedServerMembers` to include all registered workspace community members from `allUsersList` when loading the server, rather than only users with preexisting individual `server_members` table rows.
  - Upgraded `fetchAllUsers` in `pocketbase.ts` to use `getFullList` with resilient pagination fallback for complete directory retrieval on app startup.

## [4.48.0] - 2026-08-16
### 2-Second Ringtone Delay on Outgoing Calls
- **Delayed Outgoing Ringback Chime (`src/services/callSignaling.ts`)**:
  - Configured a 2-second delay timer before starting the caller's outgoing ringtone sound upon pressing the call button.
  - Ensures the floating call window animation and callee avatar/status appear first and settle visually before auditory ringing initiates.
  - Added clean timer invalidation on call accept, decline, cancel, or timeout events.

## [4.47.0] - 2026-08-16
### Pre-Loaded Floating Call Screen & Screen-First Zero Latency Dispatch
- **Synchronous Screen-First Triggering (`src/context/MediaContext.tsx`, `src/services/callSignaling.ts`)**:
  - Refactored `startDmCall` to construct call state and invoke `setOutgoingCall` synchronously in the very first execution microtask, ensuring the floating call UI renders before or simultaneously with the ring chime.
  - Decoupled PocketBase notification creation and database event recording from the call dispatch loop, executing them asynchronously in the background.
- **Pre-Loaded Floating Call Window (`src/App.tsx`, `src/components/FloatingCallWindow.tsx`)**:
  - Removed `<Suspense>` wrapper around `FloatingCallWindow` so it mounts immediately on application startup, pre-warmed in memory.
  - Unified the root transitions under `<AnimatePresence mode="wait">` for instantaneous, stutter-free spring animations.

## [4.46.0] - 2026-08-16
### Instant DM Call Lifecycle, Auto-Join Elimination & Persistent Call Logs
- **Eliminated Unsolicited Auto-Join (`src/context/MediaContext.tsx`)**:
  - Refactored `startDmCall` so the caller enters a dedicated `outgoingCall` ringing state without preemptively joining the media room or adding simulated participants before the recipient answers.
  - Media room session and audio/video connections now activate only when the recipient explicitly accepts (`acceptCall` / `call_accept` signal), ensuring full signaling parity between caller and callee.
- **Zero-Latency Call Triggering & Cancellation (`src/App.tsx`, `src/context/MediaContext.tsx`, `src/components/FloatingCallWindow.tsx`)**:
  - Removed lazy-loading overhead on `FloatingCallWindow` and decoupled background DM channel synchronization from call initiation, displaying the floating call widget with 0ms delay.
  - Enhanced `cancelOutgoingCall` to immediately silence ringtones, emit cancellation signaling, and tear down ringing states instantly.
- **Call History Logging in Chat Feed (`src/services/callLogService.ts`, `src/components/ChatPanel.tsx`)**:
  - Added structured call logging that records call events directly into the DM chat history with metadata (call type, status, duration, timestamps).
  - Designed interactive Call Log cards in the chat feed displaying:
    - **Missed Call**: Rose icon (`PhoneMissed` / `VideoOff`), "Missed Call" title, "No answer" status, and a quick "Call Back" action.
    - **Declined Call**: Slate/rose icon (`PhoneOff`), "Declined Call" title, and a "Call Back" action.
    - **Cancelled Call**: Slate icon (`PhoneOff`), "Cancelled Call" title, and a "Call Back" action.
    - **Ended Call**: Accent icon (`PhoneCall` / `Video`), "Call Ended" title, formatted duration (`0:45`, `12:30`), and a "Call Back" action.

## [4.45.0] - 2026-08-16
### Resilient Media & SFU Connection Error Recovery
- **LiveKit Connection Lifecycle & Auto-Reconnect Fix (`src/media/livekit/LiveKitManager.ts`)**:
  - Corrected disconnect lifecycle flags (`isExplicitlyJoined`, `wasConnected`, `currentRoomConfig`) on initial connection failure to prevent unhandled auto-reconnect loops.
  - Implemented backoff reconnection strategy capped at 3 attempts with safe cleanup on failures.
- **Graceful Media Fallback (`src/media/RealtimeMediaProvider.ts`, `src/context/MediaContext.tsx`)**:
  - Enhanced `RealtimeMediaProvider.joinRoom` to handle remote SFU unavailability gracefully without destroying active voice sessions or crashing DM call initialization.
  - Ensured local media devices (microphone, camera, speaking detection, audio mixer) remain completely stable during transient network and signal drops.

## [4.44.0] - 2026-08-16
### Floating Call Window with Ringing Signal & Schema-Optimized Server Loading
- **DM Call Signaling & Floating Call Window (`src/components/FloatingCallWindow.tsx`, `src/services/callSignaling.ts`, `src/context/MediaContext.tsx`, `src/lib/sounds.ts`)**:
  - Replaced legacy modal with a non-intrusive floating call widget supporting incoming calls, outgoing ringing calls, and active calls.
  - **Outgoing Ringing Signal**: Caller now hears outgoing ringback tone and sees clear visual ringing indicators ("Ringing..." / "جارٍ الاتصال...").
  - **Mute Ring Feature**: Added ring mute toggle (`BellOff` / `Bell`) allowing users to silence the ringtone locally without cancelling the call or losing the ringing status.
  - **Call Controls**: Complete Answer, Reject, Mute Mic, Camera Toggle, Screen Share, Audio Mixer, and End Call controls with live duration timer.
- **Fast-Path Server Loading via `in_servers` (`src/pocketbase.ts`, `src/types.ts`)**:
  - Optimized `fetchServers` using the user's `in_servers` expanded relation for fast single-call server retrieval.
  - Synchronized `in_servers` state on `joinServer` and `leaveServer` operations.

## [4.43.0] - 2026-08-16
### Privacy Enhancement for Blocked Messages & Clean DM Header
- **Blocked Message Privacy & Author Masking (`src/components/ChatPanel.tsx`)**:
  - Hiding a blocked user's message now also obscures the sender's identity (replacing their display name with "Blocked User" / "مستخدم محظور" and replacing personal avatars with a generic blocked badge).
  - Disabled interactive mention/profile click triggers on hidden blocked headers.
  - Hidden blocked messages in reply threads and quotes now mask the sender username and content preview until revealed.
  - Suppressed floating message action toolbars when viewing hidden blocked messages.
- **Simplified DM Header UI (`src/components/ChatPanel.tsx`)**:
  - Removed the redundant "Close" button from the top header in direct message chats while keeping the close action available in the sidebar DM channel list.

## [4.42.0] - 2026-08-16
### Full App & Chat Performance Optimization: Instant DMs ↔ Channels Switching & Stable Cache Merging
- **Instant DMs ↔ Channels Switching (`src/App.tsx`, `src/components/ChannelList.tsx`)**:
  - Implemented LRU mounted channels retention in `mountedChannelsMap` (up to 12 active channels/DMs preserved in the DOM).
  - Toggling between recently visited channels and DMs is now instant (0ms DOM visibility toggle) without unmounting or re-rendering components.
  - Eliminated navigation delays, layout shifts, and scroll jumps when navigating across channels and direct messages.
  - Optimized tab switching in `ChannelList.tsx` with memoized accessible channels, text channels, and deduplicated DM listings.
- **Reference-Preserving Message Merging (`src/lib/messageDiff.ts`, `src/App.tsx`)**:
  - Implemented `areMessagesEqual` and `mergeMessageListPreservingReferences` to compare incoming background updates against in-memory message state.
  - Prevents recreating message arrays and triggering full feed re-renders when data has not changed.
  - Reuses exact object references for unchanged message items, preventing unneeded re-renders of message cards, reactions, attachments, and scroll metrics.
- **DOM Valid Structure & Hydration Fix (`src/components/ChannelList.tsx`)**:
  - Restructured direct message items in the channel list to use a flex container with sibling button elements, eliminating invalid nested `<button>` inside `<button>` HTML errors.
- **Eliminated setState Calls During Render (`src/components/ChatPanel.tsx`)**:
  - Removed state mutation side-effects inside render-time helpers `resolveSenderUser` and `renderFormattedContent`.
  - Replaced inline `setAllUsersList` calls during render with background cache population in `pbService`, eliminating the "Cannot update a component (`ChatPanel`) while rendering a different component" error.

## [4.41.0] - 2026-08-16
### Blocked Messages Placeholder, DM Deduplication, and Close DM Functionality
- **Blocked Users Message UI & Toggle (`src/components/ChatPanel.tsx`)**:
  - Blocked users' messages now display as a discreet "Blocked message — Click to show" placeholder banner.
  - Clicking the banner reveals the message content and attachments, with a visible badge and toggle option to re-hide the message at any time.
  - Optimized hide/show performance by properly binding `revealedBlockedMsgIds`, `blockedUserIdsSet`, and a memoized `toggleRevealBlockedMessage` handler into the message feed rendering memoization, delivering instantaneous zero-delay hide and reveal transitions.
  - Expanded blocked user ID resolution across user profile blocked arrays and local privacy cache settings.
  - Completely hides attachments when the message from a blocked user is collapsed.
- **Direct Message Deduplication (`src/components/ChannelList.tsx`, `src/App.tsx`, `src/services/offlineCacheService.ts`)**:
  - Deduplicated direct message listings by recipient user ID across local state, memory cache, and IndexedDB cache.
  - Pruned optimistic message echoes when confirmed messages arrive to eliminate duplicate message rendering.
- **Close Direct Message Feature (`src/components/ChannelList.tsx`, `src/components/ChatPanel.tsx`, `src/App.tsx`)**:
  - Added a "Close DM" button with an 'X' icon to both sidebar DM channel rows (hover/focus) and the active DM header toolbar.
  - Persists closed DM states in `localStorage` and cleans up active views while keeping full message history intact on server and cache.
  - Automatically re-opens the direct message conversation seamlessly whenever the user starts a new DM or receives a new message from that recipient.

## [4.40.0] - 2026-08-10
### Strict Video-Only Screen Sharing & Voice Audio Channel Isolation
- **Screen Share Audio Isolation (`src/media/RealtimeMediaProvider.ts`, `src/media/livekit/LiveKitManager.ts`)**:
  - Configured `getDisplayMedia` constraints to strictly request `audio: false` and `systemAudio: 'exclude'`.
  - Added explicit track cleanup that immediately stops any captured audio tracks on screen capture streams before publishing.
  - Disabled `publishScreenAudioTrack` in `LiveKitManager` to guarantee video-only screen sharing and prevent application/system voice loopback or echo.
  - Maintained complete separation between the microphone/voice call path and the screen share path without muting user microphones or reconnecting LiveKit voice channels.

## [4.39.0] - 2026-08-10
### Per-User Voice Volume Persistence & Media Resource Management
- **Per-User Voice Volume Persistence (`src/services/audioMixer.ts`, `src/media/RealtimeMediaProvider.ts`, `src/media/livekit/LiveKitManager.ts`, `src/components/VoicePanel.tsx`)**:
  - Bound participant volume state directly to `audioMixer.getParticipantVolume(userId)`, persisted locally in `localStorage` (`sirver_audio_mixer_v1`) keyed by stable `userId`.
  - Prevented participant updates, presence changes, camera/mic state changes, and reconnects from overwriting saved participant volumes with default `100`.
  - Applied volume adjustments directly to HTML `<audio>` elements and LiveKit remote participant track audio levels.
- **Android Memory & Video Stream Cleanup (`src/components/video/VideoPlayer.tsx`, `src/media/livekit/LiveKitManager.ts`)**:
  - Added explicit stream detachment (`videoEl.pause(); videoEl.srcObject = null;`) upon `VideoPlayer` unmount or track removal to release hardware video decoder buffers immediately.
  - Ensured audio element teardown (`pause()` and `remove()`) when participants disconnect or tracks unmount.

## [4.38.0] - 2026-08-09
### Complete Elimination of Typing Freeze & Full Callback Stabilization
- **Callback Stabilization (`src/components/ChatPanel.tsx`)**:
  - Wrapped `handleCopyMessageLink`, `handleCopyMessageText`, `handleTogglePin`, `handleMemberListScroll`, `isUserAuthorizedToDelete`, and `isUserAuthorizedToEdit` in `React.useCallback` with stable dependencies.
  - Stopped callback instance churn on every character entry, ensuring that `MessageList` and `MemberListContent` `useMemo` / `React.memo` gates remain 100% stable while typing.
- **Forced Reflow Prevention in `adjustTextareaHeight` (`src/components/ChatPanel.tsx`)**:
  - Refined textarea height adjustment fast-path to check `el.scrollHeight <= 38` and `!val.includes('\n')` before touching DOM style properties, completely eliminating forced layout thrashing on single-line text typing.
  - Stabilized `channelPerms` with `React.useMemo` to prevent permission re-evaluations during text input.
### Deep Typing Latency Optimization & Message Feed Isolation
- **Message List Feed Memoization (`src/components/ChatPanel.tsx`)**:
  - Encapsulated the entire virtualized message list computation and DOM render tree inside `React.useMemo`, bound strictly to message array/channel state changes and completely independent of `inputText`.
  - Typing in the chat textarea now produces ZERO message feed re-renders, eliminating full-panel virtual list DOM reconciliations on keystrokes.
- **MemberList Content Isolation (`src/components/ChatPanel.tsx`)**:
  - Wrapped `MemberListContent` inside `React.memo` to prevent member panel re-renders while typing messages.
- **Mention Query Filtering Optimization (`src/components/ChatPanel.tsx`)**:
  - Memoized user mention list calculations (`filteredMentionUsers`), bypassing user searching logic during standard character typing.

## [4.36.0] - 2026-08-09
### Instant Sub-Millisecond Typing & Clean Sockets Architecture
- **Instant Text Input Performance (`src/components/ChatPanel.tsx`)**:
  - Implemented fast-path newline-difference check in `adjustTextareaHeight()`: continuous single-line typing bypasses `el.style.height = "auto"` and `scrollHeight` reads completely, eliminating forced synchronous DOM reflows.
  - Added string `val.includes('@')` pre-check before running regex match for `@` mention detection in `handleInputChange()`, avoiding regex computations on standard text typing.
- **Clean Sockets Architecture (`src/services/websocket.ts`)**:
  - Added unique tab `instanceId` to `WSEvent` payloads to prevent BroadcastChannel loopback self-emissions within the same window instance.
  - Implemented clean exponential backoff reconnect policy (starting at 3s, doubling up to max 30s) on socket disconnects with silent error handling to avoid console log spamming when WS endpoint is unavailable.
  - Added explicit `disconnect()` method for graceful socket connection teardown.

## [4.35.0] - 2026-08-09
### Instant Message Input Performance & Complete Removal of Typing Indicators
- **Instant Message Typing Input (`src/components/ChatPanel.tsx`)**:
  - Deferred `adjustTextareaHeight()` calculations directly to `requestAnimationFrame` to eliminate synchronous DOM layout reflows (`scrollHeight` reads) during `onChange` text typing.
  - Wrapped `@` user mention filtering (`filteredMentionUsers`) in `useMemo` to skip user list re-filtering on unrelated state updates.
  - Removed `onKeyUp={checkTextSelection}` handler from the chat textarea component to avoid unnecessary text selection state updates on every key release.
- **Complete Typing Indicators & Noise Detection Removal (`src/media/RealtimeMediaProvider.ts`, `src/media/livekit/LiveKitManager.ts`)**:
  - Set `googTypingNoiseDetection: false` across WebRTC and LiveKit media streams.
  - Removed typing indicator listeners and status overlays across chat and media providers.

## [4.34.0] - 2026-08-07
### Input Typing Performance Optimization & Typing Indicator Z-Priority Fix
- **Eliminated Text Input Lag & Freezing (`src/components/ChatPanel.tsx`)**:
  - Refactored `adjustTextareaHeight()` to eliminate layout thrashing: replaced synchronous `el.style.height = 'auto'` calls on every keypress with non-blocking height checks and deferred `requestAnimationFrame` recalculation when text shrinks.
  - Removed redundant `checkTextSelection()` invocations from textarea `onChange` event handlers, keeping text selection updates strictly on selection/mouse/keyboard events.
  - Optimized mention query matching (`setMentionQuery`) and selection checks (`setHasTextSelection`) with functional state comparisons, preventing unnecessary re-renders when typing regular message text.
- **Typing Indicator Z-Priority & User Filtering (`src/components/ChatPanel.tsx`)**:
  - Adjusted typing indicator bar Z-priority to `relative z-40`, matching the form container (`relative z-30`) to ensure it sits cleanly above message feed backgrounds and scroll overlays.
  - Enhanced typing user filters to exclude `currentUser.id`, `currentUser.username`, `currentUser.display_name`, and `currentUser.email`, preventing the local user from seeing their own name in the typing indicator bar.
### Light Mode High Contrast Side Panels, Black Date Separators & Member List Border
- **Light Mode High Contrast Side Panels (`src/theme/adminThemeService.ts`, `src/theme/tokens.ts`, `src/index.css`)**:
  - Replaced near-white (`#F4F4F5`, 96% lightness) default light tokens in `adminThemeService.ts` with a distinct, rich light slate contrast color (`--theme-bg-secondary: #D4D4E0`, `--theme-bg-tertiary: #C2C2CE`, `--theme-border: #A0A0B2`).
  - Ensures side panels, channels list, and member list stand out with high contrast against the pure white (`#FFFFFF`) chat background without needing external display adjustments.
- **Light Mode Black Date/Time Separator (`src/components/ChatPanel.tsx`)**:
  - Updated chat date/time dividers in light mode to use crisp dark/black separator lines (`bg-black/80`) and a high-visibility badge (`bg-slate-200 text-black border-black/40 font-black`), ensuring date dividers stand out prominently against light backgrounds.
- **Server Members List Border (`src/components/ChatPanel.tsx`)**:
  - Added visible border outline (`border border-[var(--theme-border)]`) to the server members panel on PC and mobile drawers for clear visual structure and separation.

## [4.32.0] - 2026-08-07
### Enhanced Side Panel Contrast, PC Channel Separator & Curved Member List Top Corner
- **Enhanced Side Panel Contrast (`src/index.css`, `src/theme/tokens.ts`, `src/theme/adminThemeService.ts`)**:
  - Dark Mode: Elevated side panel tone (`--theme-bg-secondary: #262630`, `--theme-bg-tertiary: #323240`, `--theme-bg-card: #22222B`, hover: `#363646`, active: `#444458`) for prominent contrast against the pure black (`#000000`) chat canvas.
  - Light Mode: Deepened side panel tone (`--theme-bg-secondary: #D2D2DA`, `--theme-bg-tertiary: #C2C2CC`, hover: `#C6C6D0`, active: `#B8B8C4`) for clear contrast against the pure white (`#FFFFFF`) chat canvas.
- **PC-Only Channel Panel Separator (`src/components/ChannelList.tsx`)**:
  - Added a clean border separator between the channels side panel and main chat area on PC views (`md:border-r` in LTR, `md:border-l` in RTL).
- **PC-Only Curved Top Corner for Server Members List (`src/components/ChatPanel.tsx`)**:
  - Added a rounded top corner for the visible top edge of the server member list on PC (`md:rounded-tl-2xl` in LTR, `md:rounded-tr-2xl` in RTL), creating a refined visual transition with the chat area.

## [4.31.0] - 2026-08-07
### Immediate Bottom Positioning & Transparent Gallery Grid Panel on PC
- **Zero-Flicker Initial Scroll Lock (`src/components/ChatPanel.tsx`)**:
  - Implemented initial channel load locking with `initialChannelLoadLockRef` and `isInitialLoadReady` visual pre-rendering state.
  - When opening a channel or DM, initial scroll locking waits until messages for the selected channel populate (`sortedMessages.length > 0`), preventing early execution on an empty array before fetch completes.
  - Ensures the viewport synchronously locks directly to the absolute bottom of all rendered channel messages before releasing visual pre-rendering lock, completely eliminating landing on top messages.
  - Included a 200ms fallback for genuinely empty channels to display start-of-channel greetings seamlessly.
  - Kept viewport pinned to the bottom during the initial layout pass, releasing the scroll lock smoothly once rendering stabilizes.
  - Preserved all existing scroll anchoring, history pagination, media lazy loading, and manual scroll behavior once initial load completes.
- **Translucent Gallery Grid & Smooth Exit Animation (`src/components/ChatPanel.tsx`)**:
  - Replaced static non-transparent background overlay (`bg-[var(--theme-bg-primary)]/95`) with a semi-transparent `bg-black/50` overlay backdrop and `bg-[var(--theme-glass-bg)]` translucent modal panel.
  - Converted gallery grid backdrop and lightbox modal overlays into animated `motion.div` components inside `AnimatePresence`.
  - Added smooth exit fade transitions (`duration: 0.2s`) so both the translucent backdrop and modal card smoothly fade out and shrink on close without cutting abruptly.

## [4.30.0] - 2026-08-06
### Realtime Synchronization, Input Optimization & Mobile Overlay Fixes
- **WebSocket Property Normalization & Typing Reliability (`src/services/websocket.ts`, `src/App.tsx`)**:
  - Implemented bidirectional field normalization (`channelId` <-> `channel_id`, `userId` <-> `user_id`, `messageId` <-> `message_id`) for incoming and outgoing WebSocket events.
  - Fixed issue where typing indicators dropped due to field casing mismatches between Go backend and client state listeners.
  - Cleaned up typing timeouts and reset active typing state on channel switches.
- **Input Lag & Typing Freeze Prevention (`src/components/ChatPanel.tsx`)**:
  - Extracted formatted message content rendering into a memoized `FormattedMessageContent` component (`React.memo`).
  - Isolated keystroke input state changes (`inputText`) so typing into the chat input field skips re-rendering and regex re-parsing of past message items in the channel list, maintaining a smooth 60 FPS.
- **0ms Realtime Message Latency (`src/pocketbase.ts`, `src/App.tsx`)**:
  - Eliminated blocking `await pbService.getMessageById()` calls and attachment readiness checks inside SSE message event handlers.
  - Raw incoming message events are rendered synchronously in local state (0ms latency), while relation expansions (avatars, attachments) populate asynchronously in the background.
- **Mobile Notifications & Pinned Overlays Layout (`src/components/NotificationsPopover.tsx`, `src/components/PinnedMessagesPopover.tsx`)**:
  - Adjusted mobile overlay container layout to be fixed, horizontally centered, and positioned directly underneath the top chat header (`top-[calc(3.5rem+env(safe-area-inset-top,0px))]`).
### Mobile UI/UX & Settings Modal Redraw Fixes
- **Settings Panel Redraw Fix (`src/components/SettingsModal.tsx`)**:
  - Replaced lazy-loaded `DownloadsTabContent` and `UpdatesTabContent` with static imports to keep `SettingsModal` continuously mounted during tab switches.
  - Preserves scroll position, component state, and tab selection without modal unmounting, flickering, or redraws.
- **Mobile Sidebar Top Spacing & Status Bar Safe Area (`src/App.tsx`, `src/components/ChatPanel.tsx`)**:
  - Added safe area top inset padding (`pt-[env(safe-area-inset-top,0px)]`) to the mobile channel sidebar and members list drawers.
  - Prevents sidebars from overlapping or rendering underneath the Android/iOS status bar or header title bar.
- **Sidebar Switch Button Synchronization (`src/components/ChannelList.tsx`)**:
  - Removed `layoutId="tabSwitcherActivePill"` from the "Servers / DMs" active tab indicator pill to eliminate Framer Motion global layout projection offsets.
  - Ensures the button indicator pill transforms in perfect 1:1 synchronization with the sliding drawer.
- **Native-Feeling Mobile Swipe Gestures (`src/App.tsx`, `src/components/ChatPanel.tsx`)**:
  - Configured 1:1 gesture tracking for edge swiping right to open servers sidebar, edge swiping left to open members list, and swiping to close.
  - Integrated angle detection (`Math.abs(dy) > Math.abs(dx)`) to ignore horizontal gestures during vertical scrolling, preserving smooth message/member list scrolling.
  - Added 30% width snapping and velocity threshold detection.
- **Responsive Mobile Sidebar Width (`src/App.tsx`, `src/components/ChatPanel.tsx`)**:
  - Reduced mobile drawer width from fixed 320px (`w-80`) to responsive `w-[50vw] max-w-[280px] sm:w-[42vw] sm:max-w-[340px] md:w-80`.
  - Leaves 50% of screen showing chat background on phones, matching Discord mobile.

## [4.28.0] - 2026-08-06
### Server-Authoritative Message Pagination & Infinite Scroll Fix
- **Server End-of-History Detection (`src/App.tsx`, `src/pocketbase.ts`)**:
  - Fixed premature end-of-history bug where message pagination was incorrectly marking the beginning of chat history as reached on page 1 or page 2 when deleted items or local cache merging occurred.
  - Updated `loadMessages` to derive `hasMoreMessages` strictly from PocketBase server pagination response (`pageNum < result.totalPages`), ignoring local cache length or rendered message counts.
  - Enhanced `fetchDirectMessages` with `forceRefresh` support to bypass stale DM caches when syncing network pagination.
  - Added development mode logging (`[PAGINATION_DEBUG]`) to track page requests, oldest loaded message IDs, total pages returned, and history completion reasons.

## [4.27.0] - 2026-08-06
### Global Console Logging Disable
- **Global Logging Removal (`src/main.tsx`)**:
  - Unconditionally overridden `console.log`, `console.debug`, `console.info`, `console.warn`, `console.error`, and `console.trace` with no-op functions at application initialization to silence all console logging output across all environments.

## [4.26.0] - 2026-08-06
### Native 1:1 Mobile Drawers & Crisp Backdrop Rendering
- **Native 1:1 Touch Gesture Mobile Drawers (`src/App.tsx`, `src/components/ChatPanel.tsx`)**:
  - Implemented 1:1 edge & drag touch gesture manager for mobile Channel List drawer and Member List drawer with full RTL (`ar`/`en`) support.
  - Replaced legacy Framer Motion drawer slide-overs with real-time hardware-accelerated touch coordinate tracking (`translateX`), velocity release threshold calculations, and dynamic backdrop opacity scaling.
  - Added axis-locking to prevent horizontal gesture conflicts during vertical scrolling.
- **Glass & Backdrop Blur Cleanup (`src/index.css`, `src/App.tsx`, `src/components/*`)**:
  - Removed remaining legacy `backdrop-blur` CSS classes across modals, overlays, floating bars, and drawers, ensuring crisp, high-contrast, zero-flicker rendering across all viewports and low-power devices.

## [4.25.0] - 2026-08-06
### Outgoing Friend Request Cancellation System
- **Backend Service Friend Request Cancellation (`src/pocketbase.ts`)**:
  - Implemented `cancelFriendRequest(senderId, targetUserId)` to remove outgoing requests from the sender's profile settings and target user's settings/notifications.
  - Ensures clean DB synchronization and triggers realtime profile updates for both users.
- **Discovery Center Friend Requests Integration (`src/components/DiscoveryCenter.tsx`)**:
  - Updated `syncFriendsAndRequests()` to automatically purge stale incoming requests if the sender cancels them.
  - Added `handleCancelRequest` to provide instant local state updates and DB sync when revoking an outgoing request.
  - Replaced static "Pending" badge in Pending tab and Search tab with an interactive **Cancel Request** (**إلغاء الطلب**) button.
  - Restores the **Add Friend** button instantly upon cancellation without requiring page refreshes.
- **User Profile Modal Outgoing Cancellation (`src/components/UserProfileModal.tsx`)**:
  - Implemented `handleCancelFriendRequest` in profile cards.
  - Replaced the passive "Pending" badge with an interactive **Cancel Request** button that resets `relStatus` back to `'none'` immediately upon cancellation.

## [4.24.0] - 2026-08-06
### Windows Desktop Audio Pipeline, Friends Center Interactions, Leave Server & Channel Permissions System
- **Windows Desktop Microphone Capture Audit & Zero-Gain Output Fix (`src/media/RealtimeMediaProvider.ts`, `src/media/livekit/LiveKitManager.ts`)**:
  - Identified and resolved Windows WebView2/Tauri audio pipeline lock where mic input routed through local WebAudio analyzers triggered feedback / self-mute loops.
  - Attached ScriptProcessor / AnalyserNode to a `GainNode` with `gain.value = 0` prior to `audioContext.destination`, preventing audio loopbacks while preserving accurate real-time speech energy detection.
  - Added `switchMicrophone` with persistent device selection in `localStorage` and audio input diagnostic UI in `CameraQualitySettings.tsx`.
- **GIF Playback Settings Engine (`src/lib/userSettings.ts`, `src/components/GifImage.tsx`, `src/components/Avatar.tsx`, `src/components/SmartGifImage.tsx`, `src/components/UserProfileModal.tsx`, `src/components/SettingsModal.tsx`)**:
  - Added user configurable `gifPlayback` setting (`always` | `hover` | `never`) to control animated GIF banners, avatars, and attachments.
  - Built `GifImage.tsx` utilizing canvas frame freeze fallback for static GIF display when animations are paused or disabled.
  - Integrated `IntersectionObserver` to pause off-screen GIFs and conserve CPU/GPU resources.
- **Discovery → Friends Interactions & Direct Actions (`src/components/DiscoveryCenter.tsx`, `src/App.tsx`)**:
  - Enabled direct user profile popouts when clicking on user rows in All Friends, Pending Requests, and Search/Discover Users tabs in `DiscoveryCenter`.
  - Added direct quick action buttons for **Send Message (DM)**, **Start Voice Call**, and **Friend Actions** (Add Friend / Pending / Remove Friend) directly on user cards.
- **Leave Server Button & State Cleanup (`src/App.tsx`, `src/components/ChannelList.tsx`, `src/components/ServerSettingsModal.tsx`)**:
  - Added clean "Leave Server" options for non-owner server members in both the Server Header Context Menu (`ChannelList.tsx`) and Server Settings Danger Zone (`ServerSettingsModal.tsx`).
  - Implemented explicit confirmation prompts and comprehensive state cleanup in `handleLeaveServer` (`App.tsx`), automatically resetting active server, switching channels, updating `servers` state, and closing active modals upon leaving.
- **Channel Permission System & Hierarchy (`src/lib/channelPermissions.ts`, `src/components/ChannelList.tsx`, `src/components/ChatPanel.tsx`)**:
  - Created `/src/lib/channelPermissions.ts` implementing complete channel permission evaluation hierarchy:
    1. Server Owner & Admin Overrides (`manage_server`, `manage_channels`, global admin).
    2. Private channel access restrictions (`visible_roles`).
    3. User-specific channel permission overrides (`permission_overrides[userId]`).
    4. Role-based permission overrides (`permission_overrides[roleId]`).
    5. Default server fallback permissions.
  - Applied `filterAccessibleChannels` in `ChannelList.tsx` to automatically hide restricted text/voice channels from unauthorized users.
  - Integrated `evaluateChannelPermissions` in `ChatPanel.tsx` to disable inputs, attachment uploads, and submit triggers with a clear permission placeholder message when a user lacks send message rights.
- **Server Description Header Visibility (`src/components/ChannelList.tsx`, `src/lib/serverPassword.ts`)**:
  - Integrated `stripServerPassword` to automatically strip internal password tags (`[password:...]`) from displayed server descriptions in the header.
  - Improved server description truncation with `leading-tight` and full description tooltips (`title`) on hover in the ChannelList top header.
### User Profile Theme Isolation, Instant Settings Modal & Interaction Refinements
- **User Profile Theme Isolation (`src/components/UserProfileModal.tsx`)**:
  - Isolated user profile cards, biography/about sections, and profile elements to strictly adhere to custom user profile styling (`cardColor1`, `cardColor2`, custom gradients, dark glass background tokens).
  - Removed app theme variable tokens (`var(--theme-*)`) from user profile cards and biography section to prevent application light/dark themes from bleeding into customized user profiles.
- **Instant Settings Window Opening (`src/components/SettingsModal.tsx`, `src/App.tsx`)**:
  - Eliminated first-open delay when opening the Settings window.
  - Converted heavy subtab modules (`GlobalThemeManagerTab`, `TextTokensManagerTab`, `DownloadsTabContent`, `UpdatesTabContent`, `CameraQualitySettings`) to `React.lazy` code splitting wrapped in `<Suspense>`.
  - Deferred initial server roles, members, and options network loading in `SettingsModal` so they execute only when the `servers` tab is active, allowing the appearance settings view to mount immediately.
  - Reduced background chunk preloading delay in `App.tsx` to 200ms after user idle for instant chunk availability.
- **Enter Key Behavior While Editing Messages (`src/components/ChatPanel.tsx`)**:
  - Updated inline message editor key handling in `ChatPanel.tsx`.
  - `Enter` (without Shift) saves and confirms message edit.
  - `Shift + Enter` inserts a newline.
  - `Escape` cancels editing without saving.
- **Server Members Panel Viewport Anchor Stability (`src/components/ChatPanel.tsx`)**:
  - Implemented live viewport scroll anchoring (`getLiveViewportAnchor` and `restoreViewportAnchor`) in `ChatPanel.tsx`.
  - Captures the exact message currently visible under the user's eyes along with its relative top pixel offset prior to and during member panel toggle transitions.
  - Automatically compensates for line re-wrapping and message height changes as container width expands or contracts frame-by-frame during panel animations.
  - Ensures opening or closing the Server Members panel leaves the user's reading position 100% stationary without jumping, scrolling, or resetting.
- **Duplicate In-Call Floating UI Elimination (`src/components/ChatPanel.tsx`, `src/App.tsx`)**:
  - Guarded floating `MinimizedVoiceBar` mounting in `ChatPanel.tsx` with `isMobilePlatform()`.
  - Ensures desktop environments (Windows, Linux, macOS, Tauri) mount only the persistent desktop voice control dock above the user profile in the sidebar (`ChannelList.tsx`) without rendering duplicate floating top bars in chat, while preserving full floating bar functionality on mobile devices.
- **Voice Channel Usernames Light Mode Readability (`src/components/ChannelList.tsx`)**:
  - Replaced hardcoded pale `text-slate-200` tokens in `ChannelList.tsx` with dynamic `text-[var(--theme-text-primary)]` for active voice channel participant lists.
  - Ensures voice channel usernames automatically adapt with high contrast across both Light Mode and Dark Mode themes.
### Chat Engine Audit, Lifecycle Fixes & Stable Deferred Media Placeholders
- **True Bottom Anchor on Channel Open (`src/components/ChatPanel.tsx`)**:
  - Resolved issue where initial viewport stopped 4–5 messages above the bottom due to premature scroll calculation before message DOM layout, sub-components, and images completed rendering.
  - Added multi-pass initial bottom anchoring during post-mount render passes (RAF + 50ms/150ms checks) and enhanced `executeScroll('mediaLoad')` to keep viewport glued to `scrollHeight - clientHeight` when anchored at bottom.
  - Adjusted `handleScrollFeed` bottom detection threshold (`distFromBottom <= 35` or `<= 120` when already at bottom) to prevent layout expansions from prematurely setting `isAtBottomRef.current = false`.
- **True User Edit Distinction (`src/components/ChatPanel.tsx`, `src/pocketbase.ts`)**:
  - Implemented `isMessageEdited` helper to accurately distinguish genuine user edits from initial message creation, server-side processing, and attachment upload syncs.
  - Excludes initial attachment updates that complete within 15 seconds of message creation while preserving the "Edited" badge for explicit user edits (`edited: true`, `edited_at` timestamp, or `updated` > 15s post-creation across sessions and reloads).
- **Expanded Media Preload Buffer & Instant Layout Reservation (`src/components/UploadedImagePreview.tsx`, `src/components/MusicPlayer.tsx`, `src/components/SmartGifImage.tsx`)**:
  - Separated media layout reservation (Stage 1) from media fetching/decoding (Stage 2).
  - Placeholders with locked aspect ratios and neutral dark styling render synchronously on component mount (Stage 1).
  - Expanded `IntersectionObserver` preload window to `3500px 0px 3500px 0px` (~4–5 screens ahead and behind), pre-fetching and decoding media in the background long before the user scrolls to it so placeholders are replaced before entering view.
- **Immediate History Request Termination at Chat Start (`src/App.tsx`)**:
  - Eliminated 4-5 repeated redundant network history requests after reaching the beginning of chat.
  - Updated `loadMessages` in `App.tsx` to check returned record count (`returnedCount >= limit`) and newly appended items (`updated.length > prev.length`).
  - Sets `hasMoreMessages = false` immediately on the exact first fetch that returns zero or partial results, preventing any further scroll-triggered history requests.
- **Adaptive Preload Threshold for Infinite Scroll (`src/components/ChatPanel.tsx`)**:
  - Increased infinite scroll trigger distance from static `600px` to a dynamic threshold equal to approximately 10 average message heights (`Math.max(1000, avgMsgHeight * 10)`).
  - Pre-fetches older chat history seamlessly before the user reaches the top of the message container while maintaining active request guards (`isFetchingMoreRef.current`, `isLoadingMore`) and synchronous layout scroll anchoring.
- **Immediate Mount Layout Reservation & Preload Window (`src/components/UploadedImagePreview.tsx`, `src/components/MusicPlayer.tsx`, `src/components/SmartGifImage.tsx`)**:
  - Separated media layout reservation (Stage 1) from media fetching and decoding (Stage 2).
  - Placeholders with locked aspect ratios (`computedAspectRatio`, `aspect-[16/9]`) and neutral grey/dark background styling render synchronously on component mount before any network activity or decoding begins.
  - Configured a generous `1200px 0px 1200px 0px` IntersectionObserver preload window (2–3 screens ahead and behind), allowing media decoding and thumbnail generation to complete in the background before the user scrolls to the item.
  - Maintained smooth `150ms` opacity crossfades (`transition-opacity duration-150 ease-out`) with zero layout shift, no scroll jumps, and unchanged fullscreen, gallery, and upload pipeline functionality.

## [4.21.0] - 2026-08-06
### Windows Desktop Voice Microphone & Chat Scroll Restoration Fixes
- **Windows Desktop Microphone Audio Pipeline Fix (`src/media/RealtimeMediaProvider.ts`, `src/media/livekit/LiveKitManager.ts`, `src/media/livekit/LiveKitSFUAdapter.ts`)**:
  - Resolved WASAPI endpoint lock issue on Windows desktop where `setupSpeakingDetector()` was attempting to open a second concurrent `navigator.mediaDevices.getUserMedia` capture handle alongside LiveKit's active audio track.
  - Re-architected `setupSpeakingDetector()` to attach WebAudio analyser directly to LiveKit's active local `MediaStreamTrack` (`sfuAdapter.getLocalAudioTrack()`).
  - Added explicit audio capture constraints (`echoCancellation: true, noiseSuppression: true, autoGainControl: true`) in `setMicrophoneEnabled` to ensure proper hardware audio driver initialization on Windows.
  - Added `[MIC_DIAGNOSTICS]` logging for track lifecycle, device selection, track creation, mute/unmute states, and publishing verification.
- **Voice Participant Avatar Continuous Visibility (`src/components/Avatar.tsx`)**:
  - Removed hover-dependent conditional rendering of `<img src={src}>` in `Avatar.tsx`.
  - Ensures participant avatars remain continuously rendered and visible in voice cards and member tiles at all times without hiding when not hovered.
- **Channel Scroll Position Restoration & Initial Open Alignment (`src/components/ChatPanel.tsx`)**:
  - Fixed issue where switching back to a previously visited channel restored to an incorrect position due to synthetic mount scroll events overwriting `conversationCache` with `0`.
  - Added `isInitialScrollPendingRef` guard in `handleScrollFeed` to prevent intermediate scroll events during channel transition from corrupting cached `scrollTop`.
  - Ensured channels opening for the first time or returning at bottom calculate `scrollEl.scrollHeight - scrollEl.clientHeight` synchronously before paint, positioning directly at the newest message with zero visible jump.

## [4.20.0] - 2026-08-05
### Voice & Video Call Lifecycle Refactoring & State Management Stabilization
- **Decoupled Voice Presence from Media Connection Authority (`src/services/voicePresenceStore.ts`, `src/media/RealtimeMediaProvider.ts`)**:
  - Re-architected voice presence (`voicePresenceStore`) to operate purely as an overlay and discovery mechanism for voice channel member lists.
  - Presence heartbeats and stale timeouts no longer initiate media teardown or invoke `removeParticipant` on `RealtimeMediaProvider`. The WebRTC / LiveKit connection state remains the sole authority for media sessions.
  - Extended presence stale grace period from 15s to 30s to absorb WebSocket packet delays, browser tab background throttling, and transient network jitter without dropping presence prematurely.
  - Explicit user actions ("Leave Call") emit explicit signals (`reason: 'explicit_leave'`) that bypass grace periods for instant cleanup.
- **20-Second Media Disconnect Grace Period (`src/media/RealtimeMediaProvider.ts`)**:
  - Unified unexpected media disconnect handling under a 20-second grace period. Disconnected participants are flagged as `isPendingDisconnect: true` / `connectionState: 'reconnecting'` while preserving their tracks and list position.
  - If media restores within 20s, the timer is cleared and the participant returns to `connected` without unmounting or resetting UI state.
- **Seamless Video Track Transition Buffering (`src/media/RealtimeMediaProvider.ts`, `src/components/ParticipantTile.tsx`)**:
  - Implemented 1500ms track removal buffering (`pendingTrackRemovalTimers`). When a remote video or screen track un-subscribes during adaptive bitrate layer switches, watching another participant's video, or camera toggles, the stream is buffered.
  - If a replacement track arrives within 1500ms, the removal timer is cancelled, ensuring video rendering remains smooth without flickering `activeVideoStream` to `null`.
  - Updated `ParticipantTile.tsx` to distinguish between intentional video disable and stream loss, preventing false 4-second "Reconnecting stream..." overlays and "Stream ended" toasts.
- **Member List Display Union (`src/components/VoicePanel.tsx`)**:
  - Updated `displayParticipants` in `VoicePanel.tsx` to render a set union of `voicePresenceStore` and active `RealtimeMediaProvider` participants.
  - Guarantees participants remain continuously visible in the channel member list even if a presence heartbeat is delayed while media remains active.
- **Structured Development Debug Logging (`[VOICE_LIFECYCLE]`)**:
  - Added unified lifecycle logging across presence heartbeats, stale pruning, media grace periods, track additions/removals, and explicit leave signals for easy debugging.

## [4.19.5] - 2026-08-04
### Chat Date & Day Separator Light Mode Visibility Fix
- **Enhanced Chat Date Separator Contrast (`src/components/ChatPanel.tsx`)**:
  - Upgraded side divider lines in light mode to `bg-slate-300` (from `bg-slate-200`) for crisp 1px line definition against light backgrounds.
  - Upgraded date pill circular badge container in light mode to `bg-slate-100` with high-contrast border `border-slate-300`, clear text `text-slate-700`, and subtle shadow `shadow-xs`, ensuring full visual distinction and legibility for "Today", "Yesterday", and full date headers.

## [4.19.4] - 2026-08-03
### Fixed Bottom Scroll Override & Scroll Jump Elimination
- **Removed Dynamic Virtual Spacer Slicing (`src/components/ChatPanel.tsx`)**:
  - Eliminated dynamic `setVirtualRange` window recalculation during feed scroll that caused `topSpacerHeight` estimated height mismatches and triggered scroll jumps when scrolling up from the bottom.
  - Rendered loaded channel messages directly without artificial top spacer shifts, enabling 100% native, smooth browser scrolling when navigating chat history or scrolling up from the bottom.
- **Preserved Seam-Free History Pagination**:
  - Maintained layout anchoring (`useLayoutEffect` on `sortedMessages`) when older messages are loaded near the top, keeping the user's reading position anchored to the exact pixel offset without overriding bottom scrolling.
### Fixed Infinite Scroll & History Pagination
- **Restored Infinite Scroll Stability (`src/components/ChatPanel.tsx`)**:
  - Removed duplicate `useLayoutEffect` hook that was clearing scroll anchor references prematurely on loading state toggles.
  - Increased virtualization message threshold from 120 to 300 messages to prevent visible reading items from being sliced out of the DOM during history fetch.
  - Expanded virtualization slice to render all prepended older messages whenever `loadMoreScrollAnchorRef` is active, guaranteeing 100% reliable element resolution by DOM ID (`#msg-xxx`).
  - Added a "Load previous messages" pill button in the top indicator as an immediate manual fallback when scrolling near the top of the chat container.

## [4.19.2] - 2026-08-03
### Seamless Chat Loading, Settings Animation & Avatar Optimization Control
- **Disabled Avatar Optimization on Load (`src/App.tsx`)**:
  - Removed the automatic `processAndOptimizeUserAvatar` call on startup to avoid background profile mutations and extra network operations on app launch.
- **Updated Settings Menu Transition (`src/components/SettingsModal.tsx`)**:
  - Replaced the spring physics transition in `SettingsModal.tsx` with a refined scale-fade transition (`scale: 0.94 -> 1`, `ease: [0.16, 1, 0.3, 1]`) for an elegant modal opening and closing effect.
- **Imperceptible Older Message Pagination (`src/components/ChatPanel.tsx`)**:
  - Added synchronous scroll anchoring via `useLayoutEffect` that locks the top visible reading message's offset (`anchorMsgId` and `anchorOffsetTop`) before paint when fetching older messages.
  - Keeps messages completely still relative to the viewport while older history and top indicators load, eliminating visual jumping, content shifting, and scrolling disruption.

## [4.19.1] - 2026-08-03
### Chat Scroll Synchronization & Member List Animation Stabilization
- **Smooth Member List Expand/Collapse Scroll Synchronization (`src/components/ChatPanel.tsx`)**:
  - Implemented continuous `requestAnimationFrame` (RAF) scroll position synchronization loop during the entire desktop server member list toggle transition (320ms).
  - Keeps chat messages pinned to the bottom or locked to the active reading anchor message on every frame while the container width resizes, eliminating chat content jumping, text wrapping thrashing, and visual shaking.
  - Added `overflow-anchor: none` to the main chat messages feed container and `will-change: width, opacity` to the desktop member list panel for smooth GPU compositing.

## [4.19.0] - 2026-08-02
### Performance Optimizations & UI Animation Refinement
- **Smart Off-Screen GIF Looping Optimization (`src/components/SmartGifImage.tsx`, `src/components/Avatar.tsx`, `src/components/ChannelList.tsx`, `src/components/ChatPanel.tsx`)**:
  - Implemented `SmartGifImage` component backed by `IntersectionObserver` and static `<canvas>` frame drawing to stop GIF animation playback when images leave the visible viewport, conserving GPU and CPU cycles.
  - Applied conditional GIF playback rules to server lists and icons in `ChannelList.tsx`: list items pause GIFs when closed and only play the currently active server icon; all icons animate when the server list is expanded.
  - Updated user avatars (`Avatar.tsx`) and chat message attachments (`ChatPanel.tsx`) with visibility observers to pause off-screen avatar/media animations automatically.
- **Dynamic 10-Message Memory Trimming & On-Demand Chat Loading (`src/App.tsx`, `src/components/ChatPanel.tsx`)**:
  - Configured un-cached initial chat loads to fetch only the last 10 messages for lightweight initial rendering and fast load times.
  - Added "See older messages" ("عرض الرسائل الأقدم") controls and dynamic upward scroll triggers to fetch older message history on demand.
  - Implemented automatic message list trimming (`handleTrimToLastTen`) when scrolling back to the bottom of a chat feed, keeping memory overhead low while allowing users to dynamically reload older messages without visual jumpiness.
- **Faster Settings Panel Modal Transition (`src/components/SettingsModal.tsx`)**:
  - Updated modal animation in `SettingsModal.tsx` to a faster spring physics transition (`stiffness: 650, damping: 35, mass: 0.5`) for a responsive, distinct enter and exit effect.
- **Responsive Channels / DMs Tab Switcher Animation (`src/components/ChannelList.tsx`)**:
  - Restored smooth sliding pill layout animation (`layoutId="tabSwitcherActivePill"`) with spring physics for switching between Channels and Direct Messages.
  - Automatically disables the sliding layout animation on small phone viewports (`<640px`) to eliminate layout shifts on mobile touchscreens.

## [4.18.0] - 2026-08-02
### Voice, Video Calling & Screen Share System Stability & Mirroring Fixes
- **Non-Mirrored Remote Transmitted Video (`src/components/ParticipantTile.tsx`, `src/components/FullscreenVideoOverlay.tsx`)**:
  - Configured camera video rendering so local previews only mirror when using front-facing camera for user comfort (`scaleX(-1)`), while back cameras and remote participants receive non-mirrored, original orientation.
  - Ensured rotation metadata and transformation CSS operate consistently across Android, Windows, and Linux.
- **Native Fullscreen Engine & Auto-Hiding Overlay Controls (`src/components/FullscreenVideoOverlay.tsx`)**:
  - Upgraded fullscreen video button and double-click handlers to utilize native browser/Capacitor fullscreen APIs (`requestFullscreen`, `webkitRequestFullscreen`).
  - Added full keyboard `Escape` key handling and Capacitor native Android `backButton` event listeners to cleanly exit fullscreen overlays without disconnecting or interrupting video playback.
  - Added auto-hiding overlay control bar with 2.5s inactivity timer on mouse move and tap interactions, plus 1:1 original resolution fit mode option.
- **Transient Connection Resilience & Frozen Last-Frame Retention (`src/media/livekit/LiveKitManager.ts`, `src/components/ParticipantTile.tsx`)**:
  - Implemented participant object & renderer retention during brief network glitches, ICE restarts, and LiveKit signaling reconnects.
  - Participants, video elements, and active fullscreen overlays remain mounted and alive during transient disconnects.
  - Video freezes the last decoded frame during transient packet loss or reconnects with a subtle "Reconnecting..." status indicator, preventing UI flicker or player destruction.
  - Updated LiveKit event handlers (`ParticipantDisconnected`, `ParticipantReconnecting`, `RoomReconnecting`, `RoomReconnected`) to maintain participant order and stream integrity, removing participants only after an extended grace timeout or deliberate leave.

## [4.17.0] - 2026-08-02
### Fullscreen Stream Disconnect Resilience & Touch Gesture Overlay
- **Stream Disconnect Grace Period (`src/components/ParticipantTile.tsx`, `src/components/FullscreenVideoOverlay.tsx`)**:
  - Implemented a 4-second stream retention grace period when watching a live video or screen share stream. Short network glitches or track renegotiations (lasting 0.2s–2s) no longer exit fullscreen mode or crash the overlay.
  - Added an in-stage reconnecting status overlay ("Reconnecting to stream...") with a subtle animated spinner that displays over the video stage during temporary stream re-syncs before resuming playback seamlessly.
- **Top z-Index Fullscreen & Touch Interaction Controls (`src/components/FullscreenVideoOverlay.tsx`)**:
  - Confirmed edge-to-edge `fill` rendering at highest z-index (`z-index: 2147483647`) via React Portal to render above all application windows, status bars, and title bars on Android and PC.
  - Implemented tap/touch interaction controls (`handleStageInteraction`) that hide control bars automatically after 2.5s of inactivity and immediately reveal control overlays whenever the user taps anywhere on the screen.

## [4.16.0] - 2026-08-02
### Fullscreen Edge-to-Edge Stretch Fill & Automatic System Sound
- **Edge-to-Edge Fullscreen Stretch (`src/components/FullscreenVideoOverlay.tsx`)**:
  - Changed default video fitting mode in `FullscreenVideoOverlay` to `fill` (`object-fit: fill`), ensuring video streams stretch to fill 100% of display dimensions on PC and Android devices without black letterbox/pillarbox borders.
  - Cycle order configured to `fill` (stretch edge-to-edge, no black borders) -> `cover` (zoom to fill, no black borders) -> `contain` (aspect ratio preserved).
- **Automated System Audio Activation (`src/media/RealtimeMediaProvider.ts`, `src/media/livekit/LiveKitManager.ts`)**:
  - Enforced default system audio constraints (`systemAudio: 'include'`, `audio: true`, `selfBrowserSurface: 'exclude'`) across all screen share requests.
  - Added explicit `el.autoplay = true`, `el.volume = 1.0`, and `el.play()` on all attached audio element streams in LiveKitManager to ensure system sound and remote audio start playing automatically.

### Automatic Microphone Join Sync Script
- **SFU Connection Order & Auto Join Mic Sync (`src/media/RealtimeMediaProvider.ts`)**:
  - Reordered `joinRoom()` to execute `sfuAdapter.joinSession(config)` prior to calling `enableMicrophone()`, ensuring LiveKit's local participant is fully initialized before track publishing occurs.
  - Added an automatic join microphone sync script (`setTimeout(..., 250)`) that re-verifies and auto-asserts `setMicrophoneEnabled(true)` upon joining a voice channel, eliminating the need to manually mute/unmute to initiate audio transmission.

## [4.15.0] - 2026-08-02
### Unified Screen Share & Camera Quality Profile Integration
- **Camera & Screen Share Quality Alignment (`src/media/RealtimeMediaProvider.ts`, `src/media/livekit/LiveKitManager.ts`, `src/media/livekit/LiveKitSFUAdapter.ts`, `src/types/media.ts`)**:
  - Implemented `getScreenProfileSpecs(profile)` helper in `RealtimeMediaProvider` that maps selected camera quality profiles (`auto`, `ultra`, `high`, `balanced`, `low`) directly to screen sharing constraints (resolutions up to 2560x1440, framerates up to 60 FPS, max bitrates up to 8.0 Mbps).
  - Updated `startScreenShare()` to pass resolved quality specs into both `navigator.mediaDevices.getDisplayMedia` constraints and `sfuAdapter.publishScreenTrack`.
  - Configured `setCameraQualityProfile(profile)` to dynamically re-apply media constraints and re-publish updated bitrates to the SFU when changing video quality during an active screen share session.
  - Modified `LiveKitManager.publishScreenTrack` to update video encodings via `setVideoEncoding` and apply `videoEncoding` parameters (`maxBitrate`, `maxFramerate`, `priority: 'high'`).
  - Added explicit `VideoQuality.HIGH` selection on remote video and screen share subscriptions in `subscribeWithRetry` and `RoomEvent.TrackSubscribed` to prevent SFU subscriber quality downscaling.

### Auto-Navigation to Voice Channel Screen
- **Voice Channel Screen Switch on Join (`src/App.tsx`)**:
  - Updated room connection state observer in `App.tsx` to detect when a user joins or switches a voice channel (via direct join, notification, or voice bar controls).
  - Automatically sets `activeVoiceChannel`, `activeChannel`, and parent `activeServer`, transitioning the UI directly to the full Voice Channel screen (`VoicePanel`).

### Mention Autocomplete UI & Automatic First-Load Avatar Optimization
- **Mention Autocomplete UI & Avatar Loading (`src/components/ChatPanel.tsx`)**:
  - Restructured the `@` mention autocomplete popup into a distinct, non-scrolling header (`Mention Member`) and an isolated scrollable member list wrapper to eliminate scrolling overlaps.
  - Integrated the `<Avatar>` component with `getAvatarUrl(user)` to load and display actual user avatars inside the mention autocomplete popover list.
- **First-Load Client-Side Avatar Optimization (`src/services/avatarProcessor.ts`, `src/App.tsx`, `src/types.ts`)**:
  - Created `processAndOptimizeUserAvatar` service that checks if a user's avatar has not been resized on app startup or authentication.
  - Resizes and converts non-optimized avatars to a lightweight WebP image (max 256x256, compressed quality) for faster loading and reduced network usage.
  - Updates database user record setting `avatar_processed: true`, preserving original avatar reference in `avatar_original`, and saving the lightweight optimized file for active user display.
### Voice Channel Auto-Join & Disconnect Channel Restoration
- **Eliminated Redundant "Join Voice" Prompt (`src/components/VoicePanel.tsx`, `src/context/MediaContext.tsx`)**:
  - Configured `joinVoiceRoom` to immediately set connection status to `connecting` upon invocation.
  - Simplified `VoicePanel` connecting state evaluation so selecting a voice channel automatically transitions straight to the connecting animation and active call stage without showing an unneeded secondary "Join Voice" landing gateway.
  - Added an inline Disconnect/Cancel button to the voice connecting stage.
- **Automatic Text Channel Restoration on Disconnect (`src/App.tsx`)**:
  - Saved `previousTextChannelRef` whenever a user enters a voice channel or switches text channels.
  - Added centralized `handleLeaveVoice` handler and `activeRoom` disconnection observer that automatically restores and loads the exact text channel that was active prior to entering voice chat.
### WebRTC DataChannel Abort & Disconnect Error Resolution
- **Global WebRTC Event Interception (`src/main.tsx`)**:
  - Registered global `unhandledrejection` and `error` event handlers to silently intercept benign WebRTC DataChannel closures (`LOSSY`, `RELIABLE`, `DATA_TRACK_LOSSY`) and `User-Initiated Abort` messages when leaving calls or switching channels.
- **LiveKit Client Log Level Control (`src/media/livekit/LiveKitManager.ts`)**:
  - Configured `setLogLevel('warn')` in `LiveKitManager` to prevent benign transport tear-down messages from throwing unhandled console rejections during session terminations.
### Comprehensive Text Tokens & Localization Expansion
- **Complete Application Text Token Coverage (`src/services/localization.ts`)**:
  - Expanded `defaultTranslations` to cover all application modules and sub-tabs including `Auth`, `Navigation`, `Chat`, `Voice`, `Profile`, `Settings`, `Downloads`, `Updates`, `Music`, `Server`, `ThemeEditor`, `Modals`, and `General`.
  - Updated `getCachedCustomTextTokens` to automatically merge missing default keys into cached token stores, ensuring administrators can immediately view and customize every single text token in the app.
- **Categorized Text Token Management (`TextTokensManagerTab.tsx`)**:
  - Expanded filter category list with dedicated tabs for `Downloads`, `Updates`, `Music`, `Server`, and `ThemeEditor`.
### Global Application Blur & Glassmorphism Removal
- **Global CSS Override (`src/index.css`)**:
  - Enforced `backdrop-filter: none !important` and `filter: none !important` across all `[class*="backdrop-blur"]` and `[class*="blur-"]` elements.
  - Eliminated fuzzy GPU blur overlays on modals, headers, sidebars, context menus, and call panels for clean, high-contrast UI execution.
- **Spoiler Element Restyling (`src/components/ChatPanel.tsx`)**:
  - Replaced text blur filters on unrevealed spoilers with crisp, solid redacted blocks (`bg-slate-900 text-slate-900 border-slate-800`).

## [4.9.0] - 2026-08-02
### Universal Download Reliability & File/Folder Opening
- **Automatic Browser & Desktop Fallback Downloads (`downloadManager.ts`)**:
  - Upgraded `executeDownload` to save blobs into IndexedDB AND auto-trigger native browser download to physical OS Downloads folder.
  - Added direct link fallback (`fallbackDirectBrowserDownload`) when CORS or network errors occur, ensuring files and updates download immediately without silent failures.
- **Enhanced File & Folder Opening (`tauriDesktopService.ts`, `DownloadsTabContent.tsx`)**:
  - Upgraded `openFileExternally` to assign `a.download` attributes on browser blob triggers for instant saving and launching.
  - Added multi-layered Tauri opener fallbacks (`window.__TAURI__.opener.openPath`, `window.__TAURI__.shell.open`, `plugin:opener|open_path`) for opening native Windows/Mac folders.
  - Fixed web browser mode folder locating to save files directly to the user's OS Downloads folder with clear localized notification toasts.
- **Manual Update Error Recovery (`UpdatesTabContent.tsx`)**:
  - Added automatic fail-safe browser download trigger for `Sirver-1.0.0.msi` manual updates.
  - Displayed explicit error recovery banners and one-click retry options if background downloads fail.

## [4.8.0] - 2026-08-02
### Default OS Download Location & Custom Folder Selector
- **Native OS Downloads Directory Resolution (`tauriDesktopService.ts`)**:
  - Updated `getDownloadDirectory` to resolve directly to the operating system's default Downloads directory across Windows, macOS, Linux, and Android.
  - Eliminated custom nested subfolders as the default download destination.
- **Custom Directory Picker & Browse Folder Button (`DownloadsTabContent.tsx`, `tauriDesktopService.ts`)**:
  - Added native folder browser GUI dialog (`selectFolderWithNativeDialog`) allowing users to pick any custom folder path in Settings -> Downloads.
  - Retained manual directory path input with instant validation and one-click reset to default OS downloads location.

## [4.7.0] - 2026-08-02
### Windows Manual Direct Update & Silent Installer Support
- **Manual MSI Downloader & Silent Installer (`UpdatesTabContent.tsx`, `tauriDesktopService.ts`)**:
  - Integrated dedicated Manual Update section in Settings -> Updates for Windows users.
  - Enables direct download of latest installer package (`https://sirverdata.top/downloads/Sirver-1.0.0.msi`).
  - Added `executeSilentMsiInstall` helper supporting silent background installation via `msiexec /i <path> /qn /norestart`.
  - Added live progress tracking, file location controls, and fallback direct link triggers for cross-platform support.

## [4.6.0] - 2026-08-02
### Voice Chat & Screen Sharing Subsystem Overhaul
- **Screen Share Visibility & Late-Join Synchronization (`LiveKitManager.ts`)**:
  - Implemented automatic check for active published screen share tracks upon joining rooms or reconnecting.
  - Added exponential backoff retries (`subscribeWithRetry`) for RemoteTrackPublications to guarantee track subscriptions regardless of event timing.
  - Cached screen share session state to enable seamless automatic re-publication upon network or connection state changes.
- **Microphone Permission Monitoring (`permissions.ts`, `RealtimeMediaProvider.ts`)**:
  - Added real-time listener for OS/browser permission state changes (`subscribeToPermissionChanges`).
  - Added detailed error codes (`PERMISSION_DENIED`, `DEVICE_UNAVAILABLE`) with clear, localized instructions for enabling microphone access when permissions are denied or revoked.
- **Join / Disconnect Lifecycle Cleanup (`LiveKitManager.ts`)**:
  - Refactored `leaveRoom` to perform a complete cleanup: detaching and removing all attached `<audio>` elements, unbinding room event listeners, stopping cached media tracks, and resetting screen share session state.
  - Eliminated stale track subscriptions and listener leaks during rapid room switching or unexpected disconnections.
- **Aspect-Ratio Preserved Fullscreen Video (`FullscreenVideoOverlay.tsx`)**:
  - Corrected default video fit mode to `contain` to prevent vertical squashing or stretching.
  - Added automatic letterboxing and aspect-ratio preservation across desktop monitors, rotated streams, and portrait/landscape orientations.
- **RTC Telemetry & Diagnostics Overlay (`ParticipantDiagnosticsOverlay.tsx`, `ParticipantTile.tsx`, `LiveKitManager.ts`)**:
  - Created real-time RTC telemetry diagnostic panel reporting capture/encoded/received resolutions and FPS, bitrate, packet loss, RTT, jitter, decoder/renderer FPS, track state, subscription state, and renderer state.
  - Added a toggle button on participant video tiles to display real-time RTC stats.

## [4.5.0] - 2026-08-02
### Complete Root Cause Performance & UX Overhaul
- **Theme System Re-render Deduplication (`ThemeContext.tsx`)**:
  - Wrapped `publishedThemes` and `selectedTheme` with `useMemo`. Added payload hash verification to PocketBase admin settings updates to prevent unnecessary full-app re-renders.
- **Sticky High-Visibility Typing Bar (`ChatPanel.tsx`)**:
  - Repositioned typing indicator bar to a sticky `z-20` footer container directly above the message input form. Guarantees typing indicators are never clipped or hidden by overflow or parent popovers.
- **Instant Notification Panel Loading (`NotificationsPopover.tsx`)**:
  - Memoized `NotificationsPopover` with `React.memo`, added `useMemo` for unread count, sliced rendered list (25 items max), and optimized spring transitions for instant popover opening.
- **Subpixel Infinite Scroll Chat History (`ChatPanel.tsx`)**:
  - Upgraded top scroll threshold from `scrollTop === 0` to subpixel `scrollTop < 120`. Preserved visual scroll position (`newScrollHeight - oldScrollHeight`) when prepending older messages.
- **Voice Channel Exit Context Restoration (`App.tsx`)**:
  - Tracked `previousTextChannelRef` in `App.tsx`. Leaving voice channels or pressing Back returns the user to the exact text channel open before joining voice.
- **Strict 5-Tier LIFO Back Navigation Stack (`App.tsx`, `backStackManager.ts`)**:
  - Standardized LIFO back navigation hierarchy: Modals/Sheets -> Sidebars -> Voice Channel Exit -> Double-Back Confirmation Toast -> Exit App.
- **Hardware-Constrained 1080p60 Camera Quality (`RealtimeMediaProvider.ts`, `LiveKitManager.ts`)**:
  - Applied direct hardware constraints (`1920x1080 @ 60 FPS`) on acquired camera tracks with 6.0 Mbps high bitrate.

## [4.4.0] - 2026-08-02
### Major Performance & Architectural Optimizations
- **Initial Chat Load Optimization (`App.tsx`, `ChatPanel.tsx`)**:
  - Initial channel load fetches only the **latest 10 messages**, reducing initial network payload and DOM render overhead.
  - Upward scrolling dynamically fetches older message batches and prepends them seamlessly.
- **Server Member List Virtualization (`ChatPanel.tsx`)**:
  - Virtualized `MemberListContent` rendering so only visible members in the scroll viewport (initial batch + scroll slice window) are rendered into DOM nodes, with `React.memo` item memoization.
- **Android Glassmorphism Blur Replacement (`main.tsx`, `index.css`)**:
  - Added platform detection (`html[data-platform="android"]`). Replaced GPU-heavy `backdrop-filter: blur` shaders on Android with lightweight semi-transparent solid backgrounds (`rgba(9, 9, 11, 0.96)`), while maintaining rich glassmorphism blurs on Desktop platforms.
- **Typing Indicator Pipeline Repair (`websocket.ts`, `App.tsx`)**:
  - Added BroadcastChannel event propagation (`sirver_chat_events`) and multi-tab subscription relay for typing events with auto-dismiss timeouts.
- **Screen Share Zero-Viewer Pause (`LiveKitManager.ts`)**:
  - Monitored subscriber count for local screen share video tracks. Pauses video encoding when 0 viewers are active, and automatically resumes full 1080p60 encoding immediately when a viewer joins.
- **JavaScript Bundle Code-Splitting (`App.tsx`)**:
  - Code-split heavy modal components (`SettingsModal`, `ServerSettingsModal`, `DiscoveryCenter`, `CreateServerModal`, `NewDmModal`, `IncomingCallModal`) using `React.lazy()` and `Suspense`, dropping initial main bundle size significantly.
- **Client-Side Image & GIF Optimization (`imageOptimizer.ts`, `ServerSettingsModal.tsx`)**:
  - Implemented client-side WebP conversion pipeline for static avatar and banner uploads, preserving transparency while minimizing file size. Animated GIFs preserve animation.
- **Production Console Log Cleanup (`main.tsx`)**:
  - Silenced `console.log`, `console.debug`, and `console.info` in production release builds (`import.meta.env.PROD`), keeping only critical warnings and errors.

## [4.3.3] - 2026-08-02
### Fixed & Improved
- **Capacitor Android Web Asset Synchronization (`npx cap sync android`)**:
  - Synchronized built web application assets from `dist/` directly into `android/app/src/main/assets/public/`, ensuring all latest JS, CSS, and UI updates are loaded by the Android native WebView runtime.
- **Android Fullscreen Video Stretch to Fit (`FullscreenVideoOverlay.tsx`)**:
  - Set default video scaling mode in `FullscreenVideoOverlay` to `'fill'` (Stretch 100% W × 100% H edge-to-edge), ensuring fullscreen stream video automatically fills the entire physical phone display without letterboxing.
- **Camera Hardware 1080p @ 60FPS Hardware Constraints (`RealtimeMediaProvider.ts`, `LiveKitManager.ts`)**:
  - Added `videoTrack.applyConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } })` directly onto acquired camera tracks to force hardware camera drivers to 1080p60 mode, and updated LiveKit camera publishing defaults to 60 FPS / 6.0 Mbps bitrate.
- **Android Adaptive App Icon Conflict Resolution (`android/app/src/main/res/drawable/`)**:
  - Removed legacy `ic_launcher_background.xml` from `drawable/` directory which was overriding `@color/ic_launcher_background` with Android's green default grid vector pattern, restoring SirverData's official branding icon on `#000000` background across all Android devices.

## [4.3.2] - 2026-08-02
### Fixed & Improved
- **Server Sidebar Top Bar Alignment (`ChannelList.tsx`)**:
  - Aligned `ChannelList` top bar height to `h-14` (56px) matching `ChatPanel` header height, eliminating server sidebar top margin stretching under the Android status bar.
- **Android Native Fluid Gestures (`App.tsx`, `ChatPanel.tsx`)**:
  - Upgraded mobile sidebar and member list slide-over drawer transitions to native Android spring animation specs (`damping: 28, stiffness: 300, mass: 0.8`), delivering smooth native-feeling swipe gestures for opening and closing sidebars.

## [4.3.1] - 2026-08-02
### Fixed
- **Android Status Bar Non-Overlapping Layout (`MainActivity.java`, `capacitor.config.json`)**:
  - Enforced `getWindow().setDecorFitsSystemWindows(true)` in `MainActivity.java` and configured `overlaysWebView: false` in `capacitor.config.json` for the StatusBar plugin. Fixed issue where the main Android application layout stretched under the Android status bar icons (clock, battery, notifications) during normal app operation, while maintaining true sticky immersive fullscreen for video.

## [4.3.0] - 2026-08-02
### Major Fixes & Improvements
- **Windows & Web Screen Share Source Switching (`LiveKitManager.ts`, `RealtimeMediaProvider.ts`)**:
  - **In-Place Track Replacement**: Integrated LiveKit's `replaceTrack` API on `LocalTrackPublication` when switching screen capture sources on Windows/Web. Viewers receive the new stream in-place without renegotiation, unmounting, or loading spinners.
  - **Stage Logging**: Added logging across all 6 stages (`old track id`, `new track id`, `replaceTrack result`, `publish result`, `subscriber update`, `playback started`).
  - **Auto Source Recovery**: Added `screen_share_source_ended` event handling when a shared window/application is closed to prompt source selection instead of leaving viewers frozen.
- **Decoupled Edge-to-Edge Portal Fullscreen (`FullscreenVideoOverlay.tsx`)**:
  - Attached directly to `document.body` via React Portal (`createPortal(..., document.body)`).
  - Enforced strict fixed viewport container (`100vw` × `100dvh`, `position: fixed`, `top: 0`, `left: 0`, `right: 0`, `bottom: 0`, `z-index: 2147483647`, `background: black`).
  - Video element set to `width: 100%`, `height: 100%`, `object-fit: contain`, `background: black`.
- **Auto-Hiding Floating Controls (2-Second Inactivity)**:
  - Controls appear on mount for 2 seconds, smoothly fade out (`opacity-0 pointer-events-none transition-opacity duration-300`), and fade back in when tapping anywhere on the screen.
- **High-Quality Android App Launcher Icons (`android/app/src/main/res/`)**:
  - Generated high-quality bicubic resized launcher icons (`ic_launcher.png`, `ic_launcher_foreground.png`, `ic_launcher_round.png`) across all Android density directories (`mipmap-mdpi`, `mipmap-hdpi`, `mipmap-xhdpi`, `mipmap-xxhdpi`, `mipmap-xxxhdpi`, `mipmap-anydpi-v26`) from `src-tauri/icons/icon.png`.

## [4.2.4] - 2026-08-02
### Fixed & Improved
- **Mandatory System Audio Screen Sharing (`RealtimeMediaProvider.ts`)**:
  - Screen sharing now automatically requests system audio (`audio: true`, `systemAudio: 'include'`) by default and eliminates audio-disabled fallbacks, ensuring screen share streams always capture system sound without offering a "without sound" option.
- **Sirver Project Android App Launcher Icons (`android/app/src/main/res/`)**:
  - Removed default Capacitor vector icon (`drawable-v24/ic_launcher_foreground.xml`). Replaced launcher foreground, round, and standard icons across all Android `mipmap-*` density directories with Sirver's official project logo (`icon.png`) on `#000000` background.

## [4.2.3] - 2026-08-02
### Fixed & Improved
- **Microphone Mute Status Desync Fix (`LiveKitManager.ts`, `RealtimeMediaProvider.ts`, `voicePresenceStore.ts`)**:
  - **Local Mute Synchronization**: Synchronized local participant `isMuted` resolution in `LiveKitManager.toMediaParticipant` and `RealtimeMediaProvider.addOrUpdateParticipant` to read authoritatively from `voicePresenceStore.getLocalPresence()`. Fixed race condition where call tiles previously displayed a muted badge while the bottom control bar showed unmuted.
- **Android Fullscreen True Edge-to-Edge (`FullscreenVideoOverlay.tsx`)**:
  - **Edge-to-Edge Display**: Removed outer overlay root padding in `FullscreenVideoOverlay`, allowing the video stage to stretch `100vw` × `100dvh` edge-to-edge across the display, while applying safe area top margins strictly to floating control overlay bars.
- **Maximum Camera & Screen Share Stream Quality (1080p @ 60FPS) (`RealtimeMediaProvider.ts`, `LiveKitManager.ts`)**:
  - **1080p60 Camera Acquisition**: Configured camera `getUserMedia` constraints to request ideal 1920×1080 resolution @ 60 FPS and 6.0 Mbps max encoding bitrate across default auto/ultra profiles.
  - **1080p60 Screen Capture**: Updated `getDisplayMedia` screen share constraints to `{ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }` without hard max limits, eliminating overconstraint fallback drops to 360p/720p.

## [4.2.2] - 2026-08-02
### Fixed & Refactored
- **Android Fullscreen Video Pipeline Audit & Immersive Mode (`MainActivity.java`, `FullscreenVideoOverlay.tsx`, `ParticipantTile.tsx`)**:
  - **Native Android WebChromeClient Fix**: Extended `com.getcapacitor.BridgeWebChromeClient` in `MainActivity.java` instead of instantiating raw `WebChromeClient`, restoring Capacitor's native HTML5 `onShowCustomView` custom view delegation so Android WebView cleanly enters fullscreen mode.
  - **Strict Non-Inheriting Viewport Container**: Applied explicit inline `position: fixed`, `top: 0`, `left: 0`, `right: 0`, `bottom: 0`, `width: 100vw`, `height: 100dvh`, `z-index: 2147483647`, and `transform: none` onto `FullscreenVideoOverlay`, decoupling the fullscreen viewer from parent chat containers and DOM transforms.
  - **Chromium Flexbox Intrinsic Sizing Safeguard**: Added `min-h-0 min-w-0 flex: 1 1 0%` bounding on the video stage wrapper to eliminate Chromium/Android WebView flexbox intrinsic collapse (which previously squished the video down to 300px × 150px intrinsic fallback).
  - **Single Active Stream Renderer**: In-call `<video>` element inside `ParticipantTile` is now automatically hidden and detached while `isFullscreen` is active, preventing duplicate stream consumption.
  - **Capacitor Status Bar Immersive Control**: Integrated `@capacitor/status-bar` to systematically hide the Android status bar and enter sticky immersive mode on fullscreen activation, restoring it upon exit.
  - **Exhaustive Diagnostic Logging**: Added structured `[FULLSCREEN_PIPELINE]` console logs for `fullscreen button pressed`, `overlay mounted`, `portal mounted`, `overlay dimensions`, `video dimensions`, `window.innerWidth/innerHeight`, `visualViewport dimensions`, `renderer dimensions`, `video clientWidth/clientHeight`, `video parent dimensions`, and `Android safe area insets`.

## [4.2.1] - 2026-08-02
### Improved
- **Server Members List & Offline User Styling (`ChatPanel.tsx`)**:
  - Offline (disconnected) users' display names in the server member list are now rendered in grey (`#888888`), ensuring clear visual distinction between connected and disconnected members.
- **Server Roles & Username Color Customization (`ServerSettingsModal.tsx`, `SettingsModal.tsx`, `pocketbase.ts`)**:
  - Added explicit role username color configuration in Server Settings > Roles with preset color palettes and clear descriptions.
  - Updated `getPrimaryServerRole` logic so that a member's **last applied role** defines their primary role and username color in the member list and profile.

## [4.2.0] - 2026-08-01
### Fixed & Architectural Refactoring
- **Single Authoritative Voice Presence Store (`voicePresenceStore.ts`)**:
  - Established `voicePresenceStore` as the single source of truth for voice channel membership, channel IDs, join times, and initial mute/camera/screenshare presence across the entire app.
  - Everyone subscribes to shared presence immediately on startup without requiring a LiveKit WebRTC connection to view channel participants.
- **Dedicated LiveKit Media State (`LiveKitManager.ts`, `RealtimeMediaProvider.ts`)**:
  - LiveKit exclusively owns real WebRTC audio/video/screen tracks, connection quality, and speaking detection without duplicating or caching conflicting UI participant state.
- **Consolidated UI Components (`ChannelList.tsx`, `VoicePanel.tsx`, `ParticipantTile.tsx`)**:
  - Eliminated duplicate participant maps and conflicting state across components. `ChannelList` and `VoicePanel` derive channel member lists directly from `voicePresenceStore` and attach live WebRTC media streams cleanly.
- **Immediate Video Track Cleanup (`ParticipantTile.tsx`, `RealtimeMediaProvider.ts`)**:
  - Guaranteed that unpublishing or unsubscribing a camera/screen track immediately destroys the video stream reference, stops underlying tracks, and returns the UI tile to the user avatar without leaving frozen video frames.
- **Accurate Late Join & Mute State Initialization**:
  - Late joiners automatically subscribe to all published microphone, camera, and screen share tracks (`setSubscribed(true)`) without requiring publishers to restart streams.
  - Participant mute state is initialized directly from LiveKit track publications after connection completes rather than assuming a muted default.
- **Subsystem Debug Instrumentation**:
  - Added structured `[VOICE_SUBSYSTEM]` console logs for `ParticipantConnected`, `ParticipantDisconnected`, `TrackPublished`, `TrackSubscribed`, `TrackUnpublished`, `TrackUnsubscribed`, `Local mute change`, `Remote mute change`, `Presence update`, and `Screen share publish/subscribe`.

## [4.1.7] - 2026-08-01
### Fixed & Improved
- **Voice Channel Cross-Client Real-Time Presence Fix (`pocketbase.ts`, `voicePresenceStore.ts`)**:
  - Added dual-sync persistence across `calls` and `voice_presences` PocketBase collections with real-time SSE subscriptions, ensuring voice channel participants are instantly broadcast and visible in the channel list to all users, even if they are not joined in the voice channel.
  - Implemented automatic 6-second presence fallback refresh alongside 15-second heartbeat pruning to keep channel participant lists completely synchronized across all connected browser sessions and devices.
- **Voice Channel Participants Visibility (`ChannelList.tsx`, `VoicePanel.tsx`)**:
  - Merged WebRTC live media participants with `voicePresenceStore` real-time presence, ensuring connected users are ALWAYS visible inside voice channels whether viewing from inside or outside the room.
  - Displays real-time voice, camera, and screen sharing stream indicators for every connected participant across all voice channels.
- **Microphone Mute Synchronization Fix (`LiveKitManager.ts`)**:
  - Resolved mute state desync bug where joining participants initially saw existing unmuted members as muted (and vice versa).
  - Directly maps participant microphone track state and publication properties rather than forcing false muted state during initial track subscription.
- **Default System Audio Screen Sharing (`RealtimeMediaProvider.ts`)**:
  - Configured screen sharing `getDisplayMedia` to request system audio (`systemAudio: 'include'`) and tab/window audio by default.
- **Android & Mobile Edge-to-Edge Fullscreen Video (`ParticipantTile.tsx`)**:
  - Mounted fullscreen video portal directly to `document.body` via `createPortal` with `z-[999999] bg-black` covering the entire screen edge-to-edge.
  - Added tap-on-video and tap-on-backdrop handlers to quickly exit fullscreen and return to the small tile preview.

## [4.1.6] - 2026-08-01
### Fixed & Improved
- **Audio Mixer Call Screen Portal & Stacking Fix (`VoicePanel.tsx`, `AudioMixerModal.tsx`, `DMCallOverlay.tsx`, `MinimizedVoiceBar.tsx`)**:
  - **Connected View Render Integration**: Mounted `<AudioMixerModal>` directly inside the active voice call view in `VoicePanel.tsx` so clicking the Audio Mixer control button (`SlidersHorizontal`) opens the modal during active calls instead of being skipped by early return statements.
  - **Elevated Backdrop & Dialog Stacking Context**: Upgraded `AudioMixerModal` backdrop overlay to `z-[999999]` and modal container to `z-[1000000]` using `createPortal(..., document.body)` so it always floats above active call screens, maximized video streams, participant tiles, and sidebars.
  - **Audio Mixer for DM Calls & Minimized Bar**: Added the Audio Mixer button and modal trigger to `DMCallOverlay.tsx` and `MinimizedVoiceBar.tsx` for volume control in direct calls and floating/minimized bar states.
- **Global Real-Time Voice Channel Presence (`voicePresenceStore.ts`, `pocketbase.ts`, `RealtimeMediaProvider.ts`, `ChannelList.tsx`, `VoicePanel.tsx`)**:
  - **Decoupled Presence from Media Connection**: Voice channel presence is now decoupled from LiveKit WebRTC room connections, allowing all clients to view active participants in every voice channel without needing to join the room first.
  - **Discord-Style Real-Time Presence Indicators**: Implemented global tracking for muted state, deafened state, camera status, screen sharing / live streaming status, and active speaking indicators for all voice channels across the server list.
  - **PocketBase & WebSocket Synchronized Engine**: Added real-time presence persistence and PocketBase SSE subscription helpers in `pocketbase.ts` backed by WebSocket (`wsService`) and BroadcastChannel fallback for multi-tab sync.
  - **Stale Presence Pruning & Heartbeats**: Added a 3-second background pruning timer in `voicePresenceStore.ts` that purges stale presences (>12 seconds without heartbeat) and emits immediate `status: 'left'` events on `beforeunload` or `pagehide`.
  - **Pre-Join Gateway Live Room Preview (`VoicePanel.tsx`)**: Enhanced the voice channel pre-join card with a real-time list of members currently inside the channel before clicking "Join Voice".

## [4.1.5] - 2026-08-01
### Added & Improved
- **LiveKit Architecture Optimization & Token Prefetching (`LiveKitManager.ts`, `LiveKitSFUAdapter.ts`, `ChannelList.tsx`)**:
  - Implemented single `LiveKitManager` singleton owning room connection, audio/video track lifecycle, automatic reconnect, and token prefetching.
  - Added smart token caching and background prefetching on channel list hover/render to eliminate voice channel join latency.
- **Server Members List Default Behavior (`ChatPanel.tsx`)**:
  - Server members list is now closed by default across desktop and mobile devices.
  - Saved user open/close preference locally in `localStorage` without sending data to PocketBase or server.
  - Guaranteed member list starts closed on mobile devices when launching app or entering servers/channels.
- **Smooth Sidebar Dragging & Axis Locking (`ChatPanel.tsx`)**:
  - Upgraded touch gesture tracking with real-time axis locking (`Math.abs(deltaX) > Math.abs(deltaY) * 1.2`) to prevent vertical scrolling from accidentally triggering horizontal swipe gestures.
  - Added velocity and momentum calculations on gesture release for fluid open/close snapping.
- **Full RTL (Arabic) Gesture Support (`ChatPanel.tsx`, `App.tsx`)**:
  - Inverted touch swipe directions when `lang === 'ar'`: left swipe opens right-aligned Channel Sidebar, right swipe opens left-aligned Member List.
  - Configured slide-over motion transitions for both drawers to enter from their natural screen edge in RTL layout.
- **Shared Message Link Preview Theme Token System (`MessageLinkPreview.tsx`)**:
  - Replaced all hardcoded slate colors with centralized theme CSS variables (`--theme-bg-card`, `--theme-bg-secondary`, `--theme-bg-tertiary`, `--theme-border`, `--theme-text-primary`, `--theme-text-secondary`, `--theme-text-muted`, `accent`).
  - Ensured message link previews dynamically adapt across light mode, dark mode, custom themes, and future themes.
- **Profile Card Reliability & Atomic Event Handling (`App.tsx`, `UserProfileModal.tsx`, `ChatPanel.tsx`)**:
  - Removed artificial 500ms `profileCloseCooldownUntilRef` hard lock in `App.tsx`.
  - Added `isClosingRef` guard and cleaned up pointerdown event racing in `UserProfileModal.tsx` backdrop overlay to prevent double-closing.
  - Added `e.stopPropagation()` on member list rows to prevent click bubbling and resolve race conditions during rapid repeated clicks.

## [4.1.4] - 2026-07-31
### Fixed & Hardened
- **Message Context Menu Stacking & Portal (`ChatPanel.tsx`)**:
  - Rendered the right-click / long-press message context menu using React Portal mounted to `document.body` with `z-[9999]` and viewport boundary clamping so it never renders behind sidebars or overlays.
- **Universal Copy Text for Messages (`ChatPanel.tsx`, `PinnedMessagesPopover.tsx`)**:
  - Added a Copy Text action button to all text-containing messages in the hover action bar, context menu, and pinned messages popover.
- **Theme Tokens & Dark Mode Theme Refactoring (`MusicPlayer.tsx`, `SettingsModal.tsx`)**:
  - Refactored hardcoded colors in music player cards, playlists, profile card scale slider, and storage & data optimization panels (Image, Video, and Audio compression cards) in app settings (`SettingsModal.tsx`) to use CSS theme tokens (`var(--theme-bg-secondary)`, `var(--theme-bg-tertiary)`, `var(--theme-border)`, `var(--theme-text-primary)`).
- **Default Profile Display Name Resolution (`UserProfileModal.tsx`, `pocketbase.ts`)**:
  - Fixed an issue where viewing a main user profile from a server context displayed the server nickname instead of the default display name/username by scoping server nickname resolution in `getServerMemberDisplayName` and `getEffectiveProfile` strictly to server profile contexts.
- **Link Preview Text Hiding (`ChatPanel.tsx`)**:
  - Configured message link formatting so URLs that generate rich media previews (images, videos, YouTube embeds) have their raw text strings automatically hidden from the message body while preserving the interactive media preview.
- **Cross-Platform Download Directory Resolution (`tauriDesktopService.ts`, `downloadManager.ts`)**:
  - Implemented `getPlatformOS()` to resolve dynamic download paths for Windows, Linux, Android (`/storage/emulated/0/Download/SirverData`), and macOS.
  - Updated `downloadManager.ts` to use dynamic path resolution.
- **Android Voice Chat & Permissions Hardening (`RealtimeMediaProvider.ts`)**:
  - Configured `joinRoom` to trigger auto-start microphone initialization upon joining.
  - Added fallback audio constraints for mobile Android WebViews and improved `NotAllowedError` handling.
- **High Quality 1080p Adaptive Screen Sharing & Fullscreen Scaling (`RealtimeMediaProvider.ts`, `ParticipantTile.tsx`)**:
  - Configured screen sharing to request 1080p 60fps with adaptive fallback to 1080p 30fps and standard definition, setting `contentHint = 'detail'`.
  - Updated fullscreen video scaling in `ParticipantTile.tsx` to handle Fit (contain) and Fill (cover) modes under 0°, 90°, 180°, and 270° orientation rotations.
- **Android Server Member List & Touch Swipe Gestures (`ChatPanel.tsx`)**:
  - Defaulted server member list to closed state on Android and mobile viewports (`<768px`).
  - Added horizontal touch swipe gesture handling to toggle between Channel Sidebar and Member List on mobile devices (including RTL support for Arabic).
- **60 FPS Navigation Switch Animation & Profile Card Popout (`ChannelList.tsx`, `UserProfileModal.tsx`)**:
  - Optimized Server/DM tab switch button transition in `ChannelList.tsx` for 60 FPS hardware acceleration using `willChange: 'transform'`.
  - Updated `UserProfileModal.tsx` to center the profile card on small screens (`<640px`) while expanding/popping directly out of the clicked avatar transform origin.

## [4.1.3] - 2026-07-30
### Fixed & Hardened
- **Voice Channel Avatar Resolution & Voice-Only Interface (`ParticipantTile.tsx`, `RealtimeMediaProvider.ts`, `MediaContext.tsx`, `IncomingCallModal.tsx`, `App.tsx`)**:
  - **Reused Sirver Avatar Resolution System**: Participants in voice channels now resolve avatars through `getServerMemberAvatarUrl()`, correctly prioritizing server-specific member avatars (`server_avatar`), falling back to global user profiles (`avatar`), and defaulting to Sirver's standard avatar fallback.
  - **Voice-Only Channel Boundary**: Enforced `loadMessages` bypass for voice channels (`channel.type === 'voice'`) in `App.tsx` so voice channels never make text message API calls or attempt message history queries.
  - **Speaking Ring Indicator UI**: `ParticipantTile.tsx` renders high-contrast theme-aware circular speaking indicators (`ring-4 ring-emerald-500` / pulsing animation) strictly tied to `participant.isSpeaking` state without faking or pulsing artificially when idle.
  - **Dynamic Participant Profile Synchronization**: `MediaContext.tsx` and `RealtimeMediaProvider.ts` update `selfParticipant` data dynamically upon profile/member changes without reloading avatar images or interrupting WebRTC/media streams.

## [4.1.2] - 2026-07-30
### Fixed & Hardened
- **Idempotent Voice Channel Joining & Single Join Sound (`App.tsx`, `MediaContext.tsx`)**:
  - **Identical Channel Click Idempotency**: Clicking an already active voice channel (whether currently viewing it or navigated away) now simply restores the `VoicePanel` UI view. Re-joins, re-connections, and duplicate media session attempts are strictly bypassed.
  - **Single Sound Trigger Execution**: Removed redundant UI-level `playJoinSound()` invocations in `App.tsx` (`handleSelectChannel`, `handleStartCall`, and channel switch modal). `playJoinSound()` is now strictly executed once by `MediaContext.tsx` upon actual successful room connection.
  - **Concurrent/Rapid Click Protection**: Implemented a `joiningRoomIdRef` promise lock in `MediaContext.tsx` (`joinVoiceRoom`, `startDmCall`). Rapid duplicate clicks on the same channel within milliseconds are deduplicated into a single join action.
  - **Safe Channel Switch**: Switching to a different voice channel cleanups the existing room session first, joins the new room, and triggers `playJoinSound()` exactly once for the new channel.

## [4.1.1] - 2026-07-30
### Fixed & Refactored
- **Decoupled Voice Connection & Channel View State (`App.tsx`, `main.tsx`)**:
  - **Independent Connection & View State**: Separated the active voice connection (`activeVoiceChannel`) from the currently viewed channel (`activeChannel`). Users remain fully connected to voice audio/media while navigating through text channels, servers, and direct messages.
  - **Dynamic Main Content Stage**: Main stage content automatically switches to text/DM chat when navigating away from an active voice channel without disconnecting or destroying WebRTC/media sessions.
  - **Minimized Voice Controls & Floating Dock**: Renders `MinimizedVoiceBar` as both a docked sidebar control and a floating bar (`variant="floating"`) when navigated away, providing continuous latency, mute/deafen, disconnect, and expand controls.
  - **Seamless Voice Room Restoration**: Expanding the minimized bar instantly brings back the full `VoicePanel` without reconnecting or interrupting ongoing WebRTC/media streams.
  - **Safe Voice Channel Switching**: Added a confirmation dialog when selecting a different voice channel while already connected, preventing accidental disconnections or duplicate WebRTC sessions.

## [4.1.0] - 2026-07-30
### Fixed & Refactored
- **Voice Channel Creation UI Consolidation (`ChannelList.tsx`, `ServerSettingsModal.tsx`, `App.tsx`)**:
  - **Main Screen Channel UI Streamlining**: Removed the standalone "Add Voice Channel" shortcut button from `ChannelList.tsx` and main application layout.
  - **Single Source Channel Creation**: Enforced channel creation strictly through **Server Settings → Add Channels → Channel Type** (`ServerSettingsModal.tsx`), supporting both **Text Channel** and **Voice Channel** options in a single unified flow.
  - **Permission Enforcement**: Channel creation access remains protected by Sirver's existing role permission system (`isOwner` or `manage_channels` / `manage_server` / `manage_roles`).

## [4.0.9] - 2026-07-30
### Fixed & Architected
- **Persistent Voice Sessions & Navigation Independence (`MediaContext.tsx`, `ChannelList.tsx`, `MinimizedVoiceBar.tsx`, `App.tsx`)**:
  - **Media Session Ownership Refactoring**: Lifted real-time voice room media lifecycle management directly into `MediaContext.tsx` at the root level (`<MediaProvider>`), ensuring voice connections, participant audio streams, and speaking indicators persist uninterrupted when users navigate between servers, text channels, or direct messages.
  - **Navigation-Safe Voice Panel**: Updated `VoicePanel.tsx` to consume room state directly from `useMedia()` without manage connection teardown on unmount, allowing `VoicePanel` to safely unmount during text navigation and remount upon returning.
  - **Persistent Minimized Voice Bar**: Integrated `MinimizedVoiceBar` above the user footer in `ChannelList.tsx`. Displays active room name, voice latency, and quick controls (Mute, Deafen, Camera, Screen Share, Disconnect) across all navigation views.
  - **Seamless Room Expansion**: Added `onExpandVoice` handler restoring the active `VoicePanel` view when clicking the expand action on `MinimizedVoiceBar`, without rejoining or interrupting ongoing WebRTC/media streams.
  - **Multiple Session Protection & Safe Transitions**: Implemented close-before-open transitions in `MediaContext.tsx` (`joinVoiceRoom` and `startDmCall`) to prevent orphaned voice sessions when switching directly between rooms or calls.

## [4.0.8] - 2026-07-30
### Added & Architected
- **Real-Time Communications System (DM Calls & 8-Person Voice Rooms)**:
  - **Shared Media Architecture (`types/media.ts`, `media/RealtimeMediaProvider.ts`)**: Built a unified, transport-decoupled `RealtimeMediaProvider` singleton for both 1-to-1 DM calls and voice rooms (up to 8 participants). Supports local mic, camera, screen share, mute, deafen, per-user volume controls, and speaking detection via Web Audio API `AudioContext`.
  - **SFU Integration Injection (`SFUProviderAdapter`)**: Exposed clean `setSFUAdapter` and `setSFUConfig` injection methods so future SFU/WebRTC infrastructure can be attached without modifying UI or business logic.
  - **Isolated Call Signaling Service (`services/callSignaling.ts`)**: Created `CallSignalingService` over `wsService` and PocketBase for call invitations (`call_invite`, `call_accept`, `call_decline`, `call_cancel`, `call_busy`, `call_end`) and 30-second ring timeouts without mixing media streams into standard chat WebSocket events.
  - **Media Context & State Engine (`context/MediaContext.tsx`)**: Centralized media room configuration, participant grid tracking, active call duration counter, call conflict detection, and audio join/leave sounds.
  - **Incoming Call Modal (`components/IncomingCallModal.tsx`)**: Added global incoming call modal with caller avatar, call type indicator, pulsing ring animation, and accept/decline actions.
  - **Participant Tile Component (`components/ParticipantTile.tsx`)**: Created reusable participant tile with speaking halo animation, mic off / deafened badges, live camera/screen share rendering, and local per-user volume slider popover.
  - **DM Call Overlay (`components/DMCallOverlay.tsx`)**: Integrated non-intrusive top call bar in DM chat views so users can talk or video chat while continuously browsing and sending DM messages.
  - **Voice Panel Integration (`components/VoicePanel.tsx`)**: Upgraded server voice rooms to support dynamic bento grids for up to 8 participants, room state indicators, media control bar, and microphone/camera error warning banners.

## [4.0.7] - 2026-07-29
### Fixed & Refactored
- **Android & Mobile Status Bar Safe Area Insets (`index.css`, `App.tsx`, `index.html`)**:
  - **Safe Area Inset Enforcement**: Applied `box-sizing: border-box` and `padding-top: env(safe-area-inset-top, 0px)` directly to `#root` so mobile views, headers, and navigation bars start cleanly below the Android status bar and top notch instead of stretching underneath.
  - **Flexible Layout Fit**: Updated root container styling from fixed `h-screen w-screen` to `h-full w-full` and `AuthScreen` to `h-full min-h-full` to perfectly fit within the safe area padded viewport without overflowing or pushing bottom bars off-screen.
  - **Android Web App & Theme Color Meta**: Added `theme-color`, `mobile-web-app-capable`, and status bar meta declarations to `index.html` for seamless Android status bar integration and color blending.
- **Theme Architecture Refactoring & Protected Themes Integrity (`adminThemeService.ts`, `userSettings.ts`, `index.css`)**:
  - **Strict Source Priority & Complete Separation**: Re-architected theme token resolution so protected read-only default themes (Monochrome Light and Monochrome Dark) are completely isolated from custom themes.
  - **Protected Theme Cleanliness**: Replaced legacy default green accent tokens in `DEFAULT_DARK_TOKENS`, `DEFAULT_LIGHT_TOKENS`, and `src/index.css` with pure monochrome values (`#FAFAFA` for Dark, `#18181B` for Light).
  - **Custom Theme Disabling Enforcer**: When "Enable Custom Themes" is OFF (`useThemes = false`), custom themes, cached tokens, and preview values are completely ignored. The application resolves exclusively to the protected Monochrome Light or Dark theme without mixing or leakage.
  - **Stale Accent Cleanup**: Removed stale custom accent fallback logic in `userSettings.ts` that forced custom colors onto protected default themes.
- **Desktop Server Member List Non-Overlapping Profile Card Positioning (`UserProfileModal.tsx`, `App.tsx`, `ChatPanel.tsx`)**:
  - **Side-by-Side Contextual Popout**: Configured profile card positioning for desktop Server Member List clicks so the card appears beside the Member List (to its left toward the chat area) rather than overlapping or covering it.
  - **Member List Full Visibility**: Keeps the entire Server Member List 100% visible and accessible while inspecting member profiles.
  - **Avatar Center Spring Animation**: Maintains visual attachment to the clicked member's avatar, expanding from and retracting into the avatar center with a consistent 10px gap.
- **Avatar-Anchored Profile Card Positioning (`UserProfileModal.tsx`, `App.tsx`, `ChatPanel.tsx`)**:
  - **Predictable Avatar Anchor Resolution**: Updated `handleSelectUser` to always resolve the anchor rect from the target user's avatar DOM element rather than mouse cursor coordinates (`clientX`/`clientY`). Clicking anywhere on a member row, username, display name, or avatar now opens the card from the exact same avatar location.
  - **Avatar Center Transform Origin**: Configured motion scale/fade animations to expand directly from and contract back into the selected user's avatar center.
  - **Smart Viewport & Side Edge Handling**: Maintained consistent 8–12px spacing relative to the avatar with auto-fallback to right, left, above, or below based on available viewport space.
- **Profile Card Overlay Click Consumption & Reopen Delay (`UserProfileModal.tsx`, `App.tsx`)**:
  - **Single Click Backdrop Dismissal**: Configured the blurred overlay backdrop with `pointer-events-auto`, `onPointerDown`, and `onClick` handlers that intercept and consume clicks outside the active card without triggering underlying controls.
  - **Intentional 500ms Reopen Buffer**: Enforced a fixed 0.5-second (500 ms) delay after closing begins before allowing another Profile Card to be opened, preventing accidental immediate profile switches while maintaining responsive interaction across all entry points.
- **Profile Card Bottom Panel Anchor Positioning (`UserProfileModal.tsx`, `App.tsx`)**:
  - **Bottom Panel Anchor Placement**: Updated `calculatePopoutPosition` to automatically position **My Profile** directly above the bottom user panel with a clean 8px gap when opened from the user panel.
  - **Dynamic Origin Animation**: Configured smooth spring transform origin to launch from and retract back into the bottom user panel, providing a Discord-like attached popout feel.
  - **Smart Viewport Alignment**: Ensured the card stays clamped within viewport boundaries while remaining visually connected to the bottom panel.

## [4.0.6] - 2026-07-29
### Fixed & Improved
- **Profile Card Interaction Responsiveness (`UserProfileModal.tsx`, `App.tsx`)**:
  - **Removed Reopening Delays**: Eliminated artificial `isVisible` delay trapping and internal exit callback blocking in `UserProfileModal`, allowing immediate reopening of profile cards without cooldowns.
  - **Fresh Reference Lifecycle**: Updated `App.tsx` `handleSelectUser` to trigger a fresh user state reference when re-selecting the same profile, ensuring immediate re-renders and smooth Discord-like interactions.
- **Channel / DMs Mode Selector Highlighting (`ChannelList.tsx`)**:
  - **Contrast-Aware Selected State**: Updated Channels vs Direct Messages tab selector text styles to use `text-[var(--theme-accent-contrast)]`, ensuring maximum contrast and legibility across protected themes.
- **Protected Theme Default Accent Tokens (`adminThemeService.ts`, `userSettings.ts`)**:
  - **Protected Light Theme Dark Accent**: Set protected Light Theme default accent token to dark neutral (`#18181B`), providing high contrast against light backgrounds.
  - **Fallback Accent Rules**: Updated `applySettingsToDocument` and `DEFAULT_LIGHT_TOKENS` so the default accent color automatically resolves from the active protected theme unless a custom accent is explicitly set by the user.

## [4.0.5] - 2026-07-29
### Fixed & Improved
- **Attachment Storage Lifecycle & Orphan File Prevention (`AttachmentUploadManager.ts`, `pocketbase.ts`, `ChatPanel.tsx`, `App.tsx`)**:
  - **Server Storage Cleanup on Removal**: Updated single attachment removal, "Clear All" staged attachments, draft cancellation, and draft discarding to call `pbService.deleteAttachmentRecord`, ensuring unlinked server storage files and PocketBase records are deleted immediately.
  - **In-Flight Cancellation & Race Condition Safety**: Added abortion guards and immediate post-upload cleanup checks in `AttachmentUploadManager` to delete any PocketBase record created right before an in-flight upload cancellation or removal.
  - **Unsent Draft Conversation Switch Cleanup**: Added draft cleanup when switching channels or conversations, removing any pre-uploaded unlinked server attachments associated with the unsent draft.
  - **Emergency Window Unload Cleanup**: Integrated a `beforeunload` listener using browser HTTP `keepalive` fetch requests to send DELETE operations for any unlinked pre-uploaded attachments if the browser tab or app is closed prior to message sending.
  - **Sent Attachment Preservation Guard**: Added safety checks in `deleteAttachmentRecord` verifying `record.message` is empty/unlinked before deletion, guaranteeing successfully linked sent attachments are never deleted.
  - **Send Failure Cleanup**: Added failure handlers in `App.tsx` `handleSendMessage` to clean up any pre-uploaded attachments if message transmission or database linking fails.

## [4.0.4] - 2026-07-28
### Fixed & Improved
- **Windows Custom Title Bar Close Button (`TitleBar.tsx`, `tauriDesktopService.ts`)**:
  - **Tauri v2 Close Window API**: Updated `closeWindow()` with sequential Tauri v2 `appWindow.close()`, `appWindow.destroy()`, and `plugin:window|close` fallbacks.
  - **Event Propagation & Drag Interference**: Added `onMouseDown` and `onDoubleClick` event stoppers to all window control buttons (Minimize, Maximize, Close, Search, Settings), preventing `data-tauri-drag-region` from capturing clicks on buttons.
- **Android Platform Title Bar Visibility (`tauriDesktopService.ts`, `TitleBar.tsx`)**:
  - **Android Title Bar Hiding**: Updated `isDesktopPlatform()` to strictly exclude Android/mobile environments. On Android, `<TitleBar>` returns `null` with zero DOM elements and zero height, removing top blank space while remaining functional on Windows desktop.
- **Android Back Button Navigation Priority (`App.tsx`)**:
  - **Hierarchical Overlay Priority**: Updated `handleGoBackInMenu()` to close temporary open UI elements (lightbox, user profiles, modals, popovers, sidebars) one at a time starting with the topmost element.
  - **Double-Back Exit Confirmation Toast**: Added a 2-second confirmation toast ("Press back again to exit" / "اضغط رجوع مرة أخرى للخروج") when no modals are open. Pressing Back a second time within 2 seconds exits the app, while waiting over 2 seconds resets the exit confirmation cleanly.
- **DM Notification Read State & One-Time Highlight (`ChatPanel.tsx`, `App.tsx`)**:
  - **One-Time Target Message Highlight**: Updated `ChatPanel.tsx` with a ref guard (`handledTargetMsgIdRef`) to trigger target message highlight only once when opening from a notification.
  - **1-Second Highlight Timeout**: Reduced highlight duration to ~1 second (1000ms) and automatically cleared `targetMessageId` via `onClearTargetMessage()`, preventing re-highlighting on sending/receiving messages, re-rendering, or message list refreshes.
  - **Reliable Notification Read Marking**: Ensured opening a DM or channel marks only the specific notification as read and persists read state to PocketBase without affecting unrelated notifications.
- **Unlisted Theme Reversion & Selected Theme Persistence (`ThemeContext.tsx`, `pocketbase.ts`, `App.tsx`)**:
  - **Automatic Unlisted Theme Removal**: Added active theme validation in `ThemeContext.tsx` that automatically detects if an active theme becomes unlisted/unpublished, immediately reverts active users to the default theme (`none`), removes the invalid ID from settings, and updates the UI in real time.
  - **Theme Selection Persistence Across Restarts**: Updated `pocketbase.ts` `updateProfile` to sync updated profile settings to `this.pb.authStore.record`, and updated `App.tsx` startup initialization to merge cached settings (`sirver_user_settings_cache_v2`) with user profile settings without overwriting saved selections with stale defaults.
- **Independent Language & Color Mode Settings (`App.tsx`, `ThemeContext.tsx`, `SettingsModal.tsx`)**:
  - **Decoupled Settings Fields**: Separated `appLanguage` (`languageRegion.appLanguage`), `appearanceMode` (`appearance.theme`), and `selectedThemeId` (`appearance.selectedThemeId`). Toggling dark/light mode or changing selected themes preserves the active language, and changing languages preserves the active theme mode and theme selection.

## [4.0.3] - 2026-07-28
### Fixed & Improved
- **Global App Theme Custom Theme Deletion (`GlobalThemeManagerTab.tsx`, `ThemeContext.tsx`)**:
  - **Inline Modal Dialogs**: Replaced native browser `window.confirm` and `alert` dialogs (which get blocked inside iframe previews) with clean, non-blocking custom inline modals (`themeToDelete` and `deleteNotice`) for theme deletion.
  - **Published Theme Safeguard**: Added safeguards and notice modals preventing accidental deletion of the active published theme while enabling seamless permanent removal of inactive custom and draft themes.
  - **PocketBase Admin App Settings Synchronization**: Updated `deleteTheme`, `handleCreateNewTheme`, `handleDuplicateTheme`, and `handleSaveDraft` to continuously persist theme creation, editing, and deletion operations directly to PocketBase (`app_settings_admin`) and local cache, ensuring custom themes are deleted permanently across sessions and clients.
- **App Settings Theme Token Integration (`SettingsModal.tsx`, `DownloadsTabContent.tsx`)**:
  - **Server Settings Theme Synchronization**: Updated `appsettings > servers` (including server selector, member server profile override, channels & cooldowns list, banner & icon form, roles & permissions forms, and server lock options) to replace hardcoded slate classes with centralized CSS theme tokens (`var(--theme-bg-secondary)`, `var(--theme-bg-card)`, `var(--theme-bg-tertiary)`, `var(--theme-border)`, `var(--theme-text-primary)`, etc.).
  - **Downloads Manager Theme Synchronization**: Updated `appsettings > Downloads` (`DownloadsTabContent.tsx`) to replace hardcoded dark/light slate classes with CSS theme tokens, ensuring search bars, storage stats badges, filter buttons, download item cards, and progress bars react to custom admin themes and theme modes.
- **Attachment & Link Preview Layout Refinement (`ChatPanel.tsx`)**:
  - **External Link Previews**: Adjusted image and video link preview wrappers to use tight `w-fit max-w-full` borders, preventing empty space on sides of external media.
  - **General Attachment Media**: Refined non-audio image and video attachment containers (`w-fit max-w-full`) to eliminate dark background side gutters on media that is not wide enough.

## [4.0.2] - 2026-07-28
### Fixed
- **Attachment Gallery Fullscreen Lightbox Portal (`ChatPanel.tsx`, `DownloadsTabContent.tsx`)**:
  - **Fullscreen Portal Rendering**: Extracted and rendered the Attachment Gallery Lightbox modal and Grid Gallery modal through `React.createPortal()` targeting `document.body`.
  - **Unclipped Viewport Positioning**: Updated gallery overlay styles with `position: fixed`, `inset: 0`, `w-screen h-screen`, and `z-[99999]`, breaking out of `ChatPanel` DOM stacking contexts and parent container clipping rules (`overflow: hidden`, `transform`, `filter`).
  - **Desktop Window Coverage**: Restored true desktop window fullscreen image/video preview overlay across all screen sizes without affecting existing visual styling or themes.

## [4.0.1] - 2026-07-28
### Fixed & Refined
- **Appearance & Theme Settings Overhaul (`SettingsModal.tsx`, `GlobalThemeManagerTab.tsx`, `userSettings.ts`, `adminThemeService.ts`)**:
  - **RTL Mode Switch Alignment**: Enforced `dir="ltr"` on toggle switch buttons in `SettingsModal.tsx` and changed card alignments to `text-start`, preventing the "Enable Custom Themes" button from overflowing or misaligning in Arabic (RTL) mode.
  - **Decoupled Language & Settings from Theme Changes**: Restructured `updatePartialSettings` in `SettingsModal.tsx` and updated `userSettings.ts` to preserve `useThemes` and `selectedThemeId` directly, preventing language or settings updates from resetting user theme selections or overwriting avocado green theme tokens.
  - **Admin Theme Card Layout**: Enforced `flex-wrap` and compact shrink rules on theme card action buttons (`Preview`, `Edit`, `Unlist`, `Duplicate`, `Delete`) in `GlobalThemeManagerTab.tsx` so all controls fit neatly inside panels on all screen widths.
  - **Auto-Sync Dark/Light Color Variants**: Introduced a `Sync Both Modes` toggle switch (`syncBothModes`) in the Admin Theme Manager editor. When enabled, updating a color token automatically syncs both dark and light variants; when disabled, edits affect only the active preview mode.
  - **Live Color Box UI Update**: Resolved token variant priority in `GlobalThemeManagerTab.tsx` so toggling between dark and light editor preview modes instantly updates the color box and text input values to match the selected mode.
  - **Individual Status Presence Indicators**: Expanded `MemberTokens` in `adminThemeService.ts` to support distinct colors for `presenceOnline`, `presenceAway`, `presenceDnd`, and `presenceOffline`, and mapped them to CSS variables `--status-online`, `--status-away`, `--status-dnd`, and `--status-offline`.
  - **Profile Card Preview & Layout Controls**: Corrected layout property lookups (`profileCards.cornerRadius`, `width`, `height`, `avatarSize`) and re-architected the live layout preview container with `overflow-x-auto justify-center` so scaling width or height resizes the card smoothly in place without jumping.

## [4.0.0] - 2026-07-28
### Added & Comprehensive Features
- **Global Theme & Layout Management Architecture (`GlobalThemeManagerTab.tsx`, `adminThemeService.ts`, `ThemeContext.tsx`, `index.html`)**:
  - **First-Run Frame-0 Theme Initialization**: Implemented strict 3-tier startup priority (1. Cached theme -> 2. OS device preference -> 3. Built-in default) executed before initial UI render in HTML head script to eliminate theme flashes.
  - **Admin-Only Global Theme Manager**: Integrated a dedicated `Global App Theme` section in `SettingsModal.tsx` restricted strictly to administrators.
  - **Theme Library**: Interactive grid displaying Light/Dark themes, live swatches, active published indicators, and draft tags.
  - **Comprehensive Theme Tokens Editor**: 10 categorized token groups (General, Backgrounds, Text, Buttons, Inputs, Navigation, Messages, Members, Media, Borders) with live swatches, color pickers, and HEX/RGBA text controls.
  - **Global Layout Dimensions Settings**: Extensible configuration for profile cards, chat bubble radiuses, sidebar widths, channel row heights, server icons, title bars, typography, and animation timing.
  - **Hot Sync & Storage Persistence**: Saves configuration to PocketBase collection `app_settings_admin` (record `admin_settings`), syncs live across connected clients, and maintains local cache fallback (`admin_published_theme_v1`).
- **Profile Card Button Refinement (`UserProfileModal.tsx`)**:
  - **Uniform Sizing & Compact Spacing**: Adjusted bottom card actions ("Send Direct Message" and "View Server Profile / View Default Profile") to share identical height (`h-8`), exact text sizing (`text-[11px]`), balanced padding, and tight spacing (`gap-1.5`).

## [3.9.8] - 2026-07-28
### Improved & Enhanced
- **Hover-Consistent Channel Selection Highlight (`ChannelList.tsx` & `index.css`)**:
  - **Hover Fill Selection State**: Updated selected channel/DM highlight to use the exact filled background color (`var(--theme-channel-active-bg)` / `var(--theme-bg-tertiary)`), making the active channel stay in a clean "hovered" state without border outlines.
  - **Theme Tokens Architecture**: Introduced `--theme-channel-hover-bg` and `--theme-channel-active-bg` CSS variables across light and dark modes to maintain strict theme system adherence.
- **Increased Input Character Limits**:
  - **Expanded Biography Limit (`SettingsModal.tsx`, `ServerSettingsModal.tsx`, `UserProfileModal.tsx`)**: Increased biography text limit to **500 characters** across global user profiles, server-specific custom bios, and profile modal viewports.
  - **Expanded Message Limit (`ChatPanel.tsx`)**: Increased message composer and edit input limit from 4000 to **6000 characters**.
### Fixed
- **Stable Chat Scrolling & Scroll Jump Elimination (`ChatPanel.tsx`)**:
  - **Eliminated Scroll Jumps on Re-renders**: Removed repetitive `scrollTop = scrollHeight` assignments during state updates and re-renders when the user is manually reading or scrolling message history.
  - **Smart Bottom Scroll Pinning**: Restricted automatic scrolling (`scrollTop = scrollHeight`) to strictly trigger ONLY when a new message is sent by the current user or when the user is already at the bottom (`distFromBottom < 100px`).
  - **Media Load Preservation**: Added `onLoad` handlers to image and link preview attachments that expand container heights down smoothly without viewport jumping if the user is pinned at the bottom, while leaving `scrollTop` untouched when reading historical messages.
  - **Single Active Chat Container**: Verified clean unmounting and scroll restoration for Server and DM chats, ensuring zero inactive scroll observers or resize listeners interfere with viewport calculations.

## [3.9.6] - 2026-07-28
### Fixed
- **Conditional ChatPanel Mounting & Zero Panel Flicker (`App.tsx` & `ChatPanel.tsx`)**:
  - **Single Active Chat Panel Mounting**: Replaced dual absolute-layered DOM nodes with strict conditional rendering (`activeChannel ? <ChatPanel key={activeChannel.id} ... /> : null`). Inactive chat panels are fully unmounted, stopping background re-renders, resize observers, and scroll listeners.
  - **Zero Bottom/Scroll Flickering**: Completely eliminated frame flashing of inactive chat content during mode switches between Server Channels and Direct Messages.
  - **Automatic Unmount State Preservation**: Implemented an unmount lifecycle effect in `ChatPanel` that automatically saves conversation draft text, reply state, and scroll offset to the persistent `conversationCache` before unmounting.
  - **Synchronous Restoration**: Restores scroll position and cached input state synchronously in `useLayoutEffect` before browser layout paint.

## [3.9.5] - 2026-07-28
### Improved
- **Horizontal Sliding Panel Transition (`App.tsx`)**:
  - **Tab-Synchronized Slide Animation**: Configured panel layers with horizontal offset slide transitions (`translate-x-8` / `-translate-x-8`) that directly mirror the sliding tab switch movement of the Channels & DMs header buttons.
  - **RTL Support**: Automatically adjusts sliding direction based on active language (`lang === 'ar'` vs English LTR) for natural physical motion.

## [3.9.4] - 2026-07-28
### Improved
- **Smooth Non-Overlapping Fade Transitions (`App.tsx`)**:
  - **Clean Fade Transitions**: Replaced horizontal sliding translate offsets with pure `transition-opacity duration-150 ease-in-out` cross-fading (`opacity-100` vs `opacity-0`).
  - **Zero Visual Overlap**: Eliminates visual clutter, text collisions, and header overlapping when toggling between Direct Messages and Server Channels.

## [3.9.3] - 2026-07-28
### Fixed & Unified
- **Cohesive Synchronous Scroll Restoration & Zero Asynchronous Glitches (`ChatPanel.tsx`)**:
  - **Eliminated Asynchronous RAF Overrides**: Resolved a race condition where `requestAnimationFrame` hooks scheduled during panel transitions or background re-renders was overriding the restored `scrollTop` offset and jumping to the bottom.
  - **Synchronous Layout Restoration**: Unified state and scroll restoration into a single synchronous layout effect that restores the exact scroll offset (`scrollTop`) before layout paint.
  - **Smart New Message Scroll Controller**: Automatically syncs message IDs on tab foreground switches so new message auto-scroll triggers exclusively when a genuine new message arrives while viewing the active feed at the bottom or when sending a message.

## [3.9.2] - 2026-07-28
### Fixed & Enhanced
- **Exact Scroll Offset Preservation on Mode Switching (`ChatPanel.tsx`)**:
  - **Zero Scroll Jump on DM/Channels Mode Switch**: Fixed an issue where switching between Direct Messages and Server Channels would re-anchor the scroll position to the bottom of the feed.
  - **Foreground/Background Transition Preservation**: Integrated `isActive` panel visibility hooks that automatically capture and persist the exact `scrollTop` offset when a panel shifts to background, and restores it frame-perfectly when returning to foreground.
  - **Smart Bottom Anchoring**: Entering a fresh channel for the first time or returning to a channel where the user was at the bottom continues to position at newest messages, while scrolled-up reading history remains strictly locked at the exact message offset.

## [3.9.1] - 2026-07-28
### Refactored & Enhanced
- **Persistent DOM State & Scroll Preservation During Panel Switching (`App.tsx` & `ChatPanel.tsx`)**:
  - **DOM State Preservation**: Replaced `AnimatePresence` component unmounting with persistent layer stack rendering (`absolute inset-0 w-full h-full`), keeping both Server Chat Panel and Direct Messages Chat Panel mounted in DOM memory.
  - **Zero Scroll Jump / Zero Re-render**: Eliminates scroll offset resets, image reload flickers, and DOM re-calculations when switching between Server Channels and Direct Messages. Returning to a previous tab instantly reveals the exact scroll position and preview state pixel-for-pixel.
  - **Automatic Inactive Media Pausing**: Integrated `isActive` panel state detection in `ChatPanel.tsx` that automatically pauses playing `<video>` and `<audio>` elements whenever a chat panel transitions into the background.
  - **Background Mention & Notification Handling**: Active viewing state (`activeChannel`) tracks the foreground tab, ensuring incoming messages in background channels trigger unread badges, mention tags, and notifications as expected.
  - **RTL-Aware Sliding Transitions**: Sliding transition animations respect Arabic (`lang === 'ar'`) and English layout directions.

## [3.9.0] - 2026-07-28
### Added
- **Cross-Platform Automatic Update System**:
  - **PocketBase `app_updates` Integration**: Single source of truth querying published releases matching user OS (`windows`, `macos`, `linux`, `android`, `ios`) and release channel (`stable`, `beta`, `nightly`).
  - **Non-Blocking Startup Check**: Runs asynchronous background update check immediately on app launch after settings load without delaying UI render or blocking app usage.
  - **Background Installer Download & SHA-256 Verification**: Leverages `DownloadManager` IndexedDB storage for silent background downloading with Web Crypto API SHA-256 checksum verification before installation.
  - **Dedicated "Updates & Releases" Settings Tab**: Displays current version, platform, last check time, channel selector, automatic check/download preferences, release notes, and progress bar.
  - **Mandatory Update Enforcement**: Displays high-priority modal overlay enforcing critical mandatory updates (`mandatory == true`).
  - **Update Toast Notification**: Notifies users with an interactive in-app toast when a background update is ready to install.

### Refactored & Standardized
- **Navigation Tabs, DM Button & Chat Panel Switching (`ChannelList.tsx` & `App.tsx`)**:
  - **Unhighlighted "+ New DM" Button**: Converted `+ New DM` from a solid highlighted button to a subtle soft accent badge matching the Settings button aesthetic (`bg-accent/10 hover:bg-accent/20 text-accent font-bold px-1.5 py-0.5 rounded-lg border-0`).
  - **Smooth Channels vs. DMs Sliding Highlight**: Embedded tab buttons inside a shared segmented container with continuous Framer Motion `layoutId="activeTabHeaderIndicator"` layout animation, enabling fluid spring motion back and forth between Channels and DMs with full LTR & Arabic RTL support.
  - **Smooth Chat Panel Switching Animation**: Enclosed Server Chat Panel and DM Chat Panel in Framer Motion `<AnimatePresence mode="wait">` wrappers with directional sliding fade transitions when switching between Server Channels and Direct Messages.
- **Zero-Flicker Application Initialization & Startup Order**:
  - Synchronized `index.html` head script with `ThemeProvider` (`ThemeContext.tsx`) and `userSettings.ts` to ensure theme determination occurs prior to UI render.
  - Eliminated half-light/half-dark UI flashes on page reload, Guest mode login, and authentication state transitions.
  - Aligned `data-theme-mode`, `.light`, `.dark` CSS class states, and `localStorage` keys (`sirver_theme_mode` & `sirver_user_settings_cache_v2`).
- **Comprehensive Theme Token Audit**:
  - Replaced hardcoded slate/white color hexes across `NewDmModal`, `DiscoveryCenter`, `VoicePanel`, `AuthScreen`, `AttachmentDownloadControl`, `DownloadsTabContent`, `NotificationsPopover`, and `PinnedMessagesPopover` with global Theme Tokens (`var(--theme-bg-primary)`, `var(--theme-bg-card)`, `var(--theme-border)`, `var(--theme-text-primary)`, `var(--theme-text-muted)`).
  - Ensured progress indicators, badges, buttons, cards, and modal popovers dynamically update across runtime theme toggles in both guest and authenticated sessions.
  - Added global `html, body` background and text color CSS variable rules in `index.css` to guarantee instant styling prior to React hydration.

## [3.8.0] - 2026-07-27
### Refactored & Enhanced
- **Authoritative Online Presence Tracking**:
  - Wired real-time presence evaluations directly to user connection, disconnection, and heartbeats via `user-presence-changed` events.
  - Automatically moves users between Online and Offline sections immediately upon presence status changes.
  - Cleared stale cached states and ensured disconnected users are never shown as online.
- **In-App Downloads System & State Persistence**:
  - **Always-Visible Progress & Info**: Redesigned download item components to display progress bar, percentage, status badge, downloaded/total size, speed, remaining time, and local path by default without requiring hover interactions.
  - **3-Row Structured Layout**: Structured each download entry with Top Row (File icon, name, status badge, actions), Middle Row (Always-visible progress bar & percentage), and Bottom Row (Downloaded/total bytes, speed/remaining time or completed date, local path).
  - **Cross-Session Persistence via `attachments.downloaded_files`**: Synchronized local IndexedDB & `downloadManager` state with the backend `downloaded_files` JSON metadata on PocketBase attachment records.
  - **Automatic State Restoration**: Automatically checks `attachments.downloaded_files` and local IndexedDB on startup to render "Open" buttons for previously downloaded attachments.
  - **Startup File Validation**: Automatically verifies local file existence and flags missing files with "Missing File" status and a "Retry" option.

## [3.7.0] - 2026-07-27
### Refactored
- **Instant Chat Navigation**: Eliminated component unmounting and DOM recreation on channel and DM switching by maintaining stable React component keys (`server-chat-panel` and `dm-chat-panel`).
- **Complete Conversation State Preservation**: Implemented in-memory conversation state cache (`conversationCache`) preserving exact scroll position (`scrollTop`), draft input text, attached files, reply references, editing states, and search queries per channel/DM.
- **Scroll Movement Elimination**: Restored saved scroll offsets synchronously without animated smooth scrolling or delayed jumps, returning users to their exact reading position pixel.
- **Smooth Fade Transition**: Added a 150ms subtle fade transition during channel switches to completely hide DOM layout calculations and image loading reflow.
- **Layout Stability & Space Reservation**: Added minimum height and bounding box space reservations (`min-h-[140px] min-w-[200px]`) for image attachments and fixed size constraints for user avatars.
### Redesigned
- **Account & Profile Settings Page**: Completely redesigned the "Settings → Account & Profile" tab into a compact, interactive profile card editor.
- **Direct Inline Editing**: Users can now click directly on profile card elements (Display Name, Bio, Status, Avatar, Banner, Language) to edit them in real time without separate form fields.
- **Single-Screen Desktop Layout**: Eliminated vertical scrolling and duplicate input fields under the preview.
- **Theme & Color Presets**: Integrated instant theme palette presets (Avocado, Midnight, Violet, Sunset, Emerald) and 3-color pickers directly inside the card.

## [3.5.0] - 2026-07-27
### Fixed
- **Initialization Error**: Moved `getAvatarUrl` and `getAttachmentUrl` helper functions to top-level module scope in `ChatPanel.tsx` to fix `Cannot access 'getAvatarUrl' before initialization` runtime reference error.

### Changed
- **Server Member List Layout**: Positioned member list panel strictly below the chat top header so it never overlaps search, pinned messages, or notification buttons.
- **Removed Theme Toggle from Chat**: Removed theme switcher button from the chat header while keeping theme controls active in Settings and main application views.
- **Desktop Member List Behavior**: Transformed desktop member list from a floating overlay to a persistent inline panel (`w-64`) that resizes and pushes chat messages smoothly. Open/closed state persists across channel navigation via `localStorage`.
- **Mobile Member List Behavior**: Implemented a slide-over drawer overlay on mobile viewports with a dark backdrop, touch dismiss, Escape key listener, and browser back button integration.
- **Member Source & Count Filtering**: Fixed member loading to display strictly members belonging to the active server (`server.id`), matching actual server member counts.
- **Discord-Style Member Sorting & Grouping**: Organized server members into `ONLINE` and `OFFLINE` top-level categories, grouped by role hierarchy (`Owner`, custom server roles, `Members`), with offline users remaining below online sections.
- **UX & Search Polish**: Fixed search bar to top of member panel while scrolling and added scroll position preservation on panel reopen.

## [3.4.0] - 2026-07-27
### Added
- Created `MessageDeletionService` in `/src/services/messageDeletionService.ts` to cleanly handle message purging.

### Changed
- Updated attachment cleanup pipeline to retrieve and delete all corresponding records from `attachments` and `private_attachments` collections and PocketBase storage.
- Added automatic unpinning of pinned messages on deletion, updating channel/conversation metadata and cache without leaving stale references.
- Updated reply rendering so deleting an original message preserves reply messages while rendering a localized placeholder (`🗑️ Original message was deleted`).
- Delegated `pbService.deleteMessage` and realtime message deletion handlers to `MessageDeletionService`.

## [3.3.0] - 2026-07-27
### Changed
- Removed all colored theme overrides and standardized the application strictly on Light & Dark Monochrome theme tokens.
- Replaced hardcoded colored buttons, accents, and themes across `ChatPanel`, `UserProfileModal`, `ThemeToggle`, `SettingsModal`, and `ErrorBoundary`.
- Updated `themeTokens` in `src/theme/tokens.ts` and CSS variables in `src/index.css` to pure monochrome light & dark modes.
- Updated `THEME_GUIDE.md` to document the pure monochrome light/dark architecture.

## [3.2.0] - 2026-07-27
### Changed
- Replaced all remaining hardcoded color hexes (`#7BAE37`, `#568203`, `#7cb313`, etc.) with CSS theme variables (`var(--accent-color)`, `.bg-accent`, `.text-accent`, etc.).
- Migrated `NotificationsPopover`, `SettingsModal`, `CreateServerModal`, `CreateChannelModal`, `NewDmModal`, `MusicPlayer`, `UserProfileModal`, `AuthScreen`, and `ChatPanel` to respect the theme token architecture.
- Synchronized `applySettingsToDocument` in `userSettings.ts` with `ThemeContext` DOM attributes (`data-theme-mode`, `classList`).
- Updated `THEME_GUIDE.md` migration status tracker.

## [3.1.0] - 2026-07-27
### Added
- Centralized Theme System (`ThemeContext`, `tokens.ts`, `ThemeToggle` component).
- Support for Dark and Light modes with `localStorage` persistence.
- Project knowledge documentation suite (`AGENTS.md`, `THEME_GUIDE.md`, `PROJECT_CONTEXT.md`, `DATABASE.md`, `FEATURES.md`, `CHANGELOG.md`).

### Changed
- Migrated `AuthScreen`, `ChatPanel`, and `ChannelList` to utilize the new global theme tokens and glassmorphism styling.
- Updated `src/theme/tokens.ts` and `src/index.css` to pure black & white values with a neutral gray accent to test global system connectivity.
