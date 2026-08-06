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
const REGION = 'us-central1';

const appPromise = buildContainer().then((container) => createApp(container));

export const api = onRequest(
  {
    region: REGION,
    secrets: ['GOOGLE_MAPS_API_KEY'],
    invoker: 'public',
  },
  async (request, response) => {
    const app = await appPromise;
    app(request, response);
  },
);

/**
 * Verificacion del pipeline de despliegue, entregable de la Semana 1.
 *
 * Queda fuera de la whitelist por la misma razon que el health check: no toca
 * el dominio, no consulta Firestore y no revela entorno ni version. Su unico
 * proposito es confirmar que el proyecto compila, sube y responde.
 */
export const helloWorld = onRequest({ region: REGION, invoker: 'public' }, (_request, response) => {
  response.status(200).type('text/plain').send('Hello World');
});
