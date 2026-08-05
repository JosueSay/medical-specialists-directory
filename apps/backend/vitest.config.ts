import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));
const contractsPath = fileURLToPath(new URL('../../packages/contracts/src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // Los imports del backend usan la extension .js (requisito de ESM/NodeNext);
      // en tests se redirigen al archivo .ts real.
      { find: /^@\/(.*)\.js$/, replacement: `${srcPath}/$1.ts` },
      { find: /^@\//, replacement: `${srcPath}/` },
      { find: /^@msd\/contracts$/, replacement: `${contractsPath}/index.ts` },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    // Entorno fijo de pruebas: independiente del .env de cada integrante
    env: {
      NODE_ENV: 'test',
      APP_ENV: 'local',
      LOG_LEVEL: 'error',
      PERSISTENCE_DRIVER: 'memory',
      PLACES_PROVIDER_DRIVER: 'mock',
      SEED_ON_STARTUP: 'true',
      IP_WHITELIST_ENABLED: 'true',
      IP_WHITELIST: '127.0.0.1,::1',
      RATE_LIMIT_PER_MINUTE: '0',
    },
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/functions.ts'],
    },
  },
});
