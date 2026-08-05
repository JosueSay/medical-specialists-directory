# Arquitectura del backend

Cómo se organiza el código del servicio y dónde va cada pieza. Forma parte de los [estándares del proyecto](README.md); el diseño completo del sistema está en [design.md](../design.md).

## Regla de dependencia

Las dependencias apuntan siempre hacia adentro. El dominio no sabe que existe Firestore, ni Google Places, ni HTTP.

```bash
interfaces  ->  aplicacion  ->  dominio  <-  infraestructura
```

La infraestructura apunta hacia el dominio porque **implementa** sus interfaces, no porque el dominio la use.

## Qué va en cada capa

| Capa            | Carpeta              | Contiene                                               | Nunca contiene                         |
| :-------------- | :------------------- | :----------------------------------------------------- | :------------------------------------- |
| Interfaces      | `src/interfaces`     | Controladores HTTP, middlewares, validación de entrada | Reglas de negocio                      |
| Aplicación      | `src/application`    | Casos de uso, orquestación                             | Referencias a Firestore, HTTP o Google |
| Dominio         | `src/domain`         | Entidades, puertos, políticas de negocio               | Cualquier librería externa             |
| Infraestructura | `src/infrastructure` | Adaptadores de Firestore y Places API                  | Decisiones de negocio                  |

## Puertos y adaptadores

Un **puerto** es una interfaz declarada en el dominio. Un **adaptador** es una implementación concreta que vive en infraestructura.

```typescript
// src/domain/ports/places-repository.ts
export interface PlacesRepository {
  findBy(filters: PlaceFilters, page: number, pageSize: number): Promise<PagedPlaces>;
  upsertMany(places: Place[]): Promise<number>;
}
```

```typescript
// src/infrastructure/firestore/firestore-places-repository.ts
export class FirestorePlacesRepository implements PlacesRepository {
  // aqui si se importa el SDK de Firestore
}
```

El caso de uso recibe el puerto por constructor y nunca sabe cuál implementación le llegó:

```typescript
export class ListPlacesUseCase {
  constructor(
    private readonly repository: PlacesRepository,
    private readonly freshness: FreshnessPolicy,
  ) {}
}
```

Esto es lo que permite correr todo el sistema con `PERSISTENCE_DRIVER=memory` y `PLACES_PROVIDER_DRIVER=mock`, sin cuenta de Google ni Firestore. Si un caso de uso deja de funcionar al cambiar de driver, la separación se rompió en alguna parte.

## Reglas verificadas por el linter

Importar `firebase-admin` fuera de `src/infrastructure` produce un error de lint, no una observación en revisión de código. La regla vive en `eslint.config.js`.

Si necesitas hablar con Firestore desde un caso de uso, la respuesta no es desactivar la regla: es que falta un método en el puerto.

## Políticas de dominio

Una regla de negocio que se consulta desde varios lugares se modela como objeto propio del dominio, no se repite en cada caso de uso.

```typescript
// src/domain/policies/freshness-policy.ts
export class FreshnessPolicy {
  constructor(private readonly ttlMinutes: number) {}

  isStale(place: Place, now: Date): boolean {
    /* ... */
  }
}
```

El valor del TTL entra por configuración. Cambiarlo no toca ningún caso de uso.

## Dónde poner código nuevo

Preguntas en orden:

1. ¿Traduce HTTP a una llamada interna, o valida una entrada? Va en **interfaces**.
2. ¿Orquesta pasos, decide el orden de las cosas? Va en **aplicación**.
3. ¿Es una regla que sería verdad aunque cambiáramos de base de datos? Va en **dominio**.
4. ¿Sabe _cómo_ hablar con un sistema externo? Va en **infraestructura**.

Si una pieza parece encajar en dos, casi siempre está haciendo dos cosas y hay que partirla.
