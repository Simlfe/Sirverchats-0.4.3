import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { SmilePlus, Search, X } from "lucide-react";
import { User, Message, ServerMember } from "../types";

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/**
 * Universal resilient reactions parser.
 * Safely parses any reactions payload:
 * - JSON string (single or multi-level escaped)
 * - Array of objects [{ emoji, users }] or [{ emoji, user }] or [{ emoji, count }]
 * - Object map { "👍": ["userId1", "userId2"] } or { "👍": "userId1,userId2" } or { "👍": 2 }
 * - Nested objects { reactions: ... }
 */
export function parseReactions(raw: any): { emoji: string; users: string[] }[] {
  if (!raw) return [];
  let parsed = raw;

  // Handle possible multi-layer stringified JSON
  if (typeof parsed === "string") {
    let iterations = 0;
    while (typeof parsed === "string" && iterations < 3) {
      try {
        const next = JSON.parse(parsed);
        parsed = next;
        iterations++;
      } catch {
        break;
      }
    }
  }

  // Handle wrapper object { reactions: ... } or { data: ... }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (parsed.reactions && (typeof parsed.reactions === "object" || typeof parsed.reactions === "string")) {
      return parseReactions(parsed.reactions);
    }
  }

  const result: { emoji: string; users: string[] }[] = [];

  const extractUserId = (u: any): string | null => {
    if (!u) return null;
    if (typeof u === "string") return u.trim() || null;
    if (typeof u === "number") return String(u);
    if (typeof u === "object") {
      return u.id || u.user_id || u.userId || u.username || null;
    }
    return null;
  };

  const extractUsersArray = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) {
      return val.map(extractUserId).filter((id): id is string => Boolean(id));
    }
    if (typeof val === "string") {
      if (val.includes(",") || val.startsWith("[")) {
        try {
          const parsedArr = JSON.parse(val);
          if (Array.isArray(parsedArr)) {
            return parsedArr.map(extractUserId).filter((id): id is string => Boolean(id));
          }
        } catch {}
        return val.split(",").map((s) => s.trim()).filter(Boolean);
      }
      return [val.trim()].filter(Boolean);
    }
    if (typeof val === "object" && val !== null) {
      if (Array.isArray(val.users)) {
        return val.users.map(extractUserId).filter((id): id is string => Boolean(id));
      }
      if (Array.isArray(val.user_ids)) {
        return val.user_ids.map(extractUserId).filter((id): id is string => Boolean(id));
      }
      if (Array.isArray(val.userIds)) {
        return val.userIds.map(extractUserId).filter((id): id is string => Boolean(id));
      }
      // Check if keys are user IDs
      const keys = Object.keys(val).filter(
        (k) => k !== "count" && k !== "emoji" && k !== "reaction" && Boolean(val[k])
      );
      if (keys.length > 0) {
        return keys;
      }
    }
    return [];
  };

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item) continue;
      if (typeof item === "string") {
        result.push({ emoji: item, users: ["unknown"] });
        continue;
      }
      if (typeof item === "object") {
        const emoji = item.emoji || item.reaction || item.name || item.code;
        if (!emoji || typeof emoji !== "string") continue;
        const users = extractUsersArray(
          item.users || item.user_ids || item.userIds || item.user || item.members
        );
        if (users.length > 0) {
          result.push({ emoji, users });
        } else if (item.count && typeof item.count === "number" && item.count > 0) {
          result.push({
            emoji,
            users: Array.from({ length: item.count }, (_, i) => `anon-${i}`),
          });
        }
      }
    }
  } else if (typeof parsed === "object" && parsed !== null) {
    for (const [emoji, val] of Object.entries(parsed)) {
      if (!emoji) continue;
      const users = extractUsersArray(val);
      if (users.length > 0) {
        result.push({ emoji, users });
      } else if (typeof val === "number" && val > 0) {
        result.push({
          emoji,
          users: Array.from({ length: val }, (_, i) => `anon-${i}`),
        });
      }
    }
  }

  // Deduplicate and merge by emoji, strictly preserving original insertion order
  const orderList: string[] = [];
  const mergedMap = new Map<string, Set<string>>();
  for (const { emoji, users } of result) {
    if (!mergedMap.has(emoji)) {
      mergedMap.set(emoji, new Set());
      orderList.push(emoji);
    }
    const set = mergedMap.get(emoji)!;
    for (const u of users) {
      set.add(u);
    }
  }

  const finalResults: { emoji: string; users: string[] }[] = [];
  for (const emoji of orderList) {
    const userSet = mergedMap.get(emoji);
    if (userSet && userSet.size > 0) {
      finalResults.push({ emoji, users: Array.from(userSet) });
    }
  }

  return finalResults;
}

