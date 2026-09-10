import React, { useState, useRef, useEffect, useCallback } from 'react';
import APP_URLS from '../config/urls';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Music,
  SkipForward,
  SkipBack,
  RotateCcw,
  RotateCw,
  X,
  Minimize2,
  Disc,
  ListMusic,
  ExternalLink,
  Maximize,
  Loader2,
  Tv,
  Gauge,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MusicTrack, DownloadedFileRecord } from '../types';
import { toLatinNumerals } from '../lib/utils';
import AttachmentDownloadControl from './AttachmentDownloadControl';
import { extractCoverFromUrl } from '../lib/audioMetadata';
import { openExternalUrl } from '../lib/tauriDesktopService';

interface AudioPlayerProps {
  src: string;
  title: string;
  artist?: string;
  coverUrl?: string;
  senderAvatar?: string;
  lang?: string;
  isLight?: boolean;
  onPlayGlobal?: (track: MusicTrack) => void;
  attachmentId?: string;
  filename?: string;
  mimeType?: string;
  downloadedFiles?: DownloadedFileRecord[] | string;
}

// Helper to render disc preview using album artwork or sender avatar with vinyl spin effect
export const renderDiscPreview = (
  coverUrl?: string,
  senderAvatar?: string,
  isPlaying?: boolean,
  sizeClass: string = "w-8 h-8 sm:w-9 sm:h-9"
) => {
  const imageSrc = coverUrl || senderAvatar;
  if (imageSrc) {
    return (
      <div
        className={`relative ${sizeClass} rounded-full overflow-hidden shrink-0 shadow-md border border-white/20 flex items-center justify-center bg-[var(--theme-bg-secondary)]`}
        style={isPlaying ? { animation: 'spin 6s linear infinite' } : undefined}
      >
        <img src={imageSrc} alt="Disc Cover" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      </div>
    );
  }
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center shrink-0 shadow-md ${
        isPlaying ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)]' : 'bg-accent/20 text-accent'
      }`}
      style={isPlaying ? { animation: 'spin 6s linear infinite' } : undefined}
    >
      <Disc className={`w-4 h-4 ${isPlaying ? 'animate-pulse' : ''}`} />
    </div>
  );
};

// Global player active state window flag helper
declare global {
  interface Window {
    __isGlobalPlayerOpen?: boolean;
    __activeGlobalTrackUrl?: string | null;
  }
}

export function isGlobalMusicPlayerOpen(): boolean {
  return Boolean(window.__isGlobalPlayerOpen);
}

// Custom hook to automatically pause audio/video when element scrolls off screen or tab loses visibility
export function useAutoPauseOnScroll(
  elementRef: React.RefObject<HTMLMediaElement | null>,
  containerRef?: React.RefObject<HTMLElement | null>
) {
  useEffect(() => {
    const mediaEl = elementRef.current;
    if (!mediaEl) return;

    const targetEl = containerRef?.current || mediaEl;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // If global music player is open, DO NOT pause on scroll off screen!
          if (window.__isGlobalPlayerOpen) return;
          if (!entry.isIntersecting && !mediaEl.paused) {
            mediaEl.pause();
          }
        });
      },
      { threshold: 0.15 }
    );

    observer.observe(targetEl);

    const handleVisibilityChange = () => {
      // If global music player is open, DO NOT pause on tab blur
      if (window.__isGlobalPlayerOpen) return;
      if (document.hidden && !mediaEl.paused) {
        mediaEl.pause();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Only pause on cleanup if global music player is closed
      if (mediaEl && !mediaEl.paused && !window.__isGlobalPlayerOpen) {
        mediaEl.pause();
      }
    };
  }, [elementRef, containerRef]);
}

export interface PersistentMediaState {
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
}

export const mediaStateStore = new Map<string, PersistentMediaState>();

export function getMediaState(src: string): PersistentMediaState | undefined {
  return mediaStateStore.get(src);
}

export function saveMediaState(src: string, state: Partial<PersistentMediaState>) {
  const existing = mediaStateStore.get(src) || {
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    playbackRate: 1
  };
  mediaStateStore.set(src, { ...existing, ...state });
}

// Smart Video Player component with progressive stream buffering, visual buffer ranges, and smooth back-and-forth scrubbing
export const SmartVideoPlayer: React.FC<{
  src: string;
  title?: string;
  poster?: string;
  className?: string;
  lang?: 'en' | 'ar';
  isLight?: boolean;
  autoPlay?: boolean;
  onPlayGlobal?: (track: MusicTrack) => void;
  onClose?: () => void;
}> = ({ src, title, poster, className, lang = 'en', isLight = false, autoPlay = false, onPlayGlobal, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubTrackRef = useRef<HTMLDivElement>(null);

  const [hasActivated, setHasActivated] = useState<boolean>(Boolean(autoPlay));
  const [inViewport, setInViewport] = useState<boolean>(false);
  const [videoReady, setVideoReady] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [bufferedRanges, setBufferedRanges] = useState<Array<{ start: number; end: number }>>([]);
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem('app_player_volume');
    return saved !== null ? parseFloat(saved) : 1;
  });
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<{ dir: 'forward' | 'backward'; key: number } | null>(null);

  useAutoPauseOnScroll(videoRef, containerRef);

  // Lazy initialize when nearing viewport to avoid unnecessary memory overhead
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px 0px 600px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [src]);

  // Read progressive buffered ranges from the video element
  const updateBufferedRanges = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration || !v.buffered || v.buffered.length === 0) return;
    const dur = v.duration;
    const ranges: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < v.buffered.length; i++) {
      try {
        const start = (v.buffered.start(i) / dur) * 100;
        const end = (v.buffered.end(i) / dur) * 100;
        ranges.push({ start: Math.max(0, start), end: Math.min(100, end) });
      } catch {}
    }
    setBufferedRanges(ranges);
  }, []);

  // Controls hide/show timer
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setShowSpeedMenu(false);
      }, 2500);
    }
  }, [isPlaying]);

  // Video event listeners & state synchronization
  useEffect(() => {
    if (!inViewport) return;
    const video = videoRef.current;
    if (!video) return;

    const applySavedState = () => {
      const saved = mediaStateStore.get(src);
      if (saved) {
        if (saved.currentTime > 0 && video.readyState >= 1) {
          try {
            video.currentTime = saved.currentTime;
          } catch (e) {}
        }
        video.volume = saved.volume !== undefined ? saved.volume : volume;
        video.muted = !!saved.isMuted;
        if (saved.playbackRate) {
          video.playbackRate = saved.playbackRate;
          setPlaybackRate(saved.playbackRate);
        }
        setIsMuted(!!saved.isMuted);
      }
    };

    const handleLoadedMetadata = () => {
      setVideoReady(true);
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
      }
      applySavedState();
      updateBufferedRanges();
    };

    const handleCanPlay = () => {
      setVideoReady(true);
      setIsBuffering(false);
      updateBufferedRanges();
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      notifyAudioPlay(src);
      resetControlsTimer();
    };

    const handlePause = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setShowControls(true);
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handlePlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime || 0);
      if (video.duration && (!duration || isNaN(duration))) {
        setDuration(video.duration);
      }
      updateBufferedRanges();
      if (video.currentTime > 0) {
        saveMediaState(src, {
          currentTime: video.currentTime,
          duration: video.duration || 0,
          volume: video.volume,
          isMuted: video.muted,
          playbackRate: video.playbackRate,
        });
      }
    };

    const handleProgress = () => {
      updateBufferedRanges();
    };

    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
      saveMediaState(src, {
        volume: video.volume,
        isMuted: video.muted,
      });
    };

    const handleRateChange = () => {
      setPlaybackRate(video.playbackRate);
      saveMediaState(src, {
        playbackRate: video.playbackRate,
      });
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('ratechange', handleRateChange);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('ratechange', handleRateChange);
      if (video && video.currentTime > 0) {
        saveMediaState(src, { currentTime: video.currentTime });
      }
    };
  }, [src, inViewport, updateBufferedRanges, resetControlsTimer, volume, duration]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === containerRef.current));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Quick Seek ±5 Seconds with visual ripple
  const seekRelative = useCallback((deltaSecs: number) => {
    const v = videoRef.current;
    if (!v) return;
    const dur = v.duration || duration || 0;
    const target = Math.max(0, Math.min(dur, (v.currentTime || 0) + deltaSecs));
    v.currentTime = target;
    setCurrentTime(target);
    setSeekFeedback({
      dir: deltaSecs > 0 ? 'forward' : 'backward',
      key: Date.now(),
    });
    setTimeout(() => setSeekFeedback(null), 600);
    resetControlsTimer();
  }, [duration, resetControlsTimer]);

  // Auto-play when activated by user
  useEffect(() => {
    if (hasActivated && videoRef.current) {
      notifyAudioPlay(src);
      videoRef.current.play().catch(() => {});
    }
  }, [hasActivated, src]);

  // Play / Pause Toggle
  const togglePlay = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!hasActivated) {
      setHasActivated(true);
      setIsBuffering(true);
      notifyAudioPlay(src);
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      notifyAudioPlay(src);
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [src, hasActivated]);

  // Scrubber Seek
  const handleScrub = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const track = scrubTrackRef.current;
    const v = videoRef.current;
    if (!track || !v) return;
    const rect = track.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = clickX / rect.width;
    const dur = v.duration || duration || 0;
    const targetTime = pct * dur;
    v.currentTime = targetTime;
    setCurrentTime(targetTime);
    resetControlsTimer();
  }, [duration, resetControlsTimer]);

  // Hover Scrubber Tooltip
  const handleScrubMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = scrubTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const hoverX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = hoverX / rect.width;
    const dur = duration || (videoRef.current?.duration || 0);
    setHoverTime(pct * dur);
    setHoverPos(hoverX);
  };

  const handleScrubMouseLeave = () => {
    setHoverTime(null);
    setHoverPos(null);
  };

  // Speed Change
  const changeSpeed = (speed: number) => {
    const v = videoRef.current;
    if (v) {
      v.playbackRate = speed;
      setPlaybackRate(speed);
    }
    setShowSpeedMenu(false);
  };

  // Fullscreen Toggle
  const toggleFullscreen = () => {
    const c = containerRef.current;
    if (!c) return;
    if (!document.fullscreenElement) {
      c.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Picture-in-Picture Toggle
  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await v.requestPictureInPicture();
      }
    } catch {}
  };

  // Double Click for Fast Forward / Rewind
  const handleContainerDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const c = containerRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    if (clickX < rect.width / 2) {
      seekRelative(-5);
    } else {
      seekRelative(5);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return toLatinNumerals(`${m}:${s < 10 ? '0' : ''}${s}`);
  };

  const playedPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimer}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={togglePlay}
      onDoubleClick={handleContainerDoubleClick}
      className={`group/smartvid relative overflow-hidden rounded-2xl bg-black border border-[var(--theme-border)] shadow-md select-none flex items-center justify-center cursor-pointer ${
        className || 'max-h-80 w-auto max-w-full'
      }`}
      style={{ touchAction: 'manipulation' }}
    >
      {/* Pre-activation Preview Screen (Never load streamable file until user clicks) */}
      {!hasActivated && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setHasActivated(true);
            setIsBuffering(true);
            notifyAudioPlay(src);
          }}
          className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-3 p-4 cursor-pointer group/vidpreview select-none z-20 overflow-hidden"
        >
          {poster && (
            <img
              src={poster}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover opacity-45 group-hover/vidpreview:scale-105 group-hover/vidpreview:opacity-55 transition-all duration-300 pointer-events-none"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/60 pointer-events-none" />

          {onClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="absolute top-2.5 end-2.5 z-30 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white/70 hover:text-white transition-colors cursor-pointer border-0"
              title={lang === 'ar' ? 'إغلاق' : 'Close'}
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="relative z-10 flex flex-col items-center gap-2.5 text-center max-w-sm px-4">
            <div className="w-14 h-14 rounded-2xl bg-accent text-[var(--theme-accent-contrast,#ffffff)] flex items-center justify-center shadow-2xl group-hover/vidpreview:scale-110 transition-transform duration-200">
              <Play className="w-7 h-7 fill-current translate-x-0.5" />
            </div>
            {title && (
              <span className="text-xs font-bold text-slate-200 line-clamp-1 truncate max-w-full drop-shadow-sm">
                {title}
              </span>
            )}
            <span className="text-[10px] font-mono font-bold text-accent bg-accent/15 px-2.5 py-0.5 rounded-full border border-accent/25">
              {lang === 'ar' ? 'انقر للتشغيل والتخزين المؤقت' : 'Click to Play & Buffer'}
            </span>
          </div>
        </div>
      )}

      {/* Loading Skeleton before ready */}
      {hasActivated && (!inViewport || !videoReady) && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-2 pointer-events-none z-10">
          <div className="w-7 h-7 border-2 border-slate-700 border-t-accent rounded-full animate-spin" />
          <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">
            {lang === 'ar' ? 'جاري التخزين المؤقت وتجهيز الفيديو...' : 'Buffering Video Stream...'}
          </span>
        </div>
      )}

      {/* Primary Video Element */}
      {inViewport && hasActivated && (
        <video
          ref={videoRef}
          src={src}
          playsInline
          disableRemotePlayback={true}
          preload="auto"
          autoPlay={true}
          className="w-full h-full max-h-full object-contain block bg-black"
        />
      )}

      {/* Buffering Center Indicator (appears smoothly when waiting for buffer chunks) */}
      <AnimatePresence>
        {isBuffering && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs z-20 pointer-events-none"
          >
            <div className="px-3.5 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-white flex items-center gap-2 shadow-2xl">
              <Loader2 className="w-4 h-4 text-accent animate-spin" />
              <span className="text-xs font-bold font-mono">
                {lang === 'ar' ? 'جاري التخزين المؤقت...' : 'Buffering...'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seek Jump Feedback Ripple */}
      <AnimatePresence>
        {seekFeedback && (
          <motion.div
            key={seekFeedback.key}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1.1 }}
            exit={{ opacity: 0, scale: 1.3 }}
            transition={{ duration: 0.4 }}
            className={`absolute top-1/2 -translate-y-1/2 z-25 p-3 rounded-full bg-black/75 border border-white/20 text-white flex items-center gap-1 shadow-2xl pointer-events-none ${
              seekFeedback.dir === 'backward' ? 'left-8' : 'right-8'
            }`}
          >
            {seekFeedback.dir === 'backward' ? (
              <>
                <RotateCcw className="w-5 h-5 text-accent" />
                <span className="text-xs font-extrabold font-mono">-5s</span>
              </>
            ) : (
              <>
                <span className="text-xs font-extrabold font-mono">+5s</span>
                <RotateCw className="w-5 h-5 text-accent" />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Big Play Overlay Button when Paused */}
      {!isPlaying && videoReady && !isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 z-15 pointer-events-none">
          <div className="w-14 h-14 rounded-2xl bg-accent text-[var(--theme-accent-contrast,#ffffff)] flex items-center justify-center shadow-2xl group-hover/smartvid:scale-110 transition-transform duration-200">
            <Play className="w-7 h-7 fill-current translate-x-0.5" />
          </div>
        </div>
      )}

      {/* Bottom Floating Streaming Controls Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-x-0 bottom-0 z-30 p-2.5 pt-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-200 flex flex-col gap-1.5 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrubber with Progressive Buffer Visualization Bar */}
        <div
          ref={scrubTrackRef}
          onClick={handleScrub}
          onMouseMove={handleScrubMouseMove}
          onMouseLeave={handleScrubMouseLeave}
          className="relative w-full h-3 flex items-center cursor-pointer group/track"
        >
          {/* Background Rail */}
          <div className="w-full h-1.5 group-hover/track:h-2.5 rounded-full bg-white/20 overflow-hidden relative transition-all">
            {/* Real Buffer Ranges (HTTP 206 progressive chunks) */}
            {bufferedRanges.map((range, idx) => (
              <div
                key={`buf-${idx}`}
                className="absolute top-0 bottom-0 bg-white/40 rounded-full transition-all duration-300"
                style={{
                  left: `${range.start}%`,
                  width: `${Math.max(0, range.end - range.start)}%`,
                }}
                title={lang === 'ar' ? `تم تخزين ${Math.round(range.end)}% مؤقتاً` : `Buffered to ${Math.round(range.end)}%`}
              />
            ))}

            {/* Current Played Progress Bar */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-accent rounded-full shadow-sm transition-all duration-75"
              style={{ width: `${playedPct}%` }}
            />
          </div>

          {/* Scrubber Thumb Knob */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 group-hover/track:w-4 group-hover/track:h-4 rounded-full bg-white shadow-lg border-2 border-accent transition-all pointer-events-none"
            style={{ left: `${playedPct}%` }}
          />

          {/* Hover Time Tooltip */}
          {hoverTime !== null && hoverPos !== null && (
            <div
              className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-md bg-slate-900 border border-white/20 text-white font-mono text-[10px] font-bold shadow-xl pointer-events-none"
              style={{ left: `${hoverPos}px` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        {/* Action Controls Row */}
        <div className="flex items-center justify-between gap-2 text-white">
          {/* Left Actions: Play/Pause, -5s, +5s, Time, Title */}
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Play/Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-all cursor-pointer border-0 shrink-0"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
            </button>

            {/* Quick Seek -5s */}
            <button
              type="button"
              onClick={() => seekRelative(-5)}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-all cursor-pointer border-0 shrink-0 flex items-center gap-0.5"
              title={lang === 'ar' ? 'ترجيع 5 ثواني' : 'Rewind 5s'}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="text-[9px] font-mono font-bold hidden xs:inline">-5s</span>
            </button>

            {/* Quick Seek +5s */}
            <button
              type="button"
              onClick={() => seekRelative(5)}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-all cursor-pointer border-0 shrink-0 flex items-center gap-0.5"
              title={lang === 'ar' ? 'تقديم 5 ثواني' : 'Forward 5s'}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="text-[9px] font-mono font-bold hidden xs:inline">+5s</span>
            </button>

            {/* Time Stamp */}
            <div className="flex items-center text-[11px] font-mono font-semibold text-white/90 shrink-0 ml-1">
              <span>{formatTime(currentTime)}</span>
              <span className="mx-1 opacity-50">/</span>
              <span className="opacity-75">{formatTime(duration)}</span>
            </div>

            {/* Title (if provided) */}
            {title && (
              <span className="text-xs font-medium text-white/80 truncate max-w-[120px] sm:max-w-[200px] hidden md:inline ml-2">
                {title}
              </span>
            )}
          </div>

          {/* Right Actions: Volume, Speed Selector, PiP, Fullscreen */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Volume Control */}
            <div className="flex items-center gap-1 group/vol">
              <button
                type="button"
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  const newMuted = !isMuted;
                  v.muted = newMuted;
                  setIsMuted(newMuted);
                }}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-all cursor-pointer border-0 shrink-0"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-accent" />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  const v = videoRef.current;
                  if (v) {
                    v.volume = val;
                    v.muted = val === 0;
                  }
                  setVolume(val);
                  setIsMuted(val === 0);
                  localStorage.setItem('app_player_volume', val.toString());
                }}
                className="w-12 sm:w-16 h-1 rounded-full appearance-none cursor-pointer accent-[var(--accent-color)] opacity-75 hover:opacity-100 transition-opacity hidden xs:inline-block"
              />
            </div>

            {/* Speed Menu Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="p-1 px-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white text-[10px] font-mono font-bold transition-all cursor-pointer border border-white/10 shrink-0"
                title={lang === 'ar' ? 'سرعة التشغيل' : 'Playback Speed'}
              >
                {playbackRate}x
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 py-1 px-1 rounded-xl bg-slate-900/95 border border-white/20 shadow-2xl flex flex-col gap-0.5 z-40 text-xs font-mono min-w-[70px]">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                    <button
                      key={`spd-${s}`}
                      type="button"
                      onClick={() => changeSpeed(s)}
                      className={`px-2 py-1 rounded-lg text-left hover:bg-accent hover:text-white transition-colors cursor-pointer border-0 ${
                        playbackRate === s ? 'bg-accent/30 text-accent font-bold' : 'text-white/80'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Picture in Picture */}
            {typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && (
              <button
                type="button"
                onClick={togglePiP}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-all cursor-pointer border-0 shrink-0 hidden sm:block"
                title={lang === 'ar' ? 'صورة داخل صورة' : 'Picture in Picture'}
              >
                <Tv className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Fullscreen */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-all cursor-pointer border-0 shrink-0"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>

            {/* Close / Collapse Player */}
            {onClose && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-all cursor-pointer border-0 shrink-0"
                title={lang === 'ar' ? 'إغلاق المشغل' : 'Close Player'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Smart YouTube Player component with thumbnail preview and external player launcher
export const SmartYouTubePlayer: React.FC<{
  url: string;
  ytId: string;
  lang?: string;
  isLight?: boolean;
  onPlayGlobal?: (track: MusicTrack) => void;
}> = React.memo(({ url, ytId, lang = 'en', isLight = false, onPlayGlobal }) => {
  // Use hqdefault.jpg directly: universal default thumbnail guaranteed to exist immediately with zero 404s
  const [thumbSrc, setThumbSrc] = useState(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`);

  useEffect(() => {
    setThumbSrc(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`);
  }, [ytId]);

  const handleImageError = () => {
    setThumbSrc(`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`);
  };

  const handleOpenExternal = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openExternalUrl(url);
  };

  return (
    <div
      onClick={handleOpenExternal}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="w-full max-w-lg md:max-w-xl aspect-video rounded-2xl overflow-hidden border border-[var(--theme-border)] shadow-md mt-1 relative group/yt bg-[var(--theme-bg-card)] cursor-pointer select-none transition-all hover:border-accent/40 hover:shadow-lg"
    >
      <div className="w-full h-full relative flex items-center justify-center overflow-hidden bg-black/90">
        {/* Thumbnail image */}
        <img
          src={thumbSrc}
          alt="YouTube thumbnail"
          onError={handleImageError}
          className="w-full h-full object-cover opacity-90 group-hover/yt:scale-105 group-hover/yt:opacity-100 transition-all duration-300"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />

        {/* Dark Overlay Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/50 group-hover/yt:from-black/75 group-hover/yt:via-black/10 transition-colors pointer-events-none" />

        {/* Top Badges Bar */}
        <div className="absolute top-2.5 inset-x-3 flex items-center justify-between z-10 pointer-events-none">
          {/* YouTube Brand Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/75 text-white border border-white/10 shadow-sm backdrop-blur-xs">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            <span className="text-[11px] font-extrabold tracking-wide text-white">YouTube</span>
          </div>

          {/* External Player Badge on End Side */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/75 text-accent border border-white/10 shadow-sm backdrop-blur-xs text-[10px] font-bold">
            <ExternalLink className="w-3 h-3 text-accent shrink-0" />
            <span>{lang === 'ar' ? 'مشغل خارجي' : 'External Player'}</span>
          </div>
        </div>

        {/* Center Play Button */}
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-2xl group-hover/yt:scale-110 group-hover/yt:bg-red-500 transition-all duration-200">
            <Play className="w-6 h-6 fill-white text-white translate-x-0.5" />
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="absolute bottom-2.5 inset-x-3 flex items-center justify-between text-white/95 text-xs font-semibold select-none z-10 pointer-events-none">
          <div className="flex items-center gap-1.5 min-w-0">
            <ExternalLink className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="font-bold drop-shadow-sm truncate text-[11px] sm:text-xs">
              {lang === 'ar' ? 'انقر للفتح في المشغل الخارجي' : 'Click to open in external player'}
            </span>
          </div>
          <span className="text-[10px] text-white/80 font-mono bg-black/70 px-2 py-0.5 rounded border border-white/10 shrink-0 backdrop-blur-xs">
            youtube.com
          </span>
        </div>
      </div>
    </div>
  );
});

// Global Audio Event helpers to sync playback across chat and main global player
const notifyAudioPlay = (id: string, isGlobal = false) => {
  window.dispatchEvent(new CustomEvent('app-audio-play', { detail: { id, isGlobal } }));
};

const notifyAudioPause = (id: string, isGlobal = false) => {
  window.dispatchEvent(new CustomEvent('app-audio-pause', { detail: { id, isGlobal } }));
};

// Audio Attachment Card inside Chat Messages
export const AudioAttachmentPlayer: React.FC<AudioPlayerProps> = ({
  src,
  title,
  artist,
  coverUrl,
  senderAvatar,
  lang = 'en',
  isLight = false,
  onPlayGlobal,
  attachmentId,
  filename,
  mimeType,
  downloadedFiles
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  useAutoPauseOnScroll(audioRef, cardRef);

  const savedState = mediaStateStore.get(src);
  const [hasActivated, setHasActivated] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedPct, setBufferedPct] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(savedState?.duration || 0);
  const [currentTime, setCurrentTime] = useState(savedState?.currentTime || 0);
  const [isMuted, setIsMuted] = useState(savedState?.isMuted || false);
  const [volume, setVolume] = useState(savedState?.volume !== undefined ? savedState.volume : 1);
  const [extractedCover, setExtractedCover] = useState<string | undefined>(coverUrl);

  useEffect(() => {
    setExtractedCover(coverUrl);
    if (!coverUrl && src) {
      extractCoverFromUrl(src).then((c) => {
        if (c) setExtractedCover(c);
      });
    }
  }, [src, coverUrl]);

  const effectiveCover = coverUrl || extractedCover;

  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail?.id !== src) {
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
      }
    };
    window.addEventListener('app-audio-play', handleOtherPlay);
    return () => window.removeEventListener('app-audio-play', handleOtherPlay);
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (savedState) {
      if (savedState.currentTime > 0) {
        try {
          audio.currentTime = savedState.currentTime;
        } catch (e) {}
      }
      audio.volume = savedState.volume !== undefined ? savedState.volume : 1;
      audio.muted = !!savedState.isMuted;
    }

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      saveMediaState(src, { duration: audio.duration || 0 });
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
      saveMediaState(src, {
        currentTime: audio.currentTime || 0,
        duration: audio.duration || 0,
        volume: audio.volume,
        isMuted: audio.muted
      });
    };

    const onPlay = () => {
      setIsBuffering(false);
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
    };
    const onProgress = () => {
      if (audio.buffered && audio.buffered.length > 0 && audio.duration > 0) {
        try {
          const end = audio.buffered.end(audio.buffered.length - 1);
          setBufferedPct(Math.min(100, (end / audio.duration) * 100));
        } catch {}
      }
    };
    const onCanPlay = () => {
      setIsBuffering(false);
      onProgress();
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('progress', onProgress);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('progress', onProgress);
      audio.removeEventListener('canplay', onCanPlay);
      if (audio && !audio.paused) {
        saveMediaState(src, { currentTime: audio.currentTime });
        audio.pause();
      }
    };
  }, [src]);

  // Auto play when activated by user
  useEffect(() => {
    if (hasActivated && audioRef.current) {
      notifyAudioPlay(src);
      audioRef.current.play().catch(() => {});
    }
  }, [hasActivated, src]);

  const togglePlay = () => {
    if (!hasActivated) {
      setHasActivated(true);
      setIsBuffering(true);
      notifyAudioPlay(src);
      return;
    }
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      notifyAudioPlay(src);
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const newMute = !isMuted;
    audioRef.current.muted = newMute;
    setIsMuted(newMute);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volPct = (isMuted ? 0 : volume) * 100;

  const progressTrackStyle = {
    background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${progressPct}%, rgba(255,255,255,0.22) ${progressPct}%, rgba(255,255,255,0.22) ${Math.max(progressPct, bufferedPct)}%, var(--theme-border) ${Math.max(progressPct, bufferedPct)}%, var(--theme-border) 100%)`
  };

  const volumeTrackStyle = {
    background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${volPct}%, var(--theme-border) ${volPct}%, var(--theme-border) 100%)`
  };

  return (
    <div
      ref={cardRef}
      className={`p-3 sm:p-4 rounded-2xl border min-w-[260px] xs:min-w-[300px] sm:min-w-[360px] w-full max-w-full sm:max-w-lg md:max-w-xl flex flex-col gap-2 shadow-md select-none overflow-hidden ${
        isLight ? 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]' : 'bg-[var(--theme-bg-card)] border-accent/30 text-[var(--theme-text-primary)]'
      }`}
    >
      <audio ref={audioRef} src={hasActivated ? src : undefined} preload={hasActivated ? "auto" : "none"} disableRemotePlayback={true} />

      <div className="flex items-center gap-2.5 min-w-0">
        {/* Disc Preview with Cover Artwork or Sender Avatar */}
        {renderDiscPreview(effectiveCover, senderAvatar, isPlaying, "w-8 h-8 sm:w-9 sm:h-9")}

        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-xs truncate leading-tight">{title}</div>
          <div className="text-[10px] font-semibold truncate mt-0.5 text-accent">
            {artist || (lang === 'ar' ? 'ملف صوتي' : 'Music File')}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <AttachmentDownloadControl
            attachmentId={attachmentId || src}
            filename={filename || title || 'audio.mp3'}
            downloadUrl={src}
            mimeType={mimeType || 'audio/mpeg'}
            downloadedFiles={downloadedFiles}
            lang={(lang as 'en' | 'ar') || 'en'}
            isLight={isLight}
            variant="button"
          />

          {/* Global Player Launcher */}
          {onPlayGlobal && (
            <button
              type="button"
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.pause();
                  setIsPlaying(false);
                }
                onPlayGlobal({ id: src, title, artist, url: src, coverUrl: effectiveCover, senderAvatar });
              }}
              title={lang === 'ar' ? 'فتح في المشغل الرئيسي' : 'Open in Player'}
              className="p-1.5 sm:px-2 sm:py-1 rounded-lg text-[10px] font-bold bg-accent/15 hover:bg-accent/30 text-accent transition-all cursor-pointer border border-accent/20 shrink-0 flex items-center gap-1"
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{lang === 'ar' ? 'فتح بالمشغل' : 'Open in Player'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress & Time */}
      <div className="flex flex-col gap-1" dir="ltr">
        <input
          type="range"
          dir="ltr"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          style={progressTrackStyle}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
        />
        <div className="flex justify-between items-center text-[9px] font-mono opacity-70" dir="ltr">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-between gap-1 sm:gap-2 pt-0.5 w-full flex-nowrap overflow-hidden">
        <button
          type="button"
          onClick={togglePlay}
          className="p-1.5 sm:p-2 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] cursor-pointer transition-all border-0 shadow-md flex items-center justify-center gap-1 px-2.5 sm:px-3.5 font-bold text-xs shrink-0 min-w-[70px]"
        >
          {isBuffering ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span className="truncate">
            {isBuffering
              ? (lang === 'ar' ? 'تخزين...' : 'Buffering...')
              : isPlaying
              ? (lang === 'ar' ? 'إيقاف' : 'Pause')
              : (lang === 'ar' ? 'تشغيل' : 'Play')}
          </span>
        </button>

        {isPlaying && (
          <div className="hidden xs:flex items-center gap-0.5 h-4 px-1 shrink-0">
            <span className="w-0.5 h-3 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-0.5 h-4 bg-accent/80 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-0.5 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            <span className="w-0.5 h-3 bg-accent/80 rounded-full animate-bounce" style={{ animationDelay: '450ms' }} />
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0 min-w-0" dir="ltr">
          <button
            type="button"
            onClick={toggleMute}
            className="p-1 rounded-lg hover:bg-accent/20 text-slate-400 hover:text-white transition-all cursor-pointer border-0 shrink-0"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />}
          </button>
          <input
            type="range"
            dir="ltr"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              const newVol = parseFloat(e.target.value);
              setVolume(newVol);
              if (audioRef.current) {
                audioRef.current.volume = newVol;
                audioRef.current.muted = newVol === 0;
              }
              setIsMuted(newVol === 0);
            }}
            style={volumeTrackStyle}
            className="w-10 xs:w-14 sm:w-16 h-1.5 rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
            title={`${Math.round((isMuted ? 0 : volume) * 100)}%`}
          />
          <span className="text-[9px] sm:text-[10px] font-mono font-extrabold w-6 sm:w-7 text-center shrink-0 select-none text-accent">
            {Math.round((isMuted ? 0 : volume) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};

// Interface for multi-audio playlist attachments
export interface AudioTrackItem {
  id: string;
  src: string;
  title: string;
  artist?: string;
  coverUrl?: string;
  senderAvatar?: string;
  filename?: string;
  mimeType?: string;
  downloadedFiles?: DownloadedFileRecord[] | string;
}

export interface MultiAudioPlayerProps {
  tracks: AudioTrackItem[];
  lang?: string;
  isLight?: boolean;
  onPlayGlobal?: (track: MusicTrack) => void;
}

export const MultiAudioAttachmentPlayer: React.FC<MultiAudioPlayerProps> = ({
  tracks,
  lang = 'en',
  isLight = false,
  onPlayGlobal
}) => {
  if (tracks.length === 0) return null;
  if (tracks.length === 1) {
    const single = tracks[0];
    return (
      <AudioAttachmentPlayer
        src={single.src}
        title={single.title}
        artist={single.artist}
        coverUrl={single.coverUrl}
        senderAvatar={single.senderAvatar}
        lang={lang}
        isLight={isLight}
        onPlayGlobal={onPlayGlobal}
      />
    );
  }

  const cardRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  useAutoPauseOnScroll(audioRef, cardRef);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasActivated, setHasActivated] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedPct, setBufferedPct] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const activeTrack = tracks[currentIndex] || tracks[0];

  const fullPlaylist: MusicTrack[] = tracks.map((t, idx) => ({
    id: t.id || t.src,
    title: t.title,
    artist: t.artist,
    url: t.src,
    coverUrl: t.coverUrl,
    senderAvatar: t.senderAvatar,
    filename: t.filename,
    mimeType: t.mimeType,
    playlistIndex: idx
  }));

  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail?.id !== activeTrack.src) {
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
      }
    };
    window.addEventListener('app-audio-play', handleOtherPlay);
    return () => window.removeEventListener('app-audio-play', handleOtherPlay);
  }, [activeTrack.src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onPlay = () => {
      setIsBuffering(false);
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
    };
    const onProgress = () => {
      if (audio.buffered && audio.buffered.length > 0 && audio.duration > 0) {
        try {
          const end = audio.buffered.end(audio.buffered.length - 1);
          setBufferedPct(Math.min(100, (end / audio.duration) * 100));
        } catch {}
      }
    };
    const onCanPlay = () => {
      setIsBuffering(false);
      onProgress();
    };
    const onEnded = () => {
      if (currentIndex + 1 < tracks.length) {
        const nextIdx = currentIndex + 1;
        setCurrentIndex(nextIdx);
        setTimeout(() => {
          if (audioRef.current) {
            notifyAudioPlay(tracks[nextIdx].src);
            audioRef.current.play().catch(() => {});
            setIsPlaying(true);
            if (window.__isGlobalPlayerOpen && onPlayGlobal) {
              onPlayGlobal({
                id: tracks[nextIdx].src,
                title: tracks[nextIdx].title,
                artist: tracks[nextIdx].artist,
                url: tracks[nextIdx].src,
                coverUrl: tracks[nextIdx].coverUrl,
                senderAvatar: tracks[nextIdx].senderAvatar,
                playlist: fullPlaylist,
                playlistIndex: nextIdx
              });
            }
          }
        }, 150);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('progress', onProgress);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('progress', onProgress);
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, [currentIndex, tracks, onPlayGlobal, fullPlaylist]);

  // Auto-play when activated
  useEffect(() => {
    if (hasActivated && audioRef.current) {
      notifyAudioPlay(activeTrack.src);
      audioRef.current.play().catch(() => {});
    }
  }, [hasActivated, activeTrack.src]);

  const togglePlay = () => {
    if (!hasActivated) {
      setHasActivated(true);
      setIsBuffering(true);
      notifyAudioPlay(activeTrack.src);
      return;
    }
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      notifyAudioPlay(activeTrack.src);
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);

      if (window.__isGlobalPlayerOpen && onPlayGlobal) {
        onPlayGlobal({
          id: activeTrack.src,
          title: activeTrack.title,
          artist: activeTrack.artist,
          url: activeTrack.src,
          coverUrl: activeTrack.coverUrl,
          senderAvatar: activeTrack.senderAvatar,
          playlist: fullPlaylist,
          playlistIndex: currentIndex
        });
      }
    }
  };

  const playTrackIndex = (idx: number) => {
    setHasActivated(true);
    setIsBuffering(true);
    setCurrentIndex(idx);
    const target = tracks[idx];
    setTimeout(() => {
      if (audioRef.current) {
        notifyAudioPlay(target.src);
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
        if (window.__isGlobalPlayerOpen && onPlayGlobal) {
          onPlayGlobal({
            id: target.src,
            title: target.title,
            artist: target.artist,
            url: target.src,
            coverUrl: target.coverUrl,
            senderAvatar: target.senderAvatar,
            playlist: fullPlaylist,
            playlistIndex: idx
          });
        }
      }
    }, 150);
  };

  const handleNext = () => {
    const nextIdx = (currentIndex + 1) % tracks.length;
    playTrackIndex(nextIdx);
  };

  const handlePrev = () => {
    const prevIdx = (currentIndex - 1 + tracks.length) % tracks.length;
    playTrackIndex(prevIdx);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const newMute = !isMuted;
    audioRef.current.muted = newMute;
    setIsMuted(newMute);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
      audioRef.current.muted = newVol === 0;
    }
    setIsMuted(newVol === 0);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return toLatinNumerals(`${m}:${s < 10 ? '0' : ''}${s}`);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volPct = (isMuted ? 0 : volume) * 100;

  const progressTrackStyle = {
    background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${progressPct}%, rgba(255,255,255,0.22) ${progressPct}%, rgba(255,255,255,0.22) ${Math.max(progressPct, bufferedPct)}%, var(--theme-border) ${Math.max(progressPct, bufferedPct)}%, var(--theme-border) 100%)`
  };

  const volumeTrackStyle = {
    background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${volPct}%, var(--theme-border) ${volPct}%, var(--theme-border) 100%)`
  };

  return (
    <div
      ref={cardRef}
      className={`p-3 sm:p-4 rounded-2xl border min-w-[260px] xs:min-w-[300px] sm:min-w-[360px] w-full max-w-full sm:max-w-lg md:max-w-xl flex flex-col gap-2.5 shadow-md select-none overflow-hidden ${
        isLight ? 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]' : 'bg-[var(--theme-bg-card)] border-accent/30 text-[var(--theme-text-primary)]'
      }`}
    >
      <audio key={activeTrack.src} ref={audioRef} src={hasActivated ? activeTrack.src : undefined} preload={hasActivated ? "auto" : "none"} disableRemotePlayback={true} />

      {/* Header Info */}
      <div className="flex items-center justify-between gap-2 min-w-0 w-full">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {renderDiscPreview(activeTrack.coverUrl, activeTrack.senderAvatar, isPlaying, "w-8 h-8 sm:w-9 sm:h-9")}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-extrabold text-xs truncate leading-tight max-w-[120px] sm:max-w-[180px]">{activeTrack.title}</span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent shrink-0">
                {toLatinNumerals(currentIndex + 1)}/{toLatinNumerals(tracks.length)}
              </span>
            </div>
            <div className="text-[10px] font-semibold truncate mt-0.5 text-accent">
              {activeTrack.artist || (lang === 'ar' ? `قائمة تشغيل (${toLatinNumerals(tracks.length)} مقطوعات)` : `Audio Playlist (${toLatinNumerals(tracks.length)} tracks)`)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <AttachmentDownloadControl
            attachmentId={activeTrack.id || activeTrack.src}
            filename={activeTrack.filename || activeTrack.title || 'audio.mp3'}
            downloadUrl={activeTrack.src}
            mimeType={activeTrack.mimeType || 'audio/mpeg'}
            downloadedFiles={activeTrack.downloadedFiles}
            lang={(lang as 'en' | 'ar') || 'en'}
            isLight={isLight}
            variant="button"
          />

          {onPlayGlobal && (
            <button
              type="button"
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.pause();
                  setIsPlaying(false);
                }
                onPlayGlobal({
                  id: activeTrack.src,
                  title: activeTrack.title,
                  artist: activeTrack.artist,
                  url: activeTrack.src,
                  coverUrl: activeTrack.coverUrl,
                  senderAvatar: activeTrack.senderAvatar,
                  playlist: fullPlaylist,
                  playlistIndex: currentIndex
                });
              }}
              title={lang === 'ar' ? 'فتح في المشغل الرئيسي' : 'Open in Player'}
              className="p-1.5 sm:px-2 sm:py-1 rounded-lg text-[10px] font-bold bg-accent/15 hover:bg-accent/30 text-accent transition-all cursor-pointer border border-accent/20 shrink-0 flex items-center gap-1"
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{lang === 'ar' ? 'المشغل' : 'Player'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Always Visible Playlist (First 5 visible, then scrollable) */}
      <div className="flex flex-col gap-1 p-2 rounded-xl max-h-[195px] overflow-y-auto border text-xs bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] custom-scrollbar">
        {tracks.map((t, idx) => (
          <div
            key={t.id || idx}
            onClick={() => playTrackIndex(idx)}
            className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-all ${
              idx === currentIndex
                ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-bold shadow-sm'
                : 'hover:bg-accent/20 opacity-80 hover:opacity-100'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <span className="text-[10px] font-mono opacity-70 w-4 text-center">{toLatinNumerals(idx + 1)}</span>
              <span className="truncate">{t.title}</span>
            </div>
            {idx === currentIndex && isPlaying && (
              <span className="text-[10px] uppercase font-bold animate-pulse">{lang === 'ar' ? 'يستمع إلى' : 'Playing'}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1" dir="ltr">
        <input
          type="range"
          dir="ltr"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          style={progressTrackStyle}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
        />
        <div className="flex justify-between items-center text-[9px] font-mono opacity-70" dir="ltr">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 sm:gap-2 pt-0.5 w-full flex-nowrap overflow-hidden">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handlePrev}
            className="p-1.5 rounded-lg bg-accent/20 hover:bg-accent/40 text-accent hover:text-white cursor-pointer transition-all shrink-0"
            title={lang === 'ar' ? 'السابق' : 'Previous'}
          >
            <SkipBack className={`w-3.5 h-3.5 ${lang === 'ar' ? 'scale-x-[-1]' : ''}`} />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="p-1.5 sm:p-2 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] cursor-pointer transition-all border-0 shadow-md flex items-center justify-center gap-1 px-2.5 sm:px-3 font-bold text-xs shrink-0 min-w-[65px]"
          >
            {isBuffering ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span className="truncate">
              {isBuffering
                ? (lang === 'ar' ? 'تخزين...' : 'Buffering...')
                : isPlaying
                ? (lang === 'ar' ? 'إيقاف' : 'Pause')
                : (lang === 'ar' ? 'تشغيل' : 'Play')}
            </span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="p-1.5 rounded-lg bg-accent/20 hover:bg-accent/40 text-accent hover:text-white cursor-pointer transition-all shrink-0"
            title={lang === 'ar' ? 'التالي' : 'Next'}
          >
            <SkipForward className={`w-3.5 h-3.5 ${lang === 'ar' ? 'scale-x-[-1]' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0 min-w-0" dir="ltr">
          <button
            type="button"
            onClick={toggleMute}
            className="p-1 rounded-lg hover:bg-accent/20 text-slate-400 hover:text-white transition-all cursor-pointer border-0 shrink-0"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />}
          </button>
          <input
            type="range"
            dir="ltr"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            style={volumeTrackStyle}
            className="w-10 xs:w-14 sm:w-16 h-1.5 rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
            title={`${Math.round((isMuted ? 0 : volume) * 100)}%`}
          />
          <span className="text-[9px] sm:text-[10px] font-mono font-extrabold w-6 sm:w-7 text-center shrink-0 select-none text-accent">
            {Math.round((isMuted ? 0 : volume) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};

// Persistent Global Music Player with Centered Dynamic Island / Now Bar & Slide-to-Close
export const GlobalMusicPlayer: React.FC<{
  track: MusicTrack;
  onClose: () => void;
  lang?: string;
  isLight?: boolean;
}> = ({ track, onClose, lang = 'en', isLight = false }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedPct, setBufferedPct] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('app_player_volume');
    return saved !== null ? parseFloat(saved) : 0.8;
  });

  const [playlist, setPlaylist] = useState<MusicTrack[]>(() =>
    track.playlist && track.playlist.length > 0 ? track.playlist : [track]
  );
  const [currentIndex, setCurrentIndex] = useState<number>(() =>
    track.playlistIndex !== undefined && track.playlistIndex >= 0 ? track.playlistIndex : 0
  );

  useEffect(() => {
    if (track.playlist && track.playlist.length > 0) {
      setPlaylist(track.playlist);
      const idx =
        track.playlistIndex !== undefined && track.playlistIndex >= 0
          ? track.playlistIndex
          : Math.max(0, track.playlist.findIndex((t) => t.url === track.url));
      setCurrentIndex(idx);
    } else {
      setPlaylist([track]);
      setCurrentIndex(0);
    }
  }, [track.id, track.url, track.playlist]);

  const activeTrack = playlist[currentIndex] || track;

  const [extractedCover, setExtractedCover] = useState<string | undefined>(activeTrack.coverUrl);

  useEffect(() => {
    setExtractedCover(activeTrack.coverUrl);
    if (!activeTrack.coverUrl && activeTrack.url) {
      extractCoverFromUrl(activeTrack.url).then((c) => {
        if (c) setExtractedCover(c);
      });
    }
  }, [activeTrack.url, activeTrack.coverUrl]);

  const effectiveCover = activeTrack.coverUrl || extractedCover;

  useEffect(() => {
    window.__isGlobalPlayerOpen = true;
    window.__activeGlobalTrackUrl = activeTrack.url;
    if (activeTrack.url) {
      notifyAudioPlay(activeTrack.url, true);
    }
    return () => {
      window.__isGlobalPlayerOpen = false;
      window.__activeGlobalTrackUrl = null;
    };
  }, [activeTrack.url]);

  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail?.id !== activeTrack.url) {
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
      }
    };
    window.addEventListener('app-audio-play', handleOtherPlay);
    return () => window.removeEventListener('app-audio-play', handleOtherPlay);
  }, [activeTrack.url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const savedVol = localStorage.getItem('app_player_volume');
    const initVol = savedVol !== null ? parseFloat(savedVol) : volume;
    audio.volume = isMuted ? 0 : initVol;

    notifyAudioPlay(activeTrack.url, true);
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));

    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onPlay = () => {
      setIsBuffering(false);
      setIsPlaying(true);
      notifyAudioPlay(activeTrack.url, true);
    };
    const onPause = () => {
      setIsPlaying(false);
      notifyAudioPause(activeTrack.url, true);
    };
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
    };
    const onProgress = () => {
      if (audio.buffered && audio.buffered.length > 0 && audio.duration > 0) {
        try {
          const end = audio.buffered.end(audio.buffered.length - 1);
          setBufferedPct(Math.min(100, (end / audio.duration) * 100));
        } catch {}
      }
    };
    const onCanPlay = () => {
      setIsBuffering(false);
      onProgress();
    };
    const onEnded = () => {
      if (currentIndex + 1 < playlist.length) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('progress', onProgress);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('progress', onProgress);
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, [activeTrack.url, currentIndex, playlist.length]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      notifyAudioPause(activeTrack.url, true);
      setIsPlaying(false);
    } else {
      notifyAudioPlay(activeTrack.url, true);
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleNextTrack = () => {
    if (playlist.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % playlist.length);
  };

  const handlePrevTrack = () => {
    if (playlist.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + playlist.length) % playlist.length);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const newMute = !isMuted;
    audioRef.current.muted = newMute;
    setIsMuted(newMute);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    localStorage.setItem('app_player_volume', newVol.toString());
    if (audioRef.current) {
      audioRef.current.volume = newVol;
      audioRef.current.muted = newVol === 0;
    }
    setIsMuted(newVol === 0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return toLatinNumerals(`${m}:${s < 10 ? '0' : ''}${s}`);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volPct = (isMuted ? 0 : volume) * 100;

  const progressTrackStyle = {
    background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${progressPct}%, rgba(255,255,255,0.22) ${progressPct}%, rgba(255,255,255,0.22) ${Math.max(progressPct, bufferedPct)}%, ${isLight ? '#cbd5e1' : '#334155'} ${Math.max(progressPct, bufferedPct)}%, ${isLight ? '#cbd5e1' : '#334155'} 100%)`
  };

  const volumeTrackStyle = {
    background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${volPct}%, ${isLight ? '#cbd5e1' : '#ffffff'} ${volPct}%, ${isLight ? '#cbd5e1' : '#ffffff'} 100%)`
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <audio ref={audioRef} src={activeTrack.url} preload="auto" disableRemotePlayback={true} />

      {/* Collapsed Draggable Floating Disc Button */}
      {!isExpanded && (
        <motion.div
          drag
          dragMomentum={false}
          dragElastic={0.05}
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="fixed top-16 right-4 z-50 pointer-events-auto select-none cursor-grab active:cursor-grabbing touch-none"
        >
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-2xl transition-all duration-200 hover:scale-105 ${
              isLight
                ? 'bg-[var(--theme-bg-card)] text-[var(--theme-text-primary)] border-[var(--theme-border)] shadow-md'
                : 'bg-[var(--theme-bg-card)] text-[var(--theme-text-primary)] border-accent/50 shadow-black/90'
            }`}
          >
            {/* Click Disc or Song Title/Artist to Expand */}
            <div
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-2 cursor-pointer min-w-0 py-0.5"
              title={lang === 'ar' ? 'اضغط هنا للتحكم بالمشغل' : 'Click to expand player controls'}
            >
              {renderDiscPreview(effectiveCover, activeTrack.senderAvatar, isPlaying, "w-7 h-7 sm:w-8 sm:h-8")}

              <div className="flex flex-col min-w-0 max-w-[130px] xs:max-w-[170px] sm:max-w-[220px]">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[11px] sm:text-xs font-extrabold truncate leading-tight">
                    {activeTrack.title}
                  </span>
                  {playlist.length > 1 && (
                    <span className="text-[9px] font-mono font-bold px-1 rounded bg-accent/20 text-accent shrink-0">
                      {toLatinNumerals(currentIndex + 1)}/{toLatinNumerals(playlist.length)}
                    </span>
                  )}
                </div>
                {activeTrack.artist && (
                  <span className="text-[9px] font-semibold text-accent truncate leading-tight">
                    {activeTrack.artist}
                  </span>
                )}
              </div>
            </div>

            {/* Quick Play/Pause Toggle */}
            <button
              type="button"
              onClick={togglePlay}
              className="p-1 sm:p-1.5 rounded-full bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] transition-all cursor-pointer border-0 shadow shrink-0"
              title={isBuffering ? (lang === 'ar' ? 'جاري التخزين المؤقت...' : 'Buffering...') : isPlaying ? 'Pause' : 'Play'}
            >
              {isBuffering ? (
                <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              ) : (
                <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" />
              )}
            </button>

            {/* Close Player button */}
            <button
              type="button"
              onClick={onClose}
              className={`p-1 rounded-full transition-all cursor-pointer border-0 shrink-0 ${
                isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/20 text-slate-400 hover:text-white'
              }`}
              title={lang === 'ar' ? 'إغلاق المشغل' : 'Close Player'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Expanded Player Overlay */}
      <AnimatePresence>
        {isExpanded && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExpanded(false)}
              className="fixed inset-0 bg-black/60 z-45 pointer-events-auto"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: -10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              style={{ transformOrigin: 'top center' }}
              className={`fixed top-[68px] left-1/2 -translate-x-1/2 z-50 w-[92vw] max-w-sm sm:max-w-md p-4 rounded-2xl shadow-2xl border pointer-events-auto flex flex-col gap-3 select-none overflow-hidden ${
                isLight
                  ? 'bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] shadow-md'
                  : 'bg-[var(--theme-bg-card)] border-accent/40 text-[var(--theme-text-primary)] shadow-black/90'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {renderDiscPreview(effectiveCover, activeTrack.senderAvatar, isPlaying, "w-10 h-10 sm:w-12 sm:h-12")}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-xs sm:text-sm truncate max-w-[160px] sm:max-w-[200px]">
                        {activeTrack.title}
                      </span>
                      {playlist.length > 1 && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent shrink-0">
                          {toLatinNumerals(currentIndex + 1)}/{toLatinNumerals(playlist.length)}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] sm:text-xs font-semibold truncate text-accent">
                      {activeTrack.artist || (lang === 'ar' ? 'المشغل الصوتي' : 'In-App Music Player')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className={`p-1.5 rounded-xl transition-all cursor-pointer border-0 ${
                      isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-slate-400 hover:text-white'
                    }`}
                    title={lang === 'ar' ? 'تصغير إلى الزر' : 'Minimize player'}
                  >
                    <Minimize2 className="w-4 h-4 text-accent" />
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className={`p-1.5 rounded-xl transition-all cursor-pointer border-0 ${
                      isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-slate-400 hover:text-red-400'
                    }`}
                    title={lang === 'ar' ? 'إغلاق' : 'Close'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Progress Slider */}
              <div className="flex flex-col gap-1.5" dir="ltr">
                <input
                  type="range"
                  dir="ltr"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  style={progressTrackStyle}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
                />
                <div
                  className={`flex justify-between items-center text-[10px] font-mono ${
                    isLight ? 'text-slate-600' : 'text-slate-400'
                  }`}
                  dir="ltr"
                >
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Player Controls & Volume Slider */}
              <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer border-0 ${
                      isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-slate-400'
                    }`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-accent" />}
                  </button>
                  <input
                    type="range"
                    dir="ltr"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    style={volumeTrackStyle}
                    className="w-16 h-1.5 rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
                    title={`${toLatinNumerals(Math.round((isMuted ? 0 : volume) * 100))}%`}
                  />
                  <span className="text-[10px] font-mono font-extrabold w-7 text-center shrink-0 select-none text-accent">
                    {toLatinNumerals(Math.round((isMuted ? 0 : volume) * 100))}%
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {playlist.length > 1 && (
                    <button
                      type="button"
                      onClick={handlePrevTrack}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        isLight
                          ? 'hover:bg-slate-200 text-slate-700 border-slate-300'
                          : 'hover:bg-white/10 text-slate-300 border-white/10'
                      }`}
                      title={lang === 'ar' ? 'المقطوعة السابقة' : 'Previous track'}
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-2.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] transition-all cursor-pointer border-0 shadow-lg flex items-center justify-center min-w-[40px]"
                    title={isBuffering ? (lang === 'ar' ? 'جاري التخزين المؤقت...' : 'Buffering...') : isPlaying ? 'Pause' : 'Play'}
                  >
                    {isBuffering ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                  </button>

                  {playlist.length > 1 && (
                    <button
                      type="button"
                      onClick={handleNextTrack}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        isLight
                          ? 'hover:bg-slate-200 text-slate-700 border-slate-300'
                          : 'hover:bg-white/10 text-slate-300 border-white/10'
                      }`}
                      title={lang === 'ar' ? 'المقطوعة التالية' : 'Next track'}
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Playlist Queue List in Extended Player */}
              {playlist.length > 1 && (
                <div className="flex flex-col gap-1 p-2 rounded-xl max-h-[160px] overflow-y-auto border text-xs bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] custom-scrollbar mt-1">
                  <div className="text-[10px] font-bold text-accent px-1 pb-1 border-b border-white/10 flex justify-between items-center">
                    <span>{lang === 'ar' ? 'قائمة التشغيل' : 'Playlist Queue'}</span>
                    <span className="font-mono">
                      {toLatinNumerals(currentIndex + 1)}/{toLatinNumerals(playlist.length)}
                    </span>
                  </div>
                  {playlist.map((t, idx) => (
                    <div
                      key={t.id || t.url || idx}
                      onClick={() => setCurrentIndex(idx)}
                      className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-all ${
                        idx === currentIndex
                          ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-bold shadow-sm'
                          : 'hover:bg-accent/20 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate min-w-0">
                        <span className="text-[10px] font-mono opacity-70 w-4 text-center shrink-0">
                          {toLatinNumerals(idx + 1)}
                        </span>
                        <span className="truncate">{t.title}</span>
                      </div>
                      {idx === currentIndex && isPlaying && (
                        <span className="text-[9px] uppercase font-bold animate-pulse shrink-0">
                          {lang === 'ar' ? 'جاري التشغيل' : 'Playing'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

