import type { PaginationMeta } from './apiResponse.js';

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 10,
  minPageSize: 1,
  maxPageSize: 50,
} as const;

/** Construye el bloque `meta.pagination` de una respuesta de lista. */
export function buildPaginationMeta(
  page: number,
  pageSize: number,
  totalItems: number,
): PaginationMeta {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0,
  };
}
