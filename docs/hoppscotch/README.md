# Colección de Hoppscotch

Toda la API se ejercita desde una sola colección, con **el mismo conjunto de requests para desarrollo y para el despliegue**: lo único que cambia es el entorno seleccionado.

Existe para que probar la API no obligue a tocar código ni a recordar comandos. Cambiar de especialidad, de zona, de página, de keyword o de proyecto de Firebase es editar una variable; las rutas, los cuerpos y las comprobaciones ya están escritos.

## Qué hay aquí

| Archivo                                            | Qué es                                                              |
| :------------------------------------------------- | :------------------------------------------------------------------ |
| [msd-api.hoppscotch.json](msd-api.hoppscotch.json) | La colección: 19 requests en 6 carpetas, cada uno con sus `pw.test` |
| [dev-msd.json](dev-msd.json)                       | Entorno de desarrollo, contra la máquina local                      |
| [prod-msd.json](prod-msd.json)                     | Entorno del despliegue, contra Firebase                             |

## Cómo importarlo

En Hoppscotch, **Collections** → icono de importar → _Hoppscotch_ → subir `msd-api.hoppscotch.json`.

Luego, **Environments** → importar → subir los dos JSON de entorno. Se elige uno u otro desde el desplegable de la esquina superior derecha.

## Las variables

Ninguna URL está escrita a mano, ni en los requests ni en los entornos. Todo se compone a partir de piezas sueltas, de modo que apuntar a otro proyecto o a otro puerto sea cambiar **un** valor y no rehacer una dirección completa.

### Piezas que se editan

| Variable                  | Para qué                         | dev           | prod          |
| :------------------------ | :------------------------------- | :------------ | :------------ |
| `PROJECT_ID`              | El proyecto de Firebase          | el propio     | el propio     |
| `REGION`                  | Región de las funciones          | `us-central1` | `us-central1` |
| `HOST`                    | Dónde corre el backend           | `localhost`   | —             |
| `BACKEND_PORT`            | Puerto del backend               | `4000`        | —             |
| `FUNCTIONS_EMULATOR_PORT` | Puerto del emulador de Functions | `5001`        | —             |
| `API_PREFIX`              | Prefijo del contrato             | `api`         | `api`         |
| `API_VERSION`             | Versión del contrato             | `v1`          | `v1`          |

Son las mismas piezas que el `.env` del proyecto, con los mismos nombres. Quien ya cambió `BACKEND_PORT` porque otro proyecto le ocupaba el 4000 lo cambia aquí igual.

### Piezas que se derivan

Estas **no se editan**: se construyen con las de arriba.

| Variable        | dev                                                                     | prod                                                   |
| :-------------- | :---------------------------------------------------------------------- | :----------------------------------------------------- |
| `URL_BASE`      | `http://<<HOST>>:<<BACKEND_PORT>>`                                      | `https://<<PROJECT_ID>>.web.app`                       |
| `URL_FUNCTIONS` | `http://<<HOST>>:<<FUNCTIONS_EMULATOR_PORT>>/<<PROJECT_ID>>/<<REGION>>` | `https://<<REGION>>-<<PROJECT_ID>>.cloudfunctions.net` |

El efecto práctico: **para apuntar la colección al proyecto de otro integrante basta cambiar `PROJECT_ID`**. El dominio de Hosting es `<proyecto>.web.app` y las funciones responden en `<region>-<proyecto>.cloudfunctions.net`, así que las dos URL se recalculan solas.

> Las URL que imprime el despliegue (`https://api-s4swsbn46a-uc.a.run.app`) traen un identificador aleatorio de Cloud Run que **no** se puede derivar del proyecto. Por eso la colección usa la forma `cloudfunctions.net`, que sí es componible y llega a la misma función. Comprobado: las dos responden lo mismo.

### Valores de prueba

