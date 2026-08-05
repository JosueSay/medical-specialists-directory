# Emulador de Firestore. Se usa solo con el perfil `emulator` de compose.
#   - Permite trabajar contra Firestore sin credenciales de GCP ni consumir cuota.
#   - Requiere Java, que es lo que ejecuta el emulador por debajo.
FROM node:22-alpine3.24

RUN apk upgrade --no-cache \
    && apk add --no-cache openjdk21-jre-headless \
    && npm install -g firebase-tools@15.25.1 \
    && npm cache clean --force

WORKDIR /app

# El emulador exporta datos al apagarse
RUN mkdir -p /app/data && chown -R node:node /app

USER node

# Descarga el JAR del emulador durante el build para que el primer arranque no dependa de la red ni deje el contenedor a medio inicializar
RUN firebase setup:emulators:firestore

ENV FIREBASE_PROJECT_ID=demo-msd

EXPOSE 8080 4001

# --project con prefijo demo- activa el modo sin proyecto real de Firebase
CMD ["sh", "-c", "firebase emulators:start --only firestore --project ${FIREBASE_PROJECT_ID} --import=/app/data --export-on-exit=/app/data"]
