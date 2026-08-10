import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from '@/app.js';
import { buildContainer } from '@/config/container.js';

/**
 * Adaptador para Firebase Cloud Functions.
 *
 * Es deliberadamente delgado: envuelve la misma aplicacion Express que corre en
 * Docker. El despliegue cambia el envoltorio, no la logica.
 */
const REGION = 'us-central1';

type ExpressApp = ReturnType<typeof createApp>;

let appPromise: Promise<ExpressApp> | null = null;

/**
 * Construye el contenedor en la primera peticion, no al cargar el modulo.
 *
 * Antes de desplegar, Firebase importa este archivo para descubrir que
 * funciones exporta, y da **10 segundos** para ello. Construir el contenedor
 * ahi dentro llamaba a `applicationDefault()`, que busca credenciales y acaba
 * consultando el servidor de metadatos: en el contenedor de analisis ese
 * servidor no existe, de modo que la busqueda se agotaba sola tras unos nueve
 * segundos. Funciono varias veces por poco margen hasta que dejo de funcionar,
 * con un error que no menciona credenciales sino
 * `Cannot determine backend specification`.
 *
 * Diferirlo cambia donde se paga ese tiempo: el analisis del despliegue pasa a
 * ser inmediato y la primera peticion de cada instancia fria carga con la
 * inicializacion. Es el compromiso que recomienda Firebase, y aqui sale barato
 * porque las instancias se reutilizan entre invocaciones.
 *
 * Si la construccion falla, la promesa no se cachea: un fallo transitorio al
 * conectar con Firestore dejaria la instancia inservible el resto de su vida.
 */
function getApp(): Promise<ExpressApp> {
  appPromise ??= buildContainer()
    .then((container) => createApp(container))
    .catch((error: unknown) => {
      appPromise = null;
      throw error;
    });

  return appPromise;
}

export const api = onRequest(
  {
    region: REGION,
    secrets: ['GOOGLE_MAPS_API_KEY'],
    invoker: 'public',
  },
  async (request, response) => {
    const app = await getApp();
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
