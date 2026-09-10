import gifsicle from 'gifsicle-wasm-browser';

export interface GifOptimizationOptions {
  /** Maximum edge length in pixels (e.g. 960). GIFs larger than this are downscaled proportionally. */
  maxEdge?: number;
  /** Gifsicle lossy optimization parameter (e.g., 20-30 for subtle compression with imperceptible loss). */
  lossy?: number;
  /** Gifsicle optimization level (1-3, default 3 for maximum frame delta & LZW optimization). */
  optimizationLevel?: number;
}

/**
 * Optimizes animated GIFs using WebAssembly-powered Gifsicle.
 * Preserves animation timing, color palette, gradients, text readability, and transparency
 * while performing frame delta optimization, duplicate frame removal, LZW compression,
 * metadata stripping, and proportional downscaling if maxEdge is exceeded.
 */
export async function optimizeGif(
  file: File,
  options: GifOptimizationOptions = {},
  onProgress?: (pct: number, statusMessage: string) => void
): Promise<File> {
  const { maxEdge = 960, lossy = 20, optimizationLevel = 2 } = options;

  // Only process GIF files
  if (file.type !== 'image/gif' && !file.name.toLowerCase().endsWith('.gif')) {
    return file;
  }

  // Fast path for small GIFs under 5MB to avoid unnecessary WASM processing delay
  if (file.size <= 5 * 1024 * 1024) {
    onProgress?.(100, 'Original GIF preserved (fast-path)');
    return file;
  }

  onProgress?.(15, 'Analyzing GIF frames...');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const inputName = 'input.gif';
    const outputName = 'output.gif';

    // Build gifsicle arguments:
    // -O2: Fast frame delta & transparency optimization (drastically faster than -O3)
    // --lossy=20: Lightweight lossy noise reduction
    const command = [
      `-O${optimizationLevel}`,
      `--lossy=${lossy}`,
      '--resize-fit',
      `${maxEdge}x${maxEdge}`,
      '--no-comments',
      '--no-names',
      inputName,
      '-o',
      `/out/${outputName}`
    ].join(' ');

    onProgress?.(45, 'Optimizing GIF palette...');

    // 3.5 second hard timeout for WebAssembly execution
    const runPromise = gifsicle.run({
      input: [{ file: arrayBuffer, name: inputName }],
      command
    });

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 3500);
    });

    const resultFiles = await Promise.race([runPromise, timeoutPromise]);

    onProgress?.(85, 'Finalizing GIF...');

    if (resultFiles && resultFiles.length > 0) {
      const outputFile = resultFiles.find((f: File) => f.name.includes('output') || f.name.endsWith('.gif')) || resultFiles[0];
      if (outputFile && outputFile.size > 0 && outputFile.size < file.size) {
        const optimizedFile = new File([outputFile], file.name, {
          type: 'image/gif',
          lastModified: Date.now()
        });
        onProgress?.(100, `Optimized GIF (${formatBytes(file.size)} → ${formatBytes(outputFile.size)})`);
        return optimizedFile;
      }
    }
  } catch (err) {
    console.warn('[GifOptimizer] Failed to optimize GIF with gifsicle, preserving original:', err);
  }

  onProgress?.(100, 'Original GIF preserved');
  return file;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
