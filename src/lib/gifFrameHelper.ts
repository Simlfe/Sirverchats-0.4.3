import { loadUserSettings } from './userSettings';

export type GifPlaybackMode = 'always' | 'hover' | 'never';

const frameCache = new Map<string, string>();
const pendingDecodes = new Map<string, Promise<string | null>>();

export function getEffectiveGifPlaybackMode(overrideMode?: GifPlaybackMode): GifPlaybackMode {
  if (overrideMode) return overrideMode;
  try {
    const settings = loadUserSettings();
    return settings?.appearance?.gifPlayback || 'always';
  } catch (e) {
    return 'always';
  }
}

export function isGifUrl(url?: string | null): boolean {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  return (
    cleanUrl.endsWith('.gif') ||
    url.includes('data:image/gif') ||
    url.includes('.gif?') ||
    url.includes('format=gif') ||
    url.includes('giphy.com') ||
    url.includes('tenor.com')
  );
}

/**
 * Extracts and returns a static PNG/DataURL or canvas drawing of the first frame of a GIF.
 */
export async function getGifFirstFrame(src: string): Promise<string | null> {
  if (!src) return null;
  if (frameCache.has(src)) {
    return frameCache.get(src)!;
  }
  if (pendingDecodes.has(src)) {
    return pendingDecodes.get(src)!;
  }

  const decodePromise = (async () => {
    try {
      // Strategy 1: ImageDecoder (Fast & accurate frame 0 extraction)
      if (typeof window !== 'undefined' && 'ImageDecoder' in window) {
        try {
          const res = await fetch(src, { referrerPolicy: 'no-referrer', credentials: 'omit' });
          if (res.ok) {
            const blob = await res.blob();
            const decoder = new (window as any).ImageDecoder({ data: blob.stream(), type: 'image/gif' });
            await decoder.tracks.ready;
            const frameResult = await decoder.decode({ frameIndex: 0 });
            if (frameResult?.image) {
              const canvas = document.createElement('canvas');
              canvas.width = frameResult.image.displayWidth || frameResult.image.codedWidth || 200;
              canvas.height = frameResult.image.displayHeight || frameResult.image.codedHeight || 200;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(frameResult.image, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/png');
                frameResult.image.close?.();
                decoder.close?.();
                frameCache.set(src, dataUrl);
                return dataUrl;
              }
              frameResult.image.close?.();
              decoder.close?.();
            }
          }
        } catch (e) {
          // Fall through to Strategy 2
        }
      }

      // Strategy 2: Image DOM Element Draw
      return new Promise<string | null>((resolve) => {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 100;
            canvas.height = img.naturalHeight || 100;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              const dataUrl = canvas.toDataURL('image/png');
              frameCache.set(src, dataUrl);
              resolve(dataUrl);
              return;
            }
          } catch (e) {
            // Tainted canvas error: resolve null so inline canvas or fallback can be used
          }
          resolve(null);
        };

        img.onerror = () => {
          // Try without crossOrigin in case CORS header blocked it
          const retryImg = new Image();
          retryImg.referrerPolicy = 'no-referrer';
          retryImg.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = retryImg.naturalWidth || 100;
              canvas.height = retryImg.naturalHeight || 100;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(retryImg, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                frameCache.set(src, dataUrl);
                resolve(dataUrl);
                return;
              }
            } catch (e) {}
            resolve(null);
          };
          retryImg.onerror = () => resolve(null);
          retryImg.src = src;
        };

        img.src = src;
      });
    } catch (e) {
      return null;
    } finally {
      pendingDecodes.delete(src);
    }
  })();

  pendingDecodes.set(src, decodePromise);
  return decodePromise;
}
