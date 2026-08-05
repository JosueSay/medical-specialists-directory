# Estilo de código y nomenclatura

Cómo se escribe y cómo se nombra. Forma parte de los [estándares del proyecto](README.md).

## Idioma

- **Código en inglés**: nombres de variables, funciones, clases, archivos, carpetas, ramas y campos de API.
- **Comentarios y documentación en español**.

Mezclar idiomas dentro de un mismo identificador (`listaDePlaces`, `getEspecialidad`) no se acepta.

## Nomenclatura de archivos y carpetas

| Elemento                 | Convención                         | Ejemplo                              |
| :----------------------- | :--------------------------------- | :----------------------------------- |
| Carpetas                 | kebab-case, plural cuando agrupan  | `controllers/`, `ports/`             |
| Archivos TypeScript      | camelCase                          | `listPlacesUseCase.ts`               |
| Componentes React        | PascalCase                         | `PlacesTable.tsx`                    |
| Archivos de prueba       | mismo nombre más `.test`           | `listPlacesUseCase.test.ts`          |
| Hojas de estilo          | kebab-case                         | `main-layout.css`                    |
| Documentos Markdown      | kebab-case                         | `development-setup.md`               |
| JSON de configuración    | camelCase                          | `appConfig.json`                     |
| Archivos de herramientas | el nombre que exija la herramienta | `eslint.config.js`, `vite.config.ts` |

Ningún nombre lleva espacios, acentos ni caracteres especiales.

El nombre del archivo describe lo que exporta. Un archivo llamado `utils.ts` o `helpers.ts` es señal de que no se decidió qué contiene; se parte en archivos con nombre propio.

## Nomenclatura de símbolos

| Elemento                    | Convención                    | Ejemplo                                       |
| :-------------------------- | :---------------------------- | :-------------------------------------------- |
| Clases e interfaces         | PascalCase                    | `FirestorePlacesRepository`, `PlacesProvider` |
| Funciones y métodos         | camelCase, empiezan con verbo | `findByZone`, `upsertMany`                    |
| Variables                   | camelCase                     | `pageSize`, `collectedAt`                     |
| Constantes de configuración | UPPER_SNAKE_CASE              | `PLACES_MAX_RESULTS`                          |
| Tipos y enums               | PascalCase                    | `PlaceFilters`, `Freshness`                   |
| Booleanos                   | prefijo `is`, `has`, `should` | `isStale`, `hasWebsite`                       |

Sufijos que indican rol, y deben usarse de forma consistente:

- `*UseCase` para casos de uso.
- `*Repository` y `*Provider` para puertos.
- `*Policy` para políticas de dominio.
- `*Controller` y `*Middleware` para la capa de interfaces.

## Formato

Lo aplica la herramienta, no la discusión:

```bash
pnpm run format
```

Configuración vigente: comillas simples, punto y coma, coma final, ancho de 100 caracteres, indentación de 2 espacios, saltos de línea LF. Está en `.prettierrc.json` y `.editorconfig`, y no se modifica por preferencia personal.

## Reglas de escritura

- **Funciones pequeñas y con un solo propósito.** Si necesitas la palabra "y" para describir lo que hace, son dos funciones.
- **Sin números ni cadenas mágicas.** Un valor que significa algo va a una constante nombrada o a configuración.
- **Comparación estricta siempre** (`===`). El linter lo exige.
- **`const` por defecto**, `let` solo cuando el valor cambia. Nunca `var`.
- **Salida temprana** en lugar de anidar condiciones. Un `if` dentro de otro dentro de otro se reescribe.
- **Sin código muerto ni comentado.** El historial de Git lo conserva; el archivo no tiene por qué.
- **Tipos explícitos en los límites**: parámetros y retornos de funciones públicas. Dentro de una función, la inferencia basta.
- **`any` prohibido** salvo en pruebas, donde el linter lo permite. Si no conoces el tipo, es `unknown` y se valida.

## Manejo de errores

- Los errores de negocio se representan con tipos propios del dominio, no con cadenas.
- La capa de interfaces traduce el error a un status code y un `code`; las capas internas no saben de HTTP.
- Nunca se captura un error para ignorarlo en silencio. Si se captura, se registra o se transforma.
- Ningún mensaje de error incluye credenciales, rutas internas ni contenido de configuración.

## Verificación

```bash
pnpm run check
```

Formato, linter, tipos y pruebas. Es la misma verificación que debe pasar antes de subir cualquier cambio.
