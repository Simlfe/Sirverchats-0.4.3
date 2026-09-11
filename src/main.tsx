import React, { StrictMode, Suspense, useEffect, useState } from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { liveShellService } from './services/liveShellService.ts';
import { cleanupStorageQuota } from './lib/storageManager.ts';
import { registerMediaProviderLoader } from './context/MediaContextBridge.ts';
import './index.css';

const LazyMediaProvider = React.lazy(() => import('./context/MediaContext.tsx').then((module) => ({ default: module.MediaProvider })));

function DeferredMediaProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const readyRef = React.useRef<Promise<void> | null>(null);

  const ensureProvider = React.useCallback((): Promise<void> => {
    setEnabled(true);
    if (!readyRef.current) {
      readyRef.current = new Promise<void>((resolve) => {
        const check = () => {
          if (document.querySelector('[data-media-provider="ready"]')) resolve();
          else window.setTimeout(check, 0);
        };
        check();
      });
    }
    return readyRef.current;
  }, []);

  useEffect(() => {
    registerMediaProviderLoader(ensureProvider);
    const enable = () => setEnabled(true);
    const request = () => { void ensureProvider(); };
    window.addEventListener('pointerdown', enable, { once: true, passive: true });
    window.addEventListener('sirver:media-request', request);
    const idleApi = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (typeof idleApi.requestIdleCallback === 'function') {
      const id = idleApi.requestIdleCallback(enable, { timeout: 1500 });
      return () => {
        window.removeEventListener('pointerdown', enable);
        window.removeEventListener('sirver:media-request', request);
        idleApi.cancelIdleCallback?.(id);
        registerMediaProviderLoader(null);
      };
    }
    const timeout = window.setTimeout(enable, 1500);
    return () => {
      window.removeEventListener('pointerdown', enable);
      window.removeEventListener('sirver:media-request', request);
      window.clearTimeout(timeout);
      registerMediaProviderLoader(null);
    };
  }, [ensureProvider]);

  if (!enabled) return <>{children}</>;
  return (
    <Suspense fallback={<>{children}</>}>
      <LazyMediaProvider>
        <div data-media-provider="ready" className="contents">{children}</div>
      </LazyMediaProvider>
    </Suspense>
  );
}

// Run quota cleanup during idle time after initial mount if supported
if (typeof window !== 'undefined') {
  const deferCleanup = () => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => cleanupStorageQuota());
    } else {
      setTimeout(() => cleanupStorageQuota(), 3000);
    }
  };
  if (document.readyState === 'complete') {
    deferCleanup();
  } else {
    window.addEventListener('load', deferCleanup, { once: true });
  }
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
        <DeferredMediaProvider>
          <App />
        </DeferredMediaProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
