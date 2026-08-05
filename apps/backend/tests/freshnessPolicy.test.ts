import { describe, expect, it } from 'vitest';
import { FreshnessPolicy } from '@/domain/freshnessPolicy.js';
import type { Place } from '@/domain/entities/place.js';

const policy = new FreshnessPolicy({ ttlMinutes: 30, retentionHours: 24 });
const now = new Date('2026-03-01T12:00:00.000Z');

function buildPlace(updatedAt: string): Place {
  return {
    placeId: 'place_001',
    name: 'Centro de prueba',
    formattedAddress: '1a Calle 1-01, Zona 1, Guatemala',
    specialty: 'oncology',
    zone: '1',
    sourceKeyword: 'oncologo zona 1 Guatemala',
    createdAt: updatedAt,
    collectedAt: updatedAt,
    phoneNumber: '',
    website: '',
  };
}

describe('FreshnessPolicy', () => {
  it('considera vigente un registro dentro del TTL', () => {
    expect(policy.isStale(buildPlace('2026-03-01T11:45:00.000Z'), now)).toBe(false);
  });

  it('marca como desactualizado un registro que supero el TTL', () => {
    expect(policy.isStale(buildPlace('2026-03-01T11:00:00.000Z'), now)).toBe(true);
  });

  it('trata como desactualizado un registro con fecha ilegible', () => {
    expect(policy.isStale(buildPlace('fecha-invalida'), now)).toBe(true);
  });

  it('calcula la fecha limite de retencion', () => {
    expect(policy.retentionCutoff(now)).toBe('2026-02-28T12:00:00.000Z');
  });
});
