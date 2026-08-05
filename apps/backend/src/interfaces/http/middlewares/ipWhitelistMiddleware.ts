import type { NextFunction, Request, Response } from 'express';
import { isIpAllowed, normalizeIp, type WhitelistSource } from '@/config/ipWhitelist.js';
import { AppError } from '@/shared/appError.js';
import { logger } from '@/shared/logger.js';

/**
 * Control de acceso por IP. Se monta antes de cualquier controlador: una IP
 * fuera de la whitelist recibe 403 y nunca llega a la capa de aplicacion.
 *
 * La lista se consulta en cada peticion a traves de su fuente (con cache), de
 * modo que un cambio en la configuracion aplica sin volver a desplegar.
 *
 * La IP evaluada es la que Express resuelve segun `trust proxy`, de manera que
 * detras del proxy de Firebase se evalua la IP publica real del cliente y no la
 * del proxy.
 */
export function createIpWhitelistMiddleware(source: WhitelistSource, enabled: boolean) {
  if (!enabled) {
    logger.warn('Whitelist de IPs deshabilitada: toda IP puede consumir la API');
  }

  return async function ipWhitelistMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!enabled) {
      next();
      return;
    }

    try {
      const clientIp = normalizeIp(req.ip ?? '');
      const whitelist = await source.getEntries();

      if (!isIpAllowed(clientIp, whitelist)) {
        // Se registra la IP rechazada para auditoria, nunca se devuelve al cliente
        logger.warn('Peticion rechazada por whitelist', { clientIp, path: req.path });
        next(AppError.ipNotAllowed());
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
