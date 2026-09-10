import React, { useState, useEffect, useRef } from 'react';
import { openExternalUrl } from '../lib/tauriDesktopService';

interface ExternalImagePreviewProps {
  url: string;
  alt?: string;
  onLoad?: () => void;
  className?: string;
}

interface CacheEntry {
  previewUrl: string;
  originalUrl: string;
  width: number;
  height: number;
  created: number;
  isObjectUrl: boolean;
}

// Global LRU cache for downscaled external image previews
const MAX_CACHE_SIZE = 100;
const previewCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<CacheEntry>>();

function evictOldestCacheIfNeeded() {
  if (previewCache.size <= MAX_CACHE_SIZE) return;
  const entries = Array.from(previewCache.entries()).sort((a, b) => a[1].created - b[1].created);
  const toEvict = entries.slice(0, previewCache.size - MAX_CACHE_SIZE);
  for (const [key, entry] of toEvict) {
    if (entry.isObjectUrl && entry.previewUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(entry.previewUrl);
      } catch (e) {
        // Ignore revocation errors
      }
    }
    previewCache.delete(key);
  }
}

/**
 * Asynchronously processes, decodes, and downscales an external image URL
 * to fit preview dimensions (max width 600px, max height 288px).
 */
async function processExternalImage(url: string): Promise<CacheEntry> {
  // Check cache first
  const cached = previewCache.get(url);
  if (cached) {
    return cached;
  }

  // Check in-flight deduplicated promise
  const pending = pendingRequests.get(url);
  if (pending) {
    return pending;
  }

  const promise = (async (): Promise<CacheEntry> => {
    const isGif = /\.gif($|\?)/i.test(url) || /format=gif/i.test(url);
    const MAX_TARGET_WIDTH = 600;
    const MAX_TARGET_HEIGHT = 288;

    // Strategy A: Direct fetch + createImageBitmap + OffscreenCanvas (Non-blocking worker thread)
    if (!isGif && typeof fetch !== 'undefined') {
      try {
        const response = await fetch(url, { referrerPolicy: 'no-referrer', mode: 'cors' });
        if (response.ok) {
          const blob = await response.blob();
          if (blob.type.startsWith('image/')) {
            let bmp: ImageBitmap | null = null;
            try {
              bmp = await createImageBitmap(blob);
            } catch {
              bmp = null;
            }

            if (bmp) {
              const origWidth = bmp.width;
              const origHeight = bmp.height;

              // If already small enough, skip downscaling
              if (origWidth <= MAX_TARGET_WIDTH && origHeight <= MAX_TARGET_HEIGHT) {
                bmp.close();
                const objectUrl = URL.createObjectURL(blob);
                const entry: CacheEntry = {
                  previewUrl: objectUrl,
                  originalUrl: url,
                  width: origWidth,
                  height: origHeight,
                  created: Date.now(),
                  isObjectUrl: true,
                };
                previewCache.set(url, entry);
                evictOldestCacheIfNeeded();
                return entry;
              }

              // Compute target aspect-ratio preserved dimensions
              const scale = Math.min(1, MAX_TARGET_WIDTH / origWidth, MAX_TARGET_HEIGHT / origHeight);
              const targetW = Math.max(1, Math.round(origWidth * scale));
              const targetH = Math.max(1, Math.round(origHeight * scale));

              let previewBlob: Blob | null = null;

              // Try OffscreenCanvas if supported
              if (typeof OffscreenCanvas !== 'undefined') {
                try {
                  const offscreen = new OffscreenCanvas(targetW, targetH);
                  const ctx = offscreen.getContext('2d');
                  if (ctx) {
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(bmp, 0, 0, targetW, targetH);
                    previewBlob = await offscreen.convertToBlob({ type: 'image/webp', quality: 0.85 });
                  }
                } catch {
                  previewBlob = null;
                }
              }

              // Fallback to standard canvas if OffscreenCanvas returned null
              if (!previewBlob && typeof document !== 'undefined') {
                try {
                  const canvas = document.createElement('canvas');
                  canvas.width = targetW;
                  canvas.height = targetH;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(bmp, 0, 0, targetW, targetH);
                    previewBlob = await new Promise<Blob | null>((resolve) => {
                      canvas.toBlob((b) => resolve(b), 'image/webp', 0.85);
                    });
                  }
                  canvas.width = 0;
                  canvas.height = 0;
                } catch {
                  previewBlob = null;
                }
              }

              bmp.close(); // Dispose bitmap immediately

              if (previewBlob) {
                const objectUrl = URL.createObjectURL(previewBlob);
                const entry: CacheEntry = {
                  previewUrl: objectUrl,
                  originalUrl: url,
                  width: targetW,
                  height: targetH,
                  created: Date.now(),
                  isObjectUrl: true,
                };
                previewCache.set(url, entry);
                evictOldestCacheIfNeeded();
                return entry;
              }
            }
          }
        }
      } catch {
        // Fetch/CORS blocked, fallback to Strategy B
      }
    }

    // Strategy B: Async HTMLImageElement.decode() fallback (CORS / non-fetchable URLs)
    if (typeof document !== 'undefined') {
      try {
        const img = document.createElement('img');
        img.referrerPolicy = 'no-referrer';
        img.crossOrigin = 'anonymous';
        img.src = url;

        try {
          await img.decode();
        } catch {
          await new Promise<void>((res, rej) => {
            img.onload = () => res();
            img.onerror = (e) => rej(e);
          });
        }

        const origWidth = img.naturalWidth || MAX_TARGET_WIDTH;
        const origHeight = img.naturalHeight || MAX_TARGET_HEIGHT;

        // Try canvas downscale if not tainted
        if (!isGif && typeof document !== 'undefined') {
          try {
            const scale = Math.min(1, MAX_TARGET_WIDTH / origWidth, MAX_TARGET_HEIGHT / origHeight);
            const targetW = Math.max(1, Math.round(origWidth * scale));
            const targetH = Math.max(1, Math.round(origHeight * scale));

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, targetW, targetH);
              const previewBlob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((b) => resolve(b), 'image/webp', 0.85);
              });
              canvas.width = 0;
              canvas.height = 0;

              if (previewBlob) {
                const objectUrl = URL.createObjectURL(previewBlob);
                const entry: CacheEntry = {
                  previewUrl: objectUrl,
                  originalUrl: url,
                  width: targetW,
                  height: targetH,
                  created: Date.now(),
                  isObjectUrl: true,
                };
                previewCache.set(url, entry);
                evictOldestCacheIfNeeded();
                return entry;
              }
            }
          } catch {
            // Tainted canvas or canvas error, fallback to direct url
          }
        }

        // Direct URL entry
        const entry: CacheEntry = {
          previewUrl: url,
          originalUrl: url,
          width: origWidth,
          height: origHeight,
          created: Date.now(),
          isObjectUrl: false,
        };
        previewCache.set(url, entry);
        evictOldestCacheIfNeeded();
        return entry;
      } catch {
        // Fallback on image error
      }
    }

    // Direct fallback
    const fallbackEntry: CacheEntry = {
      previewUrl: url,
      originalUrl: url,
      width: MAX_TARGET_WIDTH,
      height: MAX_TARGET_HEIGHT,
      created: Date.now(),
      isObjectUrl: false,
    };
    previewCache.set(url, fallbackEntry);
    return fallbackEntry;
  })();

  pendingRequests.set(url, promise);

  try {
    const result = await promise;
    return result;
  } finally {
    pendingRequests.delete(url);
  }
}

