# Prompt inicial para Claude Code

Pega esto en la primera sesión, dentro de la carpeta del repo (con `CLAUDE.md`, `docs/contexto/` y `.claude/commands/` ya copiados, y los PDFs TC15/TC16 en `docs/contexto/`). Usa **plan mode** (Shift+Tab) para este primer mensaje.

---

Vamos a desarrollar el sistema de administración del banco de sangre descrito en `CLAUDE.md` (NestJS + React/Vite + PostgreSQL con `pg`, sin ORM). Lee primero `CLAUDE.md` y todo `docs/contexto/`. La entrega es el 18 de noviembre: prioriza que funcione de punta a punta. Además quiero aprender PostgreSQL con este proyecto, así que cuando metas algo de BD no trivial explícame brevemente el porqué.

En este primer paso, en plan mode:

1. Confirma en pocas líneas que entendiste el dominio, qué reglas van en la BD, el patrón `withContext` por petición y el flujo Git.
2. Propón el plan de features en orden, cada una con su rama y su lista de commits atómicos (Conventional Commits en español). Toma este orden como base y ajústalo si ves dependencias que no consideré:
   - `chore` inicial en `main`: monorepo npm workspaces, README, .gitignore, .env.example, docker-compose (Postgres 16), scaffold de `apps/api` (Nest) y `apps/web` (Vite React TS + Tailwind), scripts raíz. Luego crea `develop`.
   - `feature/db-esquema`: runner `db/migrate.ts`, tablas, PK/FK/UK, CHECKs, catálogos.
   - `feature/db-logica`: fraccionamiento, trigger de liberación/descartado por tamizaje, `sp_asignar_unidad`, `sp_asignar_automatica` (FEFO + SKIP LOCKED), `fn_marcar_caducadas`, SQLSTATE propios.
   - `feature/db-seguridad`: roles de grupo, `app_login`, GRANTs mínimos, RLS de hospital, trigger genérico de bitácora, bitácora inmodificable.
   - `feature/db-indices-vistas`: índices y vistas.
   - `feature/datos-sinteticos`: `generate_series` + faker, volumen parametrizable, usuarios demo por rol.
   - `feature/api-base`: DbModule con `withContext`, auth JWT + argon2, guard `@Roles()`, filtro de errores de PostgreSQL.
   - `feature/api-dominio`: módulos donantes, donaciones, laboratorio, inventario, hospitales, solicitudes (asignación manual/automática), trazabilidad, admin (bitácora, usuarios), dashboard.
   - `feature/web-base`: router, login, layout responsivo con menú por rol, cliente API con TanStack Query, dashboard con alertas.
   - `feature/web-operacion`: pantallas de recepción, laboratorio e inventario (semáforo de caducidad, bajas).
   - `feature/web-solicitudes`: solicitudes (rol hospital) y asignación con confirmación (rol inventario).
   - `feature/web-trazabilidad-admin`: trazabilidad de una unidad, bitácora y usuarios.
   - `feature/pruebas`: concurrencia, reglas, seguridad, e2e; evidencias en `docs/evidencias/`.
   - `feature/rendimiento-respaldos`: benchmark de índices con ≥100k unidades y backup/restore cronometrado, con evidencias.
   - `feature/docs-arquitectura`: `docs/arquitectura.md` con capas, diagrama Mermaid de operación, desviaciones del ER y versiones reales del entorno.
   - `release/1.0.0`.
3. Dime qué vas a comprobar de mi entorno (Node, npm, Docker, puerto 5432) y qué decisiones necesitas que yo tome. No preguntes lo que ya responde `CLAUDE.md`.

Cuando apruebe el plan, ejecuta las features en orden con `/feature`, `/cerrar-feature` y `/release`. Al cerrar cada feature dame un resumen de 2–3 líneas, qué concepto de PostgreSQL se aplicó y qué evidencia quedó para el reporte. No hagas push sin preguntarme.
