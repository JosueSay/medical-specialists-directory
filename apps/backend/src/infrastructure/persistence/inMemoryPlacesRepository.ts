import type { SpecialtyConflictDto } from '@msd/contracts';
import type { ImportRun, Place } from '@/domain/entities/place.js';
import type {
  ImportSlotDenial,
  PagedResult,
  PlaceFilters,
  PlacesRepository,
  UpsertResult,
} from '@/domain/ports/placesRepository.js';
import { importSlotId } from '@/infrastructure/persistence/importSlotId.js';

/**
 * Adaptador de persistencia en memoria.
 *
 * Es el driver por defecto en desarrollo: permite levantar el proyecto sin
 * credenciales de GCP. Los datos se pierden al reiniciar el proceso, cosa que
 * en despliegue resuelve el adaptador de Firestore.
 */
export class InMemoryPlacesRepository implements PlacesRepository {
  private readonly places = new Map<string, Place>();
  private readonly importRuns: ImportRun[] = [];
  /** Turno por combinacion: identificador -> hasta cuando queda tomado. */
  private readonly importSlots = new Map<string, string>();

  constructor(seed: Place[] = []) {
    for (const place of seed) {
      this.places.set(place.placeId, place);
    }
  }

  async upsertMany(places: Place[]): Promise<UpsertResult> {
    const specialtyConflicts: SpecialtyConflictDto[] = [];

    for (const place of places) {
      const existing = this.places.get(place.placeId);

      if (existing && existing.specialty !== place.specialty) {
        specialtyConflicts.push({
          placeId: place.placeId,
          name: place.name,
          previousSpecialty: existing.specialty,
          newSpecialty: place.specialty,
        });
      }

      this.places.set(place.placeId, {
        ...place,
        createdAt: existing?.createdAt ?? place.createdAt,
      });
    }

    return { upserted: places.length, specialtyConflicts };
  }

  async findBy(filters: PlaceFilters, page: number, pageSize: number): Promise<PagedResult<Place>> {
    const matches = [...this.places.values()]
      .filter((place) => {
        if (filters.specialty && place.specialty !== filters.specialty) {
          return false;
        }
        if (filters.zone && place.zone !== filters.zone) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const offset = (page - 1) * pageSize;

    return {
      items: matches.slice(offset, offset + pageSize),
      totalItems: matches.length,
    };
  }

  async saveImportRun(run: ImportRun): Promise<void> {
    this.importRuns.push(run);
  }

  async findLastImportRun(keyword: string, zone: string): Promise<ImportRun | null> {
    const matches = this.importRuns
      .filter((run) => run.keyword === keyword && run.zone === zone)
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));

    return matches[0] ?? null;
  }

  async tryAcquireImportSlot(
    keyword: string,
    zone: string,
    heldUntil: string,
    now: string,
  ): Promise<ImportSlotDenial | null> {
    const id = importSlotId(keyword, zone);
    const current = this.importSlots.get(id);

    if (current && current > now) {
      return { heldUntil: current };
    }

    // Un solo proceso y sin `await` en medio: en JavaScript nada puede
    // interponerse entre la lectura y la escritura, de modo que la operacion es
    // tan atomica aqui como la transaccion en Firestore. Se comparte el mismo
    // calculo de identificador para que ambos adaptadores agrupen igual.
    this.importSlots.set(id, heldUntil);
    return null;
  }

  async purgeExpired(expiredBefore: string): Promise<number> {
    let purged = 0;

    for (const [placeId, place] of this.places) {
      if (place.collectedAt < expiredBefore) {
        this.places.delete(placeId);
        purged += 1;
      }
    }

    return purged;
  }

  /** Solo para pruebas y diagnostico local. */
  listImportRuns(): ImportRun[] {
    return [...this.importRuns];
  }
}
