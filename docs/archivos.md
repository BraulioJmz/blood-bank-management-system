# Mapa de archivos

Todos los archivos que entran al entregable (`git archive` de la release, respetando `export-ignore`): **192 archivos**, 158 descritos uno por uno y 34 capturas. Lo marcado con ★ es lo central para la materia (base de datos). La arquitectura se explica en `docs/arquitectura.md`; aquí solo se ubica cada pieza.

## Raíz

| Archivo | Qué es / qué hace |
|---|---|
| `.dockerignore` | Deja fuera del contexto de build de Docker `node_modules`, `.env`, respaldos y docs |
| `.env.example` | Plantilla de variables: contraseñas de `postgres`, `banco_owner` y `app_login`, `JWT_SECRET`, puertos. El `.env` real no se versiona |
| `.gitattributes` | `export-ignore`: archivos de desarrollo que `git archive` deja fuera del entregable |
| `.gitignore` | Lo que no se versiona: `node_modules`, builds, `.env`, respaldos, `entrega/` |
| `.nvmrc` | Versión de Node del proyecto (22) |
| `CHANGELOG.md` | Cambios de la versión 1.0.0 agrupados por tipo (Conventional Commits) |
| `README.md` | Requisitos y versiones, cómo levantar (desarrollo y Docker), comandos y usuarios demo por rol |
| `docker-compose.prod.yml` | Despliegue con un comando: `db` → `migrador` → `api` → `web` (nginx en :8080); secretos sin valores por defecto |
| `docker-compose.yml` | ★ PostgreSQL 16 de desarrollo: SCRAM-SHA-256 y **archivado continuo de WAL** (volúmenes `pgdata`, `walarchivo`, `respaldos`) |
| `package-lock.json` | Versiones exactas de todas las dependencias (ver nota al final) |
| `package.json` | Monorepo con npm workspaces (`apps/*`, `db`) y todos los comandos: `db:*`, `dev`, `test`, `lint`, `build`, `benchmark`, `prueba:*` |

## `db/` — base de datos ★

| Archivo | Qué es / qué hace |
|---|---|
| `db/Dockerfile` | Imagen del migrador: corre `db:setup` y termina |
| `db/lib/bootstrap.ts` | ★ Crea los roles globales del clúster (`banco_owner`, `app_login` con `INHERIT FALSE, SET TRUE`, `rol_*`) y las bases con `REVOKE CONNECT FROM PUBLIC` |
| `db/lib/config.ts` | Conexiones como superusuario (solo bootstrap) o como dueño (migraciones); `identificadorSeguro` para nombres que no se pueden parametrizar |
| `db/migrate.ts` | ★ Runner propio de migraciones: cada `.sql` en su propia transacción (DDL transaccional), checksum SHA-256 en `schema_migrations`, rechaza migraciones aplicadas que se editaron |
| `db/migrations/001_esquema.sql` | ★ Esquema `banco`: 13 tablas, PK identity, FK, UK y CHECK de estados, dominios, edad, volumen y vida útil |
| `db/migrations/002_catalogos.sql` | ★ Catálogos: 8 tipos sanguíneos, 4 componentes con vida útil, 5 roles |
| `db/migrations/003_logica.sql` | ★ Reglas de negocio: SQLSTATE `BS001`–`BS016`, falla segura por tamizaje, fraccionamiento, máquina de estados, `sp_asignar_unidad` (`FOR UPDATE`), `sp_asignar_automatica` (FEFO, `SKIP LOCKED`), caducidad, bajas, entregas |
| `db/migrations/004_seguridad.sql` | ★ Roles de grupo, GRANT mínimos (también por columna), `fn_credenciales_login`, RLS de `solicitud` y `asignacion`, bitácora genérica e inmodificable |
| `db/migrations/005_indices_vistas.sql` | ★ Índice parcial de disponibles, BRIN de bitácora, índices de FK, 5 vistas (`security_invoker`) y vista materializada con refresco concurrente y advisory lock |
| `db/migrations/006_bitacora_usuario_bd.sql` | ★ `usuario_bd` = rol del `SET ROLE` (no `current_user`, que en `SECURITY DEFINER` es el dueño) |
| `db/migrations/007_alerta_caducidad_por_componente.sql` | ★ Umbral de "por caducar" por componente con CHECK entre columnas; `ALTER VIEW … RENAME COLUMN` + `CREATE OR REPLACE VIEW` |
| `db/package.json` | Workspace `@banco/db`: dependencias (`pg`, `dotenv`, faker) y scripts `migrate`, `reset`, `setup`, `sintetico` |
| `db/reset.ts` | `db:reset`: borra y recrea las bases, migra, siembra y carga datos sintéticos en la de desarrollo |
| `db/seeds/001_hospitales.sql` | 4 hospitales de ejemplo |
| `db/seeds/002_usuarios_demo.sql` | 6 usuarios demo (uno por rol, dos de hospital) con hash argon2id precalculado |
| `db/seeds/index.ts` | Aplica los seeds `.sql` en orden, en una transacción |
| `db/setup.ts` | `db:setup`: inicialización idempotente para despliegues (roles, base si falta, migraciones pendientes, seeds si faltan); nunca borra datos |
| `db/sintetico/generar.sql` | Carga masiva con `generate_series`: donaciones, pruebas, unidades, movimientos, solicitudes y asignaciones coherentes con las reglas; desactiva triggers de usuario durante la carga |
| `db/sintetico/generar.ts` | Datos de volumen: donantes faker `es_MX` (nombre coherente con el sexo) y orquestación de la carga |
| `db/tsconfig.json` | Configuración de TypeScript de los scripts de BD (CommonJS, `nodenext`) |

