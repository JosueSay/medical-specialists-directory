/**
 * Catalogo de especialidades soportadas. El backend rechaza con
 * `unsupported_specialty` cualquier valor fuera de esta lista y el frontend
 * arma el selector a partir de ella, de modo que ambos no se desincronizan.
 */

export const SUPPORTED_SPECIALTIES = [
  'oncology',
  'cardiology',
  'pediatrics',
  'dermatology',
  'gynecology',
  'neurology',
  'ophthalmology',
  'orthopedics',
  'psychiatry',
  'general_medicine',
] as const;

export type Specialty = (typeof SUPPORTED_SPECIALTIES)[number];

/** Termino de busqueda enviado a Places API por especialidad. */
export const SPECIALTY_SEARCH_KEYWORDS: Record<Specialty, string> = {
  oncology: 'oncologo',
  cardiology: 'cardiologo',
  pediatrics: 'pediatra',
  dermatology: 'dermatologo',
  gynecology: 'ginecologo',
  neurology: 'neurologo',
  ophthalmology: 'oftalmologo',
  orthopedics: 'ortopedista',
  psychiatry: 'psiquiatra',
  general_medicine: 'medico general',
};

export function isSupportedSpecialty(value: string): value is Specialty {
  return (SUPPORTED_SPECIALTIES as readonly string[]).includes(value);
}
