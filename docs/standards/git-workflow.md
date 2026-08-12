# Flujo de trabajo con Git

Commits, ramas y versionado. Forma parte de los [estándares del proyecto](README.md).

## Trabajo directo sobre `main`

El equipo trabaja sobre `main`, **sin ramas por tarea ni Pull Requests**. Es una decisión deliberada por la restricción de cuatro semanas, y se aparta de la práctica habitual de ramas por funcionalidad con revisión previa.

Funciona porque el reparto separa los archivos: cada persona trabaja sobre capas distintas y el solapamiento real se concentra en pocos archivos compartidos.

Como no hay Pull Request que atrape errores, estas reglas lo sustituyen:

- **Commits pequeños y frecuentes.** Un commit que toca cuatro capas a la vez es un conflicto esperando ocurrir.
- **`git pull --rebase` antes de cada `push`.** Nadie sube sobre una copia desactualizada.
- **No se deja `main` roto.** Antes de subir, `pnpm run check` en verde y el cambio corriendo contra el entorno local.
- **Aviso al equipo antes de tocar archivos compartidos**: contratos, tipos comunes, configuración, `.env.example`.
- **Quien rompa `main` lo arregla o lo revierte de inmediato**, antes de seguir con su tarea. Un `main` roto bloquea a las otras tres personas.

Si el proyecto creciera más allá de estas cuatro semanas, lo primero a recuperar sería el flujo de ramas con revisión.

## Formato de commits

```bash
<tipo>[alcance opcional]: <descripcion breve>

[cuerpo opcional]
```

Descripción breve, en imperativo, **en español**, **sin punto final**.

| Tipo       | Cuándo usar                                    |
| :--------- | :--------------------------------------------- |
| `feat`     | Nueva funcionalidad                            |
| `fix`      | Corrección de un error existente               |
| `chore`    | Mantenimiento que no afecta producción         |
| `docs`     | Documentación, README, comentarios             |
| `style`    | Formato sin cambios de lógica                  |
| `refactor` | Cambio de estructura sin alterar funcionalidad |
| `test`     | Pruebas, fixtures o mocks                      |
| `perf`     | Optimización de rendimiento                    |
| `ci`       | Pipelines y automatizaciones                   |
| `build`    | Build, compilación o dependencias              |
| `revert`   | Revertir un commit anterior                    |

Alcances de este proyecto: `places`, `imports`, `whitelist`, `config`, `ui`, `docs`.

```bash
feat(imports): agrega paginacion con tope de 20 resultados
fix(whitelist): corrige lectura de IP detras del proxy
docs: actualiza estrategia de keywords
chore(config): agrega variables del emulador de functions
```

Incorrectos y por qué:

```bash
Actualiza cosas.                      # sin tipo, vago, con punto final
feat: Se agrego la paginacion.        # no imperativo, con punto final
fix: arregla bug y agrega endpoint    # dos cambios en un commit
```

El cuerpo se usa cuando el _por qué_ no es obvio desde la descripción. Explica la razón, no repite el _qué_.

## Versionado

Formato `v<major>.<minor>.<patch>`.

| Cambio                   | Incremento |
| :----------------------- | :--------- |
| Rompe compatibilidad     | major      |
| Funcionalidad compatible | minor      |
| Corrección               | patch      |

Un tag por entrega semanal, para dejar trazable qué existía en cada evaluación:

| Tag      | Corresponde a                                             |
| :------- | :-------------------------------------------------------- |
| `v0.1.0` | Semana 1: infraestructura, whitelist y despliegue inicial |
| `v0.2.0` | Semana 2: recolección operativa y datos reales            |
| `v0.3.0` | Semana 3: API paginada y UI desplegada                    |
| `v0.4.0` | Semana 4: entrega final                                   |

```bash
git tag -a v0.1.0 -m "Semana 1: infraestructura y whitelist"
git push origin v0.1.0
```

## Qué nunca entra al repositorio

- Archivos `.env` con valores reales. Solo `.env.example` con marcadores.
- Claves de API, credenciales o cuentas de servicio.
- Carpetas generadas: `node_modules`, `dist`, `build`, `coverage`.
- Configuración personal de editor o de herramientas individuales.

Si un secreto llega a subirse, no basta con borrarlo en un commit posterior: queda en el historial. Hay que **rotar la credencial** de inmediato.
