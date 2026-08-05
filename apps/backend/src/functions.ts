import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from '@/app.js';
import { buildContainer } from '@/config/container.js';

/**
 * Adaptador para Firebase Cloud Functions.
 *
 * Es deliberadamente delgado: envuelve la misma aplicacion Express que corre en
 * Docker. El despliegue cambia el envoltorio, no la logica.
 *
 * El contenedor se construye una vez por instancia fria y se reutiliza entre
 * invocaciones, que es lo que permite amortizar la conexion a Firestore.
 */
const appPromise = buildContainer().then((container) => createApp(container));

export const api = onRequest(
  {
    region: 'us-central1',
    secrets: ['GOOGLE_MAPS_API_KEY'],
    invoker: 'public',
  },
  async (request, response) => {
    const app = await appPromise;
    app(request, response);
  },
);
