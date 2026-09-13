import React, { useRef, useLayoutEffect, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Message } from "../types";
import {
  CornerDownRight,
  Copy,
  Link2,
  Download,
  Pin,
  Flag,
  Edit3,
  Trash2,
  SmilePlus,
} from "lucide-react";

export interface MessageContextMenuProps {
  message: Message;
  position: { x: number; y: number };
  onClose: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onOpenReactionPicker: (messageId: string, rect: DOMRect | null) => void;
  onReply: (message: Message) => void;
  onCopyText: (messageId: string, content: string) => void;
  onCopyMessageLink: (message: Message) => void;
  onTogglePin: (messageId: string) => void;
  onReport: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  isUserAuthorizedToEdit: (message: Message) => boolean;
  isUserAuthorizedToDelete: (message: Message) => boolean;
  isDmChannel: boolean;
  pinnedIds: string[];
  lang: string;
  isLight: boolean;
}

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  message,
  position,
  onClose,
  onToggleReaction,
  onOpenReactionPicker,
  onReply,
  onCopyText,
  onCopyMessageLink,
  onTogglePin,
  onReport,
  onEdit,
  onDelete,
  isUserAuthorizedToEdit,
  isUserAuthorizedToDelete,
  isDmChannel,
  pinnedIds,
  lang,
  isLight,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number }>({
    top: Math.max(10, position.y),
    left: Math.max(10, position.x),
  });

  // Calculate precise viewport-safe coordinates whenever the position or window changes
  useLayoutEffect(() => {
    const calculatePosition = () => {
      const margin = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Get actual rendered dimensions or fallback to sensible defaults
      let menuWidth = 230;
      let menuHeight = 360;

      if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        if (rect.width > 0) menuWidth = rect.width;
        if (rect.height > 0) menuHeight = rect.height;
      }

      let leftPos = position.x;
      let topPos = position.y;

      // Horizontal edge protection:
      // If clicking near the right border, shift menu left so it never overflows
      if (leftPos + menuWidth + margin > vw) {
        leftPos = Math.max(margin, vw - menuWidth - margin);
      } else {
        leftPos = Math.max(margin, leftPos);
      }

      // Vertical edge protection:
      // If clicking near the bottom border, shift menu up so all items stay clickable
      if (topPos + menuHeight + margin > vh) {
        topPos = Math.max(margin, vh - menuHeight - margin);
      } else {
        topPos = Math.max(margin, topPos);
      }

      setMenuCoords({ top: topPos, left: leftPos });
    };

    calculatePosition();

    window.addEventListener("resize", calculatePosition);
    window.addEventListener("scroll", calculatePosition, true);
    return () => {
      window.removeEventListener("resize", calculatePosition);
      window.removeEventListener("scroll", calculatePosition, true);
    };
  }, [position.x, position.y]);

  // Close menu on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const hasTextContent = Boolean(
    message.content && message.content.trim().length > 0,
  );
  const containsUrlMatch = /(https?:\/\/|www\.)[^\s]+/i.test(message.content || "");

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] select-none bg-black/15"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        style={{
          top: `${menuCoords.top}px`,
          left: `${menuCoords.left}px`,
        }}
        className="absolute w-56 max-h-[calc(100vh-24px)] max-h-[calc(100dvh-24px)] overflow-y-auto overscroll-contain rounded-2xl shadow-2xl p-1.5 border border-[var(--theme-border)] bg-[var(--theme-bg-popup)] text-[var(--theme-text-primary)] z-[99999] flex flex-col gap-0.5 transition-all animate-fadeIn"
        dir={lang === "ar" ? "rtl" : "ltr"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Quick Reactions Bar */}
        <div className="flex items-center justify-between px-1 py-1 mb-1 border-b border-[var(--theme-border)]/60">
          {["👍", "❤️", "😂", "😮", "😢", "🔥"].map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onToggleReaction(message.id, emoji);
                onClose();
              }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-accent/20 hover:scale-125 active:scale-95 transition-all cursor-pointer border-0 bg-transparent"
            >
              {emoji}
            </button>
          ))}
          <button
            onClick={(e) => {
              const currentTarget =
                e.currentTarget ||
                (e.target as HTMLElement)?.closest?.("button, div, span") ||
                (e.target as HTMLElement);
              const rect =
                currentTarget && typeof currentTarget.getBoundingClientRect === "function"
                  ? currentTarget.getBoundingClientRect()
                  : null;
              onClose();
              onOpenReactionPicker(message.id, rect);
            }}
            title={lang === "ar" ? "المزيد من التفاعلات" : "More Reactions"}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs hover:bg-accent/20 transition-all cursor-pointer border-0 bg-transparent text-[var(--theme-text-secondary)] hover:text-accent"
          >
            <SmilePlus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Reply Option */}
        <button
          onClick={() => {
            onReply(message);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-left border-0 cursor-pointer transition-all text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]"
        >
          <CornerDownRight className="w-4 h-4 text-accent" />
          <span>{lang === "ar" ? "رد على الرسالة" : "Reply"}</span>
        </button>

        {/* Copy Text Option */}
        {hasTextContent && (
          <button
            onClick={() => {
              onCopyText(message.id, message.content);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-left border-0 cursor-pointer transition-all text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]"
          >
            <Copy className="w-4 h-4 text-[var(--theme-text-muted)]" />
            <span>{lang === "ar" ? "نسخ النص" : "Copy Text"}</span>
          </button>
        )}

        {/* Copy Message Link Option */}
        <button
          onClick={() => {
            onCopyMessageLink(message);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-left border-0 cursor-pointer transition-all text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]"
        >
          <Link2 className="w-4 h-4 text-accent" />
          <span>{lang === "ar" ? "نسخ رابط الرسالة" : "Copy Message Link"}</span>
        </button>

        {/* Copy Full Link Option if message contains a link */}
        {containsUrlMatch && (
          <button
            onClick={() => {
              const match = message.content.match(/(https?:\/\/|www\.)[^\s]+/i);
              if (match) {
                const fullUrl = match[0].startsWith("www.")
                  ? "https://" + match[0]
                  : match[0];
                navigator.clipboard.writeText(fullUrl);
              }
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-left border-0 cursor-pointer transition-all text-cyan-500 hover:bg-cyan-500/10"
          >
            <Download className="w-4 h-4" />
            <span>{lang === "ar" ? "نسخ الرابط الكامل" : "Copy Full Link"}</span>
          </button>
        )}

        {/* Pin / Unpin Option - Server Channels Only */}
        {!isDmChannel && (
          <button
            onClick={() => {
              onTogglePin(message.id);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-left border-0 cursor-pointer transition-all text-amber-500 hover:bg-amber-500/10"
          >
            <Pin className="w-4 h-4" />
            <span>
              {pinnedIds.includes(message.id)
                ? lang === "ar"
                  ? "إلغاء التثبيت"
                  : "Unpin Message"
                : lang === "ar"
                  ? "تثبيت الرسالة"
                  : "Pin Message"}
            </span>
          </button>
        )}

        {/* Report Message Option */}
        <button
          onClick={() => {
            onReport(message);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-left border-0 cursor-pointer transition-all text-amber-500 hover:bg-amber-500/10"
        >
          <Flag className="w-4 h-4" />
          <span>{lang === "ar" ? "إبلاغ" : "Report"}</span>
        </button>

        {/* Edit Option (Restricted to same user who sent them) */}
        {isUserAuthorizedToEdit(message) && (
          <button
            onClick={() => {
              onEdit(message);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-left border-0 cursor-pointer transition-all text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]"
          >
            <Edit3 className="w-4 h-4 text-accent" />
            <span>{lang === "ar" ? "تعديل الرسالة" : "Edit"}</span>
          </button>
        )}

        {/* Delete Option (Restricted to same user who sent them or admin) */}
        {isUserAuthorizedToDelete(message) && (
          <button
            onClick={() => {
              onDelete(message);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-left border-0 cursor-pointer transition-all text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
          >
            <Trash2 className="w-4 h-4" />
            <span>{lang === "ar" ? "حذف الرسالة" : "Delete"}</span>
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
};
export default MessageContextMenu;
