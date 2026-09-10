import React, { useState } from 'react';
import { User, CustomStatus } from '../types';
import { pbService } from '../pocketbase';
import { Smile, X, Check, Clock, Sparkles } from 'lucide-react';

interface CustomStatusModalProps {
  currentUser: User;
  onClose: () => void;
  onUpdateUser: (u: User) => void;
  lang?: 'en' | 'ar';
}

const PRESET_EMOJIS = ['🎮', '🎧', '💻', '☕', '🔥', '✨', '😴', '📚', '🎯', '🚀', '🍕', '🐱'];

export default function CustomStatusModal({
  currentUser,
  onClose,
  onUpdateUser,
  lang = 'en'
}: CustomStatusModalProps) {
  const currentStatusObj: CustomStatus = typeof currentUser.custom_status === 'object'
    ? currentUser.custom_status || {}
    : (currentUser.custom_status ? (() => { try { return JSON.parse(currentUser.custom_status); } catch { return { text: currentUser.custom_status }; } })() : {});

  const [text, setText] = useState(currentStatusObj.text || '');
  const [emoji, setEmoji] = useState(currentStatusObj.emoji || '💬');
  const [presence, setPresence] = useState<'online' | 'away' | 'dnd' | 'offline'>(currentUser.status || 'online');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    const newStatus: CustomStatus = {
      text: text.trim(),
      emoji,
      activityType: 'custom'
    };

    try {
      const updated = await pbService.updateProfile(currentUser.id, {
        status: presence,
        custom_status: newStatus as any
      });
      // Also cache in local settings
      try {
        localStorage.setItem(`user_custom_status_${currentUser.id}`, JSON.stringify(newStatus));
      } catch (e) {}
      onUpdateUser({ ...currentUser, ...updated, status: presence, custom_status: newStatus });
      onClose();
    } catch (e) {
      console.warn('Failed to update status:', e);
      onClose();
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      const updated = await pbService.updateProfile(currentUser.id, {
        custom_status: null as any
      });
      try {
        localStorage.removeItem(`user_custom_status_${currentUser.id}`);
      } catch (e) {}
      onUpdateUser({ ...currentUser, ...updated, custom_status: undefined });
      onClose();
    } catch (e) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="w-full max-w-md bg-[var(--theme-bg-card)] border border-[var(--theme-border)] rounded-3xl shadow-2xl overflow-hidden p-6 flex flex-col gap-5 text-[var(--theme-text-primary)] animate-in zoom-in-95 duration-150"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <h2 className="text-base font-black">
              {lang === 'ar' ? 'تعيين حالة النشاط المخصصة' : 'Set Custom Status'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer border-0 bg-transparent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Presence Selector */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-[var(--theme-text-secondary)]">
            {lang === 'ar' ? 'حالة التواجد' : 'Online Presence'}
          </span>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'online', labelEn: 'Online', labelAr: 'متصل', color: 'bg-emerald-500' },
              { id: 'away', labelEn: 'Idle', labelAr: 'خامل', color: 'bg-amber-500' },
              { id: 'dnd', labelEn: 'Do Not Disturb', labelAr: 'ممنوع الإزعاج', color: 'bg-rose-500' },
              { id: 'offline', labelEn: 'Invisible', labelAr: 'مخفي', color: 'bg-slate-500' }
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPresence(p.id as any)}
                className={`py-2 px-1.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  presence === p.id
                    ? 'border-accent bg-accent/15 text-[var(--theme-text-primary)] font-bold shadow-xs'
                    : 'border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
              >
                <span className={`w-3 h-3 rounded-full ${p.color}`} />
                <span className="text-[10px] leading-tight text-center truncate w-full">
                  {lang === 'ar' ? p.labelAr : p.labelEn}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Status Text and Emoji */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-[var(--theme-text-secondary)]">
            {lang === 'ar' ? 'ماذا تفعل الآن؟' : "What's on your mind?"}
          </span>
          <div className="flex items-center gap-2 p-2 rounded-2xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]">
            <span className="text-2xl p-1.5 rounded-xl bg-black/10 dark:bg-white/10 shrink-0">{emoji}</span>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={lang === 'ar' ? 'مثال: يلعب ماينكرافت أو يستمع للموسيقى...' : 'e.g. Playing Minecraft, Listening to music...'}
              maxLength={100}
              className="flex-1 bg-transparent text-sm text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none"
            />
            {text && (
              <button
                type="button"
                onClick={() => setText('')}
                className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] p-1 border-0 bg-transparent cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Emoji Preset Chips */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] font-bold text-[var(--theme-text-secondary)] me-1">
            {lang === 'ar' ? 'اختر أيقونة:' : 'Quick emoji:'}
          </span>
          {PRESET_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`p-1.5 rounded-xl text-sm transition-transform cursor-pointer border ${
                emoji === e
                  ? 'border-accent bg-accent/30 ring-2 ring-accent scale-110 text-[var(--theme-text-primary)]'
                  : 'border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] hover:scale-110 text-[var(--theme-text-primary)]'
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--theme-border)]">
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer border-0 bg-transparent"
          >
            {lang === 'ar' ? 'مسح الحالة' : 'Clear Status'}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer border border-[var(--theme-border)]"
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] transition-all cursor-pointer border-0 flex items-center gap-1.5 shadow-lg shadow-accent/20 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{lang === 'ar' ? 'حفظ الحالة' : 'Save Status'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
