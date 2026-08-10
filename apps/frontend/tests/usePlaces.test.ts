import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ListPlacesQuery } from '@msd/contracts';
import { usePlaces } from '@/features/places/usePlaces';

/**
 * Registra cada consulta que el hook envia, para poder afirmar sobre los
 * filtros que viajaron y no solo sobre lo que se rendirizo.
 */
function mockFetchPlaces() {
  const calls: ListPlacesQuery[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const params = new URL(url, 'http://localhost').searchParams;
      calls.push(Object.fromEntries(params) as ListPlacesQuery);

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'place_list',
          message: 'ok',
          data: [],
          meta: { pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } },
        }),
      });
    }),
  );

  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePlaces', () => {
  it('deja de filtrar por zona cuando el formulario la envia vacia', async () => {
    const calls = mockFetchPlaces();
    const { result } = renderHook(() => usePlaces({ page: 1, pageSize: 10 }));

    await waitFor(() => expect(calls).toHaveLength(1));

    act(() => result.current.search({ zone: '10', pageSize: 10 }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.zone).toBe('10');

    // El formulario omite la clave del filtro que se vacio, no la envia vacia
    act(() => result.current.search({ pageSize: 10 }));
    await waitFor(() => expect(calls).toHaveLength(3));

    // Regresion: fundir la consulta nueva con la anterior dejaba viva la zona,
    // de modo que borrar el campo y buscar seguia devolviendo la zona 10 y el
    // boton de limpiar vaciaba el formulario sin cambiar los resultados
    expect(calls[2]?.zone).toBeUndefined();
  });

  it('conserva los filtros al cambiar de pagina', async () => {
    const calls = mockFetchPlaces();
    const { result } = renderHook(() => usePlaces({ page: 1, pageSize: 10 }));

    await waitFor(() => expect(calls).toHaveLength(1));

    act(() => result.current.search({ specialty: 'cardiology', zone: '10', pageSize: 10 }));
    await waitFor(() => expect(calls).toHaveLength(2));

    act(() => result.current.goToPage(3));
    await waitFor(() => expect(calls).toHaveLength(3));

    expect(calls[2]).toMatchObject({ specialty: 'cardiology', zone: '10', page: '3' });
  });

  it('vuelve a la primera pagina al aplicar filtros nuevos', async () => {
    const calls = mockFetchPlaces();
    const { result } = renderHook(() => usePlaces({ page: 1, pageSize: 10 }));

    await waitFor(() => expect(calls).toHaveLength(1));

    act(() => result.current.goToPage(4));
    await waitFor(() => expect(calls).toHaveLength(2));

    act(() => result.current.search({ specialty: 'pediatrics', pageSize: 10 }));
    await waitFor(() => expect(calls).toHaveLength(3));

    // Quedarse en la pagina 4 con un filtro nuevo suele dar una lista vacia
    expect(calls[2]?.page).toBe('1');
  });
});
