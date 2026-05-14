"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';
import es from '../messages/es.json';
import en from '../messages/en.json';

export type Locale = 'es' | 'en';

const MESSAGES: Record<Locale, typeof es> = { es, en };
const STORAGE_KEY = 'garum-locale';

type LanguageContextType = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

type Messages = typeof es;
type MessagesNode = Messages | Messages[keyof Messages] | string | undefined;

function readPersistedLocale(): Locale {
  if (typeof window === 'undefined') return 'es';
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'en' || saved === 'es' ? saved : 'es';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer: lee localStorage una sola vez en el primer render del
  // cliente. Sin esto era un useEffect → setState, que dispara cascading
  // renders y rompe react-hooks/set-state-in-effect.
  const [locale, setLocaleState] = useState<Locale>(readPersistedLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  // Resuelve una clave con notación de punto, p.ej. "menu.welcomeTitle"
  const t = useCallback((key: string): string => {
    const parts = key.split('.');
    let node: MessagesNode = MESSAGES[locale];
    for (const part of parts) {
      if (node == null || typeof node !== 'object') return key;
      node = (node as Record<string, MessagesNode>)[part];
    }
    return typeof node === 'string' ? node : key;
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
