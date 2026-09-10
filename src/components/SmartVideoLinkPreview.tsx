import React, { useState } from "react";
import { Play, ExternalLink, Film, Video, X } from "lucide-react";
import { openExternalUrl } from "../lib/tauriDesktopService";
import { MusicTrack } from "../types";
import { SmartVideoPlayer } from "./MusicPlayer";

interface SmartVideoLinkPreviewProps {
  url: string;
  lang?: string;
  isLight?: boolean;
  onPlayGlobal?: (track: MusicTrack) => void;
}

export const SmartVideoLinkPreview: React.FC<SmartVideoLinkPreviewProps> = React.memo(({
  url,
  lang = "en",
  isLight = false,
  onPlayGlobal,
}) => {
  const [isPlayingInline, setIsPlayingInline] = useState<boolean>(false);

  // Extract clean filename and host
  const { fileName, host, extension } = React.useMemo(() => {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      const pathname = u.pathname;
      const parts = pathname.split("/").filter(Boolean);
      const rawName = parts[parts.length - 1] || "video";
      const extMatch = rawName.match(/\.([a-z0-9]+)$/i);
      const ext = extMatch ? extMatch[1].toUpperCase() : "VIDEO";
      const name = decodeURIComponent(rawName);
      return {
        fileName: name,
        host: u.hostname.replace(/^www\./, ""),
        extension: ext,
      };
    } catch {
      return {
        fileName: url.substring(url.lastIndexOf("/") + 1) || "video.mp4",
        host: "Video Link",
        extension: "VIDEO",
      };
    }
  }, [url]);

  const handleOpenExternal = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openExternalUrl(url);
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlayingInline(true);
  };

  // If user has pressed Play, display the inline SmartVideoPlayer with buffering
  if (isPlayingInline) {
    return (
      <div className="w-full max-w-lg md:max-w-xl rounded-2xl overflow-hidden border shadow-lg my-1.5 bg-black border-[var(--theme-border)] text-white relative group/inlinevid">
        {/* Top bar with filename and collapse button */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-950/90 border-b border-white/10 text-xs">
          <div className="flex items-center gap-1.5 truncate">
            <Film className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="font-bold truncate text-slate-200">{fileName}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleOpenExternal}
              title={lang === "ar" ? "فتح في المشغل الخارجي" : "Open in External Player"}
              className="p-1 rounded-lg hover:bg-white/15 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsPlayingInline(false)}
              title={lang === "ar" ? "إغلاق المشغل" : "Close Player"}
              className="p-1 rounded-lg hover:bg-white/15 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Video Player with Buffering */}
        <SmartVideoPlayer
          src={url}
          title={fileName}
          autoPlay={true}
          lang={lang as 'en' | 'ar'}
          isLight={isLight}
          onPlayGlobal={onPlayGlobal}
          onClose={() => setIsPlayingInline(false)}
          className="w-full aspect-video"
        />
      </div>
    );
  }

  // Preview Mode: Never load the actual streamable file until the user presses on it
  return (
    <div
      onClick={handlePlayClick}
      className="group/vidpreview w-full max-w-lg md:max-w-xl rounded-2xl overflow-hidden border shadow-md my-1.5 transition-all cursor-pointer relative bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-accent/40 hover:shadow-lg select-none"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 p-2.5 px-3 border-b border-[var(--theme-border)] bg-[var(--theme-bg-secondary)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-lg bg-accent/15 text-accent border border-accent/20 flex items-center justify-center shrink-0">
            <Film className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold truncate max-w-[260px] sm:max-w-[340px]">
              {fileName}
            </span>
            <span className="text-[10px] text-[var(--theme-text-muted)] font-mono truncate">
              {host}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md bg-[var(--theme-bg-tertiary)] text-accent border border-[var(--theme-border)]">
            {extension}
          </span>
          <button
            type="button"
            onClick={handleOpenExternal}
            className="flex items-center gap-1 text-[10px] font-bold text-accent bg-accent/10 hover:bg-accent/20 px-2 py-0.5 rounded-full border border-accent/20 transition-colors cursor-pointer"
            title={lang === "ar" ? "مشغل خارجي" : "External Player"}
          >
            <ExternalLink className="w-3 h-3 text-accent" />
            <span className="hidden sm:inline">
              {lang === "ar" ? "مشغل خارجي" : "External"}
            </span>
          </button>
        </div>
      </div>

      {/* Main Thumbnail & Play Action Area (Preview only, no media stream loaded) */}
      <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-black flex flex-col items-center justify-center gap-2 p-4">
          <Video className="w-12 h-12 text-accent/40 group-hover/vidpreview:scale-105 transition-transform" />
          <span className="text-xs font-bold text-slate-300 truncate max-w-[280px]">
            {fileName}
          </span>
        </div>

        {/* Dark Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/40 group-hover/vidpreview:from-black/70 group-hover/vidpreview:via-black/20 transition-colors" />

        {/* Center Play & Buffer Action */}
        <div className="relative z-10 flex flex-col items-center gap-2">
          <div className="w-14 h-14 rounded-2xl bg-accent text-[var(--theme-bg-primary)] flex items-center justify-center shadow-2xl group-hover/vidpreview:scale-110 group-hover/vidpreview:brightness-110 transition-all duration-200">
            <Play className="w-6 h-6 fill-current ml-0.5" />
          </div>
          <span className="text-[10px] font-bold font-mono text-accent bg-black/60 px-2.5 py-0.5 rounded-full border border-accent/30 shadow-md">
            {lang === "ar" ? "انقر للتشغيل والتخزين المؤقت" : "Click to Play & Buffer"}
          </span>
        </div>

        {/* Bottom Info Bar */}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-white text-xs font-semibold select-none z-10">
          <div className="flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 text-accent fill-accent" />
            <span className="drop-shadow-sm font-bold text-[11px]">
              {lang === "ar"
                ? "معاينة الفيديو (البث يبدأ عند النقر)"
                : "Preview (Streaming starts on click)"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

