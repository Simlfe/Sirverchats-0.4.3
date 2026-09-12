import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import {
  Channel,
  Message,
  User,
  Server,
  MusicTrack,
  Attachment,
  NotificationItem,
  ServerMember,
  ServerRole,
} from "../types";
import {
  setupTauriFileDropListener,
  openExternalUrl,
  createRealFileFromLocalPath,
  isAndroidPlatform,
  isMobilePlatform,
} from "../lib/nativePlatform";
import { cleanFilename } from "../lib/audioMetadata";
import { useBackHandler } from "../services/backStackManager";
import {
  AudioAttachmentPlayer,
  MultiAudioAttachmentPlayer,
  SmartVideoPlayer,
  SmartYouTubePlayer,
} from "./MusicPlayer";
import Avatar from "./Avatar";
import SmartGifImage from "./SmartGifImage";
import {
  Send,
  Paperclip,
  X,
  CornerDownRight,
  ImageIcon,
  FileText,
  Check,
  Copy,
  Loader2,
  Trash2,
  File,
  Video,
  Play,
  AlertTriangle,
  Menu,
  Edit3,
  Pin,
  PinOff,
  Download,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Palette,
  Bell,
  ArrowDown,
  CheckCircle2,
  XCircle,
  SkipForward,
  Search,
  Aperture,
  Layers,
  Users,
  Volume2,
  Sparkles,
  Zap,
  ShieldCheck,
  RotateCw,
  AlertCircle,
  UploadCloud,
  Music,
  Phone,
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  VideoOff,
  Bold,
  Italic,
  Strikethrough,
  Quote,
  Heading,
  Code,
  SquareCode,
  EyeOff,
  Type,
  Link2,
  Ban,
  Flag,
  Smile,
  SmilePlus,
} from "lucide-react";
import DMCallOverlay from "./DMCallOverlay";
import { ThemeToggle } from "./ThemeToggle";
import {
  SmartInstagramEmbed,
  SmartTikTokEmbed,
  SmartFacebookEmbed,
  SmartRedditEmbed,
} from "./SocialEmbeds";
import { SmartWebLinkPreview } from "./SmartWebLinkPreview";
import { SmartVideoLinkPreview } from "./SmartVideoLinkPreview";
import { MessageLinkPreviewCard, parseMessageLink } from "./MessageLinkPreview";
import ExternalImagePreview, { preloadExternalImage } from "./ExternalImagePreview";
import UploadedImagePreview, { preloadUploadedImage } from "./UploadedImagePreview";
import MessageContextMenu from "./MessageContextMenu";
import AdvancedSearchModal from "./AdvancedSearchModal";
import {
  AttachmentProcessor,
  ProcessedAttachmentItem,
  detectMediaType,
  generateAttachmentId,
  formatFileSize,
  isAttachmentImage,
  isAttachmentVideo,
  isAttachmentAudio,
  isAttachmentUnrenderable,
  inferMimeType,
} from "../services/attachmentProcessor";
import { AttachmentUploadManager } from "../services/attachmentUploadManager";
import { getCachedUserSettings } from "../lib/userSettings";
import { evaluateChannelPermissions } from "../lib/channelPermissions";
import AttachmentDownloadControl from "./AttachmentDownloadControl";
import { useDownloadManager } from "../services/downloadManager";
import { MessageDeletionService } from "../services/messageDeletionService";
import { parseCallLog, formatCallDuration } from "../services/callLogService";
import {
  MessageReactionChips,
  MessageReactionPicker,
  AnchorRect,
  parseReactions,
  QUICK_REACTION_EMOJIS,
  EMOJI_CATEGORIES,
  getReactionTooltip,
} from "./MessageReactions";

export {
  parseReactions,
  QUICK_REACTION_EMOJIS,
  EMOJI_CATEGORIES,
  getReactionTooltip,
};

const isUnrenderableImageFile = (filename: string, mimeType?: string) => {
  return isAttachmentUnrenderable(filename, mimeType);
};

const getImageFormatTitle = (filename: string) => {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".exr")) return "OpenEXR High Dynamic Range Image (.EXR)";
  if (lower.endsWith(".hdr")) return "HDR Radiance RGBE Image (.HDR)";
  if (lower.endsWith(".psd") || lower.endsWith(".psb"))
    return "Adobe Photoshop Document (.PSD)";
  if (lower.endsWith(".tga")) return "Targa Graphics Image (.TGA)";
  if (lower.endsWith(".dds")) return "DirectDraw Surface Texture (.DDS)";
  if (
    [".cr2", ".nef", ".arw", ".dng", ".raf", ".orf"].some((ext) =>
      lower.endsWith(ext),
    )
  )
    return "RAW Camera Digital Negative Image";
  if (lower.endsWith(".tiff") || lower.endsWith(".tif"))
    return "TIFF Uncompressed Image (.TIFF)";
  return "High Quality Graphics Image File";
};

/**
 * Configurable grouping window constant.
 * Default: 5 minutes (300,000 ms)
 */
export const MESSAGE_GROUPING_WINDOW_MS = 5 * 60 * 1000;

// Keep the chat responsive when a channel contains a long history. The
// viewport normally needs only a few dozen rows; rendering a bounded window
// with overscan keeps scrolls smooth without changing the message order.
const VIRTUAL_MAX_ITEMS = 100;
const VIRTUAL_OVERSCAN = 24;

function getSenderId(msg?: Message | null): string {
  if (!msg) return "";
  return (
    msg.expand?.sender?.id ||
    msg.sender ||
    (typeof msg.sender === "string" ? msg.sender : "")
  );
}

function isSameCalendarDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function formatDateDivider(date: Date, lang: string): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameCalendarDay(date, now)) {
    return lang === "ar" ? "اليوم" : "Today";
  }
  if (isSameCalendarDay(date, yesterday)) {
    return lang === "ar" ? "أمس" : "Yesterday";
  }
  return date.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatMessageShortTime(createdString?: string): string {
  if (!createdString) return "";
  const d = new Date(createdString);
  const timeStr = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return toLatinNumerals(timeStr);
}
import { motion, AnimatePresence } from "motion/react";
import {
  pbService,
  getEffectiveProfile,
  getPrimaryServerRole,
  getEffectiveUserStatus,
  mergeUserRecord,
} from "../pocketbase";
import { wsService } from "../services/websocket";
import NotificationsPopover from "./NotificationsPopover";
import PinnedMessagesPopover from "./PinnedMessagesPopover";
import MinimizedVoiceBar from "./MinimizedVoiceBar";
import { toLatinNumerals } from "../lib/utils";
import { messageMatchesParsedSearch, parseMessageSearchQuery } from "../lib/messageSearch";

export interface StagedAttachment {
  id: string;
  file: File;
  previewUrl?: string;
  progress: number;
  status: "uploading" | "ready" | "error" | "cancelled";
  record?: Attachment;
  controller: AbortController;
}

export interface ActiveUploadState {
  messageId?: string;
  tempId: string;
  files: File[];
  currentFileIndex: number;
  currentFileName: string;
  fileProgress: number;
  totalProgress: number;
  abortController: AbortController;
  skipRequested?: boolean;
}

interface CachedConversationState {
  scrollTop: number;
  isAtBottom: boolean;
  inputText: string;
  replyTo: Message | null;
  attachments: File[];
  processedAttachments: ProcessedAttachmentItem[];
  editingMessageId: string | null;
  editingText: string;
  channelSearchQuery: string;
}

const conversationCache = new Map<string, CachedConversationState>();

const isMessageEdited = (msg: Message): boolean => {
  if (msg.edited || msg.edited_at) return true;
  if (msg.created && msg.updated && msg.created !== msg.updated) {
    const createdTime = new Date(msg.created).getTime();
    const updatedTime = new Date(msg.updated).getTime();
    if (!isNaN(createdTime) && !isNaN(updatedTime)) {
      // Exclude initial attachment link / thumbnail updates that occur within 15 seconds of creation
      return updatedTime - createdTime > 15000;
    }
  }
  return false;
};

const revealedSpoilersSet = new Set<string>();

interface SpoilerBadgeProps {
  text: string;
  idKey: string;
  lang: string;
}

const SpoilerBadge: React.FC<SpoilerBadgeProps> = ({ text, idKey, lang }) => {
  const [revealed, setRevealed] = useState(() =>
    revealedSpoilersSet.has(idKey),
  );

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (revealedSpoilersSet.has(idKey)) {
      revealedSpoilersSet.delete(idKey);
      setRevealed(false);
    } else {
      revealedSpoilersSet.add(idKey);
      setRevealed(true);
    }
  };

  return (
    <span
      onClick={toggle}
      className={`px-1.5 py-0.5 rounded transition-all cursor-pointer font-medium inline-block border mx-0.5 select-none ${
        revealed
          ? "bg-slate-800 text-slate-100 border-slate-700"
          : "bg-slate-900 text-slate-900 border-slate-800 shadow-inner select-none"
      }`}
      title={
        revealed
          ? lang === "ar"
            ? "انقر لإخفاء المحتوى"
            : "Click to hide spoiler"
          : lang === "ar"
            ? "انقر لإظهار المحتوى"
            : "Click to reveal spoiler"
      }
    >
      {text}
    </span>
  );
};

interface FormattedMessageContentProps {
  content: string;
  lang?: string;
  renderFormattedContent: (content: string) => React.ReactNode;
}

const FormattedMessageContent = React.memo(
  function FormattedMessageContent({
    content,
    renderFormattedContent,
  }: FormattedMessageContentProps) {
    return <>{renderFormattedContent(content)}</>;
  },
  (prev, next) => prev.content === next.content && prev.lang === next.lang,
);

export type MobileOverlayType =
  "channels" | "members" | "notifications" | "pinned" | null;

interface ChatPanelProps {
  key?: string;
  isActive?: boolean;
  isInitialLoading?: boolean;
  channel: Channel;
  messages: Message[];
  currentUser: User;
  onSendMessage: (
    content: string,
    replyToId?: string,
    attachments?: File[],
    readyAttachments?: Attachment[],
  ) => Promise<void>;
  onDeleteMessage?: (msgId: string) => Promise<void>;
  onEditMessage?: (msgId: string, newContent: string) => Promise<void>;
  onDeleteChannel?: (chanId: string) => Promise<void>;
  onDeleteServer?: () => void;
  t: (key: string) => string;
  lang: "en" | "ar";
  theme?: string;
  onSelectUser?: (user: User, anchor?: any) => void;
  server?: Server;
  onUpdateChannel?: (chan: Channel) => void;
  onUpdateServer?: (srv: Server) => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onStartCall?: (mode?: "voice" | "video" | "screen") => void;
  hasMoreMessages?: boolean;
  isLoadingMore?: boolean;
  onLoadMoreMessages?: () => Promise<void>;
  onTogglePinMessage?: (msgId: string) => Promise<void>;
  onPlayGlobalTrack?: (track: MusicTrack) => void;
  targetMessageId?: string | null;
  onClearTargetMessage?: () => void;
  notificationsList?: NotificationItem[];
  onSelectNotification?: (notif: NotificationItem) => void;
  onMarkAllAsRead?: () => void;
  onClearNotifications?: () => void;
  onAcceptFriendRequest?: (notif: NotificationItem) => void;
  onDeclineFriendRequest?: (notif: NotificationItem) => void;
  activeUpload?: ActiveUploadState | null;
  onSkipUploadFile?: () => void;
  onCancelUploadMessage?: () => void;
  unreadCountOnOpen?: number;
  serverChannels?: Channel[];
  onNavigateToMessageLink?: (
    serverId: string,
    channelId: string,
    messageId: string,
  ) => void;
  activeVoiceChannel?: Channel | null;
  onExpandVoice?: () => void;
  channelsDrawer?: React.ReactNode;
  onCloseDm?: () => void;
  onToggleReaction?: (msgId: string, emoji: string) => Promise<void>;
}

