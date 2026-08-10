import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ImportRun, Place } from '@/domain/entities/place.js';
import { getFirestoreClient } from '@/infrastructure/persistence/firestoreClient.js';
import { FirestorePlacesRepository } from '@/infrastructure/persistence/firestorePlacesRepository.js';

/**
 * El tipo se deriva de la fabrica en lugar de importarlo de `firebase-admin`.
 * El linter prohibe ese import fuera de `src/infrastructure` para que el SDK no
 * se filtre a otras capas, y la prueba no necesita una excepcion: el unico
 * punto legitimo donde se construye el cliente ya expone el tipo.
 */
type FirestoreClient = Awaited<ReturnType<typeof getFirestoreClient>>;

/**
 * Pruebas del adaptador de Firestore contra el emulador.
 *
 * Existen porque dos defectos llegaron a produccion sin que nada los detectara:
 * la purga filtraba por un campo inexistente y faltaba un indice compuesto. Las
 * pruebas unitarias usan el repositorio en memoria, de modo que ninguna
 * ejercitaba este adaptador; el unico entorno donde se comportaba distinto era
 * el unico que nadie probaba.
 *
 * Limite conocido: **el emulador no exige indices compuestos**. Estas pruebas
 * verifican que las consultas piden los campos correctos, no que los indices
 * esten declarados. Esa comprobacion solo la da Firestore real.
 */

const PLACES_COLLECTION = 'places';
const IMPORT_RUNS_COLLECTION = 'importRuns';

