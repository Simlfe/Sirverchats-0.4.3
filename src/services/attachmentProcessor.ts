import { AttachmentCompressionSettings, DEFAULT_ATTACHMENT_SETTINGS, getCachedUserSettings } from '../lib/userSettings';
import { Attachment } from '../types';
import { extractAudioMetadata } from '../lib/audioMetadata';
import { optimizeGif } from '../lib/gifOptimizer';

export interface ProcessedAttachmentItem {
  id: string;
  file: File; // Currently selected File (either compressed or original based on user choice)
  originalFile: File; // Raw, untouched original File
  compressedFile?: File; // Generated compressed File
  isCompressed: boolean;
  originalSize: number; // Bytes
  compressedSize?: number; // Bytes
  thumbnailUrl?: string; // Data URL for instant preview
  mediaType: 'image' | 'video' | 'audio' | 'document';
  status: 'pending' | 'compressing' | 'done' | 'skipped' | 'error';
  progress: number; // 0 - 100
  statusMessage?: string;
  userChoice: 'compress' | 'original';
  width?: number;
  height?: number;
  duration?: number;
  uploadedAttachment?: Attachment;
  previewUrl?: string;
  uploadStatus?: 'queued' | 'uploading' | 'completed' | 'failed' | 'cancelled';
  uploadProgress?: number;
  uploadError?: string;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  displayName?: string;
  originalFilename?: string;
}

export function generateAttachmentId(): string {
  return 'att_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
}

export const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.heic', '.avif'];
export const VIDEO_EXTS = ['.mp4', '.webm', '.ogg', '.mov', '.m4v', '.mkv', '.avi', '.wmv', '.flv'];
export const AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.wma'];
export const UNRENDERABLE_IMAGE_EXTS = ['.exr', '.hdr', '.psd', '.psb', '.tga', '.dds', '.cr2', '.nef', '.arw', '.dng', '.raf', '.orf', '.eps', '.ai', '.tiff', '.tif'];

export function inferMimeType(filename: string, existingType?: string): string {
  if (existingType && existingType !== 'application/octet-stream' && existingType !== 'binary/octet-stream') {
    return existingType;
  }
  const lower = (filename || '').toLowerCase();
  if (IMAGE_EXTS.some((ext) => lower.endsWith(ext))) {
    const ext = lower.split('.').pop();
    if (ext === 'svg') return 'image/svg+xml';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    return `image/${ext || 'png'}`;
  }
  if (VIDEO_EXTS.some((ext) => lower.endsWith(ext))) {
    const ext = lower.split('.').pop();
    if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
    if (ext === 'webm') return 'video/webm';
    if (ext === 'mov') return 'video/quicktime';
    return `video/${ext || 'mp4'}`;
  }
  if (AUDIO_EXTS.some((ext) => lower.endsWith(ext))) {
    const ext = lower.split('.').pop();
    if (ext === 'mp3') return 'audio/mpeg';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'ogg' || ext === 'opus') return 'audio/ogg';
    if (ext === 'm4a' || ext === 'aac') return 'audio/mp4';
    return `audio/${ext || 'mpeg'}`;
  }
  if (UNRENDERABLE_IMAGE_EXTS.some((ext) => lower.endsWith(ext))) {
    return 'image/x-unrenderable';
  }
  return existingType || 'application/octet-stream';
}

export function isAttachmentUnrenderable(filename?: string, mimeType?: string, isFailed?: boolean): boolean {
  if (isFailed) return true;
  const fn = filename || '';
  const mime = inferMimeType(fn, mimeType);
  if (mime === 'image/x-unrenderable') return true;
  const lower = fn.toLowerCase();
  return UNRENDERABLE_IMAGE_EXTS.some((ext) => lower.endsWith(ext));
}

