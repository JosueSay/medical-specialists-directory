import type { Specialty } from './specialty.js';

/**
 * Representacion de un lugar tal como la devuelve la API al cliente.
 * Es un subconjunto del documento persistido: solo los campos que la UI usa
 * (minimizacion de datos).
 */
export interface PlaceDto {
  placeId: string;
  name: string;
  formattedAddress: string;
  specialty: Specialty;
  zone: string;
  latitude: number;
  longitude: number;
  phoneNumber?: string;
  rating?: number;
  updatedAt: string;
  /**
   * `true` cuando el registro supero el TTL de frescura. Se expone a proposito:
   * quien consulta debe saber que tan reciente es el dato, en lugar de
   * interpretar la lista como actualizada al instante.
   */
  stale: boolean;
}

/** Resumen que devuelve una importacion contra Places API. */
export interface PlaceImportSummaryDto {
  importId: string;
  specialty: Specialty;
  zone: string;
  pagesFetched: number;
  itemsFetched: number;
  itemsUpserted: number;
  startedAt: string;
  finishedAt: string;
}

/** Especialidad expuesta en el catalogo publico. */
export interface SpecialtyDto {
  specialty: Specialty;
  keyword: string;
}
