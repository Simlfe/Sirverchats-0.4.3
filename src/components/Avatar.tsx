import React, { useState, useRef, useEffect } from 'react';
import { loadUserSettings } from '../lib/userSettings';
import { getProfileFrame } from '../lib/profileFrames';

interface AvatarProps {
  src?: string;
  username: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animateOverride?: boolean; // If true (like in profile card), always animate
  frameId?: string;
}

function Avatar({ src, username, size = 'md', className = '', animateOverride = false, frameId }: AvatarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isIntersecting, setIsIntersecting] = useState(true);
  const [isGif, setIsGif] = useState(false);
  const [canvasLoaded, setCanvasLoaded] = useState(false);
  const [gifMode, setGifMode] = useState<'always' | 'hover' | 'never'>('always');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeFrame = frameId && frameId !== 'none' ? getProfileFrame(frameId) : null;

  useEffect(() => {
    const updateGifMode = (detail?: any) => {
      try {
        const val = detail?.gifPlayback || detail?.appearance?.gifPlayback || loadUserSettings()?.appearance?.gifPlayback;
        if (val) {
          setGifMode(val);
        }
      } catch (e) {}
    };

    updateGifMode();

    const handleSettingsEvent = (e: Event) => {
      updateGifMode((e as CustomEvent).detail);
    };

    window.addEventListener('user-settings-changed', handleSettingsEvent);
    window.addEventListener('gif-playback-setting-changed', handleSettingsEvent);
    window.addEventListener('storage', handleSettingsEvent);
    return () => {
      window.removeEventListener('user-settings-changed', handleSettingsEvent);
      window.removeEventListener('gif-playback-setting-changed', handleSettingsEvent);
      window.removeEventListener('storage', handleSettingsEvent);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (src) {
      const lower = src.toLowerCase();
      const hasGif = lower.includes('.gif') || lower.endsWith('.gif');
      setIsGif(hasGif);
      setCanvasLoaded(false);
    } else {
      setIsGif(false);
      setCanvasLoaded(false);
    }
  }, [src]);

  // Try drawing the first frame of the GIF onto a canvas
  useEffect(() => {
    if (isGif && src) {
      let isMounted = true;
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        if (!isMounted) return;
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.width = img.naturalWidth || img.width || 128;
          canvas.height = img.naturalHeight || img.height || 128;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            setCanvasLoaded(true);
          }
        }
      };
      img.onerror = () => {
        if (isMounted) setCanvasLoaded(false);
      };
      img.src = src;

      return () => {
        isMounted = false;
      };
    }
  }, [isGif, src]);

  const sizeClasses = {
    xs: 'w-6 h-6 rounded-lg text-[10px]',
    sm: 'w-8 h-8 rounded-xl text-xs',
    md: 'w-10 h-10 rounded-xl text-sm',
    lg: 'w-12 h-12 rounded-2xl text-base',
    xl: 'w-24 h-24 rounded-2xl text-2xl',
  }[size] || 'w-10 h-10 rounded-xl text-sm';

  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [src]);

  const initials = username ? (username.substring(0, 2).toUpperCase()) : 'U';

  const shouldAnimate = React.useMemo(() => {
    if (animateOverride) return true;
    if (gifMode === 'never') return false;
    if (gifMode === 'hover') return isHovered;
    return true; // 'always'
  }, [animateOverride, gifMode, isHovered]);

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative flex items-center justify-center shrink-0 overflow-hidden select-none bg-slate-800 border shadow-md transition-all ${
        activeFrame
          ? `ring-2 ring-offset-1 ring-offset-black/40 ${activeFrame.animationClass || ''}`
          : 'border-slate-700/30'
      } ${sizeClasses} ${className}`}
      style={
        activeFrame
          ? {
              backgroundImage: activeFrame.borderGradient,
              boxShadow: activeFrame.glowEffect,
              padding: '2px',
            }
          : undefined
      }
    >
      <div className="w-full h-full rounded-[inherit] overflow-hidden flex items-center justify-center bg-slate-900">
        {src && !imageError ? (
          <>
            {isGif && !shouldAnimate && canvasLoaded ? (
              <canvas
                ref={canvasRef}
                className="w-full h-full object-cover block"
              />
            ) : (
              <img
                src={src}
                alt={username}
                onError={() => setImageError(true)}
                className="w-full h-full object-cover block"
                referrerPolicy="no-referrer"
              />
            )}
          </>
        ) : (
          <span className="font-mono font-bold text-slate-400">
            {initials}
          </span>
        )}
      </div>

      {activeFrame?.badgeIcon && (size === 'lg' || size === 'xl') && (
        <span className="absolute -top-1 -right-1 text-xs select-none pointer-events-none drop-shadow-md">
          {activeFrame.badgeIcon}
        </span>
      )}
    </div>
  );
}

export default React.memo(Avatar);
