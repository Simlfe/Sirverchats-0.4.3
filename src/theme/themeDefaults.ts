import type { LayoutSettings } from './adminThemeService';

export interface FontOption {
  id: string;
  name: string;
  nameAr: string;
  category: 'Modern UI' | 'Arabic / Clean' | 'Display / Sci-Fi' | 'Serif / Elegant' | 'Monospace / Code' | 'Friendly / Rounded';
}

export const AVAILABLE_FONTS: FontOption[] = [
  // Modern & Geometric
  { id: 'Plus Jakarta Sans, Cairo, Tajawal, sans-serif', name: 'Plus Jakarta Sans (Default Modern)', nameAr: 'بلس جاكارتا + القاهرة (الافتراضي الحديث)', category: 'Modern UI' },
  { id: 'Inter, Cairo, Tajawal, sans-serif', name: 'Inter (Clean & Crisp)', nameAr: 'إنتر + القاهرة (دقيق وواضح)', category: 'Modern UI' },
  { id: 'DM Sans, Cairo, sans-serif', name: 'DM Sans (High Legibility)', nameAr: 'دي إم سانس + القاهرة (عالي الوضوح)', category: 'Modern UI' },
  { id: 'Outfit, Cairo, sans-serif', name: 'Outfit (Fashion & Modern Tech)', nameAr: 'آوت فيت + القاهرة (عصري وتقني)', category: 'Modern UI' },
  { id: 'Lexend, Cairo, sans-serif', name: 'Lexend (Maximum Reading Ease)', nameAr: 'ليكسيند + القاهرة (مريح جداً للقراءة)', category: 'Modern UI' },
  { id: 'Urbanist, Cairo, sans-serif', name: 'Urbanist (Ultra-Clean Geometric)', nameAr: 'أوربانيست + القاهرة (هندسي فائق النقاء)', category: 'Modern UI' },

  // Arabic-First / Arabic Display
  { id: 'Alexandria, Cairo, Tajawal, sans-serif', name: 'Alexandria (Bold Modern Arabic)', nameAr: 'الإسكندرية (عربي حديث وجريء)', category: 'Arabic / Clean' },
  { id: 'Cairo, Tajawal, sans-serif', name: 'Cairo (Classic Clear Arabic)', nameAr: 'القاهرة (عربي كلاسيكي وواضح)', category: 'Arabic / Clean' },
  { id: 'Tajawal, Cairo, sans-serif', name: 'Tajawal (Smooth Arabic Curves)', nameAr: 'تجوال (عربي منحنيات ناعمة)', category: 'Arabic / Clean' },
  { id: 'Almarai, Cairo, sans-serif', name: 'Almarai (Corporate & Clean Arabic)', nameAr: 'المراعي (عربي رسمي ونظيف)', category: 'Arabic / Clean' },
  { id: 'Readex Pro, Cairo, sans-serif', name: 'Readex Pro (Modern Compact Arabic)', nameAr: 'ريدكس برو (عربي مدمج حديث)', category: 'Arabic / Clean' },
  { id: '"El Messiri", Cairo, serif', name: 'El Messiri (Artistic Elegant Arabic)', nameAr: 'المسيري (عربي فني أنيق وسيريف)', category: 'Arabic / Clean' },

  // Display, Sci-Fi, Anime & Gaming
  { id: 'Orbitron, Readex Pro, Cairo, sans-serif', name: 'Orbitron (Futuristic Sci-Fi)', nameAr: 'أوربيترون + ريدكس (مستقبلي وساي فاي)', category: 'Display / Sci-Fi' },
  { id: 'Space Grotesk, Alexandria, Cairo, sans-serif', name: 'Space Grotesk (Cyber Tech)', nameAr: 'سبيس جروتسك + الإسكندرية (سايبر تك)', category: 'Display / Sci-Fi' },
  { id: 'Syne, Alexandria, Cairo, sans-serif', name: 'Syne (Artistic Bold Display)', nameAr: 'ساين + الإسكندرية (فني عريض وجريء)', category: 'Display / Sci-Fi' },
  { id: 'Sora, Tajawal, Cairo, sans-serif', name: 'Sora (Japanese Tech / Anime)', nameAr: 'سورا + تجوال (تقني أنيمي حديث)', category: 'Display / Sci-Fi' },
  { id: 'Poppins, Tajawal, Cairo, sans-serif', name: 'Poppins (Soft Geometric)', nameAr: 'بوبنز + تجوال (هندسي ناعم)', category: 'Friendly / Rounded' },
  { id: 'Nunito, Cairo, Tajawal, sans-serif', name: 'Nunito (Anime & Manga Friendly)', nameAr: 'نونيتو + القاهرة (أنيمي ومانجا انسيابي)', category: 'Friendly / Rounded' },
  { id: 'Rubik, Cairo, sans-serif', name: 'Rubik (Friendly Soft Corners)', nameAr: 'روبيك + القاهرة (حواف ناعمة)', category: 'Friendly / Rounded' },
  { id: 'Cinzel, "El Messiri", Cairo, serif', name: 'Cinzel (Baroque Luxury Serif / Fantasy)', nameAr: 'سينزل + المسيري (سيريف فخم أسطوري)', category: 'Serif / Elegant' },
  { id: '"Cinzel Decorative", "El Messiri", Cairo, serif', name: 'Cinzel Decorative (Gothic Dark Fantasy)', nameAr: 'سينزل ديكوراتيف (قوطي خيالي مظلم)', category: 'Serif / Elegant' },
  { id: 'JetBrains Mono, Alexandria, Cairo, monospace', name: 'JetBrains Mono (Developer Code / Minecraft)', nameAr: 'جيت برينز مونو + الإسكندرية (ماين كرافت / برمجي)', category: 'Monospace / Code' },
  { id: 'Fira Code, "JetBrains Mono", Cairo, monospace', name: 'Fira Code (Hacker Monospace)', nameAr: 'فيرا كود (أكواد وهاكر)', category: 'Monospace / Code' },
  { id: 'system-ui, -apple-system, Cairo, sans-serif', name: 'System Default UI', nameAr: 'خط النظام الافتراضي + القاهرة', category: 'Modern UI' },
];

