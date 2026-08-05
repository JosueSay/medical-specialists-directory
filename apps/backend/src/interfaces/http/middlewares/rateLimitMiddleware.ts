import type { NextFunction, Request, Response } from 'express';
import { normalizeIp } from '@/config/ipWhitelist.js';
import { AppError } from '@/shared/appError.js';

/**
 * Limitador de peticiones por IP con ventana de un minuto.
 *
 * Es una defensa en profundidad barata sobre la whitelist: acota el impacto de
 * un cliente autorizado que dispare demasiadas importaciones. El contador vive
 * en memoria del proceso, suficiente para un despliegue de una sola instancia.
 */
export function createRateLimitMiddleware(requestsPerMinute: number) {
  const counters = new Map<string, { count: number; resetAt: number }>();
  const windowMs = 60_000;

  return function rateLimitMiddleware(req: Request, _res: Response, next: NextFunction): void {
    if (requestsPerMinute <= 0) {
      next();
      return;
    }

    const key = normalizeIp(req.ip ?? 'unknown');
    const now = Date.now();
    const entry = counters.get(key);

    if (!entry || entry.resetAt <= now) {
      counters.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;

    if (entry.count > requestsPerMinute) {
      next(AppError.rateLimited());
      return;
    }

    next();
  };
}
