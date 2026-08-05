# Estándares del proyecto

Reglas de trabajo que aplican a todo el código y la documentación de este repositorio. Son las convenciones acordadas por el equipo: no dependen de ninguna herramienta ni editor en particular, y cualquier integrante puede seguirlas con el entorno que prefiera.

El diseño técnico está en [design.md](../design.md) y el reparto de trabajo en [activities.md](../activities.md).

## Índice

| Documento                                | Cubre                                                            |
| :--------------------------------------- | :--------------------------------------------------------------- |
| [architecture.md](architecture.md)       | Capas, puertos y adaptadores, dónde va cada pieza de código      |
| [api-contracts.md](api-contracts.md)     | Rutas, métodos, status codes y formato de respuestas             |
| [i18n.md](i18n.md)                       | Códigos de error y diccionarios de traducción                    |
| [code-style.md](code-style.md)           | Estilo de código y nomenclatura de archivos, carpetas y símbolos |
| [git-workflow.md](git-workflow.md)       | Commits, flujo de trabajo y versionado                           |
| [security-config.md](security-config.md) | Secretos, variables de entorno y validación de entradas          |
| [testing.md](testing.md)                 | Qué se prueba, cómo se organiza y qué se considera suficiente    |
| [documentation.md](documentation.md)     | Documentación de código y formato de archivos Markdown           |

## Reglas que aplican siempre

Cinco reglas atraviesan todos los documentos. Si hay duda y no encuentras la respuesta, estas mandan.

- **La lógica de negocio no conoce la infraestructura.** Ningún caso de uso importa el SDK de Firestore ni habla directamente con Google. El linter lo verifica.
- **Ningún secreto entra al repositorio.** Ni claves, ni archivos `.env`, ni credenciales en logs o mensajes de error.
- **Ningún dato se infiere.** Los campos que la fuente no entrega se guardan vacíos y se reportan como tales. No se completan, deducen ni enriquecen.
- **El backend no escribe texto para el usuario final.** Devuelve un código; el frontend lo traduce.
- **Todo cambio de contrato se acuerda antes de implementarse** y se refleja en [design.md](../design.md).

## Verificación local

Antes de subir cambios:

```bash
pnpm run check
```

Ejecuta formato, linter, verificación de tipos y pruebas. Si falla, el cambio no sube.
