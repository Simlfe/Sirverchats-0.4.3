import React, { useState, useEffect, useRef } from 'react';
import { useRealtimeMedia } from '../context/MediaContext';
import { CameraQualityProfile } from '../types/media';
import { Camera, Video, Zap, Activity, ShieldCheck, Gauge, Info, RefreshCw, Cpu, Layers, Mic, MicOff, Volume2 } from 'lucide-react';
import realtimeMediaProvider from '../media/RealtimeMediaProvider';

interface CameraQualitySettingsProps {
  lang: 'en' | 'ar';
}

export default function CameraQualitySettings({ lang }: CameraQualitySettingsProps) {
  const {
    cameraQualityProfile,
    setCameraQualityProfile,
    cameraTelemetry,
    isCameraEnabled,
    toggleCamera,
    switchCamera,
    switchMicrophone,
    isMuted,
    toggleMute,
  } = useRealtimeMedia();

  const isAr = lang === 'ar';

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>(() => {
    return localStorage.getItem('selected_audio_input') || 'default';
  });
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micDiagnostics, setMicDiagnostics] = useState<{
    trackId?: string;
    label?: string;
    readyState?: string;
    enabled?: boolean;
    muted?: boolean;
  }>({});

  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnimRef = useRef<number | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);

  // Load available audio input devices
  useEffect(() => {
    const loadDevices = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const inputs = devices.filter((d) => d.kind === 'audioinput');
          setAudioDevices(inputs);
        }
      } catch (err) {
        console.warn('[MIC_DIAGNOSTICS] Failed to enumerate audio devices:', err);
      }
    };
    loadDevices();

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', loadDevices);
      return () => navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
    }
  }, []);

  const handleSelectMic = async (deviceId: string) => {
    setSelectedMicId(deviceId);
    localStorage.setItem('selected_audio_input', deviceId);
    await switchMicrophone(deviceId);
    if (isTestingMic) {
      stopMicTest();
      startMicTest(deviceId);
    }
  };

  const startMicTest = async (overrideDevId?: string) => {
    try {
      stopMicTest();
      const devId = overrideDevId || selectedMicId;
      const constraints: any = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };
      if (devId && devId !== 'default') {
        constraints.audio.deviceId = devId;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      testStreamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      if (track) {
        setMicDiagnostics({
          trackId: track.id,
          label: track.label || 'Default Microphone',
          readyState: track.readyState,
          enabled: track.enabled,
          muted: track.muted,
        });
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      micAnalyserRef.current = analyser;

      setIsTestingMic(true);

      const updateLevel = () => {
        if (!micAnalyserRef.current) return;
        const data = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
        micAnalyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i];
        }
        const avg = sum / data.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(normalized);

        micAnimRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err: any) {
      console.warn('[MIC_DIAGNOSTICS] Mic test error:', err);
    }
  };

  const stopMicTest = () => {
    if (micAnimRef.current) {
      cancelAnimationFrame(micAnimRef.current);
      micAnimRef.current = null;
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    micAnalyserRef.current = null;
    setIsTestingMic(false);
    setMicLevel(0);
  };

  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  const profiles: {
    id: CameraQualityProfile;
    titleEn: string;
    titleAr: string;
    descEn: string;
    descAr: string;
    badgeEn: string;
    badgeAr: string;
    icon: React.ElementType;
  }[] = [
    {
      id: 'auto',
      titleEn: 'Auto (Adaptive)',
      titleAr: 'تلقائي (تكيفي)',
      descEn: 'Automatically selects the highest quality your device & network can sustain.',
      descAr: 'يحدد أداء وجودة الكاميرا تلقائياً حسب سرعة الشبكة وقدرة الجهاز.',
      badgeEn: 'Recommended',
      badgeAr: 'موصى به',
      icon: Zap,
    },
    {
      id: 'ultra',
      titleEn: 'Ultra Quality',
      titleAr: 'جودة فائقة Ultra',
      descEn: 'Maximum 1080p/1440p @ 60 FPS (Up to 6.0 Mbps). Crisp detail for powerful devices.',
      descAr: 'أقصى دقة 1080p/1440p بمعدل 60 إطار (حتى 6.0 ميجابت). تفاصيل فائقة.',
      badgeEn: '6.0 Mbps / 60 FPS',
      badgeAr: '6.0 ميجابت / 60 إطار',
      icon: Gauge,
    },
    {
      id: 'high',
      titleEn: 'High Quality',
      titleAr: 'جودة عالية High',
      descEn: 'Full HD 1080p @ 30 FPS (Up to 3.5 Mbps). Excellent clarity and smooth motion.',
      descAr: 'دقة كاملة 1080p بمعدل 30 إطار (حتى 3.5 ميجابت). وضوح ممتاظ.',
      badgeEn: '3.5 Mbps / 1080p',
      badgeAr: '3.5 ميجابت / 1080p',
      icon: Video,
    },
    {
      id: 'balanced',
      titleEn: 'Balanced',
      titleAr: 'متوازن Balanced',
      descEn: 'HD 720p @ 30 FPS (Up to 1.8 Mbps). Great balance of quality and stability.',
      descAr: 'دقة HD 720p بمعدل 30 إطار (حتى 1.8 ميجابت). استقرار عالي.',
      badgeEn: '1.8 Mbps / 720p',
      badgeAr: '1.8 ميجابت / 720p',
      icon: Activity,
    },
    {
      id: 'low',
      titleEn: 'Low (Data Saver)',
      titleAr: 'منخفض (توفير البيانات)',
      descEn: '360p @ 20 FPS (500 kbps). Optimized for weak mobile data connections.',
      descAr: 'دقة 360p بمعدل 20 إطار (500 كيلوبت). للاتصالات الضعيقة.',
      badgeEn: '500 kbps / Data Saver',
      badgeAr: '500 كيلوبت / توفير',
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Camera className="w-6 h-6 text-accent" />
          <span>{isAr ? 'إعدادات الكاميرا وجودة البث' : 'Camera & Streaming Quality'}</span>
        </h3>
        <p className="text-xs text-[var(--theme-text-muted)] mt-1">
          {isAr
            ? 'تخصيص بدقة عالية وجودة الكاميرا للهواتف الذكية (Android / iOS) وأجهزة الكمبيوتر مع دعم معدل البث التكيفي Telemetry'
            : 'Configure camera capture resolution, encoder bitrates, and adaptive telemetry for Android & desktop streams.'}
        </p>
      </div>

      {/* Quality Profiles Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {profiles.map((p) => {
          const Icon = p.icon;
          const isSelected = cameraQualityProfile === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setCameraQualityProfile(p.id)}
              className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                isSelected
                  ? 'bg-accent/15 border-accent shadow-md ring-1 ring-accent'
                  : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] hover:border-[var(--theme-text-muted)]'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl ${isSelected ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)]' : 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-secondary)]'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">{isAr ? p.titleAr : p.titleEn}</h4>
                    <span className="text-[10px] font-semibold text-accent/90 uppercase tracking-wider">
                      {isAr ? p.badgeAr : p.badgeEn}
                    </span>
                  </div>
                </div>
                {isSelected && (
                  <span className="px-2 py-0.5 rounded-full bg-accent text-[var(--theme-accent-contrast,#ffffff)] text-[10px] font-extrabold uppercase">
                    {isAr ? 'نشط' : 'Active'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--theme-text-muted)] leading-relaxed mt-1">
                {isAr ? p.descAr : p.descEn}
              </p>
            </button>
          );
        })}
      </div>

      {/* Live Camera Preview & Diagnostic Controls */}
      <div className="p-4 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-accent" />
            <h4 className="font-bold text-sm">
              {isAr ? 'معاينة اختباري الكاميرا وتحليل البث' : 'Camera Live Test & Telemetry'}
            </h4>
          </div>
          <div className="flex items-center gap-2">
            {isCameraEnabled && (
              <button
                type="button"
                onClick={() => switchCamera()}
                className="px-3 py-1.5 rounded-xl bg-[var(--theme-bg-primary)] border border-[var(--theme-border)] hover:bg-accent/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isAr ? 'تبديل الكاميرا' : 'Switch Camera'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => toggleCamera()}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                isCameraEnabled
                  ? 'bg-red-500/20 text-red-500 border border-red-500/30 hover:bg-red-500/30'
                  : 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] hover:opacity-90'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>
                {isCameraEnabled
                  ? isAr
                    ? 'إيقاف الاختبار'
                    : 'Stop Test'
                  : isAr
                  ? 'تشغيل اختبار الكاميرا'
                  : 'Start Camera Test'}
              </span>
            </button>
          </div>
        </div>

        {/* Telemetry Dashboard Box */}
        {cameraTelemetry ? (
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-accent font-bold flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                {isAr ? 'بيانات البث المباشر telemetry:' : 'Live Stream Telemetry:'}
              </span>
              <span className="text-[10px] text-emerald-400 font-extrabold uppercase px-2 py-0.5 bg-emerald-500/20 rounded-full border border-emerald-500/30">
                {cameraTelemetry.adaptiveBitrateState}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
              <div>
                <span className="text-gray-400 block text-[10px]">{isAr ? 'الملف الشخصي النشط:' : 'Active Profile:'}</span>
                <span className="font-bold text-white uppercase">{cameraTelemetry.activeProfile}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">{isAr ? 'الدقة المحددة:' : 'Target Res:'}</span>
                <span className="font-bold text-white">{cameraTelemetry.selectedResolution} @ {cameraTelemetry.targetFps} FPS</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">{isAr ? 'الدقة الملتقطة فعلياً:' : 'Captured Res:'}</span>
                <span className="font-bold text-emerald-400">{cameraTelemetry.actualCaptureResolution} @ {cameraTelemetry.actualFps} FPS</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">{isAr ? 'دقة البث المنشورة:' : 'Published Res:'}</span>
                <span className="font-bold text-white">{cameraTelemetry.publishedResolution}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">{isAr ? 'الترميز المشفر:' : 'Encoder / Codec:'}</span>
                <span className="font-bold text-sky-400">{cameraTelemetry.codec} ({cameraTelemetry.encoder})</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">{isAr ? 'أقصى معدل بث:' : 'Max Bitrate:'}</span>
                <span className="font-bold text-amber-400">{(cameraTelemetry.maxBitrateBps / 1_000_000).toFixed(2)} Mbps</span>
              </div>
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-gray-300">
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-purple-400" />
                {isAr ? 'طبقات Simulcast Multi-Layer:' : 'Simulcast Layers:'} {cameraTelemetry.simulcastEnabled ? `${cameraTelemetry.simulcastLayersCount} Layers` : 'Disabled'}
              </span>
              <span className="truncate max-w-[200px]" title={cameraTelemetry.deviceLabel}>
                📷 {cameraTelemetry.deviceLabel}
              </span>
            </div>

            {cameraTelemetry.lastDowngradeReason && (
              <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px]">
                ⚠️ {cameraTelemetry.lastDowngradeReason}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[var(--theme-bg-primary)] border border-[var(--theme-border)] text-center text-xs text-[var(--theme-text-muted)] flex items-center justify-center gap-2">
            <Info className="w-4 h-4 text-accent shrink-0" />
            <span>
              {isAr
                ? 'انقر فوق "تشغيل اختبار الكاميرا" للتحقق من دقة الالتقاط ومعدل الإطارات الفعلي في جهازك.'
                : 'Click "Start Camera Test" to verify camera capture resolution, actual FPS, and published encoding stats.'}
            </span>
          </div>
        )}

        {/* Microphone & Audio Input Section */}
        <div className="pt-4 border-t border-[var(--theme-border)] space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[var(--theme-text-muted)] uppercase tracking-wider flex items-center gap-2">
              <Mic className="w-4 h-4 text-accent" />
              {isAr ? 'جهاز الميكروفون والدخل الصوتي' : 'Audio Input & Microphone Settings'}
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleMute()}
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1.5 border transition-all cursor-pointer ${
                  isMuted
                    ? 'bg-red-500/20 text-red-500 border-red-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                }`}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                <span>{isMuted ? (isAr ? 'مكتوم' : 'Muted') : (isAr ? 'نشط' : 'Active')}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={selectedMicId}
              onChange={(e) => handleSelectMic(e.target.value)}
              className="flex-1 bg-[var(--theme-bg-primary)] border border-[var(--theme-border)] rounded-xl px-3 py-2 text-xs text-[var(--theme-text-primary)] focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="default">{isAr ? 'الميكروفون الافتراضي بالنظام (Default)' : 'Default System Microphone'}</option>
              {audioDevices.map((dev, idx) => (
                <option key={dev.deviceId || idx} value={dev.deviceId}>
                  {dev.label || `${isAr ? 'ميكروفون' : 'Microphone'} ${idx + 1}`}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                if (isTestingMic) {
                  stopMicTest();
                } else {
                  startMicTest();
                }
              }}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-all cursor-pointer shrink-0 ${
                isTestingMic
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] border-[var(--theme-border)] hover:border-accent'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>
                {isTestingMic
                  ? isAr
                    ? 'إيقاف التجربة'
                    : 'Stop Mic Test'
                  : isAr
                  ? 'اختبار الميكروفون'
                  : 'Test Microphone'}
              </span>
            </button>
          </div>

          {/* Live Mic Volume Bar */}
          {isTestingMic && (
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-accent animate-pulse" />
                  {isAr ? 'مستوى الصوت المباشر:' : 'Live Mic Level:'}
                </span>
                <span className="font-bold text-emerald-400">{micLevel}%</span>
              </div>
              <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden border border-white/10 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 rounded-full transition-all duration-75"
                  style={{ width: `${micLevel}%` }}
                />
              </div>

              {micDiagnostics.label && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-[10px] text-gray-400">
                  <div>
                    <span>Device: </span>
                    <span className="text-white font-bold">{micDiagnostics.label}</span>
                  </div>
                  <div>
                    <span>ReadyState: </span>
                    <span className="text-emerald-400 font-bold">{micDiagnostics.readyState}</span>
                  </div>
                  <div>
                    <span>Track Enabled: </span>
                    <span className="text-sky-400 font-bold">{String(micDiagnostics.enabled)}</span>
                  </div>
                  <div>
                    <span>Track Muted: </span>
                    <span className="text-amber-400 font-bold">{String(micDiagnostics.muted)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
