import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { clientEnv, STORAGE_KEYS, type Locale } from '@/config/env';
import { I18nContext, type I18nContextValue } from '@/i18n/i18nContext';
import { translate, type TranslationParams } from '@/i18n/translate';

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.locale);
    if (stored === 'es' || stored === 'en') {
      return stored;
    }
  } catch {
    // Modo privado o almacenamiento bloqueado: se usa el idioma por defecto
  }

  return clientEnv.defaultLocale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.documentElement.lang = next;

    try {
      localStorage.setItem(STORAGE_KEYS.locale, next);
    } catch {
      // La preferencia no persiste, pero la sesion actual si cambia de idioma
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (code: string, params?: TranslationParams) => translate(code, locale, params),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
