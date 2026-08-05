import { ERROR_CODES, type ErrorDetail, type ErrorResponse } from '@msd/contracts';
import { clientEnv } from '@/config/env';

/**
 * Cliente HTTP de la API.
 *
 * La UI solo conoce el endpoint de consulta: nunca llama a Google ni a
 * Firestore. Cualquier fallo se normaliza a `ApiError`, que lleva el `code` que
 * la capa de i18n traduce al idioma activo.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: ErrorDetail[];

  constructor(code: string, status: number, message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const base = clientEnv.apiBaseUrl.replace(/\/$/, '');
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }

  const queryString = search.toString();
  return `${base}${path}${queryString.length > 0 ? `?${queryString}` : ''}`;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const { method = 'GET', query, body, signal } = options;

  let response: Response;

  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    // Sin respuesta del servidor: no hay `code` del backend que traducir
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError('network_error', 0, 'Network request failed');
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorPayload = payload as ErrorResponse | null;
    throw new ApiError(
      errorPayload?.code ?? ERROR_CODES.INTERNAL_ERROR,
      response.status,
      errorPayload?.message ?? 'Request failed',
      errorPayload?.errors?.details ?? [],
    );
  }

  return payload as TResponse;
}
