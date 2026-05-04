"use client";

import { useLanguage, type Locale } from '@/context/LanguageContext';

const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'es', label: 'ES', flag: '🇪🇸' },
  { code: 'en', label: 'EN', flag: '🇬🇧' },
];

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();

  return (
    <div style={{ display: 'flex', gap: '0.3rem' }}>
      {LOCALES.map(l => (
        <button
          key={l.code}
          onClick={() => setLocale(l.code)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.3rem 0.6rem',
            borderRadius: '20px',
            border: '1px solid',
            borderColor: locale === l.code ? 'var(--primary)' : 'var(--border)',
            background: locale === l.code ? 'var(--primary-light, rgba(123,79,150,0.1))' : 'transparent',
            color: locale === l.code ? 'var(--primary)' : 'var(--text-muted)',
            fontSize: '0.75rem',
            fontWeight: locale === l.code ? 700 : 400,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <span>{l.flag}</span>
          <span>{l.label}</span>
        </button>
      ))}
    </div>
  );
}
