# Emulador de Firestore. Se usa solo con el perfil `emulator` de compose.
#   - Permite trabajar contra Firestore sin credenciales de GCP ni consumir cuota.
#   - Requiere Java, que es lo que ejecuta el emulador por debajo.
#
# La base se fija a una rama de Alpine con soporte vigente: una rama sin
# mantenimiento deja de recibir parches y arrastra vulnerabilidades que ninguna
# actualizacion de paquetes puede corregir.
FROM node:22-alpine3.24

# apk upgrade aplica los parches publicados despues de que se construyo la imagen
# base. Java 21 es la version LTS con soporte; el JRE es el componente que mas
# avisos aporta en el escaneo, por eso conviene mantenerlo al dia.
RUN apk upgrade --no-cache \
    && apk add --no-cache openjdk21-jre-headless \
    && npm install -g firebase-tools@15.25.1 \
    && npm cache clean --force

WORKDIR /app

# El emulador exporta datos al apagarse: el directorio debe pertenecer al
# usuario sin privilegios que ejecuta el proceso
RUN mkdir -p /app/data && chown -R node:node /app

USER node

# Descarga el JAR del emulador durante el build para que el primer arranque no
# dependa de la red ni deje el contenedor a medio inicializar
RUN firebase setup:emulators:firestore

ENV FIREBASE_PROJECT_ID=demo-msd

EXPOSE 8080 4001

# --project con prefijo demo- activa el modo sin proyecto real de Firebase
CMD ["sh", "-c", "firebase emulators:start --only firestore --project ${FIREBASE_PROJECT_ID} --import=/app/data --export-on-exit=/app/data"]
