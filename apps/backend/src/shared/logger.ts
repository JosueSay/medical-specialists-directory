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

const SENSITIVE_KEY_PATTERN = /(key|token|secret|password|authorization|credential)/i;
const REDACTED = '[REDACTED]';

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(item),
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
