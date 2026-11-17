# Mapa de archivos

Qué hay en cada carpeta y qué hace cada archivo importante. La arquitectura se explica en
`docs/arquitectura.md`; aquí solo se ubica cada pieza. Lo marcado con ★ es lo más relevante para
la materia (base de datos).

## Raíz

| Archivo | Qué es |
|---|---|
| `package.json` | Monorepo con npm workspaces (`apps/*`, `db`) y los comandos `db:*`, `dev`, `test`, `lint`, `benchmark`, `prueba:*` |
| `docker-compose.prod.yml` | Despliegue completo con un comando: `db`, `migrador`, `api`, `web` (nginx en :8080) |
| `.dockerignore` | Deja fuera del contexto de build `node_modules`, `.env`, respaldos y docs |
| `docker-compose.yml` ★ | PostgreSQL 16 de desarrollo con SCRAM-SHA-256 y **archivado continuo de WAL** (volúmenes `pgdata`, `walarchivo`, `respaldos`) |
| `.env.example` | Variables necesarias (contraseñas de `postgres`, `banco_owner` y `app_login`, `JWT_SECRET`). El `.env` real no se versiona |
| `.nvmrc` | Versión de Node (22) |
| `.gitattributes` | Excluye del entregable (`git archive`) los archivos de desarrollo (`.claude/`, `skills-lock.json`, `PROMPT_INICIAL.md`) |
| `README.md` | Requisitos, cómo levantar, comandos y usuarios demo por rol |
| `CLAUDE.md` | Instrucciones del proyecto para el asistente de código (reglas, stack, flujo Git) |

## `db/` — base de datos ★

| Archivo | Qué hace |
|---|---|
| `migrate.ts` | Runner propio de migraciones: aplica cada `.sql` en su propia transacción, guarda checksum en `schema_migrations` y rechaza migraciones ya aplicadas que se editaron |
| `setup.ts` | `db:setup`: inicialización idempotente para despliegues (nunca borra datos) |
| `Dockerfile` | Imagen del migrador (corre `db:setup` y termina) |
| `reset.ts` | `db:reset`: crea roles y bases, migra, siembra y carga datos sintéticos en la base de desarrollo |
| `lib/bootstrap.ts` | Crea los roles globales (`banco_owner`, `app_login`, `rol_*`) y las bases con sus propiedades |
| `lib/config.ts` | Conexiones como superusuario (bootstrap) o como dueño (migraciones) |
| `migrations/001_esquema.sql` | Tablas, PK/FK/UK, CHECK de estados y dominios (por qué `varchar + CHECK` y no ENUM) |
| `migrations/002_catalogos.sql` | Tipos sanguíneos, componentes con vida útil, roles |
| `migrations/003_logica.sql` | Reglas de negocio: falla segura por tamizaje, fraccionamiento, máquina de estados, `sp_asignar_unidad` (`FOR UPDATE`), `sp_asignar_automatica` (FEFO, `SKIP LOCKED`), caducidad, bajas, entregas y el catálogo de SQLSTATE `BS001`–`BS016` |
| `migrations/004_seguridad.sql` | Roles de grupo, GRANT mínimos (incluso por columna), `app_login`, RLS de `solicitud` y `asignacion`, bitácora genérica e inmodificable |
| `migrations/005_indices_vistas.sql` | Índice parcial de disponibles, BRIN de bitácora, índices de FK, vistas, vista materializada del dashboard con refresco concurrente |
| `migrations/006_bitacora_usuario_bd.sql` | `usuario_bd` toma el rol del `SET ROLE` en lugar de `current_user` (que dentro de `SECURITY DEFINER` es el dueño) |
| `migrations/007_alerta_caducidad_por_componente.sql` | Umbral de "por caducar" por componente; renombra columna de vista con `ALTER VIEW … RENAME COLUMN` |
| `seeds/` | Hospitales y usuarios demo (hash argon2id precalculado) |
| `sintetico/generar.ts` / `generar.sql` | Datos de volumen: nombres faker `es_MX` coherentes con el sexo + `generate_series` para donaciones, pruebas, unidades, movimientos, solicitudes y asignaciones |

## `apps/api/` — NestJS

