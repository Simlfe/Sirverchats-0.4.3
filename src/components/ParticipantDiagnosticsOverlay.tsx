import React, { useEffect, useState } from 'react';
import { Activity, X, Cpu, Gauge, Zap, AlertTriangle } from 'lucide-react';
import { ParticipantDiagnosticsData } from '../types/media';
import liveKitManager from '../media/livekit/LiveKitManager';

interface ParticipantDiagnosticsOverlayProps {
  userId: string;
  displayName: string;
  lang?: 'en' | 'ar';
  onClose: () => void;
}

export const ParticipantDiagnosticsOverlay: React.FC<ParticipantDiagnosticsOverlayProps> = ({
  userId,
  displayName,
  lang = 'en',
  onClose,
}) => {
  const isAr = lang === 'ar';
  const [diag, setDiag] = useState<ParticipantDiagnosticsData | null>(null);

  useEffect(() => {
    let isMounted = true;
    const pollDiagnostics = async () => {
      const data = await liveKitManager.getParticipantDiagnostics(userId);
      if (isMounted) {
        setDiag(data);
      }
    };

    pollDiagnostics();
    const interval = setInterval(pollDiagnostics, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [userId]);

  return (
    <div
      className="absolute inset-x-2 top-2 p-3 rounded-2xl bg-[var(--theme-bg-dialog)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] shadow-2xl z-40 text-xs font-mono space-y-2.5 animate-in fade-in zoom-in-95 duration-200 select-text"
      dir={isAr ? 'rtl' : 'ltr'}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--theme-border)] pb-2">
        <div className="flex items-center gap-1.5 text-emerald-400 font-extrabold text-[11px]">
          <Activity className="w-4 h-4 animate-pulse shrink-0" />
          <span>{isAr ? 'تشخيصات البث والتليمتري' : 'Live Stream Telemetry'}</span>
          <span className="text-[10px] text-[var(--theme-text-muted)] font-normal">({displayName})</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer border-0 bg-transparent"
          title={isAr ? 'إغلاق' : 'Close'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {diag ? (
        <div className="grid grid-cols-2 gap-2 text-[10px] leading-tight">
          <div className="p-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]">
            <span className="text-[var(--theme-text-muted)] block mb-0.5">{isAr ? 'دقة الالتقاط:' : 'Capture Res / FPS'}</span>
            <span className="font-bold text-[var(--theme-text-primary)]">{diag.captureResolution} @ {diag.captureFps} FPS</span>
          </div>

          <div className="p-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]">
            <span className="text-[var(--theme-text-muted)] block mb-0.5">{isAr ? 'دقة التشفير:' : 'Encoded Res / FPS'}</span>
            <span className="font-bold text-sky-400">{diag.encodedResolution} @ {diag.encodedFps} FPS</span>
          </div>

          <div className="p-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]">
            <span className="text-[var(--theme-text-muted)] block mb-0.5">{isAr ? 'الدقة المستلمة:' : 'Received Res / FPS'}</span>
            <span className="font-bold text-emerald-400">{diag.receivedResolution} @ {diag.receivedFps} FPS</span>
          </div>

          <div className="p-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]">
            <span className="text-[var(--theme-text-muted)] block mb-0.5">{isAr ? 'معدل البث Bitrate:' : 'Bitrate'}</span>
            <span className="font-bold text-amber-400">{(diag.currentBitrateKbps / 1000).toFixed(2)} Mbps</span>
          </div>

          <div className="p-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]">
            <span className="text-[var(--theme-text-muted)] block mb-0.5">{isAr ? 'فقدان الحزم / RTT:' : 'Packet Loss / RTT'}</span>
            <span className="font-bold text-purple-400">{diag.packetLossPercent}% loss | {diag.rttMs} ms</span>
          </div>

          <div className="p-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]">
            <span className="text-[var(--theme-text-muted)] block mb-0.5">{isAr ? 'التذبذب Jitter:' : 'Jitter'}</span>
            <span className="font-bold text-cyan-400">{diag.jitterMs} ms</span>
          </div>

          <div className="p-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]">
            <span className="text-[var(--theme-text-muted)] block mb-0.5">{isAr ? 'إطارات العرض Renderer:' : 'Decoder / Renderer'}</span>
            <span className="font-bold text-emerald-400">{diag.decoderFps} / {diag.rendererFps} FPS</span>
          </div>

          <div className="p-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]">
            <span className="text-[var(--theme-text-muted)] block mb-0.5">{isAr ? 'حالة القناة والاشتراك:' : 'State / Sub'}</span>
            <span className="font-bold text-teal-400 uppercase">{diag.trackState} | {diag.subscriptionState}</span>
          </div>
        </div>
      ) : (
        <div className="p-3 text-center text-[var(--theme-text-muted)] text-[10px] animate-pulse">
          {isAr ? 'جاري قياس البيانات...' : 'Collecting RTC statistics...'}
        </div>
      )}
    </div>
  );
};

export default ParticipantDiagnosticsOverlay;
