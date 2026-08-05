import { createContext } from 'react';
import type { Locale } from '@/config/env';
import type { TranslationParams } from '@/i18n/translate';

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Traduce un `code` del backend o una clave de la interfaz. */
  t: (code: string, params?: TranslationParams) => string;
}

// El contexto vive en su propio archivo para que los archivos de componentes
// solo exporten componentes (requisito de Fast Refresh).
export const I18nContext = createContext<I18nContextValue | null>(null);