export function isEmojiOnlyMessage(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Immediate rejection: Any text containing letters, numbers, or standard ASCII text characters is NOT emoji-only
  if (
    /[a-zA-Z0-9\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF`~!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(
      trimmed,
    )
  ) {
    return false;
  }

  // Use grapheme segmentation if available
  try {
    if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
      const segmenter = new (Intl as any).Segmenter("en", { granularity: "grapheme" });
      const segments = Array.from(segmenter.segment(trimmed))
        .map((s: any) => s.segment.trim())
        .filter(Boolean);
      if (segments.length === 0 || segments.length > 6) return false;
      const emojiRegex = /^\p{Extended_Pictographic}$/u;
      return segments.every((seg) => emojiRegex.test(seg));
    }
  } catch {}

  // Fallback: Strip spaces, ZWJ, and variation selectors, and test purely pictographic characters
  const clean = trimmed.replace(/[\s\u200D\uFE0E\uFE0F]/g, "");
  if (!clean || clean.length > 20) return false;
  const safeRegex = /^(\p{Extended_Pictographic})+$/u;
  return safeRegex.test(clean);
}

export function getAvatarUrl(user?: User) {
  if (user?.avatar) {
    if (user.avatar.startsWith("blob:") || user.avatar.startsWith("http")) {
      return user.avatar;
    }
    return `${pbService.getServerUrl()}/api/files/users/${user.id}/${user.avatar}`;
  }
  return "";
}

export function getAttachmentUrl(
  recordIdOrAttach: any,
  filename?: string,
  collectionName?: string,
) {
  if (typeof recordIdOrAttach === "object" && recordIdOrAttach !== null) {
    const recordId = recordIdOrAttach.id;
    const fn = recordIdOrAttach.file || filename || "";
    if (
      recordIdOrAttach.url &&
      (recordIdOrAttach.url.startsWith("blob:") ||
        recordIdOrAttach.url.startsWith("data:"))
    ) {
      return recordIdOrAttach.url;
    }
    const coll =
      recordIdOrAttach.collectionName ||
      recordIdOrAttach["@collectionName"] ||
      (recordIdOrAttach.isPrivate ? "private_attachments" : null) ||
      collectionName ||
      "attachments";
    if (!recordId || !fn) return "";
    if (
      fn.startsWith("data:") ||
      fn.startsWith("blob:") ||
      fn.startsWith("http://") ||
      fn.startsWith("https://")
    ) {
      return fn;
    }
    return `${pbService.getServerUrl()}/api/files/${coll}/${recordId}/${fn}`;
  }

  const recordId = recordIdOrAttach;
  const fn = filename || "";
  if (!recordId || !fn) return "";
  if (
    fn.startsWith("data:") ||
    fn.startsWith("blob:") ||
    fn.startsWith("http://") ||
    fn.startsWith("https://")
  ) {
    return fn;
  }
  const coll = collectionName || "attachments";
  return `${pbService.getServerUrl()}/api/files/${coll}/${recordId}/${fn}`;
}

export function getAttachmentThumbnailUrl(attachment: any, size = '480x0') {
  const url = getAttachmentUrl(attachment);
  if (!url || url.startsWith('blob:') || url.startsWith('data:') || !url.includes('/api/files/')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}thumb=${encodeURIComponent(size)}`;
}


function ChatPanel({
  isActive = true,
  isInitialLoading = false,
  channel,
  messages,
  currentUser,
  onSendMessage,
  onDeleteMessage,
  onEditMessage,
  onDeleteChannel,
  t,
  lang,
  theme,
  onSelectUser,
  server,
  onUpdateChannel,
  onUpdateServer,
  isSidebarOpen = false,
  onToggleSidebar,
  onStartCall,
  hasMoreMessages = true,
  isLoadingMore = false,
  onLoadMoreMessages,
  onTogglePinMessage,
  onPlayGlobalTrack,
  targetMessageId,
  onClearTargetMessage,
  notificationsList = [],
  onSelectNotification,
  onMarkAllAsRead,
  onClearNotifications,
  onAcceptFriendRequest,
  onDeclineFriendRequest,
  activeUpload,
  onSkipUploadFile,
  onCancelUploadMessage,
  unreadCountOnOpen = 0,
  serverChannels = [],
  onNavigateToMessageLink,
  activeVoiceChannel,
  onExpandVoice,
  channelsDrawer,
  onCloseDm,
  onToggleReaction,
}: ChatPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const [activeReactionPicker, setActiveReactionPicker] = useState<{
    messageId: string;
    anchorRect: AnchorRect;
  } | null>(null);

  const handleOpenReactionPicker = useCallback(
    (msgId: string, e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      const currentTarget = e.currentTarget || (e.target as HTMLElement)?.closest?.("button, div, span") || (e.target as HTMLElement);
      if (!currentTarget || typeof currentTarget.getBoundingClientRect !== "function") return;
      const rect = currentTarget.getBoundingClientRect();
      if (!rect) return;

      setActiveReactionPicker((prev) => {
        if (prev?.messageId === msgId) return null;
        return {
          messageId: msgId,
          anchorRect: {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          },
        };
      });
    },
    [],
  );

  const [copiedMsgLinkId, setCopiedMsgLinkId] = useState<string | null>(null);
  const [showAdvancedSearchModal, setShowAdvancedSearchModal] = useState(false);

  const channelPerms = React.useMemo(
    () => evaluateChannelPermissions(channel, currentUser, server || null),
    [channel, currentUser, server],
  );

  const handleCopyMessageLink = React.useCallback(
    (msg: Message) => {
      const serverId = server?.id || "dm";
      const msgLink = `https://sirverdata.top/#/server/${serverId}/channel/${channel.id}/message/${msg.id}`;
      navigator.clipboard.writeText(msgLink);
      setCopiedMsgLinkId(msg.id);
      setTimeout(() => setCopiedMsgLinkId(null), 2500);
    },
    [server?.id, channel.id],
  );

  // Pause playing video/audio media when panel transitions to background
  useEffect(() => {
    if (!isActive && panelRef.current) {
      const mediaElements =
        panelRef.current.querySelectorAll<HTMLMediaElement>("video, audio");
      mediaElements.forEach((media) => {
        if (!media.paused) {
          media.pause();
        }
      });
    }
  }, [isActive]);

  const isAdmin =
    currentUser?.role === "admin" || (currentUser as any)?.isAdmin === true;
  const { getDownloadByAttachmentId } = useDownloadManager();
  const [unreadSeparatorMsgId, setUnreadSeparatorMsgId] = useState<
    string | null
  >(null);
  const lastChannelIdRef = useRef<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [hasTextSelection, setHasTextSelection] = useState(false);

  const checkTextSelection = useCallback(() => {
    const ta = textInputRef.current;
    if (ta) {
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const isSelected = end > start;
      setHasTextSelection((prev) => (prev !== isSelected ? isSelected : prev));
    }
  }, []);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [processedAttachments, setProcessedAttachments] = useState<
    ProcessedAttachmentItem[]
  >([]);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const handleCopyMessageText = React.useCallback((msgId: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => {
      setCopiedMsgId((prev) => (prev === msgId ? null : prev));
    }, 2000);
  }, []);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null,
  );
  const [activeMenuMessage, setActiveMenuMessage] = useState<Message | null>(
    null,
  );
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showCallOptionsDropdown, setShowCallOptionsDropdown] = useState(false);
  const [showPinnedDrawer, setShowPinnedDrawer] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() =>
    pbService.getPinnedMessageIds(channel.id),
  );
  const [galleryState, setGalleryState] = useState<{
    list: any[];
    initialIndex: number;
  } | null>(null);
  const [gridGalleryList, setGridGalleryList] = useState<Attachment[] | null>(
    null,
  );
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [showNotificationsPopover, setShowNotificationsPopover] =
    useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [channelSearchQuery, setChannelSearchQuery] = useState("");
  const [isInitialLoadReady, setIsInitialLoadReady] = useState(false);

  // Blocked user messages reveal state
  const [revealedBlockedMsgIds, setRevealedBlockedMsgIds] = useState<Set<string>>(new Set());

  const toggleRevealBlockedCluster = React.useCallback((msgIds: string[]) => {
    setRevealedBlockedMsgIds((prev) => {
      const next = new Set(prev);
      const isAnyRevealed = msgIds.some((id) => next.has(id));
      if (isAnyRevealed) {
        msgIds.forEach((id) => next.delete(id));
      } else {
        msgIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, []);

  const toggleRevealBlockedMessage = React.useCallback((msgId: string) => {
    toggleRevealBlockedCluster([msgId]);
  }, [toggleRevealBlockedCluster]);

  // Message report modal states
  const [showReportMessageModal, setShowReportMessageModal] = useState<boolean>(false);
  const [reportMessageTarget, setReportMessageTarget] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState<string>("");
  const [reportDetails, setReportDetails] = useState<string>("");
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);
  const [reportSuccessMsg, setReportSuccessMsg] = useState<string>("");

  const blockedUserIdsSet = React.useMemo(() => {
    const list1 = Array.isArray(currentUser?.blocked_users) ? currentUser.blocked_users : [];
    const list2 = Array.isArray((pbService.getCurrentUser() as any)?.blocked_users)
      ? (pbService.getCurrentUser() as any).blocked_users
      : [];
    const settings = getCachedUserSettings();
    const list3 = Array.isArray(settings?.privacy?.blockedUsers) ? settings.privacy.blockedUsers : [];
    return new Set<string>([...list1, ...list2, ...list3].filter(Boolean));
  }, [currentUser?.blocked_users]);

  const handleSendMessageReport = async () => {
    if (!reportReason.trim() || !reportMessageTarget || isSubmittingReport) return;
    setIsSubmittingReport(true);
    try {
      const senderId =
        reportMessageTarget.sender ||
        reportMessageTarget.expand?.sender?.id ||
        (reportMessageTarget as any).user_id ||
        "";
      await pbService.createReport({
        reportedUserId: senderId,
        reason: reportReason.trim(),
        details: reportDetails.trim(),
        serverId: channel.server === "dm" ? "" : channel.server,
        channelId: channel.id,
        messageId: reportMessageTarget.id,
        targetType: "admin",
      });
      setReportSuccessMsg(
        lang === "ar" ? "تم إرسال بلاغك بنجاح." : "Report submitted successfully."
      );
      setTimeout(() => {
        setShowReportMessageModal(false);
        setReportMessageTarget(null);
        setReportSuccessMsg("");
        setReportReason("");
        setReportDetails("");
      }, 1500);
    } catch (err) {
      console.error("Failed to submit message report:", err);
    } finally {
      setIsSubmittingReport(false);
    }
  };
  const prevChannelIdRef = useRef<string>(channel.id);
  const isInitialScrollPendingRef = useRef<boolean>(true);
  const initialChannelLoadLockRef = useRef<{ chanId: string; active: boolean }>({
    chanId: channel.id,
    active: true,
  });

  const lastScrollTopRef = useRef<number>(0);
  const isAtBottomRef = useRef<boolean>(true);
  const hasInitialScrolledChanIdRef = useRef<string | null>(null);
  const panelResizeAnchorRef = useRef<{
    anchorMsgId: string;
    anchorOffsetTop: number;
  } | null>(null);

  const getLiveViewportAnchor = React.useCallback((): {
    anchorMsgId: string;
    anchorOffsetTop: number;
  } | null => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return null;

    const scrollTop = scrollEl.scrollTop;
    const messageNodes = scrollEl.querySelectorAll<HTMLElement>('[id^="msg-"]');
    for (let i = 0; i < messageNodes.length; i++) {
      const el = messageNodes[i];
      const top = el.offsetTop;
      const height = el.offsetHeight;
      if (top + height > scrollTop) {
        return {
          anchorMsgId: el.id,
          anchorOffsetTop: top - scrollTop,
        };
      }
    }
    return null;
  }, []);

  const restoreViewportAnchor = React.useCallback(
    (anchor: { anchorMsgId: string; anchorOffsetTop: number } | null) => {
      const scrollEl = scrollRef.current;
      if (!scrollEl || !anchor) return;

      let anchorEl: HTMLElement | null = null;
      try {
        anchorEl = scrollEl.querySelector<HTMLElement>(
          `[id="${anchor.anchorMsgId}"]`,
        );
      } catch {
        anchorEl = document.getElementById(anchor.anchorMsgId);
      }

      if (anchorEl) {
        scrollEl.scrollTop = anchorEl.offsetTop - anchor.anchorOffsetTop;
      }
    },
    [],
  );

  type ScrollSource =
    "user" | "newMessage" | "loadMore" | "initial" | "mediaLoad";
  const isManualScrollingRef = useRef<boolean>(false);
  const scrollAnimationTimeoutRef = useRef<NodeJS.Timeout | number | null>(
    null,
  );

  const executeScroll = (
    source: ScrollSource,
    options?: { smooth?: boolean; targetTop?: number },
  ) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    if (scrollAnimationTimeoutRef.current) {
      clearTimeout(scrollAnimationTimeoutRef.current as any);
      scrollAnimationTimeoutRef.current = null;
    }

    if (source === "user") {
      isManualScrollingRef.current = true;
      setShowScrollToBottom(false);
      isAtBottomRef.current = true;

      // Jump virtualizer directly to newest message window (constant-time O(1) jump)
      if (sortedMessages.length > 0) {
        virtualRangeRef.current = {
          startIndex: Math.max(0, sortedMessages.length - 35),
          endIndex: sortedMessages.length - 1,
        };
      }

      const target = options?.targetTop ?? scrollEl.scrollHeight;

      scrollEl.scrollTo({
        top: target,
        behavior: options?.smooth !== false ? "smooth" : "auto",
      });

      const finishScroll = () => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        isManualScrollingRef.current = false;
        isAtBottomRef.current = true;
      };

      if ("onscrollend" in window) {
        const handleScrollEnd = () => {
          scrollEl.removeEventListener("scrollend", handleScrollEnd);
          finishScroll();
        };
        scrollEl.addEventListener("scrollend", handleScrollEnd, { once: true });
      }

      scrollAnimationTimeoutRef.current = setTimeout(() => {
        finishScroll();
      }, 350);

      return;
    }

    if (isManualScrollingRef.current) {
      return;
    }

    if (source === "initial") {
      const applyInitialScroll = () => {
        if (!scrollRef.current) return;
        const scrollEl = scrollRef.current;
        const maxScrollTop = Math.max(
          0,
          scrollEl.scrollHeight - scrollEl.clientHeight,
        );
        const target =
          typeof options?.targetTop === "number"
            ? options.targetTop
            : maxScrollTop;
        scrollEl.scrollTop = target;
        const atBottom =
          typeof options?.targetTop === "number"
            ? target >= maxScrollTop - 35
            : true;
        isAtBottomRef.current = atBottom;
        lastScrollTopRef.current = scrollEl.scrollTop;
      };

      applyInitialScroll();
      setIsInitialLoadReady(true);
      requestAnimationFrame(() => {
        applyInitialScroll();
        if (initialChannelLoadLockRef.current.chanId === channel.id) {
          initialChannelLoadLockRef.current.active = false;
        }
      });
      return;
    }

    if (source === "newMessage") {
      scrollEl.scrollTop = scrollEl.scrollHeight;
      isAtBottomRef.current = true;
      lastScrollTopRef.current = scrollEl.scrollTop;
      return;
    }

    if (source === "mediaLoad") {
      if (
        scrollEl &&
        (isInitialScrollPendingRef.current ||
          (initialChannelLoadLockRef.current.active &&
            initialChannelLoadLockRef.current.chanId === channel.id))
      ) {
        scrollEl.scrollTop = Math.max(
          0,
          scrollEl.scrollHeight - scrollEl.clientHeight,
        );
        lastScrollTopRef.current = scrollEl.scrollTop;
      }
      return;
    }

    if (source === "loadMore") {
      if (typeof options?.targetTop === "number") {
        scrollEl.scrollTop = options.targetTop;
      }
      return;
    }
  };

  const isFetchingMoreRef = useRef<boolean>(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const isPanelAnimatingRef = useRef<boolean>(false);
  const itemHeightsRef = useRef<Map<string, number>>(new Map());
  const virtualRangeRef = useRef({
    startIndex: 0,
    endIndex: VIRTUAL_MAX_ITEMS + VIRTUAL_OVERSCAN - 1,
  });

  useEffect(() => {
    itemHeightsRef.current.clear();
    virtualRangeRef.current = {
      startIndex: 0,
      endIndex: VIRTUAL_MAX_ITEMS + VIRTUAL_OVERSCAN - 1,
    };
  }, [channel.id]);

  const handleLoadMore = React.useCallback(async () => {
    if (
      !onLoadMoreMessages ||
      isLoadingMore ||
      isFetchingMoreRef.current ||
      isManualScrollingRef.current ||
      !hasMoreMessages
    )
      return;
    isFetchingMoreRef.current = true;

    if (scrollRef.current) {
      const liveAnchor = getLiveViewportAnchor();
      if (liveAnchor) {
        loadMoreScrollAnchorRef.current = {
          prevScrollHeight: scrollRef.current.scrollHeight,
          prevScrollTop: scrollRef.current.scrollTop,
          anchorMsgId: liveAnchor.anchorMsgId,
          anchorOffsetTop: liveAnchor.anchorOffsetTop,
        };
      } else {
        const messageNodes =
          scrollRef.current.querySelectorAll<HTMLElement>('[id^="msg-"]');
        let firstVisEl: HTMLElement | null = null;
        for (let i = 0; i < messageNodes.length; i++) {
          const el = messageNodes[i];
          if (el.offsetTop + el.offsetHeight > scrollRef.current.scrollTop) {
            firstVisEl = el;
            break;
          }
        }
        loadMoreScrollAnchorRef.current = {
          prevScrollHeight: scrollRef.current.scrollHeight,
          prevScrollTop: scrollRef.current.scrollTop,
          anchorMsgId: firstVisEl ? firstVisEl.id : messageNodes[0]?.id || null,
          anchorOffsetTop: firstVisEl
            ? firstVisEl.offsetTop - scrollRef.current.scrollTop
            : 0,
        };
      }
    }

    try {
      await onLoadMoreMessages();
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      setTimeout(() => {
        isFetchingMoreRef.current = false;
      }, 400);
    }
  }, [
    onLoadMoreMessages,
    isLoadingMore,
    hasMoreMessages,
    getLiveViewportAnchor,
  ]);

  // A top sentinel makes older-history loading deterministic on touch devices
  // where a scroll event can skip the pixel threshold. The callback remains
  // single-flight guarded by handleLoadMore.
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Searching is intentionally local to the loaded/cache window. Do
        // not let the sentinel start an unbounded history waterfall while a
        // user is typing; the explicit "load older" action remains available.
        if (!channelSearchQuery.trim() && entries.some((entry) => entry.isIntersecting)) {
          void handleLoadMore();
        }
      },
      { root, rootMargin: '500px 0px 0px 0px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [channel.id, channelSearchQuery, handleLoadMore]);

  const preloadedMediaUrlsRef = useRef<Set<string>>(new Set());
  const preloadMediaForRangeRef = useRef<(startIdx: number, endIdx: number) => void>(() => {});

  const scrollRafRef = useRef<number | null>(null);
  const updateVirtualRangeRef = useRef<
    (scrollTop: number, viewportHeight: number, force?: boolean) => void
  >(() => {});

  const handleScrollFeed = (e?: React.UIEvent<HTMLDivElement>) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    if (
      initialChannelLoadLockRef.current.active &&
      initialChannelLoadLockRef.current.chanId === channel.id
    ) {
      isAtBottomRef.current = true;
      lastScrollTopRef.current = scrollEl.scrollTop;
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = scrollEl;
    const distFromBottom = scrollHeight - clientHeight - scrollTop;

    // Proactively preload media ahead of scroll position so they are ready before the scroll reaches them
    if (scrollHeight > 0) {
      const approxRatio = Math.max(0, Math.min(1, scrollTop / (scrollHeight - clientHeight || 1)));
      const approxTotal = scrollHeight / 80;
      const centerIndex = Math.round(approxRatio * approxTotal);
      preloadMediaForRangeRef.current(centerIndex - 2, centerIndex + 4);
    }

    // Synchronously check if user is scrolling upward or moving away from bottom
    const isScrollingUp =
      lastScrollTopRef.current > 0 && scrollTop < lastScrollTopRef.current - 2;

    let isAtBottom = false;
    if (isScrollingUp) {
      // Immediately suspend automatic scrolling as soon as user explicitly moves upward
      isAtBottom = false;
      isInitialScrollPendingRef.current = false;
    } else if (isInitialScrollPendingRef.current) {
      isAtBottom = true;
    } else {
      // Considered at bottom when scrolling down or sitting within threshold or maintaining bottom position during content expansion
      isAtBottom =
        distFromBottom <= 35 ||
        (isAtBottomRef.current && distFromBottom <= 120);
    }

    // Immediately update ref synchronously to prevent race conditions during scroll frame
    isAtBottomRef.current = isAtBottom;

    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (!scrollRef.current) return;

      // Recalculate the bounded message window from the live scroll position.
      // This is deliberately done inside the existing scroll RAF so the
      // handler never causes one React update per native scroll event.
      updateVirtualRangeRef.current(scrollTop, clientHeight);

      if (!isManualScrollingRef.current) {
        const shouldShow = !isAtBottom && sortedMessages.length > 5;
        setShowScrollToBottom((prev) =>
          prev !== shouldShow ? shouldShow : prev,
        );
      }

      // Auto-load older messages in background proactively before reaching the top
      const preloadThreshold = Math.min(500, Math.max(300, scrollRef.current.clientHeight * 0.7));

      if (
        !isAtBottom &&
        !isInitialScrollPendingRef.current &&
        !initialChannelLoadLockRef.current.active &&
        scrollTop < preloadThreshold &&
        hasMoreMessages &&
        !isLoadingMore &&
        !isFetchingMoreRef.current &&
        !isManualScrollingRef.current
      ) {
        handleLoadMore();
      }

      lastScrollTopRef.current = scrollTop;

      // Cache live scroll offset per channel (skip during initial scroll restoration to prevent overwriting with 0)
      if (!isInitialScrollPendingRef.current) {
        const existing = conversationCache.get(channel.id);
        if (existing) {
          existing.scrollTop = scrollTop;
          existing.isAtBottom = isAtBottom;
        } else {
          conversationCache.set(channel.id, {
            scrollTop,
            isAtBottom,
            inputText,
            replyTo,
            attachments,
            processedAttachments,
            editingMessageId,
            editingText,
            channelSearchQuery,
          });
        }
      }
    });
  };

  // Preserve scroll stability on container layout resizes (sidebar toggle, member list toggle, window resize)
  useEffect(() => {
    if (!scrollRef.current) return;
    const scrollEl = scrollRef.current;
    let rafId: number;
    let prevWidth = scrollEl.clientWidth;
    let prevHeight = scrollEl.clientHeight;

    const observer = new ResizeObserver(() => {
      rafId = requestAnimationFrame(() => {
        if (!scrollEl) return;
        const widthChanged = Math.abs(scrollEl.clientWidth - prevWidth) > 1;
        const heightChanged =
          Math.abs(scrollEl.clientHeight - prevHeight) > 1;
        prevWidth = scrollEl.clientWidth;
        prevHeight = scrollEl.clientHeight;

        if (widthChanged) {
          if (isAtBottomRef.current) {
            scrollEl.scrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
          } else {
            const anchor =
              panelResizeAnchorRef.current || getLiveViewportAnchor();
            restoreViewportAnchor(anchor);
          }
        } else if (heightChanged) {
          // If height changed (e.g. textarea expanding, reply box opening, window height change),
          // only maintain bottom if the user was actively sitting at the bottom.
          // If the user was scrolled up reading or looking at messages, native overflow-anchor holds the scroll static without pushing.
          if (isAtBottomRef.current) {
            scrollEl.scrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
          }
        }
      });
    });

    observer.observe(scrollEl);
    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [channel.id]);

  // Focus & highlight target notification message
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);

  const scrollToMessage = (msgId: string) => {
    if (!msgId) return;
    setFocusedMessageId(msgId);
    setTimeout(() => {
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
    setTimeout(() => setFocusedMessageId(null), 3500);
  };

  // User settings state for chat
  const [chatSettings, setChatSettings] = useState(
    () => getCachedUserSettings().chat,
  );

  useEffect(() => {
    const handleSettingsChange = (e: any) => {
      if (e.detail?.chat) {
        setChatSettings(e.detail.chat);
      } else {
        setChatSettings(getCachedUserSettings().chat);
      }
    };
    window.addEventListener("user-settings-changed", handleSettingsChange);
    return () =>
      window.removeEventListener("user-settings-changed", handleSettingsChange);
  }, []);

  // Subscribe to background AttachmentUploadManager updates
  useEffect(() => {
    const unsubscribe = AttachmentUploadManager.subscribe((uploadsMap) => {
      setProcessedAttachments((prev) => {
        if (prev.length === 0) return prev;
        let changed = false;
        const next = prev.map((item) => {
          const upload = uploadsMap.get(item.id);
          if (!upload) return item;

          if (
            item.uploadStatus !== upload.status ||
            item.uploadProgress !== upload.progress ||
            item.uploadError !== upload.error ||
            item.uploadedAttachment !== upload.attachment
          ) {
            changed = true;
            return {
              ...item,
              uploadStatus: upload.status,
              uploadProgress: upload.progress,
              uploadError: upload.error,
              uploadedAttachment: upload.attachment,
            };
          }
          return item;
        });
        return changed ? next : prev;
      });
    });
    return unsubscribe;
  }, []);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<User[]>([]);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [notFoundNotice, setNotFoundNotice] = useState<{
    username: string;
    x: number;
    y: number;
  } | null>(null);

  // Responsive desktop check
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth >= 768,
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Is DM Channel Check
  const isDmChannel = React.useMemo(() => {
    if (channel.server === "dm" || (channel as any).server_id === "dm")
      return true;
    if (channel.id.startsWith("dm-") || channel.id.startsWith("private-"))
      return true;
    if (channel.name?.startsWith("@")) return true;
    if ((channel as any).recipientId || (channel as any).recipientUser)
      return true;
    if (server) {
      const sId = (server.id || "").toLowerCase();
      const sName = (server.name || "").toLowerCase();
      if (
        sId === "dm" ||
        sId === "dms" ||
        sName.includes("direct messages") ||
        sName.includes("الرسائل الخاصة") ||
        sName === "dm" ||
        sName === "dms"
      )
        return true;
    }
    return false;
  }, [server, channel]);

  const handleToggleReaction = useCallback(
    async (msgId: string, emoji: string) => {
      if (onToggleReaction) {
        await onToggleReaction(msgId, emoji);
      } else {
        try {
          await pbService.toggleMessageReaction(msgId, emoji, isDmChannel);
        } catch (err) {
          console.warn("Failed to toggle reaction:", err);
        }
      }
    },
    [onToggleReaction, isDmChannel],
  );

  // Helper to read saved member list preference (DEFAULT CLOSED)
  const getSavedMemberListPref = (): boolean => {
    try {
      const pref = localStorage.getItem("sirverdata_pc_members_panel_open");
      if (pref !== null) return pref === "true";
      const oldPref = localStorage.getItem("sirver_member_list_open_pref");
      if (oldPref !== null) return oldPref === "true";
      const legacy = localStorage.getItem("sirver_member_list_open");
      if (legacy !== null) return legacy === "true";
      return false; // Default closed
    } catch {
      return false;
    }
  };

  // Track explicit user toggle action to avoid replaying mount animations on channel switch
  const wasExplicitlyToggledRef = useRef<boolean>(false);

  // Client-local member list preference state (Default CLOSED on all devices)
  const [localMemberListOpen, setLocalMemberListOpen] = useState<boolean>(() =>
    getSavedMemberListPref(),
  );

  useEffect(() => {
    const handlePrefChange = (e: any) => {
      const targetOpen =
        typeof e?.detail === "boolean"
          ? e.detail
          : typeof e?.detail?.open === "boolean"
            ? e.detail.open
            : getSavedMemberListPref();

      if (e?.detail?.sourceId && e.detail.sourceId === channel?.id) {
        return;
      }
      setLocalMemberListOpen((prev) => (prev === targetOpen ? prev : targetOpen));
    };
    window.addEventListener("sirverdata_pc_members_panel_changed", handlePrefChange);
    window.addEventListener("storage", handlePrefChange);
    return () => {
      window.removeEventListener("sirverdata_pc_members_panel_changed", handlePrefChange);
      window.removeEventListener("storage", handlePrefChange);
    };
  }, [channel?.id]);

  // Mobile Single Active Overlay Panel State Machine
  const [activeOverlay, setActiveOverlay] = useState<MobileOverlayType>(null);

  // Sync isSidebarOpen prop with mobile activeOverlay state
  useEffect(() => {
    if (!isDesktop) {
      if (isSidebarOpen && activeOverlay !== "channels") {
        setActiveOverlay("channels");
      } else if (!isSidebarOpen && activeOverlay === "channels") {
        setActiveOverlay(null);
      }
    }
  }, [isSidebarOpen, isDesktop]);

  const handleCloseAllOverlays = useCallback(() => {
    if (!isDesktop) {
      setActiveOverlay(null);
      if (isSidebarOpen) {
        onToggleSidebar?.();
      }
    }
  }, [isDesktop, isSidebarOpen, onToggleSidebar]);

  // Members panel is strictly hidden in Direct Messages, and reflects global local preference in server channels
  const showMemberList = !isDmChannel && localMemberListOpen;

  const toggleMemberList = useCallback(() => {
    wasExplicitlyToggledRef.current = true;
    setLocalMemberListOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sirverdata_pc_members_panel_open", String(next));
        localStorage.setItem("sirver_member_list_open_pref", String(next));
        localStorage.setItem("sirver_member_list_open", String(next));
      } catch {}
      queueMicrotask(() => {
        window.dispatchEvent(
          new CustomEvent("sirverdata_pc_members_panel_changed", {
            detail: { open: next, sourceId: channel?.id },
          })
        );
      });
      return next;
    });
  }, [channel?.id]);

  const setMemberListOpen = useCallback((open: boolean) => {
    wasExplicitlyToggledRef.current = true;
    setLocalMemberListOpen(open);
    try {
      localStorage.setItem("sirverdata_pc_members_panel_open", String(open));
      localStorage.setItem("sirver_member_list_open_pref", String(open));
      localStorage.setItem("sirver_member_list_open", String(open));
    } catch {}
    window.dispatchEvent(
      new CustomEvent("sirverdata_pc_members_panel_changed", {
        detail: { open, sourceId: channel?.id },
      })
    );
  }, [channel?.id]);

  // Centralized single-panel mobile overlay toggle logic
  const toggleOverlay = useCallback(
    (target: MobileOverlayType) => {
      if (isDesktop) {
        if (target === "members") {
          toggleMemberList();
        } else if (target === "notifications") {
          setShowNotificationsPopover((prev) => !prev);
        } else if (target === "pinned") {
          setShowPinnedDrawer((prev) => !prev);
        }
        return;
      }

      if (activeOverlay === target) {
        // Toggle same panel -> Close immediately
        setActiveOverlay(null);
        if (target === "channels" && isSidebarOpen) {
          onToggleSidebar?.();
        }
        return;
      }

      // Switch directly to target overlay
      setActiveOverlay(target);
      if (target === "channels") {
        if (!isSidebarOpen) {
          onToggleSidebar?.();
        }
      } else if (isSidebarOpen) {
        onToggleSidebar?.();
      }
    },
    [
      activeOverlay,
      isDesktop,
      isSidebarOpen,
      onToggleSidebar,
      toggleMemberList,
    ],
  );

  // Capture current visible message viewport anchor when MemberList opens or closes
  useEffect(() => {
    if (scrollRef.current) {
      if (isAtBottomRef.current) {
        panelResizeAnchorRef.current = null;
      } else {
        panelResizeAnchorRef.current = getLiveViewportAnchor();
      }
    }
  }, [showMemberList, getLiveViewportAnchor]);

  // High-performance touch gesture swipe handling for Mobile (Channel sidebar & Member list drawer)
  const [memberListDragState, setMemberListDragState] = useState<{
    isDragging: boolean;
    dragX: number;
    opacity: number;
  }>({ isDragging: false, dragX: 0, opacity: 0 });

  const memberListTouchRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    axis: "horizontal" | "vertical" | null;
    initialIsOpen: boolean;
    active: boolean;
  } | null>(null);

  // Native 1:1 Edge & Drag Gesture Manager for Mobile Member List Drawer
  useEffect(() => {
    if (isDesktop || isDmChannel) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 768) return;
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;
      const isRtl = lang === "ar";
      const edgeThreshold = 35;

      let isTriggerable = false;

      if (!showMemberList) {
        if (isRtl) {
          if (startX <= edgeThreshold) isTriggerable = true;
        } else {
          if (startX >= window.innerWidth - edgeThreshold) isTriggerable = true;
        }
      } else {
        isTriggerable = true;
      }

      if (isTriggerable) {
        memberListTouchRef.current = {
          startX,
          startY,
          lastX: startX,
          lastTime: Date.now(),
          axis: null,
          initialIsOpen: showMemberList,
          active: true,
        };
        window.addEventListener("touchmove", handleTouchMove, { passive: false });
        window.addEventListener("touchend", handleTouchEnd, { passive: true });
        window.addEventListener("touchcancel", handleTouchEnd, { passive: true });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!memberListTouchRef.current || !memberListTouchRef.current.active)
        return;
      const state = memberListTouchRef.current;
      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - state.startX;
      const deltaY = touch.clientY - state.startY;

      if (state.axis === null) {
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
          state.axis = "vertical";
          state.active = false;
          window.removeEventListener("touchmove", handleTouchMove);
          window.removeEventListener("touchend", handleTouchEnd);
          window.removeEventListener("touchcancel", handleTouchEnd);
          return;
        } else if (
          Math.abs(deltaX) > Math.abs(deltaY) &&
          Math.abs(deltaX) > 8
        ) {
          state.axis = "horizontal";
        }
      }

      if (state.axis === "horizontal") {
        if (e.cancelable) e.preventDefault();
        state.lastX = touch.clientX;
        state.lastTime = Date.now();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);

      if (!memberListTouchRef.current || !memberListTouchRef.current.active)
        return;
      const state = memberListTouchRef.current;
      memberListTouchRef.current = null;

      if (state.axis !== "horizontal") {
        return;
      }

      const touch = e.changedTouches[0];
      const endX = touch ? touch.clientX : state.lastX;
      const elapsedTime = Math.max(1, Date.now() - state.lastTime);
      const velocityX = (endX - state.lastX) / elapsedTime;
      const totalDeltaX = endX - state.startX;
      const isRtl = lang === "ar";

      let shouldOpen = state.initialIsOpen;

      if (!isRtl) {
        if (!state.initialIsOpen) {
          if (totalDeltaX < -100 || velocityX < -0.3) shouldOpen = true;
        } else {
          if (totalDeltaX > 100 || velocityX > 0.3) shouldOpen = false;
        }
      } else {
        if (!state.initialIsOpen) {
          if (totalDeltaX > 100 || velocityX > 0.3) shouldOpen = true;
        } else {
          if (totalDeltaX < -100 || velocityX < -0.3) shouldOpen = false;
        }
      }

      if (shouldOpen !== state.initialIsOpen) {
        toggleOverlay("members");
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [showMemberList, isDesktop, isDmChannel, lang]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showMemberList) {
        setMemberListOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showMemberList]);

  // Track Shift key for message actions toolbar visibility
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftPressed(false);
      }
    };
    const handleWindowBlur = () => {
      setIsShiftPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  // Register LIFO Back Stack handlers for temporary overlays
  useBackHandler("chat-gallery-modal", Boolean(galleryState), () =>
    setGalleryState(null),
  );
  useBackHandler("chat-grid-gallery-modal", Boolean(gridGalleryList), () =>
    setGridGalleryList(null),
  );
  useBackHandler("chat-menu-message", Boolean(activeMenuMessage), () => {
    setActiveMenuMessage(null);
    setMenuPosition(null);
  });
  useBackHandler("chat-deleting-message", Boolean(deletingMessageId), () =>
    setDeletingMessageId(null),
  );
  useBackHandler("chat-editing-message", Boolean(editingMessageId), () =>
    setEditingMessageId(null),
  );
  useBackHandler(
    "chat-pinned-drawer",
    isDesktop ? showPinnedDrawer : activeOverlay === "pinned",
    () => (isDesktop ? setShowPinnedDrawer(false) : handleCloseAllOverlays()),
  );
  useBackHandler(
    "chat-notifications-popover",
    isDesktop ? showNotificationsPopover : activeOverlay === "notifications",
    () =>
      isDesktop ? setShowNotificationsPopover(false) : handleCloseAllOverlays(),
  );
  useBackHandler(
    "chat-member-list-mobile",
    !isDesktop && activeOverlay === "members",
    () => handleCloseAllOverlays(),
  );
  useBackHandler(
    "chat-channels-mobile",
    activeOverlay === "channels" && !isDesktop,
    () => handleCloseAllOverlays(),
  );
  useBackHandler("chat-search-query", Boolean(channelSearchQuery), () =>
    setChannelSearchQuery(""),
  );

  // Preserve last non-null server to allow smooth closing exit animation when switching to DM
  const lastServerRef = useRef<any>(server);
  useEffect(() => {
    if (server && server.id && server.id !== "dm") {
      lastServerRef.current = server;
    }
  }, [server]);
  const displayServer = React.useMemo(() => {
    if (server && server.id && server.id !== "dm") return server;
    if (lastServerRef.current && lastServerRef.current.id && lastServerRef.current.id !== "dm") return lastServerRef.current;
    if (channel.server && channel.server !== "dm") {
      const cached = pbService.getCachedServers?.()?.find((s: Server) => s.id === channel.server);
      if (cached) return cached;
      return { id: channel.server, name: channel.name || "Server" } as Server;
    }
    return undefined;
  }, [server, channel]);

  const targetServerId = displayServer?.id || (channel.server !== "dm" ? channel.server : undefined);

  // Member Search Query & Scroll Ref
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const memberListScrollRef = useRef<HTMLDivElement>(null);
  const memberListScrollTopRef = useRef<number>(0);

  const handleMemberListScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    memberListScrollTopRef.current = e.currentTarget.scrollTop;
  }, []);

  const handleCloseMemberList = React.useCallback(() => {
    setMemberListOpen(false);
  }, []);

  useEffect(() => {
    if (showMemberList && memberListScrollRef.current) {
      memberListScrollRef.current.scrollTop = memberListScrollTopRef.current;
    }
  }, [showMemberList]);

  // Server Members & Roles state with instant cache hydration
  const [serverMembers, setServerMembers] = useState<ServerMember[]>(() =>
    targetServerId && targetServerId !== "dm" ? pbService.getCachedServerMembers(targetServerId) : []
  );
  const [serverRoles, setServerRoles] = useState<ServerRole[]>(() =>
    targetServerId && targetServerId !== "dm" ? pbService.getCachedServerRoles(targetServerId) : []
  );
  const [allUsersList, setAllUsersList] = useState<User[]>(() =>
    pbService.getCachedUsers()
  );

  const allUsersMap = React.useMemo(() => {
    const map = new Map<string, User>();
    for (const u of allUsersList) {
      if (u?.id) map.set(u.id, u);
    }
    return map;
  }, [allUsersList]);

  const userNameLookupMap = React.useMemo(() => {
    const map = new Map<string, User>();
    for (const u of allUsersList) {
      if (u.username) map.set(u.username.toLowerCase(), u);
      if (u.display_name) map.set(u.display_name.toLowerCase(), u);
    }
    return map;
  }, [allUsersList]);

  const loadServerMembersData = React.useCallback(
    async (forceRefresh = false) => {
      const sId = targetServerId;
      if (!sId || sId === "dm") {
        setServerMembers([]);
        setServerRoles([]);
        return;
      }

      // Synchronously hydrate from cache if not yet set
      const cMembers = pbService.getCachedServerMembers(sId);
      if (cMembers.length > 0) {
        setServerMembers((prev) => (prev.length === 0 ? cMembers : prev));
      }
      const cRoles = pbService.getCachedServerRoles(sId);
      if (cRoles.length > 0) {
        setServerRoles((prev) => (prev.length === 0 ? cRoles : prev));
      }
      const cUsers = pbService.getCachedUsers();
      if (cUsers.length > 0) {
        setAllUsersList((prev) => (prev.length === 0 ? cUsers : prev));
      }

      // Non-blocking parallel background sync with independent progressive updates
      pbService.fetchServerRoles(sId).then((rList) => {
        if (rList && rList.length > 0) setServerRoles(rList);
      }).catch(() => {});

      pbService.fetchServerMembers(sId).then((mList) => {
        if (mList && mList.length > 0) setServerMembers(mList);
      }).catch(() => {});

      pbService.fetchAllUsers(forceRefresh).then((uList) => {
        if (uList && uList.length > 0) setAllUsersList(uList);
      }).catch(() => {});
    },
    [targetServerId],
  );

  useEffect(() => {
    // When current server is opened or changed, hydrate from cache immediately & revalidate in background
    if (targetServerId && targetServerId !== "dm") {
      const cMembers = pbService.getCachedServerMembers(targetServerId);
      const cRoles = pbService.getCachedServerRoles(targetServerId);
      const cUsers = pbService.getCachedUsers();
      if (cMembers.length > 0) setServerMembers(cMembers);
      if (cRoles.length > 0) setServerRoles(cRoles);
      if (cUsers.length > 0) setAllUsersList(cUsers);
    }
    loadServerMembersData(false);

    const handleServerMemberUpdated = (e: any) => {
      if (!e.detail?.serverId || e.detail?.serverId === targetServerId) {
        loadServerMembersData(true);
      }
    };

    const handleUserPresenceChanged = (e: any) => {
      const updatedUser = e.detail;
      if (updatedUser?.id) {
        setAllUsersList((prev) => {
          const idx = prev.findIndex((u) => u.id === updatedUser.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = mergeUserRecord(next[idx], updatedUser);
            return next;
          }
          return [...prev, updatedUser];
        });
      }
    };

    const unsubscribeWs = wsService.subscribe((evt) => {
      if (evt.type === "presence" && evt.userId) {
        setAllUsersList((prev) => {
          const idx = prev.findIndex((u) => u.id === evt.userId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = mergeUserRecord(next[idx], {
              status: (evt.status as any) || next[idx].status,
              last_seen: new Date().toISOString(),
            });
            return next;
          }
          return prev;
        });
      }
    });

    window.addEventListener("server-member-updated", handleServerMemberUpdated);
    window.addEventListener("user-presence-changed", handleUserPresenceChanged);

    // Periodic evaluation timer to refresh presence status (e.g. timeout after 2m heartbeat)
    const presenceTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setAllUsersList((prev) => {
        let hasChanges = false;
        const now = Date.now();
        const updated = prev.map((u) => {
          if (u.last_seen && u.status !== 'offline') {
            const diff = now - new Date(u.last_seen).getTime();
            if (diff > 120000) {
              hasChanges = true;
              return { ...u, status: 'offline' as const };
            }
          }
          return u;
        });
        return hasChanges ? updated : prev;
      });
    }, 60000);

    return () => {
      window.removeEventListener(
        "server-member-updated",
        handleServerMemberUpdated,
      );
      window.removeEventListener(
        "user-presence-changed",
        handleUserPresenceChanged,
      );
      unsubscribeWs();
      clearInterval(presenceTimer);
    };
  }, [loadServerMembersData, targetServerId]);

  // Build unified server members
  const unifiedServerMembers = React.useMemo(() => {
    const sObj = displayServer;
    if (!sObj?.id) return [];

    const membersMap = new Map<string, ServerMember>();
    serverMembers.forEach((m) => {
      const uId = m.user || m.expand?.user?.id;
      if (uId) {
        membersMap.set(uId, m);
      }
    });

    const usersMap = new Map<string, User>();
    allUsersList.forEach((u) => usersMap.set(u.id, u));

    const list: Array<{
      user: User;
      memberRecord?: ServerMember;
      displayName: string;
      username: string;
      avatarUrl: string | null;
      status: "online" | "away" | "dnd" | "offline";
      roleId: string;
      roleName: string;
      roleColor?: string;
      roleOrder: number;
      isOwner: boolean;
    }> = [];

    const processedUserIds = new Set<string>();

    const addMemberUser = (u: User, mRecord?: ServerMember) => {
      if (processedUserIds.has(u.id)) return;

      const memRecord =
        mRecord ||
        membersMap.get(u.id) ||
        pbService.getCachedServerMember(sObj.id, u.id);

      // Exclude users who left or are inactive in the server
      if (memRecord) {
        if (
          memRecord.is_member === false ||
          memRecord.membership_status === "left" ||
          memRecord.membership_status === "banned" ||
          memRecord.membership_status === "kicked"
        ) {
          return;
        }
      }

      processedUserIds.add(u.id);

      const isOwner = sObj.owner === u.id;
      const eff = getEffectiveProfile(u, sObj.id, memRecord);

      const primary = getPrimaryServerRole(
        memRecord?.role_id || memRecord?.role,
        serverRoles,
        isOwner,
        u.role,
        lang,
      );

      list.push({
        user: u,
        memberRecord: memRecord,
        displayName: eff.displayName,
        username: u.username || "",
        avatarUrl: eff.avatarUrl,
        status: getEffectiveUserStatus(u, u?.id === currentUser?.id),
        roleId: primary.id,
        roleName: primary.name,
        roleColor: primary.color,
        roleOrder: primary.priority,
        isOwner,
      });
    };

    serverMembers.forEach((m) => {
      const uId = m.user || m.expand?.user?.id;
      if (!uId) return;
      let u = usersMap.get(uId);
      if (!u && m.expand?.user) {
        u = m.expand.user;
      }
      if (u) {
        addMemberUser(u, m);
      }
    });

    if (sObj.owner) {
      const ownerUser = usersMap.get(sObj.owner);
      if (ownerUser && !processedUserIds.has(ownerUser.id)) {
        addMemberUser(ownerUser);
      }
    }

    if (currentUser?.id && !processedUserIds.has(currentUser.id)) {
      addMemberUser(currentUser);
    }

    // Include all registered workspace users in the server member list if they haven't explicitly left or been banned
    allUsersList.forEach((u) => {
      if (!processedUserIds.has(u.id)) {
        addMemberUser(u);
      }
    });

    return list;
  }, [
    displayServer?.id,
    displayServer?.owner,
    serverMembers,
    serverRoles,
    allUsersList,
    currentUser,
    lang,
  ]);

  // Group members into Online / Offline and Roles
  const groupedMembers = React.useMemo(() => {
    let filtered = unifiedServerMembers;
    if (memberSearchQuery.trim()) {
      const q = memberSearchQuery.toLowerCase().trim();
      filtered = unifiedServerMembers.filter((m) => {
        return (
          m.displayName.toLowerCase().includes(q) ||
          m.username.toLowerCase().includes(q) ||
          m.roleName.toLowerCase().includes(q)
        );
      });
    }

    const onlineMembers = filtered.filter(
      (m) => m.status === "online" || m.status === "away" || m.status === "dnd",
    );
    const offlineMembers = filtered.filter(
      (m) => m.status === "offline" || !m.status,
    );

    const groupByRole = (membersList: typeof unifiedServerMembers) => {
      const groupsMap = new Map<
        string,
        {
          roleName: string;
          roleColor?: string;
          roleOrder: number;
          members: typeof unifiedServerMembers;
        }
      >();

      membersList.forEach((m) => {
        if (!groupsMap.has(m.roleName)) {
          groupsMap.set(m.roleName, {
            roleName: m.roleName,
            roleColor: m.roleColor,
            roleOrder: m.roleOrder,
            members: [],
          });
        }
        groupsMap.get(m.roleName)!.members.push(m);
      });

      const groupsList = Array.from(groupsMap.values()).sort((a, b) => {
        if (a.roleOrder !== b.roleOrder) return a.roleOrder - b.roleOrder;
        return a.roleName.localeCompare(b.roleName);
      });

      groupsList.forEach((group) => {
        group.members.sort((a, b) =>
          a.displayName.localeCompare(b.displayName),
        );
      });

      return groupsList;
    };

    return {
      totalCount: filtered.length,
      onlineCount: onlineMembers.length,
      offlineCount: offlineMembers.length,
      onlineGroups: groupByRole(onlineMembers),
      offlineGroups: groupByRole(offlineMembers),
    };
  }, [unifiedServerMembers, memberSearchQuery]);

  useEffect(() => {
    if (unifiedServerMembers.length > 0) {
      setMentionUsers(unifiedServerMembers.map((m) => m.user));
    } else {
      pbService
        .fetchAllUsers()
        .then((list) => setMentionUsers(list))
        .catch(() => {});
    }
  }, [unifiedServerMembers]);

  // Server members map for nicknames and custom avatars
  const serverMembersMap = React.useMemo(() => {
    const map = new Map<string, any>();
    if (!server?.id) return map;

    // First populate from in-memory / persistent cache
    const cached = pbService.getCachedServerMembers(server.id);
    cached.forEach((m) => {
      const uId = m.user || (m as any).expand?.user?.id || m.id;
      if (uId) map.set(uId, m);
    });

    // Layer active serverMembers state on top
    serverMembers.forEach((m) => {
      const uId = m.user || (m as any).expand?.user?.id || m.id;
      if (uId) map.set(uId, m);
    });

    return map;
  }, [server?.id, serverMembers]);

  const resolveSenderUser = React.useCallback(
    (msg?: Message | null): User | null => {
      if (!msg) return null;
      if (msg.expand?.sender) return msg.expand.sender;
      if (typeof msg.sender === "object" && msg.sender !== null)
        return msg.sender as User;

      const sId =
        typeof msg.sender === "string" ? msg.sender : (msg.sender as any)?.id;
      if (!sId) return null;

      if (currentUser?.id === sId) return currentUser;
      if (channel?.recipientUser && channel.recipientUser.id === sId)
        return channel.recipientUser;

      const cached =
        pbService.getCachedUser(sId) || allUsersMap.get(sId);
      if (cached) return cached;

      const mem =
        serverMembersMap.get(sId) ||
        (server?.id ? pbService.getCachedServerMember(server.id, sId) : null);
      if (mem?.expand?.user) return mem.expand.user;

      // Trigger background cache fetch without setting state during render
      pbService.fetchUserById(sId).catch(() => {});

      return null;
    },
    [
      currentUser,
      channel?.recipientUser,
      allUsersMap,
      serverMembersMap,
      server?.id,
    ],
  );

  const getMemberDisplayName = React.useCallback(
    (senderUser?: User | null, senderId?: string) => {
      const sId = senderUser?.id || senderId;
      const effectiveUser =
        senderUser ||
        (sId
          ? pbService.getCachedUser(sId) ||
            allUsersMap.get(sId)
          : null);

      if (effectiveUser) {
        if (!isDmChannel && server?.id) {
          const memRecord =
            serverMembersMap.get(effectiveUser.id) ||
            pbService.getCachedServerMember(server.id, effectiveUser.id);
          const eff = getEffectiveProfile(effectiveUser, server.id, memRecord);
          if (eff.displayName) return eff.displayName;
        }
        return effectiveUser.display_name || effectiveUser.username || "User";
      }

      if (sId) {
        if (sId === currentUser?.id)
          return currentUser.display_name || currentUser.username || "User";
        return `User (${sId.substring(0, 6)})`;
      }

      return "User";
    },
    [isDmChannel, server?.id, serverMembersMap, allUsersMap, currentUser],
  );

  const getMemberAvatarUrl = React.useCallback(
    (senderUser?: User | null, senderId?: string) => {
      const sId = senderUser?.id || senderId;
      const effectiveUser =
        senderUser ||
        (sId
          ? pbService.getCachedUser(sId) ||
            allUsersMap.get(sId)
          : null);

      if (!effectiveUser) return "";
      if (!isDmChannel && server?.id) {
        const memRecord =
          serverMembersMap.get(effectiveUser.id) ||
          pbService.getCachedServerMember(server.id, effectiveUser.id);
        const eff = getEffectiveProfile(effectiveUser, server.id, memRecord);
        return eff.avatarUrl;
      }
      return getAvatarUrl(effectiveUser);
    },
    [isDmChannel, server?.id, serverMembersMap, allUsersMap],
  );

  const getMemberRoleColor = React.useCallback(
    (senderUser?: User | null) => {
      if (!senderUser || isDmChannel || !server?.id) return undefined;
      const memRecord =
        serverMembersMap.get(senderUser.id) ||
        pbService.getCachedServerMember(server.id, senderUser.id);
      const isOwner = server.owner === senderUser.id;
      const primary = getPrimaryServerRole(
        memRecord?.role_id || memRecord?.role,
        serverRoles,
        isOwner,
        senderUser.role,
        lang,
      );
      return primary.color;
    },
    [
      isDmChannel,
      server?.id,
      server?.owner,
      serverMembersMap,
      serverRoles,
      lang,
    ],
  );

  const handledTargetMsgIdRef = useRef<string | null>(null);

  // Scroll to and highlight target message if passed (e.g. from clicking notification or when mentioned)
  useEffect(() => {
    if (targetMessageId && targetMessageId !== handledTargetMsgIdRef.current) {
      handledTargetMsgIdRef.current = targetMessageId;

      const settings = getCachedUserSettings();
      if (settings.notifications?.mentionHighlight !== false) {
        setFocusedMessageId(targetMessageId);
      } else {
        setFocusedMessageId(null);
      }

      let attempts = 0;
      const tryScroll = () => {
        const el = document.getElementById(`msg-${targetMessageId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } else if (attempts < 15) {
          attempts++;
          setTimeout(tryScroll, 150);
        }
      };

      const timer0 = setTimeout(tryScroll, 100);

      // Keep highlight visible for ~1 second (1000ms), then clear
      const timer = setTimeout(() => {
        setFocusedMessageId(null);
        if (onClearTargetMessage) {
          onClearTargetMessage();
        }
      }, 1000);

      return () => {
        clearTimeout(timer0);
        clearTimeout(timer);
      };
    } else if (!targetMessageId) {
      handledTargetMsgIdRef.current = null;
      setFocusedMessageId(null);
    }
  }, [targetMessageId, onClearTargetMessage]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const touchTimerRef = useRef<any>(null);
  const animatedMessageIdsRef = useRef<Set<string>>(new Set());

  const loadMoreScrollAnchorRef = useRef<{
    prevScrollHeight: number;
    prevScrollTop: number;
    anchorMsgId: string | null;
    anchorOffsetTop: number;
  } | null>(null);

  useEffect(() => {
    setCooldownRemaining(0);
    animatedMessageIdsRef.current.clear();
    setUnreadSeparatorMsgId(null);
    setFocusedMessageId(null);
    setReplyTo(null);
    setActiveMenuMessage(null);
    setEditingMessageId(null);
    setChannelSearchQuery("");
  }, [channel.id]);

  const handleTouchStart = (e: React.TouchEvent, msg: Message) => {
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    const touch = e.touches[0];
    const posX = touch.clientX;
    const posY = touch.clientY;

    touchTimerRef.current = setTimeout(() => {
      setActiveMenuMessage(msg);
      setMenuPosition({ x: posX, y: posY });
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 600); // 600ms hold to trigger menu
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleContextMenuMessage = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    setActiveMenuMessage(msg);
    setMenuPosition({ x: e.clientX, y: e.clientY });
  };

  const handleSaveEditMessage = async (msgId: string) => {
    if (!editingText.trim()) return;
    try {
      if (onEditMessage) {
        await onEditMessage(msgId, editingText.trim());
      }
      setEditingMessageId(null);
    } catch (err) {
      console.error("Failed to save message edit:", err);
    }
  };

  const isLight = theme === "light";

  // Theme Mapping Dictionary
  const themeClasses: any = {
    panelBg: "bg-[var(--theme-bg-primary)]",
    headerBg: "bg-[var(--theme-bg-primary)] border-[var(--theme-border)]",
    border: "border-[var(--theme-border)]",
    textPrimary: "text-[var(--theme-text-primary)]",
    textSecondary: "text-[var(--theme-text-secondary)]",
    messageText: "text-[var(--theme-text-primary)]",
    senderName: "text-[var(--theme-text-primary)]",
    inputContainer:
      "bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] focus-within:border-accent",
    inputText:
      "text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]",
    primaryBtn: "bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)]",
    attachmentsBg:
      "bg-[var(--theme-bg-secondary)] border-[var(--theme-border)]",
    attachmentItemBg:
      "bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]",
    secondaryBtn:
      "bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] hover:opacity-80 border border-[var(--theme-border)]",
    actionBtn:
      "bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] border-[var(--theme-border)]",
    replyBanner: "bg-[var(--theme-bg-secondary)] border-[var(--theme-border)]",
    pendingBg:
      "bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-accent",
  };

  const panelBgClass = themeClasses.panelBg;
  const borderClass = themeClasses.border;
  const headerBgClass = themeClasses.headerBg;
  const textPrimaryClass = themeClasses.textPrimary;
  const textSecondaryClass = themeClasses.textSecondary;
  const messageTextClass = themeClasses.messageText;
  const senderNameClass = themeClasses.senderName;
  const inputContainerClass = themeClasses.inputContainer;
  const inputTextColor = themeClasses.inputText;
  const primaryBtnClass = themeClasses.primaryBtn;

  const attachmentsBgClass = themeClasses.attachmentsBg;
  const attachmentItemBgClass = themeClasses.attachmentItemBg;
  const secondaryBtnClass = themeClasses.secondaryBtn;
  const actionBtnClass = themeClasses.actionBtn;
  const replyBannerClass = themeClasses.replyBanner;
  const pendingBgClass = themeClasses.pendingBg;

  // Preserve rendered messages in displayedMessages state when panel is inactive to keep video elements alive
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>(() => {
    return (messages || []).filter(
      (m) => !m.channel || m.channel === channel.id,
    );
  });

  useEffect(() => {
    if (!isActive || !messages) return;
    // The panel is kept mounted while navigating. Always replace the rendered
    // source for the new conversation, including with an empty list, so a
    // previous channel can never flash beneath a search or loading state.
    const matching = messages.filter(
      (m) => !m.channel || m.channel === channel.id,
    );
    setDisplayedMessages(matching);
  }, [isActive, messages, channel.id]);

  // Optimized chronological message sorting, search filtering, and deduplication
  const { sortedMessages, messageLookup } = React.useMemo(() => {
    const lookup = new Map<string, Message>();
    const uniqueMessagesMap = new Map<string, Message>();
    const nonOptimisticKeys = new Set<string>();

    // First pass: index confirmed server messages
    for (const msg of displayedMessages) {
      if (
        msg.id &&
        !msg.deleted &&
        !msg.deleted_at &&
        !MessageDeletionService.isMessageDeleted(msg.id)
      ) {
        const isOptimistic = msg.id.startsWith("optimistic-") || (msg as any).is_pending;
        if (!isOptimistic) {
          uniqueMessagesMap.set(msg.id, msg);
          lookup.set(msg.id, msg);
          const tempId = (msg as any).temp_id;
          if (tempId) lookup.set(tempId, msg);
          const sId = msg.sender || msg.expand?.sender?.id;
          if (sId && msg.content) {
            nonOptimisticKeys.add(`${sId}_${msg.content.trim()}`);
          }
        }
      }
    }

    // Second pass: add optimistic messages that aren't already represented by a confirmed message
    for (const msg of displayedMessages) {
      if (
        msg.id &&
        !msg.deleted &&
        !msg.deleted_at &&
        !MessageDeletionService.isMessageDeleted(msg.id)
      ) {
        const isOptimistic = msg.id.startsWith("optimistic-") || (msg as any).is_pending;
        if (isOptimistic) {
          const sId = msg.sender || msg.expand?.sender?.id;
          const key = sId && msg.content ? `${sId}_${msg.content.trim()}` : null;
          const tempId = (msg as any).temp_id;
          const alreadyInMap =
            uniqueMessagesMap.has(msg.id) ||
            (tempId && (uniqueMessagesMap.has(tempId) || lookup.has(tempId))) ||
            (key && nonOptimisticKeys.has(key));
          if (!alreadyInMap) {
            uniqueMessagesMap.set(msg.id, msg);
            lookup.set(msg.id, msg);
            if (tempId) lookup.set(tempId, msg);
          }
        }
      }
    }

    let sorted = Array.from(uniqueMessagesMap.values()).sort((a, b) => {
      const t1 = new Date(a.created).getTime();
      const t2 = new Date(b.created).getTime();
      return t1 - t2;
    });

    if (channelSearchQuery.trim()) {
      const parsedSearch = parseMessageSearchQuery(channelSearchQuery);
      sorted = sorted.filter((message) =>
        messageMatchesParsedSearch(message, parsedSearch, { channel }),
      );
    }

    return { sortedMessages: sorted, messageLookup: lookup };
  }, [displayedMessages, channelSearchQuery]);

  const totalMessagesCount = sortedMessages.length;

  // Proactively preload media (images, attachments, and link previews) in advance without blocking the main JS thread
  const preloadMediaForRange = React.useCallback(
    (startIdx: number, endIdx: number) => {
      if (!sortedMessages || sortedMessages.length === 0) return;
      const isDm = Boolean(
        channel?.recipientUser || (channel as any)?.is_private,
      );
      const start = Math.max(0, startIdx);
      const end = Math.min(sortedMessages.length, endIdx);

      const runPreload = () => {
        for (let i = start; i < end; i++) {
          const msg = sortedMessages[i];
          if (!msg) continue;

          const rawAtts = [
            ...(msg.expand?.["attachments_via_message"] || []),
            ...(msg.expand?.["private_attachments_via_message"] || []),
            ...(msg.expand?.["attachments(message)"] || []),
            ...(msg.expand?.["private_attachments(message)"] || []),
            ...(msg.expand?.attachments || []),
            ...(msg.expand?.private_attachments || []),
            ...(Array.isArray(msg.attachments) ? msg.attachments : []),
          ];

          for (const att of rawAtts) {
            if (!att || typeof att !== "object" || !att.file) continue;
            const normType = inferMimeType(att.file, att.type);
            if (isAttachmentImage(att.file, normType)) {
              const normColl =
                att.collectionName ||
                att["@collectionName"] ||
                (att.isPrivate || isDm ? "private_attachments" : "attachments");
              const url = getAttachmentThumbnailUrl({
                ...att,
                collectionName: normColl,
                type: normType,
              });
              if (url && !preloadedMediaUrlsRef.current.has(url)) {
                preloadedMediaUrlsRef.current.add(url);
                // Only warm a server-side thumbnail. Full-size decoding is
                // deferred until the image actually enters the viewport.
                preloadUploadedImage(url, 480, 360).catch(() => {});
              }
            }
          }

          if (msg.content && typeof msg.content === "string") {
            const urlRegex = /(?:https?:\/\/|www\.)[^\s<]+[^\s`!()\[\]{};:'".,<>?«»“”‘’]/gi;
            const matches = msg.content.match(urlRegex) || [];
            for (const rawUrl of matches) {
              const fullUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
              const lowerUrl = fullUrl.toLowerCase();
              if (
                /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(lowerUrl) ||
                lowerUrl.includes("images.unsplash.com") ||
                lowerUrl.includes("i.imgur.com")
              ) {
                if (!preloadedMediaUrlsRef.current.has(fullUrl)) {
                  preloadedMediaUrlsRef.current.add(fullUrl);
                  preloadExternalImage(fullUrl).catch(() => {});
                }
              }
            }
          }
        }
      };

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        (window as any).requestIdleCallback(runPreload, { timeout: 1000 });
      } else {
        setTimeout(runPreload, 0);
      }
    },
    [sortedMessages, channel],
  );

  // Keep ref synchronized for scrolling event handler
  useEffect(() => {
    preloadMediaForRangeRef.current = preloadMediaForRange;
  }, [preloadMediaForRange]);

  // Eagerly prefetch media for recent messages when messages or active channel change
  useEffect(() => {
    if (!sortedMessages || sortedMessages.length === 0) return;
    const start = Math.max(0, sortedMessages.length - 4);
    preloadMediaForRange(start, Math.min(sortedMessages.length, start + 4));
  }, [sortedMessages, channel.id, preloadMediaForRange]);

  const blockedClustersMap = React.useMemo(() => {
    const map = new Map<
      string,
      {
        clusterId: string;
        isContinuous: boolean;
        clusterCount: number;
        clusterMsgIds: string[];
        isClusterStart: boolean;
        isClusterRevealed: boolean;
        clusterIndex: number;
      }
    >();
    if (sortedMessages.length === 0 || blockedUserIdsSet.size === 0) return map;

    let currentCluster: Message[] = [];
    let currentSenderKey = "";

    const flushCluster = () => {
      if (currentCluster.length === 0) return;
      const clusterCount = currentCluster.length;
      const isContinuous = clusterCount > 1;
      const clusterMsgIds = currentCluster.map((m) => m.id);
      const clusterId = clusterMsgIds[0];
      const isClusterRevealed = clusterMsgIds.some((id) =>
        revealedBlockedMsgIds.has(id),
      );

      currentCluster.forEach((msg, idx) => {
        map.set(msg.id, {
          clusterId,
          isContinuous,
          clusterCount,
          clusterMsgIds,
          isClusterStart: idx === 0,
          isClusterRevealed,
          clusterIndex: idx,
        });
      });
      currentCluster = [];
      currentSenderKey = "";
    };

    for (let i = 0; i < sortedMessages.length; i++) {
      const msg = sortedMessages[i];
      const sender = resolveSenderUser(msg);
      const senderId = getSenderId(msg);
      const msgSenderId =
        senderId || msg.sender || (msg as any).user_id || msg.expand?.sender?.id;
      const isBlocked = Boolean(
        msgSenderId &&
          (blockedUserIdsSet.has(msgSenderId) ||
            (sender?.id && blockedUserIdsSet.has(sender.id)) ||
            (msg.sender && blockedUserIdsSet.has(msg.sender))),
      );

      if (isBlocked) {
        const senderKey = msgSenderId || msg.sender || "unknown_blocked";
        if (currentCluster.length > 0 && currentSenderKey === senderKey) {
          currentCluster.push(msg);
        } else {
          flushCluster();
          currentSenderKey = senderKey;
          currentCluster.push(msg);
        }
      } else {
        flushCluster();
      }
    }
    flushCluster();

    return map;
  }, [
    sortedMessages,
    blockedUserIdsSet,
    revealedBlockedMsgIds,
    resolveSenderUser,
  ]);

  const calculateAccurateMessageHeight = React.useCallback(
    (
      msg: Message,
      isFirstInDay: boolean,
      isGroupHeader: boolean,
      unreadSepId: string | null,
    ): number => {
      const clusterInfo = blockedClustersMap.get(msg.id);
      if (clusterInfo && !clusterInfo.isClusterRevealed) {
        return clusterInfo.isClusterStart ? 52 : 0;
      }

      let height = isGroupHeader ? 54 : 22;

      if (isFirstInDay) height += 40;
      if (msg.id === unreadSepId) height += 36;
      if (msg.reply_to) height += 28;

      const content = msg.content || "";
      if (content.trim()) {
        const rawLines = content.split("\n");
        let wrappedLineCount = 0;
        for (const line of rawLines) {
          wrappedLineCount += Math.max(1, Math.ceil(line.length / 55));
        }
        height += wrappedLineCount * 22;

        const codeBlockMatches = content.match(/```[\s\S]*?```/g);
        if (codeBlockMatches) {
          for (const cb of codeBlockMatches) {
            const cbLines = cb.split("\n").length;
            height += cbLines * 20 + 24;
          }
        }
      }

      const attachments = ((msg as any).attachments ||
        msg.expand?.attachments ||
        []) as Attachment[];
      if (attachments.length > 0) {
        const audioCount = attachments.filter((a) =>
          isAttachmentAudio(a.file, a.type),
        ).length;
        const nonAudio = attachments.filter(
          (a) => !isAttachmentAudio(a.file, a.type),
        );

        if (audioCount > 0) height += 80;

        if (nonAudio.length > 0) {
          if (nonAudio.length > 4) {
            height += 210;
          } else {
            for (const attach of nonAudio) {
              const isImg = isAttachmentImage(attach.file, attach.type, false);
              const isVid = isAttachmentVideo(attach.file, attach.type);
              const isUnrenderable = isAttachmentUnrenderable(
                attach.file,
                attach.type,
                false,
              );

              if (isImg) {
                let aspect = 16 / 9;
                const wNum = Number(attach.width);
                const hNum = Number(attach.height);
                if (!isNaN(wNum) && !isNaN(hNum) && hNum > 0) {
                  aspect = wNum / hNum;
                } else if (
                  (attach as any).meta?.width &&
                  (attach as any).meta?.height
                ) {
                  aspect =
                    Number((attach as any).meta.width) /
                    Number((attach as any).meta.height);
                }
                const imgHeight = Math.min(
                  320,
                  Math.max(140, Math.round(480 / aspect)),
                );
                height += imgHeight + 12;
              } else if (isVid) {
                height += 260;
              } else if (isUnrenderable) {
                height += 76;
              } else {
                height += 72;
              }
            }
          }
        }
      }

      if (
        content.includes("http://") ||
        content.includes("https://") ||
        content.includes("www.")
      ) {
        const urls = content.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi) || [];
        for (const url of urls) {
          const lower = url.toLowerCase();
          if (
            /\.(png|jpg|jpeg|gif|webp|svg)/i.test(lower) ||
            lower.includes("unsplash.com") ||
            lower.includes("imgur.com")
          ) {
            height += 220;
          } else if (/\.(mp4|webm|mov)/i.test(lower)) {
            height += 260;
          } else if (
            lower.includes("youtube.com") ||
            lower.includes("youtu.be")
          ) {
            height += 240;
          } else if (
            lower.includes("instagram.com") ||
            lower.includes("tiktok.com") ||
            lower.includes("facebook.com") ||
            lower.includes("reddit.com")
          ) {
            height += 180;
          }
        }
      }

      return Math.max(36, height);
    },
    [blockedClustersMap],
  );

  const getEstimatedMessageHeight = React.useCallback(
    (i: number): number => {
      const msg = sortedMessages[i];
      if (!msg) return 50;
      const measured = itemHeightsRef.current.get(msg.id);
      if (measured && measured > 0) return measured;

      const isFirstInDay =
        i === 0 ||
        !isSameCalendarDay(
          new Date(msg.created),
          new Date(sortedMessages[i - 1].created),
        );
      const prevMsg = i > 0 ? sortedMessages[i - 1] : null;
      const isDiffUser = !prevMsg || getSenderId(msg) !== getSenderId(prevMsg);
      const isTimeWindowExceeded =
        prevMsg &&
        Math.abs(
          new Date(msg.created).getTime() - new Date(prevMsg.created).getTime(),
        ) > MESSAGE_GROUPING_WINDOW_MS;
      const isGroupHeader =
        i === 0 || isDiffUser || isTimeWindowExceeded || isFirstInDay;

      const est = calculateAccurateMessageHeight(
        msg,
        isFirstInDay,
        isGroupHeader,
        unreadSeparatorMsgId,
      );
      itemHeightsRef.current.set(msg.id, est);
      return est;
    },
    [sortedMessages, unreadSeparatorMsgId, calculateAccurateMessageHeight],
  );

  React.useEffect(() => {
    for (let i = 0; i < sortedMessages.length; i++) {
      const msg = sortedMessages[i];
      if (msg && !itemHeightsRef.current.has(msg.id)) {
        const isFirstInDay =
          i === 0 ||
          !isSameCalendarDay(
            new Date(msg.created),
            new Date(sortedMessages[i - 1].created),
          );
        const prevMsg = i > 0 ? sortedMessages[i - 1] : null;
        const isDiffUser =
          !prevMsg || getSenderId(msg) !== getSenderId(prevMsg);
        const isTimeWindowExceeded =
          prevMsg &&
          Math.abs(
            new Date(msg.created).getTime() -
              new Date(prevMsg.created).getTime(),
          ) > MESSAGE_GROUPING_WINDOW_MS;
        const isGroupHeader =
          i === 0 || isDiffUser || isTimeWindowExceeded || isFirstInDay;

        const h = calculateAccurateMessageHeight(
          msg,
          isFirstInDay,
          isGroupHeader,
          unreadSeparatorMsgId,
        );
        itemHeightsRef.current.set(msg.id, h);
      }
    }
  }, [sortedMessages, calculateAccurateMessageHeight, unreadSeparatorMsgId]);

  // Build a lightweight prefix-sum table so a scroll offset can be mapped to
  // a message index in O(log n). We use cached/estimated row heights here;
  // the existing height pass keeps those estimates warm as messages arrive.
  const estimatedMessageHeights = React.useMemo(
    () =>
      sortedMessages.map((_, index) => getEstimatedMessageHeight(index)),
    [sortedMessages, getEstimatedMessageHeight],
  );

  const cumulativeMessageHeights = React.useMemo(() => {
    const prefix = new Array<number>(estimatedMessageHeights.length + 1);
    prefix[0] = 0;
    for (let i = 0; i < estimatedMessageHeights.length; i++) {
      prefix[i + 1] = prefix[i] + estimatedMessageHeights[i];
    }
    return prefix;
  }, [estimatedMessageHeights]);

  const [virtualRangeVersion, setVirtualRangeVersion] = useState(0);
  const previousTopSpacerHeightRef = useRef(0);

  // The callback is stored in a ref because the native scroll handler is
  // declared earlier in this component. It always points at the latest
  // prefix table after each render.
  updateVirtualRangeRef.current = (
    scrollTop: number,
    viewportHeight: number,
    force = false,
  ) => {
    const count = sortedMessages.length;
    if (count === 0) return;

    let nextStart = 0;
    let nextEnd = count - 1;

    if (count > VIRTUAL_MAX_ITEMS) {
      const maxOffset = cumulativeMessageHeights[count];
      const findIndexAtOffset = (offset: number) => {
        const target = Math.max(0, Math.min(offset, Math.max(0, maxOffset - 1)));
        let low = 0;
        let high = count - 1;
        while (low < high) {
          const mid = Math.floor((low + high + 1) / 2);
          if (cumulativeMessageHeights[mid] <= target) low = mid;
          else high = mid - 1;
        }
        return low;
      };

      const firstVisible = findIndexAtOffset(scrollTop);
      const lastVisible = findIndexAtOffset(scrollTop + Math.max(1, viewportHeight));
      nextStart = Math.max(0, firstVisible - VIRTUAL_OVERSCAN);
      nextEnd = Math.min(count - 1, lastVisible + VIRTUAL_OVERSCAN);

      // Keep enough rows mounted to avoid thrashing while the user scrolls
      // quickly through short messages.
      const currentSize = nextEnd - nextStart + 1;
      if (currentSize < VIRTUAL_MAX_ITEMS) {
        const missing = VIRTUAL_MAX_ITEMS - currentSize;
        const growAfter = Math.min(missing, count - 1 - nextEnd);
        nextEnd += growAfter;
        const growBefore = missing - growAfter;
        nextStart = Math.max(0, nextStart - growBefore);
      }
    }

    const previous = virtualRangeRef.current;
    if (
      force ||
      previous.startIndex !== nextStart ||
      previous.endIndex !== nextEnd
    ) {
      virtualRangeRef.current = { startIndex: nextStart, endIndex: nextEnd };
      setVirtualRangeVersion((version) => version + 1);
    }
  };

  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } =
    React.useMemo(() => {
      if (totalMessagesCount === 0) {
        return {
          startIndex: 0,
          endIndex: -1,
          topSpacerHeight: 0,
          bottomSpacerHeight: 0,
        };
      }

      const start = Math.max(
        0,
        Math.min(virtualRangeRef.current.startIndex, totalMessagesCount - 1),
      );
      const end = Math.max(
        start,
        Math.min(virtualRangeRef.current.endIndex, totalMessagesCount - 1),
      );
      const totalHeight = cumulativeMessageHeights[totalMessagesCount] || 0;

      return {
        startIndex: start,
        endIndex: end,
        topSpacerHeight: cumulativeMessageHeights[start] || 0,
        bottomSpacerHeight:
          Math.max(0, totalHeight - (cumulativeMessageHeights[end + 1] || 0)),
      };
    }, [
      totalMessagesCount,
      cumulativeMessageHeights,
      virtualRangeVersion,
    ]);

  const visibleSlice = React.useMemo(
    () =>
      totalMessagesCount === 0
        ? []
        : sortedMessages.slice(startIndex, endIndex + 1),
    [sortedMessages, totalMessagesCount, startIndex, endIndex],
  );

  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const scrollEl = scrollRef.current;
    if (loadMoreScrollAnchorRef.current) {
      const anchorData = loadMoreScrollAnchorRef.current;
      loadMoreScrollAnchorRef.current = null;

      if (anchorData.anchorMsgId) {
        let anchorEl = scrollEl.querySelector<HTMLElement>(`[id="${anchorData.anchorMsgId}"]`);
        if (!anchorEl) anchorEl = document.getElementById(anchorData.anchorMsgId);
        if (anchorEl) {
          const targetTop = anchorEl.offsetTop - anchorData.anchorOffsetTop;
          scrollEl.scrollTop = targetTop;
          lastScrollTopRef.current = targetTop;
          return;
        }
      }

      const newScrollHeight = scrollEl.scrollHeight;
      const heightDiff = newScrollHeight - anchorData.prevScrollHeight;
      if (heightDiff > 0) {
        const targetTop = scrollEl.scrollTop + heightDiff;
        scrollEl.scrollTop = targetTop;
        lastScrollTopRef.current = targetTop;
      }
      return;
    }

    if (
      isInitialScrollPendingRef.current ||
      (initialChannelLoadLockRef.current.active &&
        initialChannelLoadLockRef.current.chanId === channel.id)
    ) {
      scrollEl.scrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
      lastScrollTopRef.current = scrollEl.scrollTop;
    }
  }, [sortedMessages, channel.id]);

  // The initial scroll manager above may change scrollTop after the first
  // paint. Re-evaluate the virtual window from that final position so a
  // channel opened at the bottom renders its newest messages immediately.
  useLayoutEffect(() => {
    if (!isActive || !isInitialLoadReady || !scrollRef.current) return;
    updateVirtualRangeRef.current(
      scrollRef.current.scrollTop,
      scrollRef.current.clientHeight,
      true,
    );
  }, [channel.id, isActive, isInitialLoadReady, totalMessagesCount]);

  // A filtered list can be shorter than the previous virtual window. Reset
  // the window and show the newest matching rows so search can never leave a
  // blank viewport at the old scroll offset.
  const previousSearchQueryRef = useRef(channelSearchQuery);
  useLayoutEffect(() => {
    if (previousSearchQueryRef.current === channelSearchQuery) return;
    previousSearchQueryRef.current = channelSearchQuery;
    virtualRangeRef.current = {
      startIndex: 0,
      endIndex: VIRTUAL_MAX_ITEMS + VIRTUAL_OVERSCAN - 1,
    };
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const targetTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    scrollEl.scrollTop = targetTop;
    lastScrollTopRef.current = targetTop;
    updateVirtualRangeRef.current(targetTop, scrollEl.clientHeight, true);
  }, [channelSearchQuery]);

  // Changing the rendered window changes the height of the top spacer. Keep
  // the user's viewport anchored to the same message while that spacer moves.
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    const previousHeight = previousTopSpacerHeightRef.current;
    if (
      scrollEl &&
      previousHeight > 0 &&
      previousHeight !== topSpacerHeight &&
      !isAtBottomRef.current &&
      !isManualScrollingRef.current
    ) {
      scrollEl.scrollTop = Math.max(
        0,
        scrollEl.scrollTop + topSpacerHeight - previousHeight,
      );
      lastScrollTopRef.current = scrollEl.scrollTop;
    }
    previousTopSpacerHeightRef.current = topSpacerHeight;
  }, [topSpacerHeight]);

  useEffect(() => {
    previousTopSpacerHeightRef.current = 0;
  }, [channel.id]);

  // Calculate temporary "New Messages" separator ID when channel opens with unread messages
  useEffect(() => {
    let timer: any = null;
    const findUnreadTargetMessage = () => {
      if (
        !unreadCountOnOpen ||
        unreadCountOnOpen <= 0 ||
        sortedMessages.length === 0
      ) {
        return null;
      }
      const unreadWindow = sortedMessages.slice(
        Math.max(0, sortedMessages.length - unreadCountOnOpen),
      );
      // Track ownership: Find the first unread message NOT sent by the current user
      const target = unreadWindow.find((m) => {
        const senderId = m.sender || m.expand?.sender?.id;
        return senderId && senderId !== currentUser.id;
      });
      return target?.id || null;
    };

    if (channel.id !== lastChannelIdRef.current) {
      lastChannelIdRef.current = channel.id;
      const targetId = findUnreadTargetMessage();
      if (targetId) {
        setUnreadSeparatorMsgId(targetId);
        timer = setTimeout(() => setUnreadSeparatorMsgId(null), 3500);
      } else {
        setUnreadSeparatorMsgId(null);
      }
    } else if (
      unreadCountOnOpen &&
      unreadCountOnOpen > 0 &&
      !unreadSeparatorMsgId &&
      sortedMessages.length > 0
    ) {
      const targetId = findUnreadTargetMessage();
      if (targetId) {
        setUnreadSeparatorMsgId(targetId);
        timer = setTimeout(() => setUnreadSeparatorMsgId(null), 3500);
      }
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [channel.id, unreadCountOnOpen, sortedMessages, currentUser.id]);

  const applyFormatting = (
    type:
      | "heading"
      | "bold"
      | "italic"
      | "strikethrough"
      | "spoiler"
      | "quote"
      | "code"
      | "codeblock",
  ) => {
    const textarea = textInputRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selectedText = inputText.substring(start, end);

    let prefix = "";
    let suffix = "";
    let defaultPlaceholder = "";

    switch (type) {
      case "heading":
        prefix = "# ";
        suffix = "";
        defaultPlaceholder = lang === "ar" ? "عنوان" : "Heading Title";
        break;
      case "bold":
        prefix = "**";
        suffix = "**";
        defaultPlaceholder = lang === "ar" ? "نص عريض" : "bold text";
        break;
      case "italic":
        prefix = "*";
        suffix = "*";
        defaultPlaceholder = lang === "ar" ? "نص مائل" : "italic text";
        break;
      case "strikethrough":
        prefix = "~~";
        suffix = "~~";
        defaultPlaceholder = lang === "ar" ? "نص مشطوب" : "strikethrough text";
        break;
      case "spoiler":
        prefix = "||";
        suffix = "||";
        defaultPlaceholder = lang === "ar" ? "محتوى مخفي" : "spoiler text";
        break;
      case "quote":
        prefix = "> ";
        suffix = "";
        defaultPlaceholder = lang === "ar" ? "نص مقتبس" : "quoted text";
        break;
      case "code":
        prefix = "`";
        suffix = "`";
        defaultPlaceholder = lang === "ar" ? "كود" : "code";
        break;
      case "codeblock":
        prefix = "```\n";
        suffix = "\n```";
        defaultPlaceholder = lang === "ar" ? "كود برمجي" : "code block";
        break;
    }

    const replacement = selectedText
      ? `${prefix}${selectedText}${suffix}`
      : `${prefix}${defaultPlaceholder}${suffix}`;
    const newText =
      inputText.substring(0, start) + replacement + inputText.substring(end);
    setInputText(newText);

    setTimeout(() => {
      textarea.focus();
      if (selectedText) {
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length + selectedText.length,
        );
      } else {
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length + defaultPlaceholder.length,
        );
      }
    }, 0);
  };

  const parseInlineSpans = (
    textStr: string,
    keyPrefix: string,
  ): React.ReactNode[] => {
    if (!textStr) return [];
    const regex =
      /(\|\|[\s\S]+?\|\|)|(`[^`]+`)|(\*\*[\s\S]+?\*\*)|(\*[\s\S]+?\*)|(~~[\s\S]+?~~)/g;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(textStr)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(textStr.substring(lastIndex, match.index));
      }
      const matchedStr = match[0];
      const matchKey = `${keyPrefix}-${match.index}`;

      if (matchedStr.startsWith("||") && matchedStr.endsWith("||")) {
        const inner = matchedStr.slice(2, -2);
        nodes.push(
          <SpoilerBadge
            key={matchKey}
            idKey={matchKey}
            text={inner}
            lang={lang}
          />,
        );
      } else if (matchedStr.startsWith("`") && matchedStr.endsWith("`")) {
        const inner = matchedStr.slice(1, -1);
        nodes.push(
          <code
            key={matchKey}
            className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/80 font-mono text-xs text-amber-300 mx-0.5"
          >
            {inner}
          </code>,
        );
      } else if (matchedStr.startsWith("**") && matchedStr.endsWith("**")) {
        const inner = matchedStr.slice(2, -2);
        nodes.push(
          <strong key={matchKey} className="font-extrabold text-white">
            {inner}
          </strong>,
        );
      } else if (matchedStr.startsWith("*") && matchedStr.endsWith("*")) {
        const inner = matchedStr.slice(1, -1);
        nodes.push(
          <em key={matchKey} className="italic text-slate-200">
            {inner}
          </em>,
        );
      } else if (matchedStr.startsWith("~~") && matchedStr.endsWith("~~")) {
        const inner = matchedStr.slice(2, -2);
        nodes.push(
          <del key={matchKey} className="line-through text-slate-400">
            {inner}
          </del>,
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < textStr.length) {
      nodes.push(textStr.substring(lastIndex));
    }
    return nodes;
  };

  const parseInlineFormatting = (
    textStr: string,
    keyPrefix: string,
  ): React.ReactNode[] => {
    if (!textStr) return [];
    const lines = textStr.split("\n");
    const resultNodes: React.ReactNode[] = [];

    lines.forEach((line, lIdx) => {
      if (lIdx > 0) {
        resultNodes.push("\n");
      }

      if (line.startsWith("> ")) {
        const quoteText = line.substring(2);
        resultNodes.push(
          <blockquote
            key={`${keyPrefix}-q-${lIdx}`}
            className="border-l-4 border-accent pl-3 py-1 my-1 italic text-slate-300 bg-accent/5 rounded-r-lg font-medium inline-block w-full"
          >
            {parseInlineSpans(quoteText, `${keyPrefix}-qspan-${lIdx}`)}
          </blockquote>,
        );
      } else if (line.startsWith("# ")) {
        const headingText = line.substring(2);
        resultNodes.push(
          <h3
            key={`${keyPrefix}-h-${lIdx}`}
            className="text-base sm:text-lg font-black text-accent my-1 tracking-tight"
          >
            {parseInlineSpans(headingText, `${keyPrefix}-hspan-${lIdx}`)}
          </h3>,
        );
      } else {
        resultNodes.push(...parseInlineSpans(line, `${keyPrefix}-l-${lIdx}`));
      }
    });

    return resultNodes;
  };

  const parseRichText = (
    textStr: string,
    keyPrefix: string = "rt",
  ): React.ReactNode[] => {
    if (!textStr) return [];

    const codeBlockRegex = /```(?:([a-zA-Z0-9_-]+)\n)?([\s\S]*?)```/g;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let cbMatch;

    while ((cbMatch = codeBlockRegex.exec(textStr)) !== null) {
      if (cbMatch.index > lastIndex) {
        nodes.push(
          ...parseInlineFormatting(
            textStr.substring(lastIndex, cbMatch.index),
            `${keyPrefix}-cb-${lastIndex}`,
          ),
        );
      }
      const langLabel = cbMatch[1] || "";
      const code = cbMatch[2] || "";
      nodes.push(
        <div
          key={`${keyPrefix}-codeblock-${cbMatch.index}`}
          className="my-2 rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-amber-300 overflow-x-auto relative group shadow-md"
        >
          <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1.5 border-b border-slate-800 pb-1 font-mono">
            <span className="font-bold text-accent">
              {langLabel ? langLabel.toUpperCase() : "CODE"}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(code);
              }}
              className="text-[10px] font-bold text-slate-400 hover:text-white border-0 bg-slate-900 hover:bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-all"
            >
              {lang === "ar" ? "نسخ" : "Copy"}
            </button>
          </div>
          <pre className="whitespace-pre overflow-x-auto font-mono text-amber-300 leading-relaxed">
            {code}
          </pre>
        </div>,
      );
      lastIndex = codeBlockRegex.lastIndex;
    }

    if (lastIndex < textStr.length) {
      nodes.push(
        ...parseInlineFormatting(
          textStr.substring(lastIndex),
          `${keyPrefix}-cb-end`,
        ),
      );
    }

    return nodes;
  };

  const renderFormattedContent = (content: string) => {
    if (!content) return null;

    // Combined Regex for Mentions (@username) and URLs (http://, https://, or www.)
    const combinedRegex =
      /(@[a-zA-Z0-9_\u0600-\u06FF]+)|((?:https?:\/\/|www\.)[^\s<]+)/g;

    const parts: React.ReactNode[] = [];
    const mediaPreviews: {
      type:
        | "image"
        | "video"
        | "youtube"
        | "instagram"
        | "tiktok"
        | "facebook"
        | "reddit"
        | "msgLink"
        | "web";
      url: string;
    }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(content)) !== null) {
      const matchText = match[0];
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        parts.push(
          ...parseRichText(
            content.substring(lastIndex, matchIndex),
            `rt-${matchIndex}`,
          ),
        );
      }

      if (matchText.startsWith("@")) {
        const username = matchText.substring(1);
        const uLower = username.toLowerCase();
        let foundUser =
          currentUser &&
          ((currentUser.username || "").toLowerCase() === uLower ||
            (currentUser.display_name || "").toLowerCase() === uLower)
            ? currentUser
            : channel?.recipientUser &&
                ((channel.recipientUser.username || "").toLowerCase() === uLower ||
                  (channel.recipientUser.display_name || "").toLowerCase() === uLower)
              ? channel.recipientUser
              : userNameLookupMap.get(uLower) || null;

        if (foundUser) {
          const memRecord =
            serverMembersMap.get(foundUser.id) ||
            (server?.id
              ? pbService.getCachedServerMember(server.id, foundUser.id)
              : null);

          const isLeft =
            !isDmChannel &&
            server?.id &&
            memRecord &&
            (memRecord.is_member === false ||
              memRecord.membership_status === "left" ||
              memRecord.membership_status === "banned" ||
              memRecord.membership_status === "kicked");

          if (isLeft) {
            parts.push(
              <span
                key={`mention-left-${matchIndex}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectUser?.(foundUser, e.currentTarget);
                }}
                className="px-1.5 py-0.5 rounded-md font-extrabold text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/50 cursor-pointer inline-flex items-center gap-1 mx-0.5 transition-all select-none opacity-80"
                title={
                  lang === "ar"
                    ? "هذا المستخدم ليس حالياً في السيرفر"
                    : "User is not currently in this server"
                }
              >
                @{username}
                <span className="text-[9px] font-bold text-slate-400 bg-slate-900/80 px-1 py-0.2 rounded border border-slate-700/60">
                  {lang === "ar" ? "ليس في السيرفر" : "Not in server"}
                </span>
              </span>,
            );
          } else {
            parts.push(
              <span
                key={`mention-${matchIndex}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey) {
                    handleInsertMention(foundUser);
                  } else {
                    onSelectUser?.(foundUser, e.currentTarget);
                  }
                }}
                className="px-1.5 py-0.5 rounded-md font-extrabold text-[var(--theme-accent,#7bae37)] bg-[var(--theme-accent,#7bae37)]/20 hover:bg-[var(--theme-accent,#7bae37)]/35 border border-[var(--theme-accent,#7bae37)]/35 hover:underline cursor-pointer inline-flex items-center gap-0.5 mx-0.5 transition-all select-none"
                title={
                  lang === "ar"
                    ? `اضغط Shift للنقر لمناداة @${username}`
                    : `Shift+Click to mention @${username}`
                }
              >
                @{username}
              </span>,
            );
          }
        } else {
          parts.push(
            <span
              key={`mention-pending-${matchIndex}`}
              onClick={async (e) => {
                e.stopPropagation();
                const anchorEl = e.currentTarget;
                let target = userNameLookupMap.get(uLower);
                if (!target) {
                  try {
                    const fetched = await pbService.fetchAllUsers(true);
                    if (fetched && fetched.length > 0) {
                      setAllUsersList(fetched);
                      target = fetched.find(
                        (u) =>
                          (u.username || "").toLowerCase() === uLower ||
                          (u.display_name || "").toLowerCase() === uLower,
                      );
                    }
                  } catch (err) {}
                }
                if (target && onSelectUser) {
                  onSelectUser(target, anchorEl);
                } else if (!target) {
                  const rect = anchorEl && typeof anchorEl.getBoundingClientRect === "function" ? anchorEl.getBoundingClientRect() : null;
                  if (rect) {
                    setNotFoundNotice({
                      username,
                      x: rect.left + rect.width / 2,
                      y: Math.max(10, rect.top - 12),
                    });
                    setTimeout(() => setNotFoundNotice(null), 2500);
                  }
                }
              }}
              className="px-1.5 py-0.5 rounded-md font-extrabold text-[var(--theme-accent,#7bae37)] bg-[var(--theme-accent,#7bae37)]/20 hover:bg-[var(--theme-accent,#7bae37)]/35 border border-[var(--theme-accent,#7bae37)]/35 hover:underline cursor-pointer inline-flex items-center gap-0.5 mx-0.5 transition-all select-none"
              title={
                lang === "ar" ? `مناداة @${username}` : `Mention @${username}`
              }
            >
              @{username}
            </span>,
          );
        }
      } else if (
        matchText.startsWith("http://") ||
        matchText.startsWith("https://") ||
        matchText.startsWith("www.")
      ) {
        const fullUrl = matchText.startsWith("www.")
          ? "https://" + matchText
          : matchText;
        const lowerUrl = fullUrl.toLowerCase();

        // Check if image, video, YouTube, Instagram, TikTok, Facebook, Reddit, or Message link
        const isImageLink =
          /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(lowerUrl) ||
          lowerUrl.includes("images.unsplash.com") ||
          lowerUrl.includes("i.imgur.com");
        const isVideoLink = /\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(lowerUrl);
        const isYouTubeLink =
          lowerUrl.includes("youtube.com/watch") ||
          lowerUrl.includes("youtu.be/") ||
          lowerUrl.includes("youtube.com/shorts/") ||
          lowerUrl.includes("youtube.com/embed/") ||
          lowerUrl.includes("youtube.com/live/");
        const isInstagramLink =
          lowerUrl.includes("instagram.com/") ||
          lowerUrl.includes("instagr.am/");
        const isTikTokLink =
          lowerUrl.includes("tiktok.com/") ||
          lowerUrl.includes("vt.tiktok.com/");
        const isFacebookLink =
          lowerUrl.includes("facebook.com/") ||
          lowerUrl.includes("fb.watch/") ||
          lowerUrl.includes("fb.com/");
        const isRedditLink =
          lowerUrl.includes("reddit.com/r/") ||
          lowerUrl.includes("v.redd.it/") ||
          lowerUrl.includes("redd.it/");
        const isMessageLink = Boolean(parseMessageLink(fullUrl));

        if (isImageLink) {
          mediaPreviews.push({ type: "image", url: fullUrl });
        } else if (isVideoLink) {
          mediaPreviews.push({ type: "video", url: fullUrl });
        } else if (isYouTubeLink) {
          mediaPreviews.push({ type: "youtube", url: fullUrl });
        } else if (isInstagramLink) {
          mediaPreviews.push({ type: "instagram", url: fullUrl });
        } else if (isTikTokLink) {
          mediaPreviews.push({ type: "tiktok", url: fullUrl });
        } else if (isFacebookLink) {
          mediaPreviews.push({ type: "facebook", url: fullUrl });
        } else if (isRedditLink) {
          mediaPreviews.push({ type: "reddit", url: fullUrl });
        } else if (isMessageLink) {
          mediaPreviews.push({ type: "msgLink", url: fullUrl });
        } else {
          mediaPreviews.push({ type: "web", url: fullUrl });
        }

        const hasPreview = true;

        // If link has a media preview, hide the raw URL text string from the message body
        if (!hasPreview) {
          const shortenUrlDisplay = (urlStr: string): string => {
            try {
              const urlObj = new URL(
                urlStr.startsWith("http") ? urlStr : "https://" + urlStr,
              );
              const host = urlObj.hostname.replace(/^www\./, "");
              const path = urlObj.pathname + urlObj.search;
              const shortPath =
                path.length > 20 ? path.substring(0, 18) + "…" : path;
              return `${host}${shortPath === "/" ? "" : shortPath}`;
            } catch {
              return urlStr.length > 30
                ? urlStr.substring(0, 28) + "…"
                : urlStr;
            }
          };

          const displayLabel = shortenUrlDisplay(matchText);

          parts.push(
            <a
              key={`url-${matchIndex}`}
              href={fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={
                lang === "ar"
                  ? `رابط كامل: ${fullUrl} (انقر للفتح، أو انقر مزدوجاً للنسخ)`
                  : `Full URL: ${fullUrl} (Click to open, Shift+Click to copy)`
              }
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey) {
                  e.preventDefault();
                  navigator.clipboard.writeText(fullUrl);
                  return;
                }
                e.preventDefault();
                openExternalUrl(fullUrl);
              }}
              className="text-cyan-400 hover:text-cyan-300 font-bold underline underline-offset-2 cursor-pointer transition-colors mx-0.5 inline-flex items-center gap-1 group"
            >
              <span>{displayLabel}</span>
            </a>,
          );
        }
      }

      lastIndex = combinedRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(...parseRichText(content.substring(lastIndex), `rt-end`));
    }

    const hasTextContent = parts.some((p) =>
      typeof p === "string" ? p.trim().length > 0 : true,
    );

    return (
      <div className="flex flex-col gap-2">
        {hasTextContent && (
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {parts}
          </div>
        )}

        {/* Media Link Previews */}
        {mediaPreviews.length > 0 && (
          <div className="flex flex-col gap-2 mt-1">
            {mediaPreviews.map((media, idx) => {
              if (media.type === "image") {
                return (
                  <ExternalImagePreview
                    key={`prev-img-${idx}`}
                    url={media.url}
                    alt="Link Preview"
                    onLoad={() => executeScroll("mediaLoad")}
                  />
                );
              }
              if (media.type === "video") {
                return (
                  <SmartVideoLinkPreview
                    key={`prev-vid-${idx}`}
                    url={media.url}
                    lang={lang}
                    isLight={isLight}
                    onPlayGlobal={onPlayGlobalTrack}
                  />
                );
              }
              if (media.type === "youtube") {
                const ytMatch = media.url.match(
                  /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?(?:.*&)?v=))([\w-]{11})/i,
                );
                const ytId = ytMatch && ytMatch[1] ? ytMatch[1] : "";
                if (ytId) {
                  return (
                    <SmartYouTubePlayer
                      key={`prev-yt-${idx}`}
                      url={media.url}
                      ytId={ytId}
                      lang={lang}
                      isLight={isLight}
                      onPlayGlobal={onPlayGlobalTrack}
                    />
                  );
                }
              }
              if (media.type === "instagram") {
                return (
                  <SmartInstagramEmbed
                    key={`prev-ig-${idx}`}
                    url={media.url}
                    lang={lang}
                    isLight={isLight}
                  />
                );
              }
              if (media.type === "tiktok") {
                return (
                  <SmartTikTokEmbed
                    key={`prev-tt-${idx}`}
                    url={media.url}
                    lang={lang}
                    isLight={isLight}
                  />
                );
              }
              if (media.type === "facebook") {
                return (
                  <SmartFacebookEmbed
                    key={`prev-fb-${idx}`}
                    url={media.url}
                    lang={lang}
                    isLight={isLight}
                  />
                );
              }
              if (media.type === "reddit") {
                return (
                  <SmartRedditEmbed
                    key={`prev-rd-${idx}`}
                    url={media.url}
                    lang={lang}
                    isLight={isLight}
                  />
                );
              }
              if (media.type === "msgLink") {
                return (
                  <MessageLinkPreviewCard
                    key={`prev-msglink-${idx}`}
                    url={media.url}
                    currentServer={server}
                    channels={serverChannels || []}
                    currentChannelId={channel.id}
                    lang={lang}
                    isLight={isLight}
                    onNavigateToMessageLink={onNavigateToMessageLink}
                    scrollToMessage={scrollToMessage}
                  />
                );
              }
              if (media.type === "web") {
                return (
                  <SmartWebLinkPreview
                    key={`prev-web-${idx}`}
                    url={media.url}
                    lang={lang}
                    isLight={isLight}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
    );
  };
  const formatMessageTime = (createdString?: string) => {
    if (!createdString) return "Pending";
    const d = new Date(createdString);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    const timeStr = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (isToday) {
      return toLatinNumerals(timeStr);
    } else {
      const dateStr = d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
        month: "short",
        day: "numeric",
      });
      return toLatinNumerals(`${dateStr} ${timeStr}`);
    }
  };

  const lastMessageIdRef = useRef<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isDmChannel) {
      setPinnedIds([]);
      return;
    }
    setPinnedIds(pbService.getPinnedMessageIds(channel.id));
    pbService.fetchPinnedMessageIds(channel.id).then((freshPins) => {
      setPinnedIds(freshPins);
    });
  }, [channel.id, isDmChannel]);

  const activeValidPinnedIds = React.useMemo(() => {
    if (isDmChannel) return [];
    return pinnedIds.filter((id) => {
      if (MessageDeletionService.isMessageDeleted(id)) return false;
      const msgObj = messages.find((m) => m.id === id);
      if (msgObj && (msgObj.deleted || MessageDeletionService.isMessageDeleted(msgObj.id))) return false;
      return true;
    });
  }, [pinnedIds, messages, isDmChannel]);

  useEffect(() => {
    if (activeValidPinnedIds.length === 0) {
      if (showPinnedDrawer) setShowPinnedDrawer(false);
      if (activeOverlay === "pinned") setActiveOverlay(null);
    }
  }, [activeValidPinnedIds.length, showPinnedDrawer, activeOverlay]);

  const handleTogglePin = React.useCallback(
    async (msgId: string) => {
      if (isDmChannel) return;

      // Optimistic instant state update on client
      setPinnedIds((prev) =>
        prev.includes(msgId)
          ? prev.filter((id) => id !== msgId)
          : [...prev, msgId],
      );

      try {
        if (onTogglePinMessage) {
          await onTogglePinMessage(msgId);
        } else {
          await pbService.togglePinMessage(channel.id, msgId, isDmChannel);
        }
      } catch (err) {
        console.warn("Background pin toggle save warning:", err);
      }
    },
    [isDmChannel, onTogglePinMessage, channel.id],
  );

  const prevIsActiveRef = useRef<boolean>(isActive);
  const lastChannelIdForScrollRef = useRef<string | null>(null);

  const conversationDataRef = useRef({
    inputText,
    replyTo,
    attachments,
    processedAttachments,
    editingMessageId,
    editingText,
    channelSearchQuery,
  });
  conversationDataRef.current = {
    inputText,
    replyTo,
    attachments,
    processedAttachments,
    editingMessageId,
    editingText,
    channelSearchQuery,
  };

  // 1. Save scroll position and conversation state on unmount or channel switch
  useEffect(() => {
    return () => {
      if (scrollRef.current) {
        const scrollEl = scrollRef.current;
        const distFromBottom =
          scrollEl.scrollHeight - scrollEl.clientHeight - scrollEl.scrollTop;
        const existing = conversationCache.get(channel.id) || {};
        conversationCache.set(channel.id, {
          ...existing,
          scrollTop: scrollEl.scrollTop,
          isAtBottom: distFromBottom < 35,
          ...conversationDataRef.current,
        });
      }
    };
  }, [channel.id]);

  const processedAttachmentsRef = useRef(processedAttachments);
  processedAttachmentsRef.current = processedAttachments;

  const isDmChannelRef = useRef(isDmChannel);
  isDmChannelRef.current = isDmChannel;

  useEffect(() => {
    return () => {
      if (
        processedAttachmentsRef.current &&
        processedAttachmentsRef.current.length > 0
      ) {
        processedAttachmentsRef.current.forEach((item) => {
          AttachmentUploadManager.remove(item.id);
          if (item.uploadedAttachment?.id) {
            pbService.deleteAttachmentRecord(
              item.uploadedAttachment.id,
              isDmChannelRef.current,
            );
          }
          if (item.previewUrl && item.previewUrl.startsWith("blob:")) {
            URL.revokeObjectURL(item.previewUrl);
          }
        });
      }
    };
  }, []);

  // 2. Cohesive scroll & state manager for active panel
  useLayoutEffect(() => {
    const currentChanId = channel.id;
    const prevChanId = prevChannelIdRef.current;
    const isChannelChanged = prevChanId !== currentChanId;
    const isBecameActive = isActive && !prevIsActiveRef.current;
    prevIsActiveRef.current = isActive;

    if (isChannelChanged || isBecameActive) {
      isInitialScrollPendingRef.current = true;
      initialChannelLoadLockRef.current = {
        chanId: currentChanId,
        active: true,
      };
      setIsInitialLoadReady(false);
      if (prevChanId && isChannelChanged) {
        const prevSaved = conversationCache.get(prevChanId);
        if (
          prevSaved &&
          prevSaved.processedAttachments &&
          prevSaved.processedAttachments.length > 0
        ) {
          prevSaved.processedAttachments.forEach((item) => {
            AttachmentUploadManager.remove(item.id);
            if (item.uploadedAttachment?.id) {
              pbService.deleteAttachmentRecord(
                item.uploadedAttachment.id,
                isDmChannel,
              );
            }
            if (item.previewUrl && item.previewUrl.startsWith("blob:")) {
              URL.revokeObjectURL(item.previewUrl);
            }
          });
          prevSaved.processedAttachments = [];
          prevSaved.attachments = [];
        }
      }
      prevChannelIdRef.current = currentChanId;
    }

    if (!isActive) {
      setIsInitialLoadReady(false);
      return;
    }

    // If still in initial loading state with 0 messages, wait for messages to arrive
    if (isInitialLoading && sortedMessages.length === 0) {
      setIsInitialLoadReady(false);
      return;
    }

    const lastMsg = sortedMessages[sortedMessages.length - 1];
    const lastMsgId = lastMsg?.id || null;
    const saved = conversationCache.get(currentChanId);

    // If channel changed or initial mount or messages populated for channel first time: restore state and scroll position synchronously before paint
    const isForegroundSwitch =
      lastChannelIdForScrollRef.current !== currentChanId || isBecameActive;
    const isFirstLoadForChannel =
      hasInitialScrolledChanIdRef.current !== currentChanId;
    const isChannelLoadingActive =
      initialChannelLoadLockRef.current.chanId === currentChanId &&
      initialChannelLoadLockRef.current.active;
    const isPendingScroll =
      isInitialScrollPendingRef.current || isFirstLoadForChannel || isChannelLoadingActive;

    if (isForegroundSwitch || isChannelChanged || isPendingScroll) {
      if (sortedMessages.length > 0) {
        lastChannelIdForScrollRef.current = currentChanId;
        lastMessageIdRef.current = lastMsgId;
        hasInitialScrolledChanIdRef.current = currentChanId;

        if (saved) {
          if (isChannelChanged) {
            setInputText(saved.inputText || "");
            setReplyTo(saved.replyTo || null);
            setAttachments(saved.attachments || []);
            setProcessedAttachments(saved.processedAttachments || []);
            setEditingMessageId(saved.editingMessageId || null);
            setEditingText(saved.editingText || "");
            setChannelSearchQuery(saved.channelSearchQuery || "");
          }

          if (scrollRef.current) {
            executeScroll("initial");
          } else {
            // A missing ref must never leave the entire feed permanently
            // hidden. The next render/resize can still restore the scroll
            // position, but the message content is usable immediately.
            setIsInitialLoadReady(true);
          }
        } else {
          if (isChannelChanged) {
            setInputText("");
            setReplyTo(null);
            setAttachments([]);
            setProcessedAttachments([]);
            setEditingMessageId(null);
            setEditingText("");
            setChannelSearchQuery("");
          }

          if (scrollRef.current) {
            executeScroll("initial");
            conversationCache.set(currentChanId, {
              scrollTop: scrollRef.current.scrollHeight,
              isAtBottom: true,
              inputText: "",
              replyTo: null,
              attachments: [],
              processedAttachments: [],
              editingMessageId: null,
              editingText: "",
              channelSearchQuery: "",
            });
          } else {
            setIsInitialLoadReady(true);
          }
        }

        isInitialScrollPendingRef.current = false;
        return;
      } else {
        // Genuinely empty channels (0 messages): reveal immediately
        lastChannelIdForScrollRef.current = currentChanId;
        hasInitialScrolledChanIdRef.current = currentChanId;
        if (initialChannelLoadLockRef.current.chanId === currentChanId) {
          initialChannelLoadLockRef.current.active = false;
        }
        setIsInitialLoadReady(true);
        isInitialScrollPendingRef.current = false;
        return;
      }
    }

    // Handle NEW message arriving while active
    if (lastMsgId && lastMsgId !== lastMessageIdRef.current) {
      const isMyMessage = lastMsg?.sender === currentUser.id;
      if (
        isMyMessage ||
        isAtBottomRef.current ||
        initialChannelLoadLockRef.current.active
      ) {
        executeScroll("newMessage");
      }
      lastMessageIdRef.current = lastMsgId;
    }
  }, [channel.id, isActive, isInitialLoading, sortedMessages, currentUser.id]);

  // Safety valve for transient layout/ref failures or a stalled backend. A
  // loading overlay may be useful briefly, but it must not be able to lock a
  // conversation out forever.
  useEffect(() => {
    if (!isActive || isInitialLoadReady) return;
    const timeoutId = window.setTimeout(() => {
      setIsInitialLoadReady(true);
      isInitialScrollPendingRef.current = false;
      if (initialChannelLoadLockRef.current.chanId === channel.id) {
        initialChannelLoadLockRef.current.active = false;
      }
    }, 1500);
    return () => window.clearTimeout(timeoutId);
  }, [channel.id, isActive, isInitialLoadReady]);

  // Chat cooldown clock decrement
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return toLatinNumerals(
      parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i],
    );
  };

  const prevInputValueRef = useRef("");
  const adjustTextareaHeight = useCallback(() => {
    const el = textInputRef.current;
    if (!el) return;
    const val = el.value;
    if (!val) {
      if (el.style.height !== "36px") el.style.height = "36px";
      prevInputValueRef.current = "";
      return;
    }

    const prevVal = prevInputValueRef.current;
    prevInputValueRef.current = val;

    // Fast path 1: Single-line short text (< 50 chars with no newlines) is guaranteed min-height 36px
    if (!val.includes("\n") && val.length < 50) {
      if (el.style.height !== "36px") {
        el.style.height = "36px";
      }
      return;
    }

    // Fast path 2: If newline counts match and height is already set, skip DOM recalculation
    const prevNewlines = (prevVal.match(/\n/g) || []).length;
    const nextNewlines = (val.match(/\n/g) || []).length;
    if (
      prevNewlines === nextNewlines &&
      Math.abs(val.length - prevVal.length) < 5 &&
      el.style.height &&
      el.style.height !== "36px"
    ) {
      return;
    }

    el.style.height = "auto";
    const scrollH = el.scrollHeight;
    const targetH = `${Math.min(Math.max(36, scrollH), 112)}px`;
    if (el.style.height !== targetH) {
      el.style.height = targetH;
    }
  }, []);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDmChannel && cooldownRemaining > 0) return;
    if (
      !inputText.trim() &&
      processedAttachments.length === 0 &&
      attachments.length === 0
    )
      return;

    // Verify all attachments are completed
    const isAttachmentInProgress = processedAttachments.some(
      (item) =>
        item.status === "compressing" ||
        item.status === "pending" ||
        item.uploadStatus === "queued" ||
        item.uploadStatus === "uploading",
    );
    const isAttachmentFailed = processedAttachments.some(
      (item) =>
        item.uploadStatus === "failed" || item.uploadStatus === "cancelled",
    );
    const hasUnfinishedAttachments = processedAttachments.some(
      (item) =>
        !item.uploadStatus ||
        item.uploadStatus !== "completed" ||
        !item.uploadedAttachment,
    );

    if (
      processedAttachments.length > 0 &&
      (isAttachmentInProgress || isAttachmentFailed || hasUnfinishedAttachments)
    ) {
      return;
    }

    // Capture text & pre-uploaded attachment objects
    const text = inputText;
    const replyId = replyTo?.id;

    const uploadedAttachments = processedAttachments
      .map((item) => item.uploadedAttachment)
      .filter((att): att is Attachment => !!att);

    // Immediately clear in UI and ensure input box keeps focus
    setInputText("");
    setReplyTo(null);
    setProcessedAttachments([]);
    setAttachments([]);
    setMentionQuery(null);
    if (textInputRef.current) {
      textInputRef.current.style.height = "38px";
      textInputRef.current.focus();
    }

    // Trigger instant message creation using pre-uploaded attachment records
    onSendMessage(
      text,
      replyId || undefined,
      undefined,
      uploadedAttachments,
    ).catch((err) => {
      console.error("Failed to transmit message in background:", err);
    });

    const activeCooldown = isDmChannel
      ? 0
      : (channel.cooldown ?? server?.cooldown ?? 0);
    if (activeCooldown > 0) {
      setCooldownRemaining(activeCooldown);
    }

    setTimeout(() => {
      if (textInputRef.current) {
        textInputRef.current.style.height = "38px";
        textInputRef.current.focus();
      }
    }, 10);
  };

  const filteredMentionUsers = React.useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.toLowerCase();
    return mentionUsers.filter((u) => {
      return (
        (u.username || "").toLowerCase().includes(q) ||
        (u.display_name || "").toLowerCase().includes(q)
      );
    });
  }, [mentionUsers, mentionQuery]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredMentionUsers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIndex(
          (prev) => (prev + 1) % Math.min(filteredMentionUsers.length, 6),
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIndex(
          (prev) =>
            (prev - 1 + Math.min(filteredMentionUsers.length, 6)) %
            Math.min(filteredMentionUsers.length, 6),
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        const selectedUser =
          filteredMentionUsers[mentionSelectedIndex] || filteredMentionUsers[0];
        if (selectedUser) {
          handleInsertMention(selectedUser);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    } else if (e.key === "Escape") {
      setMentionQuery(null);
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (inputText.trim() || attachments.length > 0) {
        handleSend(e as any);
      }
      return;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    adjustTextareaHeight();

    if (val.includes('@')) {
      const cursorPos = e.target.selectionStart || val.length;
      const textBeforeCursor = val.slice(0, cursorPos);
      const match = textBeforeCursor.match(/@([a-zA-Z0-9_\u0600-\u06FF]*)$/);

      if (match) {
        const q = match[1].toLowerCase();
        setMentionQuery((prev) => (prev !== q ? q : prev));
        setMentionSelectedIndex(0);
      } else {
        setMentionQuery((prev) => (prev !== null ? null : prev));
      }
    } else {
      setMentionQuery((prev) => (prev !== null ? null : prev));
    }
  };

  const handleInsertMention = (targetUser: User) => {
    const username = targetUser.username || targetUser.display_name;
    const inputEl = textInputRef.current;
    const cursorPos = inputEl?.selectionStart ?? inputText.length;
    const textBeforeCursor = inputText.slice(0, cursorPos);
    const textAfterCursor = inputText.slice(cursorPos);

    let updatedBefore = "";
    if (/@([a-zA-Z0-9_\u0600-\u06FF]*)$/.test(textBeforeCursor)) {
      updatedBefore = textBeforeCursor.replace(
        /@([a-zA-Z0-9_\u0600-\u06FF]*)$/,
        `@${username} `,
      );
    } else {
      const needsSpace =
        textBeforeCursor.length > 0 && !textBeforeCursor.endsWith(" ");
      updatedBefore =
        textBeforeCursor + (needsSpace ? " " : "") + `@${username} `;
    }

    const updatedText = updatedBefore + textAfterCursor;
    setInputText(updatedText);
    setMentionQuery(null);
    setMentionSelectedIndex(0);

    setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        const newPos = updatedBefore.length;
        inputEl.setSelectionRange(newPos, newPos);
        adjustTextareaHeight();
      }
    }, 15);
  };

  const handleAddFiles = (newFiles: File[]) => {
    if (!newFiles || newFiles.length === 0) return;
    const userSettings = getCachedUserSettings();
    const compressionSettings = userSettings.attachmentCompression;

    const initialItems: ProcessedAttachmentItem[] = newFiles.map((f) => ({
      id: generateAttachmentId(),
      file: f,
      originalFile: f,
      isCompressed: false,
      originalSize: f.size,
      compressedSize: f.size,
      mediaType: detectMediaType(f),
      status: "pending",
      progress: 10,
      statusMessage: "Starting optimization...",
      userChoice: "compress",
    }));

    setProcessedAttachments((prev) => [...prev, ...initialItems]);
    setAttachments((prev) => [...prev, ...newFiles]);

    for (let i = 0; i < newFiles.length; i++) {
      const rawFile = newFiles[i];
      const initialId = initialItems[i].id;

      AttachmentProcessor.processSingleFile(
        rawFile,
        compressionSettings,
        (updatedItem) => {
          setProcessedAttachments((prev) =>
            prev.map((item) =>
              item.id === initialId ? { ...updatedItem, id: initialId } : item,
            ),
          );
        },
        initialId,
      )
        .then((finalItem) => {
          setProcessedAttachments((prev) =>
            prev.map((item) =>
              item.id === initialId ? { ...finalItem, id: initialId } : item,
            ),
          );

          // Immediate background upload enqueue as soon as optimization resolves
          const fileToUpload =
            finalItem.userChoice === "compress" && finalItem.compressedFile
              ? finalItem.compressedFile
              : finalItem.file;

          AttachmentUploadManager.enqueue(initialId, fileToUpload, isDmChannel);
        })
        .catch((err) => {
          console.warn(
            "Attachment processing failed, enqueuing raw file:",
            err,
          );
          AttachmentUploadManager.enqueue(initialId, rawFile, isDmChannel);
        });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAddFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeAttachment = (idx: number) => {
    const target = processedAttachments[idx];
    if (target) {
      AttachmentProcessor.cancelProcessing(target.id);
      AttachmentUploadManager.remove(target.id);
      if (target.uploadedAttachment?.id) {
        pbService.deleteAttachmentRecord(
          target.uploadedAttachment.id,
          isDmChannel,
        );
      }
      if (target.previewUrl && target.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
    }
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
    setProcessedAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const isUserAuthorizedToDelete = React.useCallback(
    (msg: Message) => {
      return (
        msg.sender === currentUser.id ||
        currentUser.role === "admin" ||
        currentUser.role === "half-admin"
      );
    },
    [currentUser.id, currentUser.role],
  );

  const isUserAuthorizedToEdit = React.useCallback(
    (msg: Message) => {
      return msg.sender === currentUser.id;
    },
    [currentUser.id],
  );

  const isOwner =
    server?.owner === currentUser.id || currentUser.role === "admin";

  const handleUpdateChannelCooldown = async (secs: number) => {
    try {
      const updated = await pbService.updateChannel(channel.id, {
        cooldown: secs,
      });
      if (onUpdateChannel) onUpdateChannel(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateServerCooldown = async (secs: number) => {
    if (!server) return;
    try {
      const updated = await pbService.updateServer(server.id, {
        cooldown: secs,
      });
      if (onUpdateServer) onUpdateServer(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleChannelDeleteClick = () => {
    const isAr = lang === "ar";
    const message = isAr
      ? "هل أنت متأكد تماماً من حذف هذه القناة بجميع رسائلها نهائياً؟ لا يمكن التراجع عن هذا الإجراء!"
      : "Are you sure you want to permanently delete this channel and all of its messages? This action cannot be undone!";
    if (window.confirm(message)) {
      if (onDeleteChannel) {
        onDeleteChannel(channel.id);
      }
    }
  };

  // Auto-pause all videos when this channel panel becomes inactive
  useEffect(() => {
    if (!isActive && panelRef.current) {
      const videos = panelRef.current.querySelectorAll("video");
      videos.forEach((v) => {
        if (!v.paused) {
          v.pause();
        }
      });
    }
  }, [isActive]);

  // Native Tauri v2 File Drop listener
  useEffect(() => {
    if (!isActive) return;
    let unlistenFn: (() => void) | null = null;
    setupTauriFileDropListener(async (paths, files) => {
      if (files && files.length > 0) {
        handleAddFiles(files);
      } else if (paths && paths.length > 0) {
        const droppedFiles: File[] = [];
        for (const filePath of paths) {
          try {
            const file = await createRealFileFromLocalPath(filePath);
            (file as any).path = filePath;
            droppedFiles.push(file);
          } catch (e) {
            console.warn("Failed to parse dropped file path:", filePath);
          }
        }
        if (droppedFiles.length > 0) {
          handleAddFiles(droppedFiles);
        }
      }
    }).then((unlisten) => {
      unlistenFn = unlisten;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [isActive]);

  return (
    <div
      ref={panelRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`absolute inset-0 flex flex-col min-w-0 h-full transition-all duration-150 ease-out ${panelBgClass} ${
        isDragOver ? "ring-2 ring-accent ring-inset bg-accent/10" : ""
      } ${
        !isActive ? "hidden pointer-events-none" : "animate-in fade-in duration-150 ease-out"
      }`}
      style={{ display: isActive ? "flex" : "none" }}
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      {/* Full-screen Drag & Drop Upload Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-accent/10 flex flex-col items-center justify-center gap-3 z-50 border-4 border-dashed border-accent rounded-2xl m-2 pointer-events-none">
          <Paperclip className="w-12 h-12 text-accent animate-bounce" />
          <span className="text-sm font-bold text-accent bg-slate-900/95 px-4 py-2 rounded-xl border border-accent/20 shadow-xl">
            {lang === "ar"
              ? "أفلت الملفات لرفعها كمرفقات"
              : "Drop files here to attach"}
          </span>
        </div>
      )}
      {/* Header Topic Banner with Deletion options */}
      <div
        className={`sticky top-0 z-30 px-4 h-14 flex items-center justify-between shrink-0 select-none gap-1.5 border-b border-[var(--theme-border)] ${headerBgClass}`}
      >
        <div className="min-w-0 flex-1 flex items-center gap-2">
          {onToggleSidebar && (
            <button
              onClick={() => toggleOverlay("channels")}
              className={`md:hidden p-1.5 sm:p-2 rounded-xl transition-all border cursor-pointer shrink-0 flex items-center gap-1.5 shadow-sm active:scale-95 ${
                activeOverlay === "channels"
                  ? "bg-accent/20 text-accent border-accent/40 shadow-xs"
                  : isLight
                    ? "bg-accent/10 hover:bg-accent/20 text-accent border-accent/30"
                    : "bg-accent/20 hover:bg-accent/30 text-accent border-accent/40"
              }`}
              title={
                lang === "ar" ? "القنوات والتنقل" : "Channels & Navigation"
              }
            >
              <Menu className="w-4 h-4 text-accent" />
              <span className="text-[10px] font-black uppercase tracking-wider hidden xs:inline">
                {lang === "ar" ? "السيرفرات" : "Servers"}
              </span>
            </button>
          )}
          {isDmChannel ? (
            <div className="flex items-center gap-2 min-w-0">
              {channel.recipientUser?.avatar ? (
                <img
                  src={getAvatarUrl(channel.recipientUser)}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover shrink-0 border border-slate-700"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/40 text-accent font-black text-xs flex items-center justify-center shrink-0">
                  @
                </div>
              )}
              <span
                className={`font-extrabold text-xs sm:text-base truncate min-w-0 max-w-[110px] xs:max-w-[180px] sm:max-w-none ${textPrimaryClass}`}
              >
                {channel.name.startsWith("@")
                  ? channel.name
                  : `@${channel.name}`}
              </span>
            </div>
          ) : (
            <span
              className={`font-extrabold text-xs sm:text-base truncate min-w-0 max-w-[110px] xs:max-w-[180px] sm:max-w-none ${textPrimaryClass}`}
            >
              #{channel.name}
            </span>
          )}
          {channel.topic && (
            <span
              className={`hidden md:inline-block text-[10px] px-2 py-0.5 rounded font-medium truncate max-w-xs ${isLight ? "bg-slate-100 text-slate-500" : "bg-white/5 text-slate-500"}`}
            >
              {channel.topic}
            </span>
          )}
        </div>

        {/* Header Action Buttons */}
        <div className="relative shrink-0 flex items-center gap-1 sm:gap-1.5">
          {/* Pinned Messages Toggle Button - Visible ONLY if server channel & has pinned messages */}
          {!isDmChannel && activeValidPinnedIds.length > 0 && (
            <button
              onClick={() => toggleOverlay("pinned")}
              className={`p-1.5 sm:px-2.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 font-bold text-xs border relative shrink-0 ${
                (isDesktop ? showPinnedDrawer : activeOverlay === "pinned")
                  ? "bg-accent/20 text-accent border-accent/40 shadow-xs"
                  : "bg-accent/10 hover:bg-accent/20 text-accent border-accent/30"
              }`}
              title={lang === "ar" ? "الرسائل المثبتة" : "Pinned Messages"}
            >
              <Pin className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="font-mono text-[10px] hidden xs:inline">
                {activeValidPinnedIds.length}
              </span>
            </button>
          )}

          {/* Notifications Button - Placed right next to Pinned Messages Button */}
          <button
            onClick={() => toggleOverlay("notifications")}
            className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 font-bold text-xs border relative shrink-0 ${
              (
                isDesktop
                  ? showNotificationsPopover
                  : activeOverlay === "notifications"
              )
                ? "bg-accent/20 text-accent border-accent/40 shadow-xs"
                : notificationsList.filter((n) => !n.read).length > 0
                  ? "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20"
                  : isLight
                    ? "bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-200"
                    : "bg-white/5 hover:bg-white/10 text-slate-400 border-white/5"
            }`}
            title={lang === "ar" ? "الإشعارات والتنبيهات" : "Notifications"}
          >
            <Bell
              className={`w-3.5 h-3.5 shrink-0 ${notificationsList.filter((n) => !n.read).length > 0 ? "text-accent" : "text-slate-400"}`}
            />
            {notificationsList.filter((n) => !n.read).length > 0 && (
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            )}
          </button>

          {/* DM Call Trigger Buttons & Close DM */}
          {isDmChannel && (
            <div className="flex items-center gap-1 shrink-0">
              {onStartCall && (
                <>
                  <button
                    type="button"
                    onClick={() => onStartCall("voice")}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 font-bold text-xs border shrink-0 ${
                      isLight
                        ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border-emerald-500/30"
                        : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/40"
                    }`}
                    title={lang === "ar" ? "بدء مكالمة صوتية" : "Start Voice Call"}
                  >
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartCall("video")}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 font-bold text-xs border shrink-0 ${
                      isLight
                        ? "bg-accent/10 hover:bg-accent/20 text-accent border-accent/30"
                        : "bg-accent/15 hover:bg-accent/25 text-accent border-accent/40"
                    }`}
                    title={lang === "ar" ? "بدء مكالمة فيديو" : "Start Video Call"}
                  >
                    <Video className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Search in Channel Input Box - Aligned with Server Members list */}
          <div className="relative flex items-center shrink-0 gap-1">
            <div
              className="flex items-center gap-1 px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border transition-all bg-[var(--theme-bg-tertiary)] focus-within:bg-[var(--theme-bg-card)] border-[var(--theme-border)] focus-within:border-accent/50 shadow-xs"
            >
              <Search className="w-3.5 h-3.5 text-[var(--theme-text-muted)] shrink-0" />
              <input
                type="text"
                value={channelSearchQuery}
                onChange={(e) => setChannelSearchQuery(e.target.value)}
                placeholder={lang === "ar" ? "بحث..." : "Search..."}
                className="w-12 xs:w-20 sm:w-32 focus:w-24 sm:focus:w-48 transition-all bg-transparent border-0 outline-none text-xs font-medium text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
              />
              {channelSearchQuery && (
                <button
                  type="button"
                  onClick={() => setChannelSearchQuery("")}
                  className="p-0.5 rounded-full hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] cursor-pointer border-0 shrink-0"
                  title={lang === "ar" ? "مسح البحث" : "Clear search"}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedSearchModal(true)}
              className="p-1.5 sm:p-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-secondary)] hover:text-accent text-[var(--theme-text-muted)] transition-all cursor-pointer shrink-0"
              title={lang === "ar" ? "البحث المتقدم والفلاتر (from:, in:, before:, after:)" : "Advanced Search & Filters (from:, in:, before:, after:)"}
            >
              <Sparkles className="w-3.5 h-3.5 text-accent" />
            </button>
          </div>

          {/* Members Toggle Button */}
          {!isDmChannel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleOverlay("members");
              }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 font-bold text-xs border relative shrink-0 ${
                (isDesktop ? showMemberList : activeOverlay === "members")
                  ? "bg-accent/20 text-accent border-accent/40 shadow-xs"
                  : "bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-secondary)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] border-[var(--theme-border)]"
              }`}
              title={lang === "ar" ? "الأعضاء" : "Members"}
            >
              <Users className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="text-[10px] hidden sm:inline font-mono">
                {unifiedServerMembers.length}
              </span>
            </button>
          )}

          {/* Notifications Popover Component */}
          <NotificationsPopover
            isOpen={
              isDesktop
                ? showNotificationsPopover
                : activeOverlay === "notifications"
            }
            onClose={
              isDesktop
                ? () => setShowNotificationsPopover(false)
                : handleCloseAllOverlays
            }
            notifications={notificationsList}
            onSelectNotification={(notif) => {
              if (isDesktop) {
                setShowNotificationsPopover(false);
              } else {
                handleCloseAllOverlays();
              }
              if (onSelectNotification) {
                onSelectNotification(notif);
              }
            }}
            onMarkAllAsRead={() => {
              if (onMarkAllAsRead) {
                onMarkAllAsRead();
              }
            }}
            onClearNotifications={() => {
              if (onClearNotifications) {
                onClearNotifications();
              }
            }}
            onAcceptFriendRequest={onAcceptFriendRequest}
            onDeclineFriendRequest={onDeclineFriendRequest}
            lang={lang}
            isLight={isLight}
          />

          {/* Pinned Messages Popover Component */}
          <PinnedMessagesPopover
            isOpen={isDesktop ? showPinnedDrawer : activeOverlay === "pinned"}
            onClose={
              isDesktop
                ? () => setShowPinnedDrawer(false)
                : handleCloseAllOverlays
            }
            pinnedIds={activeValidPinnedIds}
            sortedMessages={sortedMessages}
            scrollToMessage={scrollToMessage}
            handleTogglePin={handleTogglePin}
            getAttachmentUrl={getAttachmentUrl}
            isUnrenderableImageFile={isUnrenderableImageFile}
            failedImageIds={failedImageIds}
            setFailedImageIds={setFailedImageIds}
            setGridGalleryList={setGridGalleryList}
            setGalleryState={setGalleryState}
            onPlayGlobalTrack={onPlayGlobalTrack}
            lang={lang}
            isLight={isLight}
          />
        </div>
      </div>
      {/* Floating User Not Found Notice */}
      {notFoundNotice && (
        <div
          style={{ left: notFoundNotice.x, top: notFoundNotice.y }}
          className="fixed -translate-x-1/2 -translate-y-full z-[9999] px-3 py-1.5 rounded-lg bg-red-600/90 text-white text-xs font-bold shadow-lg pointer-events-none transition-all duration-150 select-none animate-in fade-in zoom-in-95"
        >
          {lang === "ar" ? "المستخدم غير موجود" : "User not found"}
        </div>
      )}
      {/* Active Minimized Voice Bar (Mobile only; positioned directly underneath chat header) */}
      {isMobilePlatform() &&
        activeVoiceChannel &&
        activeVoiceChannel.id !== channel.id && (
          <div className="px-3 pt-2.5 shrink-0 z-20">
            <MinimizedVoiceBar
              variant="floating"
              currentChannel={activeVoiceChannel}
              onExpand={onExpandVoice || (() => {})}
              lang={lang}
              t={t}
              theme={theme}
            />
          </div>
        )}
      {/* Main Chat Body Flex Row */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Messages & Input Column */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          {/* Active DM Call Overlay Panel */}
          {isDmChannel && (
            <DMCallOverlay onSelectUser={onSelectUser} lang={lang} />
          )}

          {/* Messages Feed Area with fade animation */}
          <div
            ref={scrollRef}
            onScroll={handleScrollFeed}
            style={{
              overflowAnchor: "auto",
            }}
            className={`flex-1 overflow-y-auto p-6 flex flex-col gap-0 transition-opacity duration-200 ease-out chat-scroll-container opacity-100 ${
              chatSettings?.showScrollInChats
                ? "scrollbar-thin"
                : "scrollbar-none"
            }`}
          >
            <div ref={loadMoreSentinelRef} aria-hidden="true" className="h-px w-full shrink-0" />
            {/* Top Indicator */}
            {sortedMessages.length > 0 && (
              <div className="flex justify-center py-2 shrink-0 select-none">
                {isLoadingMore ? (
                  <div className="flex items-center gap-2 text-xs text-accent font-bold bg-accent/10 px-3.5 py-1.5 rounded-full">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      {lang === "ar"
                        ? "جاري تحميل الرسائل السابقة..."
                        : "Loading previous messages..."}
                    </span>
                  </div>
                ) : hasMoreMessages ? (
                  <button
                    onClick={() => handleLoadMore()}
                    className={`text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 shadow-sm ${
                      isLight
                        ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                        : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
                    }`}
                  >
                    <span>
                      {lang === "ar"
                        ? "تحميل الرسائل السابقة"
                        : "Load previous messages"}
                    </span>
                  </button>
                ) : (
                  <div className="text-center py-2 text-slate-500 select-none">
                    <span className="text-xs italic font-medium">
                      {lang === "ar"
                        ? "هذه هي بداية المحادثة في هذه القناة."
                        : `This is the start of the #${channel.name} channel.`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {React.useMemo(
              () => (
                <>
            {/* Top Virtual Spacer */}
            {topSpacerHeight > 0 && (
              <div
                style={{ height: `${topSpacerHeight}px` }}
                aria-hidden="true"
                className="shrink-0 w-full"
              />
            )}

            {sortedMessages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2 select-none w-full h-full">
                {channelSearchQuery.trim() ? (
                  <>
                    <Search className="w-8 h-8 opacity-40" aria-hidden="true" />
                    <span className="text-sm italic font-medium text-center px-4">
                      {lang === "ar"
                        ? "لم يتم العثور على رسائل مطابقة في الرسائل المحملة."
                        : "No matching messages in the loaded history."}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      {hasMoreMessages && (
                        <button
                          type="button"
                          onClick={() => handleLoadMore()}
                          disabled={isLoadingMore}
                          className="px-3 py-1.5 rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] text-xs font-semibold text-[var(--theme-text-secondary)] disabled:opacity-50 cursor-pointer"
                        >
                          {isLoadingMore
                            ? (lang === "ar" ? "جارٍ التحميل..." : "Loading older messages...")
                            : (lang === "ar" ? "تحميل رسائل أقدم" : "Load older messages")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setChannelSearchQuery("")}
                        className="px-3 py-1.5 rounded-full bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold cursor-pointer border border-accent/25"
                      >
                        {lang === "ar" ? "مسح البحث" : "Clear search"}
                      </button>
                    </div>
                  </>
                ) : isInitialLoading || !isInitialLoadReady || isLoadingMore ? (
                  <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-6 flex flex-col gap-4.5 select-none pointer-events-none">
                    {/* Skeleton Date Divider */}
                    <div className="flex items-center gap-3 my-2 px-2">
                      <div className={`h-[1px] flex-1 ${isLight ? "bg-black/10" : "bg-white/10"}`} />
                      <div className={`h-6 w-28 rounded-full border shadow-sm flex items-center justify-center ${isLight ? "bg-slate-200/80 border-slate-300" : "bg-[var(--theme-bg-secondary)] border-[var(--theme-border)]"}`}>
                        <div className="h-2.5 w-16 rounded-full bg-current opacity-30 animate-pulse" />
                      </div>
                      <div className={`h-[1px] flex-1 ${isLight ? "bg-black/10" : "bg-white/10"}`} />
                    </div>

                    {/* Skeleton Message 1: Group Header with Squircle Avatar */}
                    <div className="flex gap-3 items-start w-full px-2 mt-1">
                      <div className="w-10 h-10 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] shrink-0 animate-pulse mt-0.5" />
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-28 rounded-md bg-[var(--theme-bg-secondary)] animate-pulse" />
                          <div className="h-3.5 w-12 rounded bg-accent/20 border border-accent/30 animate-pulse" />
                          <div className="h-3 w-12 rounded bg-[var(--theme-bg-secondary)]/60 animate-pulse ms-2" />
                        </div>
                        <div className="h-3.5 w-4/5 max-w-md rounded-md bg-[var(--theme-bg-secondary)]/90 animate-pulse" />
                        <div className="h-3.5 w-3/5 max-w-sm rounded-md bg-[var(--theme-bg-secondary)]/70 animate-pulse" />
                      </div>
                    </div>

                    {/* Skeleton Message 2: Continuation Row (no avatar repeated) */}
                    <div className="flex gap-3 items-start w-full px-2">
                      <div className="w-10 shrink-0" />
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="h-3.5 w-2/5 max-w-xs rounded-md bg-[var(--theme-bg-secondary)]/80 animate-pulse" />
                      </div>
                    </div>

                    {/* Skeleton Message 3: Message with Reply Branch */}
                    <div className="flex flex-col gap-1 w-full px-2 mt-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] ms-13 opacity-60">
                        <CornerDownRight className="w-3.5 h-3.5 shrink-0 rotate-180 text-accent/60" />
                        <div className="h-3 w-20 rounded bg-[var(--theme-bg-secondary)] animate-pulse" />
                        <div className="h-3 w-36 rounded bg-[var(--theme-bg-secondary)]/60 animate-pulse" />
                      </div>
                      <div className="flex gap-3 items-start w-full">
                        <div className="w-10 h-10 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] shrink-0 animate-pulse mt-0.5" />
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-32 rounded-md bg-[var(--theme-bg-secondary)] animate-pulse" />
                            <div className="h-3 w-14 rounded bg-[var(--theme-bg-secondary)]/60 animate-pulse ms-2" />
                          </div>
                          <div className="h-3.5 w-3/4 max-w-lg rounded-md bg-[var(--theme-bg-secondary)]/90 animate-pulse" />
                        </div>
                      </div>
                    </div>

                    {/* Skeleton Message 4: Message with Attachment Box */}
                    <div className="flex gap-3 items-start w-full px-2 mt-1.5">
                      <div className="w-10 h-10 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] shrink-0 animate-pulse mt-0.5" />
                      <div className="flex-1 min-w-0 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-24 rounded-md bg-[var(--theme-bg-secondary)] animate-pulse" />
                          <div className="h-3.5 w-10 rounded bg-emerald-500/20 border border-emerald-500/30 animate-pulse" />
                          <div className="h-3 w-12 rounded bg-[var(--theme-bg-secondary)]/60 animate-pulse ms-2" />
                        </div>
                        <div className="h-3.5 w-1/3 max-w-xs rounded-md bg-[var(--theme-bg-secondary)]/90 animate-pulse" />
                        <div className="w-60 sm:w-72 h-36 rounded-2xl bg-[var(--theme-bg-secondary)]/70 border border-[var(--theme-border)] flex items-center justify-center animate-pulse relative overflow-hidden mt-1">
                          <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent/50">
                            <Loader2 className="w-4 h-4 animate-spin" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Loading status badge */}
                    <div className="flex justify-center pt-2">
                      <div className="flex items-center gap-2 text-xs text-accent font-extrabold bg-accent/10 px-4 py-1.5 rounded-full border border-accent/25 shadow-sm">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>
                          {lang === "ar"
                            ? "جاري تحميل المحادثة..."
                            : "Loading messages..."}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-sm italic font-medium">
                      {lang === "ar"
                        ? "هذه هي بداية المحادثة في هذه القناة."
                        : `This is the start of the #${channel.name} channel.`}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${isLight ? "bg-slate-200/50 text-slate-600" : "bg-white/5"}`}
                    >
                      Secured Session
                    </span>
                  </>
                )}
              </div>
            ) : (
              (() => {
                const seenRowKeys = new Set<string>();
                return visibleSlice.map((msg, sliceIdx) => {
                  const index = startIndex + sliceIdx;
                  const msgDate = msg.created
                    ? new Date(msg.created)
                    : new Date();

                let showDateDivider = false;
                let isGroupHeader = true;

                if (index === 0) {
                  showDateDivider = true;
                  isGroupHeader = true;
                } else {
                  const prevMsg = sortedMessages[index - 1];
                  const prevDate = prevMsg.created
                    ? new Date(prevMsg.created)
                    : new Date();

                  if (!isSameCalendarDay(msgDate, prevDate)) {
                    showDateDivider = true;
                    isGroupHeader = true;
                  } else {
                    showDateDivider = false;
                    const isUnreadSep = msg.id === unreadSeparatorMsgId;
                    const isSystemMsg = Boolean(
                      msg.is_system ||
                      (msg as any).type === "system" ||
                      (msg as any).is_call,
                    );
                    const isPrevSystemMsg = Boolean(
                      prevMsg.is_system ||
                      (prevMsg as any).type === "system" ||
                      (prevMsg as any).is_call,
                    );
                    const isDiffUser =
                      getSenderId(msg) !== getSenderId(prevMsg);
                    const timeDiffMs = Math.abs(
                      msgDate.getTime() - prevDate.getTime(),
                    );
                    const isTimeWindowExceeded =
                      timeDiffMs > MESSAGE_GROUPING_WINDOW_MS;

                    if (
                      isUnreadSep ||
                      isSystemMsg ||
                      isPrevSystemMsg ||
                      isDiffUser ||
                      isTimeWindowExceeded
                    ) {
                      isGroupHeader = true;
                    } else {
                      isGroupHeader = false;
                    }
                  }
                }

                const sender = resolveSenderUser(msg);
                const senderId = getSenderId(msg);
                const msgSenderId = senderId || msg.sender || (msg as any).user_id || msg.expand?.sender?.id;
                const clusterInfo = blockedClustersMap.get(msg.id);
                const isSenderBlocked = Boolean(clusterInfo) || Boolean(
                  msgSenderId &&
                    (blockedUserIdsSet.has(msgSenderId) ||
                      (sender?.id && blockedUserIdsSet.has(sender.id)) ||
                      (msg.sender && blockedUserIdsSet.has(msg.sender)))
                );
                const isContinuousBlocked = clusterInfo ? clusterInfo.isContinuous : false;
                const isClusterStart = clusterInfo ? clusterInfo.isClusterStart : true;
                const isClusterRevealed = clusterInfo ? clusterInfo.isClusterRevealed : revealedBlockedMsgIds.has(msg.id);
                const clusterCount = clusterInfo ? clusterInfo.clusterCount : 1;
                const clusterMsgIds = clusterInfo ? clusterInfo.clusterMsgIds : [msg.id];
                const isMsgRevealed = isClusterRevealed;

                // When consecutive blocked messages are hidden, only render the cluster start item (banner)
                if (isSenderBlocked && !isMsgRevealed && !isClusterStart) {
                  return null;
                }

                if (isSenderBlocked && isClusterStart) {
                  isGroupHeader = true;
                }
                let replyToMsg = msg.expand?.reply_to;
                if (replyToMsg) {
                  if (!replyToMsg.expand?.sender && msg.reply_to) {
                    const matched = messageLookup.get(msg.reply_to);
                    if (matched?.expand?.sender) {
                      replyToMsg = {
                        ...replyToMsg,
                        expand: {
                          ...replyToMsg.expand,
                          sender: matched.expand.sender,
                        },
                      };
                    }
                  }
                } else if (msg.reply_to) {
                  replyToMsg = messageLookup.get(msg.reply_to);
                }
                const replySender = resolveSenderUser(replyToMsg);
                const replySenderId = replyToMsg
                  ? getSenderId(replyToMsg) ||
                    (replyToMsg as any).sender ||
                    (replyToMsg as any).user_id ||
                    replyToMsg.expand?.sender?.id
                  : undefined;
                const isReplySenderBlocked = Boolean(
                  replySenderId &&
                    (blockedUserIdsSet.has(replySenderId) ||
                      (replySender?.id && blockedUserIdsSet.has(replySender.id)) ||
                      (replyToMsg?.sender && blockedUserIdsSet.has(replyToMsg.sender)))
                );
                const isReplyRevealed = replyToMsg?.id
                  ? revealedBlockedMsgIds.has(replyToMsg.id)
                  : false;
                const attachmentsList: any[] = [];
                const seenAttachIds = new Set<string>();
                const isDm = Boolean(
                  channel?.recipientUser || (channel as any)?.is_private,
                );
                const rawAtts = [
                  ...(msg.expand?.["attachments_via_message"] || []),
                  ...(msg.expand?.["private_attachments_via_message"] || []),
                  ...(msg.expand?.["attachments(message)"] || []),
                  ...(msg.expand?.["private_attachments(message)"] || []),
                  ...(msg.expand?.attachments || []),
                  ...(msg.expand?.private_attachments || []),
                  ...(Array.isArray(msg.attachments) ? msg.attachments : []),
                ];
                for (const att of rawAtts) {
                  if (!att) continue;
                  if (typeof att === "object" && att.file) {
                    const attKey = att.id || att.file;
                    if (!seenAttachIds.has(attKey)) {
                      seenAttachIds.add(attKey);
                      const normColl =
                        att.collectionName ||
                        att["@collectionName"] ||
                        (att.isPrivate || isDm
                          ? "private_attachments"
                          : "attachments");
                      const normType = inferMimeType(att.file, att.type);
                      attachmentsList.push({
                        ...att,
                        collectionName: normColl,
                        type: normType,
                      });
                    }
                  }
                }
                const baseKey = msg.id || (msg as any).temp_id || `idx-${index}`;
                let msgKey = baseKey;
                if (seenRowKeys.has(msgKey)) {
                  msgKey = `${baseKey}-dup-${sliceIdx}`;
                }
                seenRowKeys.add(msgKey);

                const hasAnimated = animatedMessageIdsRef.current.has(msg.id || msgKey);
                if (!hasAnimated) {
                  animatedMessageIdsRef.current.add(msg.id || msgKey);
                }

                return (
                  <div
                    key={`msg-wrapper-${msgKey}`}
                    id={`msg-${msg.id || msgKey}`}
                    className="w-full flex flex-col shrink-0 relative chat-message-row"
                  >
                    {/* Date Divider (shown when calendar day changes or first message) */}
                    {showDateDivider && (
                      <div
                        key={`date-sep-${msgKey}`}
                        className="flex items-center gap-3 my-4 px-3 select-none"
                      >
                        <div className={`h-[1px] flex-1 ${isLight ? "bg-black/80 dark:bg-[var(--theme-border)] opacity-100" : "bg-[var(--theme-border)] opacity-80"}`} />
                        <span className={`text-[11px] font-extrabold tracking-wide px-3.5 py-1 rounded-full border shadow-sm ${
                          isLight
                            ? "bg-slate-200 text-black border-black/40 font-black dark:bg-[var(--theme-bg-secondary)] dark:text-[var(--theme-text-primary)] dark:border-[var(--theme-border)]"
                            : "bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] border-[var(--theme-border)]"
                        }`}>
                          {formatDateDivider(msgDate, lang)}
                        </span>
                        <div className={`h-[1px] flex-1 ${isLight ? "bg-black/80 dark:bg-[var(--theme-border)] opacity-100" : "bg-[var(--theme-border)] opacity-80"}`} />
                      </div>
                    )}

                    {msg.id === unreadSeparatorMsgId &&
                      msg.sender !== currentUser.id &&
                      msg.expand?.sender?.id !== currentUser.id && (
                        <div
                          key={`unread-sep-${msgKey}`}
                          className="my-3 flex items-center gap-3 px-2 select-none"
                        >
                          <div className="h-[1px] flex-1 bg-red-500/50 dark:bg-red-500/40" />
                          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-red-500 dark:text-red-400 bg-red-500/10 px-3 py-0.5 rounded-full border border-red-500/20 shadow-sm shrink-0">
                            {lang === "ar" ? "رسائل جديدة" : "New Messages"}
                          </span>
                          <div className="h-[1px] flex-1 bg-red-500/50 dark:bg-red-500/40" />
                        </div>
                      )}
                    <div
                      key={`msg-inner-${msgKey}`}
                      onTouchStart={(e) => handleTouchStart(e, msg)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                      onContextMenu={(e) => handleContextMenuMessage(e, msg)}
                      className={`flex flex-col group animate-none select-none md:select-text cursor-pointer rounded-md transition-colors duration-150 ease-out app-message-item relative w-full min-w-0 ${
                        isGroupHeader
                          ? "mt-3.5 pt-1 px-2 pb-0.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                          : "mt-0 py-0 px-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                      } ${
                        focusedMessageId === msg.id
                          ? "ring-2 ring-accent/80 bg-accent/15 shadow-xl shadow-accent/10"
                          : ""
                      }`}
                    >
                      {/* Reply To Reference Banner */}
                      {msg.reply_to &&
                      (!replyToMsg ||
                        replyToMsg.deleted ||
                        replyToMsg.content === "Original message was deleted" ||
                        replyToMsg.content === "تم حذف الرسالة الأصلية" ||
                        replyToMsg.content ===
                          "🗑️ Original message was deleted") ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 ms-13 select-none font-medium p-1 rounded-lg opacity-75">
                          <CornerDownRight className="w-3.5 h-3.5 shrink-0 rotate-180 text-slate-500" />
                          <span className="italic text-slate-400 font-medium flex items-center gap-1">
                            🗑️{" "}
                            {lang === "ar"
                              ? "تم حذف الرسالة الأصلية"
                              : "Original message was deleted"}
                          </span>
                        </div>
                      ) : replyToMsg ? (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            scrollToMessage(replyToMsg.id);
                          }}
                          className="flex items-center gap-1.5 text-[11px] text-slate-500 ms-13 select-none font-medium hover:bg-white/5 p-1 rounded-lg transition-all cursor-pointer group/reply"
                          title={
                            lang === "ar"
                              ? "انتقل إلى الرسالة الأصلية"
                              : "Click to jump to original message"
                          }
                        >
                          <CornerDownRight className="w-3.5 h-3.5 shrink-0 rotate-180 text-accent" />
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isSenderBlocked && !isMsgRevealed) return;
                              if (e.shiftKey && sender) {
                                handleInsertMention(sender);
                              } else if (sender) {
                                onSelectUser?.(sender, e.currentTarget);
                              }
                            }}
                            className={`font-bold ${
                              isSenderBlocked && !isMsgRevealed
                                ? "text-[var(--theme-text-muted)] italic cursor-default"
                                : "hover:underline cursor-pointer"
                            }`}
                            style={
                              !(isSenderBlocked && !isMsgRevealed) && getMemberRoleColor(sender)
                                ? { color: getMemberRoleColor(sender) }
                                : undefined
                            }
                            title={
                              isSenderBlocked && !isMsgRevealed
                                ? undefined
                                : sender
                                  ? lang === "ar"
                                    ? "اضغط Shift للنقر لمناداة العضو"
                                    : "Shift+Click to mention user"
                                  : undefined
                            }
                          >
                            {isSenderBlocked && !isMsgRevealed
                              ? lang === "ar"
                                ? "مستخدم محظور"
                                : "Blocked User"
                              : getMemberDisplayName(sender, senderId)}
                          </span>
                          <span className="text-slate-400 font-semibold">
                            {lang === "ar" ? "يرد على" : "replying to"}
                          </span>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isReplySenderBlocked && !isReplyRevealed) return;
                              if (e.shiftKey && replySender) {
                                handleInsertMention(replySender);
                              } else if (replySender) {
                                onSelectUser?.(replySender, e.currentTarget);
                              }
                            }}
                            className={`font-bold ${
                              isReplySenderBlocked && !isReplyRevealed
                                ? "text-[var(--theme-text-muted)] italic cursor-default"
                                : "hover:underline cursor-pointer"
                            }`}
                            style={
                              !(isReplySenderBlocked && !isReplyRevealed) &&
                              getMemberRoleColor(replySender)
                                ? { color: getMemberRoleColor(replySender) }
                                : undefined
                            }
                            title={
                              isReplySenderBlocked && !isReplyRevealed
                                ? undefined
                                : replySender
                                  ? lang === "ar"
                                    ? "اضغط Shift للنقر لمناداة العضو"
                                    : "Shift+Click to mention user"
                                  : undefined
                            }
                          >
                            {isReplySenderBlocked && !isReplyRevealed
                              ? lang === "ar"
                                ? "مستخدم محظور"
                                : "Blocked User"
                              : getMemberDisplayName(
                                  replySender,
                                  getSenderId(replyToMsg),
                                )}
                          </span>
                          <span className="truncate max-w-[240px] text-slate-400 font-normal group-hover/reply:text-slate-200 transition-colors">
                            |{" "}
                            {isReplySenderBlocked && !isReplyRevealed
                              ? lang === "ar"
                                ? "[رسالة محظورة]"
                                : "[Blocked message]"
                              : replyToMsg.content
                                ? replyToMsg.content
                                : lang === "ar"
                                  ? "مرفق"
                                  : "attachment"}
                          </span>
                        </div>
                      ) : null}

                      {/* Main Message Block */}
                      <div className="flex gap-3 items-start w-full min-w-0">
                        {/* Left Column: Avatar (for Header) OR Timestamp Gutter (for Continuation) */}
                        {isGroupHeader ? (
                          isSenderBlocked && !isMsgRevealed ? (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRevealBlockedCluster(clusterMsgIds);
                              }}
                              className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 shrink-0 flex items-center justify-center select-none app-message-avatar mt-0.5 cursor-pointer hover:bg-amber-500/20 transition-colors"
                              title={
                                isContinuousBlocked
                                  ? lang === "ar"
                                    ? `${clusterCount} رسائل من مستخدم محظور - انقر للعرض`
                                    : `${clusterCount} blocked user messages — Click to show`
                                  : lang === "ar"
                                    ? "رسالة من مستخدم محظور - انقر للعرض"
                                    : "Blocked user message — Click to show"
                              }
                            >
                              <Ban className="w-4 h-4 text-amber-500" />
                            </div>
                          ) : (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                if (e.shiftKey && sender) {
                                  handleInsertMention(sender);
                                } else if (sender) {
                                  onSelectUser?.(sender, e.currentTarget);
                                }
                              }}
                              className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center overflow-hidden select-none cursor-pointer hover:opacity-90 transition-opacity app-message-avatar mt-0.5"
                              title={
                                sender
                                  ? lang === "ar"
                                    ? "اضغط Shift للنقر لمناداة العضو"
                                    : "Shift+Click to mention user"
                                  : undefined
                              }
                            >
                              {getMemberAvatarUrl(sender, senderId) ? (
                                <img
                                  src={getMemberAvatarUrl(sender, senderId)}
                                  alt="Avatar"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="font-mono font-bold text-xs text-slate-400">
                                  {sender?.username
                                    ? sender.username
                                        .substring(0, 2)
                                        .toUpperCase()
                                    : "U"}
                                </span>
                              )}
                            </div>
                          )
                        ) : (
                          <div className="w-10 app-message-gutter shrink-0 select-none" />
                        )}

                        {/* Timestamp on opposite side for continuous messages */}
                        {!isGroupHeader && (
                          <div className="absolute top-1 end-2 sm:end-3 z-10 flex items-center gap-1.5 select-none opacity-0 group-hover:opacity-70 transition-opacity pointer-events-none">
                            <span className="text-[10px] text-slate-400 font-mono">
                              {formatMessageTime(msg.created)}
                            </span>
                            {isMessageEdited(msg) && !(isSenderBlocked && !isMsgRevealed) && (
                              <span
                                className="text-[9px] text-slate-400/80 font-mono italic"
                                title={
                                  lang === "ar"
                                    ? `آخر تعديل: ${formatMessageTime(msg.edited_at || msg.updated || msg.created)}`
                                    : `Edited at ${formatMessageTime(msg.edited_at || msg.updated || msg.created)}`
                                }
                              >
                                ({lang === "ar" ? "معدّل" : "edited"})
                              </span>
                            )}
                          </div>
                        )}

                        {/* Body of message */}
                        <div className="flex-1 min-w-0">
                          {/* Header Row (Author, Badges, Timestamp) - Only rendered for group headers */}
                          {isGroupHeader && (
                            <div className="flex items-center justify-between gap-2 select-none min-w-0 w-full mb-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                {isSenderBlocked && !isMsgRevealed ? (
                                  <span className="font-bold text-sm text-[var(--theme-text-muted)] italic truncate">
                                    {isContinuousBlocked
                                      ? lang === "ar"
                                        ? `مستخدم محظور (${clusterCount} رسائل)`
                                        : `Blocked User (${clusterCount} messages)`
                                      : lang === "ar"
                                        ? "مستخدم محظور"
                                        : "Blocked User"}
                                  </span>
                                ) : (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (e.shiftKey && sender) {
                                        handleInsertMention(sender);
                                      } else if (sender) {
                                        onSelectUser?.(sender, e.currentTarget);
                                      }
                                    }}
                                    className={`font-bold text-sm hover:underline cursor-pointer truncate ${senderNameClass}`}
                                    style={
                                      getMemberRoleColor(sender)
                                        ? { color: getMemberRoleColor(sender) }
                                        : undefined
                                    }
                                    title={
                                      sender
                                        ? lang === "ar"
                                          ? "اضغط Shift للنقر لمناداة العضو"
                                          : "Shift+Click to mention user"
                                        : undefined
                                    }
                                  >
                                    {getMemberDisplayName(sender, senderId)}
                                  </span>
                                )}
                                {pinnedIds.includes(msg.id) && (
                                  <span
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 flex items-center gap-1 border border-amber-500/20 shrink-0"
                                    title={
                                      lang === "ar"
                                        ? "رسالة مثبتة"
                                        : "Pinned Message"
                                    }
                                  >
                                    <Pin className="w-2.5 h-2.5 shrink-0" />
                                    <span className="hidden sm:inline">
                                      {lang === "ar" ? "مثبتة" : "Pinned"}
                                    </span>
                                  </span>
                                )}
                              </div>

                              {/* Timestamp displayed on the other side */}
                              <div className="flex items-center gap-1.5 shrink-0 select-none opacity-70 group-hover:opacity-100 transition-opacity">
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {formatMessageTime(msg.created)}
                                </span>
                                {isMessageEdited(msg) && !(isSenderBlocked && !isMsgRevealed) && (
                                  <span
                                    className="text-[9px] text-slate-400/80 font-mono italic"
                                    title={
                                      lang === "ar"
                                        ? `آخر تعديل: ${formatMessageTime(msg.edited_at || msg.updated || msg.created)}`
                                        : `Edited at ${formatMessageTime(msg.edited_at || msg.updated || msg.created)}`
                                    }
                                  >
                                    ({lang === "ar" ? "معدّل" : "edited"})
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Content text or Edit Textarea or Blocked User Message Placeholder */}
                          {(() => {
                            if (isSenderBlocked && !isMsgRevealed) {
                              return (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRevealBlockedCluster(clusterMsgIds);
                                  }}
                                  className={`p-3 my-1.5 rounded-xl border flex items-center justify-between gap-3 text-xs shadow-xs cursor-pointer transition-colors ${
                                    isLight
                                      ? "bg-amber-50/80 border-amber-200 text-amber-900 hover:bg-amber-100/70"
                                      : "bg-amber-950/30 border-amber-800/40 text-amber-200 hover:bg-amber-950/50"
                                  }`}
                                  title={
                                    isContinuousBlocked
                                      ? lang === "ar"
                                        ? `انقر لعرض ${clusterCount} رسائل محظورة متتالية`
                                        : `Click to show ${clusterCount} consecutive blocked messages`
                                      : lang === "ar"
                                        ? "انقر لعرض محتوى الرسالة المحظورة"
                                        : "Click to show blocked message content"
                                  }
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Ban className="w-4 h-4 text-amber-500 shrink-0" />
                                    <span className="font-semibold text-xs truncate">
                                      {isContinuousBlocked
                                        ? lang === "ar"
                                          ? `${clusterCount} رسائل محظورة متتالية - انقر للعرض`
                                          : `${clusterCount} consecutive blocked messages — Click to show`
                                        : lang === "ar"
                                          ? "رسالة محظورة - انقر للعرض"
                                          : "Blocked message — Click to show"}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleRevealBlockedCluster(clusterMsgIds);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-extrabold text-[11px] transition-colors cursor-pointer border border-amber-500/30 shrink-0 active:scale-95"
                                  >
                                    {isContinuousBlocked
                                      ? lang === "ar"
                                        ? "عرض الكل"
                                        : "Show all"
                                      : lang === "ar"
                                        ? "عرض الرسالة"
                                        : "Click to show"}
                                  </button>
                                </div>
                              );
                            }

                            if (isSenderBlocked && isMsgRevealed) {
                              return (
                                <div className="space-y-1.5">
                                  {(!isContinuousBlocked || isClusterStart) && (
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                                        <Ban className="w-3 h-3" />
                                        <span>
                                          {isContinuousBlocked
                                            ? lang === "ar"
                                              ? `${clusterCount} رسائل من مستخدم محظور`
                                              : `${clusterCount} blocked user messages`
                                            : lang === "ar"
                                              ? "رسالة من مستخدم محظور"
                                              : "Blocked user message"}
                                        </span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleRevealBlockedCluster(clusterMsgIds);
                                        }}
                                        className="text-[10px] font-bold text-amber-500/80 hover:text-amber-500 hover:underline cursor-pointer border-0 bg-transparent"
                                      >
                                        {isContinuousBlocked
                                          ? lang === "ar"
                                            ? "إخفاء الكل"
                                            : "Hide all"
                                          : lang === "ar"
                                            ? "إخفاء"
                                            : "Hide"}
                                      </button>
                                    </div>
                                  )}

                                  {editingMessageId === msg.id ? (
                                    <div className="flex flex-col gap-2 mt-2 w-full max-w-lg select-text">
                                      <textarea
                                        value={editingText}
                                        onChange={(e) => setEditingText(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            if (editingText.trim()) {
                                              handleSaveEditMessage(msg.id);
                                            }
                                          } else if (e.key === "Escape") {
                                            e.preventDefault();
                                            setEditingMessageId(null);
                                          }
                                        }}
                                        maxLength={6000}
                                        className={`w-full p-2.5 text-sm rounded-xl focus:outline-none border bg-transparent ${themeClasses.inputText} ${themeClasses.border}`}
                                        rows={2}
                                      />
                                      <div className="flex gap-2 justify-end">
                                        <button
                                          onClick={() => setEditingMessageId(null)}
                                          className="text-xs text-slate-400 hover:text-slate-300 px-3 py-1 cursor-pointer border-0 bg-transparent"
                                        >
                                          {t("cancel") || "Cancel"}
                                        </button>
                                        <button
                                          onClick={() => handleSaveEditMessage(msg.id)}
                                          disabled={!editingText.trim()}
                                          className="text-xs bg-accent text-[var(--theme-accent-contrast,#ffffff)] px-3 py-1 rounded-md font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer border-0"
                                        >
                                          {t("save") || "Save"}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      className={`break-words select-text font-normal text-start ${themeClasses.textPrimary} ${
                                        isEmojiOnlyMessage(msg.content)
                                          ? "text-3xl sm:text-4xl py-1 leading-tight"
                                          : "text-sm sm:text-base leading-relaxed"
                                      }`}
                                      dir={lang === "ar" ? "rtl" : "ltr"}
                                      style={{ textAlign: lang === "ar" ? "right" : "left" }}
                                    >
                                      {isEmojiOnlyMessage(msg.content) ? (
                                        <span>{msg.content}</span>
                                      ) : (
                                        <FormattedMessageContent
                                          content={msg.content}
                                          lang={lang}
                                          renderFormattedContent={renderFormattedContent}
                                        />
                                      )}
                                      {isMessageEdited(msg) && (
                                        <span className="text-[10px] text-slate-500 ms-1.5 italic select-none font-normal">
                                          ({lang === "ar" ? "معدلة" : "edited"})
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            if (editingMessageId === msg.id) {
                              return (
                                <div className="flex flex-col gap-2 mt-2 w-full max-w-lg select-text">
                                  <textarea
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        if (editingText.trim()) {
                                          handleSaveEditMessage(msg.id);
                                        }
                                      } else if (e.key === "Escape") {
                                        e.preventDefault();
                                        setEditingMessageId(null);
                                      }
                                    }}
                                    maxLength={6000}
                                    className={`w-full p-2.5 text-sm rounded-xl focus:outline-none border bg-transparent ${themeClasses.inputText} ${themeClasses.border}`}
                                    rows={2}
                                    autoFocus
                                  />
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      onClick={() => setEditingMessageId(null)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${secondaryBtnClass}`}
                                    >
                                      {lang === "ar" ? "إلغاء" : "Cancel"}
                                    </button>
                                    <button
                                      onClick={() => handleSaveEditMessage(msg.id)}
                                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--theme-accent-contrast,#ffffff)] bg-accent hover:opacity-90 transition-all border-0 cursor-pointer"
                                    >
                                      {lang === "ar" ? "حفظ" : "Save"}
                                    </button>
                                  </div>
                                </div>
                              );
                            }

                            const callLog = parseCallLog(msg.content);
                            if (callLog) {
                              const isVideo = callLog.type === "video";
                              const isMissed = callLog.status === "missed";
                              const isDeclined = callLog.status === "declined";
                              const isCancelled = callLog.status === "cancelled";

                              const CallIcon = isMissed
                                ? isVideo
                                  ? VideoOff
                                  : PhoneMissed
                                : isDeclined || isCancelled
                                ? PhoneOff
                                : isVideo
                                ? Video
                                : PhoneCall;

                              let title = "";
                              let subtitle = "";

                              if (isMissed) {
                                title =
                                  lang === "ar"
                                    ? isVideo
                                      ? "مكالمة فيديو فائتة"
                                      : "مكالمة صوتية فائتة"
                                    : isVideo
                                    ? "Missed Video Call"
                                    : "Missed Voice Call";
                                subtitle = lang === "ar" ? "لم يتم الرد" : "No answer";
                              } else if (isDeclined) {
                                title =
                                  lang === "ar"
                                    ? isVideo
                                      ? "مكالمة فيديو مرفوضة"
                                      : "مكالمة صوتية مرفوضة"
                                    : isVideo
                                    ? "Declined Video Call"
                                    : "Declined Voice Call";
                                subtitle = lang === "ar" ? "تم رفض المكالمة" : "Call declined";
                              } else if (isCancelled) {
                                title =
                                  lang === "ar"
                                    ? isVideo
                                      ? "مكالمة فيديو ملغاة"
                                      : "مكالمة صوتية ملغاة"
                                    : isVideo
                                    ? "Cancelled Video Call"
                                    : "Cancelled Voice Call";
                                subtitle = lang === "ar" ? "تم إلغاء الاتصال" : "Cancelled call";
                              } else {
                                title =
                                  lang === "ar"
                                    ? isVideo
                                      ? "انتهت مكالمة الفيديو"
                                      : "انتهت المكالمة الصوتية"
                                    : isVideo
                                    ? "Video Call Ended"
                                    : "Voice Call Ended";
                                subtitle =
                                  callLog.duration > 0
                                    ? lang === "ar"
                                      ? `المدة: ${formatCallDuration(callLog.duration)}`
                                      : `Duration: ${formatCallDuration(callLog.duration)}`
                                    : lang === "ar"
                                    ? "مكالمة متصلة"
                                    : "Connected";
                              }

                              const iconColorClass = isMissed
                                ? "bg-rose-500/15 text-rose-500 border-rose-500/30"
                                : isDeclined || isCancelled
                                ? "bg-slate-500/15 text-slate-400 border-slate-500/30"
                                : "bg-accent/15 text-accent border-accent/30";

                              return (
                                <div
                                  className="flex items-center justify-between gap-3 p-3 my-1.5 rounded-2xl border max-w-sm select-none shadow-xs transition-colors bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div
                                      className={`p-2.5 rounded-xl border flex items-center justify-center shrink-0 ${iconColorClass}`}
                                    >
                                      <CallIcon className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <div
                                        className={`text-xs font-bold truncate ${
                                          isMissed ? "text-rose-500" : "text-[var(--theme-text-primary)]"
                                        }`}
                                      >
                                        {title}
                                      </div>
                                      <div className="text-[11px] text-[var(--theme-text-muted)] font-medium truncate">
                                        {subtitle}
                                      </div>
                                    </div>
                                  </div>
                                  {onStartCall && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onStartCall(callLog.type || "voice");
                                      }}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer shrink-0 ${
                                        isMissed
                                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20 active:scale-95"
                                          : "bg-accent/10 text-accent border-accent/20 hover:bg-accent/20 active:scale-95"
                                      }`}
                                    >
                                      {isVideo ? (
                                        <Video className="w-3.5 h-3.5" />
                                      ) : (
                                        <Phone className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {lang === "ar" ? "معاودة الاتصال" : "Call Back"}
                                      </span>
                                    </button>
                                  )}
                                </div>
                              );
                            }

                            const isEmojiOnly = isEmojiOnlyMessage(msg.content);
                            if (isEmojiOnly) {
                              const trimmed = (msg.content || "").trim();
                              const isShort = trimmed.length <= 8;
                              return (
                                <div
                                  className={`select-text break-words leading-tight py-0.5 select-none text-start ${
                                    isShort ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"
                                  } ${isGroupHeader ? "mt-0.5" : "mt-0"}`}
                                  dir={lang === "ar" ? "rtl" : "ltr"}
                                  style={{ textAlign: lang === "ar" ? "right" : "left" }}
                                >
                                  <span>{msg.content}</span>
                                  {isMessageEdited(msg) && (
                                    <span className="text-[10px] text-slate-500 ms-1.5 italic select-none font-normal">
                                      ({lang === "ar" ? "معدلة" : "edited"})
                                    </span>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <div
                                className={`text-sm leading-relaxed whitespace-pre-wrap select-text break-words app-message-text app-chat-text text-start ${messageTextClass} ${isGroupHeader ? "mt-0.5" : "mt-0"}`}
                                dir={lang === "ar" ? "rtl" : "ltr"}
                                style={{ textAlign: lang === "ar" ? "right" : "left" }}
                              >
                                <FormattedMessageContent
                                  content={msg.content}
                                  lang={lang}
                                  renderFormattedContent={renderFormattedContent}
                                />
                              </div>
                            );
                          })()}

                          {/* Dynamic media & file attachments render */}
                          {attachmentsList.length > 0 &&
                            !(isSenderBlocked && !isMsgRevealed) &&
                            (() => {
                              const audioAttachments = attachmentsList.filter((a) =>
                                isAttachmentAudio(a.file, a.type),
                              );
                              const nonAudioAttachments = attachmentsList.filter(
                                (a) => !isAttachmentAudio(a.file, a.type),
                              );

                              const senderAvatarUrl = getAvatarUrl(
                                msg.expand?.sender,
                              );
                              const audioTracks = audioAttachments.map((a) => ({
                                id: a.id,
                                src: getAttachmentUrl(a),
                                title:
                                  cleanFilename(a.title || a.displayName || a.file),
                                artist:
                                  a.artist ||
                                  msg.expand?.sender?.display_name ||
                                  msg.expand?.sender?.username,
                                senderAvatar: senderAvatarUrl,
                                filename: a.file,
                                mimeType: a.type,
                                downloadedFiles: a.downloaded_files,
                              }));

                              return (
                                <div className="w-full mt-1.5">
                              <div className="flex flex-col gap-2">
                                {/* Grouped Audio Player for single or multiple music files */}
                                {audioTracks.length > 0 && (
                                  <MultiAudioAttachmentPlayer
                                    tracks={audioTracks}
                                    lang={lang}
                                    isLight={isLight}
                                    onPlayGlobal={onPlayGlobalTrack}
                                  />
                                )}

                                {/* Non-audio attachments */}
                                {nonAudioAttachments.length > 0 &&
                                  (nonAudioAttachments.length >= 4 ? (
                                    <div className="flex flex-col gap-2 max-w-lg md:max-w-xl">
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {nonAudioAttachments.length > 4 ? (
                                          <>
                                            {nonAudioAttachments
                                              .slice(0, 3)
                                              .map((attach, idx) => {
                                                const isFailed =
                                                  failedImageIds.has(attach.id);
                                                const isUnrenderable =
                                                  isAttachmentUnrenderable(
                                                    attach.file,
                                                    attach.type,
                                                    isFailed,
                                                  );
                                                const isImage =
                                                  isAttachmentImage(
                                                    attach.file,
                                                    attach.type,
                                                    isFailed,
                                                  );
                                                const downloadUrl =
                                                  getAttachmentUrl(attach);
                                                return (
                                                  <div
                                                    key={attach.id}
                                                    onClick={() =>
                                                      setGalleryState({
                                                        list: nonAudioAttachments,
                                                        initialIndex: idx,
                                                      })
                                                    }
                                                    className={`relative rounded-xl overflow-hidden border shadow-sm h-24 cursor-pointer group/attach ${attachmentItemBgClass}`}
                                                  >
                                                    {isImage ? (
                                                      <UploadedImagePreview
                                                        src={getAttachmentThumbnailUrl(attach, "300x300")}
                                                        alt="Attachment"
                                                        maxPreviewWidth={300}
                                                        maxPreviewHeight={300}
                                                        className="w-full h-full object-cover group-hover/attach:scale-105 transition-all"
                                                        onError={() =>
                                                          setFailedImageIds(
                                                            (prev) =>
                                                              new Set(prev).add(
                                                                attach.id,
                                                              ),
                                                          )
                                                        }
                                                      />
                                                    ) : isUnrenderable ? (
                                                      <div className="w-full h-full p-2 flex flex-col items-center justify-center text-center bg-accent/10 border border-accent/20">
                                                        <Aperture className="w-5 h-5 text-accent mb-1 animate-pulse" />
                                                        <span className="text-[9px] font-black text-accent uppercase truncate w-full">
                                                          {attach.file
                                                            .split(".")
                                                            .pop()
                                                            ?.toUpperCase() ||
                                                            "EXR"}
                                                        </span>
                                                        <span className="text-[8px] text-slate-400 truncate w-full">
                                                          {attach.file}
                                                        </span>
                                                      </div>
                                                    ) : (
                                                      <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-[10px]">
                                                        <FileText className="w-5 h-5 text-accent mb-1" />
                                                        <span className="truncate w-full font-semibold">
                                                          {attach.file}
                                                        </span>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            {/* 4th item with +N overlay */}
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                setGridGalleryList(nonAudioAttachments);
                                              }}
                                              className="relative rounded-xl overflow-hidden border shadow-sm h-24 cursor-pointer group/attach bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] flex items-center justify-center z-10 w-full appearance-none outline-none focus:outline-none"
                                            >
                                              {isAttachmentImage(
                                                nonAudioAttachments[3]?.file,
                                                nonAudioAttachments[3]?.type,
                                                failedImageIds.has(
                                                  nonAudioAttachments[3]?.id,
                                                ),
                                              ) ? (
                                                <img
                                                  src={getAttachmentThumbnailUrl(
                                                    nonAudioAttachments[3],
                                                    "300x300",
                                                  )}
                                                  alt="Attachment"
                                                  loading="eager"
                                                  decoding="async"
                                                  className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none select-none"
                                                  referrerPolicy="no-referrer"
                                                />
                                              ) : (
                                                <Aperture className="w-6 h-6 text-accent opacity-25 pointer-events-none select-none" />
                                              )}
                                              <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-white p-1.5 text-center z-20 pointer-events-none select-none">
                                                <span className="text-xl font-black text-accent drop-shadow-md">
                                                  +
                                                  {nonAudioAttachments.length -
                                                    3}
                                                </span>
                                                <span className="text-[9px] font-extrabold text-slate-200 uppercase tracking-wider">
                                                  {lang === "ar"
                                                    ? "المزيد"
                                                    : "More"}
                                                </span>
                                              </div>
                                            </button>
                                          </>
                                        ) : (
                                          nonAudioAttachments
                                            .slice(0, 4)
                                            .map((attach, idx) => {
                                              const isFailed =
                                                failedImageIds.has(attach.id);
                                              const isUnrenderable =
                                                isAttachmentUnrenderable(
                                                  attach.file,
                                                  attach.type,
                                                  isFailed,
                                                );
                                              const isImage = isAttachmentImage(
                                                attach.file,
                                                attach.type,
                                                isFailed,
                                              );
                                              const downloadUrl =
                                                getAttachmentUrl(attach);
                                              return (
                                                <div
                                                  key={attach.id}
                                                  onClick={() =>
                                                    setGalleryState({
                                                      list: nonAudioAttachments,
                                                      initialIndex: idx,
                                                    })
                                                  }
                                                  className={`relative rounded-xl overflow-hidden border shadow-sm h-24 cursor-pointer group/attach ${attachmentItemBgClass}`}
                                                >
                                                  {isImage ? (
                                                    <UploadedImagePreview
                                                      src={getAttachmentThumbnailUrl(attach, "300x300")}
                                                      alt="Attachment"
                                                      maxPreviewWidth={300}
                                                      maxPreviewHeight={300}
                                                      className="w-full h-full object-cover group-hover/attach:scale-105 transition-all"
                                                      onError={() =>
                                                        setFailedImageIds(
                                                          (prev) =>
                                                            new Set(prev).add(
                                                              attach.id,
                                                            ),
                                                        )
                                                      }
                                                    />
                                                  ) : isUnrenderable ? (
                                                    <div className="w-full h-full p-2 flex flex-col items-center justify-center text-center bg-accent/10 border border-accent/20">
                                                      <Aperture className="w-5 h-5 text-accent mb-1 animate-pulse" />
                                                      <span className="text-[9px] font-black text-accent uppercase truncate w-full">
                                                        {attach.file
                                                          .split(".")
                                                          .pop()
                                                          ?.toUpperCase() ||
                                                          "EXR"}
                                                      </span>
                                                      <span className="text-[8px] text-slate-400 truncate w-full">
                                                        {attach.file}
                                                      </span>
                                                    </div>
                                                  ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-[10px]">
                                                      <FileText className="w-5 h-5 text-accent mb-1" />
                                                      <span className="truncate w-full font-semibold">
                                                        {attach.file}
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col gap-2.5 w-full max-w-full sm:max-w-lg">
                                      {nonAudioAttachments.map(
                                        (attach, idx) => {
                                          const fileNameLower = (
                                            attach.file || ""
                                          ).toLowerCase();
                                          const isFailed = failedImageIds.has(
                                            attach.id,
                                          );
                                          const isUnrenderable =
                                            isAttachmentUnrenderable(
                                              attach.file,
                                              attach.type,
                                              isFailed,
                                            );
                                          const isImage = isAttachmentImage(
                                            attach.file,
                                            attach.type,
                                            isFailed,
                                          );
                                          const isVideo = isAttachmentVideo(
                                            attach.file,
                                            attach.type,
                                          );
                                          const downloadUrl =
                                            getAttachmentUrl(attach);
                                          const extMatch =
                                            fileNameLower.match(
                                              /\.([a-z0-9]+)$/i,
                                            );
                                          const fileExt = extMatch
                                            ? extMatch[1].toUpperCase()
                                            : "";

                                          const isPdf = fileExt === "PDF";
                                          const isArchive = [
                                            "ZIP",
                                            "RAR",
                                            "7Z",
                                            "TAR",
                                            "GZ",
                                          ].includes(fileExt);
                                          const isDoc = [
                                            "DOC",
                                            "DOCX",
                                            "XLS",
                                            "XLSX",
                                            "PPT",
                                            "PPTX",
                                            "TXT",
                                            "CSV",
                                          ].includes(fileExt);

                                          if (isImage) {
                                            const dlItem =
                                              getDownloadByAttachmentId(
                                                attach.id || downloadUrl,
                                              );
                                            const isDlDownloading =
                                              dlItem?.status === "downloading";
                                            const isDlCompleted =
                                              dlItem?.status === "completed";
                                            const showControlAlways = Boolean(
                                              dlItem &&
                                              (isDlDownloading ||
                                                isDlCompleted ||
                                                dlItem.status === "failed" ||
                                                dlItem.status === "cancelled"),
                                            );

                                            let attachAspect = "16 / 9";
                                            const wNum = Number(attach.width);
                                            const hNum = Number(attach.height);
                                            if (
                                              !isNaN(wNum) &&
                                              !isNaN(hNum) &&
                                              hNum > 0
                                            ) {
                                              attachAspect = `${wNum} / ${hNum}`;
                                            } else if (
                                              (attach as any).meta?.width &&
                                              (attach as any).meta?.height
                                            ) {
                                              attachAspect = `${(attach as any).meta.width} / ${(attach as any).meta.height}`;
                                            }

                                            return (
                                              <div
                                                key={
                                                  attach.id
                                                    ? `${attach.id}-${idx}`
                                                    : `attach-img-${idx}`
                                                }
                                                className="w-fit max-w-full max-w-[420px] inline-flex flex-col relative group/img rounded-2xl overflow-hidden border border-[var(--theme-border)] shadow-md bg-transparent"
                                              >
                                                <div className="relative w-fit max-w-full flex items-center justify-center">
                                                  <UploadedImagePreview
                                                    src={getAttachmentThumbnailUrl(attach, "960x720")}
                                                    alt="Attachment"
                                                    width={attach.width}
                                                    height={attach.height}
                                                    aspectRatio={attachAspect}
                                                    maxPreviewWidth={960}
                                                    maxPreviewHeight={720}
                                                    className="max-h-80 w-auto max-w-full rounded-2xl object-contain hover:scale-[1.005] transition-all cursor-zoom-in block"
                                                    onClick={() =>
                                                      setGalleryState({
                                                        list: nonAudioAttachments,
                                                        initialIndex: idx,
                                                      })
                                                    }
                                                    onError={() =>
                                                      setFailedImageIds(
                                                        (prev) =>
                                                          new Set(prev).add(
                                                            attach.id,
                                                          ),
                                                      )
                                                    }
                                                  />
                                                  <div
                                                    className={`absolute top-2 right-2 transition-all z-10 ${showControlAlways ? "opacity-100" : "opacity-0 group-hover/img:opacity-100 focus-within:opacity-100"}`}
                                                  >
                                                    <AttachmentDownloadControl
                                                      attachmentId={
                                                        attach.id || downloadUrl
                                                      }
                                                      filename={attach.file}
                                                      downloadUrl={downloadUrl}
                                                      mimeType={attach.type}
                                                      downloadedFiles={
                                                        attach.downloaded_files
                                                      }
                                                      lang={lang}
                                                      isLight={isLight}
                                                      variant="button"
                                                    />
                                                  </div>
                                                </div>

                                                {isDlDownloading && (
                                                  <div className="w-full bg-slate-950/90 px-3 py-1.5 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-accent">
                                                    <div className="flex items-center gap-2 flex-1 me-2">
                                                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                                        <div
                                                          className="h-full bg-accent transition-all duration-300 rounded-full"
                                                          style={{
                                                            width: `${dlItem.progress}%`,
                                                          }}
                                                        />
                                                      </div>
                                                    </div>
                                                    <span className="font-bold shrink-0">
                                                      {dlItem.progress}%
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          }

                                          if (isUnrenderable) {
                                            return (
                                              <div
                                                key={
                                                  attach.id
                                                    ? `${attach.id}-${idx}`
                                                    : `attach-exr-${idx}`
                                                }
                                                onClick={() =>
                                                  setGalleryState({
                                                    list: nonAudioAttachments,
                                                    initialIndex: idx,
                                                  })
                                                }
                                                className="w-full max-w-sm sm:max-w-md p-3.5 rounded-2xl border shadow-md flex items-center justify-between gap-3 cursor-pointer group/exr transition-all bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-accent/40"
                                              >
                                                <div className="flex items-center gap-3 min-w-0">
                                                  <div className="w-11 h-11 rounded-xl bg-accent text-[var(--theme-accent-contrast,#ffffff)] flex items-center justify-center shrink-0 shadow-md group-hover/exr:scale-105 transition-transform">
                                                    <Aperture className="w-5 h-5 animate-pulse" />
                                                  </div>
                                                  <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                      <span className="text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md bg-[var(--theme-bg-tertiary)] text-accent border border-[var(--theme-border)]">
                                                        {fileExt || "EXR"} IMAGE
                                                      </span>
                                                      <span className="text-[10px] font-mono text-slate-400">
                                                        {lang === "ar"
                                                          ? "بطاقة مخصصة"
                                                          : "Card View"}
                                                      </span>
                                                    </div>
                                                    <span className="text-xs font-extrabold truncate mt-1 group-hover/exr:text-accent transition-colors">
                                                      {attach.file}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 truncate">
                                                      {getImageFormatTitle(
                                                        attach.file,
                                                      )}
                                                    </span>
                                                  </div>
                                                </div>

                                                <AttachmentDownloadControl
                                                  attachmentId={
                                                    attach.id || downloadUrl
                                                  }
                                                  filename={attach.file}
                                                  downloadUrl={downloadUrl}
                                                  mimeType={attach.type}
                                                  downloadedFiles={
                                                    attach.downloaded_files
                                                  }
                                                  lang={lang}
                                                  isLight={isLight}
                                                  variant="button"
                                                />
                                              </div>
                                            );
                                          }

                                          if (isVideo) {
                                            const dlItem =
                                              getDownloadByAttachmentId(
                                                attach.id || downloadUrl,
                                              );
                                            const isDlDownloading =
                                              dlItem?.status === "downloading";
                                            const isDlCompleted =
                                              dlItem?.status === "completed";
                                            const showControlAlways = Boolean(
                                              dlItem &&
                                              (isDlDownloading ||
                                                isDlCompleted ||
                                                dlItem.status === "failed" ||
                                                dlItem.status === "cancelled"),
                                            );

                                            return (
                                              <div
                                                key={
                                                  attach.id
                                                    ? `${attach.id}-${idx}`
                                                    : `attach-vid-${idx}`
                                                }
                                                className="w-fit max-w-full inline-flex flex-col relative group/vid rounded-2xl overflow-hidden border border-[var(--theme-border)] shadow-md bg-black"
                                              >
                                                <div className="relative w-fit max-w-full flex items-center justify-center">
                                                  <SmartVideoPlayer
                                                    src={downloadUrl}
                                                    title={attach.file}
                                                    lang={lang}
                                                    isLight={isLight}
                                                    className="max-h-80 w-auto max-w-full rounded-2xl bg-black block"
                                                    onPlayGlobal={
                                                      onPlayGlobalTrack
                                                    }
                                                  />
                                                  <div
                                                    className={`absolute top-2 right-2 transition-all z-10 ${showControlAlways ? "opacity-100" : "opacity-0 group-hover/vid:opacity-100 focus-within:opacity-100"}`}
                                                  >
                                                    <AttachmentDownloadControl
                                                      attachmentId={
                                                        attach.id || downloadUrl
                                                      }
                                                      filename={attach.file}
                                                      downloadUrl={downloadUrl}
                                                      mimeType={attach.type}
                                                      downloadedFiles={
                                                        attach.downloaded_files
                                                      }
                                                      lang={lang}
                                                      isLight={isLight}
                                                      variant="button"
                                                    />
                                                  </div>
                                                </div>

                                                {isDlDownloading && (
                                                  <div className="w-full bg-slate-950/90 px-3 py-1.5 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-accent">
                                                    <div className="flex items-center gap-2 flex-1 me-2">
                                                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                                        <div
                                                          className="h-full bg-accent transition-all duration-300 rounded-full"
                                                          style={{
                                                            width: `${dlItem.progress}%`,
                                                          }}
                                                        />
                                                      </div>
                                                    </div>
                                                    <span className="font-bold shrink-0">
                                                      {dlItem.progress}%
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          }

                                          {
                                            /* Wide, clear card for Documents, PDFs, Archives & Other Files */
                                          }
                                          return (
                                            <div
                                              key={
                                                attach.id
                                                  ? `${attach.id}-${idx}`
                                                  : `attach-doc-${idx}`
                                              }
                                              className="w-full min-w-[240px] sm:min-w-[300px] max-w-full flex items-center justify-between p-3 sm:p-4 rounded-2xl border shadow-md transition-all bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                                            >
                                              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                                                <div
                                                  className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                                                    isPdf
                                                      ? "bg-red-500/15 text-red-500 border border-red-500/20"
                                                      : isArchive
                                                        ? "bg-amber-500/15 text-amber-500 border border-amber-500/20"
                                                        : isDoc
                                                          ? "bg-blue-500/15 text-blue-500 border border-blue-500/20"
                                                          : "bg-accent/15 text-accent border border-accent/20"
                                                  }`}
                                                >
                                                  <FileText className="w-5 h-5" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                  <div
                                                    className={`font-bold text-xs sm:text-sm truncate leading-snug ${isLight ? "text-slate-800" : "text-slate-200"}`}
                                                  >
                                                    {attach.file}
                                                  </div>
                                                  <div className="flex items-center gap-2 mt-0.5 text-[10px] sm:text-[11px] opacity-75 font-mono">
                                                    {attach.size && (
                                                      <span className="shrink-0">
                                                        {attach.size}
                                                      </span>
                                                    )}
                                                    {fileExt && (
                                                      <span className="uppercase px-1.5 py-0.2 rounded bg-slate-500/20 font-sans text-[9px] sm:text-[10px] font-bold shrink-0">
                                                        {fileExt}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>

                                              <AttachmentDownloadControl
                                                attachmentId={
                                                  attach.id || downloadUrl
                                                }
                                                filename={attach.file}
                                                downloadUrl={downloadUrl}
                                                mimeType={attach.type}
                                                downloadedFiles={
                                                  attach.downloaded_files
                                                }
                                                lang={lang}
                                                isLight={isLight}
                                                variant="button"
                                              />
                                            </div>
                                          );
                                        },
                                      )}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          );
                        })()}

                      {/* Message Reactions - Placed directly below content */}
                      {!(isSenderBlocked && !isMsgRevealed) && (
                        <div className="relative mt-1">
                          <MessageReactionChips
                            msg={msg}
                            currentUser={currentUser}
                            lang={lang}
                            isLight={isLight}
                            onToggleReaction={(emoji) => handleToggleReaction(msg.id, emoji)}
                            onOpenPicker={(e) => handleOpenReactionPicker(msg.id, e)}
                            allUsers={allUsersList}
                            membersMap={serverMembersMap}
                          />
                        </div>
                      )}
                    </div>

                    {/* Actions Toolbar - Positioned on top border at the end of the panel aligned with the timestamp horizontally */}
                    {!(isSenderBlocked && !isMsgRevealed) && (
                      <div
                        className="absolute -top-[44px] end-1 sm:end-2 z-30 flex items-center gap-0.5 p-1 rounded-xl shadow-lg border bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-150 select-none"
                        dir={lang === "ar" ? "rtl" : "ltr"}
                      >
                        {/* Quick Reactions */}
                        <div className="hidden sm:flex items-center gap-0.5 pe-1 border-e border-[var(--theme-border)]/60">
                          {["👍", "❤️", "😂"].map((emoji) => (
                            <button
                              key={emoji}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleReaction(msg.id, emoji);
                              }}
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-xs hover:bg-accent/20 hover:scale-125 active:scale-95 transition-all cursor-pointer border-0 bg-transparent"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>

                        {/* Add Reaction Button */}
                        <button
                          onClick={(e) => handleOpenReactionPicker(msg.id, e)}
                          title={lang === "ar" ? "إضافة تفاعل" : "Add Reaction"}
                          className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer border ${
                            activeReactionPicker?.messageId === msg.id
                              ? "bg-accent/20 text-accent border-accent/40"
                              : actionBtnClass
                          }`}
                        >
                          <SmilePlus className="w-3.5 h-3.5" />
                        </button>

                        {/* Pin option - Server Channels Only */}
                        {!isDmChannel && (
                          <button
                            onClick={() => handleTogglePin(msg.id)}
                            title={
                              pinnedIds.includes(msg.id)
                                ? lang === "ar"
                                  ? "إلغاء التثبيت"
                                  : "Unpin"
                                : lang === "ar"
                                  ? "تثبيت الرسالة"
                                  : "Pin Message"
                            }
                            className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer border ${
                              pinnedIds.includes(msg.id)
                                ? "bg-accent/20 text-accent border-accent/40 hover:bg-accent/30"
                                : actionBtnClass
                            }`}
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Copy text option - available for all messages containing text */}
                        {Boolean(
                          msg.content && msg.content.trim().length > 0,
                        ) && (
                          <button
                            onClick={() =>
                              handleCopyMessageText(msg.id, msg.content)
                            }
                            title={
                              copiedMsgId === msg.id
                                ? lang === "ar"
                                  ? "تم النسخ!"
                                  : "Copied!"
                                : lang === "ar"
                                  ? "نسخ النص"
                                  : "Copy Text"
                            }
                            className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer border ${
                              copiedMsgId === msg.id
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30"
                                : actionBtnClass
                            }`}
                          >
                            {copiedMsgId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {/* Copy Message Link option */}
                        <button
                          onClick={() => handleCopyMessageLink(msg)}
                          title={
                            copiedMsgLinkId === msg.id
                              ? lang === "ar"
                              ? "تم نسخ رابط الرسالة!"
                              : "Message link copied!"
                            : lang === "ar"
                              ? "نسخ رابط الرسالة"
                              : "Copy Message Link"
                          }
                          className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer border ${
                            copiedMsgLinkId === msg.id
                              ? "bg-accent/20 text-accent border-accent/40"
                              : actionBtnClass
                          }`}
                        >
                          {copiedMsgLinkId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-accent" />
                          ) : (
                            <Link2 className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Edit option - for message author */}
                        {onEditMessage && isUserAuthorizedToEdit(msg) && (
                          <button
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditingText(msg.content);
                            }}
                            title={
                              lang === "ar" ? "تعديل الرسالة" : "Edit Message"
                            }
                            className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer border ${actionBtnClass}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Reply option */}
                        <button
                          onClick={() => {
                            setReplyTo(msg);
                            textInputRef.current?.focus();
                          }}
                          className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer border ${actionBtnClass}`}
                        >
                          {t("reply")}
                        </button>

                        {/* Delete Message option */}
                        {onDeleteMessage && isUserAuthorizedToDelete(msg) && (
                          <button
                            onClick={() => setDeletingMessageId(msg.id)}
                            title={t("delete_message") || "Delete"}
                            className="p-1.5 rounded-lg bg-red-950/20 hover:bg-red-500 hover:text-white text-red-400 transition-all cursor-pointer border border-red-900/20"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              );
            });
          })()
        )}

            {/* Bottom Virtual Spacer */}
            {bottomSpacerHeight > 0 && (
              <div
                style={{ height: `${bottomSpacerHeight}px` }}
                aria-hidden="true"
                className="shrink-0 w-full"
              />
            )}

            {/* Scroll bottom anchor */}
            <div
              style={{
                overflowAnchor: "auto",
                height: "1px",
                marginTop: "-1px",
                pointerEvents: "none",
              }}
              aria-hidden="true"
              className="shrink-0 w-full"
            />
                </>
              ),
              [
                sortedMessages,
                visibleSlice,
                startIndex,
                topSpacerHeight,
                bottomSpacerHeight,
                lang,
                channel.name,
                isLight,
                unreadSeparatorMsgId,
                currentUser?.id,
                focusedMessageId,
                messageLookup,
                failedImageIds,
                editingMessageId,
                copiedMsgId,
                pinnedIds,
                resolveSenderUser,
                getAttachmentUrl,
                isUnrenderableImageFile,
                handleCopyMessageText,
                handleTogglePin,
                onDeleteMessage,
                onSelectUser,
                onPlayGlobalTrack,
                revealedBlockedMsgIds,
                blockedUserIdsSet,
                blockedClustersMap,
                toggleRevealBlockedMessage,
                toggleRevealBlockedCluster,
                activeReactionPicker?.messageId,
                handleOpenReactionPicker,
                handleToggleReaction,
              ],
            )}
          </div>

          {/* Subtle loading placeholder while chat is loading and positioning scroll to bottom */}
          {!isInitialLoadReady && (
            <div className="absolute inset-x-0 top-0 bottom-24 flex flex-col items-center justify-center pointer-events-none z-10 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 text-xs font-semibold text-accent/90 bg-[var(--theme-bg-secondary)] px-4 py-2 rounded-full border border-[var(--theme-border)] shadow-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                <span>
                  {lang === "ar"
                    ? "جاري تحميل المحادثة..."
                    : "Loading conversation..."}
                </span>
              </div>
            </div>
          )}

          {/* Floating high-visibility cooldown progress counter panel */}
          <AnimatePresence>
            {cooldownRemaining > 0 && !isDmChannel && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="mx-6 mb-2 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-center justify-between text-xs text-amber-500 select-none font-bold"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 animate-bounce" />
                  <span>
                    {lang === "ar"
                      ? "فترة الانتظار مفعلة! يرجى الانتظار لتتمكن من الإرسال مجدداً."
                      : "Chat Cooldown rate-limit is active!"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-amber-500/20 px-2.5 py-1 rounded-lg font-mono">
                  <span>{cooldownRemaining}s</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reply To focus card indicator */}
          {replyTo && (
            <div
              className={`mx-6 mb-2.5 p-3 rounded-xl border flex items-center justify-between text-xs select-none ${isLight ? "bg-slate-100 border-slate-200 text-slate-700" : "bg-slate-900/60 border-slate-800 text-slate-300"}`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="font-bold text-accent">
                  {lang === "ar"
                    ? `الرد على ${replyTo.expand?.sender?.display_name || replyTo.expand?.sender?.username || "المستخدم"}:`
                    : `Replying to ${replyTo.expand?.sender?.display_name || replyTo.expand?.sender?.username || "User"}:`}
                </span>
                <span className="truncate max-w-sm italic">
                  "
                  {replyTo.content
                    ? replyTo.content
                    : lang === "ar"
                      ? "مرفق"
                      : "attachment"}
                  "
                </span>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                className={`p-1 rounded cursor-pointer border-0 ${isLight ? "hover:bg-slate-200 text-slate-500" : "hover:bg-slate-800 text-slate-500 hover:text-white"}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Active Legacy Background File Upload Progress Bar (if provided via props) */}
          <AnimatePresence>
            {activeUpload && (
              <motion.div
                initial={{ opacity: 0, y: 15, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.97 }}
                className={`mx-4 sm:mx-6 mb-3 p-3.5 rounded-2xl border shadow-2xl flex flex-col gap-2.5 select-none transition-all ${
                  isLight
                    ? "bg-white/95 border-accent/30 text-slate-800 shadow-accent/10"
                    : "bg-slate-900/95 border-accent/30 text-white shadow-black/80"
                } md:absolute md:top-[66px] md:right-5 md:left-auto md:w-80 md:mx-0 md:z-40 md:shadow-2xl`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-accent/20 text-accent flex items-center justify-center shrink-0">
                      <Loader2 className="w-4 h-4 animate-spin text-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs truncate max-w-[160px] sm:max-w-[260px]">
                          {activeUpload.currentFileName}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/20 text-accent font-bold shrink-0">
                          {activeUpload.currentFileIndex + 1} /{" "}
                          {activeUpload.files.length}
                        </span>
                      </div>
                      <div
                        className={`text-[10px] font-semibold truncate ${isLight ? "text-slate-500" : "text-slate-400"}`}
                      >
                        {lang === "ar"
                          ? "جاري رفع الملف في الخلفية..."
                          : "Uploading file in background..."}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {onSkipUploadFile && (
                      <button
                        type="button"
                        onClick={onSkipUploadFile}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/30 text-amber-500 hover:text-amber-400 text-xs font-bold transition-all cursor-pointer border border-amber-500/20 flex items-center gap-1 shrink-0"
                        title={
                          lang === "ar" ? "تخطي هذا الملف" : "Skip this file"
                        }
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">
                          {lang === "ar" ? "تخطي الملف" : "Skip File"}
                        </span>
                      </button>
                    )}

                    {onCancelUploadMessage && (
                      <button
                        type="button"
                        onClick={onCancelUploadMessage}
                        className="px-2.5 py-1.5 rounded-xl bg-red-600/15 hover:bg-red-600/30 text-red-500 hover:text-red-400 text-xs font-bold transition-all cursor-pointer border border-red-500/20 flex items-center gap-1 shrink-0"
                        title={
                          lang === "ar"
                            ? "إلغاء وحذف الرسالة والمرفق"
                            : "Cancel upload & delete message"
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">
                          {lang === "ar" ? "إلغاء الرسالة" : "Cancel Message"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden relative border border-white/5">
                    <div
                      className="h-full bg-accent transition-all duration-200 rounded-full shadow-sm"
                      style={{
                        width: `${Math.max(activeUpload.fileProgress, 5)}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono font-bold text-slate-400">
                    <span>
                      {lang === "ar" ? "تقدم الملف:" : "File progress:"}{" "}
                      {activeUpload.fileProgress}%
                    </span>
                    <span>
                      {lang === "ar" ? "الإجمالي:" : "Total:"}{" "}
                      {activeUpload.totalProgress}%
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Attachment staging list tray with live compression & background upload details */}
          {processedAttachments.length > 0 ? (
            <div
              className="mx-4 sm:mx-6 mb-3 p-3.5 rounded-2xl border flex flex-col gap-3 select-none shadow-md bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
            >
              <div className="flex justify-between items-center w-full">
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    <>
                      <Sparkles className="w-4 h-4 text-accent animate-pulse shrink-0" />
                      <span className="text-xs font-black text-accent uppercase tracking-wider">
                        {lang === "ar"
                          ? "تشخيص تحسين المرفقات والرفع (مسؤول)"
                          : "Attachment Optimization & Upload Diagnostics (Admin)"}
                      </span>
                    </>
                  ) : (
                    <>
                      <Paperclip className="w-4 h-4 text-accent shrink-0" />
                      <span className="text-xs font-bold text-[var(--theme-text-primary)]">
                        {lang === "ar"
                          ? "المرفقات المجهزة"
                          : "Staged Attachments"}{" "}
                        ({processedAttachments.length})
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {isAdmin && (
                    <span className="text-[11px] font-bold text-[var(--theme-text-muted)] font-mono">
                      {lang === "ar" ? "الإجمالي:" : "Total:"}{" "}
                      <span className="line-through opacity-60">
                        {formatFileSize(
                          processedAttachments.reduce(
                            (s, a) => s + a.originalSize,
                            0,
                          ),
                        )}
                      </span>{" "}
                      →{" "}
                      <span className="text-accent font-extrabold">
                        {formatFileSize(
                          processedAttachments.reduce(
                            (s, a) =>
                              s +
                              (a.isCompressed &&
                              a.compressedSize &&
                              a.userChoice === "compress"
                                ? a.compressedSize
                                : a.originalSize),
                            0,
                          ),
                        )}
                      </span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      processedAttachments.forEach((item) => {
                        AttachmentProcessor.cancelProcessing(item.id);
                        AttachmentUploadManager.remove(item.id);
                        if (item.uploadedAttachment?.id) {
                          pbService.deleteAttachmentRecord(
                            item.uploadedAttachment.id,
                            isDmChannel,
                          );
                        }
                        if (
                          item.previewUrl &&
                          item.previewUrl.startsWith("blob:")
                        ) {
                          URL.revokeObjectURL(item.previewUrl);
                        }
                      });
                      setProcessedAttachments([]);
                      setAttachments([]);
                    }}
                    className="text-xs text-rose-400 hover:underline font-bold cursor-pointer border-0 bg-transparent"
                  >
                    {lang === "ar" ? "إلغاء الكل" : "Clear All"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto scrollbar-thin p-0.5">
                {processedAttachments.map((item) => {
                  const isComp =
                    item.isCompressed &&
                    item.compressedSize &&
                    item.compressedSize < item.originalSize;
                  const savedPct = isComp
                    ? Math.round(
                        ((item.originalSize - item.compressedSize!) /
                          item.originalSize) *
                          100,
                      )
                    : 0;

                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border flex items-center gap-3 relative transition-all bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] shadow-xs"
                    >
                      {/* Thumbnail Preview / Icon */}
                      <div className="w-12 h-12 rounded-xl bg-[var(--theme-bg-secondary)] overflow-hidden shrink-0 relative flex items-center justify-center border border-[var(--theme-border)] shadow-inner">
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        ) : item.mediaType === "image" ? (
                          <ImageIcon className="w-6 h-6 text-blue-400" />
                        ) : item.mediaType === "video" ? (
                          <Video className="w-6 h-6 text-purple-400" />
                        ) : item.mediaType === "audio" ? (
                          <Volume2 className="w-6 h-6 text-amber-400" />
                        ) : (
                          <FileText className="w-6 h-6 text-accent" />
                        )}
                      </div>

                      {/* Info & Live Progress */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-extrabold truncate max-w-[140px]">
                            {item.file.name}
                          </span>
                          {isAdmin &&
                            savedPct > 0 &&
                            item.userChoice === "compress" && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                                -{savedPct}%
                              </span>
                            )}
                        </div>

                        {/* Stage 1: Local compression / processing */}
                        {item.status === "compressing" ? (
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[9px] text-[var(--theme-text-muted)] font-mono">
                              <span className="truncate max-w-[120px]">
                                {isAdmin
                                  ? item.statusMessage || "Processing..."
                                  : lang === "ar"
                                    ? "جاري تجهيز الملف..."
                                    : "Preparing file..."}
                              </span>
                              <span>{item.progress}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-[var(--theme-bg-primary)] overflow-hidden">
                              <div
                                className="h-full bg-accent transition-all duration-300 rounded-full"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                          </div>
                        ) : item.uploadStatus === "uploading" ? (
                          /* Stage 2: Background upload in progress */
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[9px] text-accent font-mono font-bold">
                              <span className="flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin shrink-0 text-accent" />
                                <span>
                                  {lang === "ar"
                                    ? "جاري الرفع..."
                                    : "Uploading..."}
                                </span>
                              </span>
                              <span>{item.uploadProgress || 0}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-[var(--theme-bg-primary)] overflow-hidden">
                              <div
                                className="h-full bg-accent transition-all duration-200 rounded-full"
                                style={{
                                  width: `${item.uploadProgress || 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : item.uploadStatus === "queued" ? (
                          /* Stage 2 queued */
                          <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-medium">
                            <Loader2 className="w-3 h-3 animate-spin shrink-0 opacity-70" />
                            <span>
                              {lang === "ar"
                                ? "في انتظار الرفع..."
                                : "Queued for upload..."}
                            </span>
                          </div>
                        ) : item.uploadStatus === "completed" ? (
                          /* Stage 3 completed */
                          <div className="flex items-center justify-between text-[10px] font-mono gap-1">
                            <div className="flex items-center gap-1 text-emerald-400 font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {lang === "ar" ? "تم الرفع" : "Uploaded"}
                              </span>
                            </div>
                            {isAdmin && (
                              <span className="text-[var(--theme-text-muted)] text-[9px]">
                                {item.userChoice === "compress" && isComp
                                  ? formatFileSize(item.compressedSize!)
                                  : formatFileSize(item.originalSize)}
                              </span>
                            )}
                          </div>
                        ) : item.uploadStatus === "failed" ||
                          item.uploadStatus === "cancelled" ? (
                          /* Stage 3 failed / cancelled */
                          <div className="flex items-center justify-between text-[10px] gap-1">
                            <div className="flex items-center gap-1 text-rose-400 font-bold truncate">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">
                                {item.uploadError ||
                                  (lang === "ar"
                                    ? "فشل الرفع"
                                    : "Upload failed")}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                AttachmentUploadManager.retry(item.id)
                              }
                              className="px-1.5 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-[9px] font-bold flex items-center gap-1 border border-blue-500/30 shrink-0 cursor-pointer"
                              title={
                                lang === "ar"
                                  ? "إعادة المحاولة"
                                  : "Retry upload"
                              }
                            >
                              <RotateCw className="w-3 h-3" />
                              <span>{lang === "ar" ? "إعادة" : "Retry"}</span>
                            </button>
                          </div>
                        ) : (
                          /* Fallback info */
                          <div className="flex items-center justify-between text-[10px] text-[var(--theme-text-muted)] font-mono gap-1">
                            <span className="truncate">
                              {isAdmin ? (
                                item.userChoice === "compress" && isComp ? (
                                  <>
                                    <span className="line-through text-[var(--theme-text-secondary)]">
                                      {formatFileSize(item.originalSize)}
                                    </span>
                                    {" → "}
                                    <span className="text-emerald-400 font-bold">
                                      {formatFileSize(item.compressedSize!)}
                                    </span>
                                  </>
                                ) : (
                                  <span>
                                    {formatFileSize(item.originalSize)}
                                  </span>
                                )
                              ) : (
                                <span>{formatFileSize(item.file.size)}</span>
                              )}
                            </span>

                            {/* Admin choice switch button */}
                            {isAdmin &&
                              item.compressedFile &&
                              item.compressedSize! < item.originalSize && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextChoice =
                                      item.userChoice === "compress"
                                        ? "original"
                                        : "compress";
                                    const updated =
                                      AttachmentProcessor.toggleUserChoice(
                                        item,
                                        nextChoice,
                                      );
                                    setProcessedAttachments((prev) =>
                                      prev.map((i) =>
                                        i.id === item.id ? updated : i,
                                      ),
                                    );
                                    const fileToUpload =
                                      nextChoice === "compress" &&
                                      updated.compressedFile
                                        ? updated.compressedFile
                                        : updated.file;
                                    AttachmentUploadManager.enqueue(
                                      item.id,
                                      fileToUpload,
                                      isDmChannel,
                                    );
                                  }}
                                  className={`text-[9px] font-extrabold px-2 py-0.5 rounded-lg border cursor-pointer transition-all shrink-0 ${
                                    item.userChoice === "compress"
                                      ? "bg-accent/20 border-accent/40 text-accent"
                                      : "bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-secondary)]"
                                  }`}
                                  title={
                                    lang === "ar"
                                      ? "تبديل بين الملف المضغوط والأصلي"
                                      : "Toggle between compressed & original"
                                  }
                                >
                                  {item.userChoice === "compress"
                                    ? lang === "ar"
                                      ? "مضغوط ✓"
                                      : "Compressed ✓"
                                    : lang === "ar"
                                      ? "الملف الأصلي"
                                      : "Original"}
                                </button>
                              )}
                          </div>
                        )}
                      </div>

                      {/* Cancel / Remove Button */}
                      <button
                        type="button"
                        onClick={() => {
                          AttachmentUploadManager.remove(item.id);
                          if (item.uploadedAttachment?.id) {
                            pbService.deleteAttachmentRecord(
                              item.uploadedAttachment.id,
                              isDmChannel,
                            );
                          }
                          if (
                            item.previewUrl &&
                            item.previewUrl.startsWith("blob:")
                          ) {
                            URL.revokeObjectURL(item.previewUrl);
                          }
                          setProcessedAttachments((prev) =>
                            prev.filter((i) => i.id !== item.id),
                          );
                          setAttachments((prev) =>
                            prev.filter(
                              (_, idx) =>
                                idx !==
                                processedAttachments.findIndex(
                                  (i) => i.id === item.id,
                                ),
                            ),
                          );
                        }}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-all cursor-pointer border-0 shrink-0"
                        title={lang === "ar" ? "إزالة" : "Remove"}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : attachments.length > 0 ? (
            <div
              className={`mx-6 mb-3 p-3 rounded-xl border flex flex-col gap-2 select-none ${isLight ? "bg-slate-100 border-slate-200" : "bg-slate-900 border-slate-800"}`}
            >
              <div className="flex justify-between items-center w-full">
                <span className="text-[10px] font-extrabold text-accent uppercase tracking-widest">
                  {lang === "ar"
                    ? "المرفقات المستهدفة للرفع"
                    : "Attachments Ready for Upload"}
                </span>
                <span className="text-[10px] font-bold text-slate-500 font-mono">
                  {lang === "ar" ? "إجمالي الحجم:" : "Total size:"}{" "}
                  {formatFileSize(
                    attachments.reduce((sum, f) => sum + f.size, 0),
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {attachments.map((file, idx) => {
                  const isImg = file.type.startsWith("image/");
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${isLight ? "bg-white border-slate-300 text-slate-700" : "bg-slate-950 border-slate-850 text-slate-300"}`}
                    >
                      {isImg ? (
                        <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                      ) : (
                        <File className="w-3.5 h-3.5 text-accent" />
                      )}
                      <span className="truncate max-w-[150px] font-semibold">
                        {file.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold font-mono">
                        ({formatFileSize(file.size)})
                      </span>
                      <button
                        onClick={() => removeAttachment(idx)}
                        type="button"
                        className={`p-0.5 rounded cursor-pointer border-0 ${isLight ? "hover:bg-slate-200 text-slate-400 hover:text-slate-700" : "hover:bg-slate-850 text-slate-500 hover:text-white"}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Floating User Ping Autocomplete List */}
          <AnimatePresence>
            {mentionQuery !== null && filteredMentionUsers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                className={`mx-4 sm:mx-6 mb-2.5 rounded-2xl border shadow-2xl z-50 flex flex-col overflow-hidden shrink-0 ${
                  isLight
                    ? "bg-white/95 border-slate-300 text-slate-800"
                    : "bg-slate-900/95 border-white/15 text-white"
                }`}
              >
                {/* Non-scrolling header to prevent overlap */}
                <div
                  className={`px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider border-b flex items-center justify-between shrink-0 ${
                    isLight
                      ? "bg-slate-100/90 border-slate-200 text-slate-700"
                      : "bg-slate-950/40 border-white/10 text-accent"
                  }`}
                >
                  <span>
                    {lang === "ar"
                      ? "مناداة عضو (@Mention User)"
                      : "Mention Member"}
                  </span>
                  <span className="text-slate-500 font-mono text-[9px]">
                    @{mentionQuery}
                  </span>
                </div>

                {/* Scrollable list of members */}
                <div className="p-1.5 max-h-52 overflow-y-auto scrollbar-thin flex flex-col gap-1">
                  {filteredMentionUsers.map((user, idx) => (
                    <button
                      key={user.id}
                      type="button"
                      ref={(el) => {
                        if (idx === mentionSelectedIndex && el) {
                          el.scrollIntoView({
                            block: "nearest",
                            behavior: "smooth",
                          });
                        }
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleInsertMention(user)}
                      className={`w-full px-2.5 py-1.5 rounded-xl transition-all flex items-center justify-between text-xs cursor-pointer border-0 text-left group shrink-0 ${
                        idx === mentionSelectedIndex
                          ? "bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-bold shadow-sm"
                          : "hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-primary)]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Avatar
                          src={getAvatarUrl(user)}
                          username={user.display_name || user.username}
                          size="xs"
                          className="w-6 h-6 rounded-lg shrink-0 shadow-sm"
                        />
                        <span className="font-extrabold truncate">
                          {user.display_name || user.username}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] opacity-70 group-hover:opacity-100 shrink-0">
                        @{user.username}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating Scroll to Bottom Button - Absolutely Positioned to avoid layout height reflow */}
          <AnimatePresence>
            {showScrollToBottom && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 pointer-events-auto shadow-2xl"
              >
                <button
                  type="button"
                  onClick={() => executeScroll("user")}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold shadow-xl flex items-center gap-1.5 transition-all cursor-pointer border border-[var(--theme-border)] bg-[var(--theme-bg-card)] text-accent hover:bg-[var(--theme-bg-tertiary)] hover:scale-105 active:scale-95"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>
                    {lang === "ar" ? "الرجوع للأسفل" : "Scroll to bottom"}
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Form message entry box panel container */}
          <form
            onSubmit={handleSend}
            className="p-3 pt-0 md:p-3.5 md:pt-0 shrink-0 flex flex-col gap-1.5 relative z-30"
          >
            {/* Quick Rich Text Formatting Toolbar Strip (Visible only when text is selected) */}
            {hasTextSelection && (
              <div
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs select-none w-fit max-w-full overflow-x-auto scrollbar-none transition-all shadow-md ${
                  isLight
                    ? "bg-slate-100/90 border-slate-200 text-slate-700"
                    : "bg-slate-900/90 border-slate-800 text-slate-300"
                }`}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormatting("bold")}
                  title={
                    lang === "ar" ? "نص عريض (**bold**)" : "Bold (**bold**)"
                  }
                  className="p-1 rounded hover:bg-slate-500/20 hover:text-accent transition-all cursor-pointer border-0"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormatting("italic")}
                  title={
                    lang === "ar" ? "نص مائل (*italic*)" : "Italic (*italic*)"
                  }
                  className="p-1 rounded hover:bg-slate-500/20 hover:text-accent transition-all cursor-pointer border-0"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormatting("strikethrough")}
                  title={
                    lang === "ar"
                      ? "نص مشطوب (~~strikethrough~~)"
                      : "Strikethrough (~~strikethrough~~)"
                  }
                  className="p-1 rounded hover:bg-slate-500/20 hover:text-accent transition-all cursor-pointer border-0"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>
                <div className="w-[1px] h-3 bg-slate-700/50 mx-0.5" />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormatting("spoiler")}
                  title={
                    lang === "ar"
                      ? "حرق / نص مخفي (||spoiler||)"
                      : "Spoiler (||spoiler||)"
                  }
                  className="p-1 rounded hover:bg-slate-500/20 hover:text-amber-400 transition-all cursor-pointer border-0"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormatting("quote")}
                  title={lang === "ar" ? "اقتباس (> quote)" : "Quote (> quote)"}
                  className="p-1 rounded hover:bg-slate-500/20 hover:text-accent transition-all cursor-pointer border-0"
                >
                  <Quote className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormatting("heading")}
                  title={
                    lang === "ar"
                      ? "عنوان رئيسي (# Title)"
                      : "Title / Heading (# Title)"
                  }
                  className="p-1 rounded hover:bg-slate-500/20 hover:text-accent transition-all cursor-pointer border-0"
                >
                  <Heading className="w-3.5 h-3.5" />
                </button>
                <div className="w-[1px] h-3 bg-slate-700/50 mx-0.5" />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormatting("code")}
                  title={
                    lang === "ar" ? "كود مضمن (`code`)" : "Inline Code (`code`)"
                  }
                  className="p-1 rounded hover:bg-slate-500/20 hover:text-amber-300 transition-all cursor-pointer border-0"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormatting("codeblock")}
                  title={
                    lang === "ar"
                      ? "كتلة كود (```code block```)"
                      : "Code Block (```code block```)"
                  }
                  className="p-1 rounded hover:bg-slate-500/20 hover:text-amber-300 transition-all cursor-pointer border-0"
                >
                  <SquareCode className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div
              className={`flex items-center gap-2 border rounded-2xl p-1.5 transition-all duration-200 ${inputContainerClass}`}
            >
              {/* File select upload stage */}
              <button
                type="button"
                tabIndex={-1}
                disabled={
                  (!isDmChannel && cooldownRemaining > 0) ||
                  !channelPerms.canSendMessages
                }
                onClick={() => fileInputRef.current?.click()}
                title={t("send_file") || "Attach file"}
                className="p-2 rounded-xl transition-all border-0 shrink-0 cursor-pointer disabled:opacity-50 hover:bg-[var(--theme-bg-tertiary)] text-accent flex items-center justify-center self-center"
              >
                <Paperclip className="w-4.5 h-4.5 text-accent" />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  className="hidden"
                />
              </button>

              {/* Core Input box field - Auto Expanding Textarea */}
              <textarea
                ref={textInputRef}
                rows={1}
                value={inputText}
                onChange={handleInputChange}
                onSelect={checkTextSelection}
                onMouseUp={checkTextSelection}
                onKeyDown={handleKeyDown}
                maxLength={6000}
                disabled={
                  (!isDmChannel && cooldownRemaining > 0) ||
                  !channelPerms.canSendMessages
                }
                placeholder={
                  !channelPerms.canSendMessages
                    ? lang === "ar"
                      ? "لا تملك صلاحية إرسال الرسائل في هذه القناة"
                      : "You do not have permission to send messages in this channel"
                    : !isDmChannel && cooldownRemaining > 0
                      ? lang === "ar"
                        ? `يرجى الانتظار ${toLatinNumerals(cooldownRemaining)} ثانية...`
                        : `Please wait ${toLatinNumerals(cooldownRemaining)}s...`
                      : lang === "ar"
                        ? `أرسل رسالة إلى #${channel.name}...`
                        : `Send a message to #${channel.name}...`
                }
                style={{
                  minHeight: "36px",
                  maxHeight: "112px",
                  resize: "none",
                }}
                className={`w-full bg-transparent focus:outline-none text-sm px-1 py-1.5 font-medium leading-normal scrollbar-thin ${inputTextColor} disabled:opacity-50 self-center my-auto`}
              />

              {/* Trigger submit */}
              {(() => {
                const isAttachmentUploadingOrCompressing =
                  processedAttachments.some(
                    (item) =>
                      item.status === "compressing" ||
                      item.uploadStatus === "queued" ||
                      item.uploadStatus === "uploading",
                  );
                const isAttachmentFailed = processedAttachments.some(
                  (item) =>
                    item.uploadStatus === "failed" ||
                    item.uploadStatus === "cancelled",
                );
                const hasUnfinishedAttachments = processedAttachments.some(
                  (item) =>
                    !item.uploadStatus ||
                    item.uploadStatus !== "completed" ||
                    !item.uploadedAttachment,
                );
                const hasPendingAttachments =
                  processedAttachments.length > 0 &&
                  (isAttachmentUploadingOrCompressing ||
                    isAttachmentFailed ||
                    hasUnfinishedAttachments);

                const isSendDisabled =
                  !channelPerms.canSendMessages ||
                  (!isDmChannel && cooldownRemaining > 0) ||
                  hasPendingAttachments ||
                  (!inputText.trim() &&
                    processedAttachments.length === 0 &&
                    attachments.length === 0);

                return (
                  <button
                    type="submit"
                    disabled={isSendDisabled}
                    className="p-2.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] disabled:bg-gray-400/30 disabled:text-gray-500 cursor-pointer transition-all border-0 shrink-0 shadow-lg flex items-center justify-center self-center"
                    title={
                      isAttachmentUploadingOrCompressing
                        ? lang === "ar"
                          ? "جاري رفع المرفقات..."
                          : "Uploading attachments..."
                        : isAttachmentFailed
                          ? lang === "ar"
                            ? "فشل رفع المرفقات، يرجى إعادة المحاولة"
                            : "Upload failed, please retry"
                          : lang === "ar"
                            ? "إرسال"
                            : "Send"
                    }
                  >
                    {isAttachmentUploadingOrCompressing ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                    ) : (
                      <Send
                        className={`w-4 h-4 ${lang === "ar" ? "scale-x-[-1]" : ""}`}
                      />
                    )}
                  </button>
                );
              })()}
            </div>
          </form>

          {/* Premium Message Deletion Confirmation Modal */}
          <AnimatePresence>
            {deletingMessageId && (
              <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-50 p-4 select-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`w-full max-w-sm border rounded-2xl p-5 shadow-2xl flex flex-col gap-4.5 text-left ${isLight ? "bg-white border-slate-200 text-slate-800" : "bg-slate-900 border-slate-800 text-white"}`}
                >
                  <div className="flex items-center gap-2.5 text-red-500">
                    <AlertTriangle className="w-5 h-5 animate-pulse" />
                    <h4 className="font-bold text-sm">
                      {lang === "ar"
                        ? "حذف الرسالة نهائياً"
                        : "Confirm Message Deletion"}
                    </h4>
                  </div>
                  <p
                    className={`text-xs font-medium leading-relaxed ${isLight ? "text-slate-600" : "text-slate-400"}`}
                  >
                    {lang === "ar"
                      ? "هل أنت متأكد من أنك تريد حذف هذه الرسالة من السيرفر؟ لا يمكن استرجاعها بعد ذلك."
                      : "Are you sure you want to permanently delete this message? This action is irreversible."}
                  </p>
                  <div className="flex justify-end gap-3 mt-1.5">
                    <button
                      type="button"
                      onClick={() => setDeletingMessageId(null)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 bg-transparent ${isLight ? "text-slate-500 hover:text-slate-800 hover:bg-slate-100" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                    >
                      {lang === "ar" ? "إلغاء" : "Cancel"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (deletingMessageId) {
                          setPinnedIds((prev) => prev.filter((id) => id !== deletingMessageId));
                          if (onDeleteMessage) {
                            onDeleteMessage(deletingMessageId);
                          }
                        }
                        setDeletingMessageId(null);
                      }}
                      className="px-4.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-lg shadow-red-500/10 cursor-pointer border-0"
                    >
                      {lang === "ar" ? "حذف الآن" : "Delete Message"}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Floating Interactive Context Menu */}
          {activeMenuMessage && menuPosition && (
            <MessageContextMenu
              message={activeMenuMessage}
              position={menuPosition}
              onClose={() => {
                setActiveMenuMessage(null);
                setMenuPosition(null);
              }}
              onToggleReaction={(msgId, emoji) => {
                handleToggleReaction(msgId, emoji);
              }}
              onOpenReactionPicker={(msgId, rect) => {
                if (rect) {
                  setActiveReactionPicker({
                    messageId: msgId,
                    anchorRect: {
                      top: rect.top,
                      bottom: rect.bottom,
                      left: rect.left,
                      right: rect.right,
                      width: rect.width,
                      height: rect.height,
                    },
                  });
                }
              }}
              onReply={(msg) => {
                setReplyTo(msg);
                textInputRef.current?.focus();
              }}
              onCopyText={(msgId, content) => {
                handleCopyMessageText(msgId, content);
              }}
              onCopyMessageLink={(msg) => {
                handleCopyMessageLink(msg);
              }}
              onTogglePin={(msgId) => {
                handleTogglePin(msgId);
              }}
              onReport={(msg) => {
                setReportMessageTarget(msg);
                setShowReportMessageModal(true);
              }}
              onEdit={(msg) => {
                setEditingMessageId(msg.id);
                setEditingText(msg.content);
              }}
              onDelete={(msg) => {
                setDeletingMessageId(msg.id);
              }}
              isUserAuthorizedToEdit={isUserAuthorizedToEdit}
              isUserAuthorizedToDelete={isUserAuthorizedToDelete}
              isDmChannel={isDmChannel}
              pinnedIds={pinnedIds}
              lang={lang}
              isLight={isLight}
            />
          )}

          {/* Standalone Message Reaction Picker Portal */}
          {activeReactionPicker && (
            <MessageReactionPicker
              anchorRect={activeReactionPicker.anchorRect}
              onClose={() => setActiveReactionPicker(null)}
              onSelectEmoji={(emoji, keepOpen) => {
                handleToggleReaction(activeReactionPicker.messageId, emoji);
                if (!keepOpen) {
                  setActiveReactionPicker(null);
                }
              }}
              lang={lang}
              isLight={isLight}
            />
          )}

          {/* Attachment Gallery Lightbox Modal */}
          {typeof document !== "undefined" &&
            createPortal(
              <AnimatePresence>
                {galleryState && galleryState.list.length > 0 && (
                  <motion.div
                    key="lightbox-modal-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 w-screen h-screen w-[100vw] h-[100vh] bg-black/80 z-[99999] flex flex-col select-none p-4 text-[var(--theme-text-primary)]"
                  >
                    <div className="flex items-center justify-between px-4 py-2">
                      <span className="text-xs font-bold text-[var(--theme-text-secondary)] font-mono">
                        {galleryState.initialIndex + 1} /{" "}
                        {galleryState.list.length}
                      </span>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const currAttach =
                            galleryState.list[galleryState.initialIndex];
                          if (!currAttach) return null;
                          const dlUrl = getAttachmentUrl(currAttach);
                          return (
                            <AttachmentDownloadControl
                              attachmentId={currAttach.id || dlUrl}
                              filename={currAttach.file}
                              downloadUrl={dlUrl}
                              mimeType={currAttach.type}
                              lang={lang}
                              isLight={isLight}
                              variant="button"
                            />
                          );
                        })()}
                        <button
                          onClick={() => setGalleryState(null)}
                          className="p-2 rounded-xl bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-primary)] cursor-pointer border border-[var(--theme-border)]"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center relative my-2 overflow-hidden">
                      {galleryState.list.length > 1 && (
                        <button
                          onClick={() =>
                            setGalleryState({
                              ...galleryState,
                              initialIndex:
                                (galleryState.initialIndex -
                                  1 +
                                  galleryState.list.length) %
                                galleryState.list.length,
                            })
                          }
                          className="absolute left-4 p-3 rounded-2xl bg-[var(--theme-bg-secondary)]/80 hover:bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] border border-[var(--theme-border)] z-10 cursor-pointer shadow-lg"
                        >
                          <ChevronLeft className="w-6 h-6" />
                        </button>
                      )}

                      {(() => {
                        const currentAttach =
                          galleryState.list[galleryState.initialIndex];
                        if (!currentAttach) return null;
                        const downloadUrl = getAttachmentUrl(currentAttach);
                        const isFailed = failedImageIds.has(currentAttach.id);
                        const isUnrenderable = isAttachmentUnrenderable(
                          currentAttach.file,
                          currentAttach.type,
                          isFailed,
                        );
                        const isImage = isAttachmentImage(
                          currentAttach.file,
                          currentAttach.type,
                          isFailed,
                        );
                        const isVideo = isAttachmentVideo(
                          currentAttach.file,
                          currentAttach.type,
                        );
                        const isAudio = isAttachmentAudio(
                          currentAttach.file,
                          currentAttach.type,
                        );

                        if (isImage) {
                          return (
                            <img
                              src={downloadUrl}
                              alt="Full View"
                              className="max-h-full max-w-full object-contain rounded-xl shadow-2xl border border-[var(--theme-border)]"
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setFailedImageIds((prev) =>
                                  new Set(prev).add(currentAttach.id),
                                )
                              }
                            />
                          );
                        } else if (isUnrenderable) {
                          return (
                            <div className="p-8 bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] rounded-3xl flex flex-col items-center gap-4 text-center max-w-lg shadow-2xl text-[var(--theme-text-primary)]">
                              <div className="w-20 h-20 rounded-2xl bg-[var(--theme-accent,#7bae37)] text-[var(--theme-bg-primary)] flex items-center justify-center shadow-xl">
                                <Aperture className="w-10 h-10 animate-spin-slow" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="px-3 py-1 rounded-lg bg-[var(--theme-bg-tertiary,var(--theme-bg-secondary))] text-[var(--theme-accent,#7bae37)] font-extrabold text-xs uppercase tracking-wider border border-[var(--theme-border)]">
                                  {currentAttach.file
                                    .split(".")
                                    .pop()
                                    ?.toUpperCase() || "EXR"}{" "}
                                  IMAGE
                                </span>
                              </div>
                              <span className="font-extrabold text-base text-[var(--theme-text-primary)] truncate max-w-sm">
                                {currentAttach.file}
                              </span>
                              <p className="text-xs text-[var(--theme-text-muted)] max-w-xs leading-relaxed">
                                {getImageFormatTitle(currentAttach.file)}
                              </p>
                              <div className="flex items-center gap-3 mt-2">
                                <AttachmentDownloadControl
                                  attachmentId={currentAttach.id || downloadUrl}
                                  filename={currentAttach.file}
                                  downloadUrl={downloadUrl}
                                  mimeType={currentAttach.type}
                                  lang={lang}
                                  isLight={isLight}
                                  variant="button"
                                />
                              </div>
                            </div>
                          );
                        } else if (isVideo) {
                          return (
                            <div className="max-h-[80vh] max-w-[90vw] flex items-center justify-center">
                              <SmartVideoPlayer
                                src={downloadUrl}
                                title={currentAttach.file}
                                autoPlay
                                lang={lang}
                                isLight={isLight}
                                className="max-h-[75vh] max-w-[85vw] rounded-2xl shadow-2xl border border-[var(--theme-border)] bg-black"
                                onPlayGlobal={onPlayGlobalTrack}
                              />
                            </div>
                          );
                        } else if (isAudio) {
                          return (
                            <div className="p-8 bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] rounded-2xl flex flex-col items-center gap-4 text-center max-w-md w-full text-[var(--theme-text-primary)]">
                              <Music className="w-12 h-12 text-[var(--theme-accent,#7bae37)] animate-pulse" />
                              <span className="font-bold text-sm text-[var(--theme-text-primary)] truncate max-w-xs">
                                {currentAttach.file}
                              </span>
                              <audio
                                src={downloadUrl}
                                controls
                                autoPlay
                                className="w-full mt-2"
                              />
                              <AttachmentDownloadControl
                                attachmentId={currentAttach.id || downloadUrl}
                                filename={currentAttach.file}
                                downloadUrl={downloadUrl}
                                mimeType={currentAttach.type}
                                lang={lang}
                                isLight={isLight}
                                variant="button"
                              />
                            </div>
                          );
                        } else {
                          return (
                            <div className="p-8 bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] rounded-2xl flex flex-col items-center gap-4 text-center max-w-md text-[var(--theme-text-primary)]">
                              <FileText className="w-16 h-16 text-[var(--theme-accent,#7bae37)]" />
                              <span className="font-bold text-sm text-[var(--theme-text-primary)] truncate max-w-xs">
                                {currentAttach.file}
                              </span>
                              <AttachmentDownloadControl
                                attachmentId={currentAttach.id || downloadUrl}
                                filename={currentAttach.file}
                                downloadUrl={downloadUrl}
                                mimeType={currentAttach.type}
                                lang={lang}
                                isLight={isLight}
                                variant="button"
                              />
                            </div>
                          );
                        }
                      })()}

                      {galleryState.list.length > 1 && (
                        <button
                          onClick={() =>
                            setGalleryState({
                              ...galleryState,
                              initialIndex:
                                (galleryState.initialIndex + 1) %
                                galleryState.list.length,
                            })
                          }
                          className="absolute right-4 p-3 rounded-2xl bg-[var(--theme-bg-secondary)]/80 hover:bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] border border-[var(--theme-border)] z-10 cursor-pointer shadow-lg"
                        >
                          <ChevronRight className="w-6 h-6" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>,
              document.body,
            )}
        </div>{" "}
        {/* End of Messages & Input Column */}
        {/* Desktop Persistent Member List Panel */}
        <AnimatePresence>
          {showMemberList && isDesktop && displayServer && (
            <motion.div
              data-member-list-desktop="true"
              initial={
                wasExplicitlyToggledRef.current
                  ? { opacity: 0, width: 0 }
                  : false
              }
              animate={{ opacity: 1, width: 256 }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
              style={{ willChange: "width, opacity" }}
              onAnimationStart={() => {
                if (scrollRef.current && !isAtBottomRef.current) {
                  panelResizeAnchorRef.current = getLiveViewportAnchor();
                }
              }}
              onAnimationComplete={() => {
                if (scrollRef.current) {
                  const scrollEl = scrollRef.current;
                  if (isAtBottomRef.current) {
                    scrollEl.scrollTop =
                      scrollEl.scrollHeight - scrollEl.clientHeight;
                  } else if (panelResizeAnchorRef.current) {
                    restoreViewportAnchor(panelResizeAnchorRef.current);
                    panelResizeAnchorRef.current = null;
                  }
                }
              }}
              className="hidden md:flex flex-col shrink-0 h-full overflow-hidden select-none bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] ltr:border-l rtl:border-r border-[var(--theme-border)] rounded-none"
            >
              <div className="w-[256px] min-w-[256px] h-full flex flex-col overflow-hidden rounded-none">
                <MemberListContent
                  serverName={displayServer?.name}
                  totalMembersCount={unifiedServerMembers.length}
                  groupedMembers={groupedMembers}
                  memberSearchQuery={memberSearchQuery}
                  setMemberSearchQuery={setMemberSearchQuery}
                  onSelectUser={onSelectUser}
                  showCloseButton={false}
                  onClose={handleCloseMemberList}
                  lang={lang}
                  isLight={isLight}
                  scrollRef={memberListScrollRef}
                  onScroll={handleMemberListScroll}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Mobile Slide-Over Member Drawer */}
        <AnimatePresence>
          {(isDesktop ? showMemberList : activeOverlay === "members") &&
            !isDesktop &&
            displayServer && (
              <>
                {/* Backdrop Overlay */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  onClick={handleCloseAllOverlays}
                  className="md:hidden fixed inset-0 bg-black/60 z-[70] pointer-events-auto"
                />

                {/* Mobile Slide-Over Panel */}
                <motion.div
                  initial={{ x: lang === "ar" ? "-100%" : "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: lang === "ar" ? "-100%" : "100%" }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  style={{ willChange: "transform" }}
                  onClick={(e) => e.stopPropagation()}
                  data-mobile-drawer="members"
                  className={`md:hidden fixed inset-y-0 ${lang === "ar" ? "left-0 border-r" : "right-0 border-l"} border-[var(--theme-border)] w-[78vw] max-w-[320px] sm:w-[50vw] sm:max-w-[340px] md:w-80 z-[70] flex flex-col bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] overflow-hidden shadow-2xl mobile-drawer-panel`}
                >
                  <MemberListContent
                    serverName={displayServer?.name}
                    totalMembersCount={unifiedServerMembers.length}
                    groupedMembers={groupedMembers}
                    memberSearchQuery={memberSearchQuery}
                    setMemberSearchQuery={setMemberSearchQuery}
                    onSelectUser={(u, anchor) => {
                      // Do NOT close Members panel when inspecting member profile
                      onSelectUser?.(u, anchor);
                    }}
                    showCloseButton={true}
                    onClose={handleCloseAllOverlays}
                    lang={lang}
                    isLight={isLight}
                    scrollRef={memberListScrollRef}
                    onScroll={handleMemberListScroll}
                  />
                </motion.div>
              </>
            )}
        </AnimatePresence>
      </div>{" "}
      {/* End of Main Chat Body Flex Row */}
      {/* Grid Gallery Modal for messages with > 4 attachments */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence mode="wait">
            {gridGalleryList && (
              <motion.div
                key="grid-gallery-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setGridGalleryList(null)}
                className="fixed inset-0 w-screen h-screen w-[100vw] h-[100vh] bg-black/40 backdrop-blur-sm z-[99998] flex items-center justify-center p-4 select-none"
              >
                <motion.div
                  key="grid-gallery-modal-card"
                  initial={{ opacity: 0, scale: 0.94, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 16 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-3xl max-h-[85vh] rounded-2xl border p-5 flex flex-col gap-4 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] bg-[var(--theme-bg-secondary)]/60 backdrop-blur-2xl border-[var(--theme-border)]/80 text-[var(--theme-text-primary)]"
                  dir={lang === "ar" ? "rtl" : "ltr"}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--theme-border)]">
                    <div className="flex items-center gap-2 font-black text-sm text-[var(--theme-text-primary)]">
                      <Paperclip className="w-4 h-4 text-[var(--theme-accent,#7bae37)]" />
                      <span>
                        {lang === "ar"
                          ? `معرض المرفقات (${gridGalleryList.length})`
                          : `Attachment Gallery (${gridGalleryList.length})`}
                      </span>
                    </div>
                    <button
                      onClick={() => setGridGalleryList(null)}
                      className="p-1.5 rounded-lg hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-all cursor-pointer border-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-1 custom-scrollbar">
                    {gridGalleryList.map((attach, idx) => {
                      const isFailed = failedImageIds.has(attach.id);
                      const isImage = isAttachmentImage(
                        attach.file,
                        attach.type,
                        isFailed,
                      );
                      const isVideo = isAttachmentVideo(
                        attach.file,
                        attach.type,
                      );
                      const downloadUrl = getAttachmentUrl(attach);

                      return (
                        <div
                          key={attach.id}
                          onClick={() => {
                            setGalleryState({
                              list: gridGalleryList,
                              initialIndex: idx,
                            });
                          }}
                          className="relative rounded-xl overflow-hidden border border-[var(--theme-border)] shadow-md h-32 cursor-pointer group/item flex items-center justify-center transition-all hover:scale-102 hover:border-[var(--theme-accent,#7bae37)] bg-[var(--theme-bg-secondary)]"
                        >
                          {isImage ? (
                            <UploadedImagePreview
                              src={getAttachmentThumbnailUrl(attach, "400x400")}
                              alt={attach.file}
                              maxPreviewWidth={400}
                              maxPreviewHeight={400}
                              className="w-full h-full object-cover group-hover/item:scale-105 transition-all"
                            />
                          ) : isVideo ? (
                            <div className="relative w-full h-full flex flex-col items-center justify-center bg-black/40">
                              <Video className="w-8 h-8 text-[var(--theme-accent,#7bae37)]" />
                              <span className="text-[10px] font-bold text-white mt-1 truncate max-w-full px-2">
                                {attach.file}
                              </span>
                            </div>
                          ) : (
                            <div className="w-full h-full p-3 flex flex-col items-center justify-center text-center">
                              <FileText className="w-7 h-7 text-[var(--theme-accent,#7bae37)] mb-1" />
                              <span className="text-xs font-bold truncate max-w-full text-[var(--theme-text-primary)]">
                                {attach.file}
                              </span>
                              <span className="text-[9px] font-mono text-[var(--theme-text-muted)] mt-0.5">
                                {attach.size || "File"}
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-[var(--theme-accent,#7bae37)]/0 group-hover/item:bg-[var(--theme-accent,#7bae37)]/10 transition-all flex items-end justify-end p-2 opacity-0 group-hover/item:opacity-100">
                            <Maximize2 className="w-4 h-4 text-[var(--theme-text-primary)] drop-shadow" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* Report Message Modal */}
      {showReportMessageModal && reportMessageTarget && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl p-5 border shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150 ${
            isLight ? "bg-white border-slate-200 text-slate-800" : "bg-slate-900 border-slate-800 text-slate-100"
          }`}>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Flag className="w-4 h-4 text-amber-400" />
                <span>{lang === "ar" ? "تقديم بلاغ عن محتوى" : "Report Message Content"}</span>
              </div>
              <button
                onClick={() => {
                  setShowReportMessageModal(false);
                  setReportMessageTarget(null);
                }}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer border-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reportSuccessMsg ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold text-center">
                {reportSuccessMsg}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    {lang === "ar" ? "سبب البلاغ" : "Reason for report"}
                  </label>
                  <input
                    type="text"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    placeholder={lang === "ar" ? "مثال: محتوى غير لائق، مضايقة..." : "e.g., Inappropriate content, harassment..."}
                    className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${
                      isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-slate-950 border-slate-700 text-slate-100"
                    }`}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    {lang === "ar" ? "تفاصيل إضافية" : "Additional details (optional)"}
                  </label>
                  <textarea
                    rows={3}
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder={lang === "ar" ? "اكتب تفاصيل إضافية عن البلاغ..." : "Describe what is wrong with this message..."}
                    className={`w-full px-3 py-2 rounded-xl text-xs border outline-none resize-none ${
                      isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-slate-950 border-slate-700 text-slate-100"
                    }`}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReportMessageModal(false);
                      setReportMessageTarget(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all cursor-pointer border-0"
                  >
                    {lang === "ar" ? "إلغاء" : "Cancel"}
                  </button>
                  <button
                    type="button"
                    disabled={!reportReason.trim() || isSubmittingReport}
                    onClick={handleSendMessageReport}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-extrabold text-xs transition-all cursor-pointer border-0 flex items-center gap-1.5"
                  >
                    {isSubmittingReport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
                    <span>{lang === "ar" ? "إرسال البلاغ" : "Submit Report"}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Advanced Search Modal */}
      {showAdvancedSearchModal && (
        <AdvancedSearchModal
          server={server || null}
          currentChannel={channel}
          serverChannels={serverChannels}
          currentUser={currentUser}
          onClose={() => setShowAdvancedSearchModal(false)}
          cachedMessages={displayedMessages}
          onSelectMessage={(chanId, msgId) => {
            if (chanId === channel.id) {
              scrollToMessage(msgId);
            } else if (onNavigateToMessageLink) {
              onNavigateToMessageLink(server?.id || "dm", chanId, msgId);
            }
          }}
          lang={lang}
        />
      )}
    </div>
  );
}

const MemberListContent = React.memo(function MemberListContent({
  serverName,
  totalMembersCount,
  groupedMembers,
  memberSearchQuery,
  setMemberSearchQuery,
  onSelectUser,
  showCloseButton,
  onClose,
  lang,
  isLight,
  scrollRef,
  onScroll,
}: {
  serverName?: string;
  totalMembersCount: number;
  groupedMembers: {
    totalCount: number;
    onlineCount: number;
    offlineCount: number;
    onlineGroups: Array<{
      roleName: string;
      roleColor?: string;
      roleOrder: number;
      members: Array<any>;
    }>;
    offlineGroups: Array<{
      roleName: string;
      roleColor?: string;
      roleOrder: number;
      members: Array<any>;
    }>;
  };
  memberSearchQuery: string;
  setMemberSearchQuery: (q: string) => void;
  onSelectUser?: (u: User, anchor?: any) => void;
  showCloseButton?: boolean;
  onClose?: () => void;
  lang: "en" | "ar";
  isLight: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}) {
  const [visibleMemberLimit, setVisibleMemberLimit] = useState(60);

  const handleMemberListScrollInternal = (e: React.UIEvent<HTMLDivElement>) => {
    onScroll(e);
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 300) {
      setVisibleMemberLimit((prev) => prev + 25);
    }
  };

  let renderedCount = 0;

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Panel Header & Filter Bar */}
      {showCloseButton ? (
        <>
          <div className="h-14 px-3.5 border-b border-[var(--theme-border)] flex items-center justify-between shrink-0 bg-[var(--theme-bg-secondary)]">
            <div className="flex items-center gap-2 min-w-0">
              <Users className="w-4 h-4 text-accent shrink-0" />
              <span className="font-extrabold text-xs sm:text-sm truncate text-[var(--theme-text-primary)]">
                {lang === "ar" ? "أعضاء السيرفر" : "Server Members"}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent font-mono font-bold shrink-0">
                {totalMembersCount}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-all cursor-pointer border-0 shrink-0"
              title={lang === "ar" ? "إغلاق" : "Close"}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-2 border-b border-[var(--theme-border)] shrink-0 sticky top-0 bg-[var(--theme-bg-secondary)] z-10">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] focus-within:border-accent/50">
              <Search className="w-3.5 h-3.5 text-[var(--theme-text-muted)] shrink-0" />
              <input
                type="text"
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                placeholder={lang === "ar" ? "بحث عن عضو..." : "Filter members..."}
                className="w-full bg-transparent border-0 outline-none text-xs font-medium text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
              />
              {memberSearchQuery && (
                <button
                  onClick={() => setMemberSearchQuery("")}
                  className="p-0.5 hover:bg-slate-500/20 rounded cursor-pointer"
                >
                  <X className="w-3 h-3 text-[var(--theme-text-muted)]" />
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Single aligned h-14 Header bar for Desktop */
        <div className="h-14 px-3 border-b border-[var(--theme-border)] flex items-center justify-between shrink-0 bg-[var(--theme-bg-secondary)] gap-1.5 rounded-none">
          <div className="flex items-center gap-1.5 min-w-0">
            <Users className="w-4 h-4 text-accent shrink-0" />
            <span className="font-extrabold text-xs truncate text-[var(--theme-text-primary)]">
              {lang === "ar" ? "أعضاء السيرفر" : "Server Members"}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-mono font-bold shrink-0">
              {totalMembersCount}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] focus-within:border-accent/50 focus-within:bg-[var(--theme-bg-card)] shrink-0">
              <Search className="w-3 h-3 text-[var(--theme-text-muted)] shrink-0" />
              <input
                type="text"
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                placeholder={lang === "ar" ? "بحث..." : "Filter..."}
                className="w-16 focus:w-24 transition-all bg-transparent border-0 outline-none text-xs font-medium text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
              />
              {memberSearchQuery && (
                <button
                  type="button"
                  onClick={() => setMemberSearchQuery("")}
                  className="p-0.5 hover:bg-slate-500/20 rounded cursor-pointer border-0"
                >
                  <X className="w-2.5 h-2.5 text-[var(--theme-text-muted)]" />
                </button>
              )}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-all cursor-pointer border-0 shrink-0"
                title={lang === "ar" ? "إغلاق" : "Close"}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scrollable Members List */}
      <div
        ref={scrollRef}
        onScroll={handleMemberListScrollInternal}
        className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 space-y-3.5 hover-scrollbar relative min-h-0"
        style={{ touchAction: "pan-y", overscrollBehaviorY: "contain" }}
      >
        {groupedMembers.totalCount === 0 ? (
          <div className="py-8 text-center text-[var(--theme-text-muted)] text-xs italic font-medium">
            {lang === "ar" ? "لم يتم العثور على أعضاء" : "No members found"}
          </div>
        ) : (
          <>
            {/* ONLINE SECTION */}
            {groupedMembers.onlineGroups.length > 0 && (
              <div className="space-y-2.5">
                {/* Category Header */}
                <div className="text-[10px] font-black tracking-wider uppercase font-mono text-accent flex items-center gap-1.5 px-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--status-online)] animate-pulse" />
                  <span>{lang === "ar" ? "متصل" : "ONLINE"}</span>
                  <span className="opacity-60">
                    — {groupedMembers.onlineCount}
                  </span>
                </div>

                {/* Role Groups */}
                {groupedMembers.onlineGroups.map((group) => (
                  <div
                    key={`online-group-${group.roleName}`}
                    className="space-y-1"
                  >
                    {/* Role Header */}
                    <div className="text-[10px] font-bold text-[var(--theme-text-muted)] font-mono uppercase px-2 py-0.5 flex items-center justify-between">
                      <span
                        style={{ color: group.roleColor }}
                        className="truncate"
                      >
                        {group.roleName}
                      </span>
                      <span className="text-[9px] opacity-70">
                        — {group.members.length}
                      </span>
                    </div>

                    {/* Member Cards */}
                    {group.members.map((m) => {
                      if (renderedCount >= visibleMemberLimit) return null;
                      renderedCount++;
                      return (
                        <MemberCard
                          key={`online-${m.user.id}`}
                          member={m}
                          isLight={isLight}
                          onSelectUser={onSelectUser}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* OFFLINE SECTION */}
            {groupedMembers.offlineGroups.length > 0 &&
              renderedCount < visibleMemberLimit && (
                <div className="space-y-2.5 pt-2">
                  {/* Category Header */}
                  <div className="text-[10px] font-black tracking-wider uppercase font-mono text-[var(--theme-text-muted)] flex items-center gap-1.5 px-1">
                    <span className="w-2 h-2 rounded-full bg-[var(--status-offline)]" />
                    <span>{lang === "ar" ? "غير متصل" : "OFFLINE"}</span>
                    <span className="opacity-60">
                      — {groupedMembers.offlineCount}
                    </span>
                  </div>

                  {/* Role Groups */}
                  {groupedMembers.offlineGroups.map((group) => (
                    <div
                      key={`offline-group-${group.roleName}`}
                      className="space-y-1"
                    >
                      {/* Role Header */}
                      <div className="text-[10px] font-bold text-[var(--theme-text-muted)] font-mono uppercase px-2 py-0.5 flex items-center justify-between">
                        <span
                          style={{ color: group.roleColor }}
                          className="truncate"
                        >
                          {group.roleName}
                        </span>
                        <span className="text-[9px] opacity-70">
                          — {group.members.length}
                        </span>
                      </div>

                      {/* Member Cards */}
                      {group.members.map((m) => {
                        if (renderedCount >= visibleMemberLimit) return null;
                        renderedCount++;
                        return (
                          <MemberCard
                            key={`offline-${m.user.id}`}
                            member={m}
                            isLight={isLight}
                            onSelectUser={onSelectUser}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
});

const MemberCard = React.memo(function MemberCard({
  member,
  isLight,
  onSelectUser,
}: {
  member: any;
  isLight: boolean;
  onSelectUser?: (u: User, anchor?: any) => void;
  key?: string;
}) {
  const isOnline =
    member.status === "online" ||
    member.status === "away" ||
    member.status === "dnd";
  return (
    <div
      style={{ touchAction: "pan-y" }}
      onClick={(e) => {
        e.stopPropagation();
        onSelectUser?.(member.user, e.currentTarget);
      }}
      className={`p-2 rounded-xl flex items-center gap-2.5 transition-colors duration-150 cursor-pointer border border-transparent bg-transparent hover:bg-[var(--theme-bg-tertiary)] hover:border-[var(--theme-border)] ${!isOnline ? "opacity-70 hover:opacity-100" : ""}`}
    >
      <div
        data-member-avatar="true"
        className="relative shrink-0 pointer-events-none"
      >
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt={member.displayName}
            className="w-8 h-8 rounded-lg object-cover ring-1 ring-[var(--theme-border)]"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-accent/20 text-accent font-black text-xs flex items-center justify-center border border-accent/30">
            {(member.displayName || "U").substring(0, 2).toUpperCase()}
          </div>
        )}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[var(--theme-bg-primary)] ${
            member.status === "online"
              ? "bg-[var(--status-online)]"
              : member.status === "away"
                ? "bg-[var(--status-away)]"
                : member.status === "dnd"
                  ? "bg-[var(--status-dnd)]"
                  : "bg-[var(--status-offline)]"
          }`}
        />
      </div>

      <div className="flex flex-col min-w-0 flex-1 pointer-events-none">
        <div className="flex items-center justify-between gap-1">
          <span
            className={`font-bold text-xs truncate ${!isOnline ? "text-slate-400" : "text-[var(--theme-text-primary)]"}`}
            style={
              !isOnline
                ? { color: "#888888" }
                : member.roleColor
                  ? { color: member.roleColor }
                  : undefined
            }
          >
            {member.displayName}
          </span>
          {member.isOwner && (
            <span
              className="text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-amber-500/20 text-amber-500 shrink-0"
              title="Server Owner"
            >
              👑
            </span>
          )}
        </div>
        <span className="text-[10px] text-[var(--theme-text-muted)] font-mono truncate">
          @{member.username}
        </span>
      </div>
    </div>
  );
});

export default React.memo(ChatPanel);
