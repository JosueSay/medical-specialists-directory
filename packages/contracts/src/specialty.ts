/**
 * Catalogos cerrados de especialidades y zonas.
 *
 * Viven aqui y no en un JSON de configuracion porque de esta lista se deriva el
 * tipo `Specialty`: backend y frontend obtienen verificacion en compilacion, y
 * una especialidad inexistente falla al compilar en lugar de en ejecucion.
 *
 * El backend rechaza con `specialty_not_supported` cualquier valor fuera de la
 * lista, y el frontend arma el selector a partir de ella.
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
  'generalMedicine',
] as const;

export type Specialty = (typeof SUPPORTED_SPECIALTIES)[number];

/**
 * Zonas de la Ciudad de Guatemala: 22 en total, numeradas del 1 al 25.
 * Las zonas 20, 22 y 23 no existen porque ese territorio pertenece a Mixco,
 * San Miguel Petapa y Santa Catarina Pinula. Incluirlas gastaria llamadas
 * facturables buscando en un area que no es del municipio.
 */
export const SUPPORTED_ZONES = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '21',
  '24',
  '25',
] as const;

export type Zone = (typeof SUPPORTED_ZONES)[number];

/**
 * Variantes de busqueda por especialidad.
 *
 * Places API indexa establecimientos, no personas, y no modela la especialidad
 * medica como atributo. Por eso las variantes usan formas que pueden ser nombre
 * de un local:
 *
 *   - sustantivo de disciplina      `cardiologia`
 *   - adjetivo relacional           `clinica cardiologica`
 *   - campo semantico               `centro cardiovascular`
 *
 * Se descarta el sustantivo agentivo (`cardiologo`, `pediatra`), que designa al
 * profesional y no al establecimiento. Es la forma que sugiere el enunciado del
 * curso; la desviacion esta justificada en docs/design.md y se verifica de forma
 * empirica antes de la corrida completa.
 *
 * No todas las especialidades completan las tres formas: forzar un termino que
 * arrastra otro rubro (`piel` trae centros de estetica, `optica` trae comercios
 * de lentes) reduce la calidad de los datos en lugar de mejorarla.
 */
export const SPECIALTY_KEYWORD_VARIANTS: Record<Specialty, readonly string[]> = {
  oncology: ['oncologia', 'clinica oncologica'],
  cardiology: ['cardiologia', 'clinica cardiologica', 'centro cardiovascular'],
  pediatrics: ['pediatria', 'clinica pediatrica', 'centro infantil medico'],
  dermatology: ['dermatologia', 'clinica dermatologica'],
  gynecology: ['ginecologia', 'clinica ginecologica', 'centro gineco-obstetrico'],
  neurology: ['neurologia', 'clinica neurologica', 'centro de neurociencias'],
  ophthalmology: ['oftalmologia', 'clinica oftalmologica'],
  orthopedics: ['ortopedia', 'clinica ortopedica', 'centro de traumatologia'],
  psychiatry: ['psiquiatria', 'clinica psiquiatrica', 'centro de salud mental'],
  generalMedicine: ['medicina general', 'clinica de medicina general'],
};

export function isSupportedSpecialty(value: string): value is Specialty {
  return (SUPPORTED_SPECIALTIES as readonly string[]).includes(value);
}

export function isSupportedZone(value: string): value is Zone {
  return (SUPPORTED_ZONES as readonly string[]).includes(value);
}

/** Arma la consulta que se envia a Places API para una variante y una zona. */
export function buildSearchKeyword(variant: string, zone: string): string {
  return `${variant} zona ${zone} Guatemala`;
}
