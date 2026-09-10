import React, { useState, useEffect, useRef } from 'react';
import { loadUserSettings } from '../lib/userSettings';
import { getEffectiveGifPlaybackMode, getGifFirstFrame } from '../lib/gifFrameHelper';

export interface UploadedImagePreviewProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  maxPreviewWidth?: number;
  maxPreviewHeight?: number;
  onLoad?: (e?: any) => void;
  onError?: (e?: any) => void;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  className?: string;
  style?: React.CSSProperties;
}

interface CacheEntry {
  previewUrl: string;
  originalUrl: string;
  width: number;
  height: number;
  created: number;
  isObjectUrl: boolean;
}

const MAX_CACHE_SIZE = 150;
const uploadedPreviewCache = new Map<string, CacheEntry>();
const pendingUploadedRequests = new Map<string, Promise<CacheEntry>>();
export const attachmentDimensionsCache = new Map<string, { width: number; height: number }>();

function evictUploadedCacheIfNeeded() {
  if (uploadedPreviewCache.size <= MAX_CACHE_SIZE) return;
  const entries = Array.from(uploadedPreviewCache.entries()).sort((a, b) => a[1].created - b[1].created);
  const toEvict = entries.slice(0, uploadedPreviewCache.size - MAX_CACHE_SIZE);
  for (const [key, entry] of toEvict) {
    if (entry.isObjectUrl && entry.previewUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(entry.previewUrl);
      } catch (e) {
        // Ignore revocation error
      }
    }
    uploadedPreviewCache.delete(key);
  }
}

/**
 * Asynchronously processes and downscales uploaded image attachments for chat display.
 * Generates a scaled display preview (default max 960x720) while preserving aspect ratio.
 */
async function processUploadedImagePreview(
  url: string,
  maxWidth = 960,
  maxHeight = 720
): Promise<CacheEntry> {
  const cacheKey = `${url}_w${maxWidth}_h${maxHeight}`;
  const cached = uploadedPreviewCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = pendingUploadedRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  const promise = (async (): Promise<CacheEntry> => {
    const isGif = /\.gif($|\?)/i.test(url) || /format=gif/i.test(url);

    // Strategy A: Direct fetch + createImageBitmap + OffscreenCanvas (Fast, non-blocking)
    if (!isGif && typeof fetch !== 'undefined') {
      try {
        const response = await fetch(url, { referrerPolicy: 'no-referrer' });
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

              // Do not upscale or resize if already smaller than max target preview resolution
              if (origWidth <= maxWidth && origHeight <= maxHeight) {
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
                uploadedPreviewCache.set(cacheKey, entry);
                evictUploadedCacheIfNeeded();
                return entry;
              }

              // Scale proportionally preserving original aspect ratio
              const scale = Math.min(1, maxWidth / origWidth, maxHeight / origHeight);
              const targetW = Math.max(1, Math.round(origWidth * scale));
              const targetH = Math.max(1, Math.round(origHeight * scale));

              let previewBlob: Blob | null = null;

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

              bmp.close();

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
                uploadedPreviewCache.set(cacheKey, entry);
                evictUploadedCacheIfNeeded();
                return entry;
              }
            }
          }
        }
      } catch {
        // Fallback to strategy B
      }
    }

    // Strategy B: Image element decode fallback
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

        const origWidth = img.naturalWidth || maxWidth;
        const origHeight = img.naturalHeight || maxHeight;

        if (!isGif) {
          try {
            const scale = Math.min(1, maxWidth / origWidth, maxHeight / origHeight);
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
                uploadedPreviewCache.set(cacheKey, entry);
                evictUploadedCacheIfNeeded();
                return entry;
              }
            }
          } catch {
            // Tainted canvas or canvas error
          }
        }

        const entry: CacheEntry = {
          previewUrl: url,
          originalUrl: url,
          width: origWidth,
          height: origHeight,
          created: Date.now(),
          isObjectUrl: false,
        };
        uploadedPreviewCache.set(cacheKey, entry);
        evictUploadedCacheIfNeeded();
        return entry;
      } catch {
        // Error decoding image
      }
    }

    const fallbackEntry: CacheEntry = {
      previewUrl: url,
      originalUrl: url,
      width: maxWidth,
      height: maxHeight,
      created: Date.now(),
      isObjectUrl: false,
    };
    uploadedPreviewCache.set(cacheKey, fallbackEntry);
    return fallbackEntry;
  })();

  pendingUploadedRequests.set(cacheKey, promise);

  try {
    const result = await promise;
    return result;
  } finally {
    pendingUploadedRequests.delete(cacheKey);
  }
}