function buildPlace(overrides: Partial<Place> = {}): Place {
  return {
    placeId: 'place-1',
    name: 'Clinica Cardiologica del Valle',
    formattedAddress: '12 Calle 1-25, Zona 10',
    specialty: 'cardiology',
    zone: '10',
    phoneNumber: '2222 3333',
    website: '',
    sourceKeyword: 'cardiologia zona 10 Guatemala',
    createdAt: '2026-01-01T00:00:00.000Z',
    collectedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildImportRun(overrides: Partial<ImportRun> = {}): ImportRun {
  return {
    importId: 'run-1',
    keyword: 'cardiologia zona 10 Guatemala',
    specialty: 'cardiology',
    zone: '10',
    pagesFetched: 2,
    itemsFetched: 19,
    itemsUpserted: 19,
    specialtyConflicts: [],
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    ...overrides,
  };
}

async function clearCollection(db: FirestoreClient, name: string): Promise<void> {
  const snapshot = await db.collection(name).get();

  if (snapshot.empty) {
    return;
  }

  const batch = db.batch();
  for (const document of snapshot.docs) {
    batch.delete(document.ref);
  }
  await batch.commit();
}

describe('FirestorePlacesRepository contra el emulador', () => {
  let db: FirestoreClient;
  let repository: FirestorePlacesRepository;

  // El cliente se construye una sola vez: cargar firebase-admin y abrir la
  // primera conexion al emulador cuesta varios segundos, y repetirlo por prueba
  // no aporta aislamiento porque el SDK reutiliza la misma instancia.
  beforeAll(async () => {
    db = await getFirestoreClient({
      projectId: process.env.FIREBASE_PROJECT_ID ?? 'msd-integration-tests',
      emulatorHost: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080',
    });

    repository = new FirestorePlacesRepository(db, {
      placesCollection: PLACES_COLLECTION,
      importRunsCollection: IMPORT_RUNS_COLLECTION,
    });
  });

  // El aislamiento entre pruebas lo da vaciar las colecciones, no reconstruir
  // el cliente
  beforeEach(async () => {
    await clearCollection(db, PLACES_COLLECTION);
    await clearCollection(db, IMPORT_RUNS_COLLECTION);
  });

  afterAll(async () => {
    await clearCollection(db, PLACES_COLLECTION);
    await clearCollection(db, IMPORT_RUNS_COLLECTION);
  });

  describe('upsertMany', () => {
    it('usa el placeId como identificador del documento', async () => {
      await repository.upsertMany([buildPlace({ placeId: 'ChIJ_ejemplo' })]);

      const document = await db.collection(PLACES_COLLECTION).doc('ChIJ_ejemplo').get();

      expect(document.exists).toBe(true);
      expect(document.data()?.name).toBe('Clinica Cardiologica del Valle');
    });

    it('no duplica al sincronizar el mismo lugar dos veces', async () => {
      await repository.upsertMany([buildPlace()]);
      await repository.upsertMany([buildPlace({ name: 'Nombre corregido' })]);

      const snapshot = await db.collection(PLACES_COLLECTION).get();

      expect(snapshot.size).toBe(1);
      expect(snapshot.docs[0]?.data().name).toBe('Nombre corregido');
    });

    it('conserva createdAt del documento existente', async () => {
      await repository.upsertMany([buildPlace({ createdAt: '2025-06-01T00:00:00.000Z' })]);
      // La segunda escritura llega sin createdAt, como si el proveedor no lo diera
      const { createdAt: _ignored, ...withoutCreatedAt } = buildPlace();
      await repository.upsertMany([withoutCreatedAt as Place]);

      const document = await db.collection(PLACES_COLLECTION).doc('place-1').get();

      expect(document.data()?.createdAt).toBe('2025-06-01T00:00:00.000Z');
    });

    it('guarda la cadena vacia cuando el proveedor no entrega el dato', async () => {
      await repository.upsertMany([buildPlace({ website: '', phoneNumber: '' })]);

      const document = await db.collection(PLACES_COLLECTION).doc('place-1').get();

      expect(document.data()?.website).toBe('');
      expect(document.data()?.phoneNumber).toBe('');
    });

    /**
     * placeId es la clave del documento, asi que el mismo negocio real puede
     * coincidir con la busqueda de otra especialidad y perder su etiqueta
     * anterior sin dejar rastro, salvo por este reporte.
     */
    it('detecta cuando un placeId ya existia bajo otra especialidad', async () => {
      await repository.upsertMany([buildPlace({ placeId: 'compartido', specialty: 'oncology' })]);

      const { specialtyConflicts } = await repository.upsertMany([
        buildPlace({ placeId: 'compartido', specialty: 'cardiology', name: 'Centro Mixto' }),
      ]);

      expect(specialtyConflicts).toEqual([
        {
          placeId: 'compartido',
          name: 'Centro Mixto',
          previousSpecialty: 'oncology',
          newSpecialty: 'cardiology',
        },
      ]);

      const document = await db.collection(PLACES_COLLECTION).doc('compartido').get();
      expect(document.data()?.specialty).toBe('cardiology');
    });

    it('no reporta conflicto cuando la especialidad no cambia', async () => {
      await repository.upsertMany([buildPlace({ placeId: 'estable', specialty: 'cardiology' })]);

      const { specialtyConflicts } = await repository.upsertMany([
        buildPlace({ placeId: 'estable', specialty: 'cardiology', name: 'Nombre actualizado' }),
      ]);

      expect(specialtyConflicts).toEqual([]);
    });
  });

  describe('findBy', () => {
    beforeEach(async () => {
      await repository.upsertMany([
        buildPlace({
          placeId: 'a',
          name: 'Centro Cardiovascular',
          specialty: 'cardiology',
          zone: '10',
        }),
        buildPlace({ placeId: 'b', name: 'Alfa Cardiologia', specialty: 'cardiology', zone: '10' }),
        buildPlace({ placeId: 'c', name: 'Beta Cardiologia', specialty: 'cardiology', zone: '4' }),
        buildPlace({ placeId: 'd', name: 'Delta Pediatria', specialty: 'pediatrics', zone: '10' }),
      ]);
    });

    it('filtra por especialidad y zona a la vez', async () => {
      const result = await repository.findBy({ specialty: 'cardiology', zone: '10' }, 1, 10);

      expect(result.totalItems).toBe(2);
      expect(result.items.map((place) => place.placeId).sort()).toEqual(['a', 'b']);
    });

    it('ordena por nombre', async () => {
      const result = await repository.findBy({ specialty: 'cardiology' }, 1, 10);

      expect(result.items.map((place) => place.name)).toEqual([
        'Alfa Cardiologia',
        'Beta Cardiologia',
        'Centro Cardiovascular',
      ]);
    });

    it('devuelve el total sin paginar junto a la pagina solicitada', async () => {
      const result = await repository.findBy({}, 2, 2);

      expect(result.totalItems).toBe(4);
      expect(result.items).toHaveLength(2);
    });

    it('no expone campos ajenos a la entidad', async () => {
      const result = await repository.findBy({ specialty: 'pediatrics' }, 1, 10);

      expect(Object.keys(result.items[0] ?? {}).sort()).toEqual([
        'collectedAt',
        'createdAt',
        'formattedAddress',
        'name',
        'phoneNumber',
        'placeId',
        'sourceKeyword',
        'specialty',
        'website',
        'zone',
      ]);
    });
  });

  describe('findLastImportRun', () => {
    const KEYWORD = 'cardiologia zona 10 Guatemala';

    it('devuelve null cuando esa combinacion nunca se sincronizo', async () => {
      const run = await repository.findLastImportRun('oncologia zona 1 Guatemala', '1');

      expect(run).toBeNull();
    });

    it('devuelve la corrida mas reciente de esa keyword y zona', async () => {
      await repository.saveImportRun(
        buildImportRun({ importId: 'antigua', finishedAt: '2026-01-01T00:00:00.000Z' }),
      );
      await repository.saveImportRun(
        buildImportRun({ importId: 'reciente', finishedAt: '2026-02-01T00:00:00.000Z' }),
      );

      const run = await repository.findLastImportRun(KEYWORD, '10');

      expect(run?.importId).toBe('reciente');
    });

    it('no confunde corridas de otra zona con la consultada', async () => {
      await repository.saveImportRun(
        buildImportRun({ importId: 'zona-4', zone: '4', finishedAt: '2026-03-01T00:00:00.000Z' }),
      );
      await repository.saveImportRun(
        buildImportRun({ importId: 'zona-10', zone: '10', finishedAt: '2026-01-01T00:00:00.000Z' }),
      );

      const run = await repository.findLastImportRun(KEYWORD, '10');

      expect(run?.importId).toBe('zona-10');
    });

    /**
     * La regresion que vacio la primera corrida completa. Al agrupar por
     * especialidad, la primera variante bloqueaba a las demas durante todo el
     * cooldown y solo una de cada cuatro llegaba a ejecutarse.
     */
    it('no confunde otra variante de la misma especialidad y zona', async () => {
      await repository.saveImportRun(
        buildImportRun({
          importId: 'disciplina',
          keyword: 'cardiologia zona 10 Guatemala',
          finishedAt: '2026-01-01T00:00:00.000Z',
        }),
      );

      const run = await repository.findLastImportRun('cardiologo zona 10 Guatemala', '10');

      expect(run).toBeNull();
    });
  });

  describe('purgeExpired', () => {
    it('borra los registros cuyo collectedAt supera la retencion', async () => {
      await repository.upsertMany([
        buildPlace({ placeId: 'viejo', collectedAt: '2025-01-01T00:00:00.000Z' }),
        buildPlace({ placeId: 'reciente', collectedAt: '2026-06-01T00:00:00.000Z' }),
      ]);

      const purged = await repository.purgeExpired('2026-01-01T00:00:00.000Z');

      expect(purged).toBe(1);
      const restantes = await db.collection(PLACES_COLLECTION).get();
      expect(restantes.docs.map((document) => document.id)).toEqual(['reciente']);
    });

    it('no borra nada cuando ningun registro vencio', async () => {
      await repository.upsertMany([buildPlace({ collectedAt: '2026-06-01T00:00:00.000Z' })]);

      const purged = await repository.purgeExpired('2026-01-01T00:00:00.000Z');

      expect(purged).toBe(0);
      const restantes = await db.collection(PLACES_COLLECTION).get();
      expect(restantes.size).toBe(1);
    });

    /**
     * La regresion concreta que motivo estas pruebas. El adaptador filtraba por
     * `updatedAt`, campo que la entidad no tiene, y Firestore excluye de las
     * consultas de rango los documentos que carecen del campo consultado: la
     * purga devolvia cero sin error y la retencion no se aplicaba nunca.
     */
    it('purga aunque el documento no tenga campos de fecha ajenos a la entidad', async () => {
      await repository.upsertMany([buildPlace({ collectedAt: '2020-01-01T00:00:00.000Z' })]);

      const document = await db.collection(PLACES_COLLECTION).doc('place-1').get();
      expect(document.data()).not.toHaveProperty('updatedAt');

      await expect(repository.purgeExpired('2026-01-01T00:00:00.000Z')).resolves.toBe(1);
    });
  });
});