## `apps/api/` — NestJS

| Archivo | Qué es / qué hace |
|---|---|
| `apps/api/.prettierrc` | Formato del código de la API |
| `apps/api/Dockerfile` | Build multi-stage: deps → build → solo dependencias de producción → runtime como usuario `node` |
| `apps/api/eslint.config.mjs` | Reglas de ESLint + Prettier de la API |
| `apps/api/nest-cli.json` | Configuración del CLI de Nest |
| `apps/api/package.json` | Workspace `@banco/api`: dependencias de Nest y configuración de Jest |
| `apps/api/src/admin/admin.controller.ts` | Bitácora (solo lectura) y usuarios (hash argon2id; la BD valida rol ⇔ hospital) |
| `apps/api/src/admin/admin.module.ts` | Módulo de administración |
| `apps/api/src/app.module.ts` | Módulo raíz: importa los módulos de dominio |
| `apps/api/src/auth/auth.controller.ts` | `POST /auth/login`, `GET /auth/yo` |
| `apps/api/src/auth/auth.module.ts` | Configura JWT y registra los guards globales |
| `apps/api/src/auth/auth.service.ts` | Verificación argon2id contra `fn_credenciales_login`; hash señuelo contra enumeración de usuarios |
| `apps/api/src/auth/decoradores.ts` | Decoradores `@Roles()`, `@Publico()` y `@Usuario()` |
| `apps/api/src/auth/jwt.guard.ts` | Guard global: exige JWT salvo rutas `@Publico()` |
| `apps/api/src/auth/login.dto.ts` | DTO del login |
| `apps/api/src/auth/roles.guard.ts` | Guard global: compara el rol del token con `@Roles()` |
| `apps/api/src/auth/tipos.ts` | Tipos del payload JWT y del usuario actual |
| `apps/api/src/common/paginacion.ts` | DTO de paginación y forma `{ datos, total, pagina, tamano }` |
| `apps/api/src/common/pg-error.filter.spec.ts` | Pruebas unitarias del filtro de errores |
| `apps/api/src/common/pg-error.filter.ts` | ★ Traduce `RAISE … ERRCODE 'BSxxx'` y errores estándar (23505, 42501…) a 404/409/422 con mensaje en español |
| `apps/api/src/config.ts` | Variables de entorno de la API |
| `apps/api/src/dashboard/dashboard.controller.ts` | Marca caducadas, refresca la vista materializada si tiene más de 1 min y arma alertas |
| `apps/api/src/dashboard/dashboard.module.ts` | Módulo del panel |
| `apps/api/src/db/contexto.ts` | ★ `ejecutarConContexto`: `BEGIN` → `SET LOCAL ROLE` (lista blanca) → `set_config('app.*', …, true)` → callback → `COMMIT`/`ROLLBACK` → `release()` |
| `apps/api/src/db/db.module.ts` | Módulo global que expone `DbService` |
| `apps/api/src/db/db.service.ts` | Pool de `pg` como `app_login`, `withContext()`, tolera conexiones perdidas |
| `apps/api/src/donantes/donantes.controller.ts` | Búsqueda, alta y edición de donantes; registro de donaciones (la BD valida edad y crea las 5 pruebas) |
| `apps/api/src/donantes/donantes.module.ts` | Módulo de donantes y donaciones |
| `apps/api/src/donantes/dto.ts` | DTO con `class-validator` de donantes y donaciones |
| `apps/api/src/hospitales/hospitales.controller.ts` | Catálogos para la UI y CRUD de hospitales (admin) |
| `apps/api/src/hospitales/hospitales.module.ts` | Módulo de hospitales y catálogos |
| `apps/api/src/inventario/inventario.controller.ts` | Unidades con semáforo, disponibilidad, por caducar, compatibles FEFO, bajas y entregas vía funciones de la BD |
| `apps/api/src/inventario/inventario.module.ts` | Módulo de inventario |
| `apps/api/src/laboratorio/laboratorio.controller.ts` | Donaciones por atender, captura de resultados (`UPDATE(resultado)` por columna) y fraccionamiento |
| `apps/api/src/laboratorio/laboratorio.module.ts` | Módulo de laboratorio |
| `apps/api/src/main.ts` | Arranque: prefijo `/api`, `ValidationPipe` (rechaza propiedades no declaradas), `PgErrorFilter`, CORS |
| `apps/api/src/salud.controller.ts` | `GET /api/salud`: verifica que la API llega a PostgreSQL (healthcheck de Docker) |
| `apps/api/src/solicitudes/solicitudes.controller.ts` | Solicitudes filtradas por RLS, alta, cancelación, asignación manual (`CALL sp_asignar_unidad`) y FEFO |
| `apps/api/src/solicitudes/solicitudes.module.ts` | Módulo de solicitudes |
| `apps/api/src/trazabilidad/trazabilidad.controller.ts` | Cadena completa de una unidad desde `v_trazabilidad_unidad` y sus movimientos |
| `apps/api/src/trazabilidad/trazabilidad.module.ts` | Módulo de trazabilidad |
| `apps/api/test/bd/concurrencia.spec.ts` | ★ 20 asignaciones simultáneas → 1 éxito; UK como segunda barrera; FEFO con `SKIP LOCKED` |
| `apps/api/test/bd/conexion.spec.ts` | Verifica la infraestructura de pruebas (conexión como `app_login`, usuarios demo) |
| `apps/api/test/bd/reglas.spec.ts` | ★ Rechazo de asignaciones inválidas (caducada, reactiva, pendiente, otro tipo o componente…) sin dejar rastro |
| `apps/api/test/bd/seguridad.spec.ts` | ★ Privilegios por rol, RLS de hospital, bitácora inmodificable e identidad de la app en la bitácora |
| `apps/api/test/e2e/entorno-test.ts` | Fija `DB_NAME=banco_test` antes de cargar la app Nest en el e2e |
| `apps/api/test/e2e/flujos.spec.ts` | E2E con supertest: un flujo por rol de punta a punta, con rechazos BS001/BS010/BS014/BS016 |
| `apps/api/test/global-setup.js` | Reinicia `banco_test` una vez antes de la suite |
| `apps/api/test/helpers/bd.ts` | Pools como `app_login`/dueño, usuarios demo, flujo de donación por roles, escritura de evidencias |
| `apps/api/tsconfig.build.json` | Excluye pruebas del build de producción |
| `apps/api/tsconfig.json` | TypeScript de la API (`nodenext`, decoradores) |

