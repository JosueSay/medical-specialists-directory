import {
  isSupportedSpecialty,
  isSupportedZone,
  type PlaceImportSummaryDto,
  type Specialty,
  type SpecialtyConflictDto,
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
 *   - respeta un cooldown por combinacion de keyword y zona;
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

    const recentRun = await this.findRunWithinCooldown(input.keyword, input.zone);
    if (recentRun) {
      // No se llama a Google. Se responde con error y no con el resumen de la
      // corrida anterior: devolver 201 con datos de otra ejecucion hace que
      // quien llama no pueda distinguir una sincronizacion real de una omitida,
      // y un recorrido del catalogo contaria como exitosas invocaciones que
      // nunca ocurrieron.
      logger.info('Sincronizacion omitida por cooldown', {
        keyword: input.keyword,
        specialty,
        zone: input.zone,
        lastRunFinishedAt: recentRun.finishedAt,
      });
      throw AppError.importCooldownActive();
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
    let specialtyConflicts: SpecialtyConflictDto[] = [];

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
        const result = await this.repository.upsertMany(places);
        itemsUpserted += result.upserted;
        specialtyConflicts = specialtyConflicts.concat(result.specialtyConflicts);
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
      specialtyConflicts,
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

    if (specialtyConflicts.length > 0) {
      // Se registra en detalle porque es la unica forma de saber, en el
      // momento, que lugares perdieron su etiqueta anterior. Contar
      // documentos despues no dice cuales cambiaron ni a que se debio.
      logger.warn('Lugares reasignados a otra especialidad', {
        specialty,
        zone: input.zone,
        count: specialtyConflicts.length,
        conflicts: specialtyConflicts,
      });
    }

    return run;
  }

  /**
   * Devuelve la ultima corrida si todavia esta dentro del cooldown.
   *
   * La clave es la keyword y no la especialidad. Cada variante de busqueda es
   * una consulta distinta contra Google y devuelve registros distintos, de modo
   * que agrupar por especialidad haria que la primera variante bloqueara a las
   * demas durante todo el cooldown.
   */
  private async findRunWithinCooldown(keyword: string, zone: string): Promise<ImportRun | null> {
    if (this.cooldownMinutes <= 0) {
      return null;
    }

    const lastRun = await this.repository.findLastImportRun(keyword, zone);
    if (!lastRun) {
      return null;
    }

    const elapsedMs = this.now().getTime() - new Date(lastRun.finishedAt).getTime();
    return elapsedMs < this.cooldownMinutes * 60 * 1000 ? lastRun : null;
  }
}
