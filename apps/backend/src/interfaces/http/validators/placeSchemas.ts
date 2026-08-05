import { z, type ZodType } from 'zod';
import { FIELD_ERROR_CODES, PAGINATION_DEFAULTS, type ErrorDetail } from '@msd/contracts';
import { AppError } from '@/shared/appError.js';

/**
 * Validacion de entrada de la capa HTTP. Todo parametro se valida antes de
 * llegar al caso de uso; un valor fuera de rango responde 400 con
 * `validation_error` y el detalle por campo.
 */

/**
 * El esquema valida solo el formato. La pertenencia al catalogo de zonas se
 * comprueba en el caso de uso, igual que la especialidad: un valor bien formado
 * pero fuera del catalogo es un fallo de regla de negocio (422), no de sintaxis
 * (400). Mantener ambos catalogos en la misma capa evita que la API responda
 * codigos distintos ante errores equivalentes.
 */
const zoneSchema = z
  .string()
  .min(1, 'zone is required')
  .max(3, 'zone must be at most 3 characters')
  .regex(/^\d{1,3}$/, 'zone must be numeric');

export const createPlaceImportSchema = z.object({
  keyword: z.string().min(1, 'keyword is required').max(120),
  specialty: z.string().min(1, 'specialty is required'),
  zone: zoneSchema,
});

export const listPlacesQuerySchema = z.object({
  specialty: z.string().min(1).optional(),
  zone: zoneSchema.optional(),
  q: z.string().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(PAGINATION_DEFAULTS.page),
  pageSize: z.coerce
    .number()
    .int()
    .min(PAGINATION_DEFAULTS.minPageSize)
    .max(PAGINATION_DEFAULTS.maxPageSize)
    .default(PAGINATION_DEFAULTS.pageSize),
});

export type CreatePlaceImportBody = z.infer<typeof createPlaceImportSchema>;
export type ListPlacesQuery = z.infer<typeof listPlacesQuerySchema>;

/** Mapea el codigo interno de Zod al codigo de error del contrato. */
function toFieldErrorCode(issueCode: string): string {
  switch (issueCode) {
    case 'invalid_type':
      return FIELD_ERROR_CODES.REQUIRED_FIELD;
    case 'too_small':
    case 'too_big':
      return FIELD_ERROR_CODES.OUT_OF_RANGE;
    default:
      return FIELD_ERROR_CODES.INVALID_TYPE;
  }
}

/** Ejecuta un esquema y convierte el fallo en un AppError de validacion. */
export function validate<TSchema extends ZodType>(
  schema: TSchema,
  payload: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(payload);

  if (result.success) {
    return result.data;
  }

  const details: ErrorDetail[] = result.error.issues.map((issue) => ({
    ...(issue.path.length > 0 ? { field: issue.path.join('.') } : {}),
    code: toFieldErrorCode(issue.code),
    message: issue.message,
  }));

  throw AppError.validation('Request validation failed', details);
}