export function isAttachmentImage(filename?: string, mimeType?: string, isFailed?: boolean): boolean {
  if (isAttachmentUnrenderable(filename, mimeType, isFailed)) return false;
  const fn = filename || '';
  const mime = inferMimeType(fn, mimeType);
  if (mime.startsWith('image/')) return true;
  const lower = fn.toLowerCase();
  return IMAGE_EXTS.some((ext) => lower.endsWith(ext));
}

export function isAttachmentVideo(filename?: string, mimeType?: string): boolean {
  const fn = filename || '';
  const mime = inferMimeType(fn, mimeType);
  if (mime.startsWith('video/')) return true;
  const lower = fn.toLowerCase();
  return VIDEO_EXTS.some((ext) => lower.endsWith(ext));
}

export function isAttachmentAudio(filename?: string, mimeType?: string): boolean {
  const fn = filename || '';
  const mime = inferMimeType(fn, mimeType);
  if (mime.startsWith('audio/')) return true;
  const lower = fn.toLowerCase();
  return AUDIO_EXTS.some((ext) => lower.endsWith(ext));
}

export function detectMediaType(file: File): 'image' | 'video' | 'audio' | 'document' {
  if (isAttachmentImage(file.name, file.type)) return 'image';
  if (isAttachmentVideo(file.name, file.type)) return 'video';
  if (isAttachmentAudio(file.name, file.type)) return 'audio';
  return 'document';
}

function replaceExtension(filename: string, newExt: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    parts.pop();
  }
  const cleanExt = newExt.startsWith('.') ? newExt : `.${newExt}`;
  return `${parts.join('.')}${cleanExt}`;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

class AttachmentProcessorService {
  private activeTasks = new Map<string, { aborted: boolean }>();

  /**
   * Cancel processing task by attachment ID.
   */
  cancelProcessing(id: string): void {
    const task = this.activeTasks.get(id);
    if (task) {
      task.aborted = true;
    }
  }

  /**
   * Process a list of files through client-side compression pipeline.
   */
  async processFiles(
    files: File[],
    customSettings?: Partial<AttachmentCompressionSettings>,
    onItemUpdate?: (item: ProcessedAttachmentItem) => void
  ): Promise<ProcessedAttachmentItem[]> {
    const settings = this.getSettings(customSettings);
    const results: ProcessedAttachmentItem[] = [];

    for (const file of files) {
      const item = await this.processSingleFile(file, settings, onItemUpdate);
      results.push(item);
    }

    return results;
  }

  /**
   * Process a single file with live progress callbacks.
   */
  async processSingleFile(
    file: File,
    customSettings?: Partial<AttachmentCompressionSettings>,
    onItemUpdate?: (item: ProcessedAttachmentItem) => void,
    optionalId?: string
  ): Promise<ProcessedAttachmentItem> {
    const settings = this.getSettings(customSettings);
    const mediaType = detectMediaType(file);
    const id = optionalId || generateAttachmentId();
    const taskRef = { aborted: false };
    this.activeTasks.set(id, taskRef);

    const initialItem: ProcessedAttachmentItem = {
      id,
      file,
      originalFile: file,
      isCompressed: false,
      originalSize: file.size,
      compressedSize: file.size,
      mediaType,
      status: 'pending',
      progress: 0,
      statusMessage: 'Ready',
      userChoice: 'compress'
    };

    const updateItem = (updates: Partial<ProcessedAttachmentItem>): ProcessedAttachmentItem => {
      Object.assign(initialItem, updates);
      if (onItemUpdate) {
        onItemUpdate({ ...initialItem });
      }
      return initialItem;
    };

    updateItem({ status: 'compressing', progress: 5, statusMessage: 'Analyzing file...' });

    // Documents are NEVER compressed
    if (mediaType === 'document') {
      this.activeTasks.delete(id);
      return updateItem({
        status: 'done',
        progress: 100,
        isCompressed: false,
        compressedSize: file.size,
        statusMessage: 'Document preserved (no compression)'
      });
    }

    // Global compression disabled check
    if (!settings.enableCompression) {
      // Generate thumbnail preview if available
      let thumb: string | undefined;
      if (mediaType === 'image') {
        thumb = await this.generateImageThumbnail(file).catch(() => undefined);
      } else if (mediaType === 'video') {
        thumb = await this.generateVideoThumbnail(file).catch(() => undefined);
      }
      this.activeTasks.delete(id);
      return updateItem({
        status: 'done',
        progress: 100,
        isCompressed: false,
        compressedSize: file.size,
        thumbnailUrl: thumb,
        statusMessage: 'Compression disabled in settings'
      });
    }

    try {
      if (mediaType === 'image') {
        return await this.processImage(file, settings, updateItem);
      } else if (mediaType === 'video') {
        return await this.processVideo(file, settings, updateItem, id, taskRef);
      } else if (mediaType === 'audio') {
        return await this.processAudio(file, settings, updateItem);
      }
    } catch (err: any) {
      console.warn(`[AttachmentProcessor] Failed to process ${file.name}, using original:`, err);
      return updateItem({
        status: 'done',
        progress: 100,
        isCompressed: false,
        compressedSize: file.size,
        statusMessage: 'Original retained'
      });
    } finally {
      this.activeTasks.delete(id);
    }

    return updateItem({
      status: 'done',
      progress: 100,
      isCompressed: false,
      compressedSize: file.size,
      statusMessage: 'Completed'
    });
  }

