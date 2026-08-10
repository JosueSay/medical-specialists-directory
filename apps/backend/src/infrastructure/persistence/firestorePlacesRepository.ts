import type { Firestore, Query } from 'firebase-admin/firestore';
import type { Specialty } from '@msd/contracts';
import type { ImportRun, Place } from '@/domain/entities/place.js';
import type {
  PagedResult,
  PlaceFilters,
  PlacesRepository,
} from '@/domain/ports/placesRepository.js';

export interface FirestoreRepositoryConfig {
  placesCollection: string;
  importRunsCollection: string;
}

/**
 * Documento tal como se guarda en Firestore. Incluye `nameLowercase`, un campo
 * derivado que solo existe para poder filtrar por texto: es un detalle de esta
 * capa y nunca sale hacia el dominio.
 */
interface PlaceDocument extends Place {
  nameLowercase: string;
}

/** Adaptador de persistencia sobre Firestore. */
export class FirestorePlacesRepository implements PlacesRepository {
  constructor(
    private readonly db: Firestore,
    private readonly config: FirestoreRepositoryConfig,
  ) {}

  async upsertMany(places: Place[]): Promise<number> {
    if (places.length === 0) {
      return 0;
    }

    const collection = this.db.collection(this.config.placesCollection);
    const batch = this.db.batch();

    for (const place of places) {
      const document: PlaceDocument = { ...place, nameLowercase: place.name.toLowerCase() };
      // merge conserva createdAt del documento existente y hace la escritura idempotente
      batch.set(collection.doc(place.placeId), document, { merge: true });
    }

    await batch.commit();
    return places.length;
  }

  async findBy(filters: PlaceFilters, page: number, pageSize: number): Promise<PagedResult<Place>> {
    let query: Query = this.db.collection(this.config.placesCollection);

    if (filters.specialty) {
      query = query.where('specialty', '==', filters.specialty);
    }

    if (filters.zone) {
      query = query.where('zone', '==', filters.zone);
    }

    if (filters.q) {
      // Firestore no tiene busqueda de texto completo: se filtra por prefijo
      // del nombre en minusculas. Una busqueda mas rica requiere un indice externo.
      const prefix = filters.q.trim().toLowerCase();
      query = query
        .where('nameLowercase', '>=', prefix)
        .where('nameLowercase', '<', `${prefix}`)
        .orderBy('nameLowercase');
    } else {
      query = query.orderBy('name');
    }

    const totalSnapshot = await query.count().get();
    const totalItems = totalSnapshot.data().count;

    const snapshot = await query
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const items = snapshot.docs.map((doc) => {
      const { nameLowercase: _ignored, ...place } = doc.data() as PlaceDocument;
      return place;
    });

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
