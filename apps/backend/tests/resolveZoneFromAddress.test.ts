import { describe, expect, it } from 'vitest';
import { SUPPORTED_ZONES } from '@msd/contracts';
import { resolveZoneFromAddress } from '@/infrastructure/providers/googlePlacesProvider.js';

/**
 * Las direcciones de estas pruebas son reales: salieron de la primera corrida
 * completa contra Places API. Inventarlas habria hecho que las pruebas
 * describieran lo que se espera de Google y no lo que Google devuelve.
 */
describe('resolveZoneFromAddress', () => {
  it('toma la zona del codigo postal de la ciudad', () => {
    const result = resolveZoneFromAddress(
      '6A Avenida 4-01, Cdad. de Guatemala 01010',
      SUPPORTED_ZONES,
    );

    expect(result).toEqual({ kind: 'resolved', zone: '10' });
  });

  it('descarta el cero a la izquierda para coincidir con el catalogo', () => {
    const result = resolveZoneFromAddress(
      '5a. Avenida 11-70 zona 1, Edificio Herrera, Cdad. de Guatemala 01001',
      SUPPORTED_ZONES,
    );

    expect(result).toEqual({ kind: 'resolved', zone: '1' });
  });

  it('coincide con la zona que la propia direccion menciona en texto', () => {
    const result = resolveZoneFromAddress(
      '17 Av. 28-01 Z.11, 17 Avenida 29-08, Cdad. de Guatemala 01011',
      SUPPORTED_ZONES,
    );

    expect(result).toEqual({ kind: 'resolved', zone: '11' });
  });

  it('marca fuera de alcance un codigo postal que no es de la ciudad', () => {
    const result = resolveZoneFromAddress('Cdad. de Guatemala 01057', SUPPORTED_ZONES);

    expect(result).toEqual({ kind: 'outOfScope' });
  });

  it('marca fuera de alcance las zonas que el catalogo excluye', () => {
    // Las zonas 20, 22 y 23 pertenecen a Mixco, San Miguel Petapa y Santa
    // Catarina Pinula, no al municipio de Guatemala
    const result = resolveZoneFromAddress('Cdad. de Guatemala 01020', SUPPORTED_ZONES);

    expect(result).toEqual({ kind: 'outOfScope' });
  });

  it('devuelve desconocida cuando la direccion no trae codigo postal', () => {
    const result = resolveZoneFromAddress('18 Avenida A 1-62, Cdad. de Guatemala', SUPPORTED_ZONES);

    expect(result).toEqual({ kind: 'unknown' });
  });

  /**
   * El caso que decidio no usar el texto de la direccion como fuente
   * alternativa. Esa zona 4 es de Villa Nueva, otro municipio, y solo el codigo
   * postal permite distinguirlo. Una lectura del texto la habria dado por buena.
   */
  it('no toma la zona del texto cuando pertenece a otro municipio', () => {
    const result = resolveZoneFromAddress(
      '4 Avenida 2-45 Zona 4 Colonia Venecia 2 Villa Nueva, Cdad. de Guatemala',
      SUPPORTED_ZONES,
    );

    expect(result).toEqual({ kind: 'unknown' });
  });
});
