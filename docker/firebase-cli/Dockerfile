# CLI de Firebase containerizado. Se usa con el perfil `tools` de compose.
#   - Evita que cada integrante instale Node, pnpm y firebase-tools en su maquina.
#   - Sirve para iniciar sesion, desplegar y correr el emulador completo.
#   - Requiere Java, que es lo que ejecuta los emuladores por debajo.
FROM node:22-alpine3.24

RUN apk upgrade --no-cache \
    && apk add --no-cache openjdk21-jre-headless \
    && npm install -g firebase-tools@15.25.1 \
    && npm cache clean --force

# pnpm se necesita dentro del contenedor porque los hooks predeploy compilan el
# workspace antes de subir la funcion
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

WORKDIR /app

COPY docker/firebase-cli/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Las credenciales de firebase-tools viven en $HOME/.config: montarlo como
# volumen es lo que permite iniciar sesion una sola vez
ENV HOME=/home/node
RUN mkdir -p /home/node/.config /home/node/.cache && chown -R node:node /home/node

USER node

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["--version"]
