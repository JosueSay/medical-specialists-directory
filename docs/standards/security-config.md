# Seguridad y configuración

Manejo de secretos, variables de entorno y validación de entradas. Forma parte de los [estándares del proyecto](README.md); los controles concretos de este sistema están en [design.md](../design.md).

## Secretos

- **Ningún secreto en el código fuente.** Ni claves, ni tokens, ni credenciales, ni siquiera de forma temporal "para probar".
- **Ningún secreto en el repositorio.** `.env` está ignorado; solo se versiona `.env.example` con marcadores.
- **Ningún secreto en logs ni en mensajes de error.** Un error de proveedor externo se registra sin incluir la clave usada.
- **Ningún secreto en el frontend.** Todo lo que llega al navegador es público, sin importar cómo se llame la variable.
- **Cada integrante usa su propia clave** de API en desarrollo. Compartir una concentra el riesgo y el gasto en una sola cuenta.

Si un secreto se expone, la única respuesta válida es **rotarlo**. Borrarlo del repositorio no lo saca del historial ni de donde ya se haya copiado.

## Variables de entorno

Toda configuración que cambie entre entornos vive en variables de entorno, nunca escrita en el código.

Reglas:

- `UPPER_SNAKE_CASE`, con prefijo que agrupe por dominio: `PLACES_`, `FIRESTORE_`, `IP_WHITELIST_`.
- `.env.example` es la fuente de verdad de qué variables existen. Agregar una variable implica agregarla ahí en el mismo cambio.
- Cada variable lleva un comentario que explica qué hace y qué valores acepta.
- Los valores por defecto de `.env.example` deben permitir arrancar el proyecto sin cuentas externas.
- La aplicación **valida al arrancar** que las variables requeridas existen. Es preferible fallar al inicio con un mensaje claro que fallar a mitad de una petición.
- Solo las variables con prefijo `VITE_` llegan al navegador. Nunca poner un secreto ahí.

## Validación de entradas

Toda entrada del exterior se valida **antes** de llegar a la lógica de negocio.

- Los parámetros se validan en la capa de interfaces, no dentro del caso de uso.
- Se valida tipo, rango y pertenencia a catálogo. Un `pageSize` fuera de rango responde `400`; una especialidad fuera del catálogo responde `422`.
- Los valores que llegan del usuario nunca se concatenan dentro de una consulta ni de una llamada externa sin validar.
- Se usan catálogos cerrados en lugar de texto libre cuando es posible: reduce superficie de ataque y acota el costo de las llamadas facturables.

## Control de acceso

- El control de acceso se aplica **antes** de cualquier controlador, en middleware, y rechaza sin ejecutar nada más.
- La lista de orígenes autorizados es configuración, no código: cambiarla no requiere volver a desplegar.
- Detrás de un proxy, la IP del cliente se resuelve con la cantidad de saltos declarada. Un valor incorrecto hace que se evalúe la IP del proxy y el control deje de servir.
- El límite de peticiones y el control de acceso resuelven cosas distintas: uno decide **quién** consume, el otro **cuánto** consume quien ya está autorizado.

## Respuestas de error

- Ningún mensaje revela nombres de colecciones, rutas internas, versiones de librerías ni trazas.
- Un error interno responde con un código genérico; el detalle va al log, no al cliente.
- Los mensajes no confirman ni niegan la existencia de recursos a quien no está autorizado a verlos.

## Costos como control de seguridad

En este proyecto, un endpoint que llama a un servicio facturable es una superficie de riesgo económico:

- El endpoint que consume la API externa **no se expone en la interfaz de usuario**.
- Todo endpoint con costo tiene un tope de resultados y un tiempo mínimo entre invocaciones.
- Las cuotas y alertas de presupuesto se configuran en la consola del proveedor **antes** de escribir código que consuma la API.

## Dependencias

- Se instala lo mínimo necesario. Cada dependencia es superficie de ataque y peso de despliegue.
- Las versiones quedan fijadas por el archivo de bloqueo, que sí se versiona.
- Antes de agregar una dependencia para una tarea pequeña, se evalúa si la biblioteca estándar ya lo resuelve.
