import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Pencil,
  Eraser,
  Square,
  Circle,
  Minus,
  ArrowRight,
  RotateCcw,
  Trash2,
  Download,
  Share2,
  Paperclip,
  Check,
  Maximize2,
  Minimize2,
  Sparkles,
  Palette,
  Undo2,
  Redo2,
  Loader2,
  Type
} from 'lucide-react';
import { Channel, User } from '../types';
import { pbService } from '../pocketbase';

interface WhiteboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
  currentUser: User;
  lang?: 'en' | 'ar';
  isLight?: boolean;
  onSaveToAttachments?: (file: File) => void;
}

type ToolType = 'pen' | 'highlighter' | 'eraser' | 'line' | 'arrow' | 'rect' | 'circle' | 'text';

interface DrawingElement {
  id: string;
  tool: ToolType;
  color: string;
  size: number;
  points: { x: number; y: number }[];
  text?: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  userId?: string;
  userName?: string;
}

const PRESET_COLORS = [
  '#7BAE37', // Brand Avocado
  '#ffffff', // White
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#eab308', // Yellow
  '#a855f7', // Purple
  '#f97316', // Orange
  '#ec4899', // Pink
  '#000000', // Black
];

const PRESET_SIZES = [2, 4, 8, 14, 24, 36];

export default function WhiteboardModal({
  isOpen,
  onClose,
  channel,
  currentUser,
  lang = 'en',
  isLight = false,
  onSaveToAttachments,
}: WhiteboardModalProps) {
  const isAr = lang === 'ar';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<ToolType>('pen');
  const [color, setColor] = useState<string>('#7BAE37');
  const [brushSize, setBrushSize] = useState<number>(4);
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingElement[][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [canvasBgColor, setCanvasBgColor] = useState<'dark' | 'white' | 'grid'>('dark');

  const currentElementRef = useRef<DrawingElement | null>(null);

  // Redraw canvas whenever elements change
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    if (canvasBgColor === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (canvasBgColor === 'grid') {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 1;
      const gridSize = 24;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#121216';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Render all elements
    elements.forEach((el) => {
      ctx.save();
      if (el.tool === 'highlighter') {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.size * 2.5;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
      } else if (el.tool === 'eraser') {
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = canvasBgColor === 'white' ? '#ffffff' : canvasBgColor === 'grid' ? '#18181b' : '#121216';
        ctx.lineWidth = el.size * 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      } else {
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = el.color;
        ctx.fillStyle = el.color;
        ctx.lineWidth = el.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }

      if (el.tool === 'pen' || el.tool === 'highlighter' || el.tool === 'eraser') {
        if (el.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          for (let i = 1; i < el.points.length; i++) {
            ctx.lineTo(el.points[i].x, el.points[i].y);
          }
          ctx.stroke();
        }
      } else if (el.tool === 'line') {
        if (el.startX !== undefined && el.startY !== undefined && el.endX !== undefined && el.endY !== undefined) {
          ctx.beginPath();
          ctx.moveTo(el.startX, el.startY);
          ctx.lineTo(el.endX, el.endY);
          ctx.stroke();
        }
      } else if (el.tool === 'arrow') {
        if (el.startX !== undefined && el.startY !== undefined && el.endX !== undefined && el.endY !== undefined) {
          ctx.beginPath();
          ctx.moveTo(el.startX, el.startY);
          ctx.lineTo(el.endX, el.endY);
          ctx.stroke();

          // Arrow head
          const angle = Math.atan2(el.endY - el.startY, el.endX - el.startX);
          const headLen = Math.max(12, el.size * 3);
          ctx.beginPath();
          ctx.moveTo(el.endX, el.endY);
          ctx.lineTo(
            el.endX - headLen * Math.cos(angle - Math.PI / 6),
            el.endY - headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(el.endX, el.endY);
          ctx.lineTo(
            el.endX - headLen * Math.cos(angle + Math.PI / 6),
            el.endY - headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
        }
      } else if (el.tool === 'rect') {
        if (el.startX !== undefined && el.startY !== undefined && el.endX !== undefined && el.endY !== undefined) {
          const x = Math.min(el.startX, el.endX);
          const y = Math.min(el.startY, el.endY);
          const w = Math.abs(el.endX - el.startX);
          const h = Math.abs(el.endY - el.startY);
          ctx.strokeRect(x, y, w, h);
        }
      } else if (el.tool === 'circle') {
        if (el.startX !== undefined && el.startY !== undefined && el.endX !== undefined && el.endY !== undefined) {
          const radiusX = Math.abs(el.endX - el.startX) / 2;
          const radiusY = Math.abs(el.endY - el.startY) / 2;
          const centerX = Math.min(el.startX, el.endX) + radiusX;
          const centerY = Math.min(el.startY, el.endY) + radiusY;
          ctx.beginPath();
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  }, [elements, canvasBgColor]);

  // Resize canvas according to container
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        redrawCanvas();
      }
    };

    const timer = setTimeout(handleResize, 100);
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, redrawCanvas, isFullscreen]);

  // Sync whiteboard actions across room using a broadcast channel
  useEffect(() => {
    if (!isOpen || !channel?.id) return;

    const bc = new BroadcastChannel(`whiteboard-sync-${channel.id}`);

    bc.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === 'sync-elements') {
        if (data.elements && data.userId !== currentUser.id) {
          setElements(data.elements);
        }
      } else if (data && data.type === 'clear') {
        if (data.userId !== currentUser.id) {
          setElements([]);
        }
      }
    };

    return () => {
      bc.close();
    };
  }, [isOpen, channel?.id, currentUser?.id]);

  const broadcastElements = (updated: DrawingElement[]) => {
    try {
      const bc = new BroadcastChannel(`whiteboard-sync-${channel.id}`);
      bc.postMessage({
        type: 'sync-elements',
        elements: updated,
        userId: currentUser.id,
        userName: currentUser.username,
      });
      bc.close();
    } catch (e) {}
  };

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if (e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handleStartDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e);
    setIsDrawing(true);

    const newElement: DrawingElement = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      tool,
      color,
      size: brushSize,
      points: [coords],
      startX: coords.x,
      startY: coords.y,
      endX: coords.x,
      endY: coords.y,
      userId: currentUser.id,
      userName: currentUser.username,
    };

    currentElementRef.current = newElement;
    setElements((prev) => [...prev, newElement]);
    setRedoStack([]);
  };

  const handleDrawMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentElementRef.current) return;
    const coords = getCanvasCoordinates(e);

    const activeEl = currentElementRef.current;

    if (activeEl.tool === 'pen' || activeEl.tool === 'highlighter' || activeEl.tool === 'eraser') {
      activeEl.points.push(coords);
    } else {
      activeEl.endX = coords.x;
      activeEl.endY = coords.y;
    }

    setElements((prev) => prev.map((el) => (el.id === activeEl.id ? { ...activeEl } : el)));
  };

  const handleEndDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentElementRef.current) {
      broadcastElements(elements);
      currentElementRef.current = null;
    }
  };

  const handleUndo = () => {
    if (elements.length === 0) return;
    const last = elements[elements.length - 1];
    const remaining = elements.slice(0, elements.length - 1);
    setRedoStack((prev) => [...prev, [last]]);
    setElements(remaining);
    broadcastElements(remaining);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextGroup = redoStack[redoStack.length - 1];
    const newRedo = redoStack.slice(0, redoStack.length - 1);
    const updated = [...elements, ...nextGroup];
    setRedoStack(newRedo);
    setElements(updated);
    broadcastElements(updated);
  };

  const handleClear = () => {
    if (elements.length === 0) return;
    setRedoStack((prev) => [...prev, elements]);
    setElements([]);
    broadcastElements([]);
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `whiteboard-${channel.name || 'session'}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleShareToChannel = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isExporting) return;

    setIsExporting(true);

    try {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setIsExporting(false);
          return;
        }

        const fileName = `whiteboard-${Date.now()}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        if (onSaveToAttachments) {
          onSaveToAttachments(file);
          setExportSuccess(true);
          setTimeout(() => {
            setExportSuccess(false);
            onClose();
          }, 1200);
        } else {
          // Direct post into channel messages
          const createdMsg = await pbService.sendMessage(channel.id, isAr ? '🎨 رسمة من السبورة البيضاء' : '🎨 Shared drawing from Whiteboard', undefined, true);
          if (createdMsg && createdMsg.id) {
            await pbService.uploadAttachment(createdMsg.id, file);
          }
          setExportSuccess(true);
          setTimeout(() => {
            setExportSuccess(false);
            onClose();
          }, 1200);
        }
      }, 'image/png');
    } catch (err) {
      console.error('Failed to export whiteboard:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className={`w-full flex flex-col rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg-dialog)] text-[var(--theme-text-primary)] shadow-2xl overflow-hidden transition-all ${
            isFullscreen ? 'h-[98vh] max-w-[98vw]' : 'h-[85vh] max-w-5xl'
          }`}
          dir={isAr ? 'rtl' : 'ltr'}
        >
          {/* Top Bar Header */}
          <div className="px-4 py-3 border-b border-[var(--theme-border)] flex items-center justify-between gap-3 shrink-0 bg-[var(--theme-bg-secondary)]">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-accent/20 text-accent flex items-center justify-center font-bold">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="truncate">
                <h3 className="font-extrabold text-sm text-[var(--theme-text-primary)] truncate">
                  {isAr ? 'السبورة البيضاء التفاعلية' : 'Interactive Whiteboard'}
                </h3>
                <p className="text-[10px] text-[var(--theme-text-muted)] font-mono truncate">
                  #{channel.name} • {elements.length} {isAr ? 'عنصر' : 'strokes'}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Background Style Switcher */}
              <div className="hidden sm:flex items-center gap-1 bg-[var(--theme-bg-tertiary)] p-1 rounded-xl border border-[var(--theme-border)] text-xs">
                <button
                  type="button"
                  onClick={() => setCanvasBgColor('dark')}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer border-0 ${
                    canvasBgColor === 'dark' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                  }`}
                >
                  {isAr ? 'داكن' : 'Dark'}
                </button>
                <button
                  type="button"
                  onClick={() => setCanvasBgColor('grid')}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer border-0 ${
                    canvasBgColor === 'grid' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                  }`}
                >
                  {isAr ? 'شبكة' : 'Grid'}
                </button>
                <button
                  type="button"
                  onClick={() => setCanvasBgColor('white')}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer border-0 ${
                    canvasBgColor === 'white' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                  }`}
                >
                  {isAr ? 'أبيض' : 'White'}
                </button>
              </div>

              {/* Share / Post to channel button */}
              <button
                type="button"
                onClick={handleShareToChannel}
                disabled={elements.length === 0 || isExporting}
                className="px-3 py-1.5 rounded-xl bg-accent hover:opacity-90 disabled:opacity-50 text-[var(--theme-accent-contrast,#ffffff)] font-extrabold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all border-0"
                title={isAr ? 'حفظ وإرسال إلى شات القناة' : 'Save & Post to Channel Attachments'}
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : exportSuccess ? (
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <Paperclip className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {exportSuccess ? (isAr ? 'تم الإرسال!' : 'Posted!') : isAr ? 'مشاركة بالشات' : 'Post to Chat'}
                </span>
              </button>

              {/* Download PNG */}
              <button
                type="button"
                onClick={handleDownload}
                disabled={elements.length === 0}
                className="p-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] disabled:opacity-40 cursor-pointer border border-[var(--theme-border)] transition-all"
                title={isAr ? 'تنزيل كصورة PNG' : 'Download PNG'}
              >
                <Download className="w-4 h-4" />
              </button>

              {/* Fullscreen Toggle */}
              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] cursor-pointer border border-[var(--theme-border)] transition-all"
                title={isFullscreen ? (isAr ? 'تصغير' : 'Exit Fullscreen') : isAr ? 'ملء الشاشة' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-rose-500/20 text-[var(--theme-text-secondary)] hover:text-rose-400 cursor-pointer border border-[var(--theme-border)] transition-all"
                title={isAr ? 'إغلاق' : 'Close'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tools & Palette Toolbar */}
          <div className="px-3 py-2 border-b border-[var(--theme-border)] flex flex-wrap items-center justify-between gap-2 shrink-0 bg-[var(--theme-bg-tertiary)]">
            {/* Drawing Tools */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
              <button
                type="button"
                onClick={() => setTool('pen')}
                className={`p-2 rounded-xl transition-all cursor-pointer border-0 flex items-center gap-1 text-xs font-bold ${
                  tool === 'pen' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-sm' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
                title={isAr ? 'قلم حر' : 'Pen Tool'}
              >
                <Pencil className="w-4 h-4" />
                <span className="hidden md:inline">{isAr ? 'قلم' : 'Pen'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTool('highlighter')}
                className={`p-2 rounded-xl transition-all cursor-pointer border-0 flex items-center gap-1 text-xs font-bold ${
                  tool === 'highlighter' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-sm' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
                title={isAr ? 'قلم تمييز شفاف' : 'Highlighter'}
              >
                <Palette className="w-4 h-4" />
                <span className="hidden md:inline">{isAr ? 'تمييز' : 'Highlighter'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTool('eraser')}
                className={`p-2 rounded-xl transition-all cursor-pointer border-0 flex items-center gap-1 text-xs font-bold ${
                  tool === 'eraser' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-sm' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
                title={isAr ? 'ممحاة' : 'Eraser'}
              >
                <Eraser className="w-4 h-4" />
                <span className="hidden md:inline">{isAr ? 'ممحاة' : 'Eraser'}</span>
              </button>

              <div className="w-px h-5 bg-[var(--theme-border)] mx-1" />

              <button
                type="button"
                onClick={() => setTool('line')}
                className={`p-2 rounded-xl transition-all cursor-pointer border-0 ${
                  tool === 'line' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-sm' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
                title={isAr ? 'خط مستقيم' : 'Line'}
              >
                <Minus className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setTool('arrow')}
                className={`p-2 rounded-xl transition-all cursor-pointer border-0 ${
                  tool === 'arrow' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-sm' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
                title={isAr ? 'سهم' : 'Arrow'}
              >
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setTool('rect')}
                className={`p-2 rounded-xl transition-all cursor-pointer border-0 ${
                  tool === 'rect' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-sm' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
                title={isAr ? 'مستطيل' : 'Rectangle'}
              >
                <Square className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setTool('circle')}
                className={`p-2 rounded-xl transition-all cursor-pointer border-0 ${
                  tool === 'circle' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-sm' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
                title={isAr ? 'دائرة' : 'Circle'}
              >
                <Circle className="w-4 h-4" />
              </button>
            </div>

            {/* Colors and Stroke Sizes */}
            <div className="flex items-center gap-2">
              {/* Color Presets */}
              <div className="flex items-center gap-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setColor(c);
                      if (tool === 'eraser') setTool('pen');
                    }}
                    style={{ backgroundColor: c }}
                    className={`w-5 h-5 rounded-full transition-transform cursor-pointer border ${
                      color === c && tool !== 'eraser'
                        ? 'scale-125 ring-2 ring-accent border-white'
                        : 'border-white/20 hover:scale-110'
                    }`}
                  />
                ))}
              </div>

              {/* Stroke Size Selector */}
              <div className="flex items-center gap-1 ms-1">
                {PRESET_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setBrushSize(s)}
                    className={`w-6 h-6 rounded-lg flex items-center justify-center cursor-pointer border-0 ${
                      brushSize === s ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-bold' : 'hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-muted)]'
                    }`}
                    title={`${s}px`}
                  >
                    <div
                      style={{ width: Math.min(14, Math.max(3, s / 2)), height: Math.min(14, Math.max(3, s / 2)) }}
                      className="rounded-full bg-current"
                    />
                  </button>
                ))}
              </div>

              {/* Undo / Redo / Clear */}
              <div className="flex items-center gap-1 ms-2 border-s border-[var(--theme-border)] ps-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={elements.length === 0}
                  className="p-1.5 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)] disabled:opacity-30 cursor-pointer border-0 transition-all"
                  title={isAr ? 'تراجع' : 'Undo'}
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="p-1.5 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)] disabled:opacity-30 cursor-pointer border-0 transition-all"
                  title={isAr ? 'إعادة' : 'Redo'}
                >
                  <Redo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={elements.length === 0}
                  className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 disabled:opacity-30 cursor-pointer border-0 transition-all"
                  title={isAr ? 'مسح اللوحة بالكامل' : 'Clear Canvas'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Canvas Viewport */}
          <div
            ref={containerRef}
            className="flex-1 w-full h-full relative overflow-hidden cursor-crosshair touch-none select-none"
          >
            <canvas
              ref={canvasRef}
              onMouseDown={handleStartDrawing}
              onMouseMove={handleDrawMove}
              onMouseUp={handleEndDrawing}
              onMouseLeave={handleEndDrawing}
              onTouchStart={handleStartDrawing}
              onTouchMove={handleDrawMove}
              onTouchEnd={handleEndDrawing}
              className="absolute inset-0 w-full h-full block"
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
