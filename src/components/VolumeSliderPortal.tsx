import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX, RotateCcw } from 'lucide-react';

interface VolumeSliderPortalProps {
  isOpen: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  volume: number;
  displayName?: string;
  isAr?: boolean;
  onChange: (newVolume: number) => void;
  onClose: () => void;
}

export const VolumeSliderPortal: React.FC<VolumeSliderPortalProps> = ({
  isOpen,
  triggerRef,
  volume,
  displayName = '',
  isAr = false,
  onChange,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();

    // Standard popover dimensions
    const popoverWidth = 170;
    const popoverHeight = 110;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let targetTop = rect.top - popoverHeight - 8;
    let targetLeft = rect.left + rect.width / 2 - popoverWidth / 2;

    // Smart repositioning if close to top edge
    if (rect.top - popoverHeight - 12 < 0) {
      // Not enough room above, open below
      targetTop = rect.bottom + 8;
    }

    // Smart repositioning if close to bottom edge
    if (targetTop + popoverHeight > viewportH - 12) {
      targetTop = Math.max(12, rect.top - popoverHeight - 8);
    }

    // Clamp horizontally to stay cleanly within window bounds
    const clampedLeft = Math.max(12, Math.min(viewportW - popoverWidth - 12, targetLeft));
    const clampedTop = Math.max(12, Math.min(viewportH - popoverHeight - 12, targetTop));

    setCoords({ top: clampedTop, left: clampedLeft });
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fillPercent = Math.min(100, Math.max(0, (volume / 200) * 100));
  const sliderBackground = `linear-gradient(to ${isAr ? 'left' : 'right'}, var(--accent-color, #7BAE37) 0%, var(--accent-color, #7BAE37) ${fillPercent}%, var(--theme-bg-tertiary, rgba(255, 255, 255, 0.15)) ${fillPercent}%, var(--theme-bg-tertiary, rgba(255, 255, 255, 0.15)) 100%)`;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 999999,
        width: '170px',
      }}
      className="p-3 rounded-2xl bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] border border-[var(--theme-border)] shadow-2xl flex flex-col gap-2 select-none"
      dir={isAr ? 'rtl' : 'ltr'}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-1 text-xs">
        <div className="flex items-center gap-1.5 truncate font-semibold text-[var(--theme-text-primary)]">
          {volume === 0 ? (
            <VolumeX className="w-3.5 h-3.5 text-red-500 shrink-0" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-accent shrink-0" />
          )}
          <span className="truncate">{displayName || (isAr ? 'مستوى الصوت' : 'Volume')}</span>
        </div>
        <span className="font-mono text-[11px] font-bold text-accent px-1.5 py-0.5 rounded bg-accent-subtle border border-[var(--theme-border)]">
          {volume}%
        </span>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <input
          type="range"
          min="0"
          max="200"
          step="5"
          value={volume}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          style={{ background: sliderBackground }}
          className="themed-volume-slider"
        />

        <button
          type="button"
          onClick={() => onChange(100)}
          className="p-1 rounded-lg bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer shrink-0 border border-[var(--theme-border)]"
          title={isAr ? 'إعادة الضبط 100%' : 'Reset to 100%'}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>,
    document.body
  );
};

export default VolumeSliderPortal;
