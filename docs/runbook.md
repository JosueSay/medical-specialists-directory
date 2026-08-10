# Runbook

Secuencia de comandos para llevar el proyecto de cero a desplegado, en orden y sin explicaciones intercaladas. Cada fase deja el sistema en un estado verificable, y ninguna necesita nada de las siguientes.

Este documento **no explica el porqué**: para eso están [development-setup.md](development-setup.md), que describe el entorno, [credentials-setup.md](credentials-setup.md), que cubre el recorrido de consola, y [design.md](design.md), que justifica las decisiones. Aquí solo van los comandos, en el orden que evita rehacer trabajo.

Los comandos asumen Linux, macOS o WSL. Las diferencias de PowerShell están anotadas donde existen.

## Antes de empezar

Elegir **un solo entorno** y no alternar. Los `node_modules` que instala pnpm contienen enlaces y binarios propios del sistema operativo: instalados desde WSL no funcionan al invocarlos desde Windows, y al revés. Cambiar de entorno obliga a reinstalar, lo que a su vez rompe el otro.

Trabajando en WSL, conviene además que el repositorio viva en el sistema de archivos de Linux (`~/repos/...`) y no en `/mnt/c` o `/mnt/d`: el acceso a disco a través del montaje es lento y el recargado en caliente lo sufre.

## Fase 1: repositorio en marcha

Deja el sistema funcionando con datos de ejemplo, sin cuentas ni credenciales.

```bash
git clone <url-del-repositorio>
cd medical-specialists-directory
cp .env.example .env
pnpm install
pnpm run --filter @msd/contracts build
pnpm dev
```

Verificación: la UI responde en `http://localhost:5173` y la API en `http://localhost:4000/api/v1`.

**Repetir `pnpm install` después de cada `git pull`.** Una dependencia agregada por otro integrante no aparece sola, y la ausencia puede no notarse hasta mucho después: `esbuild`, por ejemplo, solo lo usa el script de empaquetado, así que su falta no rompe ni el desarrollo ni las pruebas y aparece por primera vez al desplegar.

## Fase 2: contra Places API real

Requiere haber completado hasta el Paso 5 de [credentials-setup.md](credentials-setup.md): proyecto, API key restringida, cuotas y presupuesto.

En el `.env`:

```bash
GOOGLE_MAPS_API_KEY=<la key de desarrollo>
FIREBASE_PROJECT_ID=<el identificador del proyecto>
PLACES_PROVIDER_DRIVER=google
PERSISTENCE_DRIVER=memory
IP_WHITELIST=127.0.0.1,::1
```

`IP_WHITELIST` es obligatorio: con la lista vacía el middleware responde `403` a todo, incluida la máquina local.

Comprobar la key sin pasar por el backend:

```bash
KEY=$(grep -m1 '^GOOGLE_MAPS_API_KEY=' .env | cut -d= -f2- | tr -d '\r' | xargs)

curl -s -w '\nHTTP %{http_code}\n' -X POST 'https://places.googleapis.com/v1/places:searchText' \
  -H 'Content-Type: application/json' \
  -H "X-Goog-Api-Key: $KEY" \
  -H 'X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress' \
  -d '{"textQuery":"cardiologia zona 10 Guatemala","languageCode":"es","regionCode":"GT","pageSize":1}'
```

Devuelve `200` con un establecimiento real. El `tr -d '\r'` importa cuando el `.env` se editó desde Windows: el retorno de carro se cuela dentro del valor de la key.

En PowerShell, el cuerpo va en un archivo. Pasar el JSON en línea a `curl.exe` falla con `INVALID_ARGUMENT`, porque PowerShell reescribe las comillas antes de entregárselas al ejecutable:

```powershell
$bodyFile = Join-Path $env:TEMP "places-body.json"
'{"textQuery":"cardiologia zona 10 Guatemala","languageCode":"es","regionCode":"GT","pageSize":1}' | Out-File -Encoding ascii -NoNewline $bodyFile
$key = ((Get-Content .env | Where-Object { $_ -match '^GOOGLE_MAPS_API_KEY=' }) -replace '^GOOGLE_MAPS_API_KEY=','').Trim()
curl.exe -s -w "`nHTTP %{http_code}`n" -X POST "https://places.googleapis.com/v1/places:searchText" -H "Content-Type: application/json" -H "X-Goog-Api-Key: $key" -H "X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress" -d "@$bodyFile"
```

Luego, la sincronización completa a través del backend:

```bash
pnpm dev:backend
```

```bash
curl -s -w '\nHTTP %{http_code}\n' -X POST http://localhost:4000/api/v1/place-imports \
  -H 'Content-Type: application/json' \
  -d '{"keyword":"cardiologia zona 10 Guatemala","specialty":"cardiology","zone":"10"}'

curl -s 'http://localhost:4000/api/v1/places?specialty=cardiology&zone=10'
```

