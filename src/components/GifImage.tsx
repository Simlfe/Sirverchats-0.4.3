import React, { useState, useEffect, useRef } from 'react';
import { loadUserSettings } from '../lib/userSettings';
import { getEffectiveGifPlaybackMode, isGifUrl, getGifFirstFrame, GifPlaybackMode } from '../lib/gifFrameHelper';

export type { GifPlaybackMode };
export { getEffectiveGifPlaybackMode, isGifUrl };

export interface GifImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt?: string;
  className?: string;
  mode?: GifPlaybackMode;
  fallbackSrc?: string;
}

export const GifImage: React.FC<GifImageProps> = ({
  src,
  alt = '',
  className = '',
  mode,
  fallbackSrc,
  onMouseEnter,
  onMouseLeave,
  style,
  ...rest
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [frozenDataUrl, setFrozenDataUrl] = useState<string | null>(null);
  const [globalMode, setGlobalMode] = useState<GifPlaybackMode>(() => getEffectiveGifPlaybackMode(mode));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasDrawn, setCanvasDrawn] = useState(false);

  useEffect(() => {
    const updateMode = (detail?: any) => {
      if (mode) {
        setGlobalMode(mode);
        return;
      }
      try {
        const val = detail?.gifPlayback || detail?.appearance?.gifPlayback || loadUserSettings()?.appearance?.gifPlayback;
        if (val) {
          setGlobalMode(val);
        }
      } catch (e) {}
    };

    updateMode();

    const handleSettingsEvent = (e: Event) => {
      updateMode((e as CustomEvent).detail);
    };

    window.addEventListener('user-settings-changed', handleSettingsEvent);
    window.addEventListener('gif-playback-setting-changed', handleSettingsEvent);
    window.addEventListener('storage', handleSettingsEvent);
    return () => {
      window.removeEventListener('user-settings-changed', handleSettingsEvent);
      window.removeEventListener('gif-playback-setting-changed', handleSettingsEvent);
      window.removeEventListener('storage', handleSettingsEvent);
    };
  }, [mode]);

  const effectiveMode = mode || globalMode;
  const isGif = isGifUrl(src);

  const shouldAnimate = React.useMemo(() => {
    if (!isGif) return true;
    if (effectiveMode === 'never') return false;
    if (effectiveMode === 'hover') return isHovered;
    return true;
  }, [isGif, effectiveMode, isHovered]);

  // Extract first frame of GIF onto canvas / dataUrl if frozen state is needed
  useEffect(() => {
    if (!src || !isGif || effectiveMode === 'always') {
      setFrozenDataUrl(null);
      setCanvasDrawn(false);
      return;
    }

    let isMounted = true;

    // Try fast helper first
    getGifFirstFrame(src).then((dataUrl) => {
      if (isMounted && dataUrl) {
        setFrozenDataUrl(dataUrl);
      }
    });

    // Fallback: draw directly to canvas element for 100% CORS-safe display
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (!isMounted) return;
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        canvas.width = img.naturalWidth || 100;
        canvas.height = img.naturalHeight || 100;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          setCanvasDrawn(true);
        }
      }
    };
    img.src = src;

    return () => {
      isMounted = false;
    };
  }, [src, isGif, effectiveMode]);

  const handleMouseEnter = (e: React.MouseEvent<HTMLImageElement>) => {
    setIsHovered(true);
    if (onMouseEnter) onMouseEnter(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLImageElement>) => {
    setIsHovered(false);
    if (onMouseLeave) onMouseLeave(e);
  };

  if (!src) {
    return <img src={fallbackSrc || ''} alt={alt} className={className} style={style} {...rest} />;
  }

  // If not a GIF, render standard img
  if (!isGif) {
    return <img src={src} alt={alt} className={className} style={style} {...rest} />;
  }

  if (!shouldAnimate) {
    if (frozenDataUrl) {
      return (
        <img
          src={frozenDataUrl}
          alt={alt}
          className={className}
          style={style}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          {...rest}
        />
      );
    }

    return (
      <div
        className={`relative inline-flex items-center justify-center overflow-hidden ${className}`}
        style={style}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <canvas
          ref={canvasRef}
          className={`w-full h-full object-cover ${canvasDrawn ? 'block' : 'hidden'}`}
        />
        {!canvasDrawn && (
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover opacity-60"
            referrerPolicy="no-referrer"
            {...rest}
          />
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      referrerPolicy="no-referrer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...rest}
    />
  );
};

export default GifImage;
