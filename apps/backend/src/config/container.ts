import { ImportPlacesUseCase } from '@/application/importPlacesUseCase.js';
import { ListPlacesUseCase } from '@/application/listPlacesUseCase.js';
import { FreshnessPolicy } from '@/domain/freshnessPolicy.js';
import type { PlacesProvider } from '@/domain/ports/placesProvider.js';
import type { PlacesRepository } from '@/domain/ports/placesRepository.js';
import { env } from '@/config/env.js';
import {
  CachedWhitelistSource,
  EnvWhitelistSource,
  type WhitelistSource,
} from '@/config/ipWhitelist.js';
import { getFirestoreClient } from '@/infrastructure/persistence/firestoreClient.js';
import { FirestorePlacesRepository } from '@/infrastructure/persistence/firestorePlacesRepository.js';
import { FirestoreWhitelistSource } from '@/infrastructure/persistence/firestoreWhitelistSource.js';
import { InMemoryPlacesRepository } from '@/infrastructure/persistence/inMemoryPlacesRepository.js';
import { SEED_PLACES } from '@/infrastructure/persistence/seedPlaces.js';
import { GooglePlacesProvider } from '@/infrastructure/providers/googlePlacesProvider.js';
import { MockPlacesProvider } from '@/infrastructure/providers/mockPlacesProvider.js';
import { logger } from '@/shared/logger.js';

/**
 * Composition root: unico lugar donde se decide que implementacion concreta
 * cumple cada puerto. Cambiar de memoria a Firestore, o de datos simulados a
 * Google, es cambiar una variable de entorno; ninguna capa interna se entera.
 */
export interface AppContainer {
  repository: PlacesRepository;
  provider: PlacesProvider;
  whitelistSource: WhitelistSource;
  freshness: FreshnessPolicy;
  listPlacesUseCase: ListPlacesUseCase;
  importPlacesUseCase: ImportPlacesUseCase;
}

function buildProvider(): PlacesProvider {
  if (env.PLACES_PROVIDER_DRIVER === 'google') {
    logger.info('Proveedor de lugares: Google Places API');
    return new GooglePlacesProvider({
      apiKey: env.GOOGLE_MAPS_API_KEY,
      baseUrl: env.GOOGLE_PLACES_BASE_URL,
      languageCode: env.PLACES_LANGUAGE_CODE,
      regionCode: env.PLACES_REGION_CODE,
      includedType: env.PLACES_INCLUDED_TYPE,
      strictTypeFiltering: env.PLACES_STRICT_TYPE_FILTERING,
    });
  }

  logger.info('Proveedor de lugares: mock (no consume cuota)');
  return new MockPlacesProvider();
}

/**
 * La whitelist se lee de la variable de entorno en desarrollo y del documento
 * de Firestore en despliegue, siempre detras de una cache corta.
 */
async function buildWhitelistSource(): Promise<WhitelistSource> {
  if (env.IP_WHITELIST.length > 0) {
    logger.info('Whitelist: variable de entorno', { entries: env.IP_WHITELIST.length });
    return new CachedWhitelistSource(new EnvWhitelistSource(env.IP_WHITELIST));
  }

  if (env.PERSISTENCE_DRIVER === 'firestore') {
    logger.info('Whitelist: documento de Firestore', {
      collection: env.FIRESTORE_WHITELIST_COLLECTION,
      document: env.FIRESTORE_WHITELIST_DOCUMENT,
    });

    const db = await getFirestoreClient({
      projectId: env.FIREBASE_PROJECT_ID,
      emulatorHost: env.FIRESTORE_EMULATOR_HOST,
    });

    return new CachedWhitelistSource(
      new FirestoreWhitelistSource(
        db,
        env.FIRESTORE_WHITELIST_COLLECTION,
        env.FIRESTORE_WHITELIST_DOCUMENT,
      ),
    );
  }

  logger.warn('Whitelist vacia: ninguna IP quedara autorizada mientras este habilitada');
  return new CachedWhitelistSource(new EnvWhitelistSource([]));
}

async function buildRepository(): Promise<PlacesRepository> {
  if (env.PERSISTENCE_DRIVER === 'firestore') {
    logger.info('Persistencia: Firestore', { projectId: env.FIREBASE_PROJECT_ID });

    const db = await getFirestoreClient({
      projectId: env.FIREBASE_PROJECT_ID,
      emulatorHost: env.FIRESTORE_EMULATOR_HOST,
    });

    return new FirestorePlacesRepository(db, {
      placesCollection: env.FIRESTORE_PLACES_COLLECTION,
      importRunsCollection: env.FIRESTORE_IMPORT_RUNS_COLLECTION,
    });
  }

  const seed = env.SEED_ON_STARTUP ? SEED_PLACES : [];
  logger.info('Persistencia: memoria', { seededPlaces: seed.length });
  return new InMemoryPlacesRepository(seed);
}

export async function buildContainer(): Promise<AppContainer> {
  const repository = await buildRepository();
  const provider = buildProvider();
  const whitelistSource = await buildWhitelistSource();

  const freshness = new FreshnessPolicy({
    ttlMinutes: env.PLACES_TTL_MINUTES,
    retentionHours: env.PLACES_RETENTION_HOURS,
  });

  return {
    repository,
    provider,
    whitelistSource,
    freshness,
    listPlacesUseCase: new ListPlacesUseCase(repository, freshness),
    importPlacesUseCase: new ImportPlacesUseCase({
      provider,
      repository,
      freshness,
      pageSize: env.PLACES_PAGE_SIZE,
      maxResults: env.PLACES_MAX_RESULTS,
      cooldownMinutes: env.SYNC_COOLDOWN_MINUTES,
    }),
  };
}
