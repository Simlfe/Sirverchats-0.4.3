import React from 'react';
import { ExternalLink, Play, Film, MessageSquare, Video, Share2 } from 'lucide-react';
import { openExternalUrl } from '../lib/tauriDesktopService';

export interface SocialEmbedProps {
  url: string;
  lang?: string;
  isLight?: boolean;
}

// -------------------------------------------------------------
// Instagram Reels / Post Preview Component (Opens in External Player)
// -------------------------------------------------------------
export const SmartInstagramEmbed: React.FC<SocialEmbedProps> = React.memo(({ url, lang = 'en', isLight = false }) => {
  let postId = '';
  const match = url.match(/(?:instagram\.com|instagr\.am)\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) {
    postId = match[1];
  }

  const isReel = url.includes('/reel') || url.includes('/reels');

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openExternalUrl(url);
  };

  return (
    <div
      onClick={handleOpen}
      className="group/insta w-full max-w-md rounded-2xl overflow-hidden border shadow-md my-1.5 transition-all cursor-pointer bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-pink-500/40 hover:shadow-lg select-none"
    >
      {/* Header bar with Instagram brand styling */}
      <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 p-2.5 px-3.5 flex items-center justify-between text-white shadow-xs">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-white shrink-0" />
          <span className="font-extrabold text-xs tracking-wide">
            {isReel
              ? (lang === 'ar' ? 'إنستغرام ريلز فيديو' : 'Instagram Reel')
              : (lang === 'ar' ? 'إنستغرام ريلز / منشور' : 'Instagram Post')}
          </span>
        </div>
        <div className="p-1 px-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all flex items-center gap-1 text-[11px] font-bold">
          <span>{lang === 'ar' ? 'مشغل خارجي' : 'External Player'}</span>
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>

      {/* Thumbnail Card Content */}
      <div className="relative w-full h-[180px] bg-gradient-to-b from-purple-950/40 to-slate-950/80 flex flex-col items-center justify-center gap-2.5 p-4 group-hover/insta:from-purple-900/50 group-hover/insta:to-slate-900/90 transition-all overflow-hidden">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-600 text-white flex items-center justify-center shadow-xl group-hover/insta:scale-110 group-hover/insta:brightness-110 transition-all duration-200">
          <Play className="w-6 h-6 fill-white ml-0.5" />
        </div>
        <div className="text-center z-10">
          <p className="text-xs font-bold text-white group-hover/insta:text-pink-300 transition-colors flex items-center justify-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5 text-pink-400" />
            <span>{lang === 'ar' ? 'انقر للفتح في المشغل الخارجي' : 'Click to open in external player'}</span>
          </p>
          <p className="text-[10px] text-slate-400 font-mono mt-1 truncate max-w-[280px]">
            {url}
          </p>
        </div>
      </div>
    </div>
  );
});

// -------------------------------------------------------------
// TikTok Video / Reels Preview Component (Opens in External Player)
// -------------------------------------------------------------
export const SmartTikTokEmbed: React.FC<SocialEmbedProps> = React.memo(({ url, lang = 'en', isLight = false }) => {
  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openExternalUrl(url);
  };

  return (
    <div
      onClick={handleOpen}
      className="group/tiktok w-full max-w-sm rounded-2xl overflow-hidden border shadow-md my-1.5 transition-all cursor-pointer bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-cyan-500/40 hover:shadow-lg select-none"
    >
      {/* Header bar with TikTok brand styling */}
      <div className="bg-slate-900 border-b border-slate-800 p-2.5 px-3.5 flex items-center justify-between text-white shadow-xs">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-teal-400 shrink-0" />
          <span className="font-extrabold text-xs tracking-wide">
            <span className="text-cyan-400">Tik</span>
            <span className="text-rose-500">Tok</span>{' '}
            {lang === 'ar' ? 'فيديو / ريلز' : 'Video'}
          </span>
        </div>
        <div className="p-1 px-2 rounded-lg bg-slate-800 text-slate-200 transition-all flex items-center gap-1 text-[11px] font-bold">
          <span>{lang === 'ar' ? 'مشغل خارجي' : 'External Player'}</span>
          <ExternalLink className="w-3 h-3 text-cyan-400" />
        </div>
      </div>

      {/* Video Preview Card Content */}
      <div className="relative w-full h-[180px] bg-gradient-to-b from-slate-900 to-black flex flex-col items-center justify-center gap-2.5 p-4 group-hover/tiktok:from-slate-800 group-hover/tiktok:to-slate-950 transition-all overflow-hidden">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-teal-400 to-rose-500 text-white flex items-center justify-center shadow-xl group-hover/tiktok:scale-110 group-hover/tiktok:brightness-110 transition-all duration-200">
          <Play className="w-6 h-6 fill-white ml-0.5" />
        </div>
        <div className="text-center z-10">
          <p className="text-xs font-bold text-white group-hover/tiktok:text-cyan-300 transition-colors flex items-center justify-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            <span>{lang === 'ar' ? 'انقر للفتح في المشغل الخارجي' : 'Click to open in external player'}</span>
          </p>
          <p className="text-[10px] text-slate-400 font-mono mt-1 truncate max-w-[240px]">
            {url}
          </p>
        </div>
      </div>
    </div>
  );
});

