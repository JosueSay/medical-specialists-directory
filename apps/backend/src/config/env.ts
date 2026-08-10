import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { API_BASE_PATH as CONTRACT_API_BASE_PATH } from '@msd/contracts';

/**
 * Configuracion tipada del backend.
 *
 * Todo valor configurable entra por variable de entorno y se valida aqui una
 * sola vez: si falta algo o esta mal formado, el proceso falla al arrancar y no
 * a mitad de una peticion. Ningun otro modulo lee `process.env` directamente.
 */

const ENV_FILE_CANDIDATES = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];

for (const candidate of ENV_FILE_CANDIDATES) {
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate, override: false, quiet: true });
    break;
  }
}

const booleanFromString = z
  .string()
  .transform((value) => value.trim().toLowerCase() === 'true')
  .pipe(z.boolean());

const csvList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )
  .pipe(z.array(z.string()));

/**
 * En Cloud Functions el identificador del proyecto lo provee el runtime y no se
 * puede declarar a mano: Firebase reserva el prefijo `FIREBASE_` en los
 * archivos de entorno de la funcion.
 */
const runtimeProjectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ENV: z.enum(['local', 'development', 'staging', 'production']).default('local'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  BACKEND_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // El valor por defecto sale del contrato, que lo deriva de `API_VERSION`. Con
  // `/api/v1` escrito aqui a mano, subir la version del contrato habria movido
  // al frontend sin mover al backend: la UI llamaria a una ruta que el servidor
  // no sirve, y nada avisaria hasta la primera peticion.
  API_BASE_PATH: z.string().startsWith('/').default(CONTRACT_API_BASE_PATH),
  CORS_ALLOWED_ORIGINS: csvList.default(['http://localhost:5173']),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(60),

  // Whitelist: IP_WHITELIST manda en desarrollo local; en despliegue la lista
  // vive en un documento de Firestore editable desde la consola (RNF-01).
  IP_WHITELIST_ENABLED: booleanFromString.default(true),
  IP_WHITELIST: csvList.default([]),
  FIRESTORE_WHITELIST_COLLECTION: z.string().default('config'),
  FIRESTORE_WHITELIST_DOCUMENT: z.string().default('ipWhitelist'),

  PERSISTENCE_DRIVER: z.enum(['memory', 'firestore']).default('memory'),
  PLACES_PROVIDER_DRIVER: z.enum(['mock', 'google']).default('mock'),
  SEED_ON_STARTUP: booleanFromString.default(true),

  GOOGLE_MAPS_API_KEY: z.string().default(''),
  GOOGLE_PLACES_BASE_URL: z.string().url().default('https://places.googleapis.com/v1'),
  // Paginacion de la sincronizacion: paginas de 10 hasta el tope del enunciado
  PLACES_PAGE_SIZE: z.coerce.number().int().min(1).max(20).default(10),
  PLACES_MAX_RESULTS: z.coerce.number().int().min(1).max(200).default(20),
  PLACES_INCLUDED_TYPE: z.string().default('doctor'),
  PLACES_STRICT_TYPE_FILTERING: booleanFromString.default(true),
  PLACES_LANGUAGE_CODE: z.string().min(2).max(5).default('es'),
  PLACES_REGION_CODE: z.string().min(2).max(2).default('GT'),

  // Politica de frescura del cache
  PLACES_TTL_MINUTES: z.coerce.number().int().min(1).default(30),
  PLACES_RETENTION_HOURS: z.coerce.number().int().min(1).default(24),
  SYNC_COOLDOWN_MINUTES: z.coerce.number().int().min(0).default(1),

  FIREBASE_PROJECT_ID: z.string().default(runtimeProjectId),
  FIRESTORE_PLACES_COLLECTION: z.string().default('places'),
  FIRESTORE_IMPORT_RUNS_COLLECTION: z.string().default('importRuns'),
  // Turnos de sincronizacion: un documento por combinacion de keyword y zona,
  // que es lo que hace atomico el cooldown. Coleccion aparte de `importRuns`
  // para que esa conserve el historial completo de corridas.
  FIRESTORE_IMPORT_SLOTS_COLLECTION: z.string().default('importSlots'),
  FIRESTORE_EMULATOR_HOST: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno invalidas:\n${issues}`);
  }

  return result.data;
}

export const env: Env = parseEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Valida las combinaciones que solo tienen sentido en conjunto. */
export function assertRuntimeConfig(): void {
  if (env.PLACES_PROVIDER_DRIVER === 'google' && env.GOOGLE_MAPS_API_KEY.length === 0) {
    throw new Error('PLACES_PROVIDER_DRIVER=google requiere GOOGLE_MAPS_API_KEY');
  }

  if (env.PERSISTENCE_DRIVER === 'firestore' && env.FIREBASE_PROJECT_ID.length === 0) {
    throw new Error('PERSISTENCE_DRIVER=firestore requiere FIREBASE_PROJECT_ID');
  }

  if (isProduction && !env.IP_WHITELIST_ENABLED) {
    throw new Error('La whitelist de IPs no puede deshabilitarse en produccion (RNF-01)');
  }

  // La retencion define cuando se purgan los campos de Google; debe ser mayor
  // que el TTL, si no un registro nacería ya purgado.
  if (env.PLACES_RETENTION_HOURS * 60 <= env.PLACES_TTL_MINUTES) {
    throw new Error('PLACES_RETENTION_HOURS debe cubrir mas tiempo que PLACES_TTL_MINUTES');
  }
}