/**
 * Safely toggles a user's reaction on a reactions payload while strictly preserving
 * the existing insertion order of reaction emojis and maintaining positional integrity.
 */
export function toggleReactionInList(
  rawReactions: any,
  emoji: string,
  userId: string
): { emoji: string; users: string[] }[] {
  const currentList = parseReactions(rawReactions);
  const idx = currentList.findIndex((item) => item.emoji === emoji);

  if (idx >= 0) {
    const existing = currentList[idx];
    const users = [...existing.users];
    const uIdx = users.indexOf(userId);
    if (uIdx >= 0) {
      users.splice(uIdx, 1);
    } else {
      users.push(userId);
    }

    if (users.length > 0) {
      // Preserve exact same position in the reactions array
      const updated = [...currentList];
      updated[idx] = { emoji, users };
      return updated;
    } else {
      // Remove this emoji without shifting other emojis' relative order
      return currentList.filter((_, i) => i !== idx);
    }
  } else {
    // New reaction: append to the end of the array to preserve chronological addition order
    return [...currentList, { emoji, users: [userId] }];
  }
}

export const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👏", "🚀", "💯", "✨", "💩"];

export const EMOJI_CATEGORIES: { nameEn: string; nameAr: string; emojis: string[] }[] = [
  {
    nameEn: "Popular",
    nameAr: "شائع",
    emojis: ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👏", "🚀", "💯", "✨", "💩", "🙏", "👀", "🙌", "💀", "😍", "🥳"],
  },
  {
    nameEn: "Smileys",
    nameAr: "ابتسامات",
    emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "🥹", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🫣", "🫢", "🫡", "🤫", "🫠", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷"],
  },
  {
    nameEn: "Gestures",
    nameAr: "إيماءات",
    emojis: ["👍", "👎", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤝", "🙏", "✍️", "💪", "🦾", "👏", "🙌", "🫶", "👐", "🤲", "🤜", "🤛", "✊", "👊", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "💖", "💗", "💓", "💞", "💕", "💌"],
  },
  {
    nameEn: "Letters",
    nameAr: "حروف",
    emojis: [
      "🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬", "🇭", "🇮", "🇯", "🇰", "🇱", "🇲", "🇳", "🇴", "🇵", "🇶", "🇷", "🇸", "🇹", "🇺", "🇻", "🇼", "🇽", "🇾", "🇿",
      "🅰️", "🅱️", "🆎", "🅾️", "🆑", "🆒", "🆓", "🆔", "🆕", "🆖", "🆗", "🆘", "🆙", "🆚", "🅿️", "ℹ️", "Ⓜ️",
      "🔤", "🔡", "🔠", "🔢", "0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟", "#️⃣", "*️⃣",
      "🈁", "🈂️", "🈚", "🈯", "🈲", "🈳", "🈴", "🈵", "🈶", "🈷️", "🈸", "🈹", "🈺", "🉐", "🉑"
    ],
  },
  {
    nameEn: "Symbols & Objects",
    nameAr: "رموز وأشياء",
    emojis: ["🔥", "✨", "⭐", "🌟", "💫", "💥", "🎉", "🎊", "🎈", "🎂", "🎁", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "🎮", "🎯", "🎨", "🎤", "🎧", "🚀", "🛸", "💎", "💡", "🔔", "📢", "💯", "💢", "💬", "💤", "⚡", "🌈", "☀️", "🌙", "👑", "🛡️", "⚔️", "☕", "🍕", "🍔", "🍿", "🍻", "🥂"],
  },
];

