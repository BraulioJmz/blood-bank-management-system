# syntax=docker/dockerfile:1
# Web React — build con Vite y sirve con nginx. Contexto: raíz del monorepo
#   docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY db/package.json db/
RUN npm ci --workspace @banco/web --include-workspace-root=false
COPY apps/web apps/web
# import.meta.env.DEV = false: los fixtures de break-ui (src/dev) quedan fuera del bundle.
RUN npm run build --workspace @banco/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
