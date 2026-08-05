import type { Firestore } from 'firebase-admin/firestore';
import {
  toWhitelistEntries,
  type WhitelistEntry,
  type WhitelistSource,
} from '@/config/ipWhitelist.js';
import { logger } from '@/shared/logger.js';

/**
 * Whitelist almacenada en un documento de Firestore.
 *
 * Formato esperado del documento:
 *   { allowed: [ { cidr: "203.0.113.10/32", label: "oficina" }, "198.51.100.4" ] }
 *
 * Se edita desde la consola de Firebase: cambiar de red no requiere volver a
 * desplegar ni exponer un endpoint de administracion.
 */
export class FirestoreWhitelistSource implements WhitelistSource {
  constructor(
    private readonly db: Firestore,
    private readonly collection: string,
    private readonly document: string,
  ) {}

  async getEntries(): Promise<WhitelistEntry[]> {
    const snapshot = await this.db.collection(this.collection).doc(this.document).get();

    if (!snapshot.exists) {
      logger.warn('Documento de whitelist inexistente: no se autoriza ninguna IP', {
        collection: this.collection,
        document: this.document,
      });
      return [];
    }

    const data = snapshot.data() as { allowed?: Array<string | { cidr?: string; label?: string }> };
    return toWhitelistEntries(data.allowed ?? [], 'firestore');
  }
}
