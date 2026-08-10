import { describe, expect, it, vi, afterEach } from 'vitest';
import { logger } from '@/shared/logger.js';

/**
 * El logger tacha los campos cuyo nombre designa un secreto. La prueba cubre
 * las dos mitades de esa regla, porque fallar en cualquiera de las dos tiene
 * costo: tachar de menos filtra credenciales, y tachar de mas borra la
 * trazabilidad que el proyecto necesita para auditar de donde salio un dato.
 */
/**
 * Se espia `console.error` y se registra en nivel `error` porque el entorno de
 * pruebas fija `LOG_LEVEL=error`: cualquier nivel inferior no llegaria a
 * escribirse y la prueba no comprobaria nada.
 */
function captureLog(context: Record<string, unknown>): Record<string, unknown> {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  logger.error('prueba', context);

  const line = spy.mock.calls[0]?.[0];
  return JSON.parse(String(line)).context as Record<string, unknown>;
}

describe('redaccion del logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tacha los campos que nombran un secreto', () => {
    const context = captureLog({
      apiKey: 'valor-real',
      accessToken: 'valor-real',
      GOOGLE_MAPS_API_KEY: 'valor-real',
      password: 'valor-real',
      authorization: 'valor-real',
    });

    expect(Object.values(context)).toEqual([
      '[REDACTED]',
      '[REDACTED]',
      '[REDACTED]',
      '[REDACTED]',
      '[REDACTED]',
    ]);
  });

  /**
   * La regresion concreta. El patron anterior buscaba `key` como subcadena, de
   * modo que `keyword` quedaba tachada en cada linea y los logs de la corrida
   * completa no permitian saber que consulta habia producido cada resultado.
   */
  it('no tacha campos que solo contienen una palabra sensible como subcadena', () => {
    const context = captureLog({
      keyword: 'cardiologia zona 10 Guatemala',
      sourceKeyword: 'cardiologia zona 10 Guatemala',
      monkeys: 3,
    });

    expect(context.keyword).toBe('cardiologia zona 10 Guatemala');
    expect(context.sourceKeyword).toBe('cardiologia zona 10 Guatemala');
    expect(context.monkeys).toBe(3);
  });

  it('tacha tambien dentro de objetos anidados', () => {
    const context = captureLog({
      config: { apiKey: 'valor-real', baseUrl: 'https://example.com' },
    });

    expect(context.config).toEqual({ apiKey: '[REDACTED]', baseUrl: 'https://example.com' });
  });
});