Devuelve `201` con `pagesFetched: 2` y hasta 18 resultados. Son **2 llamadas facturables**, dentro del umbral gratuito mensual.

Al terminar, devolver `PLACES_PROVIDER_DRIVER` a `mock`. Con el proveedor real activo, cada reinicio del servidor durante el desarrollo es una llamada potencial.

## Fase 3: evidencia de la whitelist

Entregable de la Semana 1. No llama a Google: `GET /places` lee de la base propia, así que conviene tener `PLACES_PROVIDER_DRIVER=mock`.

```bash
# Terminal A
pnpm dev:backend

# Terminal B: la IP local esta autorizada
curl -s -w '\nHTTP %{http_code}\n' 'http://localhost:4000/api/v1/places'
```

Responde `200`. Captura como `docs/images/ip-whitelist-200.png`.

```bash
# Terminal A: reiniciar con una lista que no incluye ninguna IP local
IP_WHITELIST=203.0.113.10 pnpm dev:backend

# Terminal B
curl -s -w '\nHTTP %{http_code}\n' 'http://localhost:4000/api/v1/places'
```

Responde `403` con `ip_not_allowed`. Captura como `docs/images/ip-whitelist-403.png`, incluyendo el log del backend donde aparece la IP rechazada.

La variable en la línea de comandos tiene prioridad sobre el `.env`, así que no hay que editar el archivo ni acordarse de revertirlo. Nodemon no vigila el `.env`, de modo que editarlo tampoco reiniciaría el proceso. `203.0.113.0/24` es un rango reservado para documentación y no corresponde a ninguna red real.

## Fase 4: sesión de Firebase

Requiere el Paso 6 de [credentials-setup.md](credentials-setup.md): Firebase agregado al proyecto y Firestore creada.

```bash
docker compose --profile tools build hermes
docker compose --profile tools run --rm hermes login --no-localhost
docker compose --profile tools run --rm hermes projects:list
docker compose --profile tools run --rm hermes use <identificador-del-proyecto>
```

El `login` pregunta por Gemini en el CLI y por telemetría: **responder `n` a ambas**. La segunda trae `Y` como valor por defecto, así que pulsar Enter la acepta.

`projects:list` sirve de verificación: si el proyecto no aparece, la sesión quedó abierta con otra cuenta de Google. `use` escribe `.firebaserc`, que no se versiona.

Sin Docker, los mismos subcomandos con `npx firebase-tools@latest`.

## Fase 5: contra Firestore real

Entregable de la Semana 2. Requiere el Paso 8 de [credentials-setup.md](credentials-setup.md): la cuenta de servicio con su clave en `keys/service-account.json`.

**Primero los índices, siempre.** Firestore rechaza con `FAILED_PRECONDITION` cualquier consulta que filtre por un campo y ordene por otro sin un índice compuesto que la cubra. No es una degradación de rendimiento: la petición falla entera.

```bash
docker compose --profile tools run --rm hermes deploy --only firestore
```

Sube reglas e índices. La construcción tarda unos minutos aunque las colecciones estén vacías; en **Firestore Database, Índices** deben quedar todos en _Habilitado_ antes de continuar.

En el `.env`:

```bash
PERSISTENCE_DRIVER=firestore
PLACES_PROVIDER_DRIVER=google
GOOGLE_APPLICATION_CREDENTIALS=../../keys/service-account.json
FIRESTORE_EMULATOR_HOST=
```

`FIRESTORE_EMULATOR_HOST` vacío es lo que hace que apunte a Firestore real; con cualquier valor escribiría en el emulador.

```bash
pnpm dev:backend
```

El arranque debe registrar `Persistencia: Firestore` con el identificador del proyecto. Si dice `memoria`, el driver no cambió; si falla buscando las credenciales, la ruta relativa no resolvió y hay que ponerla absoluta.

```bash
curl -s -w '\nHTTP %{http_code}\n' -X POST http://localhost:4000/api/v1/place-imports -H 'Content-Type: application/json' -d '{"keyword":"cardiologia zona 10 Guatemala","specialty":"cardiology","zone":"10"}'

curl -s 'http://localhost:4000/api/v1/places?specialty=cardiology&zone=10'
```

En la consola, **Firestore Database, Datos** debe mostrar `places` con un documento por lugar identificado por su `placeId`, e `importRuns` con el registro de la corrida. Captura como `docs/images/firestore-places.png`.

## Fase 6: desplegar `hello world`

Entregable de la Semana 1. Se despliega **solo esa función**, porque `api` declara el secreto `GOOGLE_MAPS_API_KEY` y el despliegue falla si aún no existe en Secret Manager.