| Ruta | Qué hace |
|---|---|
| `Dockerfile` | Build multi-stage: deps → build → solo dependencias de producción → runtime como usuario `node` |
| `src/main.ts` | Arranque: prefijo `/api`, `ValidationPipe` (rechaza propiedades no declaradas), `PgErrorFilter`, CORS |
| `src/config.ts` | Variables de entorno |
| `src/db/contexto.ts` ★ | `ejecutarConContexto`: `BEGIN` → `SET LOCAL ROLE` (lista blanca) → `set_config('app.*', …, true)` → callback → `COMMIT`/`ROLLBACK` → `release()` |
| `src/db/db.service.ts` | Pool de `pg` como `app_login`, `withContext()`, manejo de conexiones perdidas |
| `src/auth/` | Login JWT con argon2id, `JwtGuard`, `RolesGuard` y decoradores `@Roles()`, `@Publico()`, `@Usuario()` |
| `src/common/pg-error.filter.ts` ★ | Traduce `RAISE EXCEPTION … USING ERRCODE = 'BSxxx'` y errores estándar a 404/409/422 con mensaje en español |
| `src/common/paginacion.ts` | DTO de paginación y forma `{ datos, total, pagina, tamano }` |
| `src/donantes/` · `laboratorio/` · `inventario/` · `solicitudes/` · `trazabilidad/` · `hospitales/` · `admin/` · `dashboard/` | Un módulo por dominio: controlador con SQL parametrizado (sin ORM) que llama vistas, funciones y procedimientos |
| `test/global-setup.js` | Reinicia `banco_test` una vez antes de la suite |
| `test/helpers/bd.ts` | Pools como `app_login`/dueño, usuarios demo, flujo de donación por roles, escritura de evidencias |
| `test/bd/concurrencia.spec.ts` ★ | 20 asignaciones simultáneas de la misma unidad → 1 éxito; UK como segunda barrera; FEFO con `SKIP LOCKED` |
| `test/bd/reglas.spec.ts` ★ | Rechazo de asignaciones inválidas (caducada, reactiva, pendiente, otro tipo o componente…) sin dejar rastro |
| `test/bd/seguridad.spec.ts` ★ | Privilegios por rol, RLS de hospital, bitácora inmodificable, identidad de la app en la bitácora |
| `test/e2e/flujos.spec.ts` | E2E con supertest: un flujo por rol de punta a punta |

## `apps/web/` — React + Vite

| Ruta | Qué hace |
|---|---|
| `Dockerfile` · `nginx.conf` | Build con Vite y nginx: SPA, proxy de `/api`, caché y cabeceras de seguridad |
| `src/main.tsx` · `App.tsx` | Proveedores (TanStack Query, router, sesión), un único `<Toaster>` y rutas protegidas por rol |
| `src/api/cliente.ts` | `fetch` a `/api` con JWT; convierte errores en `ErrorApi` con `codigo` (SQLSTATE) |
| `src/api/hooks.ts` | `useCatalogos`, `useMutacion` (toast de éxito/error y recarga de consultas afectadas) |
| `src/api/tipos.ts` | Tipos de las respuestas de la API |
| `src/auth/` | Sesión (token, `/auth/yo`), `RutaProtegida` |
| `src/layout/` | Layout responsivo y menú por rol (`navegacion.ts` replica los `@Roles()` de la API) |
| `src/pages/` | Una pantalla por sección: Dashboard, Donantes, Laboratorio, Inventario, Solicitudes, Trazabilidad, Hospitales, Usuarios, Bitácora, Login |
| `src/components/ui/` | Componentes base (Button, Input, Select, Dialogo con Base UI, Tabla, Paginación, Badge) y tokens de color |
| `src/components/dominio/` | Piezas del dominio: resumen de tamizaje, barra de avance de solicitud |
| `src/lib/` | Formatos es-MX y zona de México, notificaciones (Sonner), utilidades |
| `src/dev/` | Fixtures de peor caso para `break-ui` (`?datos=peor`), solo en desarrollo: no entran al build |
| `src/index.css` | Tokens de diseño (`@theme` de Tailwind v4) |

## `scripts/`

| Script | Qué hace |
|---|---|
| `benchmark-indices.ts` ★ | `EXPLAIN (ANALYZE, BUFFERS)` con y sin índices sobre ≥100 000 unidades → `docs/evidencias/benchmark.md` |
| `backup.sh` / `restore.sh` | `pg_dump -Fc` + roles / `pg_restore -j 4` cronometrados |
| `prueba-restauracion.sh` ★ | Respaldo → actividad → `DROP DATABASE` → restauración; mide RTO y RPO |
| `prueba-pitr.sh` ★ | `pg_basebackup` + WAL archivado → lotes con hora conocida → falla → recuperación con `recovery_target_time` en contenedor temporal |
| `evidencia-pruebas.sh` | Corre la suite y escribe `docs/evidencias/pruebas.md` |

## `docs/`

| Ruta | Qué es |
|---|---|
| `arquitectura.md` | Capas, módulos, modelo, lógica, flujo, concurrencia, seguridad, rendimiento, respaldo, calidad, despliegue y limitaciones |
| `archivos.md` | Este mapa |
| `diseno.md` | Guía visual (tokens, movimiento, librerías) |
| `guion-video.md` | Guion del video de demostración |
| `contexto/` | Insumos del curso: propuesta (TC15), modelo ER (TC16), requisitos del reporte |
| `evidencias/` | Resultados para el reporte: `pruebas.md`, `resultados-*.md`, `benchmark.md`, `restauracion.md`, `break-ui.md` y `capturas/` |

## `.claude/`

Comandos del flujo Git (`/feature`, `/cerrar-feature`, `/release`) y skills de diseño aprobadas.
No forma parte del entregable.
