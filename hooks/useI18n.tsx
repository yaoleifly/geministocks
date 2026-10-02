import React, { createContext, useState, useContext, useMemo, useCallback, useEffect } from 'react';

import enTranslations from '../public/locales/en.json';
import zhTranslations from '../public/locales/zh.json';

export type Locale = 'en' | 'zh';

const translations = { en: enTranslations, zh: zhTranslations };

const DEFAULT_LOCALE: Locale = 'zh';
const LOCAL_STORAGE_KEY = 'gemini-app-locale';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, options?: Record<string, string | number>) => any;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// Store for non-React context access (for class components like ErrorBoundary)
let i18nStore: I18nContextType | null = null;

const setI18nStore = (store: I18nContextType) => {
  i18nStore = store;
};

// Get i18n outside of React context (for class components)
export const getI18n = (): { t: (key: string, options?: Record<string, string | number>) => any } => {
  if (i18nStore) {
    return { t: i18nStore.t };
  }
  // Fallback: return key as-is if store not initialized
  return {
    t: (key: string) => key
  };
};

// Helper to get nested value from an object using a dot-notation string
const getNestedTranslation = (obj: any, key: string): any => {
  return key.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const storedLocale = localStorage.getItem(LOCAL_STORAGE_KEY) as Locale;
      if (storedLocale && ['en', 'zh'].includes(storedLocale)) {
        return storedLocale;
      }
    } catch (e) {
      console.error('Could not access localStorage:', e);
    }
    const browserLang = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : DEFAULT_LOCALE;
    return browserLang === 'zh' ? 'zh' : 'en';
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, newLocale);
    } catch (e) {
      console.error('Could not save locale to localStorage:', e);
    }
  }, []);

  const t = useCallback((key: string, options?: Record<string, string | number>): any => {
    if (!translations) {
      return key; // Return key if translations aren't loaded yet
    }

    let text = getNestedTranslation(translations[locale], key);
    if (text === undefined) {
      console.warn(`Translation key "${key}" not found for locale "${locale}". Falling back to default.`);
      text = getNestedTranslation(translations[DEFAULT_LOCALE], key);
      if (text === undefined) {
        return key; // Return the key itself as a last resort
      }
    }

    // Handle array return types (e.g., for loader messages)
    if (Array.isArray(text)) {
      return text;
    }

    if (options && typeof text === 'string') {
      Object.keys(options).forEach(optKey => {
        text = text.replace(`{{${optKey}}}`, String(options[optKey]));
      });
    }

    return text;
  }, [locale]);
  
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  // Update the store whenever value changes (for class components)
  useEffect(() => {
    setI18nStore(value);
  }, [value]);

  // Do not render the app until translations are loaded to prevent rendering with keys.
  if (!translations) {
    return null;
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
