import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@msd/contracts';
import { ImportPlacesUseCase } from '@/application/importPlacesUseCase.js';
import { FreshnessPolicy } from '@/domain/freshnessPolicy.js';
import { InMemoryPlacesRepository } from '@/infrastructure/persistence/inMemoryPlacesRepository.js';
import { MockPlacesProvider } from '@/infrastructure/providers/mockPlacesProvider.js';
import { AppError } from '@/shared/appError.js';
import type { Place } from '@/domain/entities/place.js';

interface UseCaseOverrides {
  totalAvailable?: number;
  maxResults?: number;
  pageSize?: number;
  cooldownMinutes?: number;
  retentionHours?: number;
  seed?: Place[];
  now?: () => Date;
}

function buildUseCase(overrides: UseCaseOverrides = {}) {
  const repository = new InMemoryPlacesRepository(overrides.seed ?? []);
  const provider = new MockPlacesProvider(overrides.totalAvailable ?? 37);
  const useCase = new ImportPlacesUseCase({
    provider,
    repository,
    pageSize: overrides.pageSize ?? 10,
    maxResults: overrides.maxResults ?? 20,
    cooldownMinutes: overrides.cooldownMinutes ?? 0,
    freshness: new FreshnessPolicy({
      ttlMinutes: 30,
      retentionHours: overrides.retentionHours ?? 24,
    }),
    generateImportId: () => 'imp_test',
    ...(overrides.now ? { now: overrides.now } : {}),
  });

  return { repository, useCase };
}

