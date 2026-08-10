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

Tarda entre tres y ocho minutos: habilita seis APIs, empaqueta, sube y compila en la nube. Antes de subir importa el módulo para descubrir las funciones exportadas, con un limite de 10 segundos para esa carga.

Termina con `Deploy complete!` y la URL. Comprobar:

```bash
curl -s -w '\nHTTP %{http_code}\n' '<la URL que imprimio el deploy>'
```

Responde `Hello World` con `200`. Captura como `docs/images/hello-world-deploy.png`.

## Fase 7: desplegar la API completa

Entregable de la Semana 3. Son seis pasos y el orden entre ellos no es indiferente: el despliegue de la función concede a su cuenta de servicio el permiso de lectura sobre el secreto, así que el secreto tiene que existir antes.

### 1. Segunda API key

Paso 7 de [credentials-setup.md](credentials-setup.md). La key de desarrollo está restringida a una IP y la función sale a internet por un rango dinámico de Cloud Run, de modo que esa restricción la bloquearía.

Sin restricción de aplicación, y con restricción de API a **Places API (New)** y nada más. La lista de APIs aparece con todas marcadas porque habilitar Places desde Maps Platform enciende el paquete completo de Maps: hay que desmarcarlas y dejar una. El campo debe terminar diciendo `1 API`.

Captura: la lista de credenciales con las dos keys y su columna de restricciones, recortada antes del valor de la clave. `docs/images/deploy-api-key.png`.

### 2. La key en Secret Manager

```bash
docker compose --profile tools run --rm hermes functions:secrets:set GOOGLE_MAPS_API_KEY
```

Pide el valor por consola y **no lo enmascara**: no capturar esa pantalla. Termina con `Created a new secret version .../versions/1`.

Captura: menú **Seguridad**, **Secret Manager**, el secreto, pestaña **Versiones**. `docs/images/secret-manager-version.png`.

### 3. El documento `config/ipWhitelist`

Paso 6 de [credentials-setup.md](credentials-setup.md), con la estructura exacta y los dos enlaces "Agregar campo" que se confunden.

Sin este documento la función responde `403` a toda petición: la lista vacía cierra el paso, que es el comportamiento correcto pero da la impresión de un despliegue roto.

La IPv4 va con máscara `/32` y la IPv6 como prefijo `/64`, porque el sufijo lo rota el sistema operativo por privacidad y una entrada exacta caduca en horas.

Captura: la vista de datos con el documento expandido. `docs/images/firestore-ip-whitelist.png`.

### 4. La URL de la API en el bundle

**No hay nada que preparar.** El build de producción no lee ningún archivo de entorno: `vite.config.ts` apunta `envDir` fuera de la raíz al construir, y los valores salen de `apps/frontend/src/config/env.ts`. Se anota aquí porque durante un tiempo sí dependía del `.env`, y de ahí salieron dos fallos: una URL de `localhost` horneada en el bundle y React empaquetado en modo desarrollo.

Comprobación rápida tras construir, si se quiere:

```bash
grep -c localhost apps/frontend/dist/assets/*.js    # 0
```

### 5. Desplegar

```bash
docker compose --profile tools run --rm hermes deploy --only functions
docker compose --profile tools run --rm hermes deploy --only hosting
```

Entre tres y ocho minutos el primero. Antes de subir, el CLI importa el módulo para descubrir las funciones exportadas, y solo dispone de **10 segundos**: por eso el contenedor se construye en la primera petición y no al cargar el módulo.

Consecuencia práctica: la configuración de producción ya no aparece en la salida del despliegue. Se comprueba en los logs de la función después de la primera petición.

### 6. Verificar

```bash
curl -s -w '\nHTTP %{http_code}\n' 'https://<proyecto>.web.app/api/v1/places?specialty=cardiology&zone=10'
```

Responde `200` desde una IP de la whitelist y `403` con `ip_not_allowed` desde cualquier otra.

Capturas: la UI con filtros y resultados reales, y la paginación construida a partir de `meta.pagination`.

