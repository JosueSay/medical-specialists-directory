import type { PlaceDto, Specialty } from '@msd/contracts';

/**
 * Entidad de dominio. Es lo que el sistema entiende por "lugar medico",
 * independiente de como lo devuelve Google o de como lo guarda Firestore.
 *
 * No incluye coordenadas ni calificacion: el enunciado no las pide, la UI no las
 * usa y solicitarlas encarece la llamada a Places API sin aportar valor.
 */
export interface Place {
  placeId: string;
  name: string;
  formattedAddress: string;
  specialty: Specialty;
  /**
   * Zona declarada por el operador en la consulta, no deducida de la direccion.
   * Derivarla del texto seria inferir un dato que Google no entrega.
   */
  zone: string;
  /** Cadena vacia cuando el proveedor no lo entrega. Nunca se completa. */
  phoneNumber: string;
  /** Cadena vacia cuando el proveedor no lo entrega. Nunca se sustituye. */
  website: string;
  /** Consulta exacta que origino el registro. Es la trazabilidad del dato. */
  sourceKeyword: string;
  createdAt: string;
  /** Ultima vez que el proveedor confirmo este registro. Gobierna el TTL. */
  collectedAt: string;
}

/** Registro de una corrida de sincronizacion. */
export interface ImportRun {
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

/**
 * Proyecta la entidad al DTO publico. Deja fuera `createdAt`: el cliente solo
 * recibe lo que necesita para localizar al especialista, mas la marca de
 * frescura y la fecha de recoleccion para que sepa que tan reciente es el dato.
 */
export function toPlaceDto(place: Place, stale: boolean): PlaceDto {
  return {
    placeId: place.placeId,
    name: place.name,
    formattedAddress: place.formattedAddress,
    specialty: place.specialty,
    zone: place.zone,
    phoneNumber: place.phoneNumber,
    website: place.website,
    sourceKeyword: place.sourceKeyword,
    collectedAt: place.collectedAt,
    stale,
  };
}
