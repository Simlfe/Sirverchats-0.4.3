# Sirver Global Theme System & Architecture Guide

This document details the centralized theme system implemented across the **Sirver** platform, guidelines for design tokens, and instructions for migrating existing UI components.

---

## 1. File & Directory Structure

- **Context & State Management**: `/src/context/ThemeContext.tsx`
  - Manages `theme` state (`'dark'` | `'light'`).
  - Persists preference in `localStorage` under key `sirver_theme_mode`.
  - Applies CSS classes (`dark`, `light`) and the `data-theme-mode` attribute to `document.documentElement` (`<html>`).
- **Design Tokens**: `/src/theme/tokens.ts`
  - Contains JS design tokens for colors, typography, border radii, and shadows.
  - Theme Architecture: Pure Monochrome Light & Dark mode (`#FAFAFA` dark accent, `#09090B` light accent).
- **CSS Variables & Global Styles**: `/src/index.css`
  - Defines CSS custom variables for dark/light modes (`--theme-bg-primary`, `--theme-bg-secondary`, `--theme-text-primary`, etc.).
  - Includes glassmorphism and material utility classes (`.glass-panel`, `.glass-card`, `.avocado-glow`).
- **Theme Switcher Component**: `/src/components/ThemeToggle.tsx`
  - A reusable toggle control featuring smooth spring animations and theme status indicators.

---

## 2. How Dark & Light Mode Works

1. **Initialization**: Upon app startup, `ThemeProvider` checks `localStorage` for `sirver_theme_mode`. If unavailable, it falls back to system preference via `window.matchMedia('(prefers-color-scheme: light)')`.
2. **Persistence**: Calling `toggleTheme()` or `setTheme()` automatically updates state and writes the new mode to `localStorage`.
3. **DOM Reflection**:
   - Dark Mode: `<html>` element receives class `.dark` and attribute `data-theme-mode="dark"`.
   - Light Mode: `<html>` element receives class `.light` and attribute `data-theme-mode="light"`.
4. **CSS Custom Properties**: CSS variable overrides defined in `index.css` instantly re-theme all components consuming CSS variables or Tailwind dark mode modifiers (`dark:*`).

---

## 3. Rules for Component Development

When creating or editing components:
1. **Use `useTheme()` Context**: Import `useTheme` from `../context/ThemeContext` to obtain `isDark` or `theme`.
2. **Avoid Pure Hardcoded Gray/Blue Colors**:
   - Avoid fixed `bg-slate-900` or `bg-white` without dynamic theme fallback conditionals.
   - Use dynamic classes based on `isDark` or `isLight` (e.g., `isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-white'`).
   - Or use utility classes with Tailwind's `dark:` modifier (e.g., `bg-slate-100 dark:bg-slate-900`).
3. **Accent Colors**: Always use Theme Tokens (`var(--accent-color)` or `resolvedTokens.general.accent`), which resolve to protected Monochrome `#FAFAFA` (Dark) / `#18181B` (Light) when custom themes are disabled, or custom theme accents when custom themes are enabled.
4. **Glass & Translucency**: Use `.glass-panel` or `.glass-card` utilities for overlays, popovers, drawers, and headers.

---

## 4. Migration Status Tracker

