import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/httpClient';
import { fetchPlaces } from '@/api/placesApi';

function mockFetch(status: number, body: unknown) {
  const spy = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente de la API de lugares', () => {
  it('arma la URL solo con los filtros presentes', async () => {
    const spy = mockFetch(200, { code: 'place_list', message: 'ok', data: [], meta: {} });

    await fetchPlaces({ specialty: 'oncology', page: 2, pageSize: 10 });

    const requestedUrl = String(spy.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain('/places?');
    expect(requestedUrl).toContain('specialty=oncology');
    expect(requestedUrl).toContain('page=2');
    expect(requestedUrl).not.toContain('zone=');
  });

  it('convierte una respuesta de error en ApiError conservando el code', async () => {
    mockFetch(403, { code: 'ip_not_allowed', message: 'Request origin is not allowed' });

    await expect(fetchPlaces({ page: 1 })).rejects.toMatchObject({
      code: 'ip_not_allowed',
      status: 403,
    });
  });

  it('usa network_error cuando no hay respuesta del servidor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await fetchPlaces({ page: 1 }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('network_error');
  });
});