## `apps/web/` — React + Vite

| Archivo | Qué es / qué hace |
|---|---|
| `apps/web/.prettierrc` | Formato del código de la web |
| `apps/web/Dockerfile` | Build con Vite y servidor nginx |
| `apps/web/eslint.config.js` | Reglas de ESLint (hooks y Fast Refresh) |
| `apps/web/index.html` | HTML base de la SPA |
| `apps/web/nginx.conf` | SPA con `try_files`, proxy de `/api`, gzip, caché inmutable y cabeceras de seguridad (CSP) |
| `apps/web/package.json` | Workspace `@banco/web`: React, Vite, TanStack Query, Base UI, Sonner, Tailwind |
| `apps/web/src/App.tsx` | Rutas: login y pantallas protegidas por rol dentro del layout |
| `apps/web/src/api/cliente.ts` | `fetch` a `/api` con JWT; errores como `ErrorApi` con `codigo` (SQLSTATE); fixtures solo en desarrollo |
| `apps/web/src/api/hooks.ts` | `useCatalogos` y `useMutacion` (toast de éxito/error y recarga de consultas afectadas) |
| `apps/web/src/api/queryClient.ts` | TanStack Query: sin reintentos para errores 4xx |
| `apps/web/src/api/tipos.ts` | Tipos de las respuestas de la API |
| `apps/web/src/auth/RutaProtegida.tsx` | Redirige a login sin sesión y al panel si el rol no corresponde |
| `apps/web/src/auth/contexto.ts` | Contexto y hook `useSesion` |
| `apps/web/src/auth/sesion.tsx` | Proveedor de sesión: token, validación con `/auth/yo`, cierre por 401 |
| `apps/web/src/components/dominio/Progreso.tsx` | Barra de avance asignadas / solicitadas |
| `apps/web/src/components/dominio/Tamizaje.tsx` | Resumen de las 5 pruebas con ícono y texto |
| `apps/web/src/components/ui/Badge.tsx` | Insignia de color por tono |
| `apps/web/src/components/ui/Button.tsx` | Botón con variantes (`cva`), estado de carga y `scale(0.97)` al presionar |
| `apps/web/src/components/ui/Campo.tsx` | Select nativo y área de texto |
| `apps/web/src/components/ui/Card.tsx` | Tarjeta y encabezado de tarjeta |
| `apps/web/src/components/ui/Dialogo.tsx` | Diálogo modal (Base UI: foco atrapado, Esc, animación de entrada/salida) |
| `apps/web/src/components/ui/Encabezado.tsx` | Encabezado de página con acciones |
| `apps/web/src/components/ui/Estado.tsx` | Estados de carga, error y vacío |
| `apps/web/src/components/ui/Input.tsx` | Campo de texto con etiqueta y error accesibles |
| `apps/web/src/components/ui/Paginacion.tsx` | Paginación con totales |
| `apps/web/src/components/ui/Segmentos.tsx` | Filtro segmentado accesible (radiogroup) |
| `apps/web/src/components/ui/Tabla.tsx` | Tabla con scroll horizontal interno y celdas numéricas alineadas |
| `apps/web/src/components/ui/estilos.ts` | Clases compartidas de los controles de formulario |
| `apps/web/src/components/ui/tonos.ts` | Tonos por estado de unidad, prioridad, semáforo y estado de solicitud |
| `apps/web/src/dev/InterruptorDatos.tsx` | break-ui: interruptor Demo / Peor caso / Vacío / Uno (solo desarrollo) |
| `apps/web/src/dev/fixtures.ts` | break-ui: fixtures de peor caso del inventario (solo desarrollo; fuera del build) |
| `apps/web/src/dev/fixturesSolicitudes.ts` | break-ui: fixtures de peor caso de solicitudes (solo desarrollo) |
| `apps/web/src/index.css` | Tokens de diseño (`@theme` de Tailwind v4) y reducción de movimiento |
| `apps/web/src/layout/Layout.tsx` | Barra lateral en escritorio y drawer (Base UI Dialog) en móvil |
| `apps/web/src/layout/navegacion.ts` | Menú por rol (replica los `@Roles()` de la API) |
| `apps/web/src/lib/cn.ts` | Une clases condicionales (`clsx`) |
| `apps/web/src/lib/formato.ts` | Fechas, horas y números en es-MX y zona de México |
| `apps/web/src/lib/notificar.ts` | Notificaciones Sonner: mensaje y SQLSTATE de los errores de la BD |
| `apps/web/src/lib/useDiferido.ts` | Valor diferido para búsqueda mientras se escribe |
| `apps/web/src/main.tsx` | Proveedores (TanStack Query, router, sesión), un único `<Toaster>` y el interruptor de datos de desarrollo |
| `apps/web/src/pages/Bitacora.tsx` | Bitácora con filtros y diferencias campo por campo (admin) |
| `apps/web/src/pages/Dashboard.tsx` | Panel: indicadores, matriz de disponibilidad, próximas a caducar, solicitudes urgentes, unidades por estado |
| `apps/web/src/pages/Donantes.tsx` | Donantes (búsqueda, alta, detalle, registro de donación) y donaciones con avance del tamizaje |
| `apps/web/src/pages/Hospitales.tsx` | Alta y edición de hospitales (admin) |
| `apps/web/src/pages/Inventario.tsx` | Inventario con filtros y semáforo, bajas, entregas e historial |
| `apps/web/src/pages/Laboratorio.tsx` | Captura de tamizaje con confirmación de "reactivo" y fraccionamiento |
| `apps/web/src/pages/Login.tsx` | Inicio de sesión |
| `apps/web/src/pages/NoEncontrada.tsx` | Página 404 |
| `apps/web/src/pages/Solicitudes.tsx` | Solicitudes: alta (hospital), detalle, asignación manual y FEFO con confirmación, cancelación; lista para móvil |
| `apps/web/src/pages/Trazabilidad.tsx` | Cadena de una unidad: donación, pruebas, hermanas, donante, destino y movimientos |
| `apps/web/src/pages/Usuarios.tsx` | Alta y edición de usuarios (admin) |
| `apps/web/src/vite-env.d.ts` | Tipos de Vite (`import.meta.env`) |
| `apps/web/tsconfig.app.json` | TypeScript del código de la app (estricto) |
| `apps/web/tsconfig.json` | Referencias de TypeScript de la web |
| `apps/web/tsconfig.node.json` | TypeScript de `vite.config.ts` |
| `apps/web/vite.config.ts` | Vite + Tailwind; proxy de `/api` a Nest en desarrollo |