// -------------------------------------------------------------
// Facebook Video / Post Preview Component (Opens in External Player)
// -------------------------------------------------------------
export const SmartFacebookEmbed: React.FC<SocialEmbedProps> = React.memo(({ url, lang = 'en', isLight = false }) => {
  const isVideo = url.includes('/watch') || url.includes('/reel') || url.includes('/videos/') || url.includes('fb.watch');

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openExternalUrl(url);
  };

  return (
    <div
      onClick={handleOpen}
      className="group/fb w-full max-w-md rounded-2xl overflow-hidden border shadow-md my-1.5 transition-all cursor-pointer bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-blue-500/40 hover:shadow-lg select-none"
    >
      {/* Header bar with Facebook brand styling */}
      <div className="bg-blue-600 p-2.5 px-3.5 flex items-center justify-between text-white shadow-xs">
        <div className="flex items-center gap-2">
          <Share2 className="w-4 h-4 text-white shrink-0" />
          <span className="font-extrabold text-xs tracking-wide">
            {isVideo
              ? (lang === 'ar' ? 'فيسبوك فيديو / ريلز' : 'Facebook Video / Reel')
              : (lang === 'ar' ? 'منشور فيسبوك' : 'Facebook Post')}
          </span>
        </div>
        <div className="p-1 px-2 rounded-lg bg-white/20 text-white transition-all flex items-center gap-1 text-[11px] font-bold">
          <span>{lang === 'ar' ? 'مشغل خارجي' : 'External Player'}</span>
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>

      {/* Preview Card Content */}
      <div className="relative w-full h-[180px] bg-gradient-to-b from-blue-950/40 to-slate-950/80 flex flex-col items-center justify-center gap-2.5 p-4 group-hover/fb:from-blue-900/50 group-hover/fb:to-slate-900/90 transition-all overflow-hidden">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xl group-hover/fb:scale-110 group-hover/fb:bg-blue-500 transition-all duration-200">
          <Play className="w-6 h-6 fill-white ml-0.5" />
        </div>
        <div className="text-center z-10">
          <p className="text-xs font-bold text-white group-hover/fb:text-blue-300 transition-colors flex items-center justify-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
            <span>{lang === 'ar' ? 'انقر للفتح في المشغل الخارجي' : 'Click to open in external player'}</span>
          </p>
          <p className="text-[10px] text-slate-400 font-mono mt-1 truncate max-w-[280px]">
            {url}
          </p>
        </div>
      </div>
    </div>
  );
});

// -------------------------------------------------------------
// Reddit Post / Video Preview Component (Opens in External Player)
// -------------------------------------------------------------
export const SmartRedditEmbed: React.FC<SocialEmbedProps> = React.memo(({ url, lang = 'en', isLight = false }) => {
  let subName = '';
  const reddMatch = url.match(/reddit\.com\/r\/([^/]+)\/comments\/([^/]+)/i);
  if (reddMatch) {
    subName = reddMatch[1];
  }

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openExternalUrl(url);
  };

  return (
    <div
      onClick={handleOpen}
      className="group/reddit w-full max-w-lg rounded-2xl overflow-hidden border shadow-md my-1.5 transition-all cursor-pointer bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-orange-500/40 hover:shadow-lg select-none"
    >
      {/* Header bar with Reddit brand styling */}
      <div className="bg-orange-600 p-2.5 px-3.5 flex items-center justify-between text-white shadow-xs">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-white shrink-0" />
          <span className="font-extrabold text-xs tracking-wide">
            {subName ? `r/${subName}` : (lang === 'ar' ? 'منشور ريديت' : 'Reddit Post')}
          </span>
        </div>
        <div className="p-1 px-2 rounded-lg bg-white/20 text-white transition-all flex items-center gap-1 text-[11px] font-bold">
          <span>{lang === 'ar' ? 'مشغل خارجي' : 'External Player'}</span>
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>

      {/* Preview Card Content */}
      <div className="relative w-full h-[180px] bg-gradient-to-b from-orange-950/40 to-slate-950/80 flex flex-col items-center justify-center gap-2.5 p-4 group-hover/reddit:from-orange-900/50 group-hover/reddit:to-slate-900/90 transition-all overflow-hidden">
        <div className="w-14 h-14 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-xl group-hover/reddit:scale-110 group-hover/reddit:bg-orange-500 transition-all duration-200">
          <Play className="w-6 h-6 fill-white ml-0.5" />
        </div>
        <div className="text-center z-10">
          <p className="text-xs font-bold text-white group-hover/reddit:text-orange-300 transition-colors flex items-center justify-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5 text-orange-400" />
            <span>{lang === 'ar' ? 'انقر للفتح في المشغل الخارجي' : 'Click to open in external player'}</span>
          </p>
          <p className="text-[10px] text-slate-400 font-mono mt-1 truncate max-w-[280px]">
            {url}
          </p>
        </div>
      </div>
    </div>
  );
});
