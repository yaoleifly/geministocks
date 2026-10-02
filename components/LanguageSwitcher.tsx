import React from 'react';
import { useI18n } from '../hooks/useI18n';

const LanguageSwitcher: React.FC = () => {
    const { locale, setLocale, t } = useI18n();

    const languages = [
        { code: 'zh', name: '简体中文' },
        { code: 'en', name: 'English' },
    ];

    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setLocale(e.target.value as 'zh' | 'en');
    };

    return (
        <div className="relative inline-block">
            <select
                value={locale}
                onChange={handleLanguageChange}
                className="min-h-11 appearance-none bg-white border border-gray-200 rounded-full px-4 py-2 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
                aria-label={t('languageSwitcher.label')}
            >
                {languages.map(lang => (
                    <option key={lang.code} value={lang.code}>
                        {lang.name}
                    </option>
                ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
            </div>
        </div>
    );
};

export default LanguageSwitcher;