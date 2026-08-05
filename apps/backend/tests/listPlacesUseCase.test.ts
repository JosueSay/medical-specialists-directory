import { describe, expect, it } from 'vitest';
import { ListPlacesUseCase } from '@/application/listPlacesUseCase.js';
import { FreshnessPolicy } from '@/domain/freshnessPolicy.js';
import { InMemoryPlacesRepository } from '@/infrastructure/persistence/inMemoryPlacesRepository.js';
import { SEED_PLACES } from '@/infrastructure/persistence/seedPlaces.js';

function buildUseCase(ttlMinutes = 30) {
  return new ListPlacesUseCase(
    new InMemoryPlacesRepository(SEED_PLACES),
    new FreshnessPolicy({ ttlMinutes, retentionHours: 24 }),
  );
}

describe('ListPlacesUseCase', () => {
  it('filtra por especialidad y zona combinadas', async () => {
    const result = await buildUseCase().execute({
      specialty: 'oncology',
      zone: '4',
      page: 1,
      pageSize: 10,
    });

    expect(result.totalItems).toBe(2);
    expect(result.items.every((place) => place.zone === '4')).toBe(true);
  });

  it('pagina el resultado', async () => {
    const useCase = buildUseCase();

    const firstPage = await useCase.execute({ page: 1, pageSize: 5 });
    const secondPage = await useCase.execute({ page: 2, pageSize: 5 });

    expect(firstPage.items).toHaveLength(5);
    expect(firstPage.totalItems).toBe(SEED_PLACES.length);
    expect(secondPage.items[0]?.placeId).not.toBe(firstPage.items[0]?.placeId);
  });

  it('busca por texto libre sobre el nombre', async () => {
    const result = await buildUseCase().execute({ q: 'cardio', page: 1, pageSize: 10 });

    expect(result.totalItems).toBeGreaterThan(0);
    expect(result.items.every((place) => place.name.toLowerCase().includes('cardio'))).toBe(true);
  });

  it('devuelve solo los campos del contrato, sin campos internos', async () => {
    const result = await buildUseCase().execute({ page: 1, pageSize: 1 });
    const place = result.items[0];

    expect(place).toBeDefined();
    // `createdAt` es interno: el cliente no necesita saber cuando ingreso el registro
    expect(place).not.toHaveProperty('createdAt');
    // Campos eliminados del modelo por minimizacion
    expect(place).not.toHaveProperty('latitude');
    expect(place).not.toHaveProperty('rating');
    // Trazabilidad y frescura si se exponen a proposito
    expect(place).toHaveProperty('sourceKeyword');
    expect(place).toHaveProperty('website');
    expect(place).toHaveProperty('collectedAt');
  });

  it('marca los registros que superaron el TTL sin ocultarlos', async () => {
    const result = await buildUseCase(30).execute({ page: 1, pageSize: 5 });

    // Los datos semilla son antiguos: se devuelven, pero marcados
    expect(result.items).not.toHaveLength(0);
    expect(result.items.every((place) => place.stale)).toBe(true);
  });

  it('no marca los registros dentro del TTL', async () => {
    const tenYearsInMinutes = 10 * 365 * 24 * 60;
    const result = await buildUseCase(tenYearsInMinutes).execute({ page: 1, pageSize: 5 });

    expect(result.items.every((place) => place.stale)).toBe(false);
  });

  it('rechaza una especialidad fuera del catalogo con 422', async () => {
    await expect(
      buildUseCase().execute({ specialty: 'astrology', page: 1, pageSize: 10 }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'specialty_not_supported' });
  });
});
