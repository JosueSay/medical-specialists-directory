# Imagen del frontend. El contexto de build es la raiz del monorepo porque el
# paquete @msd/contracts es una dependencia de workspace.
FROM node:22-alpine3.24 AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# Dependencias
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/contracts/package.json ./packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Desarrollo: servidor de Vite con hot reload. El codigo se monta como volumen.
FROM deps AS development
ENV NODE_ENV=development
COPY packages/contracts ./packages/contracts
RUN pnpm run --filter @msd/contracts build
EXPOSE 5173
CMD ["pnpm", "run", "--filter", "@msd/frontend", "dev"]

# Build estatico

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts ./packages/contracts
COPY apps/frontend ./apps/frontend
# Las variables VITE_ se resuelven en tiempo de build: se inyectan como args
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_APP_ENV=production
ARG VITE_DEFAULT_LOCALE=es
ARG VITE_DEFAULT_THEME=system
ARG VITE_DEFAULT_PAGE_SIZE=10
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APP_ENV=$VITE_APP_ENV \
    VITE_DEFAULT_LOCALE=$VITE_DEFAULT_LOCALE \
    VITE_DEFAULT_THEME=$VITE_DEFAULT_THEME \
    VITE_DEFAULT_PAGE_SIZE=$VITE_DEFAULT_PAGE_SIZE
RUN pnpm run --filter @msd/contracts build \
    && pnpm run --filter @msd/frontend build

# Runtime de produccion: nginx sirviendo estaticos
FROM nginx:1.30-alpine3.24 AS production
RUN apk upgrade --no-cache
COPY apps/frontend/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
