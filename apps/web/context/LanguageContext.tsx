"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('es');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && (saved === 'es' || saved === 'en')) setLocaleState(saved);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  // Resuelve una clave con notación de punto, p.ej. "menu.welcomeTitle"
  const t = useCallback((key: string): string => {
    const parts = key.split('.');
    let node: any = MESSAGES[locale];
    for (const part of parts) {
      if (node == null) return key;
      node = node[part];
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
