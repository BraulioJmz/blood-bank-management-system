# syntax=docker/dockerfile:1
# API NestJS — build multi-stage. Contexto: raíz del monorepo
#   docker build -f apps/api/Dockerfile .
# Etapas: deps (todas las dependencias) → build (compila TS) → prod-deps (solo
# dependencias de producción de la API) → runtime (node + dist, usuario sin privilegios).

FROM node:22-alpine AS deps
WORKDIR /app
# Solo los manifiestos: esta capa se reutiliza mientras no cambien las dependencias.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY db/package.json db/
RUN npm ci --workspace @banco/api --include-workspace-root=false

FROM deps AS build
COPY apps/api apps/api
RUN npm run build --workspace @banco/api

FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY db/package.json db/
# argon2 trae binario precompilado para musl (Alpine): no hacen falta compiladores.
RUN npm ci --omit=dev --workspace @banco/api --include-workspace-root=false

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/salud >/dev/null || exit 1
CMD ["node", "dist/main"]
