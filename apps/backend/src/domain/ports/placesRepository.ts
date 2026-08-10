import type { Specialty, SpecialtyConflictDto } from '@msd/contracts';
import type { ImportRun, Place } from '@/domain/entities/place.js';

/**
 * Filtros soportados por la consulta al directorio.
 *
 * Ambos provienen de catalogos cerrados, de modo que no existe busqueda por
 * texto libre: un filtro de ese tipo obligaria a cada adaptador a resolverlo a
 * su manera y las implementaciones dejarian de ser intercambiables.
 */
export interface PlaceFilters {
  specialty?: Specialty;
  zone?: string;
}

export interface PagedResult<TItem> {
  items: TItem[];
  totalItems: number;
}

export interface UpsertResult {
  /** Cuantos documentos se escribieron. */
  upserted: number;
  /** Lugares que ya existian bajo otra especialidad antes de esta escritura. */
  specialtyConflicts: SpecialtyConflictDto[];
}

/**
 * Puerto de persistencia. El dominio define que necesita; la infraestructura
 * decide como se cumple (memoria en desarrollo, Firestore en despliegue).
 */
export interface PlacesRepository {
  /**
   * Escritura idempotente por `placeId`. Ademas de cuantos documentos se
   * escribieron, informa que lugares ya existian bajo una especialidad
   * distinta: la escritura les cambia la etiqueta, no la conserva ademas.
   */
  upsertMany(places: Place[]): Promise<UpsertResult>;

  findBy(filters: PlaceFilters, page: number, pageSize: number): Promise<PagedResult<Place>>;

  saveImportRun(run: ImportRun): Promise<void>;

  /** Ultima sincronizacion de esa combinacion, base del cooldown. */
  findLastImportRun(specialty: Specialty, zone: string): Promise<ImportRun | null>;

  /**
   * Borra los registros cuyo `collectedAt` es anterior a la fecha dada.
   * Aplica la politica de retencion: pasado ese plazo no se conservan los
   * campos que provienen de Places API.
   */
  purgeExpired(expiredBefore: string): Promise<number>;
}
