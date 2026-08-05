import { describe, expect, it } from 'vitest';
import { ERROR_CODES, SUCCESS_CODES, SUPPORTED_SPECIALTIES } from '@msd/contracts';
import { dictionaryKeys, translate } from '@/i18n/translate';

describe('diccionarios de i18n', () => {
  it('mantiene es y en sincronizados', () => {
    const spanishKeys = dictionaryKeys('es').sort();
    const englishKeys = dictionaryKeys('en').sort();

    expect(spanishKeys).toEqual(englishKeys);
  });

  it('traduce todos los codigos que devuelve el backend', () => {
    const codes = [...Object.values(SUCCESS_CODES), ...Object.values(ERROR_CODES)];

    for (const code of codes) {
      expect(translate(code, 'es')).not.toBe(code);
      expect(translate(code, 'en')).not.toBe(code);
    }
  });

  it('traduce todas las especialidades del catalogo', () => {
    for (const specialty of SUPPORTED_SPECIALTIES) {
      expect(translate(`specialty_${specialty}`, 'es')).not.toBe(`specialty_${specialty}`);
    }
  });

  it('devuelve la clave cruda cuando falta la traduccion', () => {
    expect(translate('clave_inexistente', 'es')).toBe('clave_inexistente');
  });

  it('interpola parametros', () => {
    const message = translate('pagination_summary', 'es', {
      page: 2,
      totalPages: 5,
      totalItems: 47,
    });

    expect(message).toContain('2');
    expect(message).toContain('47');
    expect(message).not.toContain('{{');
  });
});
