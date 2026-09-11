// Only load optional display fonts when a user actually selects them. The
// default UI fonts are linked from index.html so they do not block CSS parsing.
const CORE_FONTS = new Set([
  'Plus Jakarta Sans',
  'Cairo',
  'Tajawal',
  'JetBrains Mono',
]);

const OPTIONAL_FONTS = new Set([
  'Alexandria',
  'Almarai',
  'Cinzel Decorative',
  'Cinzel',
  'DM Sans',
  'El Messiri',
  'Fira Code',
  'Inter',
  'Lexend',
  'Nunito',
  'Orbitron',
  'Outfit',
  'Poppins',
  'Readex Pro',
  'Rubik',
  'Sora',
  'Space Grotesk',
  'Syne',
  'Urbanist',
]);

const loadedFontKeys = new Set<string>();

function extractFontFamilies(stacks: Array<string | null | undefined>): string[] {
  const result = new Set<string>();
  for (const stack of stacks) {
    if (!stack) continue;
    for (const rawFamily of stack.split(',')) {
      const family = rawFamily.trim().replace(/^['"]|['"]$/g, '');
      if (OPTIONAL_FONTS.has(family) && !CORE_FONTS.has(family)) {
        result.add(family);
      }
    }
  }
  return Array.from(result).sort();
}

/** Load selected non-core Google fonts once, without blocking first paint. */
export function ensureGoogleFontsLoaded(
  ...stacks: Array<string | null | undefined>
): void {
  if (typeof document === 'undefined') return;
  const families = extractFontFamilies(stacks);
  if (families.length === 0) return;

  const key = families.join('|');
  if (loadedFontKeys.has(key)) return;
  loadedFontKeys.add(key);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.media = 'print';
  link.dataset.sirverOptionalFonts = key;
  link.href = `https://fonts.googleapis.com/css2?${families
    .map((family) => `family=${encodeURIComponent(family)}:wght@400;500;600;700;800`)
    .join('&')}&display=swap`;
  link.onload = () => {
    link.media = 'all';
  };
  document.head.appendChild(link);
}
