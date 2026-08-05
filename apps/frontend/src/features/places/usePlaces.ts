import { useCallback, useEffect, useState } from 'react';
import type { ListPlacesQuery, PaginationMeta, PlaceDto } from '@msd/contracts';
import { ApiError } from '@/api/httpClient';
import { fetchPlaces } from '@/api/placesApi';

type Status = 'loading' | 'success' | 'error';

export interface PlacesState {
  status: Status;
  places: PlaceDto[];
  pagination: PaginationMeta | null;
  /** Codigo de error del backend, listo para traducir. */
  errorCode: string | null;
}

/** Resultado recibido junto con la consulta que lo produjo. */
interface QueryResult {
  query: ListPlacesQuery;
  places: PlaceDto[];
  pagination: PaginationMeta | null;
  errorCode: string | null;
}

const LOADING_STATE: PlacesState = {
  status: 'loading',
  places: [],
  pagination: null,
  errorCode: null,
};

/**
 * Consulta el directorio y expone los estados que la UI debe distinguir:
 * cargando, con resultados, vacio y error.
 *
 * El estado de carga es derivado: mientras el resultado guardado no corresponda
 * a la consulta activa, la vista esta cargando. Asi no hace falta escribir
 * estado dentro del efecto ni encadenar renders.
 *
 * Cada consulta nueva aborta la anterior, de modo que una respuesta lenta no
 * pisa el resultado de una busqueda mas reciente.
 */
export function usePlaces(initialQuery: ListPlacesQuery) {
  const [query, setQuery] = useState<ListPlacesQuery>(initialQuery);
  const [result, setResult] = useState<QueryResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchPlaces(query, controller.signal)
      .then((response) => {
        setResult({
          query,
          places: response.data,
          pagination: response.meta.pagination,
          errorCode: null,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setResult({
          query,
          places: [],
          pagination: null,
          errorCode: error instanceof ApiError ? error.code : 'internal_error',
        });
      });

    return () => controller.abort();
  }, [query]);

  const state: PlacesState =
    result && result.query === query
      ? {
          status: result.errorCode ? 'error' : 'success',
          places: result.places,
          pagination: result.pagination,
          errorCode: result.errorCode,
        }
      : LOADING_STATE;

  /** Aplica filtros nuevos y vuelve a la primera pagina. */
  const search = useCallback((next: Omit<ListPlacesQuery, 'page'>) => {
    setQuery((previous) => ({ ...previous, ...next, page: 1 }));
  }, []);

  const goToPage = useCallback((page: number) => {
    setQuery((previous) => ({ ...previous, page }));
  }, []);

  return { query, state, search, goToPage };
}
