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

/** Turno de sincronizacion negado porque otra corrida lo tiene tomado. */
export interface ImportSlotDenial {
  /** Momento hasta el que sigue tomado, en ISO 8601. */
  heldUntil: string;
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

  /**
   * Ultima sincronizacion de esa combinacion. Se conserva para inspeccion y
   * para las pruebas; el cooldown ya no se decide leyendola.
   *
   * La clave es la keyword y la zona, no la especialidad: cada variante de
   * busqueda es una consulta distinta que devuelve registros distintos, de modo
   * que agrupar por especialidad haria que la primera variante bloqueara a las
   * demas y la mitad del catalogo no llegara a ejecutarse.
   */
  findLastImportRun(keyword: string, zone: string): Promise<ImportRun | null>;

  /**
   * Toma el turno de sincronizacion de una combinacion, o lo niega si otra
   * corrida lo tiene tomado hasta `heldUntil`.
   *
   * La operacion es **atomica**: comprobar y tomar ocurren sin que nadie pueda
   * colarse en medio. Leer la ultima corrida y decidir despues dejaba una
   * ventana en la que dos peticiones identicas simultaneas pasaban las dos,
   * porque ninguna veia todavia la marca de la otra.
   *
   * Devuelve `null` cuando el turno se concede y, cuando se niega, hasta cuando
   * sigue tomado, para que quien llama pueda decirlo.
   */
  tryAcquireImportSlot(
    keyword: string,
    zone: string,
    heldUntil: string,
    now: string,
  ): Promise<ImportSlotDenial | null>;

  /**
   * Borra los registros cuyo `collectedAt` es anterior a la fecha dada.
   * Aplica la politica de retencion: pasado ese plazo no se conservan los
   * campos que provienen de Places API.
   */
  purgeExpired(expiredBefore: string): Promise<number>;
}