## `scripts/`

| Archivo | Qué es / qué hace |
|---|---|
| `scripts/backup.sh` | `pg_dump -Fc` + `pg_dumpall --roles-only` cronometrados |
| `scripts/benchmark-indices.ts` | ★ `EXPLAIN (ANALYZE, BUFFERS)` con y sin índices sobre ≥100 000 unidades → `benchmark.md` |
| `scripts/evidencia-pruebas.sh` | Corre la suite y escribe `docs/evidencias/pruebas.md` |
| `scripts/prueba-pitr.sh` | ★ `pg_basebackup` + WAL → lotes con hora conocida → falla → recuperación con `recovery_target_time` en contenedor temporal |
| `scripts/prueba-restauracion.sh` | ★ Respaldo → actividad → `DROP DATABASE` → restauración; mide RTO y RPO |
| `scripts/restore.sh` | `pg_restore -j 4` cronometrado; reaplica propiedades de la base |

## `docs/`

| Archivo | Qué es / qué hace |
|---|---|
| `docs/archivos.md` | Este mapa |
| `docs/arquitectura.md` | Capas, módulos, modelo, lógica en la BD, flujo, concurrencia, seguridad, rendimiento, respaldo, calidad, despliegue y limitaciones (con diagramas Mermaid) |
| `docs/contexto/modelo-er.md` | Modelo entidad-relación (TC16), fuente de verdad del esquema |
| `docs/contexto/propuesta-resumen.md` | Propuesta del proyecto (TC15): objetivos, alcances, atributos de calidad, preguntas de investigación |
| `docs/contexto/requisitos-reporte.md` | Lo que pide el profesor para el reporte |
| `docs/diseno.md` | Guía visual: tokens, movimiento, librerías |
| `docs/evidencias/benchmark.md` | Pregunta 2: rendimiento con y sin índices |
| `docs/evidencias/break-ui.md` | Pruebas de la UI con datos de peor caso y 100k unidades |
| `docs/evidencias/pruebas.md` | Salida de la suite completa (65 pruebas) |
| `docs/evidencias/restauracion.md` | Pregunta 3: `pg_dump` y PITR con tiempos y datos perdidos |
| `docs/evidencias/resultados-concurrencia.md` | Pregunta 1: doble asignación concurrente |
| `docs/evidencias/resultados-e2e.md` | Flujos por rol de punta a punta |
| `docs/evidencias/resultados-reglas.md` | Pregunta 4: rechazo de asignaciones inválidas |
| `docs/evidencias/resultados-seguridad.md` | Privilegios, RLS y bitácora |
| `docs/guion-video.md` | Guion del video de demostración |

