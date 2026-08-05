# Enunciado del curso

Transcripción del enunciado entregado por el curso. Es la fuente contra la que se evalúa el proyecto. El diseño del equipo está en [design.md](design.md); cuando el diseño se aparta de este enunciado, la desviación se justifica de forma explícita en ese documento.

Universidad del Valle de Guatemala. CC3106 Responsible AI. Julio Mérida.

Proyecto 1: Directorio de Médicos Especialistas.

Cliente: Ministerio de Educación de Guatemala. Equipos de 4 personas. 4 semanas.

## Contexto

El Ministerio de Educación necesita un directorio de médicos especialistas en Ciudad de Guatemala: nombre, especialidad, dirección, teléfono y sitio web. El equipo construye el sistema que recolecta, almacena y expone esos datos.

## Qué construir

- Cloud Function en TypeScript que recibe una palabra clave y zona, consulta la Google Places API y guarda los resultados en Firestore. Límite: 20 resultados por invocación.
- API paginada (`GET /directorio`) con filtros por especialidad y zona. Parámetros: `page`, `pageSize` (máx. 50), `especialidad`, `zona`.
- IP whitelist como middleware: si la IP del request no está en la lista autorizada, retorna HTTP 403 sin ejecutar nada más.
- UI mínima para la demo: un campo de búsqueda y una tabla de resultados. Sin diseño elaborado.

## Stack

TypeScript, Firebase Functions v2, Firestore, Google Places API, Firebase Hosting para la UI. Desarrollo local con el emulador de Firebase; producción solo para pruebas finales y la demo.

## Estrategia de búsqueda

Los datos en Google Maps usan nomenclatura inconsistente. El equipo debe diseñar y documentar sus keywords antes de ejecutar cualquier búsqueda. Punto de partida:

- Combinar especialidad más sufijo: `cardiólogo zona 10 Guatemala`, `clínica pediátrica zona 1`.
- Usar `place_id` como clave del documento en Firestore. Evita duplicados y es el identificador estable de Google.
- Campos a guardar: nombre, especialidad, dirección, teléfono, sitio_web, zona, place_id, fecha_recoleccion, keyword_usado.
- El campo `sitio_web` puede estar vacío o apuntar a una clínica, no a una red social. Documentarlo honestamente.

## Costos y responsabilidad

Cada integrante es responsable del gasto generado en su cuenta. Antes de escribir una sola línea de código:

- Configurar alerta de billing en GCP al 50% y 90% del presupuesto. Screenshot como entregable de Semana 1.
- Establecer cuota máxima de llamadas por día en la consola de APIs.
- Usar el emulador local para el 90% del desarrollo. Cada deploy a producción tiene costo real.

La Places API tiene un crédito de 200 USD mensuales. A unos 0.017 USD por llamada, el margen es amplio si se trabaja con criterio.

## Seguridad

Mecanismo recomendado: IP whitelist en el middleware de la Cloud Function. Simple, suficiente para este alcance.

- La API key de Google Places va en variables de entorno, nunca en el código fuente.
- Restringir la key en la consola de GCP para que solo funcione desde las IPs del proyecto.
- Equipos que quieran implementar Cloud Armor en lugar del middleware pueden hacerlo como alternativa avanzada y documentar la diferencia. No es requerido para nota completa.

## Consideraciones éticas

- Los datos de Places API no pueden redistribuirse como producto independiente sin cumplir los ToS de Google. Este proyecto tiene alcance académico; en producción real se requiere acuerdo comercial.
- No agregar ni inferir datos que no vengan directamente de la API. Campos vacíos se documentan, no se rellenan.
- El directorio es una referencia, no una validación médica. Indicar la fecha de recolección en todos los archivos exportados.
- El equipo debe incluir una sección breve (Postura ética) en su documentación: qué decisiones tomaron para manejar los datos responsablemente.

## Entregables por semana

- Semana 1: Proyecto Firebase/GCP configurado, alertas de billing activas (screenshot), función `hello world` desplegada, IP whitelist funcionando.
- Semana 2: Función de recolección operativa, estrategia de keywords documentada, colección en Firestore con datos reales.
- Semana 3: API paginada funcional, UI de demo accesible vía Firebase Hosting.
- Semana 4: Documentación técnica (máx. 5 páginas), diagrama de arquitectura, sección ética, presentación de 20 minutos con demo en vivo.

## Evaluación

| Peso | Componente                                           |
| :--- | :--------------------------------------------------- |
| 20%  | Infraestructura y seguridad (Semana 1)               |
| 20%  | Calidad y cobertura de datos recolectados (Semana 2) |
| 20%  | API funcional y UI de demo (Semana 3)                |
| 25%  | Documentación y diagrama de arquitectura (Semana 4)  |
| 15%  | Presentación, demo en vivo y preguntas               |

Las preguntas sobre costos y configuración de cuentas son bienvenidas, especialmente en Semana 1.

## Desviaciones asumidas por el equipo

El enunciado deja libertad en el diseño de la API. Estas son las decisiones donde el equipo se aparta del texto literal y por qué. El detalle completo está en [design.md](design.md).

| Punto del enunciado                    | Decisión del equipo    | Razón                                                                                                            |
| :------------------------------------- | :--------------------- | :--------------------------------------------------------------------------------------------------------------- |
| `GET /directorio`                      | `GET /api/v1/places`   | Versionado explícito y nomenclatura de recurso en plural, conforme a convención REST                             |
| Parámetros `especialidad`, `zona`      | `specialty`, `zone`    | Todo el código y los contratos se mantienen en inglés; mezclar idiomas en el mismo contrato es fuente de errores |
| Campos en español en Firestore         | Campos en inglés       | Misma razón; el mapeo campo por campo está documentado en el modelo de datos                                     |
| Límite de 20 resultados por invocación | Se respeta sin cambios | Es un límite de costo impuesto por el curso                                                                      |
| `pageSize` máximo 50                   | Se respeta sin cambios | Es un límite explícito del contrato                                                                              |