export function preloadExternalImage(url: string): Promise<CacheEntry> {
  if (!url) {
    return Promise.resolve({
      previewUrl: '',
      originalUrl: '',
      width: 600,
      height: 288,
      created: Date.now(),
      isObjectUrl: false,
    });
  }
  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  }
  return processExternalImage(url);
}

function ExternalImagePreviewComponent({
  url,
  alt = 'Link Preview',
  onLoad,
  className = '',
}: ExternalImagePreviewProps) {
  const [previewSrc, setPreviewSrc] = useState<string>(() => {
    const cached = previewCache.get(url);
    return cached ? cached.previewUrl : '';
  });
  const [loading, setLoading] = useState<boolean>(!previewCache.has(url));
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const cached = previewCache.get(url);

    if (cached) {
      setPreviewSrc(cached.previewUrl);
      setLoading(false);
      return;
    }

    setLoading(true);
    processExternalImage(url).then((entry) => {
      if (isMountedRef.current) {
        setPreviewSrc(entry.previewUrl);
        setLoading(false);
      }
    }).catch(() => {
      if (isMountedRef.current) {
        setLoading(false);
      }
    });

    return () => {
      isMountedRef.current = false;
    };
  }, [url]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openExternalUrl(url);
  };

  return (
    <div
      className={`relative w-full max-w-[360px] rounded-2xl overflow-hidden border border-[var(--theme-border)] shadow-md ${previewSrc && !loading ? 'bg-transparent' : 'bg-slate-900/40'} flex items-center justify-center shrink-0`}
      style={{
        aspectRatio: '16 / 9',
        minHeight: '160px',
      }}
    >
      {loading && !previewSrc && (
        <div className="absolute inset-0 bg-[var(--theme-bg-tertiary)]/50 animate-pulse rounded-2xl flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin opacity-60" />
        </div>
      )}

      {previewSrc && (
        <img
          src={previewSrc}
          alt={alt}
          loading="eager"
          decoding="async"
          className={`w-full h-full rounded-2xl object-cover cursor-zoom-in hover:scale-[1.005] transition-opacity duration-150 block ${
            loading ? 'opacity-0' : 'opacity-100'
          } ${className}`}
          onClick={handleClick}
          onLoad={() => {
            if (loading) setLoading(false);
            onLoad?.();
          }}
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}

export const ExternalImagePreview = React.memo(ExternalImagePreviewComponent);
export default ExternalImagePreview;