## `docs/evidencias/capturas/`

34 capturas de pantalla (cada una con su pantalla y rol en `reporte/figuras/LEEME.md`, fuera del repositorio):

- `break-ui-inventario-historial.jpg`, `break-ui-inventario-movil.jpg`, `break-ui-inventario-peor-caso.jpg`, `break-ui-solicitud-detalle-antes.jpg`, `break-ui-solicitud-detalle-despues.jpg`, `break-ui-solicitudes-antes.jpg`, `break-ui-solicitudes-despues.jpg`, `break-ui-solicitudes-movil-antes.jpg`, `break-ui-solicitudes-movil-despues.jpg`, `despliegue-docker-dashboard.jpg`, `web-bitacora-usuario-bd.jpg`, `web-dashboard-hospital.jpg`, `web-dashboard-inventario.jpg`, `web-donante-registro-donacion.jpg`, `web-donantes.jpg`, `web-error-bd-bs001-asignacion.jpg`, `web-error-bd-bs010.jpg`, `web-hospitales.jpg`, `web-inventario-baja.jpg`, `web-inventario-historial.jpg`, `web-inventario.jpg`, `web-laboratorio-confirmar-reactivo.jpg`, `web-laboratorio-fraccionar.jpg`, `web-laboratorio-liberacion.jpg`, `web-menu-movil.jpg`, `web-solicitud-asignacion-manual.jpg`, `web-solicitud-confirmar-fefo.jpg`, `web-solicitud-nueva.jpg`, `web-solicitud-surtida-fefo.jpg`, `web-solicitudes-hospital.jpg`, `web-solicitudes-inventario.jpg`, `web-trazabilidad.jpg`, `web-usuario-nuevo.jpg`, `web-usuarios.jpg`

## Lo que no se explica aquí, y por qué

- **`node_modules/`** (dependencias instaladas) y **`dist/`**, `*.tsbuildinfo` (builds): se generan con `npm install` y `npm run build`, no se versionan (`.gitignore`) y no entran al zip. Son código de terceros o salida del compilador, no del proyecto.
- **`package-lock.json`** sí entra al zip, pero no se explica línea por línea: lo genera npm y fija la versión exacta de cada dependencia para que `npm ci` instale lo mismo en cualquier máquina y en Docker.
- **Excluidos del entregable** por `.gitattributes`: `.claude/` (comandos del asistente de código) y `CLAUDE.md` (instrucciones para el asistente). Son herramientas de desarrollo, no parte del sistema.
- **No versionados**: `.env` (secretos), `backups/` (respaldos generados), `entrega/` (el zip) y `reporte/` (material del reporte en Word).
