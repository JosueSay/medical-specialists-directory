import {
  isSupportedSpecialty,
  isSupportedZone,
  type PlaceImportSummaryDto,
  type Specialty,
} from '@msd/contracts';
import type { ImportRun } from '@/domain/entities/place.js';
import type { FreshnessPolicy } from '@/domain/freshnessPolicy.js';
import type { PlacesProvider } from '@/domain/ports/placesProvider.js';
import type { PlacesRepository } from '@/domain/ports/placesRepository.js';
import { AppError } from '@/shared/appError.js';
import { logger } from '@/shared/logger.js';

export interface ImportPlacesInput {
  /**
   * Consulta exacta que se envia al proveedor. La declara el operador y se
   * conserva en cada registro como `sourceKeyword`: es la evidencia de que
   * `specialty` y `zone` fueron declarados y no deducidos de la direccion.
   */
  keyword: string;
  specialty: string;
  zone: string;
}

export interface ImportPlacesDependencies {
  provider: PlacesProvider;
  repository: PlacesRepository;
  /** Resultados por pagina solicitados al proveedor. */
  pageSize: number;
  /** Tope global de resultados por sincronizacion, acota el costo. */
  maxResults: number;
  /** Minutos que deben pasar antes de volver a llamar a Google por la misma consulta. */
  cooldownMinutes: number;
  /** Politica que decide que registros ya no pueden conservarse. */
  freshness: FreshnessPolicy;
  now?: () => Date;
  generateImportId?: () => string;
}

/**
 * Recorre las paginas del proveedor y persiste los resultados.
 *
 * Es el unico flujo que llama a Google. Tres reglas acotan el costo y respetan
 * las politicas de Places API:
 *   - corta al alcanzar el tope de resultados o cuando no hay `nextPageToken`;
 *   - respeta un cooldown por combinacion de especialidad y zona;
 *   - purga los registros que superaron la retencion antes de escribir.
 *
 * La escritura es idempotente por `placeId`, asi que repetir una sincronizacion
 * no duplica registros.
 */
export class ImportPlacesUseCase {
  private readonly provider: PlacesProvider;
  private readonly repository: PlacesRepository;
  private readonly pageSize: number;
  private readonly maxResults: number;
  private readonly cooldownMinutes: number;
  private readonly freshness: FreshnessPolicy;
  private readonly now: () => Date;
  private readonly generateImportId: () => string;

  constructor(dependencies: ImportPlacesDependencies) {
    this.provider = dependencies.provider;
    this.repository = dependencies.repository;
    this.pageSize = dependencies.pageSize;
    this.maxResults = dependencies.maxResults;
    this.cooldownMinutes = dependencies.cooldownMinutes;
    this.freshness = dependencies.freshness;
    this.now = dependencies.now ?? (() => new Date());
    this.generateImportId = dependencies.generateImportId ?? (() => crypto.randomUUID());
  }

  async execute(input: ImportPlacesInput): Promise<PlaceImportSummaryDto> {
    if (!isSupportedSpecialty(input.specialty)) {
      throw AppError.unsupportedSpecialty(input.specialty);
    }

    // Sincronizar una zona inexistente gastaria llamadas facturables buscando
    // en un area que no pertenece al municipio
    if (!isSupportedZone(input.zone)) {
      throw AppError.unsupportedZone(input.zone);
    }

    const specialty: Specialty = input.specialty;

    const recentRun = await this.findRunWithinCooldown(specialty, input.zone);
    if (recentRun) {
      // No se llama a Google: se devuelve el resumen de la corrida vigente
      logger.info('Sincronizacion omitida por cooldown', {
        specialty,
        zone: input.zone,
        lastRunFinishedAt: recentRun.finishedAt,
      });
      return recentRun;
    }

    const purged = await this.repository.purgeExpired(this.freshness.retentionCutoff(this.now()));
    if (purged > 0) {
      logger.info('Registros purgados por retencion', { purged });
    }

    const startedAt = this.now().toISOString();

    let pageToken: string | undefined;
    let pagesFetched = 0;
    let itemsFetched = 0;
    let itemsUpserted = 0;

    while (itemsFetched < this.maxResults) {
      const remaining = this.maxResults - itemsFetched;
      const page = await this.provider.fetchPage(
        {
          keyword: input.keyword,
          specialty,
          zone: input.zone,
          pageSize: Math.min(this.pageSize, remaining),
        },
        pageToken,
      );

      pagesFetched += 1;

      // El proveedor puede devolver mas de lo pedido: el tope manda
      const places = page.places.slice(0, remaining);
      itemsFetched += places.length;

      if (places.length > 0) {
        itemsUpserted += await this.repository.upsertMany(places);
      }

      if (!page.nextPageToken || places.length === 0) {
        break;
      }

      pageToken = page.nextPageToken;
    }

    const run: ImportRun = {
      importId: this.generateImportId(),
      keyword: input.keyword,
      specialty,
      zone: input.zone,
      pagesFetched,
      itemsFetched,
      itemsUpserted,
      startedAt,
      finishedAt: this.now().toISOString(),
    };

    await this.repository.saveImportRun(run);

    logger.info('Sincronizacion de lugares completada', {
      importId: run.importId,
      specialty,
      zone: input.zone,
      pagesFetched,
      itemsFetched,
      itemsUpserted,
    });

    return run;
  }

  /** Devuelve la ultima corrida si todavia esta dentro del cooldown. */
  private async findRunWithinCooldown(
    specialty: Specialty,
    zone: string,
  ): Promise<ImportRun | null> {
    if (this.cooldownMinutes <= 0) {
      return null;
    }

    const lastRun = await this.repository.findLastImportRun(specialty, zone);
    if (!lastRun) {
      return null;
    }

    const elapsedMs = this.now().getTime() - new Date(lastRun.finishedAt).getTime();
    return elapsedMs < this.cooldownMinutes * 60 * 1000 ? lastRun : null;
  }
}