```bash
docker compose --profile tools run --rm hermes deploy --only functions:api:helloWorld
```

El filtro lleva tres partes porque `firebase.json` declara un codebase con nombre. `--only functions:helloWorld` falla con `No function matches given --only filters`.

Qué pide la primera vez:

| Pregunta                        | Respuesta | Razón                                                                   |
| :------------------------------ | :-------- | :---------------------------------------------------------------------- |
| Corepack quiere descargar pnpm  | `Y`       | La imagen lo prepara como `root` y el contenedor corre como `node`      |
| Cuántos días conservar imágenes | `1`       | Cada despliegue genera una imagen; sin límite se acumulan y se facturan |

Tarda entre tres y ocho minutos: habilita seis APIs, empaqueta, sube y compila en la nube. Antes de subir importa el módulo para descubrir las funciones exportadas, y por eso aparecen los logs de arranque del backend con la configuración de producción.

Termina con `Deploy complete!` y la URL. Comprobar:

```bash
curl -s -w '\nHTTP %{http_code}\n' '<la URL que imprimio el deploy>'
```

Responde `Hello World` con `200`. Captura como `docs/images/hello-world-deploy.png`.

## Fase 7: desplegar la API completa

Requiere los Pasos 6 y 7 de [credentials-setup.md](credentials-setup.md): el documento `config/ipWhitelist` en Firestore y la segunda API key, la que no lleva restricción de IP.

```bash
docker compose --profile tools run --rm hermes functions:secrets:set GOOGLE_MAPS_API_KEY
docker compose --profile tools run --rm hermes deploy --only functions
docker compose --profile tools run --rm hermes deploy --only hosting
```

El valor del secreto es el de la key del despliegue, no el de la de desarrollo.

Sin el documento `config/ipWhitelist`, la función responde `403` a toda petición: la lista vacía cierra el paso, que es el comportamiento correcto pero da la impresión de un despliegue roto.

## Pruebas de integración

El adaptador de Firestore se prueba contra el emulador, no con dobles. No entran en `pnpm check` porque necesitan un servicio corriendo.

```bash
docker compose --profile emulator up mnemosyne        # en otra terminal
pnpm run --filter @msd/backend test:integration
```

No consumen cuota ni tocan la base real: el emulador es local. El criterio de qué cubren está en [standards/testing.md](standards/testing.md#pruebas-de-integración).

## Antes de abrir un Pull Request

```bash
pnpm check
```

Formato, linter, tipos y pruebas en el mismo orden que la integración continua.

## Errores frecuentes

| Síntoma                                                              | Causa                                                                                            | Solución                                                                                           |
| :------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| `HTTP 000` en un `curl`                                              | El servidor no está levantado, o la URL es un marcador                                           | Levantar el backend, o sustituir el marcador por la URL real                                       |
| `Cannot find package 'esbuild'`                                      | `node_modules` desactualizado tras un `git pull`                                                 | `pnpm install`                                                                                     |
| `Cannot find module ... prettier`                                    | `node_modules` instalado en otro sistema operativo                                               | Reinstalar en el entorno que se vaya a usar, y no alternar                                         |
| `ENOENT: uv_cwd`                                                     | El shell perdió su directorio de trabajo                                                         | `cd` con la ruta absoluta, o abrir otra terminal                                                   |
| `No function matches given --only filters`                           | Falta el segmento del codebase en el filtro                                                      | `--only functions:api:<nombre>`                                                                    |
| `INVALID_ARGUMENT` con `Unexpected token` al llamar a Google         | PowerShell deformó el JSON en línea                                                              | Pasar el cuerpo en un archivo con `-d "@archivo"`                                                  |
| `403` con `ip_not_allowed` sin haber cambiado nada                   | `IP_WHITELIST` vacío, o la IP de la red cambió                                                   | Agregar la IP actual a la lista                                                                    |
| `500` y en el log `FAILED_PRECONDITION: The query requires an index` | Falta un índice compuesto en `firestore.indexes.json`                                            | Declararlo en el archivo y `deploy --only firestore:indexes`, no crearlo desde el enlace del error |
| `500` y en el log `That index is currently building`                 | El índice existe pero aún se construye                                                           | Esperar a que aparezca como _Habilitado_ en la consola                                             |
| `403 SERVICE_DISABLED` desde Places API                              | Se habilitó la Places API heredada                                                               | Habilitar **Places API (New)**                                                                     |
| `Error: Failed to list functions for <proyecto>` en el primer deploy | Las APIs de Functions/Cloud Build/Artifact Registry se acaban de habilitar y todavía no propagan | Esperar uno o dos minutos y repetir el mismo comando                                               |
| `Command failed with signal "SIGINT"` al pulsar `Ctrl+C`             | Ninguna: pnpm reporta la señal como fallo                                                        | Ninguna                                                                                            |
