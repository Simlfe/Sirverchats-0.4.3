import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Maximize, Minimize, RotateCw, X, RefreshCw, ScreenShare, Activity } from 'lucide-react';
import FullscreenManager from './FullscreenManager';

export interface VideoPlayerProps {
  stream: MediaStream | null;
  track?: MediaStreamTrack | null;
  participantName?: string;
  participantAvatar?: string;
  isSelf?: boolean;
  isScreenShare?: boolean;
  facingMode?: 'user' | 'environment';
  fit?: 'contain' | 'cover' | 'fill' | 'none';
  rotation?: number;
  isReconnecting?: boolean;
  lang?: 'ar' | 'en';
  className?: string;
  style?: React.CSSProperties;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  onSwitchCamera?: () => void;
  onToggleDiagnostics?: () => void;
  muted?: boolean;
  showInlineControls?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  stream,
  track,
  participantName = '',
  participantAvatar = '',
  isSelf = false,
  isScreenShare = false,
  facingMode = 'user',
  fit: defaultFit = 'contain',
  rotation: initialRotation = 0,
  isReconnecting = false,
  lang = 'ar',
  className = '',
  style = {},
  onDoubleClick,
  onClick,
  onSwitchCamera,
  onToggleDiagnostics,
  muted = false,
  showInlineControls = true,
}) => {
  const isAr = lang === 'ar';
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [hasDecodedFrame, setHasDecodedFrame] = useState<boolean>(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState<boolean>(false);

  // Video Fit & Rotation State
  const [videoFit, setVideoFit] = useState<'contain' | 'cover' | 'fill' | 'none'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('app_video_fit_preference');
      if (saved === 'contain' || saved === 'cover' || saved === 'fill' || saved === 'none') {
        return saved as any;
      }
    }
    return defaultFit;
  });

  const [rotation, setRotation] = useState<number>(initialRotation);
  const [showControls, setShowControls] = useState<boolean>(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync with FullscreenManager
  useEffect(() => {
    const unsub = FullscreenManager.addListener((isFs, element) => {
      const isMyElement = containerRef.current && (element === containerRef.current || containerRef.current.contains(element));
      setIsFullscreen(isMyElement);
      if (!isFs) {
        setIsFallbackFullscreen(false);
      }
    });
    return () => unsub();
  }, []);

  // Controls auto-hide timer when in fullscreen
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (isFullscreen || isFallbackFullscreen)) {
        e.stopPropagation();
        handleExitFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isFallbackFullscreen]);

  const currentTrackIdRef = useRef<string | null>(null);

  // Bind MediaStream or MediaStreamTrack directly to HTMLVideoElement without unmounting/recreating
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    let activeStream: MediaStream | null = stream;

    if (!activeStream && track) {
      activeStream = new MediaStream([track]);
    }

    const videoTrack = track || (activeStream ? activeStream.getVideoTracks()[0] : null);
    const newTrackId = videoTrack ? videoTrack.id : null;

    const handleOrientationOrResize = () => {
      if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        setDimensions({ width: videoEl.videoWidth, height: videoEl.videoHeight });
        if (videoEl.paused) {
          videoEl.play().catch(() => {});
        }
      }
    };

    window.addEventListener('resize', handleOrientationOrResize);
    window.addEventListener('orientationchange', handleOrientationOrResize);
    document.addEventListener('visibilitychange', handleOrientationOrResize);

    let cleanTrackListeners: (() => void) | null = null;

    if (videoTrack) {
      const onUnmute = () => {
        if (videoEl) {
          if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
            setDimensions({ width: videoEl.videoWidth, height: videoEl.videoHeight });
          }
          videoEl.play().catch(() => {});
        }
      };
      videoTrack.addEventListener('unmute', onUnmute);
      cleanTrackListeners = () => {
        videoTrack.removeEventListener('unmute', onUnmute);
      };
    }

    // Compare current MediaStreamTrack ID with new MediaStreamTrack ID.
    if (newTrackId && newTrackId === currentTrackIdRef.current && videoEl.srcObject && hasDecodedFrame) {
      return () => {
        window.removeEventListener('resize', handleOrientationOrResize);
        window.removeEventListener('orientationchange', handleOrientationOrResize);
        document.removeEventListener('visibilitychange', handleOrientationOrResize);
        if (cleanTrackListeners) cleanTrackListeners();
      };
    }

    if (activeStream && videoTrack && activeStream.getVideoTracks().length > 0) {
      console.log('[VIDEO_PLAYER] Binding track to video element:', newTrackId);
      currentTrackIdRef.current = newTrackId;
      videoEl.srcObject = activeStream;

      if ('requestVideoFrameCallback' in videoEl) {
        (videoEl as any).requestVideoFrameCallback(() => {
          if (videoRef.current) {
            setHasDecodedFrame(true);
            setDimensions({ width: videoRef.current.videoWidth, height: videoRef.current.videoHeight });
          }
        });
      }

      videoEl.onresize = () => {
        if (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
          setDimensions({ width: videoRef.current.videoWidth, height: videoRef.current.videoHeight });
        }
      };

      videoEl
        .play()
        .then(() => {
          if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
            setHasDecodedFrame(true);
            setDimensions({ width: videoEl.videoWidth, height: videoEl.videoHeight });
          }
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            console.warn('[VIDEO_PLAYER] video.play() prevented:', err?.message);
          }
        });
    } else if (!videoTrack) {
      if (videoEl.srcObject) {
        videoEl.srcObject = null;
      }
      currentTrackIdRef.current = null;
      setHasDecodedFrame(false);
    }

    return () => {
      window.removeEventListener('resize', handleOrientationOrResize);
      window.removeEventListener('orientationchange', handleOrientationOrResize);
      document.removeEventListener('visibilitychange', handleOrientationOrResize);
      if (cleanTrackListeners) cleanTrackListeners();
    };
  }, [stream, track]);

  const handleLoadedMetadata = () => {
    const videoEl = videoRef.current;
    if (videoEl) {
      setDimensions({ width: videoEl.videoWidth, height: videoEl.videoHeight });
      setHasDecodedFrame(true);
    }
  };

  const handleToggleFullscreen = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    console.log('[VIDEO_PLAYER] Fullscreen button clicked', {
      hasContainer: !!containerRef.current,
      hasVideo: !!videoRef.current,
      currentIsFullscreen: isFullscreen,
      currentIsFallback: isFallbackFullscreen,
    });

    if (!containerRef.current) {
      console.error('[VIDEO_PLAYER] Cannot toggle fullscreen: containerRef is null');
      return;
    }

    if (isFullscreen || isFallbackFullscreen) {
      await handleExitFullscreen();
    } else {
      const success = await FullscreenManager.requestFullscreen(containerRef.current);
      if (!success) {
        console.log('[VIDEO_PLAYER] Native requestFullscreen failed/blocked by iframe. Using fixed fullscreen fallback.');
        setIsFallbackFullscreen(true);
      }
      resetControlsTimer();
    }
  };

  const handleExitFullscreen = async () => {
    console.log('[VIDEO_PLAYER] handleExitFullscreen invoked');
    if (isFullscreen) {
      await FullscreenManager.exitFullscreen();
    }
    setIsFallbackFullscreen(false);
  };

  const handleToggleFit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVideoFit((prev) => {
      let next: 'contain' | 'cover' | 'fill' | 'none' = 'contain';
      if (prev === 'contain') next = 'cover';
      else if (prev === 'cover') next = 'fill';
      else if (prev === 'fill') next = 'none';
      else next = 'contain';

      if (typeof window !== 'undefined') {
        localStorage.setItem('app_video_fit_preference', next);
      }
      return next;
    });
    resetControlsTimer();
  };

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation((prev) => (prev + 90) % 360);
    resetControlsTimer();
  };

  const activeFs = isFullscreen || isFallbackFullscreen;

  // Mirroring logic:
  // - Local camera preview: mirror ONLY if facingMode === 'user' (front camera)
  // - Local screen share: NEVER mirror
  // - Remote users: NEVER mirror
  const shouldMirror = isSelf && !isScreenShare && facingMode === 'user';

  const getTransform = () => {
    const transforms: string[] = [];
    if (rotation) {
      transforms.push(`rotate(${rotation}deg)`);
    }
    if (shouldMirror) {
      transforms.push('scaleX(-1)');
    }
    return transforms.join(' ');
  };

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        if (activeFs) resetControlsTimer();
        if (onClick) onClick(e);
      }}
      onMouseMove={() => {
        if (activeFs) resetControlsTimer();
      }}
      onTouchStart={() => {
        if (activeFs) resetControlsTimer();
      }}
      onDoubleClick={(e) => {
        handleToggleFullscreen(e);
        if (onDoubleClick) onDoubleClick(e);
      }}
      className={`relative w-full h-full min-w-0 min-h-0 flex items-center justify-center overflow-hidden bg-black select-none ${
        isFallbackFullscreen
          ? 'fixed inset-0 z-[99999] w-screen h-screen bg-black'
          : className
      }`}
      style={{
        aspectRatio: !activeFs && dimensions.width && dimensions.height ? `${dimensions.width}/${dimensions.height}` : undefined,
        ...style,
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf || muted}
        disableRemotePlayback={true}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={() => setHasDecodedFrame(true)}
        className="w-full h-full block border-none outline-none"
        style={{
          objectFit: activeFs ? videoFit : (isScreenShare ? 'contain' : defaultFit),
          width: '100%',
          height: '100%',
          minWidth: '100%',
          minHeight: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          transform: getTransform() || undefined,
          opacity: isReconnecting ? 0.85 : 1,
          transition: 'opacity 200ms ease-in-out',
        }}
      />

      {/* Transient Reconnecting Overlay - Keeps video element alive and freezes last frame */}
      {isReconnecting && (
        <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-20 pointer-events-none">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/80 text-amber-400 text-xs font-semibold border border-amber-500/40 shadow-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
            <span>{isAr ? 'جاري إعادة الاتصال بالبث...' : 'Reconnecting stream...'}</span>
          </div>
        </div>
      )}

      {/* Floating Controls in Fullscreen Mode */}
      {activeFs && (
        <div
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            padding: '16px 20px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'opacity 300ms ease-in-out, transform 300ms ease-in-out',
            opacity: showControls ? 1 : 0,
            pointerEvents: showControls ? 'auto' : 'none',
            transform: showControls ? 'translateY(0)' : 'translateY(-10px)',
            zIndex: 30,
          }}
        >
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
            {participantAvatar && (
              <img src={participantAvatar} alt={participantName} className="w-8 h-8 rounded-full object-cover border border-white/20" />
            )}
            <div className="flex flex-col">
              <span className="text-white font-bold text-sm flex items-center gap-2">
                {participantName}
                {isScreenShare && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono">
                    {isAr ? 'مشاركة شاشة' : 'Screen Share'}
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
            <button
              type="button"
              onClick={handleToggleFit}
              onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
              className="px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white transition-all cursor-pointer border border-white/20 flex items-center gap-1.5 text-xs font-semibold"
              title={videoFit}
            >
              <ScreenShare className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {videoFit === 'contain'
                  ? isAr ? 'احتواء' : 'Fit'
                  : videoFit === 'cover'
                  ? isAr ? 'تغطية' : 'Cover'
                  : videoFit === 'fill'
                  ? isAr ? 'توسع' : 'Stretch'
                  : isAr ? '1:1 دقة أصلية' : '1:1 Original'}
              </span>
            </button>

            {isSelf && !isScreenShare && onSwitchCamera && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSwitchCamera(); resetControlsTimer(); }}
                onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white transition-all cursor-pointer border border-white/20"
                title={isAr ? 'تبديل الكاميرا' : 'Switch Camera'}
              >
                <RefreshCw className="w-4 h-4 text-sky-400" />
              </button>
            )}

            <button
              type="button"
              onClick={handleRotate}
              onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white transition-all cursor-pointer border border-white/20"
              title={isAr ? 'تدوير الفيديو' : 'Rotate Video'}
            >
              <RotateCw className="w-4 h-4 text-amber-400" />
            </button>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
              className="p-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white border border-red-500/50 transition-all cursor-pointer ml-1"
              title={isAr ? 'إغلاق (Esc)' : 'Close (Esc)'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Inline Controls overlay for preview mode */}
      {!activeFs && showInlineControls && (
        <div
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
          className="absolute top-2 right-2 flex items-center gap-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {onToggleDiagnostics && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleDiagnostics(); }}
              onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
              className="p-1.5 rounded-lg bg-black/80 hover:bg-black/95 text-white transition-all border border-white/20 cursor-pointer shadow-lg"
              title={isAr ? 'عرض تشخيص البث' : 'Toggle Diagnostics'}
            >
              <Activity className="w-4 h-4 text-emerald-400" />
            </button>
          )}

          {isSelf && !isScreenShare && onSwitchCamera && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSwitchCamera(); }}
              onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
              className="p-1.5 rounded-lg bg-black/80 hover:bg-black/95 text-white transition-all border border-white/20 cursor-pointer shadow-lg"
              title={isAr ? 'تبديل الكاميرا' : 'Switch Camera'}
            >
              <RefreshCw className="w-4 h-4 text-sky-400" />
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleFullscreen}
            onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
            className="p-1.5 rounded-lg bg-black/80 hover:bg-black/95 text-white transition-all border border-white/20 cursor-pointer shadow-lg"
            title={isAr ? 'ملء الشاشة' : 'Fullscreen'}
          >
            <Maximize className="w-4 h-4 text-purple-300" />
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