| Variable                      | Para qué                              | Valor                           |
| :---------------------------- | :------------------------------------ | :------------------------------ |
| `SPECIALTY`                   | Especialidad a consultar              | `cardiology`                    |
| `ZONE`                        | Zona a consultar                      | `10`                            |
| `PAGE` / `PAGE_SIZE`          | Paginación                            | `1` / `10`                      |
| `KEYWORD`                     | Consulta exacta que se envía a Google | `cardiologia zona 10 Guatemala` |
| `SPECIALTY_FUERA_DE_CATALOGO` | Para provocar el `422`                | `dentistry`                     |
| `ZONE_INEXISTENTE`            | Para provocar el `422`                | `20`                            |
| `GOOGLE_PLACES_BASE_URL`      | Places API, solo para el diagnóstico  | la de Google                    |
| `GOOGLE_MAPS_API_KEY`         | **Secreta.** Solo para el diagnóstico | vacía                           |

Los dos valores inválidos son variables para que los requests de error tampoco lleven nada escrito a mano: quien quiera comprobar que la zona 22 también se rechaza cambia `ZONE_INEXISTENTE` y vuelve a correr.

`GOOGLE_MAPS_API_KEY` va marcada como `secret: true`, y por eso **su valor no se versiona**: el archivo la declara vacía y quien la necesite la pega a mano. Es la única secreta, porque la API del proyecto no tiene autenticación — el control de acceso es por IP y lo resuelve la red, no una credencial.

### Si ves `<<PROJECT_ID>>` literal en una URL

Significa que tu versión de Hoppscotch no resuelve variables anidadas dentro de otras variables. No pude comprobarlo desde aquí, así que queda dicho: la salida es escribir el valor completo en `URL_BASE` y `URL_FUNCTIONS`, y perder solo la comodidad de cambiar un único campo.

## Las carpetas, en el orden en que conviene correrlas

### 00 - Pipeline de despliegue

`helloWorld` y `/health`. No tocan el dominio, no consultan Firestore y no pasan por la whitelist. Si estos fallan, lo que sigue no tiene sentido.

`helloWorld` es entregable de la Semana 1 y conserva un propósito: es lo único desplegable antes de que exista el secreto en Secret Manager, así que valida el pipeline cuando el resto todavía no se puede subir.

Dos detalles de la ruta de `/health` que despistan:

- **Va por `URL_FUNCTIONS`, no por `URL_BASE`.** Hosting solo reescribe `/api/**` hacia la función, de modo que `/health` pedido al dominio del sitio devuelve el `index.html` de la interfaz con un `200` que engaña.
- **El segmento `api` es el nombre de la función**, no el prefijo del contrato. La función `api` envuelve la aplicación Express entera y dentro de ella `/health` cuelga de la raíz.

En desarrollo esta carpeta necesita el **emulador de Functions** levantado. El backend suelto de `pnpm dev` no expone `helloWorld` y sirve `/health` en `<<URL_BASE>>/health`.

### 01 - Catálogo

`GET /specialties`. Devuelve las diez especialidades con sus keywords. Conviene correrlo primero porque de ahí salen los valores que `SPECIALTY` puede tomar; el propio test comprueba que la variable pertenece al catálogo.

### 02 - Consulta

`GET /places`, el único endpoint que consume la interfaz. **Ninguno de estos requests cuesta dinero**: leen de la base propia y jamás llaman a Google. Se pueden repetir sin límite.

Cubren la lista completa, el filtrado combinado, la paginación explícita y la marca de frescura.

### 03 - Errores de la consulta

Los seis códigos que la consulta puede devolver, provocados a propósito. Tampoco cuestan dinero.

Lo que esta carpeta hace visible es la distinción entre `400` y `422`, que no es cosmética:

|                               | Significa                                        | Ejemplo                      |
| :---------------------------- | :----------------------------------------------- | :--------------------------- |
| `400 validation_error`        | Fallo de sintaxis: el valor está mal formado     | `zone=centro`, `pageSize=51` |
| `422 specialty_not_supported` | Fallo de regla: bien formado, fuera del catálogo | `specialty=dentistry`        |
| `422 zone_not_supported`      | Bien formado, fuera del catálogo                 | `zone=20`                    |