describe('ImportPlacesUseCase', () => {
  it('corta al alcanzar el tope de resultados aunque el proveedor tenga mas', async () => {
    const { useCase } = buildUseCase({ totalAvailable: 120, maxResults: 20 });

    const summary = await useCase.execute({ keyword: 'demo', specialty: 'oncology', zone: '4' });

    expect(summary.itemsFetched).toBe(20);
    expect(summary.pagesFetched).toBe(2);
  });

  it('corta cuando el proveedor deja de devolver nextPageToken', async () => {
    const { useCase } = buildUseCase({ totalAvailable: 13, maxResults: 20 });

    const summary = await useCase.execute({
      keyword: 'demo',
      specialty: 'cardiology',
      zone: '10',
    });

    expect(summary.itemsFetched).toBe(13);
    expect(summary.pagesFetched).toBe(2);
  });

  it('es idempotente: repetir la sincronizacion no duplica registros', async () => {
    const { repository, useCase } = buildUseCase({ totalAvailable: 15 });

    await useCase.execute({ keyword: 'demo', specialty: 'pediatrics', zone: '11' });
    await useCase.execute({ keyword: 'demo', specialty: 'pediatrics', zone: '11' });

    const stored = await repository.findBy({ specialty: 'pediatrics' }, 1, 100);
    expect(stored.totalItems).toBe(15);
  });

  it('rechaza la sincronizacion mientras el cooldown sigue vigente', async () => {
    const { repository, useCase } = buildUseCase({ totalAvailable: 15, cooldownMinutes: 30 });

    await useCase.execute({ keyword: 'demo', specialty: 'neurology', zone: '10' });

    // Falla en lugar de devolver el resumen de la corrida anterior: quien llama
    // debe poder distinguir una sincronizacion real de una omitida
    await expect(
      useCase.execute({ keyword: 'demo', specialty: 'neurology', zone: '10' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PLACE_IMPORT_COOLDOWN_ACTIVE, statusCode: 429 });

    expect(repository.listImportRuns()).toHaveLength(1);
  });

  it('no bloquea otra variante de la misma especialidad y zona', async () => {
    const { repository, useCase } = buildUseCase({ totalAvailable: 15, cooldownMinutes: 30 });

    // El cooldown existe para no repetir la misma consulta, no para impedir que
    // el catalogo recorra sus variantes: cada una devuelve registros distintos
    await useCase.execute({ keyword: 'neurologia zona 10', specialty: 'neurology', zone: '10' });
    await useCase.execute({ keyword: 'neurologo zona 10', specialty: 'neurology', zone: '10' });

    expect(repository.listImportRuns()).toHaveLength(2);
  });

  it('vuelve a sincronizar cuando el cooldown ya vencio', async () => {
    let currentTime = new Date('2026-03-01T10:00:00.000Z');
    const { repository, useCase } = buildUseCase({
      totalAvailable: 15,
      cooldownMinutes: 30,
      now: () => currentTime,
    });

    await useCase.execute({ keyword: 'demo', specialty: 'neurology', zone: '10' });
    currentTime = new Date('2026-03-01T11:00:00.000Z');
    await useCase.execute({ keyword: 'demo', specialty: 'neurology', zone: '10' });

    expect(repository.listImportRuns()).toHaveLength(2);
  });

  it('deja pasar una sola de dos sincronizaciones identicas simultaneas', async () => {
    const { repository, useCase } = buildUseCase({ totalAvailable: 15, cooldownMinutes: 30 });

    // El caso que el planteamiento anterior no cubria: leia la ultima corrida y
    // decidia, pero el registro solo se escribia al terminar, de modo que entre
    // esa lectura y esa escritura cabia una peticion identica y las dos
    // llamaban a Google. Ahora el turno se toma antes de la primera llamada.
    const results = await Promise.allSettled([
      useCase.execute({ keyword: 'demo', specialty: 'neurology', zone: '10' }),
      useCase.execute({ keyword: 'demo', specialty: 'neurology', zone: '10' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(repository.listImportRuns()).toHaveLength(1);
  });

  it('mantiene el turno tomado aunque la sincronizacion falle a mitad', async () => {
    const repository = new InMemoryPlacesRepository();
    const useCase = new ImportPlacesUseCase({
      provider: {
        fetchPage: () => Promise.reject(AppError.providerUnavailable('Google no respondio')),
      },
      repository,
      pageSize: 10,
      maxResults: 20,
      cooldownMinutes: 30,
      freshness: new FreshnessPolicy({ ttlMinutes: 30, retentionHours: 24 }),
      generateImportId: () => 'imp_test',
    });

    await expect(
      useCase.execute({ keyword: 'demo', specialty: 'neurology', zone: '10' }),
    ).rejects.toThrow();

    // Un fallo del proveedor no debe abrir la puerta a reintentos inmediatos:
    // si Google respondio con error una vez, insistir de golpe gasta cuota sin
    // motivo. El turno se libera cuando vence el cooldown, como cualquier otro.
    await expect(
      useCase.execute({ keyword: 'demo', specialty: 'neurology', zone: '10' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PLACE_IMPORT_COOLDOWN_ACTIVE });

    expect(repository.listImportRuns()).toHaveLength(0);
  });

  it('purga los registros que superaron la retencion antes de escribir', async () => {
    const expired: Place = {
      placeId: 'expired_001',
      name: 'Registro vencido',
      formattedAddress: '1a Calle 1-01, Zona 1, Guatemala',
      specialty: 'oncology',
      zone: '1',
      sourceKeyword: 'oncologo zona 1 Guatemala',
      createdAt: '2020-01-01T00:00:00.000Z',
      collectedAt: '2020-01-01T00:00:00.000Z',
      phoneNumber: '',
      website: '',
    };

    const { repository, useCase } = buildUseCase({ totalAvailable: 5, seed: [expired] });

    await useCase.execute({ keyword: 'demo', specialty: 'oncology', zone: '4' });

    const stored = await repository.findBy({ zone: '1' }, 1, 100);
    expect(stored.totalItems).toBe(0);
  });

  it('rechaza una especialidad fuera del catalogo con 422', async () => {
    const { useCase } = buildUseCase({ totalAvailable: 10 });

    await expect(
      useCase.execute({ keyword: 'demo', specialty: 'astrology', zone: '4' }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'specialty_not_supported' });
  });

  it('registra la corrida de sincronizacion', async () => {
    const { repository, useCase } = buildUseCase({ totalAvailable: 5 });

    const summary = await useCase.execute({
      keyword: 'demo',
      specialty: 'neurology',
      zone: '10',
    });

    expect(summary.importId).toBe('imp_test');
    expect(repository.listImportRuns()).toHaveLength(1);
  });

  it('reporta cuando un lugar ya existia bajo otra especialidad', async () => {
    // Fijo porque la purga por retencion corre antes del fetch: con la fecha
    // real, un placeId sembrado con collectedAt viejo desaparecería antes de
    // que el import llegara a compararlo.
    const now = new Date('2026-03-01T12:00:00.000Z');

    const repository = new InMemoryPlacesRepository([
      {
        placeId: 'compartido',
        name: 'Centro Medico Compartido',
        formattedAddress: '1a Calle 1-01, Zona 1, Guatemala',
        specialty: 'oncology',
        zone: '1',
        sourceKeyword: 'oncologo zona 1 Guatemala',
        createdAt: '2026-03-01T11:00:00.000Z',
        collectedAt: '2026-03-01T11:00:00.000Z',
        phoneNumber: '',
        website: '',
      },
    ]);

    // El proveedor real puede devolver el mismo placeId para la busqueda de
    // otra especialidad: MockPlacesProvider no lo simula porque namespacea el
    // placeId por especialidad, asi que hace falta uno a medida.
    const useCase = new ImportPlacesUseCase({
      provider: {
        fetchPage: async () => ({
          places: [
            {
              placeId: 'compartido',
              name: 'Centro Medico Compartido',
              formattedAddress: '1a Calle 1-01, Zona 1, Guatemala',
              specialty: 'cardiology',
              zone: '1',
              sourceKeyword: 'cardiologo zona 1 Guatemala',
              createdAt: now.toISOString(),
              collectedAt: now.toISOString(),
              phoneNumber: '',
              website: '',
            },
          ],
        }),
      },
      repository,
      pageSize: 10,
      maxResults: 20,
      cooldownMinutes: 0,
      freshness: new FreshnessPolicy({ ttlMinutes: 30, retentionHours: 24 }),
      now: () => now,
    });

    const summary = await useCase.execute({
      keyword: 'cardiologo zona 1 Guatemala',
      specialty: 'cardiology',
      zone: '1',
    });

    expect(summary.specialtyConflicts).toEqual([
      {
        placeId: 'compartido',
        name: 'Centro Medico Compartido',
        previousSpecialty: 'oncology',
        newSpecialty: 'cardiology',
      },
    ]);
  });

  it('no reporta conflictos cuando ningun lugar cambia de especialidad', async () => {
    const { useCase } = buildUseCase({ totalAvailable: 5 });

    const summary = await useCase.execute({ keyword: 'demo', specialty: 'oncology', zone: '4' });

    expect(summary.specialtyConflicts).toEqual([]);
  });

  it('propaga el error del proveedor sin exponer detalles internos', async () => {
    const repository = new InMemoryPlacesRepository();
    const useCase = new ImportPlacesUseCase({
      provider: {
        fetchPage: async () => {
          throw AppError.providerUnavailable('Places API is unreachable or timed out');
        },
      },
      repository,
      pageSize: 10,
      maxResults: 20,
      cooldownMinutes: 0,
      freshness: new FreshnessPolicy({ ttlMinutes: 30, retentionHours: 24 }),
    });

    await expect(
      useCase.execute({ keyword: 'demo', specialty: 'oncology', zone: '4' }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'places_provider_unavailable' });
  });
});
