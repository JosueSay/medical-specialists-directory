# Diseño del sistema: Medical Specialists Directory

Documento de diseño del proyecto. Define el problema, los requisitos, la arquitectura, los contratos de API, el modelo de datos y las decisiones tomadas. El enunciado del curso está transcrito en [statement.md](statement.md) y la descripción general del repositorio está en [README.md](../README.md).

## Problema y objetivo

El Ministerio de Educación de Guatemala necesita un directorio de médicos especialistas en Ciudad de Guatemala y responder consultas del tipo "cuántos oncólogos hay en la zona 4 de la capital", conservando esa información para uso posterior.

El sistema debe:

- Obtener información de especialistas y centros médicos desde Google Maps Platform (Places API).
- Persistir esa información en una base de datos propia que funcione como caché consultable.
- Exponer una API HTTP que el Ministerio consuma sin depender de Google en tiempo de consulta.
- Restringir el acceso al servicio a un conjunto de IPs autorizadas.
- Ofrecer una UI mínima de consulta.
- Operar dentro de un presupuesto acotado, con controles de costo verificables.

## Alcance

| Dentro del alcance                                     | Fuera del alcance                    |
| :----------------------------------------------------- | :----------------------------------- |
| API de sincronización contra Places API con paginación | Autenticación de usuarios finales    |
| API de consulta sobre base de datos propia             | Frontend elaborado o diseño visual   |
| Whitelist de IPs como control de acceso                | Georreferenciación avanzada o rutas  |
| Persistencia en Firestore como caché con vencimiento   | Multi-tenant o múltiples ministerios |
| UI mínima de consulta                                  | Analítica o reportería               |
| Controles de costo y cuota en GCP                      | Refresco automático programado       |

## Requisitos

### Funcionales

| ID    | Requisito                                                                                                             |
| :---- | :-------------------------------------------------------------------------------------------------------------------- |
| RF-01 | Consultar lugares médicos en Places API a partir de una keyword y una zona                                            |
| RF-02 | Recorrer los resultados paginados de Places API hasta un máximo de 20 registros por invocación, en páginas de 10      |
| RF-03 | Persistir los resultados en la base de datos propia sin duplicar registros existentes                                 |
| RF-04 | Exponer un endpoint de consulta que lea únicamente de la base de datos propia, sin llamar a Google en ningún caso     |
| RF-05 | Paginar la respuesta del endpoint de consulta con `page` y `pageSize`, con `pageSize` máximo de 50                    |
| RF-06 | Proveer una UI mínima que consuma el endpoint de consulta                                                             |
| RF-07 | Marcar cada registro como vigente o desactualizado según su fecha de recolección, y exponer esa marca en la respuesta |
| RF-08 | Registrar la keyword que originó cada registro, para trazabilidad del dato                                            |

### No funcionales

| ID     | Requisito                                                                                                                  |
| :----- | :------------------------------------------------------------------------------------------------------------------------- |
| RNF-01 | Solo IPs en whitelist pueden consumir el servicio; el resto recibe `403`                                                   |
| RNF-02 | La API key de Google nunca se versiona ni se expone al cliente; se lee de variables de entorno o Secret Manager            |
| RNF-03 | La lógica de negocio no depende de Firestore ni de Google Places (arquitectura limpia)                                     |
| RNF-04 | Todo el tráfico va sobre HTTPS                                                                                             |
| RNF-05 | El consumo contra Places API se acota por el tope de RF-02, por la cuota diaria en GCP y por el cooldown de sincronización |
| RNF-06 | El 90% del desarrollo ocurre contra el emulador de Firebase; producción se reserva para pruebas finales y demo             |
| RNF-07 | Ningún dato se infiere ni se completa por cuenta del sistema; los campos ausentes se persisten vacíos                      |

## Stack

| Componente            | Tecnología                                         |
| :-------------------- | :------------------------------------------------- |
| Lenguaje              | TypeScript                                         |
| Backend               | Firebase Cloud Functions v2                        |
| Base de datos         | Firestore                                          |
| Hosting de UI         | Firebase Hosting                                   |
| Fuente de datos       | Google Maps Platform, Places API                   |
| Secretos              | Variables de entorno, Secret Manager en despliegue |
| Entorno de desarrollo | Emulador de Firebase y Docker Compose              |
| Gestor de paquetes    | pnpm con workspaces                                |
| Calidad               | ESLint, Prettier, TypeScript en modo estricto      |

### Organización del repositorio

El proyecto vive en un **monorepo** con workspaces de pnpm, y no en repositorios separados de backend y frontend como indica el estándar de repositorios del equipo.

```bash
apps/backend        API HTTP y capas de dominio, aplicacion e infraestructura
apps/frontend       UI minima de consulta
packages/contracts  Tipos y contratos compartidos entre backend y frontend
config              Configuracion de aplicacion versionada
docker              Definiciones de imagenes y emulador
docs                Documentacion del proyecto
```

Razones de la desviación:

- El contrato de la API lo consumen ambas aplicaciones. En `packages/contracts` vive una sola definición de tipos, de modo que un cambio de contrato rompe la compilación del frontend de inmediato en lugar de descubrirse en ejecución.
- Firebase despliega Functions y Hosting desde un mismo proyecto y un mismo `firebase.json`. Separar repositorios obligaría a coordinar dos despliegues para un cambio que es uno solo.
- Con cuatro semanas y cuatro personas, un solo `pnpm install` y un solo comando de arranque reducen más fricción de la que cuesta la separación.

### Docker

Docker Compose se usa como entorno de desarrollo reproducible, junto al emulador de Firebase. No forma parte del despliegue: producción es Cloud Functions y Hosting.

| Elemento                  | Propósito                                                              |
| :------------------------ | :--------------------------------------------------------------------- |
| `docker-compose.yml`      | Backend, frontend y emulador para desarrollo local                     |
| `docker-compose.prod.yml` | Superposición para verificar el build de producción antes de desplegar |
| Perfil `emulator`         | Levanta el emulador de Firestore solo cuando se necesita               |
| Perfil `tools`            | CLI de Firebase containerizado: sesión, emuladores y despliegue        |
| `WATCH_USE_POLLING`       | Habilita la recarga automática sobre volúmenes montados en WSL2        |

Los cuatro integrantes trabajan sobre sistemas distintos. Un entorno en contenedor elimina la clase de fallo en que el código corre en una máquina y no en otra, que en un proyecto de cuatro semanas consume tiempo que no se recupera.

Docker es opcional: `pnpm dev` levanta el proyecto sin contenedores, con persistencia en memoria y proveedor simulado.

### Empaquetado para el despliegue

Firebase sube la carpeta de la función y ejecuta `npm install` dentro de la nube. El monorepo declara `@msd/contracts` con el protocolo `workspace:` de pnpm, que npm no entiende: desplegar `apps/backend` tal cual falla al resolver esa dependencia.

`pnpm run --filter @msd/backend bundle` genera un artefacto autocontenido en `apps/backend/.deploy/`:

| Archivo             | Contenido                                                                       |
| :------------------ | :------------------------------------------------------------------------------ |
| `index.js`          | Código propio y `@msd/contracts` incrustados en un solo archivo por esbuild     |
| `package.json`      | Las dependencias de npm tal cual, sin rastro del workspace                      |
| `package-lock.json` | Las versiones exactas que se probaron en local, que son las que instala la nube |
| `.env`              | Copia de `functions.env`: configuración de ejecución, sin secretos              |

Las dependencias de npm quedan fuera del empaquetado y se instalan en la nube: `firebase-admin` carga módulos nativos y no sobrevive al bundling. También se instalan dentro de `.deploy/`, porque el CLI inspecciona esa carpeta para descubrir las funciones antes de subirlas.

La alternativa era publicar `@msd/contracts` en un registro, que para un proyecto de cuatro semanas cuesta más de lo que resuelve.

### Cumplimiento de la arquitectura por herramientas

La regla de que el dominio no conoce la infraestructura (RNF-03) no queda solo escrita: ESLint la aplica. La configuración prohíbe importar `firebase-admin` en cualquier punto de `apps/backend` salvo dentro de `src/infrastructure` y el punto de entrada de las funciones.

Un caso de uso que intente hablar con Firestore directamente falla el lint, no la revisión de código. Es la diferencia entre una convención que se respeta por disciplina y una que se respeta porque el proyecto no compila sin ella.

## Arquitectura

El diseño combina dos decisiones:

- **Cliente-servicio**: la UI nunca accede directamente a Firestore ni a Google Maps. Todo pasa por las Firebase Functions, único componente que conoce esos detalles y que expone una API HTTP. El cliente consume contratos, no implementación.
- **Arquitectura limpia** dentro del servicio: la lógica de negocio no depende de detalles de infraestructura. Las capas son interfaces (HTTP), aplicación (casos de uso), dominio (puertos y políticas) e infraestructura (adaptadores).

### Diagrama 1: contexto

Actores y sistemas externos con los que interactúa la solución.

```mermaid
flowchart LR
    ME(["Ministerio de Educacion<br/>cliente autorizado"])
    OP(["Operador del equipo<br/>dispara la sincronizacion"])
    SYS["Medical Specialists Directory<br/>UI minima + API"]
    GP["Google Maps Platform<br/>Places API"]

    ME -->|consulta especialistas| SYS
    OP -->|solicita sincronizacion| SYS
    SYS -->|busca lugares medicos| GP

    style SYS fill:#1565C0,color:#fff
    style GP fill:#4285F4,color:#fff
```

El operador es un integrante del equipo, no el cliente. La sincronización es una operación interna y no se expone en la UI.

### Diagrama 2: contenedores y despliegue

Piezas desplegables y dónde vive cada una.

```mermaid
flowchart TB
    subgraph Firebase["Proyecto Firebase / GCP"]
        HOST["Firebase Hosting<br/>UI minima"]
        FN["Cloud Functions v2<br/>API HTTP"]
        FS[("Firestore<br/>base de datos propia")]
        SM[/"Variables de entorno<br/>Secret Manager<br/>API key de Maps"/]
        QUOTA{{"Cuota diaria + alertas<br/>de billing 50% y 90%"}}
    end

    GP["Google Maps Platform<br/>Places API<br/>key restringida por IP"]
    CLIENT(["Ministerio<br/>IP en whitelist"])
    OPER(["Operador<br/>IP en whitelist"])

    CLIENT -->|HTTPS| HOST
    HOST -->|fetch| FN
    OPER -->|HTTPS, sin UI| FN
    FN -->|lee y escribe| FS
    FN -->|lee secreto| SM
    FN -->|HTTPS| GP
    QUOTA -.->|acota| GP

    style FS fill:#FFA000,color:#fff
    style SM fill:#0F9D58,color:#fff
    style GP fill:#4285F4,color:#fff
    style QUOTA fill:#F4B400,color:#000
```

La UI del Ministerio solo alcanza el endpoint de consulta. El endpoint de sincronización se invoca directamente por HTTP desde una IP autorizada, sin interfaz gráfica.

### Diagrama 3: capas y componentes

Estructura interna del servicio bajo arquitectura limpia. Las dependencias apuntan siempre hacia el dominio.

```mermaid
flowchart TB
    subgraph Interfaces["Capa de interfaces - HTTP"]
        direction TB
        WL{{"Middleware<br/>whitelist de IPs"}}
        C1[Controller<br/>place-imports]
        C2[Controller<br/>places]
        WL --> C1
        WL --> C2
        WL -.->|IP no autorizada| ERR[Error 403]
    end

    subgraph Application["Capa de aplicacion - casos de uso"]
        direction TB
        UC1[ImportPlacesUseCase<br/>paginacion, tope y cooldown]
        UC2[ListPlacesUseCase<br/>filtros y paginacion]
    end

    subgraph Domain["Capa de dominio"]
        direction TB
        PR[["PlacesRepository<br/>puerto"]]
        PP[["PlacesProvider<br/>puerto"]]
        ENT["Place<br/>entidad"]
        FP{{"FreshnessPolicy<br/>Strategy: isStale()"}}
    end

    subgraph Infra["Capa de infraestructura - adaptadores"]
        direction TB
        REPO[FirestorePlacesRepository]
        ADAPTER[GooglePlacesAdapter]
    end

    C1 --> UC1
    C2 --> UC2
    UC1 --> PP
    UC1 --> PR
    UC1 --> FP
    UC2 --> PR
    UC2 --> FP
    PR -.->|implementa| REPO
    PP -.->|implementa| ADAPTER
    PR --- ENT
    PP --- ENT
    FP --- ENT

    style WL fill:#DB4437,color:#fff
    style FP fill:#7B1FA2,color:#fff
    style Domain fill:#37474F,color:#fff
```

