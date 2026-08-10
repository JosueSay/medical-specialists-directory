import type { Firestore, Query } from 'firebase-admin/firestore';
import type { Specialty, SpecialtyConflictDto } from '@msd/contracts';
import type { ImportRun, Place } from '@/domain/entities/place.js';
import type {
  PagedResult,
  PlaceFilters,
  PlacesRepository,
  UpsertResult,
} from '@/domain/ports/placesRepository.js';

export interface FirestoreRepositoryConfig {
  placesCollection: string;
  importRunsCollection: string;
}

/** Adaptador de persistencia sobre Firestore. */
export class FirestorePlacesRepository implements PlacesRepository {
  constructor(
    private readonly db: Firestore,
    private readonly config: FirestoreRepositoryConfig,
  ) {}

  async upsertMany(places: Place[]): Promise<UpsertResult> {
    if (places.length === 0) {
      return { upserted: 0, specialtyConflicts: [] };
    }

    const collection = this.db.collection(this.config.placesCollection);
    const refs = places.map((place) => collection.doc(place.placeId));

    // Se lee el estado previo antes de escribir: es la unica forma de detectar
    // que un placeId ya existia bajo otra especialidad, porque el merge de mas
    // abajo pisa el campo sin dejar rastro de lo que tenia antes. El mismo
    // negocio real puede coincidir con la busqueda de mas de una especialidad
    // (un centro medico que aparece tanto en "oncologia" como en "medicina
    // general"), y placeId como clave del documento significa que la
    // sincronizacion mas reciente le gana la etiqueta a la anterior.
    const existingDocs = await this.db.getAll(...refs);
    const specialtyConflicts: SpecialtyConflictDto[] = [];

    existingDocs.forEach((doc, index) => {
      const existing = doc.data() as Place | undefined;
      const incoming = places[index];
      if (existing && incoming && existing.specialty !== incoming.specialty) {
        specialtyConflicts.push({
          placeId: incoming.placeId,
          name: incoming.name,
          previousSpecialty: existing.specialty,
          newSpecialty: incoming.specialty,
        });
      }
    });

    const batch = this.db.batch();
    places.forEach((place, index) => {
      // merge conserva createdAt del documento existente y hace la escritura idempotente
      batch.set(refs[index]!, place, { merge: true });
    });

    await batch.commit();
    return { upserted: places.length, specialtyConflicts };
  }

  async findBy(filters: PlaceFilters, page: number, pageSize: number): Promise<PagedResult<Place>> {
    let query: Query = this.db.collection(this.config.placesCollection);

    if (filters.specialty) {
      query = query.where('specialty', '==', filters.specialty);
    }

    if (filters.zone) {
      query = query.where('zone', '==', filters.zone);
    }

    query = query.orderBy('name');

    const totalSnapshot = await query.count().get();
    const totalItems = totalSnapshot.data().count;

    const snapshot = await query
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const items = snapshot.docs.map((doc) => doc.data() as Place);

    return { items, totalItems };
  }

  async saveImportRun(run: ImportRun): Promise<void> {
    await this.db.collection(this.config.importRunsCollection).doc(run.importId).set(run);
  }

  async findLastImportRun(specialty: Specialty, zone: string): Promise<ImportRun | null> {
    const snapshot = await this.db
      .collection(this.config.importRunsCollection)
      .where('specialty', '==', specialty)
      .where('zone', '==', zone)
      .orderBy('finishedAt', 'desc')
      .limit(1)
      .get();

    const document = snapshot.docs[0];
    return document ? (document.data() as ImportRun) : null;
  }

  async purgeExpired(expiredBefore: string): Promise<number> {
    // Solo el placeId puede conservarse indefinidamente: al superar la
    // retencion se borra el documento completo, incluidos los campos de Google.
    //
    // El campo es `collectedAt` y no `updatedAt`: la entidad no tiene ese
    // segundo campo, y Firestore excluye de las consultas de rango todo
    // documento que carezca del campo consultado. Filtrar por un campo
    // inexistente no da error, devuelve cero resultados, de modo que la
    // retencion dejaria de aplicarse sin que nada lo advirtiera.
    const snapshot = await this.db
      .collection(this.config.placesCollection)
      .where('collectedAt', '<', expiredBefore)
      .limit(500)
      .get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = this.db.batch();
    for (const document of snapshot.docs) {
      batch.delete(document.ref);
    }
    await batch.commit();

    return snapshot.size;
  }
}
