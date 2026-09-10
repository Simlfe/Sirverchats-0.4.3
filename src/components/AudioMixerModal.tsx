import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sliders, Volume2, VolumeX, Mic, X, RotateCcw, ScreenShare } from 'lucide-react';
import { audioMixer, AudioMixerState } from '../services/audioMixer';
import { MediaParticipant } from '../types/media';

interface AudioMixerModalProps {
  isOpen: boolean;
  onClose: () => void;
  participants: MediaParticipant[];
  currentUserId?: string;
  currentUser?: { id: string; [key: string]: any };
  lang?: 'en' | 'ar';
}

export const AudioMixerModal: React.FC<AudioMixerModalProps> = ({
  isOpen,
  onClose,
  participants,
  currentUserId,
  currentUser,
  lang = 'en',
}) => {
  const isAr = lang === 'ar';
  const [mixerState, setMixerState] = useState<AudioMixerState>(audioMixer.getState());

  useEffect(() => {
    if (!isOpen) return;
    const unsub = audioMixer.subscribe((state) => {
      setMixerState({ ...state });
    });
    return () => unsub();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const effectiveUserId = currentUserId || currentUser?.id || '';
  const remoteParticipants = participants.filter((p) => p.userId !== effectiveUserId);
  const screenShareParticipants = participants.filter((p) => p.isScreenSharing);

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[999999] bg-black/75 flex items-center justify-center p-4 animate-fadeIn select-none"
    >
      <div
        className="w-full max-w-md bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] relative z-[1000000]"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-base text-[var(--theme-text-primary)]">{isAr ? 'موزع الصوت' : 'Audio Mixer'}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-[var(--theme-bg-secondary)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Mixer Controls */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 min-h-0 text-xs">
          {/* Master Voice Chat Volume */}
          <div className="space-y-2 p-3.5 rounded-xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)]">
            <div className="flex justify-between items-center">
              <span className="font-bold flex items-center gap-2 text-[var(--theme-text-primary)]">
                <Volume2 className="w-4 h-4 text-accent" /> {isAr ? 'مستوى الصوت الرئيسي للمحادثة' : 'Master Voice Volume'}
              </span>
              <span className="font-mono font-bold text-accent">{mixerState.masterVolume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              value={mixerState.masterVolume}
              onChange={(e) => audioMixer.setMasterVolume(Number(e.target.value))}
              className="w-full accent-accent h-1.5 bg-[var(--theme-border)] rounded-lg cursor-pointer"
            />
          </div>

          {/* Master Stream / Screen Audio Volume */}
          <div className="space-y-2 p-3.5 rounded-xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)]">
            <div className="flex justify-between items-center">
              <span className="font-bold flex items-center gap-2 text-[var(--theme-text-primary)]">
                <ScreenShare className="w-4 h-4 text-blue-400" /> {isAr ? 'مستوى صوت البث الرئيسي' : 'Master Stream Audio Volume'}
              </span>
              <span className="font-mono font-bold text-blue-400">{mixerState.masterStreamVolume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              value={mixerState.masterStreamVolume}
              onChange={(e) => audioMixer.setMasterStreamVolume(Number(e.target.value))}
              className="w-full accent-blue-500 h-1.5 bg-[var(--theme-border)] rounded-lg cursor-pointer"
            />
          </div>

          {/* Local Microphone Gain */}
          <div className="space-y-2 p-3.5 rounded-xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)]">
            <div className="flex justify-between items-center">
              <span className="font-bold flex items-center gap-2 text-[var(--theme-text-primary)]">
                <Mic className="w-4 h-4 text-emerald-400" /> {isAr ? 'قوة التقاط المايك (Gain)' : 'Microphone Input Gain'}
              </span>
              <span className="font-mono font-bold text-emerald-400">{mixerState.micGain}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              value={mixerState.micGain}
              onChange={(e) => audioMixer.setMicGain(Number(e.target.value))}
              className="w-full accent-emerald-500 h-1.5 bg-[var(--theme-border)] rounded-lg cursor-pointer"
            />
          </div>

          {/* Participant Voice Volume Controls */}
          <div className="space-y-3">
            <h4 className="font-bold text-[11px] uppercase tracking-wider text-[var(--theme-text-muted)] px-1">
              {isAr ? 'التحكم بصوت المشاركين' : 'Participant Voice Controls'} ({remoteParticipants.length})
            </h4>
            {remoteParticipants.length === 0 ? (
              <p className="text-[11px] text-[var(--theme-text-muted)] italic px-1">
                {isAr ? 'لا يوجد مشاركون آخرون في المكالمة.' : 'No other participants in call.'}
              </p>
            ) : (
              remoteParticipants.map((p) => {
                const vol = audioMixer.getParticipantVolume(p.userId);
                const muted = audioMixer.isParticipantMuted(p.userId);

                return (
                  <div
                    key={p.userId}
                    className="p-3 rounded-xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--theme-text-primary)] truncate max-w-[180px]">
                        {p.displayName || p.username}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-accent">{vol}%</span>
                        <button
                          type="button"
                          onClick={() => audioMixer.toggleParticipantMute(p.userId)}
                          className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${
                            muted
                              ? 'bg-red-500/20 text-red-400 border-red-500/30'
                              : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-muted)] border-[var(--theme-border)] hover:text-[var(--theme-text-primary)]'
                          }`}
                          title={muted ? (isAr ? 'إلغاء كتم المشارك' : 'Unmute participant') : (isAr ? 'كتم صوت المشارك' : 'Mute participant voice')}
                        >
                          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={vol}
                      onChange={(e) => audioMixer.setParticipantVolume(p.userId, Number(e.target.value))}
                      className="w-full accent-accent h-1.5 bg-[var(--theme-border)] rounded-lg cursor-pointer"
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* Screen Share Audio Controls */}
          <div className="space-y-3">
            <h4 className="font-bold text-[11px] uppercase tracking-wider text-[var(--theme-text-muted)] px-1">
              {isAr ? 'صوت مشاركة الشاشة' : 'Screen Share Audio'} ({screenShareParticipants.length})
            </h4>
            {screenShareParticipants.length === 0 ? (
              <p className="text-[11px] text-[var(--theme-text-muted)] italic px-1">
                {isAr ? 'لا توجد مشاركات شاشة نشطة.' : 'No active screen shares.'}
              </p>
            ) : (
              screenShareParticipants.map((p) => {
                const vol = audioMixer.getScreenshareVolume(p.userId);
                const muted = audioMixer.isScreenshareMuted(p.userId);

                return (
                  <div
                    key={`ss-${p.userId}`}
                    className="p-3 rounded-xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--theme-text-primary)] flex items-center gap-1.5 truncate max-w-[180px]">
                        <ScreenShare className="w-3.5 h-3.5 text-accent" />
                        {isAr ? `صوت شاشة ${p.displayName || p.username}` : `${p.displayName || p.username}'s Screen Audio`}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-accent">{vol}%</span>
                        <button
                          type="button"
                          onClick={() => audioMixer.toggleScreenshareMute(p.userId)}
                          className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${
                            muted
                              ? 'bg-red-500/20 text-red-400 border-red-500/30'
                              : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-muted)] border-[var(--theme-border)] hover:text-[var(--theme-text-primary)]'
                          }`}
                          title={muted ? (isAr ? 'إلغاء كتم صوت الشاشة' : 'Unmute screen audio') : (isAr ? 'كتم صوت الشاشة' : 'Mute screen audio')}
                        >
                          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={vol}
                      onChange={(e) => audioMixer.setScreenshareVolume(p.userId, Number(e.target.value))}
                      className="w-full accent-accent h-1.5 bg-[var(--theme-border)] rounded-lg cursor-pointer"
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] flex justify-between items-center shrink-0">
          <button
            type="button"
            onClick={() => audioMixer.resetAll()}
            className="px-3 py-1.5 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-secondary)] transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
          >
            <RotateCcw className="w-3.5 h-3.5" /> {isAr ? 'إعادة الضبط الافتراضي' : 'Reset Defaults'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer border-0 shadow-md"
          >
            {isAr ? 'تم' : 'Done'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AudioMixerModal;
