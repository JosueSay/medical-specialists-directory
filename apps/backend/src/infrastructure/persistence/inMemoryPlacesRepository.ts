import type { Specialty } from '@msd/contracts';
import type { ImportRun, Place } from '@/domain/entities/place.js';
import type {
  PagedResult,
  PlaceFilters,
  PlacesRepository,
} from '@/domain/ports/placesRepository.js';

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

  constructor(seed: Place[] = []) {
    for (const place of seed) {
      this.places.set(place.placeId, place);
    }
  }

  async upsertMany(places: Place[]): Promise<number> {
    for (const place of places) {
      const existing = this.places.get(place.placeId);
      this.places.set(place.placeId, {
        ...place,
        createdAt: existing?.createdAt ?? place.createdAt,
      });
    }

    return places.length;
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

  async findLastImportRun(specialty: Specialty, zone: string): Promise<ImportRun | null> {
    const matches = this.importRuns
      .filter((run) => run.specialty === specialty && run.zone === zone)
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));

    return matches[0] ?? null;
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
