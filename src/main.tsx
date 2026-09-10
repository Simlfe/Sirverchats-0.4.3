import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { MediaProvider } from './context/MediaContext.tsx';
import { liveShellService } from './services/liveShellService.ts';
import { cleanupStorageQuota } from './lib/storageManager.ts';
import './index.css';

// Proactively run emergency quota cleanup if localStorage is congested
if (typeof window !== 'undefined') {
  cleanupStorageQuota();
}

// Initialize Live Web Shell for native desktop clients
if (typeof window !== 'undefined') {
  liveShellService.init().catch((err) => {
    console.warn('[LiveShell] Init warning:', err);
  });
}

// Disable console logs in production builds
if (typeof window !== 'undefined' && (import.meta as any).env?.PROD) {
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
}

// Platform Detection & Global WebRTC Abort Error Handlers
if (typeof window !== 'undefined') {
  const isAndroid = /Android/i.test(navigator.userAgent || '');
  if (isAndroid) {
    document.documentElement.setAttribute('data-platform', 'android');
  }

  // Gracefully intercept benign WebRTC DataChannel closures and User-Initiated Abort messages
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || '');
    if (
      reason.includes('DataChannel error') ||
      reason.includes('publisher data channel') ||
      reason.includes('User-Initiated Abort') ||
      reason.includes('closed unexpectedly')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (
      msg.includes('DataChannel error') ||
      msg.includes('publisher data channel') ||
      msg.includes('User-Initiated Abort') ||
      msg.includes('closed unexpectedly')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <MediaProvider>
          <App />
        </MediaProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
