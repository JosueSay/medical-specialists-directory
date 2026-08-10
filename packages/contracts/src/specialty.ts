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
 * Places API no modela la especialidad medica como atributo, asi que la unica
 * via es el texto. Las formas que se usan:
 *
 *   - sustantivo de disciplina      `cardiologia`
 *   - sustantivo agentivo           `cardiologo`
 *   - adjetivo relacional           `clinica cardiologica`
 *   - campo semantico               `centro cardiovascular`
 *
 * El agentivo estuvo descartado con el argumento de que designa al profesional
 * y no al establecimiento. La verificacion empirica lo refuto: aporta un 15% de
 * registros exclusivos, y son consultorios registrados con el nombre del medico,
 * que es justo lo que pide un directorio de especialistas. El detalle esta en
 * docs/design.md, seccion de verificaciones previas.
 *
 * Todas las variantes van sin tilde. El eje ortografico se comprobo y se
 * descarto: con y sin diacriticos los resultados coinciden en un 95%, y la
 * diferencia se comporta como ruido de ordenamiento.
 *
 * No todas las especialidades completan las cuatro formas: forzar un termino que
 * arrastra otro rubro (`piel` trae centros de estetica, `optica` trae comercios
 * de lentes) reduce la calidad de los datos en lugar de mejorarla.
 *
 * El agentivo esta comprobado en las diez especialidades, no solo en
 * cardiologia: todas aportan registros exclusivos frente a la forma de
 * disciplina. Nueve lo conservan; `generalMedicine` es la excepcion y la razon
 * esta junto a su entrada. Numeros por especialidad en docs/design.md, seccion
 * de verificaciones previas, y reproducible con
 * `apps/backend/scripts/compareKeywords.mjs --specialty=all --run`.
 */
export const SPECIALTY_KEYWORD_VARIANTS: Record<Specialty, readonly string[]> = {
  oncology: ['oncologia', 'oncologo', 'clinica oncologica'],
  cardiology: ['cardiologia', 'cardiologo', 'clinica cardiologica', 'centro cardiovascular'],
  pediatrics: ['pediatria', 'pediatra', 'clinica pediatrica', 'centro infantil medico'],
  dermatology: ['dermatologia', 'dermatologo', 'clinica dermatologica'],
  gynecology: ['ginecologia', 'ginecologo', 'clinica ginecologica', 'centro gineco-obstetrico'],
  neurology: ['neurologia', 'neurologo', 'clinica neurologica', 'centro de neurociencias'],
  ophthalmology: ['oftalmologia', 'oftalmologo', 'clinica oftalmologica'],
  orthopedics: ['ortopedia', 'ortopedista', 'clinica ortopedica', 'centro de traumatologia'],
  psychiatry: ['psiquiatria', 'psiquiatra', 'clinica psiquiatrica', 'centro de salud mental'],
  // Sin forma agentiva a proposito. `medico general` aportaba once registros
  // exclusivos, pero la inspeccion mostro que no eran medicina general: un
  // coloproctologo, una clinica de dermatologia, un centro de quiropracticos.
  // Se comporta como comodin que engancha a cualquier medico, de modo que su
  // aporte es volumen y no cobertura. Es la unica especialidad donde la forma
  // agentiva se descarta, y se descarta por precision, no por cantidad.
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
