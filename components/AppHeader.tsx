import React, { useEffect, useRef, useState } from 'react';
import { ResearchIcon } from './icons/ResearchIcons';
import LanguageSwitcher from './LanguageSwitcher';
import { useI18n } from '../hooks/useI18n';

interface AppHeaderProps {
  apiConfigured: boolean;
  busy?: boolean;
  onNews?: () => void;
  onHistory?: () => void;
  onOpenUserGuide: () => void;
  onOpenApiSettings: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({ apiConfigured, onOpenUserGuide, onOpenApiSettings, onNews, onHistory, busy }) => {
  const { t, locale } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); menuRef.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [menuOpen]);

  return (
    <header className="workspace-header sticky top-0 z-30 border-b border-stone-200/90">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side: Logo & Title */}
          <div className="flex items-center gap-x-3">
            <ResearchIcon name="brand" className="w-8 h-8 lg:hidden" />
            <h1 className="text-xl font-semibold text-gray-800 lg:hidden">
              {t('header.title')}
            </h1>
          </div>

          <p className="hidden lg:block mr-auto text-sm text-stone-500">{locale === 'zh' ? '工作台 / 新研究' : 'Workspace / Research'}</p>
          {/* Right side: Controls */}
          <div className="flex items-center gap-x-2 sm:gap-x-6">
            <span className="hidden xl:block text-xs text-stone-500">{locale === 'zh' ? (apiConfigured ? '模型已配置' : '未配置模型') : (apiConfigured ? 'Model ready' : 'No model configured')}</span>
            {/* API Settings button */}
            <button
              onClick={onOpenApiSettings}
              className={`min-h-11 flex items-center gap-x-1.5 text-xs sm:text-sm font-medium px-3 py-1 rounded-lg border transition-colors ${
                apiConfigured
                  ? 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
              }`}
              aria-label={locale === 'zh' ? '模型 API 设置' : 'Model API Settings'}
            >
              <ResearchIcon name="settings" className="w-4 h-4" />
              <span>{locale === 'zh' ? (apiConfigured ? '模型设置' : '配置模型') : (apiConfigured ? 'API Settings' : 'Setup API')}</span>
            </button>
            <div ref={menuRef} className="relative">
              <button onClick={() => setMenuOpen(open => !open)} aria-expanded={menuOpen} aria-controls="mobile-header-options" className="min-h-11 min-w-11 px-2 text-sm rounded-xl hover:bg-stone-100" aria-label={locale === 'zh' ? '更多选项' : 'More options'}>•••</button>
              {menuOpen && <div id="mobile-header-options" className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-stone-200 bg-white p-3 shadow-lg">
                <div className="lg:hidden">
                  <button disabled={busy} onClick={() => { setMenuOpen(false); onNews?.(); }} className="w-full min-h-11 px-3 text-left text-sm">{locale === 'zh' ? '热点线索' : 'News signals'}</button>
                  <button disabled={busy} onClick={() => { setMenuOpen(false); onHistory?.(); }} className="w-full min-h-11 px-3 text-left text-sm">{locale === 'zh' ? '研究记录' : 'Research history'}</button>
                </div>
                <button onClick={() => { setMenuOpen(false); onOpenUserGuide(); }} className="w-full min-h-11 rounded-lg px-3 text-left text-sm hover:bg-stone-50">{t('header.userGuide')}</button>
                <div className="py-2 sm:hidden"><LanguageSwitcher /></div>
                <a href="https://stocks.mastersgo.cc" target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center px-3 text-sm hover:bg-stone-50 rounded-lg">{locale === 'zh' ? '行业图谱 ↗' : 'Industry map ↗'}</a>
                <a href="https://h5.fotechwealth.com/pages/startAccount.html?channel=030003&aeCode=B2&invitationCode=997NQD&langType=zhCn" target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center px-3 text-sm hover:bg-stone-50 rounded-lg">{locale === 'zh' ? '开户 ↗' : 'Open account ↗'}</a>
              </div>}
            </div>
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
