/**
 * Client-side image optimization pipeline.
 * Resizes static images (PNG, JPEG, WebP) to target max bounds, converts to WebP with canvas,
 * preserves transparency and visual quality while significantly reducing bandwidth/memory usage.
 * Animated GIFs preserve their animation format.
 */

import { optimizeGif } from './gifOptimizer';

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export async function optimizeImage(
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<File> {
  const { maxWidth = 512, maxHeight = 512, quality = 0.85 } = options;

  // Optimize animated GIFs while preserving animation format & quality
  if (file.type === 'image/gif') {
    const targetMax = Math.max(maxWidth, maxHeight, 960);
    return optimizeGif(file, { maxEdge: targetMax, lossy: 25 });
  }

  // Only process images
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect ratio fit within maxWidth x maxHeight
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP format
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const optimizedFileName = file.name.replace(/\.[^/.]+$/, '') + '.webp';
            const optimizedFile = new File([blob], optimizedFileName, {
              type: 'image/webp',
              lastModified: Date.now(),
            });
            resolve(optimizedFile);
          },
          'image/webp',
          quality
        );
      };

      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };

    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}
