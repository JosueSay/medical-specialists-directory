import type { Locale } from '@/config/env';
import es from './es.json';
import en from './en.json';

/**
 * Traduccion por diccionario.
 *
 * El backend nunca devuelve texto para el usuario: devuelve un `code` y aqui se
 * resuelve al mensaje del idioma activo. El orden de resolucion es idioma
 * activo, luego ingles como respaldo, y por ultimo la clave cruda (señal de que
 * falta agregar la traduccion).
 */

export const FALLBACK_LOCALE: Locale = 'en';

const dictionaries: Record<Locale, Record<string, string>> = { es, en };

export type TranslationParams = Record<string, string | number>;

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

export function translate(code: string, locale: Locale, params?: TranslationParams): string {
  const active = dictionaries[locale]?.[code];
  const fallback = dictionaries[FALLBACK_LOCALE]?.[code];

  return interpolate(active ?? fallback ?? code, params);
}

/** Lista de claves definidas en un idioma, util para verificar sincronizacion. */
export function dictionaryKeys(locale: Locale): string[] {
  return Object.keys(dictionaries[locale] ?? {});
}