export function getReactionTooltip(
  userIds: string[],
  emoji: string,
  lang: "en" | "ar",
  currentUser?: User,
  allUsers: User[] = [],
  membersMap?: Map<string, ServerMember>
): string {
  const names: string[] = [];
  for (const uid of userIds) {
    if (currentUser && uid === currentUser.id) {
      names.push(lang === "ar" ? "أنت" : "You");
    } else {
      const u = allUsers.find((user) => user.id === uid);
      const mem = membersMap?.get(uid);
      const name = mem?.nickname || u?.display_name || u?.username || (lang === "ar" ? "مستخدم" : "User");
      names.push(name);
    }
  }

  if (names.length === 0) return emoji;

  if (lang === "ar") {
    if (names.length === 1) return `${names[0]} تفاعل بـ ${emoji}`;
    if (names.length === 2) return `${names[0]} و ${names[1]} تفاعلا بـ ${emoji}`;
    return `${names.slice(0, 2).join("، ")} و ${names.length - 2} آخرين تفاعلوا بـ ${emoji}`;
  } else {
    if (names.length === 1) return `${names[0]} reacted with ${emoji}`;
    if (names.length === 2) return `${names[0]} and ${names[1]} reacted with ${emoji}`;
    return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others reacted with ${emoji}`;
  }
}

const EMOJI_KEYWORDS: Record<string, string[]> = {
  "👍": ["thumbs up", "thumb", "like", "yes", "good", "approve", "ok", "لايك", "اعجاب", "نعم", "موافق", "ممتاز", "جيد"],
  "👎": ["thumbs down", "dislike", "no", "bad", "disapprove", "دزلايك", "لا", "سيء", "رفض"],
  "❤️": ["heart", "love", "red heart", "like", "قلب", "حب", "احمر"],
  "🔥": ["fire", "flame", "lit", "hot", "نار", "حريق", "ولعة", "حماس"],
  "😂": ["joy", "laugh", "lol", "crying laughing", "funny", "ضحك", "مضحك", "هههه"],
  "🤣": ["rofl", "rolling on the floor", "laughing", "ضحك", "هههه"],
  "😍": ["heart eyes", "love", "adore", "حب", "عيون قلب"],
  "🥰": ["smiling heart", "love", "cute", "حب", "لطيف"],
  "😮": ["open mouth", "surprised", "wow", "omg", "مندهش", "واو", "مفاجأة"],
  "😢": ["crying", "sad", "tear", "حزين", "دموع", "بكاء"],
  "😭": ["loudly crying", "sob", "sad", "بكاء", "صراخ", "حزن"],
  "🎉": ["party", "tada", "celebrate", "congrats", "احتفال", "مبروك", "تهنئة", "حفلة"],
  "👏": ["clap", "applause", "bravo", "تصفيق", "برافو", "تحية"],
  "🚀": ["rocket", "launch", "fast", "space", "صاروخ", "انطلاق", "سرعة"],
  "💯": ["100", "hundred", "perfect", "score", "مئة", "كامل", "ممتاز"],
  "✨": ["sparkles", "shine", "magic", "stars", "بريق", "لمعان", "سحر", "نجوم"],
  "💩": ["poop", "poo", "خرا", "براز"],
  "🙏": ["pray", "thank you", "please", "hope", "دعاء", "شكرا", "رجاء", "امل"],
  "👀": ["eyes", "look", "see", "watch", "عيون", "نظر", "شوف"],
  "🙌": ["raising hands", "hooray", "celebrate", "تحية", "رفع اليدين"],
  "💀": ["skull", "dead", "died", "جمجمة", "ميت"],
  "🥳": ["partying", "birthday", "celebration", "عيد", "حفلة"],
  "😎": ["cool", "sunglasses", "swag", "نظارات", "كول", "فخم"],
  "🤔": ["thinking", "hmm", "ponder", "تفكير", "همم", "سؤال"],
  "🥺": ["pleading", "puppy eyes", "please", "توسل", "رجاء"],
  "😴": ["sleeping", "zzz", "tired", "sleep", "نوم", "نايم", "تعبان"],
  "🤯": ["exploding head", "mind blown", "shocked", "انفجار", "صدمة"],
  "🤝": ["handshake", "deal", "agree", "مصافحة", "اتفاق"],
  "⭐": ["star", "favorite", "نجمة", "مميز"],
  "💡": ["lightbulb", "idea", "فكرة", "لمبة"],
  "👑": ["crown", "king", "queen", "تاج", "ملك"],
  "☕": ["coffee", "tea", "drink", "قهوة", "شاي"],
  "🍕": ["pizza", "food", "بيتزا", "طعام"],
  "🎮": ["game", "controller", "gaming", "لعبة", "العاب", "قيمز"],
  "🎧": ["headphones", "music", "سماعات", "موسيقى"],
  "🎯": ["target", "bullseye", "goal", "هدف"],
  "🇦": ["a", "letter a", "حرف a", "حرف أ", "الف"],
  "🇧": ["b", "letter b", "حرف b", "حرف ب", "باء"],
  "🇨": ["c", "letter c", "حرف c", "حرف ج", "حرف س"],
  "🇩": ["d", "letter d", "حرف d", "حرف د", "دال"],
  "🇪": ["e", "letter e", "حرف e", "حرف ي"],
  "🇫": ["f", "letter f", "حرف f", "حرف ف", "فاء"],
  "🇬": ["g", "letter g", "حرف g", "حرف غ", "حرف ق"],
  "🇭": ["h", "letter h", "حرف h", "حرف ه", "حرف ح", "هاء"],
  "🇮": ["i", "letter i", "حرف i", "حرف ي"],
  "🇯": ["j", "letter j", "حرف j", "حرف ج", "جيم"],
  "🇰": ["k", "letter k", "حرف k", "حرف ك", "كاف"],
  "🇱": ["l", "letter l", "حرف l", "حرف ل", "لام"],
  "🇲": ["m", "letter m", "حرف m", "حرف م", "ميم"],
  "🇳": ["n", "letter n", "حرف n", "حرف ن", "نون"],
  "🇴": ["o", "letter o", "حرف o", "حرف و"],
  "🇵": ["p", "letter p", "حرف p", "حرف ب"],
  "🇶": ["q", "letter q", "حرف q", "حرف ق", "قاف"],
  "🇷": ["r", "letter r", "حرف r", "حرف ر", "راء"],
  "🇸": ["s", "letter s", "حرف s", "حرف س", "سين"],
  "🇹": ["t", "letter t", "حرف t", "حرف ت", "تاء"],
  "🇺": ["u", "letter u", "حرف u", "حرف يو"],
  "🇻": ["v", "letter v", "حرف v", "حرف ف"],
  "🇼": ["w", "letter w", "حرف w", "حرف و", "واو"],
  "🇽": ["x", "letter x", "حرف x", "اكس"],
  "🇾": ["y", "letter y", "حرف y", "حرف ي", "ياء"],
  "🇿": ["z", "letter z", "حرف z", "حرف ز", "زين"],
  "🅰️": ["a", "blood a", "letter a", "حرف a"],
  "🅱️": ["b", "blood b", "letter b", "حرف b"],
  "🆎": ["ab", "blood ab", "حرف ab"],
  "🅾️": ["o", "blood o", "letter o", "حرف o"],
  "🆒": ["cool", "كول", "رائع"],
  "🆓": ["free", "مجاني", "مجانا"],
  "🆔": ["id", "هوية"],
  "🆕": ["new", "جديد"],
  "🆖": ["ng", "no good", "ان جي"],
  "🆗": ["ok", "اوكي", "حسنا", "تمام", "موافق"],
  "🆘": ["sos", "help", "نجدة", "مساعدة", "طوارئ"],
  "🆙": ["up", "اب", "ترقية"],
  "🆚": ["vs", "versus", "ضد", "مواجهة"],
  "🔤": ["abc", "letters", "حروف", "ابجدية", "alphabet"],
  "🔡": ["abcd", "lowercase", "حروف صغيرة"],
  "🔠": ["abcd", "uppercase", "حروف كبيرة"],
  "🔢": ["1234", "numbers", "ارقام", "أرقام"],
  "0️⃣": ["0", "zero", "صفر"],
  "1️⃣": ["1", "one", "واحد"],
  "2️⃣": ["2", "two", "اثنين", "اثنان"],
  "3️⃣": ["3", "three", "ثلاثة"],
  "4️⃣": ["4", "four", "اربعة"],
  "5️⃣": ["5", "five", "خمسة"],
  "6️⃣": ["6", "six", "ستة"],
  "7️⃣": ["7", "seven", "سبعة"],
  "8️⃣": ["8", "eight", "ثمانية"],
  "9️⃣": ["9", "nine", "تسعة"],
  "🔟": ["10", "ten", "عشرة"],
};

const ALL_EMOJIS = Array.from(new Set(EMOJI_CATEGORIES.flatMap((c) => c.emojis)));

interface MessageReactionChipsProps {
  msg: Message;
  currentUser?: User;
  lang: "en" | "ar";
  isLight?: boolean;
  onToggleReaction: (emoji: string) => void;
  onOpenPicker: (event: React.MouseEvent<HTMLButtonElement>) => void;
  allUsers?: User[];
  membersMap?: Map<string, ServerMember>;
}

export const MessageReactionChips: React.FC<MessageReactionChipsProps> = ({
  msg,
  currentUser,
  lang,
  isLight = false,
  onToggleReaction,
  onOpenPicker,
  allUsers = [],
  membersMap,
}) => {
  const rawReactions = msg.reactions ?? (msg as any).expand?.reactions ?? (msg as any).reactions_list ?? (msg as any).message_reactions;
  const reactionsList = useMemo(() => parseReactions(rawReactions), [rawReactions]);

  // In Arabic mode (dir="rtl"), items flow right-to-left. To preserve the visual left-to-right
  // spelling order (e.g., "G-O-T") while keeping the reaction chips aligned to the right side,
  // we reverse the rendered array for RTL layout.
  const displayReactions = useMemo(() => {
    return lang === "ar" ? [...reactionsList].reverse() : reactionsList;
  }, [reactionsList, lang]);

  if (reactionsList.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 select-none"
      dir={lang === "ar" ? "rtl" : "ltr"}
      onClick={(e) => e.stopPropagation()}
    >
      {displayReactions.map(({ emoji, users }) => {
        const hasReacted = Boolean(currentUser && users.includes(currentUser.id));
        const count = users.length;
        const tooltip = getReactionTooltip(users, emoji, lang, currentUser, allUsers, membersMap);

        return (
          <button
            key={`reaction-${msg.id}-${emoji}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleReaction(emoji);
            }}
            title={tooltip}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer border active:scale-95 ${
              hasReacted
                ? isLight
                  ? "bg-black/10 border-black/40 text-black shadow-xs font-bold"
                  : "bg-[var(--accent-color,#FAF8ED)]/20 border-[var(--accent-color,#FAF8ED)]/70 text-[var(--accent-color,#FAF8ED)] shadow-xs font-bold"
                : isLight
                  ? "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700"
                  : "bg-[var(--theme-bg-secondary,#262630)] hover:bg-[var(--theme-bg-tertiary,#323240)] border-[var(--theme-border,#3E3E50)] text-[var(--theme-text-primary,#FAF8ED)]"
            }`}
          >
            <span className="text-sm leading-none">{emoji}</span>
            <span className="text-[11px] font-bold opacity-90">{count}</span>
          </button>
        );
      })}

      {/* Quick Add Reaction Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenPicker(e);
        }}
        title={lang === "ar" ? "إضافة تفاعل" : "Add reaction"}
        className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs transition-all duration-150 cursor-pointer border active:scale-95 ${
          isLight
            ? "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-500 hover:text-slate-700"
            : "bg-[var(--theme-bg-secondary,#262630)] hover:bg-[var(--theme-bg-tertiary,#323240)] border-[var(--theme-border,#3E3E50)] text-slate-400 hover:text-slate-200"
        }`}
      >
        <SmilePlus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

