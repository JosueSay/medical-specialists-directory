import { API_BASE_PATH, PAGINATION_DEFAULTS } from '@msd/contracts';

/**
 * Configuracion del cliente. Todo lo que puede cambiar entre entornos entra por
 * variables `VITE_`; ningun componente lee `import.meta.env` directamente.
 *
 * Aqui nunca va un secreto: todo lo que esta en este archivo termina en el
 * bundle que descarga el navegador.
 */

type Theme = 'light' | 'dark' | 'system';
type Locale = 'es' | 'en';

function readString(value: string | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback;
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readLocale(value: string | undefined): Locale {
  return value === 'en' || value === 'es' ? value : 'es';
}

function readTheme(value: string | undefined): Theme {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

/**
 * Los valores de respaldo de este objeto son, a la vez, la configuracion del
 * sitio desplegado: el build de produccion no lee ningun archivo de entorno
 * (ver `vite.config.ts`), asi que cada opcion cae aqui. Cambiar uno cambia lo
 * que se publica, no solo lo que ocurre cuando falta una variable.
 */
export const clientEnv = {
  appEnv: readString(import.meta.env.VITE_APP_ENV, import.meta.env.PROD ? 'production' : 'local'),
  /**
   * Base de la API. La ruta relativa sirve en los dos entornos: en desarrollo
   * la resuelve el proxy de Vite y en despliegue el rewrite `/api/**` de
   * `firebase.json`. Una URL absoluta quedaria literal en el bundle.
   */
  apiBaseUrl: readString(import.meta.env.VITE_API_BASE_URL, API_BASE_PATH),
  defaultLocale: readLocale(import.meta.env.VITE_DEFAULT_LOCALE),
  defaultTheme: readTheme(import.meta.env.VITE_DEFAULT_THEME),
  defaultPageSize: readNumber(import.meta.env.VITE_DEFAULT_PAGE_SIZE, PAGINATION_DEFAULTS.pageSize),
} as const;

export const STORAGE_KEYS = {
  theme: 'msd.theme',
  locale: 'msd.locale',
} as const;

export type { Locale, Theme };
