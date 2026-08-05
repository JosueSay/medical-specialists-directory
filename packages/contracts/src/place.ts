import type { Specialty } from './specialty.js';

/**
 * Representacion de un lugar tal como la devuelve la API al cliente.
 * Es un subconjunto del documento persistido: solo los campos que la UI usa
 * (minimizacion de datos).
 *
 * No se exponen coordenadas ni calificacion: el enunciado no las pide, la UI no
 * las usa y solicitarlas a Places API encarece la llamada sin aportar valor.
 */
export interface PlaceDto {
  placeId: string;
  name: string;
  formattedAddress: string;
  specialty: Specialty;
  zone: string;
  /** Cadena vacia cuando Places API no lo entrega. Nunca se completa ni se infiere. */
  phoneNumber: string;
  /** Cadena vacia cuando Places API no lo entrega. Nunca se sustituye por una red social. */
  website: string;
  /**
   * Consulta exacta que produjo este registro. Es la trazabilidad del dato:
   * `specialty` y `zone` provienen de aqui, no de interpretar la direccion.
   */
  sourceKeyword: string;
  /** ISO 8601. Ultima vez que Places API confirmo este registro. */
  collectedAt: string;
  /**
   * `true` cuando el registro supero el TTL de frescura. Se expone a proposito:
   * quien consulta debe saber que tan reciente es el dato, en lugar de
   * interpretar la lista como actualizada al instante.
   */
  stale: boolean;
}

/** Resumen que devuelve una sincronizacion contra Places API. */
export interface PlaceImportSummaryDto {
  importId: string;
  keyword: string;
  specialty: Specialty;
  zone: string;
  pagesFetched: number;
  itemsFetched: number;
  itemsUpserted: number;
  startedAt: string;
  finishedAt: string;
}

/** Especialidad expuesta en el catalogo publico, con sus variantes de busqueda. */
export interface SpecialtyDto {
  specialty: Specialty;
  keywords: readonly string[];
}
