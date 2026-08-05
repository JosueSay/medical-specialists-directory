import type { Response } from 'express';
import {
  buildPaginationMeta,
  type ErrorDetail,
  type ErrorResponse,
  type SuccessResponse,
} from '@msd/contracts';

/**
 * Constructores de respuesta. Todos los controladores responden a traves de
 * estos helpers para que el formato definido en el contrato no se rompa.
 */

export function sendSuccess<TData>(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  data?: TData,
): void {
  const body: SuccessResponse<TData> = { code, message, ...(data === undefined ? {} : { data }) };
  res.status(statusCode).json(body);
}

export function sendPaginated<TItem>(
  res: Response,
  code: string,
  message: string,
  items: TItem[],
  page: number,
  pageSize: number,
  totalItems: number,
): void {
  res.status(200).json({
    code,
    message,
    data: items,
    meta: { pagination: buildPaginationMeta(page, pageSize, totalItems) },
  });
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: ErrorDetail[],
): void {
  const body: ErrorResponse = {
    code,
    message,
    ...(details && details.length > 0 ? { errors: { details } } : {}),
  };
  res.status(statusCode).json(body);
}
