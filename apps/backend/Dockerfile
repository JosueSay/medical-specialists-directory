# Imagen del backend. El contexto de build es la raiz del monorepo porque el
# paquete @msd/contracts es una dependencia de workspace.


# Base comun: Node + pnpm
FROM node:22-alpine3.24 AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# Dependencias: se instalan a partir de los manifiestos para aprovechar la cache
# de capas; el codigo fuente cambia mucho mas seguido que las dependencias.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/contracts/package.json ./packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Desarrollo: hot reload con nodemon. El codigo se monta como volumen desde el
# host, por eso aqui solo quedan las dependencias y el contrato compilado.
FROM deps AS development
ENV NODE_ENV=development
COPY packages/contracts ./packages/contracts
RUN pnpm run --filter @msd/contracts build
EXPOSE 4000
CMD ["pnpm", "run", "--filter", "@msd/backend", "dev"]

# Build de produccion
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts ./packages/contracts
COPY apps/backend ./apps/backend
RUN pnpm run --filter @msd/contracts build \
    && pnpm run --filter @msd/backend build \
    && pnpm deploy --filter @msd/backend --prod --legacy /output

# Runtime de produccion: solo dependencias de produccion y codigo compilado,
# ejecutado por un usuario sin privilegios.
FROM node:22-alpine3.24 AS production
ENV NODE_ENV=production
# Aplica los parches publicados despues de la imagen base
RUN apk upgrade --no-cache
WORKDIR /app
COPY --from=build --chown=node:node /output ./
COPY --chown=node:node config ./config
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.BACKEND_PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
