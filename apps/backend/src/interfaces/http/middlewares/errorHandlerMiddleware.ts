import type { NextFunction, Request, Response } from 'express';
import { ERROR_CODES } from '@msd/contracts';
import { AppError } from '@/shared/appError.js';
import { sendError } from '@/shared/httpResponse.js';
import { logger } from '@/shared/logger.js';

/**
 * Traduce cualquier error a la respuesta de error del contrato.
 * Ningun mensaje expone nombres de colecciones, la API key ni trazas internas.
 */
export function errorHandlerMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  // Express identifica el manejador de errores por su aridad de 4 argumentos
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    logger.warn('Peticion rechazada', {
      path: req.path,
      code: error.code,
      statusCode: error.statusCode,
    });
    sendError(res, error.statusCode, error.code, error.message, error.details);
    return;
  }

  logger.error('Error no controlado', {
    path: req.path,
    reason: error instanceof Error ? error.message : 'unknown',
  });

  sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Unexpected internal error');
}

/** Cualquier ruta no declarada responde con el mismo formato del contrato. */
export function notFoundMiddleware(_req: Request, res: Response): void {
  sendError(res, 404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Endpoint not found');
}
