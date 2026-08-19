import React from 'react';
import { AcademicCapIcon } from './icons/Icons';
import LanguageSwitcher from './LanguageSwitcher';
import { useI18n } from '../hooks/useI18n';

const RadarIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 3a9 9 0 100 18 9 9 0 000-18z" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 8a4 4 0 100 8 4 4 0 000-8z" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 3v2" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 12h-2" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 21v-2" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 12h2" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 12L7 7" className="radar-sweep" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

interface AppHeaderProps {
  apiConfigured: boolean;
  onOpenUserGuide: () => void;
  onOpenApiSettings: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({ apiConfigured, onOpenUserGuide, onOpenApiSettings }) => {
  const { t, locale } = useI18n();

  return (
    <header className="sticky top-0 z-30 w-full bg-[#FBFBFA]/80 backdrop-blur-sm border-b border-stone-200/90">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side: Logo & Title */}
          <div className="flex items-center gap-x-3">
            <RadarIcon className="w-8 h-8 text-black" />
            <h1 className="text-xl font-semibold text-gray-800">
              {t('header.title')}
            </h1>
          </div>

          {/* Right side: Controls */}
          <div className="flex items-center gap-x-4 sm:gap-x-6">
            <a
              href="https://h5.fotechwealth.com/pages/startAccount.html?channel=030003&aeCode=B2&invitationCode=997NQD&langType=zhCn"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-x-1.5 text-xs sm:text-sm font-medium bg-blue-50 text-blue-600 px-3 py-1 rounded-full hover:bg-blue-100 transition-colors border border-blue-200 shadow-sm"
            >
              <span>{locale === 'zh' ? '开户' : 'Open Account'}</span>
            </a>
            <a
              href="https://stocks.mastersgo.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-x-1.5 text-xs sm:text-sm font-medium bg-blue-50 text-blue-600 px-3 py-1 rounded-full hover:bg-blue-100 transition-colors border border-blue-200 shadow-sm"
            >
              <span>{locale === 'zh' ? '图谱' : 'Industry Map'}</span>
            </a>
            <button
              onClick={onOpenUserGuide}
              className="hidden sm:flex items-center gap-x-1.5 text-sm font-medium text-gray-600 hover:text-black transition-colors"
              aria-label={t('header.userGuide')}
            >
              <AcademicCapIcon className="w-5 h-5" />
              <span>{t('header.userGuide')}</span>
            </button>
            {/* API Settings button */}
            <button
              onClick={onOpenApiSettings}
              className={`flex items-center gap-x-1.5 text-xs sm:text-sm font-medium px-3 py-1 rounded-full border shadow-sm transition-colors ${
                apiConfigured
                  ? 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                  : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
              }`}
              aria-label={locale === 'zh' ? '模型 API 设置' : 'Model API Settings'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{locale === 'zh' ? (apiConfigured ? '模型设置' : '配置模型') : (apiConfigured ? 'API Settings' : 'Setup API')}</span>
            </button>
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
