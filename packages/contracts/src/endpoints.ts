import type { Specialty } from './specialty.js';
import type { PaginatedResponse, SuccessResponse } from './apiResponse.js';
import type { PlaceDto, PlaceImportSummaryDto, SpecialtyDto } from './place.js';

/**
 * Contrato de endpoints. Backend y frontend importan estas constantes en lugar
 * de escribir rutas a mano: cambiar una ruta aqui la cambia en ambos lados.
 */

export const API_VERSION = 'v1' as const;
export const API_BASE_PATH = `/api/${API_VERSION}` as const;

export const HEALTH_PATH = '/health' as const;

export const ENDPOINTS = {
  /** Dispara una importacion desde Places API hacia la base propia. No es publico. */
  createPlaceImport: {
    method: 'POST',
    path: '/place-imports',
    successStatus: 201,
  },
  /** Consulta la base propia. Unico endpoint que consume la UI. */
  listPlaces: {
    method: 'GET',
    path: '/places',
    successStatus: 200,
  },
  /** Catalogo de especialidades soportadas. */
  listSpecialties: {
    method: 'GET',
    path: '/specialties',
    successStatus: 200,
  },
} as const;

export type EndpointName = keyof typeof ENDPOINTS;

/** Arma la URL absoluta de un endpoint a partir de la base configurada. */
export function buildEndpointUrl(baseUrl: string, endpoint: EndpointName): string {
  return `${baseUrl.replace(/\/$/, '')}${ENDPOINTS[endpoint].path}`;
}

// --- Request ---------------------------------------------------------------

export interface CreatePlaceImportRequest {
  specialty: Specialty;
  zone: string;
  city?: string;
}

export interface ListPlacesQuery {
  specialty?: Specialty;
  zone?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

// --- Response --------------------------------------------------------------

export type CreatePlaceImportResponse = SuccessResponse<PlaceImportSummaryDto>;
export type ListPlacesResponse = PaginatedResponse<PlaceDto>;
export type ListSpecialtiesResponse = SuccessResponse<SpecialtyDto[]>;
export type HealthResponse = SuccessResponse<{
  status: 'ok';
  environment: string;
  version: string;
}>;
