import { env } from '@/config/env.js';

/**
 * Logger minimo con niveles. Redacta cualquier valor que parezca un secreto
 * antes de escribirlo: la API key nunca debe aparecer en logs (RNF-02).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_WORDS = new Set([
  'key',
  'keys',
  'token',
  'tokens',
  'secret',
  'secrets',
  'password',
  'authorization',
  'credential',
  'credentials',
]);

const REDACTED = '[REDACTED]';

/**
 * Decide si el nombre de un campo designa un secreto.
 *
 * Compara palabras completas y no subcadenas. Buscar `key` dentro del nombre
 * tachaba `keyword`, que es lo contrario de lo que interesa: la keyword es la
 * trazabilidad de cada registro y sin ella el log no sirve para auditar de que
 * consulta salio un dato. Tachar de mas parece la opcion prudente hasta que
 * borra la evidencia que uno necesitaba conservar.
 */
function isSensitiveKey(name: string): boolean {
  return (
    name
      // Separa camelCase para que `apiKey` se lea como dos palabras
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^a-zA-Z0-9]+/)
      .some((word) => SENSITIVE_WORDS.has(word.toLowerCase()))
  );
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? REDACTED : redact(item),
      ]),
    );
  }

  return value;
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[env.LOG_LEVEL]) {
    return;
  }

  const entry = {
    level,
    timestamp: new Date().toISOString(),
    environment: env.APP_ENV,
    message,
    ...(context ? { context: redact(context) } : {}),
  };

  const serialized = JSON.stringify(entry);

  if (level === 'error') {
    console.error(serialized);
    return;
  }

  console.log(serialized);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};
