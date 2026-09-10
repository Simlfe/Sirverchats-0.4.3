import React, { useState, useEffect } from 'react';
import {
  Globe,
  Search,
  Plus,
  RotateCcw,
  Check,
  Languages,
  X,
  Trash2,
  Tag,
  Save
} from 'lucide-react';
import {
  Translation,
  defaultTranslations,
  getCachedCustomTextTokens,
  saveCachedCustomTextTokens
} from '../services/localization';
import { pbService } from '../pocketbase';

interface TextTokensManagerTabProps {
  currentUser: any;
  lang: 'ar' | 'en';
}

export const TextTokensManagerTab: React.FC<TextTokensManagerTabProps> = ({ currentUser, lang }) => {
  const isAr = lang === 'ar';
  const isAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'half-admin' ||
    (currentUser as any)?.isAdmin === true ||
    currentUser?.is_admin === true;

  const [textTokensList, setTextTokensList] = useState<Translation[]>(() => getCachedCustomTextTokens());
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // New Token Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newKey, setNewKey] = useState<string>('');
  const [newEn, setNewEn] = useState<string>('');
  const [newAr, setNewAr] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('General');

  // Status message
  const [statusMessage, setStatusMessage] = useState<string>('');

  const categories = ['All', 'Auth', 'Navigation', 'Chat', 'Voice', 'Profile', 'Settings', 'Downloads', 'Updates', 'Music', 'Server', 'ThemeEditor', 'Modals', 'General'];

  // Remote Sync Load
  useEffect(() => {
    let isMounted = true;
    const fetchRemoteTokens = async () => {
      try {
        const records = await pbService.getAdminAppSettings().catch(() => null);
        if (records && records.textTokens && Array.isArray(records.textTokens) && records.textTokens.length > 0) {
          if (isMounted) {
            setTextTokensList(records.textTokens);
            saveCachedCustomTextTokens(records.textTokens);
          }
        }
      } catch (e) {
        console.warn('Failed fetching remote text tokens:', e);
      }
    };
    fetchRemoteTokens();
  }, []);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(''), 3500);
  };

  const handleUpdateTextToken = async (key: string, targetLang: 'en' | 'ar', val: string) => {
    const updated = textTokensList.map((item) => {
      if (item.key === key) {
        return {
          ...item,
          [targetLang]: val,
          translations: {
            en: targetLang === 'en' ? val : (item.translations?.en || item.en),
            ar: targetLang === 'ar' ? val : (item.translations?.ar || item.ar)
          }
        };
      }
      return item;
    });

    setTextTokensList(updated);
    saveCachedCustomTextTokens(updated);

    // Save to PB
    await pbService.saveAdminAppSettings({
      key: 'admin_settings',
      textTokens: updated,
      updatedAt: new Date().toISOString()
    }).catch(() => null);
  };

  const handleRestoreDefaultTranslation = async (key: string, targetLang: 'en' | 'ar') => {
    const defaultObj = defaultTranslations.find((d) => d.key === key);
    if (!defaultObj) return;

    const defaultVal = targetLang === 'en' ? defaultObj.en : defaultObj.ar;

    const updated = textTokensList.map((item) => {
      if (item.key === key) {
        return {
          ...item,
          [targetLang]: defaultVal,
          translations: {
            en: targetLang === 'en' ? defaultVal : (item.translations?.en || item.en),
            ar: targetLang === 'ar' ? defaultVal : (item.translations?.ar || item.ar)
          }
        };
      }
      return item;
    });

    setTextTokensList(updated);
    saveCachedCustomTextTokens(updated);
    showStatus(isAr ? `تمت استعادة النص الافتراضي لـ (${key})` : `Restored default translation for (${key})`);

    await pbService.saveAdminAppSettings({
      key: 'admin_settings',
      textTokens: updated,
      updatedAt: new Date().toISOString()
    }).catch(() => null);
  };

  const handleAddNewToken = async () => {
    if (!newKey.trim() || !newEn.trim() || !newAr.trim()) {
      alert(isAr ? 'يرجى إدخال المفتاح والنصين الإنجليزي والعربي' : 'Please provide Key, English, and Arabic texts');
      return;
    }

    const formattedKey = newKey.trim().toLowerCase().replace(/\s+/g, '_');

    if (textTokensList.some((t) => t.key === formattedKey)) {
      alert(isAr ? 'مفتاح النص هذا موجود بالفعل!' : 'This text token key already exists!');
      return;
    }

    const newToken: Translation = {
      key: formattedKey,
      en: newEn.trim(),
      ar: newAr.trim(),
      category: newCategory,
      translations: {
        en: newEn.trim(),
        ar: newAr.trim()
      }
    };

    const updated = [newToken, ...textTokensList];
    setTextTokensList(updated);
    saveCachedCustomTextTokens(updated);

    setNewKey('');
    setNewEn('');
    setNewAr('');
    setShowAddModal(false);
    showStatus(isAr ? `تم إضافة مفتاح النص (${formattedKey}) بنجاح` : `Added text token (${formattedKey}) successfully`);

    await pbService.saveAdminAppSettings({
      key: 'admin_settings',
      textTokens: updated,
      updatedAt: new Date().toISOString()
    }).catch(() => null);
  };

  const handleDeleteToken = async (key: string) => {
    const updated = textTokensList.filter((t) => t.key !== key);
    setTextTokensList(updated);
    saveCachedCustomTextTokens(updated);
    showStatus(isAr ? `تم حذف المفتاح (${key})` : `Deleted key (${key})`);

    await pbService.saveAdminAppSettings({
      key: 'admin_settings',
      textTokens: updated,
      updatedAt: new Date().toISOString()
    }).catch(() => null);
  };

  const handleResetAllToDefaults = async () => {
    if (!confirm(isAr ? 'هل أنت متأكد من إعادة ضبط كافة رموز النصوص إلى الافتراضيات؟' : 'Reset all text tokens to system defaults?')) return;
    
    setTextTokensList(defaultTranslations);
    saveCachedCustomTextTokens(defaultTranslations);
    showStatus(isAr ? 'تم إعادة الضبط لكافة رموز النصوص' : 'Reset all text tokens to defaults');

    await pbService.saveAdminAppSettings({
      key: 'admin_settings',
      textTokens: defaultTranslations,
      updatedAt: new Date().toISOString()
    }).catch(() => null);
  };

  const filteredTokens = textTokensList.filter((item) => {
    const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesQuery =
      searchQuery === '' ||
      item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.en || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.ar || '').includes(searchQuery);
    return matchesCat && matchesQuery;
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto text-[var(--theme-text-primary)] select-none">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--theme-accent)]/20 border border-[var(--theme-accent)]/40 flex items-center justify-center text-[var(--theme-accent)]">
            <Globe className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-black text-[var(--theme-text-primary)] flex items-center gap-2">
              <span>{isAr ? 'رمزية النصوص والترجمة' : 'Text Tokens & Localization'}</span>
            </h2>
            <p className="text-xs text-[var(--theme-text-muted)] font-medium mt-0.5">
              {isAr
                ? 'إدارة جميع مفاتيح النصوص المترجمة للغة العربية والإنجليزية وإضافة لغات مستقبلاً بشكل مستقل'
                : 'Manage localization keys, English & Arabic translations independently from themes'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetAllToDefaults}
            className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center gap-2 cursor-pointer border border-amber-500/30 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'استعادة الافتراضيات' : 'Reset Defaults'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-[var(--theme-accent)] text-black font-extrabold text-xs shadow-lg hover:opacity-90 flex items-center gap-2 cursor-pointer border-0 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إضافة مفتاح جديد' : 'Add New Key'}</span>
          </button>
        </div>
      </div>

      {/* Status Bar Notification */}
      {statusMessage && (
        <div className="p-3.5 rounded-2xl bg-[var(--theme-accent)]/15 border border-[var(--theme-accent)]/40 text-[var(--theme-accent)] font-extrabold text-xs flex items-center justify-between shadow-md animate-fade-in">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{statusMessage}</span>
          </span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
          <input
            type="text"
            placeholder={isAr ? 'البحث عن مفتاح نصي أو ترجمة...' : 'Search token key or translation...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-[var(--theme-accent)] transition-all"
          />
        </div>

        {/* Category Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-all border-0 whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-[var(--theme-accent)] text-black shadow-md'
                  : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tokens Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTokens.map((item) => {
          const isSystem = defaultTranslations.some((d) => d.key === item.key);
          return (
            <div
              key={item.key}
              className="p-4 rounded-3xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] space-y-3 shadow-md hover:border-[var(--theme-accent)]/50 transition-all"
            >
              {/* Card Header */}
              <div className="flex items-center justify-between pb-2 border-b border-[var(--theme-border)]">
                <div className="flex items-center gap-2 min-w-0">
                  <Tag className="w-3.5 h-3.5 text-[var(--theme-accent)] shrink-0" />
                  <span className="font-mono text-xs font-extrabold text-[var(--theme-text-primary)] truncate">
                    {item.key}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-muted)]">
                    {item.category || 'General'}
                  </span>
                  {!isSystem && (
                    <button
                      type="button"
                      onClick={() => handleDeleteToken(item.key)}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 cursor-pointer border-0 transition-all"
                      title="Delete Custom Token"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* English Input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-extrabold text-[var(--theme-text-muted)]">
                  <span>English (en)</span>
                  {isSystem && (
                    <button
                      type="button"
                      onClick={() => handleRestoreDefaultTranslation(item.key, 'en')}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer border-0 bg-transparent"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>{isAr ? 'استعادة' : 'Reset'}</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={item.translations?.en || item.en}
                  onChange={(e) => handleUpdateTextToken(item.key, 'en', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--theme-bg-primary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-[var(--theme-accent)] transition-all"
                />
              </div>

              {/* Arabic Input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-extrabold text-[var(--theme-text-muted)]">
                  <span>العربية (ar)</span>
                  {isSystem && (
                    <button
                      type="button"
                      onClick={() => handleRestoreDefaultTranslation(item.key, 'ar')}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer border-0 bg-transparent"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>{isAr ? 'استعادة' : 'Reset'}</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  dir="rtl"
                  value={item.translations?.ar || item.ar}
                  onChange={(e) => handleUpdateTextToken(item.key, 'ar', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--theme-bg-primary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-[var(--theme-accent)] font-cairo transition-all"
                />
              </div>
            </div>
          );
        })}
      </div>

      {filteredTokens.length === 0 && (
        <div className="p-12 text-center rounded-3xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] space-y-2">
          <Globe className="w-10 h-10 mx-auto opacity-40 animate-pulse" />
          <p className="text-xs font-bold">{isAr ? 'لا توجد رموز نصوص مطابقة للبحث' : 'No text tokens matched your search'}</p>
        </div>
      )}

      {/* Add New Token Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[var(--theme-bg-primary)] border border-[var(--theme-border)] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--theme-border)] pb-3">
              <h3 className="font-extrabold text-sm flex items-center gap-2 text-[var(--theme-text-primary)]">
                <Languages className="w-4 h-4 text-[var(--theme-accent)]" />
                <span>{isAr ? 'إضافة رمز نصي جديد' : 'Add New Text Token'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-xl text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] cursor-pointer border-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--theme-text-muted)]">Token Key (e.g. app.button.submit)</label>
                <input
                  type="text"
                  placeholder="e.g. custom_greeting_message"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs font-mono text-[var(--theme-text-primary)] focus:outline-none focus:border-[var(--theme-accent)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--theme-text-muted)]">English Text</label>
                <input
                  type="text"
                  placeholder="e.g. Welcome to workspace"
                  value={newEn}
                  onChange={(e) => setNewEn(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-[var(--theme-accent)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--theme-text-muted)]">النص بالعربية</label>
                <input
                  type="text"
                  dir="rtl"
                  placeholder="مثال: مرحباً بك في مساحة العمل"
                  value={newAr}
                  onChange={(e) => setNewAr(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-[var(--theme-accent)] font-cairo"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--theme-text-muted)]">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-[var(--theme-accent)]"
                >
                  {categories.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--theme-border)]">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] font-bold text-xs cursor-pointer border-0"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleAddNewToken}
                className="px-4 py-2 rounded-xl bg-[var(--theme-accent)] text-black font-extrabold text-xs shadow-lg cursor-pointer hover:opacity-90 border-0"
              >
                {isAr ? 'إضافة النص' : 'Add Token'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
