import type { Firestore } from 'firebase-admin/firestore';
import { logger } from '@/shared/logger.js';

export interface FirestoreClientConfig {
  projectId: string;
  /** Host del emulador. Vacio significa Firestore real. */
  emulatorHost: string;
}

let client: Firestore | null = null;

/**
 * Cliente de Firestore compartido.
 *
 * El SDK se carga de forma diferida para que el proyecto arranque sin
 * `firebase-admin` inicializado cuando se corre con el driver en memoria, y se
 * reutiliza entre invocaciones para no pagar la conexion en cada peticion.
 */
export async function getFirestoreClient(config: FirestoreClientConfig): Promise<Firestore> {
  if (client) {
    return client;
  }

  if (config.emulatorHost.length > 0) {
    process.env.FIRESTORE_EMULATOR_HOST = config.emulatorHost;
    logger.warn('Firestore apunta al emulador', { host: config.emulatorHost });
  }

  const { getApps, initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  if (getApps().length === 0) {
    initializeApp({
      projectId: config.projectId,
      // Con el emulador las credenciales no se usan, pero el SDK las exige
      ...(config.emulatorHost.length > 0 ? {} : { credential: applicationDefault() }),
    });
  }

  client = getFirestore();
  return client;
}
