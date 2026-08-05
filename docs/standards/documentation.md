# Documentación

Cómo se documenta el código y cómo se escriben los archivos Markdown. Forma parte de los [estándares del proyecto](README.md).

## Principio

Se documenta el **por qué**, no el **qué**. El código ya dice qué hace; lo que no dice es por qué se eligió así ni qué alternativa se descartó.

```typescript
// Innecesario: repite lo que el codigo ya dice
// Incrementa el contador en uno
counter += 1;

// Util: explica una decision que no es evidente
// Se escribe solo si el proveedor respondio bien: un fallo nunca
// debe degradar los datos que ya estaban almacenados.
if (response.ok) await repository.upsertMany(places);
```

Un comentario que explica código confuso es una señal de que el código debe reescribirse, no de que falte comentario.

## Documentación de código

- Comentarios en **español**, código en inglés.
- Las funciones públicas de cada capa llevan una descripción breve de su propósito, sus parámetros no obvios y qué error puede lanzar.
- Las decisiones de diseño no evidentes se comentan en el punto donde se aplican, con la razón.
- Los valores de configuración se documentan donde se declaran, no donde se usan.
- Ningún comentario queda desactualizado: si el código cambia y el comentario ya no aplica, se actualiza o se borra en el mismo cambio.

## Cuándo actualizar la documentación

Un cambio requiere actualizar documentación cuando modifica **comportamiento observable**:

| Cambio | Actualizar |
| :--- | :--- |
| Contrato de un endpoint | `design.md` y la definición OpenAPI |
| Código de error nuevo | Catálogo en `design.md` y ambos diccionarios de traducción |
| Variable de entorno nueva | `.env.example` con su comentario |
| Decisión de arquitectura | `design.md`, en la tabla de decisiones |
| Comando o paso de instalación | `README.md` y la guía de entorno |

Un cambio interno que no altera comportamiento observable no requiere tocar documentación.

## Formato de archivos Markdown

- **Un solo `#` por archivo**, el título principal. El resto de niveles se desglosa con `##`, `###`.
- **Listas con `-`**, nunca con `*`.
- **Sin emojis.**
- Si el documento forma parte de algo más grande, se enlaza al documento completo al inicio.
- Los bloques de código declaran su lenguaje.
- Las tablas se usan para comparar o enumerar con atributos; no para texto corrido.

## Estructura de un documento

1. Título.
2. Un párrafo que explica qué contiene y a quién sirve, con enlaces al contexto mayor.
3. Contenido, de lo general a lo particular.
4. Referencias al final cuando hay fuentes externas.

## Diagramas

Los diagramas se escriben en Mermaid dentro del propio Markdown, no como imágenes. Así se versionan, se revisan en el historial y se corrigen sin herramientas externas.

Cada diagrama va acompañado de texto que explica qué muestra. Un diagrama sin explicación se interpreta de tantas formas como personas lo lean.

Las capturas de pantalla que sirven como evidencia (configuraciones de consola, por ejemplo) sí van como imágenes, en `docs/images/`, con nombre descriptivo en kebab-case.

## Documentación honesta

En este proyecto tiene peso propio: se documenta lo que el sistema **no** cubre con la misma claridad que lo que sí cubre.

- Los campos que la fuente no entrega se reportan vacíos, con su porcentaje real de cobertura.
- Las limitaciones de la estrategia de búsqueda se enuncian, no se omiten.
- Los números que el sistema produce se acompañan de qué miden realmente, para que nadie los lea como algo que no son.
