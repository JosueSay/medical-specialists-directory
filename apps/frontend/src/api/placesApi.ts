import {
  ENDPOINTS,
  type ListPlacesQuery,
  type ListPlacesResponse,
  type ListSpecialtiesResponse,
} from '@msd/contracts';
import { apiRequest } from '@/api/httpClient';

/**
 * Llamadas al contrato de la API. Las rutas salen de `@msd/contracts`: si el
 * backend cambia un path, este archivo no se toca.
 */

export function fetchPlaces(
  query: ListPlacesQuery,
  signal?: AbortSignal,
): Promise<ListPlacesResponse> {
  return apiRequest<ListPlacesResponse>(ENDPOINTS.listPlaces.path, {
    method: ENDPOINTS.listPlaces.method,
    query: {
      ...(query.specialty ? { specialty: query.specialty } : {}),
      ...(query.zone ? { zone: query.zone } : {}),
      ...(query.page ? { page: query.page } : {}),
      ...(query.pageSize ? { pageSize: query.pageSize } : {}),
    },
    ...(signal ? { signal } : {}),
  });
}

export function fetchSpecialties(signal?: AbortSignal): Promise<ListSpecialtiesResponse> {
  return apiRequest<ListSpecialtiesResponse>(ENDPOINTS.listSpecialties.path, {
    method: ENDPOINTS.listSpecialties.method,
    ...(signal ? { signal } : {}),
  });
}