Responsabilidad de cada capa:

| Capa            | Responsabilidad                                                            | Qué nunca hace                        |
| :-------------- | :------------------------------------------------------------------------- | :------------------------------------ |
| Interfaces      | Traducir HTTP a llamada de caso de uso, validar entrada, aplicar whitelist | Decidir reglas de negocio             |
| Aplicación      | Orquestar paginación, aplicar el tope, decidir qué se guarda               | Conocer Firestore o Google Places     |
| Dominio         | Definir la entidad `Place`, los puertos y la política de frescura          | Depender de librerías externas        |
| Infraestructura | Saber _cómo_ hablar con Firestore y con Places API                         | Decidir _cuándo_ o _por qué_ se llama |

### Diagrama 4: flujo del middleware de whitelist

Control de acceso previo a cualquier controlador.

```mermaid
flowchart TD
    REQ([Request entrante]) --> EXT[Extraer IP de origen]
    EXT --> CHK{IP esta en la whitelist?}
    CHK -->|No| F403["403 Forbidden<br/>code: ip_not_allowed"]
    CHK -->|Si| VAL{Parametros validos?}
    VAL -->|No| F400["400 Bad Request<br/>code: validation_error"]
    VAL -->|Si| CTRL[Controller correspondiente]

    style F403 fill:#DB4437,color:#fff
    style F400 fill:#F4B400,color:#000
```

La IP autorizada es la IP pública de salida del cliente y cambia según la red desde la que se conecta, por lo que se administra como configuración y no como valor fijo en código.

### Diagrama 5: secuencia de sincronización con paginación

Único flujo que llama a Google. Recorre páginas de 10 hasta un máximo de 20 resultados por invocación.

```mermaid
sequenceDiagram
    autonumber
    participant OP as Operador
    participant MW as Middleware whitelist
    participant CT as Controller place-imports
    participant UC as ImportPlacesUseCase
    participant FP as FreshnessPolicy
    participant AD as GooglePlacesAdapter
    participant GP as Places API
    participant RP as FirestorePlacesRepository
    participant FS as Firestore

    OP->>MW: POST /api/v1/place-imports
    MW->>MW: valida IP de origen
    MW->>CT: request autorizado
    CT->>UC: execute(keyword, specialty, zone)
    UC->>RP: lastImportAt(keyword, zone)
    RP-->>UC: fecha de la ultima sincronizacion
    UC->>FP: cooldownElapsed?
    alt cooldown vigente
        FP-->>UC: no
        UC-->>CT: 429 place_import_cooldown_active
    else cooldown cumplido
        FP-->>UC: si
        loop hasta 2 paginas o sin nextPageToken
            UC->>AD: fetchPage(keyword, pageToken)
            AD->>GP: places:searchText (pageSize 10)
            alt Google responde
                GP-->>AD: resultados + nextPageToken
                AD-->>UC: Place[] + nextPageToken
                UC->>RP: upsertMany(places)
                RP->>FS: escritura por lote
            else Google falla
                GP-->>AD: error o timeout
                AD-->>UC: error
                UC->>UC: aborta sin escribir<br/>conserva lo ya almacenado
                UC-->>CT: 503 places_provider_unavailable
            end
        end
        UC-->>CT: resumen de sincronizacion
        CT-->>OP: 201 Created
    end
```

Reglas del caso de uso:

- Tamaño de página fijo en 10 y tope de 20 resultados por invocación, es decir un máximo de 2 llamadas facturables por sincronización.
- El corte ocurre cuando se alcanza el tope o cuando Places API deja de devolver `nextPageToken`.
- La escritura es idempotente: se hace _upsert_ por `placeId`, de modo que repetir una sincronización no duplica registros.
- La escritura solo ocurre si Google respondió correctamente. Un fallo del proveedor nunca borra ni degrada lo que ya está almacenado.
- Un cooldown por combinación de keyword y zona impide que sincronizaciones repetidas consuman presupuesto sin aportar datos nuevos.

### Diagrama 6: secuencia de consulta

Flujo que consume el Ministerio. No toca Google en ningún momento.

```mermaid
sequenceDiagram
    autonumber
    participant ME as Ministerio de Educacion
    participant MW as Middleware whitelist
    participant CT as Controller places
    participant UC as ListPlacesUseCase
    participant FP as FreshnessPolicy
    participant RP as FirestorePlacesRepository
    participant FS as Firestore

    ME->>MW: GET /api/v1/places?specialty=cardiology&zone=10
    MW->>MW: valida IP de origen
    MW->>CT: request autorizado
    CT->>UC: execute(filtros, page, pageSize)
    UC->>RP: findBy(filtros, page, pageSize)
    RP->>FS: consulta con indice
    FS-->>RP: documentos + total
    RP-->>UC: Place[] + total
    UC->>FP: isStale(place, now) por cada registro
    FP-->>UC: fresh o stale
    UC-->>CT: resultado paginado con marca de frescura
    CT-->>ME: 200 OK con meta.pagination
```

La consulta nunca devuelve vacío por vencimiento. Un registro vencido se devuelve marcado como `stale`, junto con su `collectedAt`, para que quien consulta decida si le sirve.

### Diagrama 7: ciclo de vida del dato en caché

```mermaid
stateDiagram-v2
    [*] --> Inexistente
    Inexistente --> Vigente: primera sincronizacion
    Vigente --> Desactualizado: supera el TTL
    Desactualizado --> Vigente: sincronizacion exitosa (upsert)
    Desactualizado --> Desactualizado: sincronizacion falla<br/>se conserva el dato (stale-if-error)
    Vigente --> Vigente: consulta (solo lectura)
    Desactualizado --> Desactualizado: consulta (se sirve marcado)
    Desactualizado --> Purgado: retencion maxima superada
    Purgado --> [*]
```

Tres reglas cierran el ciclo:

- La consulta nunca dispara una llamada a Google. La actualización es explícita y manual.
- Un registro desactualizado se sigue sirviendo, siempre marcado. Es preferible un dato viejo y etiquetado a una respuesta vacía que el Ministerio interpretaría como "no existen especialistas en esa zona".
- Pasada la retención máxima, el registro se purga. Solo el `placeId` puede conservarse indefinidamente, porque es el único campo exento de las restricciones de caché de Google.

## Política de caché y frescura