  /**
   * Toggle between compressed and original file for a processed item.
   */
  toggleUserChoice(item: ProcessedAttachmentItem, choice: 'compress' | 'original'): ProcessedAttachmentItem {
    const newChoice = choice;
    const isComp = newChoice === 'compress' && !!item.compressedFile && item.compressedSize! < item.originalSize;
    const activeFile = isComp && item.compressedFile ? item.compressedFile : item.originalFile;

    return {
      ...item,
      userChoice: newChoice,
      isCompressed: isComp,
      file: activeFile
    };
  }

  /**
   * Process and compress image file.
   */
  private async processImage(
    file: File,
    settings: AttachmentCompressionSettings,
    updateItem: (updates: Partial<ProcessedAttachmentItem>) => ProcessedAttachmentItem
  ): Promise<ProcessedAttachmentItem> {
    updateItem({ progress: 15, statusMessage: 'Generating image thumbnail...' });

    // Generate thumbnail
    const thumbnail = await this.generateImageThumbnail(file).catch(() => undefined);
    updateItem({ thumbnailUrl: thumbnail, progress: 30, statusMessage: 'Compressing image...' });

    // SVG check
    if (file.type === 'image/svg+xml') {
      return updateItem({
        status: 'done',
        progress: 100,
        isCompressed: false,
        compressedSize: file.size,
        statusMessage: 'Vector preserved'
      });
    }

    // Animated GIF optimization
    if (file.type === 'image/gif') {
      if (!settings.images.enabled) {
        return updateItem({
          status: 'done',
          progress: 100,
          isCompressed: false,
          compressedSize: file.size,
          statusMessage: 'GIF compression disabled'
        });
      }

      updateItem({ progress: 20, statusMessage: 'Optimizing animated GIF...' });
      const thumbnail = await this.generateImageThumbnail(file).catch(() => undefined);
      updateItem({ thumbnailUrl: thumbnail, progress: 35, statusMessage: 'Compressing GIF frames...' });

      const maxRes = settings.images.maxResolution || 960;
      const optimizedFile = await optimizeGif(
        file,
        {
          maxEdge: Math.min(maxRes, 960),
          lossy: 20,
          optimizationLevel: 2
        },
        (pct, msg) => {
          updateItem({ progress: 35 + Math.round(pct * 0.6), statusMessage: msg });
        }
      );

      const isComp = optimizedFile.size < file.size;

      return updateItem({
        status: 'done',
        progress: 100,
        isCompressed: isComp,
        file: isComp ? optimizedFile : file,
        compressedFile: isComp ? optimizedFile : undefined,
        compressedSize: optimizedFile.size,
        statusMessage: isComp
          ? `Optimized GIF (${formatFileSize(file.size)} → ${formatFileSize(optimizedFile.size)})`
          : 'Original GIF preserved'
      });
    }

    if (!settings.images.enabled) {
      return updateItem({
        status: 'done',
        progress: 100,
        isCompressed: false,
        compressedSize: file.size,
        statusMessage: 'Image compression disabled'
      });
    }

    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        const origWidth = img.naturalWidth || img.width;
        const origHeight = img.naturalHeight || img.height;

        updateItem({
          width: origWidth,
          height: origHeight,
          progress: 50,
          statusMessage: 'Resizing & optimizing image...'
        });

        const maxRes = settings.images.maxResolution || 2048;
        let targetWidth = origWidth;
        let targetHeight = origHeight;

        if (Math.max(origWidth, origHeight) > maxRes) {
          if (origWidth > origHeight) {
            targetWidth = maxRes;
            targetHeight = Math.round((origHeight * maxRes) / origWidth);
          } else {
            targetHeight = maxRes;
            targetWidth = Math.round((origWidth * maxRes) / origHeight);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(updateItem({
            status: 'done',
            progress: 100,
            isCompressed: false,
            compressedSize: file.size,
            statusMessage: 'Original kept'
          }));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        updateItem({ progress: 85, statusMessage: 'Converting to WebP format...' });

        let mimeType = settings.images.convertToWebP ? 'image/webp' : (file.type || 'image/jpeg');
        let quality = settings.images.quality || 0.82;

        const attemptBlobExport = (type: string, q: number): Promise<Blob | null> => {
          return new Promise((res) => {
            canvas.toBlob((blob) => res(blob), type, q);
          });
        };

        let blob = await attemptBlobExport(mimeType, quality);

        // Fallback to jpeg if webp export is unsupported
        if (!blob && mimeType === 'image/webp') {
          mimeType = 'image/jpeg';
          blob = await attemptBlobExport(mimeType, quality);
        }

        if (blob && (blob.size < file.size || targetWidth < origWidth || targetHeight < origHeight)) {
          const ext = mimeType === 'image/webp' ? '.webp' : '.jpg';
          const newName = replaceExtension(file.name, ext);
          const compressedFile = new File([blob], newName, { type: mimeType, lastModified: Date.now() });

          resolve(updateItem({
            status: 'done',
            progress: 100,
            isCompressed: true,
            file: compressedFile,
            compressedFile,
            compressedSize: blob.size,
            statusMessage: `Compressed (${formatFileSize(file.size)} → ${formatFileSize(blob.size)})`
          }));
        } else {
          // If compression resulted in larger file and no downscaling occurred, keep original
          resolve(updateItem({
            status: 'done',
            progress: 100,
            isCompressed: false,
            compressedSize: file.size,
            statusMessage: 'Original is already optimal'
          }));
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(updateItem({
          status: 'done',
          progress: 100,
          isCompressed: false,
          compressedSize: file.size,
          statusMessage: 'Original preserved'
        }));
      };

      img.src = objectUrl;
    });
  }

