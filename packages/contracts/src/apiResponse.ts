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

/** Discrimina una respuesta de error sin depender del status HTTP. */
export function isErrorResponse(response: ApiResponse<unknown>): response is ErrorResponse {
  return 'errors' in response || !('data' in response);
}
