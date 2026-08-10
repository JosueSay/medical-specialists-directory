# Credenciales y cuentas

Guía para obtener las credenciales que el sistema necesita para dejar de correr con datos simulados y conectarse a Google Maps Platform y a Firestore reales. Es el paso previo a cambiar `PLACES_PROVIDER_DRIVER=mock` por `google` y `PERSISTENCE_DRIVER=memory` por `firestore`.

El entorno de desarrollo está en [development-setup.md](development-setup.md), el diseño del sistema en [design.md](design.md) y las reglas de manejo de secretos en [standards/security-config.md](standards/security-config.md). Los comandos que acompañan a cada paso de esta guía, ya en secuencia, están en [runbook.md](runbook.md).

Esta guía no contiene ninguna credencial. Describe cómo obtenerlas; dónde se guardan lo define la sección [Dónde va cada credencial](#dónde-va-cada-credencial).

## Qué se necesita

| Credencial                        | Para qué                               | Dónde vive en desarrollo         | Dónde vive en despliegue                     |
| :-------------------------------- | :------------------------------------- | :------------------------------- | :------------------------------------------- |
| Cuenta de Google                  | Acceso a la consola de Google Cloud    | Navegador                        | Navegador                                    |
| Cuenta de facturación con crédito | Habilitar Places API y Cloud Functions | Consola de Google Cloud          | La misma                                     |
| Proyecto de Google Cloud          | Contenedor de todo lo demás            | Consola de Google Cloud          | La misma                                     |
| API key de Maps Platform          | Llamar a Places API                    | `GOOGLE_MAPS_API_KEY` en `.env`  | Secret Manager                               |
| Proyecto de Firebase              | Firestore y Hosting                    | `FIREBASE_PROJECT_ID` en `.env`  | Lo provee el runtime de la función           |
| Service account (JSON)            | Escribir en Firestore real desde local | `GOOGLE_APPLICATION_CREDENTIALS` | No se usa: la función tiene identidad propia |

Cada integrante hace este recorrido con **su propia cuenta y su propio proyecto**. No se comparte una key entre cuatro personas: una key compartida no permite saber quién generó el gasto y multiplica el riesgo sobre una sola cuenta ([design.md](design.md#seguridad)).

Todo el recorrido se hace una sola vez y toma alrededor de 40 minutos.

## Antes de empezar

Tres condiciones que evitan la mayoría de los problemas descritos al final de esta guía.

### Navegador

Usar **Chrome o Edge** para todo el proceso de alta de facturación. Brave bloquea por defecto scripts de terceros y cookies que el formulario de pago de Google necesita; el síntoma no es un mensaje claro sino un formulario que rechaza una tarjeta válida, se queda cargando o devuelve un error genérico. Ese comportamiento está verificado por el equipo: la misma tarjeta que falla en Brave se acepta en Edge sin cambiar nada más.

Firefox y Safari con protección de rastreo estricta pueden dar el mismo síntoma. Si el formulario falla, cambiar de navegador antes que cambiar de tarjeta.

### Una sola cuenta de Google a la vez

Con varias cuentas de Google abiertas en el mismo navegador, la consola agrega un parámetro `authuser` a la URL para saber cuál está operando. Cada pestaña puede quedar en una cuenta distinta sin que nada lo advierta, y el resultado es un proyecto creado en una cuenta, la facturación en otra y la key en una tercera: todo parece configurado y nada funciona junto.

Lo más simple es hacer el recorrido completo en una **ventana aparte con una sola sesión iniciada**, y verificar el avatar de la esquina superior derecha antes de cada paso.

### Cuenta de Google

La prueba gratuita de 300 USD **solo aplica a cuentas que nunca han sido cliente de pago de Google Cloud, Google Maps Platform ni Firebase**, y que no han usado antes la prueba gratuita.

Lo recomendable es **crear una cuenta de Google nueva y exclusiva para el proyecto**. Una cuenta personal antigua puede haber consumido la prueba hace años, haber tenido un proyecto de Firebase, o arrastrar un historial de facturación que la deja fuera. Además mantiene el proyecto académico separado del correo personal, que es buena práctica de todos modos.

- Crear cuenta: <https://accounts.google.com/signup>

## Paso 1: activar la prueba gratuita de 300 USD

Google Cloud ofrece 300 USD en créditos válidos por 90 días para cuentas nuevas. Ese crédito cubre de sobra el consumo previsto del proyecto.

1. Entrar a <https://console.cloud.google.com/freetrial> con la cuenta nueva.
2. Seleccionar **país** (Guatemala) y aceptar los términos. Continuar.
3. Elegir el tipo de cuenta: **Individual** (no _Business_, salvo que se tenga NIT de empresa a mano).
4. Completar nombre y dirección. La dirección debe coincidir con la registrada en el banco emisor de la tarjeta.
5. Agregar la **tarjeta de crédito o débito**. Debe ser una tarjeta válida internacionalmente; las tarjetas prepago y algunas virtuales son rechazadas.
6. Pulsar **Empezar mi prueba gratuita**.

### Sobre el cobro que aparece

Este es el punto que más confusión genera y conviene entenderlo antes de llegar ahí.

**No se debería pagar nada.** Al registrar la tarjeta, Google ejecuta una **autorización de pago pendiente**, no un cobro. Es un bloqueo temporal de un monto pequeño para verificar que la tarjeta existe y está activa. No se cobra, y el banco lo libera entre 1 y 14 días hábiles según la entidad. En el estado de cuenta aparece como pendiente, nunca como cargo consolidado.

Durante la prueba gratuita Google tampoco cobra automáticamente al terminar: si se agotan los 300 USD o pasan los 90 días, la cuenta de facturación **se cierra sola** y los servicios dejan de funcionar. Para que exista un cobro real hay que pasar manualmente a cuenta de pago.

Distinguir entonces dos situaciones:

| Lo que aparece                                          | Qué significa                                                                         | Qué hacer                                                  |
| :------------------------------------------------------ | :------------------------------------------------------------------------------------ | :--------------------------------------------------------- |
| Un monto pendiente pequeño en el estado de cuenta       | Autorización de verificación, normal y esperada                                       | Nada. Se libera solo                                       |
| El formulario rechaza la tarjeta sin explicación        | Casi siempre el navegador, no la tarjeta                                              | Repetir en Edge o Chrome sin extensiones                   |
| Google pide un pago real o no ofrece la prueba gratuita | La cuenta no es elegible: historial previo, cuenta antigua o cliente de pago anterior | Crear una cuenta de Google nueva y repetir desde el Paso 1 |
| El banco rechaza el cargo por seguridad                 | Bloqueo antifraude por comercio internacional                                         | Autorizar el comercio con el banco y reintentar            |

Si Google exige un pago por adelantado, la respuesta correcta **no** es pagarlo: es empezar con una cuenta limpia. Ese requisito aparece cuando la política de riesgo de Google no reconoce la cuenta como elegible para la prueba, típicamente por antigüedad o por un historial de facturación previo.

### No activar la cuenta completa

Durante y después del alta, la consola insiste con un botón de **Activar cuenta completa** o _Upgrade_. Es fácil pulsarlo creyendo que es un paso obligatorio del registro. No lo es, y conviene no hacerlo mientras dure el proyecto.

|                                                | Cuenta de prueba                                                     | Cuenta pagada                                          |
| :--------------------------------------------- | :------------------------------------------------------------------- | :----------------------------------------------------- |
| Al agotarse el crédito o cumplirse los 90 días | La facturación **se cierra sola** y los servicios dejan de responder | Sigue funcionando y **acumulando cargos** a la tarjeta |
| Protección ante un error de configuración      | Automática                                                           | Únicamente la que se haya configurado a mano           |

El crédito restante no se pierde al activar la cuenta completa: sigue compensando el consumo hasta que venza. Lo que desaparece es el corte automático, que es justamente la red que protege de un bucle mal escrito o una cuota mal puesta.

Para saber en cuál se está, la **descripción general de Facturación** lo indica junto al título: _Cuenta de prueba gratuita_ con días restantes, o _Cuenta pagada_. Al pulsar esa etiqueta, la consola detalla si hubo conversión y en qué fecha.

La activación no tiene vuelta atrás. Si ya ocurrió, no hay que rehacer nada, pero el presupuesto con alertas y las cuotas del Paso 5 dejan de ser una buena práctica y pasan a ser el único mecanismo de contención. El saldo restante se consulta en **Créditos**, dentro de la misma sección de Facturación.

## Paso 2: crear el proyecto

Un proyecto agrupa APIs, credenciales, cuotas y facturación. Conviene uno dedicado, no reutilizar uno existente.

1. Entrar a <https://console.cloud.google.com/projectcreate>.
2. Nombre del proyecto: `msd-<iniciales>`, por ejemplo `msd-jsg`. El identificador que Google genera debajo es el que se usará como `FIREBASE_PROJECT_ID`; anotarlo, porque el nombre visible y el identificador no siempre coinciden.
3. Dejar la organización en **Sin organización** si la cuenta es personal.
4. Crear y esperar a que la consola cambie al proyecto nuevo. Verificar el selector de proyecto en la barra superior antes de continuar: todos los pasos siguientes aplican al proyecto seleccionado, y configurar cuotas en el proyecto equivocado es un error silencioso y frecuente.

Confirmar que el proyecto quedó ligado a la cuenta de facturación en <https://console.cloud.google.com/billing/linkedaccount>. Sin facturación vinculada, las APIs de pago no se pueden habilitar.

## Paso 3: habilitar Places API

El proyecto usa la versión nueva de Places API, no la heredada. El backend llama a `https://places.googleapis.com/v1/places:searchText`, endpoint que solo existe en la nueva.

Menú de navegación, **APIs y servicios**, **Biblioteca**. Buscar `Places API` y **leer la descripción antes de pulsar Habilitar**, porque aparecen dos productos de nombre casi idéntico:

| Nombre en la consola | Descripción que la acompaña                             | ¿Es la del proyecto? | Servicio                        |
| :------------------- | :------------------------------------------------------ | :------------------- | :------------------------------ |
| Places API           | _Get detailed information about 100 million places_     | No, es la heredada   | `places-backend.googleapis.com` |
| **Places API (New)** | _Next generation of the Places API… 200 million places_ | **Sí**               | `places.googleapis.com`         |

El nombre no basta para decidir y el orden en que aparecen tampoco: la heredada suele listarse primero. **La descripción es lo que las distingue**: 100 millones de lugares es la vieja, 200 millones y «next generation» es la nueva. Como confirmación, el enlace directo <https://console.cloud.google.com/apis/library/places.googleapis.com> siempre lleva a la nueva, y si esa página muestra **Administrar** y **API habilitada** en vez de **Habilitar**, ya está hecho.

Habilitar la heredada por error no cuesta dinero, pero deja el proyecto sin funcionar: las llamadas del adaptador responden `403 SERVICE_DISABLED` aunque la key sea válida, y las páginas de cuotas de `places.googleapis.com` no cargan porque el servicio no está activo. La heredada puede quedarse habilitada sin consecuencias o inhabilitarse desde **APIs y servicios**, **APIs y servicios habilitados**.

Si la key ya existía antes de habilitar la nueva, hay que volver a sus **restricciones de API** y marcar ahí **Places API (New)**: la lista solo ofrece los servicios que estaban habilitados al momento de configurarla.

No hace falta habilitar Maps JavaScript API: el proyecto no dibuja mapas en el navegador, solo consulta el servicio web desde el backend.

## Paso 4: crear y restringir la API key

1. Menú de navegación, **APIs y servicios**, **Credenciales**.
2. **Crear credenciales** y elegir **Clave de API**.
3. Copiar la key. Es lo único que se copia; queda visible después en la misma pantalla si se pierde.
4. Pulsar **Editar clave de API** para restringirla de inmediato. Una key sin restricciones es responsabilidad financiera de quien la creó.

En la pantalla de edición:

| Campo                                  | Valor                                                            |
| :------------------------------------- | :--------------------------------------------------------------- |
| Nombre                                 | `msd-places-local`                                               |
| Restricciones de API                   | **Places API (New)**, y ninguna otra                             |
| Autenticar mediante cuenta de servicio | Desmarcado                                                       |
| Restricciones de aplicación            | **Direcciones IP**, con las dos IPs públicas propias (ver abajo) |

El nombre conviene que diga para qué es la key, porque más adelante hace falta una segunda para el despliegue (`msd-places-deploy`) y dos nombres parecidos se confunden al copiarlos. Se puede renombrar después.

Las otras opciones de restricción de aplicación no aplican al proyecto: **Sitios web** es para keys que viajan en el JavaScript del navegador, y aquí la key nunca llega al cliente; **apps para Android** y **para iOS** no tienen sentido porque no existe app móvil. La llamada sale de un backend, de modo que la restricción correcta es por dirección IP.

La casilla **Autenticar las llamadas a la API a través de una cuenta de servicio** se deja sin marcar. Existe para Vertex AI y las APIs de Gemini, que exigen ligar la key a una identidad; Places API no lo requiere y activarla solo añade una dependencia más que puede romper las llamadas.

La lista de restricciones de API **solo muestra los servicios ya habilitados en el proyecto**. Si ahí no aparece **Places API (New)**, falta el Paso 3.

Los cambios de restricción tardan hasta cinco minutos en propagarse. Una llamada que falla con `403` justo después de guardar puede ser solo eso.

### Obtener la IP pública

Es la IP de salida de la red, no la IP local del equipo, y cambia al cambiar de red.

```powershell
curl.exe -4 https://api.ipify.org
curl.exe -6 https://api64.ipify.org
```

En Linux o macOS, `curl -4 https://api.ipify.org` y `curl -6 https://api64.ipify.org`. Como página, <https://icanhazip.com> devuelve solo la dirección en texto plano; <https://ifconfig.me> también sirve, pero muestra una sola de las dos familias y en una tabla larga que confunde cuál es el dato.

**Se registran las dos direcciones, IPv4 e IPv6.** No son dos redes distintas: son dos sistemas de direccionamiento que conviven en la misma conexión, y el proveedor asigna ambas. Qué familia se usa en cada llamada lo decide el programa que la origina, no quien configura la key: un navegador moderno prefiere IPv6, mientras que el proceso de Node puede salir por IPv4 según la red y la resolución de nombres. Google compara la dirección de origen del paquete contra la lista de forma exacta, de modo que registrar solo la que devuelve el navegador produce un `403` desde el backend que resulta desconcertante, porque la misma key funciona al probarla desde el navegador.

**La IPv6 se registra como prefijo `/64`, no completa.** Windows, macOS y Linux generan los últimos 64 bits con extensiones de privacidad y los rotan cada uno o dos días; una dirección IPv6 completa deja de coincidir sola. Lo estable es el prefijo que asigna el proveedor, y el campo de Google acepta notación CIDR:

| Lo que devuelve la herramienta         | Lo que se registra en la key |
| :------------------------------------- | :--------------------------- |
| `200.119.176.70`                       | `200.119.176.70`             |
| `2800:98:161f:1377:e942:3297:25cb:ce7` | `2800:98:161f:1377::/64`     |

El prefijo son los cuatro primeros bloques de la IPv6, seguidos de `::/64`.

### La restricción por IP y la función desplegada

La restricción por IP funciona bien en desarrollo local, donde la IP de salida es la de la red desde la que se trabaja. **No funciona igual para la Cloud Function desplegada**: las funciones de Cloud Run salen a internet por un rango de IPs dinámico y compartido, no por una dirección fija que se pueda declarar en la key.

Dejarlo por escrito porque [design.md](design.md#seguridad) describe la key como restringida por IP y eso solo es cierto para el entorno local. Las opciones son:

| Opción                                                           | Costo                                           | Recomendación                                           |
| :--------------------------------------------------------------- | :---------------------------------------------- | :------------------------------------------------------ |
| Key separada para despliegue, restringida solo por API           | Ninguno                                         | **Adoptada.** Suficiente con secreto, cuota y whitelist |
| Conector de VPC más Cloud NAT para obtener una IP de salida fija | Cargo por hora del conector y de la IP estática | Fuera de alcance para un proyecto de curso              |

El proyecto usa entonces **dos keys**: la de este paso, restringida por IP para desarrollo, y otra para la función desplegada, restringida solo por API y guardada en Secret Manager. Esa segunda se crea en el [Paso 7](#paso-7-segunda-api-key-para-el-despliegue), cuando toque desplegar; ahora no hace falta.

## Paso 5: poner el techo de gasto

Estos dos controles son obligatorios y previos a la primera llamada real ([design.md](design.md#control-de-costos)). Son también entregable de la Semana 1.

### Cuota diaria de Places API

La cuota es lo único que **impide** el gasto. El presupuesto solo avisa.

Estando en la sección **Google Maps Platform**, con su menú lateral propio:

1. **Cuotas** en la barra lateral, entre _Métricas_ y _Claves y credenciales_.
2. Elegir **Places API (New)** en el desplegable de la parte superior.
3. Escribir `SearchText` en la caja de filtro. De las 21 cuotas del servicio, solo dos afectan a este proyecto, porque el adaptador llama exclusivamente a `places:searchText` (`apps/backend/src/infrastructure/providers/googlePlacesProvider.ts`).
4. Marcar la casilla de la cuota, pulsar **Edit** y fijar el valor nuevo.
5. Confirmar el aviso de reducción y pulsar **Enviar solicitud** en el panel lateral.

| Cuota                          | Valor de fábrica | Valor del proyecto |
| :----------------------------- | :--------------- | :----------------- |
| `SearchTextRequest per day`    | 75,000           | **200**            |
| `SearchTextRequest per minute` | 600              | **60**             |

Doscientas solicitudes diarias son cien sincronizaciones, holgado para probar y lejos de cualquier accidente costoso. La de por minuto cubre un escenario distinto y más peligroso: un bucle mal escrito que dispara cientos de llamadas en segundos, donde un tope diario llega tarde.

La consola advierte que se está reduciendo más del 10% de un límite. Es lo esperado. Las **reducciones se aplican solas**; solo los aumentos pasan por revisión de Google. Se pueden marcar varias cuotas y enviarlas en una sola solicitud.

Que la página no muestre Places API (New) en el desplegable es la señal habitual de que se habilitó la Places API heredada en lugar de la nueva.

### Cerrar las cuotas que el proyecto no usa

Recomendado, no obligatorio. Las otras 19 cuotas quedan abiertas de fábrica, y algunas son caras: `GetPlaceRequest` admite 125,000 llamadas diarias a Place Details, que en SKU Enterprise representa un gasto considerable. Como el proyecto no invoca ninguno de esos métodos, cualquier consumo ahí sería un error o un abuso.

Ponerlas en **0** convierte una filtración de la key en algo inofensivo: aunque alguien la obtenga, solo podría gastar dentro del tope de Text Search que ya está acotado.

Aplica a `AutocompletePlacesRequest`, `GetPhotoMediaRequest`, `GetPlaceRequest`, `SearchNearbyRequest`, `SearchMediaRequest` y `SearchReviewPostsRequest`. Si el proyecto llegara a necesitar alguno, el aviso es inmediato y la cuota se vuelve a subir.

### Las dos secciones de la consola

Es la confusión más frecuente al seguir instrucciones de menú, y conviene tenerla clara desde el principio: la consola ofrece **dos vistas distintas sobre lo mismo**, con menús que no coinciden.

| Sección                                | Cómo se reconoce                                                                    | Cuotas de Places API                                                                         |
| :------------------------------------- | :---------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| **Google Maps Platform**               | El encabezado dice _Google Maps Platform_ y el menú lateral lista Métricas y Cuotas | **Cuotas** en la barra lateral                                                               |
| **APIs y servicios**, la vista general | Menú con Biblioteca, Credenciales y APIs habilitadas                                | **APIs y servicios habilitados**, Places API (New), pestaña **Cuotas y límites del sistema** |

Ambas llegan al mismo lugar. La de Maps Platform es más directa para este proyecto y tiene **Claves y credenciales** a un clic.

La excepción es el presupuesto: la **Facturación** del menú lateral de Maps Platform está filtrada a ese producto y no ofrece presupuestos. Para eso hay que salir a la vista general con el menú de navegación de la barra superior, el que está junto al logotipo de Google Cloud.

### Alertas de presupuesto

1. Menú de navegación de la barra superior, **Facturación**, **Presupuestos y alertas**.
2. **Crear presupuesto**, alcance el proyecto del paso 2.
3. Monto: el presupuesto que el equipo declare para la cuenta.
4. Umbrales de alerta en **50%** y **90%** del monto, por correo.

Una alerta no detiene nada: llega cuando el gasto ya ocurrió. Sirve para enterarse, no para prevenir. La prevención es la cuota.

## Paso 6: Firebase y Firestore

Firebase se monta sobre el proyecto de Google Cloud que ya existe, no se crea aparte.

1. Entrar a <https://console.firebase.google.com/> y pulsar **Comenzar**.
2. En la pantalla del nombre, **no escribir uno nuevo**: usar el enlace inferior **¿Ya tienes un proyecto de Google Cloud? Agregar Firebase al proyecto de Google Cloud**.
3. Elegir el proyecto del Paso 2 en el selector. Antes de continuar, comprobar que la etiqueta gris de debajo muestra el **identificador** correcto, no uno recién generado.
4. Aceptar las condiciones y continuar. Si pregunta por Google Analytics, desactivarlo: el proyecto no lo usa y agrega consentimientos innecesarios.

Escribir un nombre libre en lugar de seleccionar el proyecto crea **un proyecto distinto**, con otro identificador, sin la API key, sin las cuotas y sin el presupuesto configurados en los pasos anteriores. Es el error más costoso de este paso porque no da ningún síntoma hasta mucho después.

El asistente advierte que **borrar el proyecto de Firebase borra también el de Google Cloud** y todos sus recursos. Es la misma entidad vista desde dos consolas, no dos proyectos hermanados.

### Plan Blaze

Firebase tiene dos planes, no tres: **Spark**, gratuito y sin tarjeta, y **Blaze**, de pago por uso. El proyecto necesita **Blaze**, porque Spark no permite desplegar Cloud Functions y la API vive como función de segunda generación (`apps/backend/src/functions.ts`). Con Spark, `firebase deploy --only functions` falla pidiendo el cambio de plan.

**Siguiendo el camino anterior, Blaze no se activa a mano: se hereda.** Firebase y Google Cloud comparten la cuenta de facturación, así que un proyecto que ya la tiene vinculada entra directamente en Blaze, y el asistente se limita a pedir una confirmación del plan. Solo hay que cambiarlo manualmente —desde el enlace del plan en la esquina inferior izquierda— cuando el proyecto se creó desde cero en Firebase, sin facturación previa.

Blaze no implica gasto por sí mismo: mantiene las mismas cuotas gratuitas mensuales que Spark y cobra solo lo que las excede. Con el crédito de la prueba gratuita activo, ese exceso se descuenta del crédito antes de tocar la tarjeta. Para el uso previsto, una función que se invoca en pruebas y demos, el consumo queda muy por debajo de los dos millones de invocaciones libres al mes.

### No confundir Blaze con las suscripciones de Maps Platform

Son dos pantallas distintas, de productos distintos, y la decisión correcta es opuesta en cada una. Confundirlas cuesta dinero real.

| Producto                 | Opciones que ofrece                    | La que corresponde | Cuota fija mensual                  |
| :----------------------- | :------------------------------------- | :----------------- | :---------------------------------- |
| **Google Maps Platform** | Starter, Essentials, Pro, Pago por uso | **Pago por uso**   | 100 a 1200 USD en las suscripciones |
| **Firebase**             | Spark, Blaze                           | **Blaze**          | Ninguna                             |

En ambos casos se elige pagar por consumo y no comprometer un monto mensual. Lo que despista es que suenan a lo mismo sin serlo: en Maps Platform el pago por uso **ya viene seleccionado** y lo único que hay que hacer es resistirse a pulsar los botones de suscripción, que sí cobran su cuota completa aunque no se use nada.

Las suscripciones de Maps Platform están pensadas para volumen comercial alto y sostenido: cobran su cuota completa aunque no se haga ninguna llamada. Para este proyecto, cuyo consumo cabe en las 1,000 llamadas gratuitas mensuales del SKU Enterprise, contratar la más barata significaría pagar 100 USD al mes por algo que cuesta cero.

### Crear la base de datos

1. En la consola de Firebase, **Compilación**, **Firestore Database**, **Crear base de datos**.
2. Modo: **producción**. Las reglas del repositorio (`firestore.rules`) se despliegan después y son las que mandan.
3. Ubicación: `us-central1`, la misma región donde se despliega la función (`apps/backend/src/functions.ts`). Una base en otra región agrega latencia en cada lectura y **la ubicación no se puede cambiar después**.

Las colecciones no se crean a mano: el backend escribe `places` e `importRuns` en su primera ejecución. La única excepción es el documento de la whitelist.

### El documento de whitelist

En despliegue la lista de IPs autorizadas no vive en el `.env` sino en Firestore, para poder cambiar de red sin volver a desplegar ([design.md](design.md#administración-de-la-whitelist)). Ese documento es el único que se crea a mano, y sin él la función responde `403` a todo.

En la consola de Firebase, **Firestore Database**, **Iniciar colección**:

| Campo     | Valor                      |
| :-------- | :------------------------- |
| Colección | `config`                   |
| Documento | `ipWhitelist`              |
| Campo     | `allowed`, de tipo _array_ |

Cada elemento del array es un mapa con `cidr` y `label`:

```json
{
  "allowed": [
    { "cidr": "203.0.113.10/32", "label": "casa" },
    { "cidr": "2800:0:0:0::/64", "label": "casa ipv6" }
  ]
}
```

Valen las mismas direcciones que se registraron en la API key, y con el mismo criterio: la IPv4 con máscara `/32` y la IPv6 como prefijo `/64`, porque el sufijo rota. Las entradas se cachean 60 segundos, así que un cambio en la consola aplica en menos de un minuto.

Una entrada mal formada no rompe el arranque: se descarta con un aviso en el log y las demás siguen valiendo. Si la fuente entera falla, el sistema **cierra el paso** en vez de abrirlo.

## Paso 7: segunda API key para el despliegue

La key del Paso 4 sirve para desarrollo, pero no para la función desplegada: Cloud Run sale a internet por un rango dinámico y la restricción por IP la bloquearía. Hace falta una segunda.

1. **APIs y servicios**, **Credenciales**, **Crear credenciales**, **Clave de API**.
2. Nombre: `msd-places-deploy`.
3. Restricciones de aplicación: **Ninguno**.
4. Restricciones de API: **Places API (New)**, y ninguna otra.

Esta key no lleva restricción de red, de modo que los controles que la protegen son otros: vive en Secret Manager y nunca en el repositorio, solo sirve contra Places API, y la cuota diaria acota cuánto podría gastar quien la obtuviera. Por eso importa que las cuotas del Paso 5 estén puestas antes de crearla.

## Paso 8: service account para Firestore real desde local

Este paso es **opcional** y solo aplica si se quiere trabajar contra Firestore real desde la máquina. El desarrollo diario corre con `PERSISTENCE_DRIVER=memory` o contra el emulador, y ninguno de los dos necesita credenciales.

1. Menú de navegación, **IAM y administración**, **Cuentas de servicio**.
2. **Crear cuenta de servicio**, nombre `msd-local-dev`.
3. Rol: **Cloud Datastore User** (`roles/datastore.user`). Es el rol mínimo que permite leer y escribir en Firestore sin conceder administración.
4. Terminar y abrir la cuenta creada. Pestaña **Claves**, **Agregar clave**, **Crear clave nueva**, formato **JSON**.
5. Guardar el archivo **fuera del repositorio**, por ejemplo en `~/.config/msd/service-account.json`.

El archivo descargado es una credencial de larga duración: quien lo tenga puede escribir en la base. No se versiona, no se comparte por chat y no se deja en la carpeta del proyecto aunque `.gitignore` lo cubra.

## Qué es secreto y qué no

No todo lo que se obtiene en este recorrido es una credencial. Confundirlo lleva a los dos errores opuestos: tratar como público algo que permite gastar dinero, o esconder un identificador que de todas formas viaja en la URL de la aplicación.

| Dato                                      | ¿Secreto? | Razón                                                                      |
| :---------------------------------------- | :-------- | :------------------------------------------------------------------------- |
| `GOOGLE_MAPS_API_KEY`                     | **Sí**    | Permite consumir Places API con cargo a la cuenta de quien la creó         |
| Service account en JSON                   | **Sí**    | Autoriza a leer y escribir en Firestore                                    |
| `FIREBASE_PROJECT_ID`                     | No        | Público por diseño: aparece en la URL de la app y en el bundle del cliente |
| Identificador de la cuenta de facturación | No        | Identifica, no autoriza                                                    |
| IPs públicas del equipo                   | No        | Aunque revelan la ubicación aproximada de quien trabaja                    |

El identificador del proyecto no protege nada: lo que controla el acceso son las reglas de Firestore, la whitelist de IPs y las restricciones de la key. Aun así, tampoco hay motivo para publicarlo de más en issues, capturas o mensajes: no es un secreto, pero divulgarlo le ahorra trabajo a quien quiera sondear el proyecto.

Antes de commitear una captura a `docs/images/`, revisar que no muestre el valor de una key ni de una versión de secreto, ni siquiera parcialmente. Las pantallas de credenciales de la consola se recortan antes de esa columna.

## Dónde va cada credencial

Con todo lo anterior obtenido, así se conecta al proyecto.

### Desarrollo local

En el archivo `.env` de la raíz, que nunca se versiona:

```bash
PERSISTENCE_DRIVER=firestore
PLACES_PROVIDER_DRIVER=google

GOOGLE_MAPS_API_KEY=<la key del paso 4, la restringida por IP>
FIREBASE_PROJECT_ID=<el identificador del proyecto del paso 2>

# Solo si se apunta a Firestore real; vacio significa Firestore real
FIRESTORE_EMULATOR_HOST=
GOOGLE_APPLICATION_CREDENTIALS=/ruta/absoluta/al/service-account.json
```

Para volver al modo sin costo basta con devolver `PERSISTENCE_DRIVER` a `memory` y `PLACES_PROVIDER_DRIVER` a `mock`. Es la ventaja de que los adaptadores se elijan por configuración: probar sin gastar no requiere tocar código.

### Despliegue

La función desplegada no lee `.env` para los secretos. La key se guarda en Secret Manager, que es de donde `functions.ts` la declara (`secrets: ['GOOGLE_MAPS_API_KEY']`):

```bash
docker compose --profile tools run --rm hermes functions:secrets:set GOOGLE_MAPS_API_KEY
```

El valor que se pasa aquí es el de la **key del Paso 7**, la del despliegue, no la de desarrollo. El comando lo pide por entrada estándar y crea la versión del secreto; la primera ejecución habilita Secret Manager en el proyecto si aún no lo estaba, sin necesidad de activarlo a mano en la consola.

El resto de la configuración de la función vive en `apps/backend/functions.env`, que **sí se versiona** porque no contiene secretos. `FIREBASE_PROJECT_ID` no aparece ahí: lo provee el propio runtime.

Verificar y rotar:

```bash
docker compose --profile tools run --rm hermes functions:secrets:access GOOGLE_MAPS_API_KEY
docker compose --profile tools run --rm hermes functions:secrets:destroy GOOGLE_MAPS_API_KEY
```

Una key rotada exige volver a desplegar la función para que tome la versión nueva del secreto.

## Verificación

Comprobar cada credencial por separado, de la más barata a la más cara, para que un fallo diga con precisión qué falta.

Una sola llamada directa a Places API comprueba a la vez que la key es válida, que el servicio está habilitado, que las restricciones de IP y de API coinciden y que la cuota no bloquea. Los campos que solicita pertenecen al SKU Pro, con 5,000 llamadas gratuitas al mes, de modo que la prueba no consume el presupuesto de Enterprise.

En PowerShell, el cuerpo de la petición va en un archivo. Pasar el JSON en línea a `curl.exe` falla con `INVALID_ARGUMENT`, porque PowerShell reescribe las comillas antes de entregárselas al ejecutable nativo:

```powershell
$bodyFile = Join-Path $env:TEMP "places-body.json"
'{"textQuery":"cardiologia zona 10 Guatemala","languageCode":"es","regionCode":"GT","pageSize":1}' | Out-File -Encoding ascii -NoNewline $bodyFile
$key = ((Get-Content .env | Where-Object { $_ -match '^GOOGLE_MAPS_API_KEY=' }) -replace '^GOOGLE_MAPS_API_KEY=','').Trim()
curl.exe -s -w "`nHTTP %{http_code}`n" -X POST "https://places.googleapis.com/v1/places:searchText" -H "Content-Type: application/json" -H "X-Goog-Api-Key: $key" -H "X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress" -d "@$bodyFile"
```

En Linux, macOS o Git Bash, con la variable ya exportada:

```bash
curl -X POST 'https://places.googleapis.com/v1/places:searchText' \
  -H 'Content-Type: application/json' \
  -H "X-Goog-Api-Key: $GOOGLE_MAPS_API_KEY" \
  -H 'X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress' \
  -d '{"textQuery":"cardiologia zona 10 Guatemala","languageCode":"es","regionCode":"GT","pageSize":1}'
```

Una respuesta correcta devuelve un establecimiento real de la zona consultada, con su identificador, nombre y dirección.

Las otras dos comprobaciones, cuando toque Firebase:

```bash
docker compose --profile tools run --rm hermes projects:list   # la sesion apunta al proyecto correcto
pnpm dev:backend                                                # el backend arranca contra infraestructura real
```

Qué significa cada respuesta de la llamada directa:

| Respuesta                                                 | Causa                                                                                  |
| :-------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| `200` con un lugar                                        | Todo correcto                                                                          |
| `403` con `SERVICE_DISABLED`                              | Places API (New) no está habilitada en el proyecto de la key                           |
| `403` con `API_KEY_HTTP_REFERRER_BLOCKED` o mención de IP | La IP actual no coincide con la restricción de la key                                  |
| `400` con `API_KEY_INVALID`                               | La key está mal copiada o pertenece a otro proyecto                                    |
| `429`                                                     | Se alcanzó la cuota diaria configurada en el paso 5                                    |
| `400` con `INVALID_ARGUMENT` y `Unexpected token`         | El JSON llegó deformado, no es un problema de credenciales: pasar el cuerpo en archivo |

## Lo que esto cuesta de verdad

Conviene tenerlo claro antes de la primera llamada, porque **las cifras del enunciado del curso están desactualizadas**.

El crédito recurrente de 200 USD mensuales de Google Maps Platform **dejó de existir el 1 de marzo de 2025**. Lo sustituyó un umbral gratuito mensual por SKU, que no se acumula entre servicios.

| Dato                                           | Valor real                        |
| :--------------------------------------------- | :-------------------------------- |
| SKU que aplica al proyecto                     | Text Search Enterprise            |
| Precio                                         | 35.00 USD por cada 1,000 llamadas |
| Llamadas gratuitas al mes en ese SKU           | 1,000                             |
| Costo por llamada facturable                   | 0.035 USD                         |
| Llamadas por sincronización                    | 2                                 |
| Costo por sincronización facturable            | 0.07 USD                          |
| Sincronizaciones cubiertas por el umbral libre | 500 al mes                        |

El proyecto cae en Enterprise porque el enunciado exige teléfono y sitio web, y esos campos disparan ese SKU ([design.md](design.md#presupuesto-de-la-estrategia)). La referencia de 0.017 USD por llamada del enunciado corresponde a un SKU inferior: el costo real es aproximadamente el doble.

El efecto conjunto de las 1,000 llamadas libres mensuales y los 300 USD de la prueba gratuita es que el consumo previsto del proyecto, incluida una corrida completa del catálogo, queda cubierto sin gasto de bolsillo. Eso no elimina la cuota ni las alertas: existen para el caso en que algo se dispare por error, que es exactamente cuando nadie está mirando.

## Problemas frecuentes

| Síntoma                                                      | Causa habitual                                                               | Solución                                                                |
| :----------------------------------------------------------- | :--------------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| El formulario de pago rechaza una tarjeta válida             | Brave o bloqueadores de rastreo interfiriendo con el formulario              | Repetir en Edge o Chrome, sin extensiones y sin ventana privada         |
| No aparece la oferta de prueba gratuita                      | La cuenta ya fue cliente de pago de Cloud, Maps o Firebase                   | Crear una cuenta de Google nueva y repetir desde el Paso 1              |
| Google pide un pago por adelantado                           | La cuenta no es elegible según su política de riesgo                         | No pagar. Cuenta nueva                                                  |
| Cargo pendiente en el estado de cuenta                       | Autorización de verificación de la tarjeta                                   | Ninguna. Se libera entre 1 y 14 días hábiles                            |
| `403 SERVICE_DISABLED` con una key nueva                     | Se habilitó la Places API heredada, la de _100 million places_               | Habilitar **Places API (New)** y añadirla a las restricciones de la key |
| La página de cuotas de Places API no carga                   | El servicio `places.googleapis.com` no está habilitado en el proyecto        | Habilitar **Places API (New)**                                          |
| Todo parece configurado pero nada se encuentra               | El proyecto, la facturación y la key quedaron en cuentas de Google distintas | Revisar el avatar y el `authuser` de la URL; rehacer en una sola cuenta |
| La key funciona desde casa pero no desde la universidad      | La restricción por IP está fijada a la IP anterior                           | Actualizar la restricción con la IP de la red actual                    |
| `403` intermitente sin haber cambiado nada                   | Se registró la IPv6 completa y su sufijo de privacidad rotó                  | Registrar el prefijo `/64` en vez de la dirección completa              |
| `403` desde el backend aunque el navegador sí alcanza la API | Solo se registró una de las dos familias de IP                               | Registrar IPv4 e IPv6 en la misma key                                   |
| La función desplegada devuelve `403` de Google               | La key del despliegue está restringida por IP                                | Usar una key restringida solo por API para el despliegue                |
| No se puede desplegar la función                             | El proyecto sigue en plan Spark                                              | Cambiar a Blaze en la consola de Firebase                               |
| Cambios de restricción que no toman efecto                   | Propagación                                                                  | Esperar cinco minutos antes de diagnosticar otra cosa                   |
| `firebase use` no encuentra el proyecto                      | La sesión del contenedor es de otra cuenta de Google                         | `hermes login --reauth` con la cuenta correcta                          |

## Evidencia para la entrega

Las capturas se guardan en `docs/images/` y se enlazan desde [design.md](design.md#evidencia-de-configuración).

| Evidencia                                           | Archivo                          | De qué paso         |
| :-------------------------------------------------- | :------------------------------- | :------------------ |
| Presupuesto con sus tres umbrales y el proyecto     | `images/billing-budget.png`      | Paso 5              |
| Crédito de la prueba gratuita, saldo y vencimiento  | `images/billing-credits.png`     | Paso 1              |
| Cuotas de Places API, por día y por minuto          | `images/places-api-quota.png`    | Paso 5              |
| Restricción de la API key                           | `images/api-key-restriction.png` | Paso 4              |
| Whitelist dejando pasar una IP autorizada           | `images/ip-whitelist-200.png`    | Fuera de la consola |
| Whitelist rechazando una IP no autorizada con `403` | `images/ip-whitelist-403.png`    | Fuera de la consola |
| Función `hello world` desplegada y respondiendo     | `images/hello-world-deploy.png`  | Despliegue          |

Para el presupuesto, la captura útil no es la del formulario sino la de la **lista de presupuestos**: en una sola imagen muestra el nombre, el proyecto al que se aplica, los tres umbrales, el consumo acumulado y si se descontaron créditos. Las alertas del 50% y del 90% son dos umbrales de un mismo presupuesto, no dos presupuestos, así que esa imagen acredita ambas.

Ninguna captura debe mostrar el valor de una API key, ni siquiera parcialmente. La pantalla de restricciones se recorta antes del campo de la clave.

## Lista de comprobación

Qué hace falta para cada cosa, para no dejar a medias lo que bloquea al resto.

### Para desarrollar contra Places API real

| Paso                                           | Sección |
| :--------------------------------------------- | :------ |
| Cuenta, facturación y crédito                  | Paso 1  |
| Proyecto                                       | Paso 2  |
| Places API (New) habilitada                    | Paso 3  |
| Key restringida por IP y por API, en el `.env` | Paso 4  |
| Cuotas por día y por minuto                    | Paso 5  |
| Presupuesto con alertas                        | Paso 5  |

Con esto, `PLACES_PROVIDER_DRIVER=google` y `PERSISTENCE_DRIVER=memory` bastan para probar la sincronización real sin Firestore. Es el corte natural: valida el adaptador de Google sin depender de nada más.

### Para desarrollar contra Firestore real

| Paso                           | Sección |
| :----------------------------- | :------ |
| Todo lo anterior               |         |
| Firebase y plan Blaze          | Paso 6  |
| Base de datos en `us-central1` | Paso 6  |
| Service account en JSON        | Paso 8  |

### Para desplegar

| Paso                                        | Sección    |
| :------------------------------------------ | :--------- |
| Todo lo anterior                            |            |
| Documento `config/ipWhitelist` en Firestore | Paso 6     |
| Segunda key sin restricción de IP           | Paso 7     |
| Key del despliegue en Secret Manager        | Despliegue |

El service account del Paso 8 no interviene en el despliegue: la función se autentica con la identidad que Firebase le asigna.

## Referencias

- [Preguntas frecuentes de la prueba gratuita de Google Cloud](https://cloud.google.com/signup-faqs)
- [Precios de Google Maps Platform](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Cambios de facturación de marzo de 2025](https://developers.google.com/maps/billing-and-pricing/march-2025)
- [Buenas prácticas de seguridad de Google Maps Platform](https://developers.google.com/maps/api-security-best-practices)
- [Uso y facturación de Places API](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- [Políticas de Places API](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Precios de Firebase](https://firebase.google.com/pricing)
