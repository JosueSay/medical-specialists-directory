# Credenciales locales

Carpeta para las credenciales que cada integrante usa en su máquina. **Nada de lo que se ponga aquí se versiona**, salvo este archivo y el `.gitkeep`.

Existe para que la configuración sea idéntica en las cuatro máquinas: la ruta del `.env` apunta siempre al mismo sitio y nadie tiene que escribir rutas absolutas propias de su equipo.

El recorrido para obtener cada credencial está en [docs/credentials-setup.md](../docs/credentials-setup.md).

## Qué va aquí

| Archivo                | Qué es                                         | Cuándo hace falta                                    |
| :--------------------- | :--------------------------------------------- | :--------------------------------------------------- |
| `service-account.json` | Clave de la cuenta de servicio `msd-local-dev` | Solo para trabajar contra Firestore real desde local |

El desarrollo diario no necesita nada de esto: corre con `PERSISTENCE_DRIVER=memory` o contra el emulador de Firestore, y ninguno de los dos pide credenciales.

## Cómo se referencia

En el `.env` de la raíz:

```bash
GOOGLE_APPLICATION_CREDENTIALS=../../keys/service-account.json
```

**El `../../` no es un error.** El SDK de Google resuelve esa ruta contra el directorio de trabajo del proceso, y el backend corre desde `apps/backend`, no desde la raíz del repositorio. Escribir `keys/service-account.json` haría que buscara en `apps/backend/keys/`, que no existe.

Si el arranque falla diciendo que no encuentra el archivo de credenciales, la vía segura es una ruta absoluta.

## Por qué no se versiona

`service-account.json` es una credencial de larga duración: quien tenga el archivo puede leer y escribir en la base de datos del proyecto, sin caducidad y sin segundo factor. No es una contraseña que se pueda cambiar rápido, es una llave.

La carpeta entera está ignorada en `.gitignore`, no solo un patrón de nombre. Ignorar por nombre falla en cuanto alguien guarda el archivo tal como lo descargó, con el nombre que le pone Google.

Si una credencial llega a subirse, no basta con borrarla en un commit posterior: **queda en el historial**. Hay que eliminar la clave desde la consola de Google Cloud y generar otra.
