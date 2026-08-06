/**
 * Empaqueta la Cloud Function para desplegarla.
 *
 * Firebase sube la carpeta de la funcion y corre `npm install` dentro de la
 * nube, donde el protocolo `workspace:` de pnpm no existe. Un despliegue
 * directo de `apps/backend` falla al resolver `@msd/contracts`.
 *
 * La salida es una carpeta autocontenida: el codigo del workspace queda
 * incrustado en un solo archivo y las dependencias de npm se declaran como
 * siempre, para que la nube las instale desde el registro.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(backendRoot, '.deploy');
const runtimeEnvFile = resolve(backendRoot, 'functions.env');

const pkg = JSON.parse(await readFile(resolve(backendRoot, 'package.json'), 'utf8'));

// Solo el paquete del workspace se incrusta. Las dependencias de npm quedan
// externas: firebase-admin carga modulos nativos y no sobrevive al empaquetado.
const dependencies = Object.fromEntries(
  Object.entries(pkg.dependencies).filter(([name]) => name !== '@msd/contracts'),
);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [resolve(backendRoot, 'src/functions.ts')],
  outfile: resolve(outDir, 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: Object.keys(dependencies),
  tsconfig: resolve(backendRoot, 'tsconfig.build.json'),
  logLevel: 'warning',
});

await writeFile(
  resolve(outDir, 'package.json'),
  `${JSON.stringify(
    {
      name: 'msd-functions',
      version: pkg.version,
      description: 'Artefacto de despliegue generado: no editar a mano',
      private: true,
      type: 'module',
      main: 'index.js',
      engines: { node: '22' },
      dependencies,
    },
    null,
    2,
  )}\n`,
);

// Configuracion de ejecucion de la funcion desplegada. No contiene secretos:
// la API key de Google se inyecta desde Secret Manager.
if (existsSync(runtimeEnvFile)) {
  await copyFile(runtimeEnvFile, resolve(outDir, '.env'));
} else {
  console.warn('functions.env no existe: la funcion se desplegara con los valores por defecto');
}

/**
 * Las dependencias se instalan tambien aqui, con npm y sin enlaces al
 * workspace. No es para ejecutar la funcion en local: el CLI de Firebase
 * inspecciona esta carpeta para descubrir las funciones antes de subirlas y
 * falla si no encuentra el SDK. El `package-lock.json` que queda es el que usa
 * la nube, de modo que se instalan las mismas versiones que se probaron aqui.
 */
execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: outDir,
  stdio: 'inherit',
});

console.log(`Funcion empaquetada en ${outDir}`);