export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  profileCards: {
    width: 380,
    height: 520,
    cornerRadius: 24,
    avatarSize: 72,
    scale: 100,
  },
  chat: {
    messageSpacing: 6,
    bubbleRadius: 16,
    bubblePadding: 12,
    timestampFormat: '12h',
  },
  sidebar: {
    width: 240,
    iconSize: 18,
    spacing: 6,
  },
  channels: {
    rowHeight: 36,
    fontSize: 12,
    iconSpacing: 8,
  },
  serverList: {
    iconSize: 48,
    spacing: 8,
    hoverAnimation: 'scale',
  },
  titleBar: {
    height: 48,
    buttonSpacing: 8,
    cornerRadius: 12,
  },
  animations: {
    preset: 'fade',
    duration: 250,
    easing: 'ease-in-out',
    enabled: true,
  },
  typography: {
    fontFamily: 'Plus Jakarta Sans, Cairo, Tajawal, sans-serif',
    fontHeadings: 'Plus Jakarta Sans, Cairo, Tajawal, sans-serif',
    fontChat: 'Plus Jakarta Sans, Cairo, Tajawal, sans-serif',
    baseFontSize: 13,
    lineHeight: 1.5,
    fontWeightNormal: 500,
    fontWeightBold: 800,
  },
};

export function createThemeLayout(fontHeadings?: string, customBodyFont?: string, customChatFont?: string): LayoutSettings {
  const ensureArabicFallback = (stack: string) => {
    if (!stack) return 'Plus Jakarta Sans, Cairo, Tajawal, sans-serif';
    if (stack.includes('Cairo') || stack.includes('Tajawal') || stack.includes('Almarai') || stack.includes('Alexandria') || stack.includes('Readex Pro') || stack.includes('El Messiri')) {
      return stack;
    }
    if (stack.includes('serif') && !stack.includes('sans-serif')) {
      return `${stack.replace(/,\s*serif/g, '')}, "El Messiri", Cairo, serif`;
    }
    if (stack.includes('monospace')) {
      return `${stack.replace(/,\s*monospace/g, '')}, Cairo, monospace`;
    }
    return `${stack.replace(/,\s*sans-serif/g, '')}, Cairo, Tajawal, sans-serif`;
  };

  // Base body font always uses a compact, highly readable UI font so text is never stretched wide
  const finalFamily = ensureArabicFallback(customBodyFont || 'Plus Jakarta Sans, Cairo, Tajawal, sans-serif');
  const finalHeadings = ensureArabicFallback(fontHeadings || finalFamily);
  const finalChat = ensureArabicFallback(customChatFont || finalFamily);

  return {
    ...DEFAULT_LAYOUT_SETTINGS,
    typography: {
      ...DEFAULT_LAYOUT_SETTINGS.typography,
      fontFamily: finalFamily,
      fontHeadings: finalHeadings,
      fontChat: finalChat,
      baseFontSize: 13,
    },
  };
}
