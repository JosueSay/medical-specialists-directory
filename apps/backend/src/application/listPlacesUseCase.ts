import {
  isSupportedSpecialty,
  isSupportedZone,
  type PlaceDto,
  type Specialty,
} from '@msd/contracts';
import { toPlaceDto } from '@/domain/entities/place.js';
import type { FreshnessPolicy } from '@/domain/freshnessPolicy.js';
import type { PlaceFilters, PlacesRepository } from '@/domain/ports/placesRepository.js';
import { AppError } from '@/shared/appError.js';

export interface ListPlacesInput {
  specialty?: string;
  zone?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export interface ListPlacesOutput {
  items: PlaceDto[];
  page: number;
  pageSize: number;
  totalItems: number;
}

/**
 * Consulta el directorio leyendo unicamente de la base propia.
 *
 * Nunca llama al proveedor externo: la actualizacion es explicita y solo ocurre
 * mediante una sincronizacion. Los registros que superaron el TTL se devuelven
 * marcados como desactualizados en lugar de ocultarse.
 */
export class ListPlacesUseCase {
  constructor(
    private readonly repository: PlacesRepository,
    private readonly freshness: FreshnessPolicy,
  ) {}

  async execute(input: ListPlacesInput): Promise<ListPlacesOutput> {
    let specialty: Specialty | undefined;

    if (input.specialty !== undefined && input.specialty.length > 0) {
      if (!isSupportedSpecialty(input.specialty)) {
        throw AppError.unsupportedSpecialty(input.specialty);
      }
      specialty = input.specialty;
    }

    // La zona se valida contra el catalogo por la misma razon que la
    // especialidad: las zonas 20, 22 y 23 no existen en Ciudad de Guatemala
    if (input.zone !== undefined && input.zone.length > 0 && !isSupportedZone(input.zone)) {
      throw AppError.unsupportedZone(input.zone);
    }

    const filters: PlaceFilters = {
      ...(specialty ? { specialty } : {}),
      ...(input.zone ? { zone: input.zone } : {}),
      ...(input.q ? { q: input.q } : {}),
    };

    const result = await this.repository.findBy(filters, input.page, input.pageSize);
    const now = new Date();

    return {
      items: result.items.map((place) => toPlaceDto(place, this.freshness.isStale(place, now))),
      page: input.page,
      pageSize: input.pageSize,
      totalItems: result.totalItems,
    };
  }
}