### Components Migrated / Integrated
- [x] `src/context/ThemeContext.tsx` (Frame-0 theme initialization with 3-tier startup priority: cached theme -> OS preference -> default fallback)
- [x] `src/theme/adminThemeService.ts` (Full design tokens architecture, CSS custom property injection, and local storage fallback caching)
- [x] `src/components/GlobalThemeManagerTab.tsx` (Admin-only Global App Theme manager with live theme library, 10 categorized token editors, global layout settings, and instant hot-sync)
- [x] `src/theme/tokens.ts`
- [x] `src/services/fontLoader.ts` & `src/theme/adminThemeService.ts` (Core UI fonts load from the initial HTML stylesheet; optional theme fonts are fetched on demand after a user selects them, reducing first-paint font waterfall while preserving theme font choices)
- [x] `src/components/ThemeToggle.tsx`
- [x] `src/main.tsx` (wrapped with `<ThemeProvider>`)
- [x] `src/components/AuthScreen.tsx` (Guest mode & Auth screens fully aligned with Theme Tokens and ThemeToggle)
- [x] `src/components/ChatPanel.tsx` (Instant channel & DM navigation system with strict conditional active panel mounting, zero scroll jump/flicker on DM/Channel switch, module-level conversationCache unmount preservation, auto-pausing media, smart bottom scroll-pinning with media load preservation, tokenized member list toggle button, and resilient slide-over/persistent member list drawers)
- [x] `src/components/ChannelList.tsx` (Space card banners, server icons, unread badges migrated to theme accent; hover-consistent active channel selection highlight powered by `--theme-channel-active-bg` tokens without border outlines; 60 FPS GPU-accelerated tab indicator transitions)
- [x] `src/components/UserProfileModal.tsx` (Profile actions & toggle buttons migrated to theme accent; centered layout on mobile viewports with spring avatar popout animation)
- [x] `src/components/NotificationsPopover.tsx` (Migrated unread indicators, header icons & friend request actions)
- [x] `src/components/PinnedMessagesPopover.tsx` (Unpin buttons, channel mentions & badges migrated to theme tokens)
- [x] `src/components/SettingsModal.tsx` (Redesigned Account & Profile tab into an interactive profile card editor; migrated Profile Card Scale slider and Storage & Data media optimization panels to theme CSS tokens)
- [x] `src/components/CreateServerModal.tsx` (Migrated action buttons & focus borders to theme tokens)
- [x] `src/components/CreateChannelModal.tsx` (Migrated channel type selector & buttons to theme tokens)
- [x] `src/components/NewDmModal.tsx` (Header, search input & user list items migrated to theme tokens)
- [x] `src/components/DiscoveryCenter.tsx` (Password prompt modals, server cards & search inputs migrated to theme tokens)
- [x] `src/components/VoicePanel.tsx` (Voice connected headers, latency badges, sound meters & participant cards migrated to theme tokens)
- [x] `src/components/MusicPlayer.tsx` (Migrated progress tracks, volume sliders & badges to CSS accent variable)
- [x] `src/components/DownloadsTabContent.tsx` (Refined downloads manager with always-visible progress bar, status badges, sizes, speed/time, and local path in 3-row layout)
- [x] `src/components/AttachmentDownloadControl.tsx` (Integrated with backend `attachments.downloaded_files` JSON metadata for cross-session state persistence & automatic startup file validation)
- [x] `src/components/MessageLinkPreview.tsx` (Migrated cards, headers, user badges, timestamps, attachments, and jump actions to theme tokens `--theme-bg-card`, `--theme-bg-secondary`, `--theme-border`, `--theme-text-primary`, `--theme-text-secondary`, `--theme-text-muted`)
- [x] `src/components/GlobalThemeManagerTab.tsx` & `src/theme/adminThemeService.ts` (Added 4-status presence indicators `--status-online`, `--status-away`, `--status-dnd`, `--status-offline`, `Sync Both Modes` dark/light auto-variant toggle, RTL toggle alignment, and profile card dimension preview controls)
- [x] `src/App.tsx` & `src/components/ChatPanel.tsx` (Implemented 1:1 touch gesture-driven mobile sidebar & member list drawers with RTL support and smooth backdrop opacity transition)
- [x] `src/App.tsx`, `src/pocketbase.ts` & `src/services/offlineCacheService.ts` (Corrected message pagination pipeline & end-of-history server detection, eliminating premature "start of chat" indicator while preserving local cache merging and smooth scrolling)
- [x] `src/main.tsx` (Globally disabled console logging output in production builds while allowing development debugging logs)
- [x] `src/index.css` (Added global CSS rules `backdrop-filter: none !important` and `filter: none !important` for all `[class*="backdrop-blur"]` and `[class*="blur-"]` elements to completely remove blur and glassmorphism backdrop effects across all app views, modals, and overlays)
- [x] `src/components/FullscreenVideoOverlay.tsx` (Refactored complete Android fullscreen rendering pipeline: decoupled fixed viewport styles, BridgeWebChromeClient native custom view support, Capacitor StatusBar sticky immersive mode, single stream renderer detachment in `ParticipantTile`, and visualViewport dimension logging)
- [x] `src/components/ChatPanel.tsx` (Enhanced chat date & day separator visibility in light mode: upgraded side divider lines to `bg-slate-300`, pill container to `bg-slate-100`, crisp border `border-slate-300`, and high-contrast `text-slate-700`)
- [x] `src/components/VoicePanel.tsx` & `src/media/RealtimeMediaProvider.ts` (Refactored call connection lifecycle: decoupled voice presence from media authority, unified 20s media grace period, 1500ms buffered track transitions, and set-union member list state using theme tokens)
- [x] `src/index.css`, `src/theme/tokens.ts`, `src/theme/adminThemeService.ts` & Layout Components (Upgraded side panel color tokens in light and dark modes for enhanced background contrast, adjusted default dark white contrast token to warm yellowish white `#FAF8ED`, aligned member list header `h-14` with title bar, removed member list corner curves, made separators thinner everywhere, fixed dark mode search input focus background, and added smooth sliding tab indicator for channels and DMs)
- [x] `src/components/ChatPanel.tsx` & `src/services/websocket.ts` (Achieved instant sub-millisecond typing speed by fast-pathing `adjustTextareaHeight` to bypass DOM layout reflows on single-line typing and skipping regex checks when `@` is absent; upgraded WebSocketService with instance-deduplicated BroadcastChannel message dispatching, clean exponential reconnect backoffs, and silent error handling)
- [x] `src/components/SmartVideoLinkPreview.tsx`, `src/components/MusicPlayer.tsx` & `src/components/SocialEmbeds.tsx` (Migrated YouTube, direct video, and social media video links to high-definition thumbnail preview cards with external player launch integration via `openExternalUrl`, completely removing in-app embedded playback and keeping memory footprints minimal while aligning all card borders, backgrounds, badges, and buttons with design tokens `--theme-bg-card`, `--theme-bg-secondary`, `--theme-border`, `--theme-text-primary`, and `--accent-color`)
- [x] `src/components/MessageReactions.tsx` (Migrated reaction chips, quick add buttons, reaction picker portal, and categories to design tokens and Tailwind theme variables with high contrast active/inactive states for both dark and light modes)
- [x] `src/theme/builtinThemes.ts`, `src/theme/adminThemeService.ts` & `src/components/SettingsModal.tsx` (Expanded default theme library to 26 complete custom themes with distinct backgrounds, contrasts, accents, and custom font pairings; integrated full Google Fonts registry; upgraded theme selector cards with color preview swatches, font badges, and instant selection feedback)
- [x] `src/index.css`, `src/theme/adminThemeService.ts` & `src/App.tsx` (Removed static CSS overrides in `.light` and `.dark` classes to allow dynamic theme background, surface, and font variables to cascade universally across the entire application in both Light and Dark modes)
- [x] `src/theme/builtinThemes.ts`, `src/theme/adminThemeService.ts`, `src/index.css`, `src/App.tsx`, `src/components/SettingsModal.tsx` & `src/components/GlobalThemeManagerTab.tsx` (Added Wallpaper Background Image Layer `#theme-wallpaper-layer` with custom opacity/blur/fit controls, Universal Arabic Font Fallback engine with Cairo/Tajawal/Alexandria, and categorized theme library for Anime, Games, Action & Neon, Aesthetic, and Core themes including AOT, Zero Two, Valorant, Demon Slayer, Solo Leveling, Elden Ring, Cyberpunk 2077, and Genshin Impact)
- [x] `src/theme/adminThemeService.ts`, `src/index.css` & `src/App.tsx` (Fixed theme wallpaper visibility by conditionally making root and body backgrounds transparent when a wallpaper theme is active, wrapping the app container in `.app-root-container`, and applying sophisticated frosted glass translucency across sidebars, chat panels, title bars, and server lists via `color-mix` and `backdrop-filter`)
- [x] `src/theme/adminThemeService.ts`, `src/components/GlobalThemeManagerTab.tsx` & `src/components/SettingsModal.tsx` (Implemented custom wallpaper uploads and URL ingestion directly persisted into PocketBase `attachments` collection, with searchable and categorized High-Res Wallpaper Presets library, live preview, fit/opacity/blur fine-tuning controls, and local storage synchronization)
- [x] `src/theme/adminThemeService.ts`, `src/context/ThemeContext.tsx`, `src/components/SettingsModal.tsx`, `src/components/GlobalThemeManagerTab.tsx` & `src/pocketbase.ts` (Implemented dual background image slots per theme with active index switching, local image override persistence preventing reversions on app restart, and force deletion of wallpaper attachment records from PocketBase)
- [x] `src/components/FloatingCallWindow.tsx`, `src/context/MediaContext.tsx` & `src/services/callSignaling.ts` (Migrated call window and notifications to theme tokens: integrated 3-action floating incoming call cards with Answer, Reject, and Mute buttons; zero-padded live call duration counter; mini participant avatar strip with active speaker borders; and default call controls grid for Mute, Deafen, Camera, Screen Share, and Audio Mixer while keeping the user in their active text channel)
- [x] `src/index.css`, `src/App.tsx`, `src/components/ChatPanel.tsx`, `src/components/NotificationsPopover.tsx` & `src/components/PinnedMessagesPopover.tsx` (Removed transparency for mobile drawers, side panels, popovers, dropdown menus, context menus, and modals so underlying chat text never bleeds through on mobile, while preserving chat view transparency and background wallpaper image visibility)
- [x] `src/components/` Comprehensive Theme Token Alignment: Migrated hardcoded `text-white` on `bg-accent` to dynamic `var(--theme-accent-contrast, #ffffff)` and aligned background/border/text tokens across all active modals and panels (`MusicPlayer.tsx`, `VoicePanel.tsx`, `DownloadsTabContent.tsx`, `UpdatesTabContent.tsx`, `ErrorBoundary.tsx`, `AttachmentDownloadControl.tsx`, `ParticipantTile.tsx`, `ChannelMediaGalleryModal.tsx`, `ServerSettingsModal.tsx`, `AuthScreen.tsx`, `ChatPanel.tsx`, `UserProfileModal.tsx`, `DiscoveryCenter.tsx`, `SettingsModal.tsx`, `NotificationsPopover.tsx`, `NewDmModal.tsx`, `CustomStatusModal.tsx`, `MemberContextMenu.tsx`, `MessageContextMenu.tsx`, `IncomingCallModal.tsx`, `DMCallOverlay.tsx`, `FloatingCallWindow.tsx`)

### Initialization & Token Audit Verification
- [x] **Zero Startup Flash**: Theme preference is read and applied to `document.documentElement` before React renders.
- [x] **Guest Mode Compatibility**: Guest mode reads theme directly from `localStorage` without requiring authentication.
- [x] **Runtime Theme Switching**: Toggling theme updates all overlays, popovers, panels, and modals instantaneously.
- [x] **Multi-Status Presence Tokens**: Extended member tokens to specify per-status colors for Online, Away, DND, and Offline indicators.
- [x] **Single Source of Truth**: All theme tokens reference `/src/theme/tokens.ts`, `/src/theme/adminThemeService.ts`, `/src/index.css`, and `/THEME_GUIDE.md`.

---

## 5. Updating This Guide

Update this document whenever:
- New design tokens or color variables are added to `/src/theme/tokens.ts` or `/src/index.css`.
- Additional components are fully migrated to use the centralized theme context.
