# Entorno de desarrollo

Guía operativa del repositorio: cómo levantarlo, qué hace cada carpeta y qué se configura dónde. El diseño del sistema completo está en [design.md](design.md).

## Requisitos

| Herramienta | Versión       | Nota                                                       |
| :---------- | :------------ | :--------------------------------------------------------- |
| Node.js     | 22 o superior | La versión exacta está en `.nvmrc`                         |
| pnpm        | 10 o superior | `corepack enable` lo habilita sin instalarlo aparte        |
| Docker      | opcional      | Alternativa a Node local; además provee el CLI de Firebase |

## Puesta en marcha

```bash
cp .env.example .env
pnpm install
pnpm run --filter @msd/contracts build
pnpm dev
```

`pnpm dev` levanta en paralelo el contrato en modo watch, el backend con nodemon y el frontend con Vite. La UI queda en `http://localhost:5173` y la API en `http://localhost:4000/api/v1`.

Con los valores por defecto no hace falta cuenta de Google ni de Firebase: el backend arranca con datos de ejemplo en memoria y un proveedor simulado.

### Con Docker

```bash
docker compose up --build              # backend y frontend con hot reload
docker compose --profile emulator up   # agrega el emulador de Firestore
```

Para probar las imágenes de producción en local:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

Los contenedores siguen el prefijo del proyecto más un nombre temático de mitología griega:

| Servicio    | Contenedor      | Rol                                          |
| :---------- | :-------------- | :------------------------------------------- |
| `asclepius` | `msd-asclepius` | API HTTP, dios de la medicina                |
| `hygieia`   | `msd-hygieia`   | UI de consulta, diosa de la salud            |
| `mnemosyne` | `msd-mnemosyne` | Emulador de Firestore, titán de la memoria   |
| `hermes`    | `msd-hermes`    | CLI de Firebase, mensajero: sesión y deploys |

La red es `msd-olympus` y el volumen de datos del emulador `msd-mnemosyne-data`.

### Seguridad de las imágenes

Las tres imágenes siguen las mismas reglas, porque casi todos los avisos de un escáner vienen de la base y no del código propio:

- **Rama de Alpine fijada y con soporte** (`node:22-alpine3.24`, `nginx:1.30-alpine3.24`). Una rama sin mantenimiento deja de recibir parches y arrastra vulnerabilidades que ninguna actualización de paquetes corrige. La versión menor de Node y de nginx queda flotante para recibir parches sin saltos de sistema base.
- **`apk upgrade --no-cache`** en las capas que llegan al runtime, para aplicar lo publicado después de que se construyó la imagen base.
- **Java 21 LTS** en el emulador. El JRE es el componente que más avisos aporta; mantenerlo en una versión con soporte es lo que baja el conteo.
- **Usuario sin privilegios** (`node`) en el emulador y en el runtime del backend.

Para revisar el estado de una imagen:

```bash
docker scout quickview msd-mnemosyne
docker scout cves msd-mnemosyne --only-severity critical,high
```

Si el escáner sigue reportando avisos sobre el JRE, la vía siguiente es subir a `openjdk25-jre-headless` en `docker/firestore-emulator/Dockerfile`, o reemplazar la imagen propia por la de Google (`gcr.io/google.com/cloudsdktool/google-cloud-cli` con los emuladores), a cambio de perder la interfaz de emuladores de Firebase.

Conviene recordar que el emulador es una herramienta de desarrollo local: no se despliega ni se expone fuera de la máquina de cada integrante.

## Firebase: sesión, emuladores y despliegue

El CLI de Firebase corre containerizado en el servicio `hermes`, de modo que nadie necesita instalar Node ni `firebase-tools` en su máquina. La sesión y la caché de emuladores quedan en volúmenes (`msd-hermes-config`, `msd-hermes-cache`), así que solo se inicia sesión una vez.

```bash
docker compose --profile tools build hermes                            # una sola vez
docker compose --profile tools run --rm hermes login --no-localhost    # abre la URL que imprime
docker compose --profile tools run --rm hermes use <projectId>         # fija el proyecto destino
docker compose --profile tools run --rm hermes projects:list           # verifica la sesión
```

`firebase use` escribe `.firebaserc` en la raíz. **Ese archivo no se versiona**: cada integrante apunta a su propio proyecto y responde por el gasto de su cuenta.

### Suite completa de emuladores

```bash
docker compose --profile tools run --rm --service-ports hermes emulators:start
```

Levanta Functions, Firestore, Hosting y la interfaz de emuladores en los puertos del `.env`. No se usa junto con `docker compose --profile emulator up`: `mnemosyne` y `hermes` comparten los puertos de Firestore.

