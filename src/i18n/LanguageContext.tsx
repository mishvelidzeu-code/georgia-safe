import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './en.json';
import ka from './ka.json';
import ru from './ru.json';

export type LanguageCode = 'en' | 'ka' | 'ru';

type Dictionary = typeof en;

const DICTIONARIES: Record<LanguageCode, Dictionary> = { en, ka, ru };
const LANGUAGE_STORAGE_KEY = 'georgia_safe_language';

type LanguageContextValue = {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isSupportedLanguage(value: string | null | undefined): value is LanguageCode {
  return value === 'en' || value === 'ka' || value === 'ru';
}

function resolveDeviceLanguage(): LanguageCode {
  const deviceLocale = Localization.getLocales()[0]?.languageCode;
  return isSupportedLanguage(deviceLocale) ? deviceLocale : 'en';
}

function lookup(dictionary: Dictionary, key: string): string {
  const parts = key.split('.');
  let value: unknown = dictionary;
  for (const part of parts) {
    value = (value as Record<string, unknown> | undefined)?.[part];
  }
  return typeof value === 'string' ? value : key;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).then((stored) => {
      setLanguageState(isSupportedLanguage(stored) ? stored : resolveDeviceLanguage());
      setReady(true);
    });
  }, []);

  function setLanguage(lang: LanguageCode) {
    setLanguageState(lang);
    AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }

  const t = useMemo(() => {
    const dictionary = DICTIONARIES[language];
    return (key: string) => lookup(dictionary, key);
  }, [language]);

  if (!ready) {
    return null;
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