Esta sección responde a las [políticas de Places API](https://developers.google.com/maps/documentation/places/web-service/policies), que son explícitas:

> El `place_id`, que identifica de forma única un lugar, está exento de las restricciones de caché y puede almacenarse indefinidamente.

Y sobre el resto del contenido:

> El contenido, con excepción de los place IDs, no puede cachearse ni almacenarse salvo que un acuerdo lo permita.

Es decir, **no existe un "TTL máximo permitido" que el proyecto pueda citar**. Google concede almacenamiento permanente solo para el `placeId` y restringe todo lo demás. Google además recomienda refrescar los place IDs con más de 12 meses de antigüedad, y ese refresco no tiene costo.

Consecuencia para el diseño, declarada de forma abierta:

| Dato            | Tratamiento                                                 | Fundamento                                                              |
| :-------------- | :---------------------------------------------------------- | :---------------------------------------------------------------------- |
| `placeId`       | Se almacena sin vencimiento                                 | Exento de forma explícita por la política de Places                     |
| Resto de campos | Se almacena con TTL corto y se purga al vencer la retención | Desviación consciente de alcance académico, no redistribución comercial |

El TTL no se hereda de Google: **es una decisión del equipo que hay que justificar**. Se parametriza por entorno mediante constantes y no se repite en el código.

| Variable                 | Desarrollo y pruebas | Demo y producción       | Razón                                                                                                                                       |
| :----------------------- | :------------------- | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| `PLACES_TTL_MINUTES`     | 30                   | 43200, es decir 30 días | En pruebas interesa ver la transición a `stale` sin esperar; en la demo un TTL corto marcaría casi todo como desactualizado sin motivo real |
| `PLACES_RETENTION_HOURS` | 24                   | 2160, es decir 90 días  | Ventana máxima antes de purgar los campos no exentos                                                                                        |
| `SYNC_COOLDOWN_MINUTES`  | 1                    | 60                      | Evita que sincronizaciones repetidas de la misma keyword consuman presupuesto                                                               |
| `PLACES_MAX_RESULTS`     | 20                   | 20                      | Límite fijado por el enunciado                                                                                                              |
| `PLACES_PAGE_SIZE`       | 10                   | 10                      | Dos llamadas facturables por sincronización                                                                                                 |

Los valores de demo y producción quedan sujetos a confirmación del equipo antes de la Semana 3. La plantilla completa está en `.env.example`.

### La purga se ejecuta sobre `collectedAt`

La retención es el único mecanismo que hace cierta la afirmación de que solo el `placeId` se conserva indefinidamente, así que conviene precisar sobre qué campo opera: **`collectedAt`**, la última vez que el proveedor confirmó el registro. La entidad `Place` no tiene ningún otro campo de fecha de modificación.

Merece una nota propia porque el adaptador de Firestore consultaba un campo inexistente, y **Firestore no falla ante eso**: excluye de las consultas de rango los documentos que carecen del campo consultado y devuelve el conjunto vacío. La purga informaba cero registros eliminados y parecía correcta, cuando en realidad la política de retención no se estaba aplicando en absoluto.

El adaptador en memoria sí filtraba por `collectedAt`, de modo que en desarrollo la purga funcionaba y en producción no. Dos implementaciones del mismo puerto divergían en su comportamiento, que es precisamente lo que la arquitectura de puertos pretende evitar. Lo que faltó no fue el diseño sino la comprobación: ninguna prueba cubre el adaptador de Firestore, y solo se ejecutó contra la base real al preparar la entrega de la Semana 2.

## Configuración y entornos

Toda la configuración se resuelve por variables de entorno, con `.env.example` como plantilla versionada y `.env` fuera del repositorio.

### Selección de adaptadores

La arquitectura de puertos permite sustituir infraestructura sin tocar el dominio, y esa capacidad se expone como configuración. Es lo que hace posible desarrollar sin gastar crédito de Places API ni levantar Firestore.

| Variable                 | Valores               | Efecto                                             |
| :----------------------- | :-------------------- | :------------------------------------------------- |
| `PERSISTENCE_DRIVER`     | `memory`, `firestore` | Implementación activa de `PlacesRepository`        |
| `PLACES_PROVIDER_DRIVER` | `mock`, `google`      | Implementación activa de `PlacesProvider`          |
| `SEED_ON_STARTUP`        | `true`, `false`       | Carga datos de ejemplo al arrancar en modo memoria |

La combinación `memory` más `mock` permite que P2 y P4 avancen sin depender de P1 ni consumir presupuesto, y sostiene el requisito de desarrollar el 90% contra el entorno local. Los cuatro casos de uso son idénticos en ambos modos: es la prueba práctica de que el dominio no conoce la infraestructura.

### Red y transporte

| Variable                | Propósito                                                                                                                                                                              |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUST_PROXY_HOPS`      | Saltos de proxy confiables para resolver la IP real del cliente. Firebase Hosting usa 1. Un valor incorrecto haría que el middleware evalúe la IP del proxy en lugar de la del cliente |
| `CORS_ALLOWED_ORIGINS`  | Orígenes autorizados para consumir la API desde el navegador                                                                                                                           |
| `RATE_LIMIT_PER_MINUTE` | Peticiones por minuto y por IP antes de responder `429`. Es una segunda capa de contención independiente del cooldown de sincronización                                                |
| `API_BASE_PATH`         | Prefijo de las rutas, `/api/v1`                                                                                                                                                        |

El límite de peticiones y la whitelist cumplen funciones distintas: la whitelist decide **quién** puede consumir el servicio, el límite de peticiones decide **cuánto** puede consumir quien ya está autorizado.

## Patrones de diseño aplicados

| Patrón                           | Dónde vive                | Problema que resuelve                                                                                                                   |
| :------------------------------- | :------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **Strategy** (`FreshnessPolicy`) | Dominio                   | Centraliza la regla "¿este dato está viejo?" en un solo lugar. Cambiar el TTL no toca casos de uso ni adaptadores                       |
| **Stale-if-error**               | `ImportPlacesUseCase`     | Si Google falla, se conserva lo almacenado en vez de degradarlo. El TTL deja de ser un apagador que apaga la luz cuando más se necesita |
| **Write-on-success**             | `ImportPlacesUseCase`     | El dato viejo solo se reemplaza cuando llega uno nuevo confirmado. Nunca queda un hueco entre borrar y escribir                         |
| **Servir stale marcado**         | `ListPlacesUseCase`       | Ante un dato vencido se responde con la marca de frescura, nunca con una lista vacía que se leería como ausencia de especialistas       |
| **Cooldown de sincronización**   | `ImportPlacesUseCase`     | Acota el gasto de un endpoint que cuesta dinero real en cada invocación                                                                 |
| **Puertos y adaptadores**        | Dominio e infraestructura | Permite sustituir Firestore o Places API sin tocar la lógica de negocio, y probar los casos de uso con dobles en el emulador            |

Patrón evaluado y descartado:

- **Cache-aside con refresco en lectura**: la consulta detectaría el dato vencido y llamaría a Google en ese momento. Se descarta porque reintroduce el costo y la latencia de Google en el flujo de consulta, vuelve el gasto impredecible ante picos de tráfico y expone al sistema a un _cache stampede_ cuando varias consultas simultáneas encuentran el mismo dato vencido.
- **Refresco automático programado** con Cloud Scheduler: se descarta porque el cliente no lo pidió, agrega un componente desplegable y un costo recurrente que el alcance de cuatro semanas no justifica.

## Modelo de datos

Colección `places` en Firestore, con el `placeId` de Google como identificador del documento.

Los campos se nombran en inglés. El enunciado los lista en español; esta es la correspondencia exacta:

| Campo del enunciado | Campo del proyecto | Obligatorio            |
| :------------------ | :----------------- | :--------------------- |
| `place_id`          | `placeId`          | Sí                     |
| `nombre`            | `name`             | Sí                     |
| `especialidad`      | `specialty`        | Sí                     |
| `dirección`         | `formattedAddress` | Sí                     |
| `teléfono`          | `phoneNumber`      | No, puede quedar vacío |
| `sitio_web`         | `website`          | No, puede quedar vacío |
| `zona`              | `zone`             | Sí                     |
| `fecha_recoleccion` | `collectedAt`      | Sí                     |
| `keyword_usado`     | `sourceKeyword`    | Sí                     |

```mermaid
erDiagram
    PLACE {
        string placeId PK "id de Google Places, exento de TTL"
        string name
        string specialty "de la keyword usada, no inferida"
        string formattedAddress
        string phoneNumber "opcional, vacio si Google no lo entrega"
        string website "opcional, vacio si Google no lo entrega"
        string zone "de la keyword usada, no derivada de la direccion"
        string sourceKeyword "trazabilidad del origen del dato"
        string collectedAt "ISO 8601, ultima recoleccion confirmada"
        string createdAt "ISO 8601, primera vez que ingreso"
    }
    IMPORT_RUN {
        string importId PK
        string keyword
        string specialty
        string zone
        number pagesFetched
        number itemsFetched
        number itemsUpserted
        string startedAt
        string finishedAt
        string status "completed o failed"
    }
    IMPORT_RUN ||--o{ PLACE : "produce o actualiza"
```

Tres decisiones del modelo que hay que poder defender:

- **`zone` y `specialty` provienen de la keyword, no de la dirección.** Derivar la zona a partir del texto de la dirección sería inferir un dato que Google no entregó, lo que el enunciado prohíbe de forma expresa. Si la búsqueda fue `cardiólogo zona 10 Guatemala`, entonces `zone` vale `10` porque así se pidió, y `sourceKeyword` conserva la evidencia.
- **`phoneNumber` y `website` se guardan vacíos cuando Google no los entrega.** No se completan con datos de otras fuentes ni se sustituyen por redes sociales. La cobertura medida de cada campo está en [Cobertura de campos medida](#cobertura-de-campos-medida).
- **No se almacenan `latitude`, `longitude` ni `rating`.** El enunciado no los pide, la UI no los usa y la georreferenciación está fuera del alcance. Persistir menos campos es coherente con la minimización declarada en la postura ética.

### Índices de Firestore

Firestore exige un índice compuesto para toda consulta que filtre por un campo y ordene por otro, y **rechaza la consulta entera** con `FAILED_PRECONDITION` si no existe. No degrada el rendimiento: falla.

Los índices se declaran en `firestore.indexes.json` y se despliegan con `firebase deploy --only firestore`. Declararlos ahí y no crearlos desde la consola es lo que hace que el repositorio describa con exactitud lo que la base necesita: un índice creado a mano funciona en el proyecto de quien lo creó y falla en el de los otros tres integrantes.

| Colección    | Campos                              | Consulta que lo necesita                            |
| :----------- | :---------------------------------- | :-------------------------------------------------- |
| `places`     | `specialty`, `zone`, `name`         | Filtro por especialidad y zona, ordenado por nombre |
| `places`     | `specialty`, `name`                 | Filtro por especialidad                             |
| `places`     | `zone`, `name`                      | Filtro por zona                                     |
| `places`     | `specialty`, `collectedAt`          | Detección de registros vencidos                     |
| `importRuns` | `specialty`, `zone`, `finishedAt` ↓ | Cooldown: última sincronización de esa combinación  |

El de `importRuns` faltaba en la primera versión del archivo y solo apareció al ejecutar la primera sincronización contra Firestore real. Es un fallo que **ningún entorno de desarrollo detecta**: el repositorio en memoria no usa índices, y el emulador de Firestore no los exige por defecto. La lección operativa es que la verificación contra Firestore real no se puede posponer hasta el despliegue.

La construcción de un índice tarda unos minutos incluso sobre una colección vacía, y mientras tanto la consulta sigue fallando con un mensaje distinto —`That index is currently building`— que conviene saber distinguir del de índice inexistente.

## Contratos de API

Base: `/api/v1`. Respuestas en JSON con propiedades en camelCase, sobre HTTPS.

El enunciado propone `GET /directorio` con parámetros en español. El equipo mantiene rutas y parámetros en inglés y con versionado explícito, por consistencia con el resto del código y con la convención REST. La desviación queda registrada en [statement.md](statement.md).

### `POST /api/v1/place-imports`

Dispara una sincronización desde Places API hacia la base propia. No se expone en la UI.

Request:

```json
{
  "keyword": "cardiologo zona 10 Guatemala",
  "specialty": "cardiology",
  "zone": "10"
}
```

Respuesta `201 Created`:

```json
{
  "code": "place_import_created",
  "message": "Place import completed successfully",
  "data": {
    "importId": "imp_001",
    "keyword": "cardiologo zona 10 Guatemala",
    "specialty": "cardiology",
    "zone": "10",
    "pagesFetched": 2,
    "itemsFetched": 20,
    "itemsUpserted": 18,
    "specialtyConflicts": [],
    "startedAt": "2026-08-10T09:06:42.079Z",
    "finishedAt": "2026-08-10T09:06:43.263Z"
  }
}
```

#### `specialtyConflicts`

`placeId` es la clave del documento en Firestore (P1-05, evita duplicados). Tiene un costo: Places API no separa negocios por especialidad, así que el mismo lugar real puede aparecer en los resultados de más de una búsqueda — un centro médico grande, por ejemplo, coincide tanto con `oncologia` como con `medicina general`. Como la escritura es un `merge` por `placeId`, la sincronización más reciente le **cambia** la etiqueta `specialty` a ese documento, no la agrega. El anterior desaparece sin dejar rastro salvo por este campo.

Se detectó corriendo las diez especialidades sobre la misma zona: de 168 lugares que reportó cada corrida como `itemsUpserted`, solo 159 quedaron como documentos distintos en Firestore. `specialtyConflicts` deja esa pérdida visible en el momento en que ocurre — antes solo se podía notar contando documentos después y restando a mano — con el `placeId`, el nombre y las dos especialidades involucradas:

```json
"specialtyConflicts": [
  {
    "placeId": "ChIJ_ejemplo",
    "name": "Centro Medico Compartido",
    "previousSpecialty": "oncology",
    "newSpecialty": "cardiology"
  }
]
```

Queda como detección, no como corrección: el sistema sigue clasificando cada lugar bajo una única especialidad, la de la sincronización más reciente. Guardar varias especialidades por lugar es un cambio de modelo de datos mayor (deja de ser un campo simple, pasa a ser una lista, y afecta los índices y los filtros de `GET /api/v1/places`) que no se justifica para el alcance de este proyecto. Queda pendiente para P1 decidir si se documenta como limitación conocida o se aborda.

### `GET /api/v1/places`

Consulta la base propia. No llama a Google.

Query params:

| Parámetro   | Tipo   | Descripción                                 |
| :---------- | :----- | :------------------------------------------ |
| `specialty` | string | Especialidad médica a filtrar               |
| `zone`      | string | Zona administrativa                         |
| `page`      | number | Página actual, por defecto 1                |
| `pageSize`  | number | Tamaño de página, por defecto 10, máximo 50 |

Los resultados se devuelven ordenados por nombre. **No existe búsqueda por texto libre**, y la ausencia es deliberada: ver [Por qué no hay búsqueda por texto](#por-qué-no-hay-búsqueda-por-texto).

Respuesta `200 OK`:

```json
{
  "code": "place_list",
  "message": "Resources list retrieved successfully",
  "data": [
    {
      "placeId": "ChIJ_example_1",
      "name": "Centro Cardiologico Zona 10",
      "specialty": "cardiology",
      "formattedAddress": "4a Avenida 12-34 Zona 10, Guatemala",
      "phoneNumber": "+502 2222 3333",
      "website": "",
      "zone": "10",
      "sourceKeyword": "cardiologia zona 10 Guatemala",
      "collectedAt": "2026-08-05T14:32:00Z",
      "stale": false
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "totalItems": 47,
      "totalPages": 5
    }
  }
}
```

El campo `stale` es booleano: vale `true` cuando el registro superó el TTL. Un `phoneNumber` o un `website` vacío se devuelve como cadena vacía, nunca omitido ni sustituido por otra fuente.

#### Por qué no hay búsqueda por texto

El contrato tuvo un parámetro `q` de búsqueda libre sobre el nombre. Se retiró, y la razón vale la pena dejarla escrita porque parece una pérdida de funcionalidad y no lo es.

**Contradecía una decisión ya tomada.** El catálogo cerrado existe justamente para que el usuario no escriba texto libre: acota el costo, evita consultas arbitrarias y hace que la cobertura sea documentable. Un campo de búsqueda abierto reintroducía por la puerta de atrás lo que el catálogo cierra por delante. El enunciado tampoco lo pide: enumera `page`, `pageSize`, especialidad y zona.

**Y no podía implementarse igual en los dos adaptadores.** Firestore no tiene búsqueda de texto completo. El adaptador en memoria resolvía `q` como subcadena, y el de Firestore como prefijo sobre un campo auxiliar `nameLowercase`. No son la misma operación: buscar `cardio` encuentra `Clínica Cardiológica del Valle` por subcadena, pero no por prefijo, porque el nombre empieza por otra palabra. Y en nombres de establecimientos médicos el término distintivo casi nunca va primero, así que la variante por prefijo habría sido inútil en la práctica.

Dos implementaciones del mismo puerto que devuelven conjuntos distintos ante la misma consulta rompen la propiedad que justifica la arquitectura: que la infraestructura sea sustituible sin que el dominio lo note. Sostener `q` exigía un índice invertido externo, que excede el alcance del proyecto, o resolver el filtro en memoria tras traer los resultados, lo que falsea el conteo de la paginación y lee más documentos de los necesarios.

Retirarlo elimina el problema en lugar de administrarlo. Si el equipo decidiera recuperarlo, la vía honesta sería declarar la búsqueda como prefijo en el contrato y alinear ambos adaptadores, asumiendo su limitación de forma explícita.

### `GET /api/v1/specialties`

Devuelve el catálogo de especialidades soportadas con sus variantes de búsqueda. La UI lo consume para construir el selector, de modo que un cambio de catálogo no exige tocar el frontend.

Respuesta `200 OK`:

```json
{
  "code": "specialty_list",
  "message": "Specialty catalog retrieved successfully",
  "data": [
    {
      "specialty": "cardiology",
      "keywords": ["cardiologia", "clinica cardiologica", "centro cardiovascular"]
    }
  ]
}
```

No lleva paginación: es un catálogo cerrado de diez elementos, la excepción prevista en el estándar de API. Las etiquetas visibles no vienen aquí; el frontend las resuelve con la clave `specialty_<key>` en sus diccionarios.

### Política de errores

El backend no devuelve mensajes destinados al usuario final. Cada respuesta lleva dos campos con audiencias distintas, conforme al estándar de i18n del proyecto:

| Campo     | Audiencia                                                                 | Naturaleza                                                                  |
| :-------- | :------------------------------------------------------------------------ | :-------------------------------------------------------------------------- |
| `code`    | La máquina. El frontend lo usa como clave del diccionario de traducciones | Estable, en inglés, snake_case, nunca se traduce ni se reformula            |
| `message` | El desarrollador, en logs y depuración                                    | Técnico, puede cambiar sin romper clientes porque nadie depende de su texto |

Esta separación permite que el texto que ve el usuario cambie de idioma o de redacción sin tocar el backend.

Catálogo de códigos:

| Código HTTP | `code`                         | Cuándo ocurre                                                               |
| :---------- | :----------------------------- | :-------------------------------------------------------------------------- |
| `200`       | `place_list`                   | Consulta exitosa del directorio                                             |
| `201`       | `place_import_created`         | Sincronización completada                                                   |
| `400`       | `validation_error`             | Parámetros ausentes o mal formados, incluido `pageSize` mayor a 50          |
| `403`       | `ip_not_allowed`               | IP de origen fuera de la whitelist                                          |
| `200`       | `specialty_list`               | Catálogo de especialidades consultado                                       |
| `404`       | `resource_not_found`           | Recurso inexistente                                                         |
| `422`       | `specialty_not_supported`      | Especialidad fuera del catálogo soportado                                   |
| `422`       | `zone_not_supported`           | Zona fuera de las 22 zonas válidas de Ciudad de Guatemala                   |
| `429`       | `place_import_cooldown_active` | Se intentó sincronizar la misma keyword y zona antes de cumplir el cooldown |
| `429`       | `rate_limit_exceeded`          | Se superó el límite de peticiones por minuto para el origen                 |
| `500`       | `internal_error`               | Error no controlado                                                         |
| `503`       | `places_provider_unavailable`  | Places API no responde o agota cuota                                        |

Los códigos siguen la convención `recurso_condicion` del estándar de i18n. Se descartaron formas invertidas como `unsupported_specialty`, que nombran primero la condición, para mantener consistencia con el resto del catálogo.

Sobre el `403`: la tabla de estándares lo define como "autenticado pero sin permisos". Aquí no hay autenticación, y esa es justamente la razón de usarlo en lugar de `401`: no existe credencial que el cliente pueda presentar para corregir la situación, su origen simplemente no está autorizado. El enunciado exige `403` de forma explícita.

Formato de error:

```json
{
  "code": "ip_not_allowed",
  "message": "Request origin is not allowed"
}
```

Error de validación con detalle por campo:

```json
{
  "code": "validation_error",
  "message": "Request validation failed",
  "errors": {
    "details": [
      {
        "field": "pageSize",
        "code": "out_of_range",
        "message": "pageSize must be between 1 and 50"
      }
    ]
  }
}
```

Ningún mensaje de error expone nombres de colecciones, la API key ni trazas internas. El `message` es técnico, pero no revela estructura interna del sistema.

### `GET /health`

Endpoint de verificación de estado, sin prefijo de versión y **exento del middleware de whitelist**.

La exención es necesaria: la comprobación de salud del contenedor se origina dentro del propio contenedor, con una IP interna que nunca estará en la lista de orígenes autorizados. Someterlo a la whitelist haría que el orquestador considerara el servicio caído de forma permanente.

Para que la exención no abra superficie, el endpoint cumple tres condiciones:

- Responde únicamente `200` con `{ "code": "service_healthy" }`. Sin datos, sin versiones, sin nombres de dependencias.
- No consulta Firestore ni Places API. Verificar que el proceso responde no debe costar dinero ni carga.
- No revela si las dependencias están configuradas. Un atacante no puede usarlo para inferir el estado interno del sistema.

### Función `helloWorld`

Función desplegada aparte de la API, entregable de la Semana 1. Responde `200` con el texto `Hello World` y nada más.

No forma parte del producto: existe para verificar que el pipeline completo funciona, desde compilar el monorepo hasta responder en el proyecto desplegado. Está exenta de la whitelist por la misma razón que el health check y con las mismas condiciones: no toca Firestore, no llama a Places API y no revela entorno, versión ni estado interno.

### Diccionarios de traducción

Viven en el frontend, en `src/i18n/`, con un archivo por idioma. El proyecto mantiene `es.json` y `en.json`, ambos obligatorios. El backend no los conoce ni los importa.

```json
// es.json
{
  "place_list": "Directorio consultado correctamente",
  "place_import_created": "Sincronizacion completada",
  "validation_error": "Revisa los datos de la busqueda",
  "specialty_list": "Catalogo de especialidades",
  "zone_not_supported": "Esa zona no esta disponible en el directorio",
  "resource_not_found": "No se encontro lo que buscabas",
  "required_field": "Este campo es obligatorio",
  "invalid_type": "El valor no tiene el formato esperado",
  "out_of_range": "El valor esta fuera del rango permitido",
  "not_in_catalog": "El valor no esta entre las opciones disponibles",
  "ip_not_allowed": "No tienes acceso al servicio desde esta red. Contacta al administrador",
  "specialty_not_supported": "Esa especialidad no esta disponible en el directorio",
  "place_import_cooldown_active": "Esta busqueda se sincronizo hace poco. Intenta mas tarde",
  "rate_limit_exceeded": "Demasiadas peticiones. Espera un momento antes de continuar",
  "internal_error": "Ocurrio un error inesperado. Intenta de nuevo mas tarde",
  "places_provider_unavailable": "El servicio de datos no esta disponible en este momento"
}
```

Toda clave nueva se agrega a los dos diccionarios en el mismo Pull Request. Si falta una traducción, se resuelve con el idioma de respaldo antes de mostrar la clave cruda.

## Seguridad

| Control               | Implementación                                                                                                                                                                                          |
| :-------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Acceso al servicio    | Whitelist de IPs aplicada en middleware antes de cualquier controlador                                                                                                                                  |
| API key de Google     | Leída de variables de entorno o Secret Manager; nunca versionada ni enviada al cliente                                                                                                                  |
| Restricción de la key | Restringida en la consola de GCP para funcionar solo desde las IPs del proyecto, y limitada a Places API                                                                                                |
| Transporte            | HTTPS obligatorio                                                                                                                                                                                       |
| Superficie expuesta   | La UI solo conoce `GET /api/v1/places`. El endpoint de sincronización no se expone en la interfaz ni tiene botón, porque cada invocación tiene costo real y un control visible sería un vector de gasto |
| Costo                 | Tope de 20 resultados por sincronización, cooldown por keyword y cuota diaria en la consola de APIs                                                                                                     |
| Validación            | Todo parámetro de entrada se valida antes de llegar al caso de uso                                                                                                                                      |

Cada integrante del equipo usa su propia API key en desarrollo. Compartir una key multiplica el riesgo de consumo no controlado sobre una sola cuenta.

### Administración de la whitelist

La IP autorizada es la IP pública de salida del cliente y cambia con la red desde la que se conecta. Un equipo que trabaja desde la universidad, desde casa y desde la demo necesita modificar la lista varias veces, de modo que la whitelist se administra como **configuración editable sin redeploy**: un documento en Firestore que el middleware lee en cada request, no una constante compilada.

**El documento se edita desde la consola de Firebase.** No existe endpoint de administración de la whitelist.

|                     | Consola de Firebase, adoptada         | Endpoint de administración, descartado    |
| :------------------ | :------------------------------------ | :---------------------------------------- |
| Código a escribir   | Ninguno                               | Endpoint, validación y manejo del secreto |
| Autenticación       | Cuenta de Google con segundo factor   | Secreto compartido en variable de entorno |
| Superficie expuesta | Ninguna                               | Un endpoint alcanzable desde internet     |
| Trazabilidad        | Registro por cuenta de quién modificó | Nula, todos usan la misma llave           |
| Riesgo principal    | Requiere abrir la consola             | Filtración del secreto anula la whitelist |

La razón que decide es estructural, no de comodidad. Un endpoint de administración solo resuelve el caso de un integrante que llega desde una red nueva si **no está detrás del middleware de whitelist**: estando detrás, únicamente una IP ya autorizada podría agregar otras, y con la lista vacía o desactualizada el equipo quedaría permanentemente fuera de su propio sistema. Esa exposición obligada tendría que compensarse con un secreto compartido entre cuatro personas, lo que constituye un mecanismo de autenticación más débil que el que la consola de Firebase ya provee sin escribir código.

Cambiar de red implica editar un documento en la consola. Es un costo operativo menor frente a mantener un endpoint sin protección de red y con un secreto que no distingue quién lo usó.

Cloud Armor se contempla como alternativa avanzada al middleware de whitelist. No es requerido para nota completa y su adopción queda pendiente de decisión del equipo; si se implementa, se documenta la diferencia frente al middleware.

## Control de costos

El presupuesto es un requisito del proyecto, no una recomendación. Cada integrante responde por el gasto de su cuenta.

**Las cifras del enunciado están desactualizadas y el proyecto no se rige por ellas.** El crédito recurrente de 200 USD mensuales de Google Maps Platform dejó de existir el 1 de marzo de 2025: lo sustituyó un umbral gratuito mensual por SKU, que no se acumula entre servicios. Y la referencia de 0.017 USD por llamada corresponde a un SKU inferior al que aplica aquí. Los valores verificados en la consola de pricing son estos.

| Dato                                              | Valor verificado                                              |
| :------------------------------------------------ | :------------------------------------------------------------ |
| SKU aplicable al proyecto                         | Text Search **Enterprise**, por requerir teléfono y sitio web |
| Precio del SKU                                    | 35.00 USD por cada 1,000 llamadas                             |
| Costo por llamada facturable                      | 0.035 USD                                                     |
| Llamadas gratuitas al mes en ese SKU              | 1,000                                                         |
| Llamadas facturables por sincronización           | 2, por el tope de 20 resultados en páginas de 10              |
| Costo por sincronización facturable               | 0.07 USD                                                      |
| Sincronizaciones cubiertas por el umbral gratuito | 500 al mes                                                    |
| Límite duro por sincronización                    | 1 USD                                                         |

Frente a la referencia del enunciado, el costo real es aproximadamente el doble. Aun así el proyecto no gasta: el umbral gratuito de 1,000 llamadas mensuales cubre 500 sincronizaciones, muy por encima del uso de pruebas, y el crédito de la prueba gratuita de Google Cloud absorbe cualquier exceso.

El costo por llamada depende del field mask solicitado y no es un valor único. El detalle de SKUs está en la estrategia de keywords.

Controles obligatorios, previos a escribir código:

| Control                                   | Configuración                                         | Responsable              |
| :---------------------------------------- | :---------------------------------------------------- | :----------------------- |
| Alertas de billing al 50% y 90%           | Consola de GCP, Facturación, Presupuestos y alertas   | Cada integrante          |
| Cuota máxima de llamadas por día          | Maps Platform, Cuotas, `SearchTextRequest per day`    | Cada integrante          |
| Cuota máxima de llamadas por minuto       | Maps Platform, Cuotas, `SearchTextRequest per minute` | Cada integrante          |
| Emulador local para el 90% del desarrollo | Firebase Emulator Suite                               | P3 configura, todos usan |

Los valores acordados son **200 solicitudes por día** y **60 por minuto**. Las doscientas diarias equivalen a cien sincronizaciones, holgado para pruebas y lejos de cualquier accidente costoso; la de por minuto cubre un escenario distinto, el de un bucle que dispara cientos de llamadas en segundos, donde un tope diario llegaría tarde.

Dos precisiones sobre el alcance de cada control. El presupuesto **solo avisa**: quien impide el gasto es la cuota. Y la alerta debe configurarse sin descontar los créditos promocionales, porque midiendo el costo neto no notificaría nada mientras el crédito de la prueba gratuita siga cubriendo el consumo.

Existe además un gasto que ninguno de esos controles cubre, porque no proviene de Places API sino del propio despliegue: **cada despliegue de la función genera una imagen de contenedor** que queda almacenada en Artifact Registry. Sin política de limpieza se acumulan indefinidamente, y como la capa gratuita es de 0.5 GB, unos pocos despliegues bastan para superarla y empezar a facturar almacenamiento cada mes. El primer `firebase deploy` ofrece configurarla; la respuesta del proyecto es **conservar las imágenes un día**. Guardar versiones antiguas no aporta nada, porque revertir un despliegue se hace redesplegando desde el código y no recuperando una imagen.

El recorrido de consola completo, con las pantallas y los nombres exactos de cada opción, está en [credentials-setup.md](credentials-setup.md).

### Evidencia de configuración

Entregable de la Semana 1. Las capturas se guardan en `docs/images/` y se enlazan aquí.

| Evidencia                                  | Captura                                                   | Qué se comprueba en ella                                              |
| :----------------------------------------- | :-------------------------------------------------------- | :-------------------------------------------------------------------- |
| Presupuesto con alertas al 50%, 90% y 100% | [billing-budget.png](images/billing-budget.png)           | Alcance limitado al proyecto, tres umbrales y `No se usaron créditos` |
| Crédito de la prueba gratuita              | [billing-credits.png](images/billing-credits.png)         | Saldo disponible y fecha de vencimiento                               |
| Cuotas de Places API                       | [places-api-quota.png](images/places-api-quota.png)       | `SearchTextRequest` en 200 por día y 60 por minuto                    |
| Restricción de la API key                  | [api-key-restriction.png](images/api-key-restriction.png) | Las dos IPs autorizadas y la restricción a Places API (New)           |
| Whitelist dejando pasar una IP autorizada  | [ip-whitelist-200.png](images/ip-whitelist-200.png)       | La whitelist carga sus entradas y la petición responde `200`          |
| Whitelist rechazando una IP no autorizada  | [ip-whitelist-403.png](images/ip-whitelist-403.png)       | `403` con `ip_not_allowed` y la IP rechazada registrada en el log     |
| Función `hello world` desplegada           | [hello-world-deploy.png](images/hello-world-deploy.png)   | `Deploy complete!`, la URL de la función y su respuesta `200`         |

De la Semana 2, cuyo entregable es una colección con datos reales:

| Evidencia                       | Captura                                                     | Qué se comprueba en ella                                              |
| :------------------------------ | :---------------------------------------------------------- | :-------------------------------------------------------------------- |
| Colección `places` en Firestore | [firestore-places.png](images/firestore-places.png)         | Documentos identificados por su `placeId` y con los campos del modelo |
| Registro de la sincronización   | [firestore-import-run.png](images/firestore-import-run.png) | `importRuns` con páginas recorridas, elementos traídos y persistidos  |

El registro de la sincronización acredita algo que la colección de lugares por sí sola no muestra: que el recorrido respetó el tope de dos páginas y que cada dato llegó de una keyword declarada, no inferida.

Las alertas del 50% y del 90% no son dos presupuestos sino dos umbrales de uno solo, de modo que una única captura de la lista de presupuestos las acredita a ambas: muestra a la vez el nombre, el proyecto al que se aplica, los tres umbrales y el consumo acumulado.

La whitelist es entregable de la Semana 1 por sí misma, así que necesita evidencia propia: que el código exista no se ve en una entrega. Son dos imágenes y no una porque el valor está en el contraste entre ambos estados, y combinarlas obliga a reducir el texto hasta que los logs dejan de leerse.

Cada una muestra el proceso del backend junto a la petición, de modo que se vean a la vez el número de entradas que cargó la whitelist al arrancar, el código de estado devuelto y, en el caso del rechazo, la línea donde el middleware registra la IP rechazada. El contraste entre las dos acredita que el corte depende de la lista y no de otra cosa.

La forma reproducible de generarlas es levantar el backend dos veces, la segunda con la variable sobrescrita en la línea de comandos:

```bash
pnpm dev:backend                                # la IP local esta autorizada, responde 200
IP_WHITELIST=203.0.113.10 pnpm dev:backend      # ninguna IP local coincide, responde 403
```

`203.0.113.0/24` es un rango reservado para documentación, así que no corresponde a ninguna red real. La variable en la línea de comandos tiene prioridad sobre el archivo `.env`, que se carga sin sobrescribir lo ya presente en el entorno.

Ninguna captura debe mostrar el valor de una API key ni de una versión de secreto, ni siquiera parcialmente. Las pantallas de credenciales se recortan antes de esa columna.

Cada captura se toma de la pantalla que muestra el resultado ya aplicado, no del formulario que lo configura: un formulario prueba que alguien escribió unos valores, no que quedaran guardados. Para el presupuesto, por ejemplo, la lista de presupuestos muestra en una sola vista el proyecto, los umbrales, el consumo acumulado y si se descontaron créditos, cosa que el formulario de creación no permite verificar.

### Evidencia de despliegue

De la Semana 3, cuyo entregable es la API paginada y la UI accesible vía Firebase Hosting. UI desplegada: [https://adfasdfasfd-1899a.web.app](https://adfasdfasfd-1899a.web.app). En proceso de completarse; las capturas de `deploy --only functions:api:helloWorld`, la segunda API key y el secreto en Secret Manager quedan pendientes de agregar.

| Evidencia                                                      | Captura                                                                             | Qué se comprueba en ella                                                                                                               |
| :------------------------------------------------------------- | :---------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| UI desplegada en Hosting, consumiendo la API real              | [hosting-ui-working.png](images/hosting-ui-working.png)                             | Filtros de especialidad y zona, tabla con datos reales de Firestore, fecha de recolección                                              |
| Campo `sitio_web` apuntando a una red social, no a una clínica | [place-website-field-social-media.png](images/place-website-field-social-media.png) | El enlace "Abrir" de un resultado real lleva a un perfil de Facebook, evidencia de la advertencia de la postura ética sobre este campo |
| Paginación funcionando contra la API desplegada                | [hosting-pagination-working.png](images/hosting-pagination-working.png)             | `Página 1 de 4, 19 registros` construido a partir de `meta.pagination`, controles de avance                                            |

Dos fallos aparecieron al ejecutar el despliegue completo por primera vez, ninguno visible en desarrollo local porque ahí no existe el salto de Hosting ni un origen de navegador distinto del propio backend:

- **CORS por URL absoluta horneada en el bundle.** `apps/frontend/vite.config.ts` lee `VITE_API_BASE_URL` del `.env` de la raíz para el build de producción, y ese archivo traía el valor de desarrollo (`http://localhost:4000/api/v1`), literal en el JavaScript servido. El navegador de quien visitara la UI desplegada intentaba llamar a su propio `localhost`. Corregido dejando `VITE_API_BASE_URL=/api/v1`, una ruta relativa que funciona igual en desarrollo (por el proxy de Vite) y en producción (por el rewrite `/api/**` de `firebase.json`).
- **`TRUST_PROXY_HOPS` corto.** El valor asumía un único salto de proxy delante de la función. Sirve al llamar directo a la URL de Cloud Functions, pero Hosting agrega un salto más: el log de rechazo de la whitelist (`ipWhitelistMiddleware`) mostró un `forwardedFor` con dos direcciones, la IP real del cliente primero y una IP de Google variable después, y con `TRUST_PROXY_HOPS=1` Express resolvía esta segunda como si fuera el cliente. Se corrigió a `2` en `apps/backend/functions.env`, verificado contra el mismo log tras redesplegar.

## Estrategia de keywords

El enunciado exige diseñar y documentar esta estrategia **antes** de ejecutar cualquier búsqueda. Su calidad pesa en la evaluación de la Semana 2.

El problema de fondo: Google Maps no tiene un campo que declare "este profesional es cardiólogo". Tiene nombres de negocio, categorías y reseñas. La keyword no es un detalle de implementación, es la decisión que determina **qué queda dentro y qué queda fuera del directorio**.

### Catálogo cerrado

El usuario no escribe texto libre. Tanto la especialidad como la zona provienen de catálogos cerrados. Esto acota el costo, evita búsquedas arbitrarias contra un endpoint facturable y hace que la cobertura sea documentable.

Ambos catálogos viven en `packages/contracts/src/specialty.ts`, no en un archivo de configuración. La razón es que de esa lista se deriva el tipo `Specialty`: backend y frontend obtienen verificación en tiempo de compilación, y una especialidad inexistente falla al compilar en lugar de en ejecución. Un JSON no puede dar esa garantía.

Las etiquetas que ve el usuario no están en el catálogo: se resuelven en los diccionarios de traducción con la clave `specialty_<key>`, de modo que el catálogo permanezca libre de texto de interfaz.

Zonas válidas de Ciudad de Guatemala: **1 a 19, 21, 24 y 25**. Son 22 zonas en total. Las zonas 20, 22 y 23 no existen: al delimitar el municipio se determinó que ese territorio pertenecía a Mixco, San Miguel Petapa y Santa Catarina Pinula respectivamente. Incluirlas en el catálogo gastaría llamadas facturables en búsquedas sin territorio.

Especialidades soportadas, diez en total: cardiología, pediatría, ginecología, dermatología, traumatología, oftalmología, neurología, psiquiatría, oncología y medicina interna.

### Límite estructural de la API

Places API no ofrece tipos por especialidad médica. Los tipos disponibles en la categoría de salud son `chiropractor`, `dental_clinic`, `dentist`, `doctor`, `drugstore`, `hospital`, `pharmacy`, `spa` y `yoga_studio`. No existe `cardiologist`, `pediatrician` ni equivalente.

De aquí se derivan dos consecuencias que ninguna keyword puede resolver:

- La especialidad **solo puede provenir del texto de la consulta**, porque Google no la modela como atributo.
- Un negocio cuyo nombre no mencione la especialidad no será encontrado por ninguna variante. Los consultorios reales suelen llamarse "Centro Médico El Prado", no "cardiólogo", de modo que la recolección favorece a quienes usan la especialidad como parte de su nombre comercial.

Esta limitación se declara en la postura ética y no se disimula con más variantes.

### Filtrado por tipo

El ruido se ataca con `includedType` y `strictTypeFiltering`, no con la keyword. Cada búsqueda declara el tipo esperado, lo que descarta farmacias, tiendas y negocios que aparecen por coincidencias en reseñas.

| Parámetro             | Valor                                        | Propósito                                                         |
| :-------------------- | :------------------------------------------- | :---------------------------------------------------------------- |
| `includedType`        | `doctor`, o `hospital` según la especialidad | Restringe el resultado a establecimientos médicos                 |
| `strictTypeFiltering` | `true`                                       | Aplica el filtro a todas las consultas, no solo a las categóricas |
| `languageCode`        | `es`                                         | Resultados en español                                             |
| `regionCode`          | `GT`                                         | Sesgo regional a Guatemala                                        |

### Ejes de variación de una keyword

Todas las variantes derivan de una misma raíz, pero **no todas las formas derivadas nombran lo mismo**, y esa diferencia decide cuáles sirven. Places API indexa establecimientos, no personas: una forma que designa a un profesional le pide a un catálogo de negocios algo que no contiene.

| Forma            | Nombre lingüístico                     | Qué designa                                                                   | Uso                                                                 |
| :--------------- | :------------------------------------- | :---------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| `cardiólogo`     | Sustantivo agentivo                    | A la persona que ejerce la especialidad, y al consultorio que lleva su nombre | **Variante principal**, recuperada tras la verificación empírica    |
| `cardiología`    | Sustantivo de disciplina               | Al campo del saber, usado como nombre de servicio                             | Variante principal                                                  |
| `cardiológica`   | Adjetivo relacional                    | Califica al establecimiento                                                   | Variante principal, combinada con el tipo de establecimiento        |
| `cardiovascular` | Adjetivo relacional de campo semántico | Califica al establecimiento con un término del mismo dominio, **no sinónimo** | Variante secundaria, cuando el término existe para esa especialidad |

Dos ejes adicionales, independientes de la forma de la palabra:

| Eje                     | Qué es                                         | Ejemplo                              | Tratamiento                                            |
| :---------------------- | :--------------------------------------------- | :----------------------------------- | :----------------------------------------------------- |
| Tipo de establecimiento | Modificador del negocio, no del término médico | `clínica`, `centro`, `consultorio`   | Se antepone al término médico                          |
| Variante ortográfica    | Diacríticos, con tilde y sin tilde             | `cardiologia` frente a `cardiología` | **Eliminado** tras la verificación empírica: sin tilde |

Criterio que gobierna la selección: **una variante se incluye solo si aporta registros que las demás no encuentran**, comprobado con datos y no supuesto a partir de la forma de la palabra.

Ese criterio sustituye a uno anterior, que exigía que la variante «pudiera funcionar como nombre de un establecimiento real». Sonaba razonable y resultó ser mal predictor: la verificación empírica mostró que Google no empareja por coincidencia léxica, de modo que razonar sobre qué palabra figura en el nombre de un local no anticipa qué devuelve la API. Un consultorio llamado `Dr. Fernando Muralles - Cardiología Pediátrica` responde a `cardiologo` y no a `cardiologia`.

El ejemplo que trae el enunciado, `cardiólogo zona 10 Guatemala`, usa la forma agentiva. El equipo llegó a descartarla por el criterio anterior y la recuperó al comprobarlo: el detalle está en [Verificaciones previas](#verificaciones-previas).

### Plantilla de keyword

```bash
textQuery      = "{término} zona {zona} Guatemala"
includedType   = doctor | hospital
strictTypeFiltering = true
languageCode   = es
regionCode     = GT
```

Google advierte que Text Search no está diseñada para consultas ambiguas y recomienda evitar consultas con múltiples conceptos. La plantilla combina tres: término médico, zona y ciudad.

Se conserva de todos modos, por una razón deliberada: la alternativa es separar la geografía con `locationBias` o `locationRestriction`, que aceptan círculos y rectángulos. Las zonas de Ciudad de Guatemala no son figuras regulares, de modo que aproximarlas geométricamente asignaría zona por cálculo y no por declaración. Eso sería inferir un dato que Google no entrega, que es justamente lo que el proyecto prohíbe. Manteniendo la zona en el texto, el valor de `zone` proviene de una decisión explícita del operador y queda trazado en `sourceKeyword`.

El costo de esta decisión es mayor ruido en los resultados, mitigado por `strictTypeFiltering` y reportado en la cobertura.

Entre 2 y 5 variantes de `{término}` por especialidad, con 3 como valor de referencia:

| Variante | Forma                                   | Ejemplo en cardiología  |
| :------- | :-------------------------------------- | :---------------------- |
| 1        | Sustantivo de disciplina                | `cardiología`           |
| 2        | Establecimiento más adjetivo relacional | `clínica cardiológica`  |
| 3        | Establecimiento más campo semántico     | `centro cardiovascular` |

### Variantes por especialidad

Propuesta inicial, sujeta a validación contra nombres comerciales reales durante la Semana 2. La columna de forma agentiva se incluye solo como referencia de lo que se descarta.

| Especialidad     | Clave             | Agentivo, descartado | Disciplina       | Adjetivo relacional | Campo semántico   |
| :--------------- | :---------------- | :------------------- | :--------------- | :------------------ | :---------------- |
| Oncología        | `oncology`        | oncólogo             | oncología        | oncológica          | —                 |
| Cardiología      | `cardiology`      | cardiólogo           | cardiología      | cardiológica        | cardiovascular    |
| Pediatría        | `pediatrics`      | pediatra             | pediatría        | pediátrica          | infantil médico   |
| Dermatología     | `dermatology`     | dermatólogo          | dermatología     | dermatológica       | —                 |
| Ginecología      | `gynecology`      | ginecólogo           | ginecología      | ginecológica        | gineco-obstétrico |
| Neurología       | `neurology`       | neurólogo            | neurología       | neurológica         | neurociencias     |
| Oftalmología     | `ophthalmology`   | oftalmólogo          | oftalmología     | oftalmológica       | —                 |
| Ortopedia        | `orthopedics`     | ortopedista          | ortopedia        | ortopédica          | traumatología     |
| Psiquiatría      | `psychiatry`      | psiquiatra           | psiquiatría      | psiquiátrica        | salud mental      |
| Medicina general | `generalMedicine` | médico general       | medicina general | —                   | —                 |

No todas las especialidades completan las tres formas, y forzarlas sería contraproducente:

- **Medicina general** carece de adjetivo relacional de uso comercial y se queda en dos variantes. Además es la única entrada del catálogo que no es una especialidad en sentido estricto: se incluye porque buena parte de la oferta médica de barrio se registra así, y su presencia se declara en el reporte de cobertura para no presentarla como especialización.
- **Dermatología** tiene un término de campo semántico obvio, `piel`, que se descarta porque arrastra spas y centros de estética. El filtro `includedType` reduce ese ruido pero no lo elimina.
- **Oftalmología** tendría `óptica`, que se descarta porque designa un comercio de lentes y no un servicio médico.
- **Ortopedia** conserva `traumatología` como campo semántico. Son especialidades vecinas y muchos establecimientos usan ambos términos, de modo que la variante amplía cobertura real en lugar de arrastrar otro rubro.
- **Psiquiatría** comparte el término `salud mental` con psicología, que no está en el catálogo. Los registros que ingresen por esa vía deben revisarse antes de darlos por válidos.

Cada término de campo semántico se evalúa individualmente. Un término que arrastra un rubro distinto al médico se descarta aunque sea correcto en el lenguaje común.

### Verificaciones previas

Dos decisiones de la estrategia se apoyaban en argumentos razonables pero no comprobados, y se resolvieron comparando los `placeId` que devuelven consultas que solo difieren en la forma de la palabra. Todo lo demás —zona, tipo, idioma, región— se mantiene igual que en el adaptador real; si variara más de una cosa a la vez la comparación no diría nada.

El experimento es reproducible con `apps/backend/scripts/compareKeywords.mjs`, que sin `--run` hace una pasada en seco y no llama a Google.

Se ejecutó dos veces, con páginas de 10 y de 20 resultados. **El tamaño de página resultó decisivo para interpretar los datos**: con 10, un registro que ronda ese puesto entra en una consulta y sale en otra, de modo que la comparación no distingue si cambió la cobertura o solo el orden. Comparar ambas corridas separa una cosa de la otra.

#### Forma agentiva contra disciplina

| Página | `cardiologo` exclusivos | `cardiologia` exclusivos | Coincidentes |
| :----- | ----------------------: | -----------------------: | -----------: |
| 10     |                       3 |                        3 |            7 |
| 20     |                       3 |                        3 |           17 |

**El agentivo se conserva.** Los exclusivos se mantuvieron en tres al duplicar la página: si fueran ruido de ordenamiento habrían disminuido, como ocurrió con los diacríticos. Es cobertura que la forma de disciplina no alcanza.

Lo que aporta es además lo que el directorio busca. Los tres exclusivos de la corrida de 20 fueron `Dr. Salvador Aguilar | Cardiólogo en Guatemala`, `Dr. Fernando Muralles - Cardiología Pediátrica` y `Dr. Marco Rodas Díaz - Cardiólogo`: **médicos individuales registrados con su propio nombre**, que es precisamente lo que pide un directorio de especialistas.

La premisa que sostenía el descarte era que «Places API indexa establecimientos, no personas». Es cierta en su literalidad y engañosa en su consecuencia: el consultorio de un médico **es** un establecimiento, y su nombre comercial suele contener la forma agentiva porque lleva el nombre del doctor. Descartar el agentivo excluía de forma sistemática a los profesionales individuales.

Dos observaciones que el conteo por sí solo no muestra:

- `Dr. Fernando Muralles - Cardiología Pediátrica` aparece **solo** en la consulta con `cardiologo`, pese a que su nombre contiene «Cardiología». La coincidencia de Google no es léxica sino semántica, así que razonar sobre qué palabra figura en el nombre no predice qué devuelve la API.
- En sentido contrario, `cardiologia` trajo `Centro de Geriatría de Guatemala`, que no es cardiología. Ninguna variante es estrictamente mejor: cada una acierta y falla de manera distinta, lo que refuerza usar ambas.

El ejemplo del enunciado, `cardiólogo zona 10 Guatemala`, era correcto. La desviación que el equipo había asumido queda revertida.

#### Forma agentiva en las nueve especialidades restantes

La verificación de cardiología no se extendía sola a las demás: cada especialidad tiene su propio par agentivo/disciplina (`oncologo`/`oncologia`, `pediatra`/`pediatria`...), y nada garantiza que el patrón se repita solo por analogía gramatical. Se corrió la misma comparación —agentivo contra disciplina, página de 20, zona 10— para las nueve restantes con `apps/backend/scripts/compareKeywords.mjs --specialty=all --run --page-size=20`, sin repetir el eje de diacríticos porque ese ya se dio por eliminado en general.

| Especialidad     | Resultados agentivo | Exclusivos | Aporta |
| :--------------- | ------------------: | ---------: | :----: |
| Oncología        |                  15 |          8 |   sí   |
| Pediatría        |                  20 |          6 |   sí   |
| Dermatología     |                  20 |          5 |   sí   |
| Ginecología      |                  20 |          6 |   sí   |
| Neurología       |                  20 |          7 |   sí   |
| Oftalmología     |                  20 |          2 |   sí   |
| Ortopedia        |                  18 |         12 |   sí   |
| Psiquiatría      |                  20 |          4 |   sí   |
| Medicina general |                  20 |         11 |   sí   |

**Las nueve aportan registros exclusivos, sin excepción.** El agentivo se conserva en las diez especialidades del catálogo, no por analogía gramatical sino comprobado uno por uno. El caso más marcado es ortopedia: `ortopedista` trae 18 resultados contra 8 de `ortopedia`, y 12 de esos 18 son exclusivos — la mayoría de los traumatólogos y ortopedistas de la muestra solo aparecen bajo la forma agentiva. El más marginal es oftalmología, con 2 exclusivos sobre 20, que igual se conserva: el criterio es empírico (aporta o no aporta), no un umbral mínimo de cuántos aporta.

#### Diacríticos

| Página | `cardiologia` exclusivos | `cardiología` exclusivos | Coincidencia |
| :----- | -----------------------: | -----------------------: | -----------: |
| 10     |                        2 |                        2 |          80% |
| 20     |                        1 |                        1 |          95% |

**El eje ortográfico se elimina.** La diferencia se encogió al ampliar la ventana, que es la firma del ruido de frontera: los registros no estaban ausentes de una consulta, estaban justo debajo del corte de la otra.

La coincidencia del 95% no es del 100%, y sería deshonesto presentarla como tal. Pero duplicar el costo de la corrida completa para perseguir una diferencia del 5% que además se comporta como ruido no se justifica. Se conserva una sola grafía, sin tilde, que es la que ya usa el catálogo.

#### El agentivo en las diez especialidades

El hallazgo se comprobó en cardiología y se extendió al resto antes de la corrida completa, comparando la forma de disciplina contra la agentiva en cada especialidad, con páginas de 20. Son 20 llamadas en el SKU Pro, sin costo. Cardiología se repitió como control: devolvió los mismos 3 exclusivos y 17 coincidentes que la corrida anterior, lo que confirma que el experimento es reproducible.

| Especialidad     | Disciplina | Agentivo | Exclusivos del agentivo | Coincidentes |
| :--------------- | ---------: | -------: | ----------------------: | -----------: |
| Oncología        |         10 |       15 |                       5 |           10 |
| Cardiología      |         20 |       20 |                       3 |           17 |
| Pediatría        |         20 |       20 |                       5 |           15 |
| Dermatología     |         20 |       20 |                       3 |           17 |
| Ginecología      |         20 |       20 |                       2 |           18 |
| Neurología       |         17 |       20 |                       5 |           15 |
| Oftalmología     |         20 |       20 |                       3 |           17 |
| **Ortopedia**    |      **8** |   **20** |                  **14** |            6 |
| Psiquiatría      |         18 |       20 |                       4 |           16 |
| Medicina general |         20 |       20 |                      11 |            9 |

**Nueve especialidades conservan la forma agentiva.** Dos filas exigieron mirar el contenido y no solo el conteo, y llevaron a decisiones opuestas.

**Ortopedia: se conservan ambas.** `ortopedia` devuelve apenas 8 resultados frente a los 20 de `ortopedista`, y la mayoría de los exclusivos del agentivo se anuncian como _traumatólogo_: el dominio se nombra a sí mismo de otra manera, lo que confirma que la variante de campo semántico `centro de traumatologia` estaba bien elegida. Aun así la forma de disciplina aporta 2 registros que el agentivo no encuentra, de modo que se mantiene. Su bajo rendimiento no es razón para descartarla mientras siga aportando registros propios, y 22 sincronizaciones cuestan 1.54 USD.

**Medicina general: se descarta la forma agentiva.** Aporta once exclusivos, pero la inspección de sus nombres muestra que no son medicina general. Entre ellos hay un coloproctólogo, una clínica de dermatología, una de cardiología, un centro de quiroprácticos y una clínica de pérdida de peso. `medico general` se comporta como un comodín que engancha a cualquier médico e incluso a negocios que no lo son.

Es la única especialidad donde el agentivo se descarta, y conviene subrayar por qué: **no por cantidad sino por precisión**. Once exclusivos son más de los que aportó ninguna otra variante; el problema es que están mal clasificados. Guardar un dermatólogo bajo `generalMedicine` no amplía la cobertura del directorio, la corrompe: el usuario que filtre por medicina general recibiría especialistas de otra cosa.

La decisión introduce un segundo criterio junto al de aportar registros exclusivos: **una variante se descarta si los registros que aporta pertenecen mayoritariamente a otra especialidad**. El primero se mide con el script; el segundo requiere mirar los nombres, y por eso el script los imprime en lugar de limitarse al conteo.

#### Qué mide este experimento y qué no

La distinción anterior es la limitación central del método: **mide cobertura, no precisión**. Una variante que aporta cinco registros nuevos y equivocados puntúa igual que una que aporta cinco correctos, porque el criterio cuenta identificadores sin juzgar si pertenecen a la especialidad consultada.

El ruido no se concentra en una fila. `Hospital Esperanza` aparece como exclusivo tanto en oftalmología como en neurología; `Centro de Geriatría de Guatemala`, en neurología y en psiquiatría; `Edificio Artes Medicas`, que es un edificio y no una consulta, en oftalmología. Las formas de disciplina padecen lo mismo: `cardiologia` trajo ese mismo centro de geriatría.

De ahí se siguen dos cosas. Que el filtrado por `includedType` con `strictTypeFiltering` acota el rubro pero no garantiza que el establecimiento ejerza la especialidad buscada, y que **el directorio contendrá falsos positivos**. Medirlos exigiría clasificar los registros a mano, trabajo que queda fuera del alcance; lo que sí corresponde es declararlo en la postura ética y no presentar la base como un listado verificado de especialistas.

#### Qué deja este experimento

El valor no es solo técnico. La estrategia de keywords se diseñó con un argumento razonable, se puso a prueba y **la prueba refutó una de sus dos decisiones**. La documentación se comprometió a registrar la evidencia aunque contradijera el ejemplo del enunciado; acabó contradiciendo al equipo, y el enunciado tenía razón.

Queda también una advertencia metodológica: con página de 10, la primera corrida sugería que los diacríticos sí cambiaban la cobertura. Una sola medición habría llevado a conservar un eje que duplica el costo sin aportar registros.

### Presupuesto de la estrategia

Places API no cobra una tarifa única por llamada: cobra por **SKU según los campos solicitados en el field mask**, y una petición que mezcla campos de varios SKU se factura al más alto de ellos.

| SKU                | Campos que lo disparan                                                                    | Uso en el proyecto                                                |
| :----------------- | :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------- |
| Essentials ID Only | `places.id`, `places.name`, `places.attributions`                                         | Insuficiente: no devuelve nombre legible ni dirección             |
| Pro                | `places.displayName`, `places.formattedAddress`, `places.location`, `places.types`        | Cubre nombre y dirección                                          |
| **Enterprise**     | `places.nationalPhoneNumber`, `places.websiteUri`, `places.rating`, horarios, price level | **El proyecto cae aquí**: el enunciado exige teléfono y sitio web |

Consecuencia directa: como `phoneNumber` y `website` son obligatorios por enunciado, **toda sincronización se factura al SKU Enterprise**. La referencia de 0.017 USD por llamada que da el enunciado corresponde a un SKU inferior, por lo que el costo real será mayor.

**El precio exacto del SKU Enterprise debe verificarse en la consola de pricing de GCP durante la Semana 1**, antes de ejecutar la corrida completa. Las cifras siguientes usan la referencia de 0.017 USD y quedan sujetas a corrección una vez confirmado el precio real.

Field mask que usa el adaptador, sin campos que no se persisten:

```bash
places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.nextPageToken
```

Se excluye `places.rating` de forma deliberada: dispara Enterprise igual que los anteriores, pero no se persiste ni se usa, de modo que solicitarlo sería pagar por un dato descartado.

Alternativa evaluada y descartada: solicitar solo campos Pro en Text Search y completar teléfono y sitio web con llamadas a Place Details. Serían 2 llamadas Pro más hasta 20 llamadas de Details por sincronización, frente a 2 llamadas Enterprise. La opción de una sola pasada es más barata en cualquier escenario.

El catálogo no tiene el mismo número de variantes en todas las especialidades, así que la cuenta se hace sobre el total real y no sobre un promedio. Cada variante se cruza con las 22 zonas, y cada sincronización son 2 llamadas al SKU Enterprise a 0.035 USD, descontando las 1,000 gratuitas del mes:

| Escenario                      | Variantes | Sincronizaciones |  Llamadas | Facturables | Costo         |
| :----------------------------- | --------: | ---------------: | --------: | ----------: | :------------ |
| Una sincronización individual  |         1 |                1 |         2 |           0 | 0.00 USD      |
| Catálogo antes del experimento |        26 |              572 |     1,144 |         144 | 5.04 USD      |
| **Catálogo verificado**        |    **35** |          **770** | **1,540** |     **540** | **18.90 USD** |

El catálogo verificado cuesta **13.86 USD más** que el anterior: nueve variantes agentivas nuevas, una por especialidad salvo medicina general. Cabe holgadamente en el crédito de la prueba gratuita, pero deja de ser cero, y esa es la contrapartida de la cobertura que aporta.

La corrida completa conviene ejecutarla dentro de un mismo mes, porque el umbral gratuito se renueva mensualmente y repartirla sin motivo desaprovecha 1,000 llamadas libres.

Dos límites distintos, que no deben confundirse:

- **Por operación**: una sincronización nunca debe superar 1 USD. Con 2 llamadas por invocación el costo con la tarifa de referencia es de 0.034 USD. Aun si el SKU Enterprise costara diez veces más, el límite se mantendría. Si una sola sincronización se acercara a 1 USD, significaría que el tope de resultados o el tamaño de página fueron alterados y hay que revisarlo.
- **Por campaña**: una corrida completa del catálogo no es una operación sino una campaña planificada, y requiere presupuesto declarado y aprobación previa del equipo. Se recalcula con el precio real del SKU antes de ejecutarla.

#### Presupuesto aprobado para la corrida completa

| Concepto               | Valor                                     |
| :--------------------- | :---------------------------------------- |
| Alcance                | Catálogo completo: 35 variantes, 22 zonas |
| Sincronizaciones       | 770                                       |
| Llamadas               | 1,540, de las que 540 son facturables     |
| **Presupuesto**        | **18.90 USD**                             |
| Proporción del crédito | 6.3% de los 300 USD                       |
| Aprobación             | P3, como coordinador                      |

La justificación es que la cobertura pesa un 20% en la evaluación y esos 18.90 USD compran entre un 15% y un 20% más de registros por combinación, según midió la verificación de variantes. Renunciar a ese gasto no ahorra nada aprovechable: el crédito vence el 16 de octubre de 2026 y no gastarlo no lo convierte en otra cosa.

**No se amplía el alcance más allá del catálogo.** Sincronizar zonas o especialidades que el contrato no declara produciría datos que la interfaz no puede pedir: gasto sin destino.

Dos condiciones de ejecución, que no son opcionales:

- **La cuota diaria hay que subirla antes y bajarla después.** Está en 200 solicitudes por día y la campaña necesita 1,540: al ritmo actual tardaría ocho días. Se sube a 2,000 el día de la corrida y se devuelve a 200 al terminar. Que la protección estorbe cuando el gasto es deliberado es señal de que está bien puesta, no de que sobre.
- **La corrida se ejecuta una sola vez.** Repetirla no añade registros nuevos salvo que Google haya cambiado sus datos, y sí vuelve a facturar. El cooldown no protege aquí, porque opera por keyword y zona y la campaña recorre combinaciones distintas.

### Ejecución

Las 770 combinaciones de especialidad, variante y zona no se disparan a mano. El operador ejecuta un script que recorre el catálogo e invoca `POST /api/v1/place-imports` por cada combinación. Sigue siendo una acción deliberada y no un proceso programado, y como el cooldown opera por keyword y zona, un recorrido de combinaciones distintas no lo activa.

El script todavía no existe. Cuando se escriba debe respetar la cuota por minuto, que está en 60 solicitudes: a dos llamadas por sincronización, el recorrido no puede superar 30 sincronizaciones por minuto sin empezar a recibir `429`. Con ese ritmo la campaña completa tarda unos 26 minutos.

### Cobertura que queda fuera

La estrategia tiene límites conocidos que se reportan de forma explícita y no se disimulan:

- Un especialista cuyo negocio esté registrado solo con su nombre propio, sin mención de la especialidad, no aparece con ninguna variante.
- Los especialistas que atienden dentro de hospitales generales o centros de salud públicos no aparecen como registro independiente.
- Las especialidades fuera del catálogo de diez no se recolectan.
- La cobertura de Google Maps no es uniforme entre zonas, lo que se aborda en la postura ética.

### Cobertura de campos medida

El enunciado exige que los campos vacíos se reporten y no se rellenen. Reportarlos significa dar el número, no la advertencia genérica.

Primera medición, sobre la sincronización de `cardiologia zona 10 Guatemala` ejecutada contra Places API real y persistida en Firestore:

| Campo              | Registros con dato | Cobertura |
| :----------------- | :----------------- | :-------- |
| `placeId`          | 19 de 19           | 100%      |
| `name`             | 19 de 19           | 100%      |
| `formattedAddress` | 19 de 19           | 100%      |
| `phoneNumber`      | 19 de 19           | 100%      |
| `website`          | 9 de 19            | **47%**   |

**Más de la mitad de los establecimientos no tiene sitio web en el registro de Google.** No es un fallo de la recolección ni un dato pendiente de completar: es la realidad de la fuente. Un directorio que presentara ese campo como habitualmente disponible estaría describiendo mal lo que entrega.

La cifra se reproduce sobre la base ya poblada, sin gastar llamadas:

```bash
curl -s 'http://localhost:4000/api/v1/places?specialty=cardiology&zone=10&pageSize=50' \
  | jq '{total:(.data|length), conTelefono:([.data[]|select(.phoneNumber!="")]|length), conSitio:([.data[]|select(.website!="")]|length)}'
```

#### Cobertura por las diez especialidades, zona 10

Repetida sobre las diez especialidades, todas en zona 10 (la única zona sincronizada hasta ahora; repetirla en otras zonas queda para cuando la recolección avance ahí):

| Especialidad     | Total | Con teléfono | Cobertura tel. | Con sitio web | Cobertura web |
| :--------------- | ----: | -----------: | -------------: | ------------: | ------------: |
| Cardiología      |    13 |           13 |           100% |             4 |           30% |
| Oncología        |     5 |            5 |           100% |             3 |           60% |
| Pediatría        |    19 |           19 |           100% |             8 |           42% |
| Dermatología     |    20 |           19 |            95% |            14 |           70% |
| Ginecología      |    20 |           20 |           100% |            16 |           80% |
| Neurología       |    14 |           14 |           100% |            11 |           78% |
| Oftalmología     |    20 |           18 |            90% |             7 |           35% |
| Ortopedia        |     8 |            8 |           100% |             4 |           50% |
| Psiquiatría      |    17 |           17 |           100% |            13 |           76% |
| Medicina general |    18 |           18 |           100% |            11 |           61% |

**La cobertura de teléfono es alta y pareja en las diez** (90-100%). **La de sitio web varía mucho** (30% en cardiología, 80% en ginecología): confirma lo que la primera medición ya sugería, que la proporción no se sostiene entre especialidades, y descarta usar la cifra de una sola como representativa de todas.

El total de cardiología bajó de 19 (primera medición) a 13: no es una pérdida de datos, es el mismo fenómeno de `specialtyConflicts` documentado más arriba, aplicado también al campo `zone` por la misma razón (`placeId` como clave del documento). El import de prueba de `cardiologia zona 4 Guatemala` durante el despliegue tocó lugares que ya estaban clasificados en zona 10 y les cambió la zona. Es la misma limitación conocida, no un caso nuevo.

Reproducible para las diez de una corrida, sin gastar llamadas:

```bash
for s in cardiology oncology pediatrics dermatology gynecology neurology ophthalmology orthopedics psychiatry generalMedicine; do
  curl -s "http://localhost:4000/api/v1/places?specialty=${s}&zone=10&pageSize=50" \
    | jq -r --arg s "$s" '{s:$s, total:(.data|length), tel:([.data[]|select(.phoneNumber!="")]|length), web:([.data[]|select(.website!="")]|length)}'
done
```

## Decisiones de diseño

| Decisión                                                                                                   | Alternativa descartada                           | Razón                                                                                                                                                                                                                                                                                                                                                                                        |
| :--------------------------------------------------------------------------------------------------------- | :----------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dos endpoints separados: sincronización y consulta                                                         | Un endpoint que consulte Google en cada request  | Aísla el costo y la latencia de Google del flujo de consulta y permite servir desde caché                                                                                                                                                                                                                                                                                                    |
| Firestore como caché persistente                                                                           | Caché en memoria de la función                   | Las Cloud Functions son efímeras; la información debe sobrevivir entre invocaciones                                                                                                                                                                                                                                                                                                          |
| Sincronización manual                                                                                      | Refresco automático con Cloud Scheduler          | El cliente no lo pidió, agrega un componente desplegable y costo recurrente sin aportar a la evaluación                                                                                                                                                                                                                                                                                      |
| Sin botón de sincronizar en la UI                                                                          | Botón visible para el usuario                    | Cada invocación tiene costo real; un control público es un vector de gasto no controlado                                                                                                                                                                                                                                                                                                     |
| Servir el dato vencido marcado                                                                             | Ocultarlo o devolver vacío                       | Una lista vacía se leería como ausencia de especialistas, que es peor que un dato viejo etiquetado                                                                                                                                                                                                                                                                                           |
| Escribir solo si Google respondió                                                                          | Borrar al vencer el TTL                          | Evita quedarse sin dato justo cuando el proveedor falla                                                                                                                                                                                                                                                                                                                                      |
| `zone` tomada de la keyword                                                                                | Derivarla del texto de la dirección              | Derivar es inferir, y el enunciado lo prohíbe                                                                                                                                                                                                                                                                                                                                                |
| Puertos e implementaciones separadas                                                                       | Llamar al SDK de Firestore desde el caso de uso  | Permite sustituir base de datos o proveedor sin tocar la lógica de negocio                                                                                                                                                                                                                                                                                                                   |
| Whitelist en código además de configuración en GCP                                                         | Solo configuración en la consola de GCP          | Deja el control versionado y auditable junto al resto del sistema                                                                                                                                                                                                                                                                                                                            |
| Upsert por `placeId`                                                                                       | Insertar siempre                                 | Hace la sincronización idempotente y evita duplicados                                                                                                                                                                                                                                                                                                                                        |
| Rutas y parámetros en inglés                                                                               | Rutas y parámetros en español según el enunciado | El enunciado deja libertad en el diseño de la API; mezclar idiomas en un mismo contrato es fuente de errores                                                                                                                                                                                                                                                                                 |
| Un lugar tiene una sola especialidad, la de la corrida más reciente (`specialtyConflicts` solo lo reporta) | Guardar un arreglo de especialidades por lugar   | Google no modela la especialidad como atributo del negocio, así que ningún dato de la fuente dice cuál es "la correcta" entre las que coincidieron; guardar varias sin ese criterio no resuelve el problema, solo lo traslada. El cambio además toca los índices compuestos y el filtro por especialidad de `GET /api/v1/places` para un beneficio marginal en un proyecto de cuatro semanas |

## Riesgos y mitigaciones

Se aplica el ciclo mapear, medir y manejar.

| Riesgo                                                                                  | Métrica                                                 | Mitigación                                                                                                              |
| :-------------------------------------------------------------------------------------- | :------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------- |
| Cobertura desigual entre zonas: Places API tiene menos registros en áreas rurales       | Registros por zona respecto al total                    | Documentar la cobertura por zona y no presentar la base como censo completo                                             |
| Sesgo de despliegue: el sistema se prueba con datos inventados y falla con datos reales | Diferencia entre resultados en emulador y en producción | Ejecutar la sincronización contra Places API real antes de entregar                                                     |
| Datos desactualizados servidos como vigentes                                            | Antigüedad de `collectedAt` por documento               | TTL explícito, marca `stale` y `collectedAt` visible en la respuesta                                                    |
| Fuga o abuso de la API key                                                              | Llamadas facturadas por día                             | Variables de entorno, key por integrante restringida por IP, cuota diaria y alertas de billing                          |
| Gasto no controlado por sincronizaciones repetidas                                      | Sincronizaciones por keyword y por día                  | Cooldown por keyword y zona, tope de 20 resultados por invocación                                                       |
| Exposición innecesaria de datos                                                         | Campos devueltos por endpoint                           | La respuesta incluye solo los campos que la UI utiliza                                                                  |
| Campos vacíos que se interpretan como error del sistema                                 | Porcentaje de registros sin `phoneNumber` o `website`   | Reportar la cobertura real de cada campo en la documentación, sin rellenarlos                                           |
| Falsos positivos: registros que no ejercen la especialidad bajo la que se guardaron     | No medida, requeriría clasificación manual              | Declarar la limitación y conservar `sourceKeyword` para que cada registro sea rastreable hasta la consulta que lo trajo |

## Postura ética

Sección requerida por el enunciado. Se irá ampliando conforme avance la implementación y aparezcan datos reales.

- **Términos de servicio de Google.** Las políticas de Places permiten almacenar el `place_id` de forma indefinida y restringen el resto del contenido. El proyecto guarda un subconjunto acotado de campos con TTL y retención máxima, como desviación consciente de alcance académico. En un escenario real se requeriría un acuerdo comercial. No se construye un producto que redistribuya los resultados de Google.
- **No inferir datos.** Ningún campo se completa, deduce ni enriquece con fuentes externas. La zona y la especialidad provienen de la keyword utilizada, no de una interpretación de la dirección, y `sourceKeyword` conserva la evidencia del origen. Los campos que Google no entrega se guardan vacíos y su cobertura se reporta.
- **El directorio es una referencia, no una validación médica.** No acredita competencia profesional ni vigencia de colegiado. Toda respuesta incluye `collectedAt` para que quien la consuma sepa de cuándo es el dato.
- **Transparencia del resultado.** La respuesta expone la marca `stale`, la fecha `collectedAt` y la paginación, de modo que la lista no se lea como exhaustiva ni como actual por defecto.
- **Minimización.** Solo se persisten los campos necesarios para localizar un especialista. Se descartaron coordenadas y calificación por no ser requeridos.
- **Datos de salud.** Aunque los registros provienen de fuentes públicas de negocios, el dominio es sanitario. No se almacena información de pacientes ni datos personales sensibles.
- **Cobertura desigual y qué mide realmente el conteo.** El sistema no cuenta médicos: cuenta negocios registrados en Google Maps cuyo nombre coincide con las keywords del catálogo. Un conteo bajo en una zona admite al menos tres explicaciones que el dato no permite distinguir entre sí: que haya pocos especialistas, que los haya pero no registren su consultorio en Google, o que atiendan dentro de hospitales y centros de salud públicos que no aparecen como registro independiente. Un negocio llega a Google Maps cuando alguien tuvo el interés comercial y la capacidad técnica de registrarlo, de modo que el conteo refleja en buena parte presencia digital y solo de forma indirecta oferta médica. Presentar estas cifras como medida de disponibilidad de atención induciría a decisiones equivocadas sobre dónde asignar recursos. La documentación reporta el conteo por zona acompañado siempre de esta advertencia.
- **Sesgo de nombre comercial.** Places API no modela la especialidad médica como atributo, por lo que la recolección depende de que el negocio la incluya en su nombre. Esto favorece de forma sistemática a clínicas y centros con presencia comercial establecida. La verificación empírica matizó una parte de esta limitación: recuperar la forma agentiva incorporó a profesionales que ejercen bajo su propio nombre, que la forma de disciplina no alcanzaba. Sigue quedando fuera quien no menciona su especialidad en el rótulo, y eso es estructural de la fuente y no corregible con más keywords.
- **Un lugar puede quedar bajo la especialidad equivocada.** Si el mismo negocio coincide con la búsqueda de más de una especialidad, la sincronización más reciente le gana la etiqueta a la anterior, porque `placeId` es la clave del documento. Un centro médico grande puede terminar catalogado bajo la última especialidad que se sincronizó y no bajo todas las que ofrece. `specialtyConflicts` en el resumen de `POST /api/v1/place-imports` deja esto visible en el momento en que ocurre, pero no lo corrige: el sistema no tiene forma de saber, con los datos que la fuente entrega, cuál de las especialidades coincidentes es «la» correcta.
- **Y puede no ser de ninguna de ellas.** Es un problema distinto del anterior y peor: no que dos especialidades se disputen un lugar, sino que el lugar no ejerza ninguna. La verificación de variantes mostró que las consultas devuelven establecimientos de otras disciplinas, hospitales generales e incluso un edificio de consultorios: `medico general` trajo dermatólogos y coloproctólogos, y `neurologo` trajo un centro de geriatría. El filtro por tipo acota el rubro pero no la disciplina. No se midió qué proporción de la base son falsos positivos, porque exigiría clasificar los registros a mano; declararlo es lo que corresponde. Por eso `sourceKeyword` se conserva en cada documento: permite rastrear de qué consulta salió cada registro y auditar la asignación en lugar de tener que confiar en ella.

## Referencias

- [Google Maps Platform, Places API](https://developers.google.com/maps/documentation/places/web-service/overview)
- [Políticas de la Places API](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Place IDs y su almacenamiento](https://developers.google.com/maps/documentation/places/web-service/place-id)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
- [Firestore](https://firebase.google.com/docs/firestore)
- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)
- [pnpm](https://pnpm.io/)
- [Clean Architecture, Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
