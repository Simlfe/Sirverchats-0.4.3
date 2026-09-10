import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { pbService } from '../pocketbase';
import { User } from '../types';
import { Globe, ShieldAlert, ArrowRight, Upload, Lock, Mail, User as UserIcon, Check } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface AuthScreenProps {
  onAuthSuccess: (user: User) => void;
  lang: 'en' | 'ar';
  t: (key: string) => string;
  toggleLang: () => void;
  serverUrl: string;
  setServerUrl: (url: string) => void;
}

export default function AuthScreen({
  onAuthSuccess,
  lang,
  t,
  toggleLang,
  serverUrl,
  setServerUrl
}: AuthScreenProps) {
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // Forgot password modal states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSentMessage, setForgotSentMessage] = useState<string | null>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatar(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!username.trim() || !password) {
      setError('Please fill in all required fields.');
      setLoading(false);
      return;
    }

    if (isSignup) {
      if (password !== confirmPassword) {
        setError(t('wrong_password'));
        setLoading(false);
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        setLoading(false);
        return;
      }
    }

    try {
      if (isSignup) {
        const formData = new FormData();
        formData.append('username', username.trim().toLowerCase());
        formData.append('email', email.trim());
        formData.append('password', password);
        formData.append('passwordConfirm', confirmPassword);
        formData.append('display_name', (displayName.trim() || username.trim()));
        formData.append('status', 'online');
        formData.append('role', 'user');
        
        if (avatar) {
          formData.append('avatar', avatar);
        }

        await pbService.signup(formData);
        const loggedUser = await pbService.login(username.trim(), password);
        onAuthSuccess(loggedUser);
      } else {
        const loggedUser = await pbService.login(username.trim(), password);
        onAuthSuccess(loggedUser);
      }
    } catch (err: any) {
      console.error('Auth submit error:', err);

      // Extract specific field errors if available
      const fieldErrors = err?.data?.data;
      let detailedMsg = '';
      if (fieldErrors && typeof fieldErrors === 'object') {
        const firstField = Object.keys(fieldErrors)[0];
        if (firstField && fieldErrors[firstField]?.message) {
          detailedMsg = `${firstField}: ${fieldErrors[firstField].message}`;
        }
      }

      const rawMsg = err?.data?.message || err?.message || '';
      if (detailedMsg) {
        setError(detailedMsg);
      } else if (
        rawMsg.toLowerCase().includes('failed to authenticate') ||
        rawMsg.toLowerCase().includes('invalid login credentials') ||
        err?.status === 400 ||
        err?.status === 401
      ) {
        setError(
          lang === 'ar'
            ? 'اسم المستخدم/البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق من البيانات والمحاولة مجدداً.'
            : 'Invalid username/email or password. Please verify your credentials and try again.'
        );
      } else if (err?.status === 0 || rawMsg.toLowerCase().includes('failed to fetch') || rawMsg.toLowerCase().includes('network')) {
        setError(
          lang === 'ar'
            ? 'تعذر الاتصال بخادم تسجيل الدخول. يرجى التحقق من اتصالك بالإنترنت.'
            : 'Unable to connect to the authentication server. Please check your network connection.'
        );
      } else {
        setError(rawMsg || (lang === 'ar' ? 'فشل تسجيل الدخول. يرجى المحاولة لاحقاً.' : 'Authentication failed. Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full min-h-full w-full overflow-y-auto bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] flex flex-col justify-between p-6 relative font-sans select-none">
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
          {/* Server Config Drawer */}
          <AnimatePresence>
            {showConfig && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-4 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] flex flex-col gap-3 overflow-hidden glass-panel"
              >
                <div className="text-xs font-bold text-[var(--theme-text-muted)]">{t('server_url')}</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    className="flex-1 bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent transition-all font-mono text-[var(--theme-text-primary)]"
                  />
                  <button
                    onClick={() => {
                      pbService.setServerUrl(serverUrl);
                      setShowConfig(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] font-bold text-xs transition-all shadow-md cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            layout
            className="bg-[var(--theme-bg-card)] rounded-3xl p-8 border border-[var(--theme-border)] shadow-2xl relative glass-panel"
          >
            <div className="text-center mb-6">
              <h2 className="text-3xl font-extrabold tracking-tight text-[var(--theme-text-primary)] mb-2">
                {isSignup ? t('signup') : t('login')}
              </h2>
              <p className="text-xs text-[var(--theme-text-muted)] font-medium">
                {isSignup ? 'Create your Sirver account to begin' : 'Connect seamlessly to your Workspace chat'}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex gap-2.5 items-center">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <AnimatePresence mode="popLayout">
                {isSignup && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex flex-col gap-4"
                  >
                    {/* Display Name */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-[var(--theme-text-muted)]">{t('display_name')}</label>
                      <div className="relative">
                        <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-[var(--theme-text-muted)]" />
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          maxLength={35}
                          placeholder={t('display_name')}
                          className="w-full bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] rounded-2xl pl-10 pr-4 py-2.5 text-sm text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                        />
                      </div>
                    </div>

                    {/* Email */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-[var(--theme-text-muted)]">{t('email')}</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-3 w-4 h-4 text-[var(--theme-text-muted)]" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] rounded-2xl pl-10 pr-4 py-2.5 text-sm text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                        />
                      </div>
                    </div>

                    {/* Avatar Upload */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-[var(--theme-text-muted)]">{t('select_avatar')}</label>
                      <div className="flex items-center gap-4 bg-[var(--theme-bg-tertiary)] p-3 rounded-2xl border border-[var(--theme-border)]">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                          {avatarPreview ? (
                            <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <Upload className="w-5 h-5 text-[var(--theme-text-muted)]" />
                          )}
                        </div>
                        <div className="flex-1">
                          <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 bg-[var(--theme-bg-card)] hover:bg-[var(--theme-bg-tertiary)] text-xs font-bold rounded-xl text-[var(--theme-text-primary)] transition-all border border-[var(--theme-border)]">
                            <Upload className="w-3.5 h-3.5 text-accent" />
                            <span>Browse File</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleAvatarChange}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Username/Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--theme-text-muted)]">
                  {isSignup ? t('username') : t('username_or_email')}
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-[var(--theme-text-muted)]" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    maxLength={35}
                    placeholder={isSignup ? t('username') : (t('username_or_email') || (lang === 'ar' ? 'اسم المستخدم أو البريد الإلكتروني' : 'Username or Email'))}
                    className="w-full bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] rounded-2xl pl-10 pr-4 py-2.5 text-sm text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-[var(--theme-text-muted)]">{t('password')}</label>
                  {!isSignup && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotModal(true);
                        setForgotSentMessage(null);
                        setForgotEmail(email || (username.includes('@') ? username : ''));
                      }}
                      className="text-xs text-accent hover:underline font-bold bg-transparent border-0 cursor-pointer"
                    >
                      {t('forgot_password') || 'Forgot Password?'}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-[var(--theme-text-muted)]" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] rounded-2xl pl-10 pr-4 py-2.5 text-sm text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    required
                  />
                </div>
              </div>

              {/* Password Confirm (Signup Only) */}
              <AnimatePresence>
                {isSignup && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden flex flex-col gap-1.5"
                  >
                    <label className="text-xs font-bold text-[var(--theme-text-muted)]">{t('password_confirm')}</label>
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
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit Buttons */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full mt-2 btn-accent bg-accent hover:opacity-95 active:opacity-90 disabled:opacity-50 text-[var(--theme-accent-contrast,#000000)] font-extrabold rounded-2xl py-3.5 text-sm shadow-lg shadow-accent/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-[var(--theme-accent-contrast,#000000)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="text-[var(--theme-accent-contrast,#000000)] font-extrabold">{isSignup ? t('signup') : t('login')}</span>
                    <ArrowRight className="w-4 h-4 text-[var(--theme-accent-contrast,#000000)]" />
                  </>
                )}
              </motion.button>

              {/* Toggle switch */}
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignup(!isSignup);
                    setError(null);
                  }}
                  className="text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-all bg-transparent border-0 cursor-pointer font-bold"
                >
                  {isSignup ? t('already_have_account') : t('signup')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </div>

      {/* Footer information */}
      <div className="w-full text-center text-[11px] text-[var(--theme-text-muted)] z-10 flex flex-col sm:flex-row gap-2 justify-between max-w-6xl mx-auto border-t border-[var(--theme-border)] pt-4">
        <span>© 2026 Sirver Platform. Responsive Web & Native Cross-Platform Client wrappers ready.</span>
        <span className="font-mono">Sirver v3.0.4 (Expressive Glass Edition)</span>
      </div>

      {/* Forgot Password Modal */}
      <AnimatePresence>
        {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[var(--theme-bg-card)] border border-[var(--theme-border)] rounded-3xl p-6 shadow-2xl glass-panel relative"
            >
              <h3 className="text-xl font-extrabold text-[var(--theme-text-primary)] mb-2">
                {t('reset_password') || 'Reset Password'}
              </h3>
              <p className="text-xs text-[var(--theme-text-muted)] mb-4 leading-relaxed">
                {lang === 'ar'
                  ? 'أدخل بريدك الإلكتروني لإرسال رابط إعادة تعيين كلمة المرور.'
                  : 'Enter your email address to receive a password reset link.'}
              </p>

              {forgotSentMessage ? (
                <div className="flex flex-col gap-4">
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-semibold leading-relaxed">
                    {forgotSentMessage}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotModal(false);
                      setForgotSentMessage(null);
                    }}
                    className="w-full py-3 rounded-2xl bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] text-xs font-bold border border-[var(--theme-border)] cursor-pointer transition-all"
                  >
                    {lang === 'ar' ? 'إغلاق' : 'Close'}
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!forgotEmail.trim()) return;
                    setForgotLoading(true);
                    try {
                      await pbService.requestPasswordReset(forgotEmail.trim());
                    } catch (err) {
                      // Silently ignore to prevent revealing registered email existence
                    } finally {
                      setForgotLoading(false);
                      setForgotSentMessage(
                        'If an account exists for this email, a password reset link has been sent.'
                      );
                    }
                  }}
                  className="flex flex-col gap-4"
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[var(--theme-text-muted)]">
                      {t('email') || 'Email Address'}
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 w-4 h-4 text-[var(--theme-text-muted)]" />
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] rounded-2xl pl-10 pr-4 py-2.5 text-sm text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2.5 mt-2">
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      className="px-4 py-2.5 rounded-2xl bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-xs font-bold transition-all border border-[var(--theme-border)] cursor-pointer"
                    >
                      {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading || !forgotEmail.trim()}
                      className="px-5 py-2.5 rounded-2xl bg-accent hover:opacity-95 text-[var(--theme-accent-contrast,#000000)] text-xs font-extrabold shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
                    >
                      {forgotLoading ? (
                        <div className="w-4 h-4 border-2 border-[var(--theme-accent-contrast,#000000)] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span>{lang === 'ar' ? 'إرسال رابط التعيين' : 'Send Reset Link'}</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