Qué obliga a repetir este despliegue y qué no está en [Qué exige volver a desplegar](#qué-exige-volver-a-desplegar).

## Redesplegar desde otra máquina

Ningún archivo `.env` interviene: la función toma su configuración de `apps/backend/functions.env`, que está versionado, y el build del frontend no lee archivos de entorno. La API key tampoco hace falta en la máquina, porque vive en Secret Manager y el artefacto que se sube no la contiene — comprobable buscando `AIza` dentro de `apps/backend/.deploy/` después de empaquetar.

Lo que sí hay que rehacer son dos cosas que no viajan en el repositorio, porque son de cada equipo:

```bash
pnpm install                                                        # en el sistema operativo que se vaya a usar
docker compose --profile tools build hermes
docker compose --profile tools run --rm hermes login --no-localhost # la sesion vive en un volumen local
docker compose --profile tools run --rm hermes use <proyecto>       # .firebaserc esta ignorado
docker compose --profile tools run --rm hermes projects:list        # verifica cuenta y proyecto
```

`projects:list` importa: si el proyecto no aparece como `(current)`, el despliegue iría a otro sitio o fallaría, y ninguna de las dos cosas se nota hasta que ya está en marcha.

A partir de ahí, los dos comandos de la Fase 7 bastan.

El `.env` sigue haciendo falta para todo lo demás: desarrollar en local, ejecutar la campaña, y reproducir la evidencia de la whitelist. No para desplegar.

## Agregar una especialidad al catálogo

El escenario más caro y el que más pasos encadena, porque toca código, gasta dinero y termina en un despliegue. Editar el `.env` no basta: el catálogo vive en `packages/contracts` y se compila dentro de los dos artefactos, así que **una especialidad nueva exige volver a desplegar función y Hosting**. Sin eso, la API responde `422` con `specialty_not_supported` y la UI ni siquiera la ofrece en el desplegable.

### 1. Declararla

En `packages/contracts/src/specialty.ts`, la clave en `SUPPORTED_SPECIALTIES` y sus variantes en `SPECIALTY_KEYWORD_VARIANTS`. Los criterios para elegir variantes están en [design.md](design.md#estrategia-de-keywords): no es una lista libre, cada eje se justificó con datos.

La etiqueta visible no va ahí sino en los diccionarios, como `specialty_<clave>` en `apps/frontend/src/i18n/es.json` y `en.json`. Falta una y la UI muestra la clave cruda.

```bash
pnpm run --filter @msd/contracts build
pnpm check
```

El `build` no es opcional: el script de campaña lee el catálogo del contrato **compilado**, a propósito, para que un script que gasta dinero no trabaje nunca sobre una lista desfasada.

### 2. Estimar el costo

```bash
cd apps/backend
node scripts/runCampaign.mjs --specialty=<clave>
```

Sin `--run` no llama a nada: enumera las combinaciones y estima. Son `variantes × 22 zonas` sincronizaciones y cada una consume **dos llamadas facturables**, a 0.035 USD cada una pasado el umbral gratuito mensual. Tres variantes salen por unos 4.60 USD.

No hace falta `--reset`: el progreso se guarda por combinación de especialidad, zona y keyword, de modo que las de la especialidad nueva no figuran y las viejas no se repiten.

### 3. Subir la cuota

En la consola, la cuota diaria de Places API de 200 a 2,000. Con 200 la campaña se corta a mitad. **Volver a bajarla al terminar** es parte del procedimiento, no una recomendación: la cuota es el único techo que queda si la key se filtra.

### 4. Ejecutar

Contra el backend local apuntando a Firestore real, como en la Fase 5 (`PERSISTENCE_DRIVER=firestore`, `PLACES_PROVIDER_DRIVER=google`, service account). La campaña no llama a Google directamente: pasa por el caso de uso, que es quien pagina, aplica el tope y persiste.

```bash
pnpm dev:backend                                        # en otra terminal
node scripts/runCampaign.mjs --run --specialty=<clave>
```

Va a 25 sincronizaciones por minuto y aborta tras tres fallos seguidos en vez de seguir gastando.

### 5. Devolver el entorno y desplegar

Bajar la cuota, devolver el `.env` a `mock` y `memory`, y desplegar:

```bash
docker compose --profile tools run --rm hermes deploy --only functions
docker compose --profile tools run --rm hermes deploy --only hosting
```

Hosting también, no solo la función: el desplegable de especialidades del frontend se construye del mismo catálogo.

## Qué exige volver a desplegar

| Cambio                                   | Redespliegue                        |
| :--------------------------------------- | :---------------------------------- |
| Agregar o quitar una IP de la whitelist  | No, la caché expira en 60 s         |
| Datos nuevos en Firestore                | No, la API los lee en cada consulta |
| El `.env` de la raíz                     | No, solo afecta al entorno local    |
| Rotar la key en Secret Manager           | Sí, solo la función                 |
| Un valor de `apps/backend/functions.env` | Sí, solo la función                 |
| El catálogo de especialidades o zonas    | Sí, función **y** Hosting           |
| Cualquier otro cambio de código          | Sí, lo que corresponda              |

La distinción de fondo: lo que es **configuración de ejecución** se lee en caliente y lo que queda **compilado dentro del artefacto** no. Poblar datos nuevos entra en la primera categoría y por eso no obliga a nada; el catálogo entra en la segunda porque de él se deriva el tipo `Specialty` que verifican backend y frontend en tiempo de compilación.

## Pruebas de integración

El adaptador de Firestore se prueba contra el emulador, no con dobles. No entran en `pnpm check` porque necesitan un servicio corriendo.

```bash
docker compose --profile emulator up -d mnemosyne
pnpm run --filter @msd/backend test:integration
```

No consumen cuota ni tocan la base real: el emulador es local. El criterio de qué cubren está en [standards/testing.md](standards/testing.md#pruebas-de-integración).

## Probar la API sin escribir comandos

Los `curl` de este documento existen para diagnosticar durante el despliegue. Para el trabajo diario hay una colección de Hoppscotch con los 19 requests de la API, sus casos de error y sus comprobaciones, en [hoppscotch/](hoppscotch/README.md).

Trae dos entornos, `dev-msd` y `prod-msd`, con las mismas variables y distintos valores: el mismo conjunto de requests sirve para local y para el despliegue, y cambiar de uno a otro es cambiar el entorno seleccionado.

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
| La petición sale con estado `200` y la interfaz muestra error        | El origen del frontend no figura en `CORS_ALLOWED_ORIGINS`                                       | Actualizarlo al puerto real, o poner `VITE_API_BASE_URL=/api/v1` para pasar por el proxy de Vite   |
| `net::ERR_UNSAFE_PORT` en el navegador                               | El puerto elegido está en la lista de bloqueados de Chrome                                       | Cambiarlo: 6000, 6666 y 10080 están vetados; 4000, 6100 u 8080 sirven                              |
| `Cannot determine backend specification. Timeout after 10000`        | El módulo tarda más de 10 s en cargar durante el análisis del despliegue                         | No inicializar nada pesado al importar: construirlo en la primera petición                         |
| Las pruebas de integración tardan minutos y fallan por tiempo        | El emulador no está corriendo                                                                    | `docker compose --profile emulator up -d mnemosyne`                                                |