`zone=20` merece una nota: está bien formada y aun así no existe. Al delimitar el municipio, ese territorio quedó en Mixco; tampoco existen la 22 ni la 23. Son 22 zonas válidas, no 25.

### 04 - Sincronización

**El primer request de esta carpeta llama a Google y cuesta dinero.** Los otros cuatro no: se rechazan por validación antes de llegar a Google, así que se pueden repetir sin coste.

Una sincronización son dos llamadas facturables al SKU Text Search Enterprise, a 0.035 USD cada una pasado el umbral gratuito de 1,000 al mes. Unos siete centavos por corrida.

`VC-11` está pensado para correrse **inmediatamente después** de `EP-04`: comprueba que el cooldown responde `429` en lugar de repetir la llamada. Es la protección del presupuesto vista desde fuera.

### 05 - Diagnóstico de la API key

Llama a Places API **directamente**, sin pasar por el backend. Es el equivalente en Hoppscotch del `curl` que abre la Fase 2 del [runbook](../runbook.md), y sirve para separar dos fallos que se parecen: una key mal configurada de un backend mal configurado.

Pide solo identificador, nombre y dirección. Son campos del SKU Pro, con 5,000 llamadas gratuitas al mes, de modo que el diagnóstico no consume el presupuesto del SKU Enterprise que gasta la campaña.

## Qué se puede cambiar sin tocar nada más

| Quiero…                                     | Cambio                          |
| :------------------------------------------ | :------------------------------ |
| Apuntar al proyecto de otro integrante      | `PROJECT_ID`                    |
| Correr el backend en otro puerto            | `BACKEND_PORT`                  |
| Consultar otra especialidad o zona          | `SPECIALTY`, `ZONE`             |
| Ver más resultados por página               | `PAGE_SIZE`, hasta 50           |
| Recorrer la base                            | `PAGE`                          |
| Sincronizar otra búsqueda                   | `KEYWORD`, `SPECIALTY` y `ZONE` |
| Probar contra el despliegue en vez de local | Cambiar de entorno, nada más    |

Lo que **sí** obliga a tocar código es agregar una especialidad al catálogo: vive en `packages/contracts` y se compila dentro de la función y del frontend, así que exige volver a desplegar los dos. El procedimiento está en el [runbook](../runbook.md#agregar-una-especialidad-al-catálogo).

## Las comprobaciones

Cada request trae `pw.test`, de modo que correr una carpeta con el _runner_ dé un veredicto y no una lista de respuestas que alguien tenga que leer.

Las aserciones no se escribieron de memoria: se resolvieron las URL de los 19 requests con los valores de cada entorno y se ejercitaron contra la API desplegada antes de darlas por buenas. La verificación encontró un error — el catálogo de especialidades no trae un campo `key` sino `specialty`.

## Qué esperar del primer request

En el despliegue, la primera petición tras un rato de inactividad tarda varios segundos. Es el arranque en frío: la función construye su contenedor y abre la conexión con Firestore en la primera invocación, no al cargarse.

Es deliberado. Hacerlo al cargar agotaba el límite de 10 segundos que Firebase concede para analizar el módulo al desplegar, y el despliegue fallaba con un mensaje que apuntaba a otro sitio. El detalle está en [design.md](../design.md#evidencia-de-despliegue).

## Si todo responde `403 ip_not_allowed`

La whitelist no reconoce tu dirección. En desarrollo se arregla poniendo `IP_WHITELIST` en el `.env`; en el despliegue, agregando tu IP al documento `config/ipWhitelist` de Firestore, que aplica en menos de un minuto y **no requiere volver a desplegar**. El recorrido está en [credentials-setup.md](../credentials-setup.md#el-documento-de-whitelist).
