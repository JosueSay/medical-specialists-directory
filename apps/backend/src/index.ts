import { createApp } from '@/app.js';
import { assertRuntimeConfig, env } from '@/config/env.js';
import { buildContainer } from '@/config/container.js';
import { logger } from '@/shared/logger.js';

/**
 * Punto de entrada del servidor HTTP.
 * El despliegue sobre Firebase Cloud Functions usa `functions.ts`, que reutiliza
 * la misma aplicacion.
 */
async function bootstrap(): Promise<void> {
  assertRuntimeConfig();

  const container = await buildContainer();
  const app = createApp(container);

  const server = app.listen(env.BACKEND_PORT, '0.0.0.0', () => {
    logger.info('API escuchando', {
      port: env.BACKEND_PORT,
      basePath: env.API_BASE_PATH,
      environment: env.APP_ENV,
    });
  });

  // Cierre ordenado: sin esto el contenedor tarda 10 s en morir en cada reinicio
  const shutdown = (signal: string): void => {
    logger.info('Apagando servidor', { signal });
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error: unknown) => {
  logger.error('No fue posible arrancar la API', {
    reason: error instanceof Error ? error.message : 'unknown',
  });
  process.exit(1);
});
