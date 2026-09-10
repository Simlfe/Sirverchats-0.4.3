import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, Shield, Search, Settings } from 'lucide-react';
import {
  isDesktopPlatform,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  isWindowMaximized,
  restoreWindowState,
  saveWindowState,
  startWindowDragging
} from '../lib/tauriDesktopService';

interface TitleBarProps {
  appName?: string;
  isLight?: boolean;
  lang?: 'en' | 'ar';
  onOpenSettings?: () => void;
  onOpenSearch?: () => void;
  isConnected?: boolean;
}

function TitleBar({
  appName = 'SirverData',
  isLight = false,
  lang = 'en',
  onOpenSettings,
  onOpenSearch,
  isConnected = true
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    setIsDesktop(isDesktopPlatform());

    restoreWindowState().then(() => {
      isWindowMaximized().then(setIsMaximized);
    });

    const handleResize = () => {
      isWindowMaximized().then(setIsMaximized);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('fullscreenchange', handleResize);

    const interval = setInterval(() => {
      isWindowMaximized().then(setIsMaximized);
    }, 1000);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('fullscreenchange', handleResize);
      clearInterval(interval);
    };
  }, []);

  if (!isDesktop) return null;

  const handleMouseDownDrag = (e: React.MouseEvent) => {
    if (e.buttons === 1) {
      startWindowDragging();
    }
  };

  const stopDragEvent = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleMinimize = async (e: React.MouseEvent) => {
    stopDragEvent(e);
    await minimizeWindow();
  };

  const handleToggleMaximize = async (e: React.MouseEvent) => {
    stopDragEvent(e);
    const newMaxState = await toggleMaximizeWindow();
    setIsMaximized(newMaxState);
    await saveWindowState();
  };

  const handleDoubleClickHeader = async (e: React.MouseEvent) => {
    stopDragEvent(e);
    const newMaxState = await toggleMaximizeWindow();
    setIsMaximized(newMaxState);
    await saveWindowState();
  };

  const handleClose = async (e: React.MouseEvent) => {
    stopDragEvent(e);
    await closeWindow();
  };

  return (
    <div
      className="w-full h-8 flex items-center justify-between px-3 select-none text-xs font-medium transition-colors z-50 shrink-0 relative bg-[var(--theme-titlebar-bg,var(--theme-bg-primary))] text-[var(--theme-text-primary)]"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Left Section: App Brand & Connection Pill */}
      <div
        className="flex items-center gap-2 min-w-0 z-10 relative"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-1.5 font-black tracking-wider text-[11px] text-accent">
          <Shield className="w-3.5 h-3.5 text-accent" />
          <span className="uppercase">{appName}</span>
        </div>

        <div className="h-3 w-[1px] bg-slate-500/30 mx-1 hidden sm:block" />

        <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{lang === 'ar' ? 'متصل' : 'v2 Desktop'}</span>
        </div>
      </div>

      {/* Center Section: Draggable Title Area */}
      <div
        data-tauri-drag-region
        onMouseDown={handleMouseDownDrag}
        onDoubleClick={handleDoubleClickHeader}
        className="flex-1 h-full flex items-center justify-center min-w-0 px-4 text-[11px] opacity-75 font-mono cursor-default truncate z-0 relative"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="truncate max-w-xs sm:max-w-md pointer-events-none">
          {appName} — SirverData Secure Network
        </span>
      </div>

      {/* Right Section: Window Controls (Minimize, Maximize/Restore, Close) */}
      <div
        className="flex items-center gap-0.5 z-20 relative pointer-events-auto"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Quick Search */}
        {onOpenSearch && (
          <button
            type="button"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={(e) => {
              stopDragEvent(e);
              onOpenSearch();
            }}
            className={`p-1.5 rounded-md transition-all cursor-pointer border-0 ${
              isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-300'
            }`}
            title={lang === 'ar' ? 'البحث' : 'Search'}
          >
            <Search className="w-3 h-3" />
          </button>
        )}

        {/* Settings */}
        {onOpenSettings && (
          <button
            type="button"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={(e) => {
              stopDragEvent(e);
              onOpenSettings();
            }}
            className={`p-1.5 rounded-md transition-all cursor-pointer border-0 ${
              isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-300'
            }`}
            title={lang === 'ar' ? 'الإعدادات' : 'Settings'}
          >
            <Settings className="w-3 h-3" />
          </button>
        )}

        <div className="h-3 w-[1px] bg-slate-500/30 mx-1" />

        {/* Minimize Button */}
        <button
          type="button"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={handleMinimize}
          className={`w-7 h-6 flex items-center justify-center rounded-md transition-colors cursor-pointer border-0 ${
            isLight
              ? 'hover:bg-slate-200 text-slate-700 active:bg-slate-300'
              : 'hover:bg-slate-800 text-slate-300 active:bg-slate-700'
          }`}
          title={lang === 'ar' ? 'تصغير' : 'Minimize'}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Maximize / Restore Button */}
        <button
          type="button"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={handleToggleMaximize}
          className={`w-7 h-6 flex items-center justify-center rounded-md transition-colors cursor-pointer border-0 ${
            isLight
              ? 'hover:bg-slate-200 text-slate-700 active:bg-slate-300'
              : 'hover:bg-slate-800 text-slate-300 active:bg-slate-700'
          }`}
          title={
            isMaximized
              ? lang === 'ar'
                ? 'استعادة'
                : 'Restore'
              : lang === 'ar'
              ? 'تكبير'
              : 'Maximize'
          }
        >
          {isMaximized ? (
            <Copy className="w-3 h-3" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </button>

        {/* Close Button */}
        <button
          type="button"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={handleClose}
          className={`w-7 h-6 flex items-center justify-center rounded-md transition-colors cursor-pointer border-0 hover:bg-rose-600 hover:text-white active:bg-rose-700 pointer-events-auto relative z-20 ${
            isLight ? 'text-slate-700' : 'text-slate-300'
          }`}
          title={lang === 'ar' ? 'إغلاق' : 'Close'}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default React.memo(TitleBar);
