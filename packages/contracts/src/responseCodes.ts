/**
 * Codigos de respuesta de la API. Cada valor existe como clave en los
 * diccionarios de i18n del frontend (apps/frontend/src/i18n).
 * Agregar un codigo aqui obliga a agregar su traduccion en es.json y en.json.
 *
 * Convencion: `recurso_condicion` en snake_case. El recurso va primero para que
 * el catalogo se lea agrupado.
 */

export const SUCCESS_CODES = {
  PLACE_LIST: 'place_list',
  PLACE_IMPORT_CREATED: 'place_import_created',
  SPECIALTY_LIST: 'specialty_list',
  SERVICE_HEALTHY: 'service_healthy',
} as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'validation_error',
  IP_NOT_ALLOWED: 'ip_not_allowed',
  SPECIALTY_NOT_SUPPORTED: 'specialty_not_supported',
  ZONE_NOT_SUPPORTED: 'zone_not_supported',
  PLACE_IMPORT_COOLDOWN_ACTIVE: 'place_import_cooldown_active',
  PLACES_PROVIDER_UNAVAILABLE: 'places_provider_unavailable',
  RESOURCE_NOT_FOUND: 'resource_not_found',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  INTERNAL_ERROR: 'internal_error',
} as const;

/**
 * Codigos usados dentro de `errors.details` para errores de campo.
 * Son genericos a proposito: el contexto lo aporta el campo `field` del detalle,
 * de modo que agregar un parametro nuevo no obliga a inventar un codigo nuevo.
 */
export const FIELD_ERROR_CODES = {
  REQUIRED_FIELD: 'required_field',
  INVALID_TYPE: 'invalid_type',
  OUT_OF_RANGE: 'out_of_range',
  NOT_IN_CATALOG: 'not_in_catalog',
} as const;

export type SuccessCode = (typeof SUCCESS_CODES)[keyof typeof SUCCESS_CODES];
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[keyof typeof FIELD_ERROR_CODES];
export type ResponseCode = SuccessCode | ErrorCode | FieldErrorCode;

const ERROR_CODE_VALUES: ReadonlySet<string> = new Set(Object.values(ERROR_CODES));

/** `true` si el codigo pertenece al catalogo de errores de la API. */
export function isErrorCode(code: string): code is ErrorCode {
  return ERROR_CODE_VALUES.has(code);
}
