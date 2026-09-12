import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  CheckCircle,
  Download,
  AlertTriangle,
  Radio,
  Clock,
  ShieldCheck,
  FileText,
  Sparkles,
  ArrowRight,
  HardDrive,
  Cpu,
  Zap,
  RotateCcw,
  GitBranch,
  FolderGit2,
  Globe
} from 'lucide-react';
import { UserSettings, formatBytes } from '../lib/userSettings';
import { updateService, UpdateState, CURRENT_APP_VERSION } from '../services/updateService';
import { isTauriEnvironment } from '../lib/nativePlatform';
import { liveShellService } from '../services/liveShellService';

interface UpdatesTabContentProps {
  lang: 'en' | 'ar';
  userSettings: UserSettings;
  onUpdateUserSettings: (newSettings: UserSettings) => void;
  updatePartialSettings: (section: keyof UserSettings, updates: any) => void;
  isAdmin?: boolean;
}

export default function UpdatesTabContent({
  lang,
  userSettings,
  updatePartialSettings,
  isAdmin = false,
}: UpdatesTabContentProps) {
  const [updateState, setUpdateState] = useState<UpdateState>(() => updateService.getState());

  useEffect(() => {
    const unsubscribe = updateService.subscribe((state) => {
      setUpdateState(state);
    });
    return unsubscribe;
  }, []);

  const [isTestingDoubleCheck, setIsTestingDoubleCheck] = useState(false);
  const [liveShellStatus, setLiveShellStatus] = useState(() => liveShellService.getStatus());
  const [isTestingLiveShell, setIsTestingLiveShell] = useState(false);
  const [liveShellFeedback, setLiveShellFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestLiveShell = async () => {
    setIsTestingLiveShell(true);
    setLiveShellFeedback(null);
    try {
      const url = userSettings.updates?.liveWebUrl || 'https://app.sirverdata.top';
      liveShellService.setLiveUrl(url);
      const res = await fetch(`${url}/versions.json?_t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(2500),
      }).catch(() => null);

      if (res && res.ok) {
        setLiveShellFeedback({
          success: true,
          message: lang === 'ar' ? 'تم الاتصال بنجاح! خادم الويب المباشر جاهز ويعمل بنسخته الأحدث.' : 'Connected successfully! Live web server is active and serving the newest web build.',
        });
      } else {
        setLiveShellFeedback({
          success: false,
          message: lang === 'ar' ? `تعذر الاتصال بخادم الويب (${res?.status || 'لا يوجد استجابة'}). التطبيق سيعمل بالنسخة المحلية المرفقة بأمان.` : `Could not reach live web server (${res?.status || 'No response'}). App will safely run local bundled version.`,
        });
      }
    } catch (e: any) {
      setLiveShellFeedback({
        success: false,
        message: lang === 'ar' ? 'فشل الاتصال بخادم الويب المباشر. تأكد من إعداد المسار وتوجيهه.' : 'Connection test failed. Verify web server path and Cloudflare routing.',
      });
    } finally {
      setIsTestingLiveShell(false);
      setLiveShellStatus(liveShellService.getStatus());
    }
  };
  const [doubleCheckFeedback, setDoubleCheckFeedback] = useState<{
    tested: boolean;
    repoFound: boolean;
    versionFound: boolean;
    matchingRepos?: string[];
    foundVersions?: string[];
    highestVersion?: string;
    action?: string;
  } | null>(null);

  const handleRunDoubleCheckTest = async () => {
    setIsTestingDoubleCheck(true);
    setDoubleCheckFeedback(null);
    try {
      const owner = userSettings.updates?.githubOwner || 'Simlfe';
      const prefix = userSettings.updates?.repoPrefix || 'sirverchats';
      const res = await updateService.checkGitHubReposAndVersions(owner, prefix);
      if (res) {
        setDoubleCheckFeedback({
          tested: true,
          repoFound: true,
          versionFound: true,
          matchingRepos: [res.repoName],
          foundVersions: res.rawList,
          highestVersion: res.newVersion,
          action: res.isRollback ? 'rollback' : res.hasUpdate ? 'update' : 'up_to_date',
        });
      } else {
        setDoubleCheckFeedback({
          tested: true,
          repoFound: true,
          versionFound: false,
        });
      }
    } catch {
      setDoubleCheckFeedback({
        tested: true,
        repoFound: false,
        versionFound: false,
      });
    } finally {
      setIsTestingDoubleCheck(false);
    }
  };

  const handleManualCheck = () => {
    updateService.checkForUpdates(true);
  };

  const handleStartDownload = () => {
    updateService.startDownload();
  };

  const handleApplyRestart = () => {
    updateService.installUpdate();
  };

  const currentChannel = userSettings.updates?.channel || 'stable';
  const autoCheck = userSettings.updates?.autoCheck ?? true;
  const autoDownload = userSettings.updates?.autoDownload ?? true;
  const installOnNextRestart = userSettings.updates?.installOnNextRestart ?? true;

  const handleChannelChange = (newChannel: 'stable' | 'beta' | 'nightly') => {
    updatePartialSettings('updates', { channel: newChannel });
    setTimeout(() => {
      updateService.checkForUpdates(true);
    }, 200);
  };

  const formatLastChecked = (iso: string | null): string => {
    if (!iso) return lang === 'ar' ? 'لم يتم التحقق بعد' : 'Never checked';
    try {
      const d = new Date(iso);
      return d.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  const isDesktop = isTauriEnvironment();

  return (
    <div className="space-y-6 text-[var(--theme-text-primary)]">
      {/* Header Info Banner */}
      <div className="p-5 rounded-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
              <Zap className={`w-6 h-6 ${updateState.status === 'checking' ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-[var(--theme-text-primary)]">
                  SirverData v{updateState.currentVersion || CURRENT_APP_VERSION}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-accent/20 text-accent border border-accent/30">
                  {updateState.platform}
                </span>
                {isDesktop && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {lang === 'ar' ? 'محدث داخلي مدمج' : 'Native In-Place Updater'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--theme-text-muted)] flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {lang === 'ar' ? 'آخر تحقق:' : 'Last checked:'} {formatLastChecked(updateState.lastCheckTime)}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={handleManualCheck}
            disabled={updateState.status === 'checking'}
            className="px-4 py-2.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-accent/20 border-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${updateState.status === 'checking' ? 'animate-spin' : ''}`} />
            <span>
              {updateState.status === 'checking'
                ? lang === 'ar'
                  ? 'جاري التحقق...'
                  : 'Checking...'
                : lang === 'ar'
                ? 'التحقق من وجود تحديثات'
                : 'Check for Updates'}
            </span>
          </button>
        </div>

        {/* Current Status Box */}
        <div className="pt-3 border-t border-[var(--theme-border)]">
          {updateState.status === 'up_to_date' && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-3 text-xs font-bold">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>
                {lang === 'ar'
                  ? 'تطبيق SirverData محدث داخلياً لأحدث إصدار مستقر!'
                  : 'SirverData is up to date with the latest release.'}
              </span>
            </div>
          )}

          {updateState.status === 'checking' && (
            <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center gap-3 text-xs font-bold">
              <RefreshCw className="w-5 h-5 animate-spin shrink-0" />
              <span>
                {lang === 'ar'
                  ? 'جاري الاتصال بقناة التحديثات والتحقق من الإصدارات الجديدة...'
                  : 'Connecting to update channels and verifying releases...'}
              </span>
            </div>
          )}

          {updateState.status === 'ready_to_restart' && (
            <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-bold shadow-md">
              <div className="flex items-center gap-2.5">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-sm font-extrabold text-emerald-400">
                    {lang === 'ar'
                      ? 'تم تحميل وتثبيت التحديث بنجاح داخلياً!'
                      : 'Internal Update Downloaded & Applied In-Place!'}
                  </div>
                  <div className="text-[11px] font-normal text-emerald-300/80 mt-0.5">
                    {lang === 'ar'
                      ? 'لا حاجة لتشغيل أي ملف تثبيت. انقر على الزر لإعادة تشغيل التطبيق بالنسخة الجديدة فوراً.'
                      : 'Zero setup files required. Click to relaunch the app directly into the new version.'}
                  </div>
                </div>
              </div>
              <button
                onClick={handleApplyRestart}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/30 border-0 shrink-0"
              >
                <ArrowRight className="w-4 h-4" />
                <span>{lang === 'ar' ? 'إعادة التشغيل الآن' : 'Restart App Now'}</span>
              </button>
            </div>
          )}

          {updateState.status === 'installing' && (
            <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center gap-3 text-xs font-bold">
              <RefreshCw className="w-5 h-5 animate-spin shrink-0" />
              <span>
                {lang === 'ar'
                  ? 'جاري إعادة تشغيل التطبيق بالنسخة المحدثة...'
                  : 'Relaunching application with updated version...'}
              </span>
            </div>
          )}

          {updateState.status === 'error' && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex flex-col gap-2 text-xs">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{lang === 'ar' ? 'انقطع تنزيل أو فحص التحديثات' : 'Update Operation Interrupted'}</span>
              </div>
              <p className="text-[11px] opacity-90 leading-relaxed">{updateState.errorMessage}</p>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => updateService.retryOrResumeDownload()}
                  className="px-3 py-1.5 rounded-lg bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] font-bold text-[11px] transition-all cursor-pointer border-0 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'متابعة / إعادة المحاولة' : 'Resume / Retry'}</span>
                </button>
                <button
                  onClick={() => updateService.cancelOrResetDownload()}
                  className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-[11px] transition-all cursor-pointer border-0 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'إعادة ضبط' : 'Reset'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Internal In-Place Auto-Updater Card */}
      <div className="p-5 rounded-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-[var(--theme-text-primary)] flex items-center gap-2">
                <span>{lang === 'ar' ? 'نظام التحديث الداخلي المستمر' : 'Continuous In-Place Auto-Updater'}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {lang === 'ar' ? 'بدون إعادة تثبيت' : 'Zero Re-installation'}
                </span>
              </h4>
              <p className="text-xs text-[var(--theme-text-muted)] mt-1 max-w-2xl leading-relaxed">
                {lang === 'ar'
                  ? 'تم تجهيز SirverData بمحدث ذاتي مدمج. بعد تثبيت التطبيق لأول مرة عبر حزمة التثبيت، تُسلَّم جميع التحديثات اللاحقة وتُثبَّت داخلياً في مكانها تلقائياً دون الحاجة لتحميل ملفات exe أو msi أو إجراء أي خطوات يدوية.'
                  : 'SirverData features a native internal updater. After initial setup, all future updates are streamed, verified, and replaced in-place internally. You never have to manually download or execute another installer file.'}
              </p>
            </div>
          </div>
        </div>

        {/* Available Update Details */}
        {updateState.status === 'available' && (
          <div className={`p-4 rounded-xl border ${updateState.isRollback ? 'bg-amber-500/5 border-amber-500/40' : 'bg-[var(--theme-bg-tertiary)] border-accent/40'} space-y-3`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {updateState.isRollback ? (
                  <RotateCcw className="w-5 h-5 text-amber-400" />
                ) : (
                  <Sparkles className="w-5 h-5 text-accent" />
                )}
                <div>
                  <span className="text-sm font-extrabold text-[var(--theme-text-primary)] block">
                    {updateState.isRollback
                      ? (lang === 'ar' ? 'استعادة إصدار سابق آمن:' : 'Safe Rollback Available:')
                      : (lang === 'ar' ? 'إصدار جديد متاح:' : 'New Version Available:')}{' '}
                    v{updateState.newVersion}
                  </span>
                  {isAdmin && updateState.sourceRepo && (
                    <span className="text-[10px] text-[var(--theme-text-muted)] block">
                      {lang === 'ar' ? 'من مستودع:' : 'From repo:'} {updateState.sourceRepo}
                    </span>
                  )}
                  {updateState.totalBytes > 0 && (
                    <span className="text-[10px] text-[var(--theme-text-muted)]">
                      {lang === 'ar' ? 'حجم التحديث:' : 'Update Size:'} {formatBytes(updateState.totalBytes)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={handleStartDownload}
                className={`px-4 py-2 rounded-xl ${updateState.isRollback ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)]'} font-extrabold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-lg border-0`}
              >
                {updateState.isRollback ? <RotateCcw className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                <span>
                  {updateState.isRollback
                    ? (lang === 'ar' ? 'استرجاع الإصدار السابق' : 'Rollback & Apply')
                    : (lang === 'ar' ? 'تحديث وتطبيق داخلياً' : 'Download & Apply Internally')}
                </span>
              </button>
            </div>

            {updateState.releaseNotes && (
              <div className="p-3 rounded-lg bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-muted)] leading-relaxed">
                <div className="font-bold text-[var(--theme-text-primary)] mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-accent" />
                  <span>{lang === 'ar' ? 'ملاحظات الإصدار:' : 'Release Notes:'}</span>
                </div>
                <p className="text-[11px] whitespace-pre-wrap">
                  {isAdmin
                    ? updateState.releaseNotes
                    : updateState.releaseNotes
                        .replace(/\s*\(?from repo\s*['"][^'"]*['"]\)?/gi, '')
                        .replace(/\s*\(?from repository\s*['"][^'"]*['"]\)?/gi, '')
                        .replace(/\s*detected from repository\s*['"][^'"]*['"]/gi, 'ready to install')
                        .replace(/\s*من مستودع:\s*\S+/gi, '')
                        .replace(/repository|repo/gi, 'release channel')
                        .replace(/مستودع/gi, 'قناة الإصدار')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Live In-Place Download Progress */}
        {updateState.status === 'downloading' && (
          <div className="space-y-3 p-4 rounded-xl bg-[var(--theme-bg-tertiary)] border border-accent/30 text-xs">
            <div className="flex items-center justify-between font-bold">
              <span className="text-[var(--theme-text-primary)] flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                <span>
                  {lang === 'ar'
                    ? 'جاري تنزيل التحديث واستبدال الحزمة داخلياً في مكانها...'
                    : 'Streaming internal update and applying in-place...'}
                </span>
              </span>
              <span className="text-accent font-mono">
                {updateState.downloadProgressPercent}%{' '}
                {updateState.totalBytes > 0 && `(${formatBytes(updateState.downloadedBytes)} / ${formatBytes(updateState.totalBytes)})`}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-[var(--theme-bg-card)] overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(5, updateState.downloadProgressPercent)}%` }}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-[var(--theme-text-muted)]">
                {lang === 'ar'
                  ? 'يتم تطبيق الملفات وتجهيزها مباشرة داخل مسار التطبيق المثبت بأمان تام.'
                  : 'Files are being replaced directly within the app directory.'}
              </p>
              <button
                onClick={() => updateService.cancelOrResetDownload()}
                className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 font-bold text-[10px] flex items-center gap-1 transition-all border-0 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{lang === 'ar' ? 'إلغاء / إعادة ضبط' : 'Cancel / Reset'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Release Channel Selector */}
      <div className="p-5 rounded-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] space-y-3">
        <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-accent">
          <Radio className="w-4 h-4" />
          <span>{lang === 'ar' ? 'قناة التحديثات (Release Channel)' : 'Release Channel'}</span>
        </label>
        <p className="text-xs text-[var(--theme-text-muted)]">
          {lang === 'ar'
            ? 'حدد نوع التحديثات التي ترغب في استلامها داخلياً عبر النظام.'
            : 'Select which update release branch you wish to subscribe to.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {[
            {
              id: 'stable',
              name: lang === 'ar' ? 'المستقر (Stable)' : 'Stable Channel',
              desc: lang === 'ar' ? 'مستقر ومختبر بالكامل' : 'Fully tested & production ready',
            },
            {
              id: 'beta',
              name: lang === 'ar' ? 'بيتا (Beta)' : 'Beta Channel',
              desc: lang === 'ar' ? 'تحديثات تجريبية قبل الإطلاق' : 'Early access to upcoming features',
            },
            {
              id: 'nightly',
              name: lang === 'ar' ? 'نايتلي (Nightly)' : 'Nightly Channel',
              desc: lang === 'ar' ? 'إصدارات المطورين اليومية' : 'Bleeding edge daily developer builds',
            },
          ].map((ch) => {
            const isSel = currentChannel === ch.id;
            return (
              <button
                key={ch.id}
                onClick={() => handleChannelChange(ch.id as 'stable' | 'beta' | 'nightly')}
                className={`p-3.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                  isSel
                    ? 'border-accent bg-accent/10 ring-2 ring-accent/40 shadow-sm'
                    : 'border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-secondary)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">{ch.name}</span>
                  {isSel && <CheckCircle className="w-4 h-4 text-accent" />}
                </div>
                <span className="text-[10px] text-[var(--theme-text-muted)]">{ch.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Automatic Updates Preferences */}
      <div className="p-5 rounded-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] space-y-4">
        <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-accent">
          <HardDrive className="w-4 h-4" />
          <span>{lang === 'ar' ? 'خيارات التحديث التلقائي الداخلي' : 'Internal Auto-Update Preferences'}</span>
        </label>

        <div className="space-y-3">
          {/* Option 1: Auto Check */}
          <label className="flex items-center justify-between p-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] cursor-pointer hover:bg-[var(--theme-bg-secondary)] transition-all">
            <div className="space-y-0.5">
              <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                {lang === 'ar' ? 'التحقق التلقائي من التحديثات عند التشغيل' : 'Check for updates automatically on startup'}
              </span>
              <p className="text-[10px] text-[var(--theme-text-muted)]">
                {lang === 'ar'
                  ? 'يبدأ فحص التحديثات في الخلفية فور تشغيل التطبيق بدون إبطاء واجهة المستخدم.'
                  : 'Checks for updates asynchronously in background on launch without blocking application startup.'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoCheck}
              onChange={(e) => updatePartialSettings('updates', { autoCheck: e.target.checked })}
              className="w-4 h-4 accent-accent rounded cursor-pointer shrink-0"
            />
          </label>

          {/* Option 2: Auto Download & Apply */}
          <label className="flex items-center justify-between p-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] cursor-pointer hover:bg-[var(--theme-bg-secondary)] transition-all">
            <div className="space-y-0.5">
              <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                {lang === 'ar' ? 'تنزيل وتثبيت التحديثات داخلياً في الخلفية' : 'Download and apply updates in the background'}
              </span>
              <p className="text-[10px] text-[var(--theme-text-muted)]">
                {lang === 'ar'
                  ? 'يقوم المحدث الداخلي باستبدال الملفات تلقائياً في صمت وإشعارك عندما تصبح جاهزة لإعادة التشغيل.'
                  : 'Silently downloads update packages and prepares in-place replacement ready for restart.'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoDownload}
              onChange={(e) => updatePartialSettings('updates', { autoDownload: e.target.checked })}
              className="w-4 h-4 accent-accent rounded cursor-pointer shrink-0"
            />
          </label>

          {/* Option 3: Install on restart */}
          <label className="flex items-center justify-between p-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] cursor-pointer hover:bg-[var(--theme-bg-secondary)] transition-all">
            <div className="space-y-0.5">
              <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                {lang === 'ar' ? 'تطبيق التحديث تلقائياً عند إعادة تشغيل التطبيق' : 'Apply update on next restart'}
              </span>
              <p className="text-[10px] text-[var(--theme-text-muted)]">
                {lang === 'ar'
                  ? 'عند توفر تحديث مكتمل داخلياً، سيعمل الإصدار الجديد مباشرة في المرة القادمة دون أي مطالبات.'
                  : 'Runs the updated version automatically on your next application launch.'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={installOnNextRestart}
              onChange={(e) => updatePartialSettings('updates', { installOnNextRestart: e.target.checked })}
              className="w-4 h-4 accent-accent rounded cursor-pointer shrink-0"
            />
          </label>
        </div>
      </div>

      {/* Live Web Shell diagnostic (Tauri clients keep the bundled UI) */}
      <div className="p-5 rounded-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-accent">
            <Globe className="w-4 h-4" />
            <span>{lang === 'ar' ? 'فحص اتصال الويب المباشر' : 'Live Web Connection Check'}</span>
          </label>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25">
            {liveShellStatus.isLiveWeb
              ? (lang === 'ar' ? 'متصل بالويب المباشر' : 'Live Web Connected')
              : liveShellStatus.isTauri
              ? (lang === 'ar' ? 'نسخة محلية احتياطية' : 'Local Offline Standby')
              : (lang === 'ar' ? 'متصفح ويب مباشر' : 'Web Browser')}
          </span>
        </div>

        <p className="text-[11px] text-[var(--theme-text-muted)] leading-relaxed">
          {lang === 'ar'
            ? 'تستخدم تطبيقات Tauri نسخة React المرفقة محلياً دائماً. يمكنك استخدام الفحص أدناه للتحقق من توفر موقع الويب المباشر بدون تبديل واجهة التطبيق.'
            : 'Tauri apps always use the bundled React UI. Use the check below only to verify that the public web site is reachable; it never replaces the native shell.'}
        </p>

        {/* Toggle Live Web Shell */}
        <label className="flex items-center justify-between p-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] cursor-pointer hover:bg-[var(--theme-bg-secondary)] transition-all">
          <div className="space-y-0.5">
            <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">
              {lang === 'ar' ? 'تفعيل فحص اتصال الويب المباشر' : 'Enable Live Web Connection Check'}
            </span>
            <p className="text-[10px] text-[var(--theme-text-muted)]">
              {lang === 'ar'
                ? 'لا يغيّر هذا الخيار واجهة Tauri المحلية؛ يستخدم فقط لحفظ تفضيل الفحص.'
                : 'This preference does not replace the local Tauri UI; it only controls the diagnostic setting.'}
            </p>
          </div>
          <input
            type="checkbox"
            checked={userSettings.updates?.enableLiveWebShell ?? true}
            onChange={(e) => updatePartialSettings('updates', { enableLiveWebShell: e.target.checked })}
            className="w-4 h-4 accent-accent rounded cursor-pointer shrink-0"
          />
        </label>

        {/* Domain input & test button */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-[var(--theme-text-muted)] flex items-center gap-1">
            <Globe className="w-3.5 h-3.5 text-accent" />
            <span>{lang === 'ar' ? 'رابط خادم الويب المباشر (Live Web URL):' : 'Live Web App Domain / URL:'}</span>
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={userSettings.updates?.liveWebUrl || 'https://app.sirverdata.top'}
              onChange={(e) => updatePartialSettings('updates', { liveWebUrl: e.target.value.trim() })}
              placeholder="https://app.sirverdata.top"
              className="flex-1 px-3 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] font-mono focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleTestLiveShell}
              disabled={isTestingLiveShell}
              className="px-4 py-2 rounded-xl bg-accent hover:opacity-90 disabled:opacity-50 text-[var(--theme-accent-contrast,#ffffff)] font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border-0 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingLiveShell ? 'animate-spin' : ''}`} />
              <span>{lang === 'ar' ? 'فحص الاتصال بخادم الويب' : 'Test Live Web Connection'}</span>
            </button>
          </div>

          {liveShellFeedback && (
            <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${liveShellFeedback.success ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/15 border-amber-500/30 text-amber-300'}`}>
              {liveShellFeedback.success ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
              <span>{liveShellFeedback.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* GitHub Multi-Repo Double Check & Simple 'versions' File Support (Admin Only) */}
      {isAdmin && (
        <div className="p-5 rounded-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] space-y-4">
          <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-accent">
            <GitBranch className="w-4 h-4" />
            <span>{lang === 'ar' ? 'إعدادات مستودعات GitHub والتحقق المزدوج (خاص بالمسؤول)' : 'GitHub Repository Settings & Double-Check (Admin Only)'}</span>
          </label>

          <p className="text-[11px] text-[var(--theme-text-muted)] leading-relaxed">
            {lang === 'ar'
              ? 'يقوم التطبيق أولاً بالتحقق المزدوج: 1) التأكد من وجود المستودع، 2) فحص وجود رقم الإصدار في ملف versions. عند اكتشاف إصدار أحدث يتم التحديث، وإذا تم حذف إصدار تالف من GitHub يتم التراجع تلقائياً.'
              : 'The updater double-checks: 1) Checks if repository is found, 2) Checks if version is found in "versions" file. Rolls back safely if faulty release is removed.'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* GitHub Owner / Username */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[var(--theme-text-muted)] flex items-center gap-1">
                <FolderGit2 className="w-3.5 h-3.5 text-accent" />
                <span>{lang === 'ar' ? 'اسم مستخدم GitHub (Owner):' : 'GitHub Username / Owner:'}</span>
              </label>
              <input
                type="text"
                value={userSettings.updates?.githubOwner || 'Simlfe'}
                onChange={(e) => updatePartialSettings('updates', { githubOwner: e.target.value.trim() })}
                placeholder="Simlfe"
                className="w-full px-3 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] font-mono focus:border-accent focus:outline-none"
              />
            </div>

            {/* Repo Prefix */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[var(--theme-text-muted)] flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5 text-accent" />
                <span>{lang === 'ar' ? 'بادئة اسم المستودع (Repo Prefix):' : 'Repository Prefix:'}</span>
              </label>
              <input
                type="text"
                value={userSettings.updates?.repoPrefix || 'sirverchats'}
                onChange={(e) => updatePartialSettings('updates', { repoPrefix: e.target.value.trim() })}
                placeholder="sirverchats"
                className="w-full px-3 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] font-mono focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Instructions Helper */}
          <div className="p-3 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-[10px] text-[var(--theme-text-muted)] space-y-1">
            <div className="font-bold text-[var(--theme-text-primary)] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-accent" />
              <span>{lang === 'ar' ? 'صيغة ملف versions والتحديثات:' : 'Format of "versions" file & updates:'}</span>
            </div>
            <p className="font-mono text-accent bg-[var(--theme-bg-card)] p-2 rounded-lg border border-[var(--theme-border)] whitespace-pre">
{`1.0
1.0.1
1.0.2`}
            </p>
            <p>
              {lang === 'ar'
                ? 'قاعدة الزيادة: يتم إضافة 0.0.1 لكل إصدار جديد (1.0 ثم 1.0.1 ثم 1.0.2 وهكذا).'
                : 'Version rule: Adds +0.0.1 for every new release (1.0, 1.0.1, 1.0.2, etc.).'}
            </p>
            <div className="pt-2 mt-2 border-t border-[var(--theme-border)] flex items-start gap-1.5 text-amber-400 font-medium">
              <RotateCcw className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {lang === 'ar'
                  ? 'الحماية والتراجع التلقائي (Rollback): إذا أطلقت إصداراً غير مستقر وأردت التراجع، ما عليك سوى حذف المستودع من GitHub وسيتراجع التطبيق تلقائياً لأعلى إصدار مستقر!'
                  : 'Safe Auto-Rollback: If you make a faulty update and delete the repo from GitHub, all users automatically roll back to the highest available stable version!'}
              </span>
            </div>
          </div>

          {/* Live Double-Check Test Action */}
          <div className="pt-2 flex flex-col gap-3">
            <button
              onClick={handleRunDoubleCheckTest}
              disabled={isTestingDoubleCheck}
              className="px-4 py-2.5 rounded-xl bg-accent hover:opacity-90 disabled:opacity-50 text-[var(--theme-accent-contrast,#ffffff)] font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border-0 shadow-md"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingDoubleCheck ? 'animate-spin' : ''}`} />
              <span>
                {lang === 'ar'
                  ? (isTestingDoubleCheck ? 'جارٍ التحقق المزدوج من GitHub...' : 'اختبار التحقق المزدوج الآن (مستودع + إصدار)')
                  : (isTestingDoubleCheck ? 'Testing Double-Check on GitHub...' : 'Test Double-Check Now (Repo + Version)')}
              </span>
            </button>

            {doubleCheckFeedback && (
              <div className="p-3 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[var(--theme-text-primary)]">
                    {lang === 'ar' ? 'نتيجة الفحص المزدوج:' : 'Double-Check Results:'}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${doubleCheckFeedback.versionFound ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {doubleCheckFeedback.versionFound ? (lang === 'ar' ? 'اجتاز الفحص' : 'Passed') : (lang === 'ar' ? 'فشل الفحص' : 'Failed')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--theme-bg-card)] border border-[var(--theme-border)]">
                    {doubleCheckFeedback.repoFound ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                    <span>1. {lang === 'ar' ? 'المستودع (Repo):' : 'Repository:'} <strong>{doubleCheckFeedback.repoFound ? (lang === 'ar' ? 'موجود ومطابق' : 'Found') : (lang === 'ar' ? 'غير موجود' : 'Not Found')}</strong></span>
                  </div>

                  <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--theme-bg-card)] border border-[var(--theme-border)]">
                    {doubleCheckFeedback.versionFound ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                    <span>2. {lang === 'ar' ? 'الإصدار (Version):' : 'Version in File:'} <strong>{doubleCheckFeedback.versionFound ? (lang === 'ar' ? 'مكتشف ومطابق' : 'Found') : (lang === 'ar' ? 'غير موجود' : 'Not Found')}</strong></span>
                  </div>
                </div>

                {doubleCheckFeedback.highestVersion && (
                  <div className="text-[10px] text-[var(--theme-text-muted)] pt-1 border-t border-[var(--theme-border)] flex items-center justify-between">
                    <span>{lang === 'ar' ? 'أعلى إصدار تم اكتشافه:' : 'Highest Version Detected:'} <strong className="text-accent font-mono">v{doubleCheckFeedback.highestVersion}</strong></span>
                    <span>{lang === 'ar' ? 'المستودع المصدر:' : 'Source:'} <strong className="text-[var(--theme-text-primary)] font-mono">{doubleCheckFeedback.matchingRepos?.[0]}</strong></span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
