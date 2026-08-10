import { describe, expect, it } from 'vitest';
import { hasReadableName } from '@/infrastructure/providers/googlePlacesProvider.js';

describe('hasReadableName', () => {
  it('descarta los nombres que no contienen ninguna letra ni digito', () => {
    // Casos reales o plausibles de Google Maps: el negocio declara su nombre y
    // nadie lo valida. La corrida completa del catalogo trajo uno asi.
    expect(hasReadableName('.')).toBe(false);
    expect(hasReadableName('---')).toBe(false);
    expect(hasReadableName('   ')).toBe(false);
    expect(hasReadableName('')).toBe(false);
  });

  it('acepta un nombre de un solo caracter si ese caracter identifica', () => {
    // La base tiene un establecimiento llamado "H". Es escueto, pero es un
    // nombre: la regla descarta lo que no dice nada, no lo que dice poco.
    expect(hasReadableName('H')).toBe(true);
    expect(hasReadableName('7')).toBe(true);
  });

  it('acepta acentos y enies, que el rango ASCII dejaria fuera', () => {
    expect(hasReadableName('Óptica')).toBe(true);
    expect(hasReadableName('Ñ')).toBe(true);
  });

  it('acepta un nombre que empieza por simbolo pero contiene texto', () => {
    expect(hasReadableName('+Salud')).toBe(true);
    expect(hasReadableName('¡Clinica!')).toBe(true);
  });
});
