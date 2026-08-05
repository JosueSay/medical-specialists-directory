# Contratos de API

Reglas para diseñar y modificar endpoints. Forma parte de los [estándares del proyecto](README.md); los contratos concretos de este sistema están en [design.md](../design.md).

## Principios

- Las rutas nombran **recursos** (sustantivos), no acciones. La acción la indica el método HTTP.
- Recursos en inglés, plural, kebab-case.
- Cuerpos de request y response en JSON con propiedades en camelCase.
- Cada request contiene toda la información necesaria: no hay estado de sesión.
- Ninguna respuesta expone nombres de colecciones, trazas internas ni credenciales.

```bash
Correcto                        Incorrecto
GET  /api/v1/places             GET  /api/v1/getPlaces
POST /api/v1/place-imports      POST /api/v1/importPlaces
```

## Estructura de rutas

```bash
/api/v{version}/{recurso}
```

- `api` es fijo, `v1` indica la versión mayor.
- Los identificadores van en el path, no como query param: `/api/v1/places/{placeId}`.
- El nombre del parámetro en la ruta coincide con el campo en el JSON.
- Sin extensiones en la URL.
- Un cambio que rompe compatibilidad implica versión nueva, no modificar `v1`.

## Métodos HTTP

| Método | Uso |
| :--- | :--- |
| `GET` | Obtener un recurso o una lista. Sin efectos secundarios |
| `POST` | Crear un recurso |
| `PUT` | Reemplazo completo |
| `PATCH` | Actualización parcial |
| `DELETE` | Eliminar. Idempotente |

Un `GET` nunca modifica estado. En este proyecto eso tiene una consecuencia concreta: `GET /api/v1/places` no puede disparar una llamada a Google, porque eso sería un efecto secundario con costo.

## Status codes

| Código | Cuándo |
| :--- | :--- |
| `200` | Operación exitosa con cuerpo |
| `201` | Recurso creado |
| `204` | Operación exitosa sin cuerpo |
| `400` | Request mal formado o parámetros inválidos |
| `401` | Falta autenticación |
| `403` | Origen o usuario sin permiso |
| `404` | Recurso inexistente |
| `409` | Conflicto de estado |
| `422` | Validación de negocio fallida |
| `429` | Demasiadas peticiones |
| `500` | Error no controlado |
| `503` | Servicio externo no disponible |

## Query params

| Propósito | Parámetro |
| :--- | :--- |
| Página actual | `page` |
| Tamaño de página | `pageSize` |
| Campo de orden | `sortBy` |
| Dirección de orden | `sortOrder` (`asc` / `desc`) |
| Búsqueda de texto libre | `q` |

Los filtros usan el nombre del campo: `?specialty=cardiology&zone=10`.

## Paginación

Obligatoria en cualquier endpoint que pueda devolver muchos registros. `pageSize` tiene un máximo declarado y un valor fuera de rango responde `400`.

Los endpoints `GET` devuelven **solo los campos que el cliente usa**, no el documento completo.

## Formato de respuesta

El formato es fijo. Todas las respuestas lo siguen, sin excepción.

Recurso individual:

```json
{
  "code": "place_import_created",
  "message": "Place import completed successfully",
  "data": { "importId": "imp_001", "itemsUpserted": 18 }
}
```

Lista paginada:

```json
{
  "code": "place_list",
  "message": "Resources list retrieved successfully",
  "data": [],
  "meta": {
    "pagination": { "page": 1, "pageSize": 10, "totalItems": 47, "totalPages": 5 }
  }
}
```

Error:

```json
{
  "code": "validation_error",
  "message": "Request validation failed",
  "errors": {
    "details": [
      { "field": "pageSize", "code": "page_size_out_of_range", "message": "pageSize must be between 1 and 50" }
    ]
  }
}
```

| Campo | Para quién | Regla |
| :--- | :--- | :--- |
| `code` | El frontend, como clave de traducción | Estable, en inglés, snake_case. Nunca se traduce |
| `message` | El desarrollador, en logs | Técnico. Nunca se muestra al usuario final |
| `data` | El cliente | Se omite si no hay nada que devolver |
| `meta.pagination` | El cliente | Solo en respuestas de lista |
| `errors.details` | El frontend | Opcional, solo cuando hay detalle por campo |

Los códigos y su traducción se rigen por [i18n.md](i18n.md).

## Documentación

Cada endpoint se documenta en OpenAPI, y el contrato publicado debe coincidir con la implementación. Un contrato que dice algo distinto a lo que hace el código es peor que no tenerlo.
