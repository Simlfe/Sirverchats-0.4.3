import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { loadUserSettings } from '../lib/userSettings';
import { isGifUrl, getGifFirstFrame } from '../lib/gifFrameHelper';

export interface SmartGifImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  fallbackSrc?: string;
  isListOpen?: boolean;
  isSelected?: boolean;
  mode?: 'always' | 'hover' | 'never';
}

// Module-level shared singleton for GIF playback setting
let cachedGifPlayback: 'always' | 'hover' | 'never' = 'always';
let initializedSettings = false;
const settingSubscribers = new Set<() => void>();

function initGifSettingsListener() {
  if (initializedSettings || typeof window === 'undefined') return;
  initializedSettings = true;
  try {
    const val = loadUserSettings()?.appearance?.gifPlayback;
    if (val) cachedGifPlayback = val;
  } catch (e) {}

  const handleUpdate = (e?: Event) => {
    try {
      const detail = (e as CustomEvent)?.detail;
      const val = detail?.gifPlayback || detail?.appearance?.gifPlayback || loadUserSettings()?.appearance?.gifPlayback;
      if (val && val !== cachedGifPlayback) {
        cachedGifPlayback = val;
        settingSubscribers.forEach((cb) => cb());
      }
    } catch (err) {}
  };

  window.addEventListener('user-settings-changed', handleUpdate);
  window.addEventListener('gif-playback-setting-changed', handleUpdate);
  window.addEventListener('storage', handleUpdate);
}

function subscribeGifPlayback(callback: () => void) {
  initGifSettingsListener();
  settingSubscribers.add(callback);
  return () => {
    settingSubscribers.delete(callback);
  };
}

function getGifPlaybackSnapshot() {
  initGifSettingsListener();
  return cachedGifPlayback;
}

// Shared IntersectionObserver pool for animated GIFs
let sharedObserver: IntersectionObserver | null = null;
const observerCallbacks = new Map<Element, (isIntersecting: boolean) => void>();

function getSharedObserver() {
  if (typeof window === 'undefined') return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const cb = observerCallbacks.get(entry.target);
          if (cb) cb(entry.isIntersecting);
        });
      },
      { rootMargin: '800px 0px 800px 0px', threshold: 0.01 }
    );
  }
  return sharedObserver;
}

function observeGifElement(el: Element, cb: (isIntersecting: boolean) => void) {
  const obs = getSharedObserver();
  if (!obs) return () => {};
  observerCallbacks.set(el, cb);
  obs.observe(el);
  return () => {
    observerCallbacks.delete(el);
    obs.unobserve(el);
  };
}

/**
 * Dedicated controller for animated GIF playback, static frame extraction, and hover state.
 */
const GifFrameController: React.FC<SmartGifImageProps> = ({
  src,
  fallbackSrc,
  isListOpen,
  isSelected,
  mode,
  className = '',
  alt = '',
  style,
  onLoad,
  onError,
  onMouseEnter,
  onMouseLeave,
  ...rest
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [isIntersecting, setIsIntersecting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [frameCaptured, setFrameCaptured] = useState(false);
  const [frozenDataUrl, setFrozenDataUrl] = useState<string | null>(null);

  const globalSetting = useSyncExternalStore(subscribeGifPlayback, getGifPlaybackSnapshot, () => 'always');
  const activeMode = mode || globalSetting;

  useEffect(() => {
    if (!containerRef.current) return;
    return observeGifElement(containerRef.current, (intersecting) => {
      setIsIntersecting(intersecting);
    });
  }, []);

  const listCondition = isListOpen !== undefined ? isListOpen || isSelected === true : true;
  const modeCondition = activeMode === 'never' ? false : activeMode === 'hover' ? isHovered : true;
  const shouldPlay = isIntersecting && listCondition && modeCondition;

  useEffect(() => {
    if (!src) return;
    let isMounted = true;
    getGifFirstFrame(src).then((url) => {
      if (isMounted && url) {
        setFrozenDataUrl(url);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [src]);

  const handleMouseEnter = (e: React.MouseEvent<HTMLImageElement>) => {
    setIsHovered(true);
    if (onMouseEnter) onMouseEnter(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLImageElement>) => {
    setIsHovered(false);
    if (onMouseLeave) onMouseLeave(e);
  };

  const captureFrame = () => {
    if (!imgRef.current || !canvasRef.current) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        try {
          ctx.drawImage(img, 0, 0);
          setFrameCaptured(true);
        } catch (e) {}
      }
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    captureFrame();
    if (onLoad) onLoad(e);
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative inline-flex items-center justify-center overflow-hidden shrink-0 ${className}`}
      style={style}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onLoad={handleImageLoad}
        onError={onError}
        className={`w-full h-full object-cover ${shouldPlay ? 'block' : 'hidden'}`}
        {...rest}
      />

      {!shouldPlay && (
        <canvas
          ref={canvasRef}
          className={`w-full h-full object-cover ${frameCaptured ? 'block' : 'hidden'}`}
        />
      )}

      {!shouldPlay && !frameCaptured && (
        <img
          src={frozenDataUrl || src || fallbackSrc}
          alt={alt}
          onError={onError}
          className="w-full h-full object-cover opacity-90"
          referrerPolicy="no-referrer"
          {...rest}
        />
      )}
    </div>
  );
};

export const SmartGifImage: React.FC<SmartGifImageProps> = ({
  src,
  fallbackSrc,
  className = '',
  alt = '',
  style,
  onLoad,
  onError,
  loading = 'lazy',
  decoding = 'async',
  ...rest
}) => {
  const isGif = Boolean(src && isGifUrl(src));

  // Ultra-fast zero-overhead path for standard static images (99%+ of images)
  if (!isGif || !src) {
    return (
      <img
        src={src || fallbackSrc}
        alt={alt}
        className={className}
        style={style}
        loading={loading}
        decoding={decoding}
        onLoad={onLoad}
        onError={onError}
        referrerPolicy="no-referrer"
        {...rest}
      />
    );
  }

  return (
    <GifFrameController
      src={src}
      fallbackSrc={fallbackSrc}
      className={className}
      alt={alt}
      style={style}
      onLoad={onLoad}
      onError={onError}
      {...rest}
    />
  );
};

export default React.memo(SmartGifImage);