export function preloadUploadedImage(
  url: string,
  maxWidth = 960,
  maxHeight = 720
): Promise<CacheEntry> {
  if (!url) {
    return Promise.resolve({
      previewUrl: '',
      originalUrl: '',
      width: maxWidth,
      height: maxHeight,
      created: Date.now(),
      isObjectUrl: false,
    });
  }
  // Prime browser network/image cache
  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  }
  return processUploadedImagePreview(url, maxWidth, maxHeight);
}

function UploadedImagePreviewComponent({
  src,
  alt = 'Attachment',
  width,
  height,
  aspectRatio,
  maxPreviewWidth = 960,
  maxPreviewHeight = 720,
  onLoad,
  onError,
  onClick,
  className = '',
  style,
  ...rest
}: UploadedImagePreviewProps) {
  const isGif = Boolean(src && (/\.gif($|\?)/i.test(src) || /format=gif/i.test(src) || src.toLowerCase().includes('.gif')));

  if (isGif) {
    const GIF_MAX_PREVIEW_EDGE = 640;
    const effectiveMaxW = Math.min(maxPreviewWidth, GIF_MAX_PREVIEW_EDGE);
    const effectiveMaxH = Math.min(maxPreviewHeight, GIF_MAX_PREVIEW_EDGE);

    return (
      <GifCanvasPreview
        src={src}
        maxW={effectiveMaxW}
        maxH={effectiveMaxH}
        alt={alt}
        className={className}
        style={style}
        onClick={onClick}
        onLoad={onLoad}
        onError={onError}
        {...rest}
      />
    );
  }

  const cacheKey = `${src}_w${maxPreviewWidth}_h${maxPreviewHeight}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [cachedEntry, setCachedEntry] = useState<CacheEntry | undefined>(() => uploadedPreviewCache.get(cacheKey));
  const [previewSrc, setPreviewSrc] = useState<string>(() => cachedEntry ? cachedEntry.previewUrl : '');
  const [loading, setLoading] = useState<boolean>(!cachedEntry);
  const [imageLoaded, setImageLoaded] = useState<boolean>(Boolean(cachedEntry));
  const isMountedRef = useRef(true);

  // Eagerly process and pre-decode preview images in advance
  useEffect(() => {
    isMountedRef.current = true;
    const key = `${src}_w${maxPreviewWidth}_h${maxPreviewHeight}`;
    const cached = uploadedPreviewCache.get(key);

    if (cached) {
      setCachedEntry(cached);
      setPreviewSrc(cached.previewUrl);
      setLoading(false);
      setImageLoaded(true);
      return;
    }

    setLoading(true);
    processUploadedImagePreview(src, maxPreviewWidth, maxPreviewHeight).then((entry) => {
      attachmentDimensionsCache.set(src, { width: entry.width, height: entry.height });
      if (isMountedRef.current) {
        setCachedEntry(entry);
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
  }, [src, maxPreviewWidth, maxPreviewHeight]);

  const cachedDim = attachmentDimensionsCache.get(src);
  const effectiveW = width || cachedDim?.width;
  const effectiveH = height || cachedDim?.height;

  const initialAspect = (effectiveW && effectiveH && effectiveH > 0)
    ? `${effectiveW} / ${effectiveH}`
    : (aspectRatio || (style?.aspectRatio as string) || '16 / 9');

  const computedAspectRatio = (cachedEntry?.width && cachedEntry?.height)
    ? `${cachedEntry.width} / ${cachedEntry.height}`
    : initialAspect;

  const isCover = className.includes('object-cover');

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${
        imageLoaded ? 'bg-transparent' : 'bg-slate-900/60'
      } rounded-2xl shrink-0 ${isCover ? 'w-full h-full' : 'w-fit max-w-full'}`}
      style={{
        width: isCover ? '100%' : 'fit-content',
        maxWidth: isCover ? undefined : '100%',
        maxHeight: isCover ? undefined : '320px',
        aspectRatio: isCover ? undefined : computedAspectRatio,
        ...style,
      }}
    >
      {(!imageLoaded || loading) && (
        <div className="absolute inset-0 bg-slate-900 flex items-center justify-center pointer-events-none z-0">
          <div className="w-5 h-5 border-2 border-slate-600 border-t-accent rounded-full animate-spin" />
        </div>
      )}

      <img
        ref={imgRef}
        src={previewSrc || src}
        alt={alt}
        loading="eager"
        decoding="async"
        className={`${className} relative z-10 w-full h-full object-cover block transition-opacity duration-150 ease-out ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        style={style}
        onClick={onClick}
        onLoad={(e) => {
          setImageLoaded(true);
          setLoading(false);
          onLoad?.(e);
        }}
        onError={(e) => {
          setImageLoaded(true);
          setLoading(false);
          onError?.(e);
        }}
        referrerPolicy="no-referrer"
        {...rest}
      />
    </div>
  );
}

interface GifCanvasPreviewProps {
  src: string;
  maxW: number;
  maxH: number;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  onLoad?: (e?: any) => void;
  onError?: (e?: any) => void;
  [key: string]: any;
}

const GifCanvasPreview = React.memo(({
  src,
  maxW,
  maxH,
  alt = 'GIF Attachment',
  className = '',
  style,
  onClick,
  onLoad,
  onError,
  ...rest
}: GifCanvasPreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [useFallbackImg, setUseFallbackImg] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [gifMode, setGifMode] = useState<'always' | 'hover' | 'never'>(() => {
    try {
      const s = loadUserSettings();
      return s?.appearance?.gifPlayback || 'always';
    } catch {
      return 'always';
    }
  });

  const isVisibleRef = useRef(true);
  const isHoveredRef = useRef(false);
  isHoveredRef.current = isHovered;
  const gifModeRef = useRef(gifMode);
  gifModeRef.current = gifMode;

  useEffect(() => {
    const handleSettings = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail || loadUserSettings();
        const val = detail?.gifPlayback || detail?.appearance?.gifPlayback;
        if (val) {
          setGifMode(val);
        }
      } catch {}
    };

    window.addEventListener('user-settings-changed', handleSettings);
    window.addEventListener('gif-playback-setting-changed', handleSettings);
    window.addEventListener('storage', handleSettings);
    return () => {
      window.removeEventListener('user-settings-changed', handleSettings);
      window.removeEventListener('gif-playback-setting-changed', handleSettings);
      window.removeEventListener('storage', handleSettings);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let decoder: any = null;
    let timerId: any = null;

    async function initGifDecoder() {
      if (typeof ImageDecoder === 'undefined') {
        if (active) setUseFallbackImg(true);
        return;
      }

      try {
        const response = await fetch(src, { referrerPolicy: 'no-referrer', credentials: 'omit' });
        if (!response.ok || !active) {
          if (active) setUseFallbackImg(true);
          return;
        }

        const blob = await response.blob();
        if (!active) return;

        decoder = new (window as any).ImageDecoder({ data: blob.stream(), type: 'image/gif' });
        await decoder.tracks.ready;
        if (!active) {
          decoder.close?.();
          return;
        }

        const track = decoder.tracks.selectedTrack;
        let origW = track?.displayWidth || track?.codedWidth || (track as any)?.width || 0;
        let origH = track?.displayHeight || track?.codedHeight || (track as any)?.height || 0;

        let firstFrameResult: any = null;
        if (!origW || !origH) {
          try {
            firstFrameResult = await decoder.decode({ frameIndex: 0 });
            if (firstFrameResult?.image) {
              origW = firstFrameResult.image.displayWidth || firstFrameResult.image.codedWidth || 0;
              origH = firstFrameResult.image.displayHeight || firstFrameResult.image.codedHeight || 0;
            }
          } catch (e) {
            // Ignore decode error for frame 0
          }
        }

        if (!origW || !origH) {
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.referrerPolicy = 'no-referrer';
            img.onload = () => {
              origW = img.naturalWidth || 640;
              origH = img.naturalHeight || 640;
              resolve();
            };
            img.onerror = () => {
              origW = 640;
              origH = 640;
              resolve();
            };
            img.src = src;
          });
        }

        const frameCount = track?.frameCount || 1;

        // Scale proportionally preserving original aspect ratio (max edge ~640px, no upscaling)
        const scale = Math.min(1, maxW / origW, maxH / origH);
        const targetW = Math.max(1, Math.round(origW * scale));
        const targetH = Math.max(1, Math.round(origH * scale));

        if (active) {
          setDimensions({ width: targetW, height: targetH });
          onLoad?.();
        }

        // If single frame, fallback to static img tag
        if (frameCount <= 1) {
          if (active) setUseFallbackImg(true);
          firstFrameResult?.image?.close?.();
          decoder.close?.();
          return;
        }

        let currentFrameIndex = 0;

        const renderFrame = async () => {
          if (!active) return;

          const currentMode = gifModeRef.current;
          const isHov = isHoveredRef.current;
          const shouldAnimateLoop = currentMode === 'always' || (currentMode === 'hover' && isHov);

          if (!canvasRef.current || !isVisibleRef.current) {
            if (active) {
              timerId = setTimeout(renderFrame, 250);
            }
            return;
          }

          if (!shouldAnimateLoop && currentFrameIndex !== 0) {
            currentFrameIndex = 0;
          }

          try {
            let frameResult = firstFrameResult;
            if (frameResult) {
              firstFrameResult = null;
            } else {
              frameResult = await decoder.decode({ frameIndex: currentFrameIndex });
            }

            if (!active || !canvasRef.current) {
              frameResult?.image?.close?.();
              return;
            }

            const canvas = canvasRef.current;
            if (canvas.width !== targetW || canvas.height !== targetH) {
              canvas.width = targetW;
              canvas.height = targetH;
            }

            const ctx = canvas.getContext('2d');
            if (ctx && frameResult?.image) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'medium';
              ctx.clearRect(0, 0, targetW, targetH);
              ctx.drawImage(frameResult.image, 0, 0, targetW, targetH);
            }

            const durationUs = frameResult?.image?.duration || 100000;
            const delayMs = Math.max(20, Math.round(durationUs / 1000));
            frameResult?.image?.close?.();

            if (shouldAnimateLoop) {
              currentFrameIndex = (currentFrameIndex + 1) % frameCount;
              if (active) {
                timerId = setTimeout(renderFrame, delayMs);
              }
            } else {
              if (active) {
                timerId = setTimeout(renderFrame, 200);
              }
            }
          } catch (e) {
            if (active) {
              setUseFallbackImg(true);
            }
          }
        };

        renderFrame();
      } catch (err) {
        if (active) {
          setUseFallbackImg(true);
        }
      }
    }

    initGifDecoder();

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
      if (decoder) {
        try { decoder.close?.(); } catch {}
      }
    };
  }, [src, maxW, maxH]);

  // IntersectionObserver to pause off-screen GIF animation loops
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isVisibleRef.current = entry ? entry.isIntersecting : true;
      },
      { threshold: 0.01 }
    );

    observer.observe(canvas);
    return () => {
      observer.disconnect();
    };
  }, [dimensions, useFallbackImg]);

  if (useFallbackImg) {
    const targetW = dimensions?.width;
    const targetH = dimensions?.height;
    const isCover = className.includes('object-cover');

    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={{
          ...style,
          ...(isCover
            ? {}
            : {
                maxWidth: targetW ? `${targetW}px` : `${maxW}px`,
                maxHeight: targetH ? `${targetH}px` : `${maxH}px`,
                width: '100%',
                height: 'auto',
                aspectRatio: dimensions ? `${dimensions.width} / ${dimensions.height}` : undefined,
                objectFit: 'contain',
              }),
        }}
        onClick={onClick as any}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight && !dimensions) {
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const scale = Math.min(1, maxW / w, maxH / h);
            setDimensions({
              width: Math.max(1, Math.round(w * scale)),
              height: Math.max(1, Math.round(h * scale)),
            });
          }
          onLoad?.(e);
        }}
        onError={onError}
        referrerPolicy="no-referrer"
        {...rest}
      />
    );
  }

  const isCover = className.includes('object-cover');

  return (
    <canvas
      ref={canvasRef}
      className={`${className} cursor-pointer hover:opacity-95 transition-opacity block`}
      style={{
        ...style,
        ...(isCover
          ? {}
          : {
              maxWidth: dimensions ? `${dimensions.width}px` : `${maxW}px`,
              maxHeight: dimensions ? `${dimensions.height}px` : `${maxH}px`,
              width: '100%',
              height: 'auto',
              aspectRatio: dimensions ? `${dimensions.width} / ${dimensions.height}` : undefined,
              objectFit: 'contain',
            }),
      }}
      onClick={onClick as any}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...rest}
    />
  );
});

export const UploadedImagePreview = React.memo(UploadedImagePreviewComponent);
export default UploadedImagePreview;
