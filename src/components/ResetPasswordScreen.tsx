import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { pbService } from '../pocketbase';
import { ShieldAlert, CheckCircle2, Lock, ArrowRight, Globe } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface ResetPasswordScreenProps {
  token: string;
  onComplete: () => void;
  onCancel: () => void;
  lang: 'en' | 'ar';
  t: (key: string) => string;
  toggleLang: () => void;
}

export default function ResetPasswordScreen({
  token,
  onComplete,
  onCancel,
  lang,
  t,
  toggleLang
}: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (success) {
      timer = setTimeout(() => {
        onComplete();
      }, 3500);
    }
    return () => clearTimeout(timer);
  }, [success, onComplete]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password || !confirmPassword) {
      setError(lang === 'ar' ? 'يرجى ملء جميع الحقول المطلوب.' : 'Please fill in all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError(t('wrong_password') || (lang === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match.'));
      return;
    }

    if (password.length < 8) {
      setError(lang === 'ar' ? 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.' : 'Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    try {
      await pbService.confirmPasswordReset(token, password, confirmPassword);
      // Clear sensitive fields immediately
      setPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err: any) {
      console.error('[ResetPasswordScreen] Error confirming password reset:', err);
      const msg = err?.data?.message || err?.message || (lang === 'ar' ? 'فشل إعادة تعيين كلمة المرور. قد يكون الرابط منتهي الصلاحية أو مستخدم بالفعل.' : 'Failed to reset password. The link may be expired or already used.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full min-h-full w-full overflow-y-auto bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] flex flex-col justify-between p-6 relative font-sans select-none">
      {/* Ambient Animated Light Spheres */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-accent/10 rounded-full pointer-events-none animate-pulse" />

      {/* Header bar */}
      <div className="w-full flex justify-between items-center z-10 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-accent flex items-center justify-center shadow-lg shadow-accent/30 transform hover:scale-105 transition-transform">
            <span className="font-mono font-black text-xl text-white">S</span>
          </div>
          <span className="font-black tracking-widest text-2xl text-[var(--theme-text-primary)]">
            SIRVER
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={toggleLang}
            className="px-3.5 py-2 rounded-xl bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-all flex items-center gap-2 border border-[var(--theme-border)] glass-panel cursor-pointer"
          >
            <Globe className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold">{lang === 'en' ? 'العربية' : 'English'}</span>
          </button>
        </div>
      </div>

      {/* Main card */}
      <div className="flex-1 flex items-center justify-center py-12 z-10">
        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--theme-bg-card)] rounded-3xl p-8 border border-[var(--theme-border)] shadow-2xl relative glass-panel"
          >
            {success ? (
              <div className="text-center py-4 flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shadow-inner">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <h2 className="text-2xl font-extrabold text-[var(--theme-text-primary)]">
                  {lang === 'ar' ? 'تم تغيير كلمة المرور بنجاح' : 'Password Reset Successfully'}
                </h2>
                <p className="text-xs text-[var(--theme-text-muted)] max-w-xs leading-relaxed">
                  {lang === 'ar'
                    ? 'تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.'
                    : 'Your password has been changed successfully.'}
                </p>

                <div className="w-full mt-4 flex flex-col gap-2">
                  <button
                    onClick={onComplete}
                    className="w-full btn-accent bg-accent hover:opacity-95 text-[var(--theme-accent-contrast,#000000)] font-extrabold rounded-2xl py-3.5 text-sm shadow-lg shadow-accent/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <span>{t('back_to_login') || 'Go to Login'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-center mb-6">
                  <h2 className="text-3xl font-extrabold tracking-tight text-[var(--theme-text-primary)] mb-2">
                    {t('reset_password') || 'Reset Password'}
                  </h2>
                  <p className="text-xs text-[var(--theme-text-muted)] font-medium">
                    {lang === 'ar'
                      ? 'أدخل كلمة المرور الجديدة لحسابك في Sirver'
                      : 'Enter a new password for your Sirver account'}
                  </p>
                </div>

                {error && (
                  <div className="mb-4 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex gap-2.5 items-center">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  {/* New Password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[var(--theme-text-muted)]">
                      {lang === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'}
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-[var(--theme-text-muted)]" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] rounded-2xl pl-10 pr-4 py-2.5 text-sm text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[var(--theme-text-muted)]">
                      {t('password_confirm') || 'Confirm Password'}
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-[var(--theme-text-muted)]" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] rounded-2xl pl-10 pr-4 py-2.5 text-sm text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                        required
                      />
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex flex-col gap-2 mt-2">
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={loading}
                      className="w-full btn-accent bg-accent hover:opacity-95 active:opacity-90 disabled:opacity-50 text-[var(--theme-accent-contrast,#000000)] font-extrabold rounded-2xl py-3.5 text-sm shadow-lg shadow-accent/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-[var(--theme-accent-contrast,#000000)] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>{t('reset_password') || 'Reset Password'}</span>
                          <ArrowRight className="w-4 h-4 text-[var(--theme-accent-contrast,#000000)]" />
                        </>
                      )}
                    </motion.button>

                    <button
                      type="button"
                      onClick={onCancel}
                      className="w-full py-2.5 rounded-2xl bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-xs font-bold transition-all border border-[var(--theme-border)] cursor-pointer"
                    >
                      {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Footer information */}
      <div className="w-full text-center text-[11px] text-[var(--theme-text-muted)] z-10 flex flex-col sm:flex-row gap-2 justify-between max-w-6xl mx-auto border-t border-[var(--theme-border)] pt-4">
        <span>© 2026 Sirver Platform. Responsive Web & Native Cross-Platform Client wrappers ready.</span>
        <span className="font-mono">Sirver v3.0.4 (Expressive Glass Edition)</span>
      </div>
    </div>
  );
}
