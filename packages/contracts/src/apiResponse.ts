import { isErrorCode } from './responseCodes.js';

/**
 * Envoltura de respuesta HTTP compartida por toda la API.
 * El formato es fijo: `code` es la clave que el frontend traduce, `message` es
 * texto tecnico para logs y nunca se muestra al usuario final.
 */

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ResponseMeta {
  pagination?: PaginationMeta;
}

export interface SuccessResponse<TData = undefined> {
  code: string;
  message: string;
  data?: TData;
  meta?: ResponseMeta;
}

export interface PaginatedResponse<TItem> extends SuccessResponse<TItem[]> {
  data: TItem[];
  meta: Required<Pick<ResponseMeta, 'pagination'>>;
}

/** Detalle de un error puntual, tipicamente de validacion de un campo. */
export interface ErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export interface ErrorResponse {
  code: string;
  message: string;
  errors?: {
    details: ErrorDetail[];
  };
}

export type ApiResponse<TData = undefined> = SuccessResponse<TData> | ErrorResponse;

/**
 * Discrimina una respuesta de error sin depender del status HTTP.
 *
 * La decision se toma sobre el `code`, que es el unico campo presente en toda
 * respuesta y cuyo valor pertenece a un catalogo cerrado. No se usa la ausencia
 * de `data`: una respuesta exitosa puede no traer datos (el contrato indica que
 * `data` se omite cuando no hay nada que devolver) y quedaria clasificada como
 * error. La presencia de `errors` se acepta como senal adicional para no
 * depender de que el catalogo este completo.
 */
export function isErrorResponse(response: ApiResponse<unknown>): response is ErrorResponse {
  return isErrorCode(response.code) || 'errors' in response;
}