El desarrollo diario no lo necesita. `docker compose up` con `PERSISTENCE_DRIVER=memory` cubre casi todo; el emulador entra cuando se trabaja contra Firestore o se quiere verificar el empaquetado real de la función antes de desplegar.

### Despliegue

```bash
docker compose --profile tools run --rm hermes deploy --only functions
docker compose --profile tools run --rm hermes deploy --only hosting
```

Cada comando ejecuta antes sus hooks de `predeploy`: compilar el contrato y, según el caso, empaquetar la función o construir la UI.

La función no se sube tal cual está en `apps/backend`. Firebase corre `npm install` dentro de la nube, donde el protocolo `workspace:` de pnpm no existe, así que `pnpm run --filter @msd/backend bundle` genera en `apps/backend/.deploy/` un artefacto autocontenido: el código del workspace incrustado en un solo archivo, las dependencias de npm declaradas normalmente y `functions.env` copiado como `.env`. El razonamiento está en [design.md](design.md#empaquetado-para-el-despliegue).

`apps/backend/functions.env` es la configuración de la función desplegada y **se versiona**: no contiene secretos. La API key de Google llega desde Secret Manager y el identificador del proyecto lo provee el propio runtime.

### Verificar la whitelist contra Firestore en local

La whitelist en producción vive en un documento de Firestore. Para probar ese camino sin desplegar, se levanta el emulador de Firestore y se arranca el backend apuntando a él:

```bash
docker compose --profile emulator up mnemosyne
PERSISTENCE_DRIVER=firestore FIRESTORE_EMULATOR_HOST=localhost:8080 \
  FIREBASE_PROJECT_ID=demo-msd IP_WHITELIST= pnpm dev:backend
```

Con el documento `config/ipWhitelist` vacío o inexistente, toda petición a `/api/v1/places` responde `403`; al agregar la IP desde la interfaz del emulador, la siguiente petición pasa en menos de 60 segundos, que es lo que dura la caché.

El emulador de **Functions** no sirve para esta verificación: entrega la petición sin socket ni cabecera `X-Forwarded-For`, de modo que no existe IP de cliente y todo responde `403`. Es una limitación del emulador, no del middleware.

## Estructura del repositorio

```bash
apps/
  backend/          API HTTP con arquitectura limpia
    src/
      config/       variables de entorno, whitelist y composition root
      domain/       entidades, puertos y política de frescura
      application/  casos de uso
      infrastructure/ adaptadores de Firestore y Places API
      interfaces/   capa HTTP: rutas, controladores, middlewares y validadores
      shared/       logger, errores y constructores de respuesta
    tests/
  frontend/         UI de consulta en React
    src/
      api/          cliente HTTP tipado contra el contrato
      components/   componentes de interfaz reutilizables
      config/       lectura de variables VITE_
      features/     vistas y hooks del directorio
      i18n/         diccionarios y proveedor de idioma
      theme/        tema claro y oscuro
    tests/
packages/
  contracts/        contrato compartido: rutas, códigos, tipos de request y response
config/             configuración no sensible y versionada
docker/             imágenes auxiliares
docs/               documentación del proyecto
```

## Scripts

| Comando                                 | Qué hace                                                         |
| :-------------------------------------- | :--------------------------------------------------------------- |
| `pnpm dev`                              | Contrato, backend y frontend en paralelo con recarga en caliente |
| `pnpm build`                            | Compila contrato, backend y frontend                             |
| `pnpm test`                             | Ejecuta las pruebas de todos los paquetes                        |
| `pnpm typecheck`                        | Verifica tipos sin emitir archivos                               |
| `pnpm lint` / `pnpm lint:fix`           | ESLint sobre todo el monorepo                                    |
| `pnpm format` / `pnpm format:check`     | Prettier                                                         |
| `pnpm check`                            | Formato, lint, tipos y pruebas en una sola pasada                |
| `pnpm docker:up` / `pnpm docker:down`   | Ciclo de vida de los contenedores de desarrollo                  |
| `pnpm run --filter @msd/backend bundle` | Genera el artefacto de despliegue de la Cloud Function           |

## Configuración

### Variables de entorno

Un solo archivo `.env` en la raíz sirve al backend, al frontend y a Docker. Toda variable existe documentada en `.env.example` y ambos archivos se mantienen sincronizados.

- El backend valida las variables al arrancar con un esquema Zod en `apps/backend/src/config/env.ts`. Si falta algo o está mal formado, el proceso falla ahí y no a mitad de una petición.
- El frontend solo recibe las variables con prefijo `VITE_`, que quedan expuestas en el bundle: nunca se pone un secreto ahí.
- Los puertos se cambian en un único lugar y los toman tanto los procesos locales como los contenedores.

### Selección de adaptadores

Dos variables deciden con qué infraestructura corre el sistema sin tocar una línea de lógica de negocio:

| Variable                 | Valores               | Efecto                                                       |
| :----------------------- | :-------------------- | :----------------------------------------------------------- |
| `PERSISTENCE_DRIVER`     | `memory`, `firestore` | Repositorio en memoria con datos de ejemplo o Firestore real |
| `PLACES_PROVIDER_DRIVER` | `mock`, `google`      | Proveedor simulado sin costo o Places API real               |

Es la ventaja concreta de los puertos del dominio: la implementación se elige en el composition root (`apps/backend/src/config/container.ts`).

### Whitelist de IPs

El control de acceso se resuelve antes de cualquier controlador. La lista se administra como configuración, nunca en código:

1. `IP_WHITELIST` en el `.env`, para desarrollo local y CI. Acepta IPs sueltas y rangos CIDR separados por coma.
2. Un documento de Firestore en despliegue, editable desde la consola. Su ubicación la definen `FIRESTORE_WHITELIST_COLLECTION` y `FIRESTORE_WHITELIST_DOCUMENT`, y su formato es:

```json
{
  "allowed": [
    { "cidr": "203.0.113.10/32", "label": "oficina" },
    { "cidr": "198.51.100.0/24", "label": "red del ministerio" }
  ]
}
```

Las entradas se cachean 60 segundos, así que un cambio en la consola aplica en menos de un minuto sin volver a desplegar. Si la fuente falla, no se autorizan IPs nuevas: el sistema cierra el paso en vez de abrirlo.

El endpoint `GET /health` queda fuera de la whitelist porque lo consultan Docker y el orquestador, y no expone información del dominio.

### Alias de importación

Ambas aplicaciones importan con `@/` en lugar de rutas relativas encadenadas, de modo que mover una carpeta no obliga a reescribir imports:

| Aplicación | Alias            | Definido en                                           |
| :--------- | :--------------- | :---------------------------------------------------- |
| Backend    | `@/*` a `src/*`  | `tsconfig.json`, resuelto en el build por `tsc-alias` |
| Frontend   | `@/*` a `src/*`  | `tsconfig.json` y `vite.config.ts`                    |
| Ambas      | `@msd/contracts` | Dependencia de workspace                              |

En el backend los imports internos llevan extensión `.js` porque el proyecto se ejecuta como ESM nativo; TypeScript resuelve el archivo `.ts` correspondiente.

### Hot reload

| Aplicación | Mecanismo         | Detalle                                                                                           |
| :--------- | :---------------- | :------------------------------------------------------------------------------------------------ |
| Backend    | nodemon con `tsx` | Observa `src` y el `dist` del contrato; usa polling para funcionar sobre volúmenes montados       |
| Frontend   | Vite              | `server.watch.usePolling` se controla con `WATCH_USE_POLLING`, necesario en WSL2 y Docker Desktop |

El proxy de Vite reenvía `/api` al backend en desarrollo, de modo que no hace falta configurar CORS para trabajar.

## Internacionalización

El backend nunca devuelve texto para el usuario final: devuelve un `code` que el frontend traduce contra `apps/frontend/src/i18n/es.json` y `en.json`. Una prueba automática verifica que ambos diccionarios estén sincronizados y que todo código del contrato tenga traducción, así que agregar un código nuevo sin su mensaje rompe la suite.

## Tema claro y oscuro

La preferencia se guarda en `localStorage` y se aplica como atributo `data-theme` en `<html>`. Un script en `index.html` lo fija antes del primer render para evitar el parpadeo. Los colores son tokens semánticos (`surface`, `content`, `brand`) definidos en `apps/frontend/src/styles/main.css`: cambiar la paleta se hace en un solo lugar. Con la preferencia en `system`, la UI sigue los cambios del sistema operativo en vivo.

## Pruebas

Vitest en ambas aplicaciones. El backend prueba los casos de uso con adaptadores en memoria y la capa HTTP completa con supertest, incluidos el rechazo por IP, los errores de validación y el formato de las respuestas. El frontend prueba la traducción y el cliente HTTP.

```bash
pnpm test              # todo el monorepo
pnpm run --filter @msd/backend test:watch
```

## Antes de abrir un Pull Request

```bash
pnpm check
```

Ejecuta formato, lint, tipos y pruebas en el mismo orden que debería correr la integración continua.
