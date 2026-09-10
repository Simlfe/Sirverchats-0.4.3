import React, { useState } from 'react';
import { pbService } from '../pocketbase';
import { X, Plus, Upload, Save, Lock } from 'lucide-react';
import { Server } from '../types';
import { setServerPassword } from '../lib/serverPassword';

interface CreateServerModalProps {
  onClose: () => void;
  onServerCreated: (server: Server) => void;
  t: (key: string) => string;
  theme?: string;
}

export default function CreateServerModal({ onClose, onServerCreated, t, theme }: CreateServerModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [icon, setIcon] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [banner, setBanner] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getThemeClasses = (themeName?: string) => {
    let btnColor = 'bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)]';
    let focusColor = 'focus:border-accent';
    let cardBg = 'bg-[var(--theme-bg-card)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] shadow-xl';
    let inputBg = 'bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-[var(--theme-text-primary)]';
    let textMuted = 'text-[var(--theme-text-secondary)]';
    let textTitle = 'text-[var(--theme-text-primary)]';
    let hoverBg = 'hover:bg-[var(--theme-bg-tertiary)]';

    return { btnColor, focusColor, cardBg, inputBg, textMuted, textTitle, hoverBg };
  };

  const tc = getThemeClasses(theme);

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIcon(file);
      setIconPreview(URL.createObjectURL(file));
    }
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setBanner(file);
      setBannerPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const finalDescription = setServerPassword(description.trim(), password.trim() || undefined);
      const server = await pbService.createServer(name.trim(), finalDescription, icon || undefined);
      
      // If banner uploaded, update server record
      if (banner && server.id) {
        const formData = new FormData();
        formData.append('banner', banner);
        await pbService.getPbInstance().collection('servers').update(server.id, formData);
        const refreshed = await pbService.getPbInstance().collection('servers').getOne(server.id);
        onServerCreated(refreshed as any as Server);
      } else {
        onServerCreated(server);
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to create new server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 select-none">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl flex flex-col p-6 ${tc.cardBg}`}>
        <div className="flex justify-between items-center mb-5">
          <h3 className={`font-bold text-base ${tc.textTitle}`}>{t('create_server')}</h3>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-all cursor-pointer border-0 ${tc.hoverBg} text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Banner upload */}
          <div className="flex flex-col gap-1.5">
            <label className={`text-xs font-bold ${tc.textMuted}`}>Server Banner (Optional)</label>
            <div className={`h-24 rounded-2xl flex items-center justify-center overflow-hidden relative border group ${tc.inputBg}`}>
              {bannerPreview ? (
                <img src={bannerPreview} alt="Server banner preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-xs text-[var(--theme-text-muted)] font-bold flex items-center gap-1.5">
                  <Upload className="w-4 h-4" />
                  <span>Upload Banner Image</span>
                </div>
              )}
              <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold cursor-pointer transition-all">
                <span>Choose Banner</span>
                <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
              </label>
            </div>
          </div>

          {/* Icon upload */}
          <div className="flex flex-col items-center gap-2 mb-2">
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden relative border ${tc.inputBg}`}>
              {iconPreview ? (
                <img src={iconPreview} alt="Server icon preview" className="w-full h-full object-cover" />
              ) : (
                <Plus className="w-6 h-6 text-[var(--theme-text-muted)]" />
              )}
            </div>
            <label className={`cursor-pointer inline-flex items-center gap-1 px-3 py-1 text-[10px] font-bold rounded-lg transition-all border border-[var(--theme-border)] ${tc.inputBg}`}>
              <Upload className="w-3 h-3" />
              <span>Choose Icon</span>
              <input type="file" accept="image/*" onChange={handleIconChange} className="hidden" />
            </label>
          </div>

          {/* Name input */}
          <div className="flex flex-col gap-1.5">
            <label className={`text-xs font-bold ${tc.textMuted}`}>{t('server_name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={35}
              placeholder="My Awesome Server"
              className={`w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all font-medium border ${tc.inputBg} ${tc.focusColor}`}
              required
            />
          </div>

          {/* Description input */}
          <div className="flex flex-col gap-1.5">
            <label className={`text-xs font-bold ${tc.textMuted}`}>{t('server_description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={150}
              placeholder="What is this server about?"
              rows={2}
              className={`w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all font-medium resize-none border ${tc.inputBg} ${tc.focusColor}`}
            />
          </div>

          {/* Password input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className={`text-xs font-bold flex items-center gap-1 ${tc.textMuted}`}>
                <Lock className="w-3 h-3 text-[var(--theme-text-muted)]" />
                <span>Password (Optional)</span>
              </label>
              <span className="text-[10px] text-amber-500 font-bold font-mono">Locks Server</span>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave empty for public access"
              className={`w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all font-medium border ${tc.inputBg} ${tc.focusColor}`}
            />
          </div>

          <div className={`flex justify-end gap-3 mt-4 border-t pt-4 border-[var(--theme-border)]`}>
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${tc.hoverBg} ${tc.textMuted}`}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className={`px-5 py-2.5 rounded-xl disabled:opacity-50 text-xs font-bold transition-all shadow-lg flex items-center gap-1.5 cursor-pointer border-0 ${tc.btnColor}`}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Server</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
