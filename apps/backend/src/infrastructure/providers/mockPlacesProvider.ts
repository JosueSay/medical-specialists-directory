import type { Place } from '@/domain/entities/place.js';
import type { PlacesProvider, ProviderPage, ProviderQuery } from '@/domain/ports/placesProvider.js';

/**
 * Adaptador falso del proveedor de lugares.
 *
 * Genera resultados deterministas con el mismo comportamiento de paginacion que
 * Places API, incluido el `nextPageToken`. Permite probar el caso de uso de
 * importacion sin consumir cuota facturable ni requerir una API key.
 */
export class MockPlacesProvider implements PlacesProvider {
  /** Cuantos resultados simula tener el proveedor por consulta. */
  constructor(private readonly totalAvailable: number = 37) {}

  async fetchPage(query: ProviderQuery, pageToken?: string): Promise<ProviderPage> {
    const offset = pageToken ? Number.parseInt(pageToken, 10) : 0;
    const remaining = Math.max(this.totalAvailable - offset, 0);
    const count = Math.min(query.pageSize, remaining);
    const timestamp = new Date().toISOString();

    const places: Place[] = Array.from({ length: count }, (_, index) => {
      const sequence = offset + index + 1;
      // Uno de cada tres registros sin telefono ni sitio web: en los datos reales
      // muchos lugares no los traen, y la UI debe manejar ese caso desde el inicio
      const hasContact = sequence % 3 !== 0;

      return {
        placeId: `mock_${query.specialty}_z${query.zone}_${String(sequence).padStart(3, '0')}`,
        name: `Centro ${query.specialty} demo ${sequence}`,
        formattedAddress: `${sequence} Avenida ${sequence}-10, Zona ${query.zone}, Guatemala`,
        specialty: query.specialty,
        zone: query.zone,
        phoneNumber: hasContact ? `+502 2000 ${String(1000 + sequence).slice(0, 4)}` : '',
        website: hasContact ? `https://demo-${sequence}.example.com` : '',
        sourceKeyword: query.keyword,
        createdAt: timestamp,
        collectedAt: timestamp,
      };
    });

    const nextOffset = offset + count;
    const hasMore = nextOffset < this.totalAvailable;

    return {
      places,
      ...(hasMore ? { nextPageToken: String(nextOffset) } : {}),
    };
  }
}
