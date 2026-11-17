# syntax=docker/dockerfile:1
# Migrador: corre `db:setup` (idempotente) y termina. Contexto: raíz del monorepo
#   docker build -f db/Dockerfile .
# Ejecuta TypeScript con tsx: el runner de migraciones es SQL puro + pg, sin ORM.
FROM node:22-alpine
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY db/package.json db/
RUN npm ci --workspace @banco/db --include-workspace-root
COPY db db
USER node
CMD ["npx", "tsx", "db/setup.ts"]
