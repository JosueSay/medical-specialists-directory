import type { Specialty } from '@msd/contracts';
import type { Place } from '@/domain/entities/place.js';

export interface ProviderQuery {
  /**
   * Consulta exacta que se envia al proveedor. La arma el caso de uso a partir
   * del catalogo de variantes; el adaptador no la construye ni la interpreta.
   */
  keyword: string;
  specialty: Specialty;
  zone: string;
  /** Resultados por pagina. Lo fija el caso de uso, no el adaptador. */
  pageSize: number;
}

export interface ProviderPage {
  places: Place[];
  /** Ausente cuando el proveedor ya no tiene mas paginas. */
  nextPageToken?: string;
}

/**
 * Puerto del proveedor externo de lugares. Google Places es un detalle de
 * infraestructura: el caso de uso solo conoce esta interfaz.
 */
export interface PlacesProvider {
  fetchPage(query: ProviderQuery, pageToken?: string): Promise<ProviderPage>;
}
