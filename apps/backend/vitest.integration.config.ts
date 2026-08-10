import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));
const contractsPath = fileURLToPath(new URL('../../packages/contracts/src', import.meta.url));

/**
 * Pruebas de integracion contra el emulador de Firestore.
 *
 * Van en una configuracion aparte de las unitarias porque necesitan un servicio
 * externo corriendo: mezclarlas haria que `pnpm test` fallara en cualquier
 * maquina sin el emulador levantado, y las pruebas que no dependen de nada
 * dejarian de poder ejecutarse solas.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)\.js$/, replacement: `${srcPath}/$1.ts` },
      { find: /^@\//, replacement: `${srcPath}/` },
      { find: /^@msd\/contracts$/, replacement: `${contractsPath}/index.ts` },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globals: false,
    // Sin paralelismo: todas las pruebas comparten las mismas colecciones del
    // emulador y se pisarian entre si al limpiarlas
    fileParallelism: false,
    // Cargar firebase-admin y abrir la primera conexion al emulador supera con
    // holgura los 5 segundos por defecto. El margen es para el arranque en
    // frio, no para operaciones lentas: una vez conectado, cada prueba tarda
    // decenas de milisegundos.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      APP_ENV: 'local',
      LOG_LEVEL: 'error',
      FIREBASE_PROJECT_ID: 'msd-integration-tests',
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080',
    },
  },
});
