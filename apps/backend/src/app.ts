import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { HEALTH_PATH, SUCCESS_CODES } from '@msd/contracts';
import { env } from '@/config/env.js';
import type { AppContainer } from '@/config/container.js';
import { createApiRouter } from '@/interfaces/http/router.js';
import { createIpWhitelistMiddleware } from '@/interfaces/http/middlewares/ipWhitelistMiddleware.js';
import { createRateLimitMiddleware } from '@/interfaces/http/middlewares/rateLimitMiddleware.js';
import {
  errorHandlerMiddleware,
  notFoundMiddleware,
} from '@/interfaces/http/middlewares/errorHandlerMiddleware.js';
import { sendSuccess } from '@/shared/httpResponse.js';
import { logger } from '@/shared/logger.js';

export const APP_VERSION = process.env.npm_package_version ?? '0.1.0';

/**
 * Construye la aplicacion HTTP.
 *
 * Se separa de `index.ts` a proposito: el mismo objeto se sirve como servidor
 * en contenedor y se envuelve como Cloud Function en `functions.ts`, sin
 * duplicar el cableado de middlewares ni rutas.
 */
export function createApp(container: AppContainer): Express {
  const app = express();

  // Necesario para que req.ip sea la IP publica real detras del proxy de Firebase
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ALLOWED_ORIGINS,
      methods: ['GET', 'POST'],
      maxAge: 3600,
    }),
  );
  app.use(express.json({ limit: '64kb' }));

  /**
   * Health check, exento del middleware de whitelist.
   *
   * La exencion es necesaria porque la comprobacion del contenedor se origina
   * dentro de el, con una IP interna que nunca estara en la lista. Por eso no
   * revela entorno, version ni estado de dependencias: un endpoint sin control
   * de origen no debe permitir inferir nada del sistema.
   */
  app.get(HEALTH_PATH, (_req, res) => {
    sendSuccess(res, 200, SUCCESS_CODES.SERVICE_HEALTHY, 'Service is healthy', {
      status: 'ok' as const,
    });
  });

  logger.info('Control de acceso por IP', { enabled: env.IP_WHITELIST_ENABLED });

  app.use(
    env.API_BASE_PATH,
    createRateLimitMiddleware(env.RATE_LIMIT_PER_MINUTE),
    createIpWhitelistMiddleware(container.whitelistSource, env.IP_WHITELIST_ENABLED),
    createApiRouter(container),
  );

  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
