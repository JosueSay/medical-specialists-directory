import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Configuracion de Vite.
 *
 * Lee el .env de la raiz del monorepo (envDir) para que puertos y URLs vivan en
 * un solo archivo compartido con el backend y con Docker.
 */
export default defineConfig(({ mode }) => {
  // La raiz del monorepo, dos niveles arriba de apps/frontend
  const envDir = fileURLToPath(new URL('../../', import.meta.url));
  const env = loadEnv(mode, envDir, '');

  /**
   * Las variables del proceso tienen prioridad sobre el archivo .env.
   *
   * Esto permite que el contenedor del frontend reciba solo las variables que
   * necesita, en lugar de montar el .env completo del monorepo: ese archivo
   * contiene la API key de Google, que la UI no usa y no tiene por que ver.
   */
  const readVar = (key: string): string | undefined => process.env[key] ?? env[key];

  const frontendPort = Number(readVar('FRONTEND_PORT') ?? 5173);
  const backendPort = Number(readVar('BACKEND_PORT') ?? 4000);
  // Dentro de Docker el backend responde por el nombre del servicio, no por localhost
  const backendHost = readVar('BACKEND_INTERNAL_HOST') ?? 'localhost';
  const usePolling = readVar('WATCH_USE_POLLING') === 'true';

  return {
    envDir,
    // Solo las variables con este prefijo se inyectan en el bundle del navegador
    envPrefix: 'VITE_',
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        // Alias interno: si mañana cambia la estructura de carpetas, se toca aqui
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: {
      host: '0.0.0.0',
      port: frontendPort,
      // Falla en vez de saltar a otro puerto: el puerto es configuracion, no azar
      strictPort: true,
      watch: {
        // El polling es lo unico que detecta cambios de forma fiable sobre
        // volumenes montados en Docker Desktop y WSL2
        usePolling,
        interval: Number(readVar('WATCH_POLL_INTERVAL') ?? 300),
      },
      hmr: {
        // Puerto que el navegador usa para el websocket de hot reload
        clientPort: frontendPort,
      },
      proxy: {
        // Evita CORS en desarrollo: la UI llama a /api y Vite reenvia al backend
        '/api': {
          target: `http://${backendHost}:${backendPort}`,
          changeOrigin: true,
        },
      },
    },

    preview: {
      host: '0.0.0.0',
      port: frontendPort,
      strictPort: true,
    },

    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      target: 'es2022',
    },
  };
});
