# Pruebas

Qué se prueba, cómo se organiza y qué se considera suficiente. Forma parte de los [estándares del proyecto](README.md).

## Qué se prueba, en orden de prioridad

1. **Casos de uso.** Es donde vive la lógica de negocio y donde un error cuesta más. Se prueban con dobles en lugar de infraestructura real.
2. **Políticas de dominio.** Reglas puras, fáciles de probar y con muchos casos límite.
3. **Validaciones de entrada.** Un parámetro fuera de rango debe responder lo que dice el contrato.
4. **Adaptadores.** Se prueba que traduzcan correctamente entre el formato externo y las entidades del dominio.

No se prueban: getters triviales, configuración estática ni bibliotecas de terceros.

## Organización

```bash
apps/backend/
  src/application/list-places-use-case.ts
  tests/application/list-places-use-case.test.ts
```

- Un archivo de prueba por unidad, con el mismo nombre más `.test`.
- La estructura de `tests/` refleja la de `src/`.
- Los datos de ejemplo compartidos van en `tests/fixtures/`.

## Estructura de una prueba

Tres bloques, en este orden: preparar, ejecutar, verificar.

```typescript
it('marca como stale un registro que supero el TTL', () => {
  const policy = new FreshnessPolicy(30);
  const place = buildPlace({ collectedAt: minutesAgo(45) });

  const result = policy.isStale(place, now);

  expect(result).toBe(true);
});
```

El nombre de la prueba describe **el comportamiento esperado**, en español y sin la palabra "test". Alguien que lee solo los nombres debería entender qué hace la unidad.

```bash
Correcto                                        Incorrecto
'devuelve 403 cuando la IP no esta en la lista' 'test whitelist'
'no escribe si el proveedor falla'              'caso 2'
```

## Dobles de prueba

- Se prueba contra los **puertos**, no contra las implementaciones. Un caso de uso recibe un repositorio falso en memoria y nunca toca Firestore.
- El proyecto ya trae implementaciones de memoria y de proveedor simulado seleccionables por configuración: se reutilizan en lugar de escribir dobles nuevos.
- No se hacen llamadas reales a servicios externos en las pruebas. Una prueba que consume la API facturable es una prueba que cuesta dinero cada vez que corre.

## Casos límite obligatorios

Para cada unidad, además del camino feliz:

- Entrada vacía o ausente.
- Valor en el borde del rango permitido, y justo fuera.
- El servicio externo falla o no responde.
- La operación se repite dos veces (verificar idempotencia donde aplique).

El caso "el proveedor externo falla" es el que más se olvida y el que más importa aquí: el sistema debe conservar lo que ya tenía en lugar de degradarlo.

## Pruebas de integración

Las reglas anteriores describen pruebas que no dependen de nada externo. Hay una excepción deliberada: **el adaptador de Firestore se prueba contra el emulador**, no con dobles.

La razón es que un doble de Firestore probaría el doble, no Firestore. Dos defectos llegaron a producción por esa vía: la purga filtraba por un campo que la entidad no tiene, y faltaba un índice compuesto. Ninguna prueba unitaria podía detectarlos porque todas usan el repositorio en memoria, y el único entorno donde el comportamiento difería era el único que nadie ejercitaba.

```bash
docker compose --profile emulator up mnemosyne        # en otra terminal
pnpm run --filter @msd/backend test:integration
```

Viven en `tests/integration/` y usan `vitest.integration.config.ts`, una configuración aparte. La separación importa: `pnpm test` debe poder ejecutarse en cualquier máquina sin levantar servicios, y mezclarlas haría que fallara en la de quien no tenga el emulador corriendo. En CI se ejecutan igualmente, envueltas en `firebase emulators:exec`.

Qué cubren y qué no:

| Se verifica                                                        | No se verifica                                   |
| :----------------------------------------------------------------- | :----------------------------------------------- |
| Que las consultas filtren por los campos que existen en la entidad | Que los índices compuestos estén declarados      |
| Que el `placeId` funcione como identificador y evite duplicados    | Latencia o comportamiento bajo volumen           |
| Que la escritura sea idempotente y conserve `createdAt`            | Las reglas de seguridad, que el SDK admin ignora |

**El emulador no exige índices compuestos.** Es su diferencia más importante con Firestore real y conviene tenerla presente: una consulta que aquí pasa puede fallar en producción con `FAILED_PRECONDITION`. Esa comprobación solo la da ejecutar contra la base real, cosa que se hace antes de cada entrega.

## Ejecución

```bash
pnpm run test          # unitarias, sin dependencias externas
pnpm run test:watch    # durante el desarrollo
pnpm run check         # formato, linter, tipos y pruebas unitarias

pnpm run --filter @msd/backend test:integration   # requiere el emulador
```

## Criterio de suficiencia

No hay un porcentaje de cobertura obligatorio: perseguir un número lleva a probar lo trivial y dejar sin probar lo difícil.

El criterio es otro: **si alguien cambia la lógica de negocio y las pruebas siguen pasando, las pruebas no sirven.** Toda regla que el sistema promete cumplir debe tener una prueba que falle si se rompe.