interface MessageReactionPickerProps {
  isOpen?: boolean;
  anchorRect: AnchorRect | null;
  onClose: () => void;
  onSelectEmoji: (emoji: string, keepOpen?: boolean) => void;
  lang: "en" | "ar";
  isLight?: boolean;
}

export const MessageReactionPicker: React.FC<MessageReactionPickerProps> = ({
  anchorRect,
  onClose,
  onSelectEmoji,
  lang,
  isLight = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  const filteredEmojis = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      return EMOJI_CATEGORIES[activeCategory]?.emojis || [];
    }
    return ALL_EMOJIS.filter((emoji) => {
      if (emoji.includes(q)) return true;
      const keywords = EMOJI_KEYWORDS[emoji];
      if (keywords && keywords.some((kw) => kw.includes(q))) {
        return true;
      }
      return false;
    });
  }, [searchQuery, activeCategory]);

  if (!anchorRect || typeof document === "undefined") return null;

  // Stable viewport positioning geometry
  const pickerWidth = 310;
  const pickerHeight = 350;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;

  // Vertical placement: default to placing below unless space is cramped and there is more room above
  const spaceBelow = vh - anchorRect.bottom;
  const spaceAbove = anchorRect.top;
  const placeAbove = spaceBelow < pickerHeight + margin && spaceAbove > spaceBelow;

  const topPos = placeAbove
    ? Math.max(margin, anchorRect.top - pickerHeight - 6)
    : Math.min(vh - pickerHeight - margin, anchorRect.bottom + 6);

  // Horizontal placement: smoothly align with trigger anchor without jumping across screen
  const anchorCenter = anchorRect.left + anchorRect.width / 2;
  let leftPos: number;
  if (anchorCenter > vw / 2) {
    // Anchor is on the right half of the screen -> align right edge of picker with right edge of anchor
    leftPos = anchorRect.right - pickerWidth;
  } else {
    // Anchor is on the left half of the screen -> align left edge of picker with left edge of anchor
    leftPos = anchorRect.left;
  }

  // Strictly clamp within viewport boundaries
  leftPos = Math.max(margin, Math.min(leftPos, vw - pickerWidth - margin));

  const handleEmojiClick = (emoji: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const keepOpen = e.shiftKey;
    onSelectEmoji(emoji, keepOpen);
    if (!keepOpen) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] select-none bg-transparent"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={containerRef}
        dir={lang === "ar" ? "rtl" : "ltr"}
        style={{
          top: `${topPos}px`,
          left: `${leftPos}px`,
          width: `${pickerWidth}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        className={`absolute rounded-2xl border shadow-2xl overflow-hidden p-2.5 flex flex-col gap-2 select-none animate-in fade-in zoom-in-95 duration-150 ${
          isLight
            ? "bg-white border-slate-200 text-slate-800 shadow-slate-300/70"
            : "bg-slate-950 border-slate-800 text-slate-100 shadow-black/90"
        }`}
      >
        {/* Quick Reaction Row */}
        <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-[var(--theme-border,#3E3E50)]">
          <span className="text-[11px] font-bold text-slate-400">
            {lang === "ar" ? "تفاعل سريع:" : "Quick:"}
          </span>
          <div className="flex items-center gap-1">
            {QUICK_REACTION_EMOJIS.slice(0, 6).map((emoji) => (
              <button
                key={`quick-bar-${emoji}`}
                type="button"
                onClick={(e) => handleEmojiClick(emoji, e)}
                title={lang === "ar" ? `${emoji} (Shift+انقر لإبقاء القائمة)` : `${emoji} (Shift+click to keep open)`}
                className="w-7 h-7 rounded-lg hover:bg-slate-500/20 active:scale-125 transition-all text-base flex items-center justify-center cursor-pointer border-0 bg-transparent"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute start-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === "ar" ? "بحث عن تفاعل..." : "Search emojis..."}
            className={`w-full ps-8 pe-7 py-1.5 text-xs rounded-xl border focus:outline-none transition-all ${
              isLight
                ? "bg-slate-100 border-slate-200 focus:border-slate-400 text-slate-800"
                : "bg-slate-900 border-slate-800 focus:border-slate-500 text-slate-100"
            }`}
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute end-2 text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer border-0 bg-transparent"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Category Tabs (when not searching) */}
        {!searchQuery && (
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-medium text-slate-400 scrollbar-none">
            {EMOJI_CATEGORIES.map((cat, idx) => (
              <button
                key={`cat-tab-${cat.nameEn}`}
                type="button"
                onClick={() => setActiveCategory(idx)}
                className={`px-2 py-1 rounded-lg whitespace-nowrap transition-all cursor-pointer border-0 ${
                  activeCategory === idx
                    ? isLight
                      ? "bg-slate-200 text-slate-900 font-bold"
                      : "bg-slate-800 text-slate-100 font-bold"
                    : isLight
                      ? "hover:bg-slate-100 hover:text-slate-700 bg-transparent"
                      : "hover:bg-slate-900 hover:text-slate-200 bg-transparent"
                }`}
              >
                {lang === "ar" ? cat.nameAr : cat.nameEn}
              </button>
            ))}
          </div>
        )}

        {/* Emoji Grid */}
        <div className="grid grid-cols-7 gap-1 max-h-44 overflow-y-auto p-1 scrollbar-thin">
          {filteredEmojis.map((emoji, i) => (
            <button
              key={`grid-emoji-${emoji}-${i}`}
              type="button"
              onClick={(e) => handleEmojiClick(emoji, e)}
              title={lang === "ar" ? `${emoji} (Shift+انقر لإبقاء القائمة)` : `${emoji} (Shift+click to keep open)`}
              className="w-8 h-8 rounded-lg hover:bg-slate-500/20 active:scale-125 transition-all text-lg flex items-center justify-center cursor-pointer border-0 bg-transparent"
            >
              {emoji}
            </button>
          ))}
          {filteredEmojis.length === 0 && (
            <div className="col-span-7 text-center py-4 text-xs text-slate-400">
              {lang === "ar" ? "لا توجد نتائج" : "No emojis found"}
            </div>
          )}
        </div>

        {/* Multi-add shift hint footer */}
        <div className="pt-1 border-t border-[var(--theme-border,#3E3E50)]/50 text-[10px] text-center text-slate-400 select-none">
          {lang === "ar" ? "اضغط Shift + النقر لإضافة عدة تفاعلات" : "Shift + Click to add multiple reactions"}
        </div>
      </div>
    </div>,
    document.body,
  );
};