  /**
   * Reads video resolution, duration, and estimated bitrate without loading entire file into memory.
   */
  private async readVideoMetadata(file: File): Promise<{
    width: number;
    height: number;
    duration: number;
    estimatedBitrateBps: number;
  }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';

      const objectUrl = URL.createObjectURL(file);

      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        video.removeAttribute('src');
        video.load();
      };

      video.onloadedmetadata = () => {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;
        const duration = video.duration || 1;
        const estimatedBitrateBps = Math.round((file.size * 8) / duration);
        cleanup();
        resolve({ width, height, duration, estimatedBitrateBps });
      };

      video.onerror = () => {
        cleanup();
        reject(new Error('Failed to load video metadata'));
      };

      setTimeout(() => {
        cleanup();
        reject(new Error('Timeout reading video metadata'));
      }, 3500);

      video.src = objectUrl;
    });
  }

  /**
   * Ultra-fast video downscaling and compression using canvas rendering and hardware-accelerated MediaRecorder.
   */
  private async encodeVideoFast(params: {
    file: File;
    origW: number;
    origH: number;
    targetW: number;
    targetH: number;
    duration: number;
    targetFps: number;
    targetBitrateBps: number;
    preset: 'fastest' | 'balanced' | 'quality' | 'fast' | 'high';
    taskId: string;
    taskRef: { aborted: boolean };
    onProgress: (pct: number, msg: string) => void;
  }): Promise<File | null> {
    const {
      file,
      origW,
      origH,
      targetW,
      targetH,
      duration,
      targetFps,
      targetBitrateBps,
      preset,
      taskRef,
      onProgress,
    } = params;

    return new Promise((resolve, reject) => {
      if (taskRef.aborted) {
        reject(new Error('Processing cancelled by user'));
        return;
      }

      // 1. Detect best supported video container & codec for platform compatibility
      let chosenMime = 'video/mp4;codecs=avc1,mp4a.40.2';
      if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(chosenMime)) {
        chosenMime = 'video/mp4;codecs=avc1';
      }
      if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(chosenMime)) {
        chosenMime = 'video/mp4';
      }
      if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(chosenMime)) {
        chosenMime = 'video/webm;codecs=vp8,opus';
      }
      if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(chosenMime)) {
        chosenMime = 'video/webm;codecs=vp9,opus';
      }
      if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(chosenMime)) {
        chosenMime = 'video/webm';
      }

      if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(chosenMime)) {
        reject(new Error('No supported video recorder MIME type found in browser'));
        return;
      }

      // 2. Setup offscreen canvas and video element
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = preset === 'quality' || preset === 'high' ? 'high' : 'medium';

      const video = document.createElement('video');
      video.muted = false;
      video.volume = 0; // Silenced on speakers, but preserves audio track for captureStream
      video.playsInline = true;
      video.crossOrigin = 'anonymous';

      const objectUrl = URL.createObjectURL(file);

      // Playback speed MUST ALWAYS be exactly 1.0 to preserve natural timing, PTS/DTS, and duration
      const playbackRate = 1.0;

      let recorder: MediaRecorder | null = null;
      let animationFrameId: number | null = null;
      let videoFrameCallbackId: number | null = null;
      let isStopped = false;

      const cleanup = () => {
        isStopped = true;
        if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
        if (videoFrameCallbackId !== null && 'cancelVideoFrameCallback' in video) {
          (video as any).cancelVideoFrameCallback(videoFrameCallbackId);
        }
        URL.revokeObjectURL(objectUrl);
        video.pause();
        video.removeAttribute('src');
        video.load();
      };

      video.onloadeddata = () => {
        if (taskRef.aborted || isStopped) {
          cleanup();
          reject(new Error('Processing cancelled'));
          return;
        }

        // Try capturing audio track from source video
        let audioTrack: MediaStreamTrack | null = null;
        try {
          if ((video as any).captureStream) {
            const stream = (video as any).captureStream();
            const tracks = stream.getAudioTracks();
            if (tracks && tracks.length > 0) audioTrack = tracks[0];
          } else if ((video as any).mozCaptureStream) {
            const stream = (video as any).mozCaptureStream();
            const tracks = stream.getAudioTracks();
            if (tracks && tracks.length > 0) audioTrack = tracks[0];
          }
        } catch (e) {
          // Audio capture fallback
        }

        const canvasStream = canvas.captureStream(targetFps);
        const tracksToCombine = [...canvasStream.getVideoTracks()];
        if (audioTrack) {
          tracksToCombine.push(audioTrack);
        }

        const recordStream = new MediaStream(tracksToCombine);

        try {
          recorder = new MediaRecorder(recordStream, {
            mimeType: chosenMime,
            videoBitsPerSecond: targetBitrateBps,
            audioBitsPerSecond: 96_000
          });
        } catch (e) {
          cleanup();
          reject(e);
          return;
        }

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          cleanup();
          if (taskRef.aborted) {
            reject(new Error('Processing cancelled'));
            return;
          }

          const compressedBlob = new Blob(chunks, { type: chosenMime });
          if (compressedBlob.size > 0 && (compressedBlob.size < file.size || targetW < origW || targetH < origH)) {
            const ext = chosenMime.includes('mp4') ? '.mp4' : '.webm';
            const newName = replaceExtension(file.name, ext);
            const compressedFile = new File([compressedBlob], newName, { type: chosenMime, lastModified: Date.now() });
            resolve(compressedFile);
          } else {
            resolve(null); // Preserve original
          }
        };

        recorder.start(100);

        try {
          video.playbackRate = playbackRate;
        } catch (e) {
          video.playbackRate = 1.0;
        }

        const renderLoop = () => {
          if (isStopped || taskRef.aborted) {
            if (recorder && recorder.state !== 'inactive') {
              recorder.stop();
            }
            cleanup();
            reject(new Error('Processing cancelled'));
            return;
          }

          ctx.drawImage(video, 0, 0, targetW, targetH);

          const currentPct = Math.min(98, Math.round((video.currentTime / (duration || 1)) * 100));
          onProgress(currentPct, `Compressing video (${currentPct}%)...`);

          if (video.ended || video.currentTime >= duration) {
            if (recorder && recorder.state !== 'inactive') {
              recorder.stop();
            }
            return;
          }

          if ('requestVideoFrameCallback' in video) {
            videoFrameCallbackId = (video as any).requestVideoFrameCallback(renderLoop);
          } else {
            animationFrameId = requestAnimationFrame(renderLoop);
          }
        };

        video.onended = () => {
          if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
          }
        };

        video.play().then(() => {
          renderLoop();
        }).catch((err) => {
          cleanup();
          reject(err);
        });
      };

      video.onerror = () => {
        cleanup();
        reject(new Error('Video loading error during compression'));
      };

      setTimeout(() => {
        if (!isStopped) {
          if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
          } else {
            cleanup();
            reject(new Error('Timeout during video compression'));
          }
        }
      }, Math.max(20, Math.ceil(duration) + 15) * 1000);

      video.src = objectUrl;
    });
  }

  /**
   * Process video file: reads metadata, checks skip conditions, downscales if required, encodes fast.
   */
  private async processVideo(
    file: File,
    settings: AttachmentCompressionSettings,
    updateItem: (updates: Partial<ProcessedAttachmentItem>) => ProcessedAttachmentItem,
    taskId: string,
    taskRef: { aborted: boolean }
  ): Promise<ProcessedAttachmentItem> {
    updateItem({ progress: 5, statusMessage: 'Reading video metadata...' });

    if (!settings.videos.enabled || !settings.enableCompression) {
      const thumbnail = await this.generateVideoThumbnail(file).catch(() => undefined);
      return updateItem({
        status: 'done',
        progress: 100,
        thumbnailUrl: thumbnail,
        isCompressed: false,
        compressedSize: file.size,
        statusMessage: 'Video compression disabled in settings'
      });
    }

    const fileSizeMB = file.size / (1024 * 1024);
    const thresholdMB = settings.videos.maxSizeMBThreshold ?? settings.videos.compressAboveMB ?? 5;

    let videoMeta: {
      width: number;
      height: number;
      duration: number;
      estimatedBitrateBps: number;
    };

    try {
      videoMeta = await this.readVideoMetadata(file);
    } catch (err) {
      console.warn('[AttachmentProcessor] Video metadata reading skipped, keeping original:', err);
      const thumbnail = await this.generateVideoThumbnail(file).catch(() => undefined);
      return updateItem({
        status: 'done',
        progress: 100,
        thumbnailUrl: thumbnail,
        isCompressed: false,
        compressedSize: file.size,
        statusMessage: 'Original video preserved'
      });
    }

    const { width: origW, height: origH, duration, estimatedBitrateBps } = videoMeta;
    const maxRes = settings.videos.maxResolution || 720;
    const targetFps = Math.min(settings.videos.fpsLimit || 30, 60);

    let targetBitrateMbps = settings.videos.bitrateMbps || 0;
    if (!targetBitrateMbps || targetBitrateMbps <= 0) {
      if (maxRes <= 480) targetBitrateMbps = 1.2;
      else if (maxRes <= 720) targetBitrateMbps = 2.5;
      else if (maxRes <= 1080) targetBitrateMbps = 4.5;
      else targetBitrateMbps = 7.0;
    }
    const targetBitrateBps = targetBitrateMbps * 1_000_000;

    // Skip check:
    // 1. Resolution <= maxRes AND file size <= thresholdMB
    // 2. OR resolution <= maxRes AND estimated bitrate <= targetBitrateBps
    const isLandscape = origW >= origH;
    const currentResMetric = isLandscape ? origH : origW;
    const resolutionOk = currentResMetric <= maxRes;
    const sizeOk = thresholdMB > 0 && fileSizeMB <= thresholdMB;
    const bitrateOk = estimatedBitrateBps <= targetBitrateBps * 1.1;

    if ((sizeOk && resolutionOk) || (resolutionOk && bitrateOk)) {
      updateItem({ progress: 20, statusMessage: 'Generating video thumbnail...' });
      const thumbnail = await this.generateVideoThumbnail(file).catch(() => undefined);
      return updateItem({
        status: 'done',
        progress: 100,
        thumbnailUrl: thumbnail,
        width: origW,
        height: origH,
        duration,
        isCompressed: false,
        compressedSize: file.size,
        statusMessage: sizeOk
          ? `Optimal file size (${formatFileSize(file.size)})`
          : `Video already within ${maxRes}p resolution & bitrate limits`
      });
    }

    // Downscaling target dimensions
    let targetW = origW;
    let targetH = origH;

    if (currentResMetric > maxRes) {
      const scale = maxRes / currentResMetric;
      targetW = Math.round(origW * scale);
      targetH = Math.round(origH * scale);
    }

    targetW = targetW - (targetW % 2);
    targetH = targetH - (targetH % 2);
    if (targetW < 2) targetW = 2;
    if (targetH < 2) targetH = 2;

    updateItem({
      progress: 15,
      width: targetW,
      height: targetH,
      duration,
      statusMessage: `Compressing video (${origW}x${origH} → ${targetW}x${targetH})...`
    });

    const thumbnail = await this.generateVideoThumbnail(file).catch(() => undefined);
    updateItem({ thumbnailUrl: thumbnail, progress: 20 });

    try {
      const compressedFile = await this.encodeVideoFast({
        file,
        origW,
        origH,
        targetW,
        targetH,
        duration,
        targetFps,
        targetBitrateBps,
        preset: settings.videos.preset || settings.videos.quality || 'fastest',
        taskId,
        taskRef,
        onProgress: (pct, msg) => {
          updateItem({
            progress: Math.min(98, 20 + Math.round(pct * 0.78)),
            statusMessage: msg || 'Compressing video...'
          });
        }
      });

      if (compressedFile && compressedFile.size < file.size) {
        // Post-encoding validation: verify output duration matches input duration
        const outMeta = await this.readVideoMetadata(compressedFile).catch(() => null);
        if (outMeta && outMeta.duration > 0 && duration > 0) {
          const durationDiff = Math.abs(outMeta.duration - duration);
          const maxAllowedDiff = Math.max(1.0, duration * 0.1);
          if (durationDiff > maxAllowedDiff) {
            console.warn(
              `[AttachmentProcessor] Output duration (${outMeta.duration.toFixed(2)}s) differs from input (${duration.toFixed(2)}s). Preserving original video.`
            );
            return updateItem({
              status: 'done',
              progress: 100,
              isCompressed: false,
              compressedSize: file.size,
              statusMessage: 'Original video preserved (duration validation check)'
            });
          }
        }

        return updateItem({
          status: 'done',
          progress: 100,
          isCompressed: true,
          file: compressedFile,
          compressedFile,
          compressedSize: compressedFile.size,
          statusMessage: `Compressed (${formatFileSize(file.size)} → ${formatFileSize(compressedFile.size)})`
        });
      } else {
        return updateItem({
          status: 'done',
          progress: 100,
          isCompressed: false,
          compressedSize: file.size,
          statusMessage: 'Original video preserved'
        });
      }
    } catch (err: any) {
      console.warn('[AttachmentProcessor] Video compression fallback:', err);
      return updateItem({
        status: 'done',
        progress: 100,
        isCompressed: false,
        compressedSize: file.size,
        statusMessage: 'Original video preserved'
      });
    }
  }

  /**
   * Process audio file with fast metadata extraction and client-side optimization.
   */
  private async processAudio(
    file: File,
    settings: AttachmentCompressionSettings,
    updateItem: (updates: Partial<ProcessedAttachmentItem>) => ProcessedAttachmentItem
  ): Promise<ProcessedAttachmentItem> {
    updateItem({ progress: 15, statusMessage: 'Analyzing audio file...' });

    // Extract ID3 / embedded metadata instantly
    const meta = await extractAudioMetadata(file).catch(() => ({
      title: undefined,
      artist: undefined,
      album: undefined,
      coverUrl: undefined,
      displayName: file.name,
      originalFilename: file.name
    }));

    updateItem({
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      coverUrl: meta.coverUrl,
      displayName: meta.displayName,
      originalFilename: file.name,
      progress: 50,
      statusMessage: meta.displayName ? `Title: ${meta.displayName}` : 'Audio metadata analyzed'
    });

    // Audio formats like MP3, M4A, OGG, AAC, FLAC, OPUS are already compressed.
    // Preserve original file to prioritize speed, high audio quality, and zero UI thread blocking.
    return updateItem({
      status: 'done',
      progress: 100,
      isCompressed: false,
      compressedSize: file.size,
      statusMessage: meta.title || meta.artist ? `Track: ${meta.displayName}` : 'Audio file ready'
    });
  }

  /**
   * Generate lightweight thumbnail preview for an image file.
   */
  async generateImageThumbnail(file: File, maxDim: number = 240): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;

        let w = origW;
        let h = origH;
        if (Math.max(origW, origH) > maxDim) {
          if (origW > origH) {
            w = maxDim;
            h = Math.round((origH * maxDim) / origW);
          } else {
            h = maxDim;
            w = Math.round((origW * maxDim) / origH);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/webp', 0.75));
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image for thumbnail'));
      };

      img.src = objectUrl;
    });
  }

  /**
   * Generate video thumbnail preview from video frame.
   */
  async generateVideoThumbnail(file: File, maxDim: number = 240): Promise<string> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      const objectUrl = URL.createObjectURL(file);

      video.onloadeddata = () => {
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      };

      video.onseeked = () => {
        const origW = video.videoWidth;
        const origH = video.videoHeight;

        let w = origW || 320;
        let h = origH || 240;
        if (Math.max(w, h) > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        URL.revokeObjectURL(objectUrl);

        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }

        ctx.drawImage(video, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };

      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load video for thumbnail'));
      };

      video.src = objectUrl;
    });
  }

  private getSettings(customSettings?: Partial<AttachmentCompressionSettings>): AttachmentCompressionSettings {
    const cached = getCachedUserSettings();
    const base = cached.attachmentCompression || DEFAULT_ATTACHMENT_SETTINGS;
    if (!customSettings) return base;

    return {
      enableCompression: customSettings.enableCompression ?? base.enableCompression,
      images: { ...base.images, ...(customSettings.images || {}) },
      videos: { ...base.videos, ...(customSettings.videos || {}) },
      audio: { ...base.audio, ...(customSettings.audio || {}) }
    };
  }
}

export const AttachmentProcessor = new AttachmentProcessorService();
