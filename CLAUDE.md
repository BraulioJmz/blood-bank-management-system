# Banco de Sangre — Sistema de administración (Proyecto integrador ABD, UDG/CUCEI)

Aplicación web para administrar un banco de sangre, respaldada por PostgreSQL.
Materia: Administración de Bases de Datos (Mtro. Jovan Ricardo Zepeda Gómez).
Equipo: Braulio Jiménez Chávez, Emanuel Cavazos Woo, Faed Federico Velasco Mero.
**Fecha límite de entrega: 18 de noviembre de 2026.**

El foco de la materia es la **base de datos**: integridad, transacciones y concurrencia,
roles y privilegios, auditoría, índices/vistas y respaldo/recuperación. Las reglas de
negocio críticas viven en PostgreSQL (procedimientos, triggers, constraints), **no en el backend ni en la UI**.
Nest y React son capas delgadas: validan entrada, orquestan y muestran.

Un objetivo explícito del proyecto es **aprender PostgreSQL a fondo**. Cuando implementes algo
de BD no trivial (bloqueos, RLS, triggers, planes de ejecución), deja un comentario SQL breve
explicando el porqué y menciónalo en tu resumen.

Contexto completo:
- `docs/contexto/propuesta-resumen.md` — objetivos, alcances, límites, atributos de calidad, preguntas de investigación (TC15).
- `docs/contexto/modelo-er.md` — modelo entidad-relación (TC16). Fuente de verdad del esquema.
- `docs/contexto/requisitos-reporte.md` — lo que pide el profesor; el código debe dejar evidencia para esas secciones.

## Stack (decidido, no cambiar sin preguntar)

- **PostgreSQL 16** en Docker Compose para desarrollo.
- **Backend: NestJS (TypeScript)** — módulos por dominio, DTOs con `class-validator`, guards de rol, filtro de excepciones.
- **Acceso a datos: `pg` (node-postgres) con `Pool`. PROHIBIDO usar ORM** (Prisma, TypeORM, Sequelize, MikroORM) o query builders que oculten el SQL. Consultas parametrizadas (`$1, $2…`), nunca concatenar valores.
- **Frontend: React + Vite + TypeScript**, React Router, TanStack Query para llamadas a la API, Tailwind CSS. Responsivo.
- **Auth:** JWT (`@nestjs/jwt`) con hash de contraseña `argon2`. El token lleva `id_usuario`, `rol`, `id_hospital`.
- **Migraciones:** archivos `.sql` numerados aplicados por un runner propio mínimo (`db/migrate.ts`) con tabla `schema_migrations`. Sin herramientas que generen SQL.
- **Pruebas:** Jest (default de Nest) contra una BD de pruebas real (`banco_test`), sin mocks de BD. Vitest para lo poco que se pruebe en el front.
- **Datos sintéticos:** SQL con `generate_series` (volumen) + `@faker-js/faker` (locale `es_MX`) para nombres realistas.
- Monorepo con **npm workspaces**. Node 22 LTS (`.nvmrc`; imágenes `node:22-alpine`). Desarrollo en Mac (Apple Silicon).

## Estructura del repo

```
db/
  migrations/        # 001_esquema.sql, 002_catalogos.sql, 003_logica.sql, 004_seguridad.sql, 005_indices_vistas.sql …
  seeds/             # usuarios demo, hospitales
  sintetico/         # generar.sql (generate_series) + generar.ts (faker)
  migrate.ts         # runner de migraciones
apps/
  api/               # NestJS
    src/
      db/            # DbModule: Pool + DbService.withContext()
      auth/  common/ (guards, decorators, filters)
      donantes/ donaciones/ laboratorio/ inventario/ hospitales/ solicitudes/ trazabilidad/ admin/ dashboard/
    test/            # e2e y pruebas de BD
  web/               # React + Vite
    src/ pages/ components/ api/ auth/
scripts/
  benchmark-indices.ts  backup.sh  restore.sh
docs/
  contexto/          # insumos (no editar salvo que se pida)
  evidencias/        # salidas de pruebas, benchmarks, restauración, capturas → van al reporte
  arquitectura.md
docker-compose.yml  .env.example  package.json  README.md
```

## Patrón clave: contexto de BD por petición

Todo acceso de negocio pasa por `DbService.withContext(user, async (client) => …)`, que:
1. Toma un cliente del pool y hace `BEGIN`.
2. `SET LOCAL ROLE <rol>` — el nombre de rol **no se puede parametrizar**: validarlo contra una lista blanca (`rol_recepcion`, `rol_laboratorio`, `rol_inventario`, `rol_hospital`, `rol_admin`) antes de interpolar.
3. `SELECT set_config('app.id_usuario', $1, true), set_config('app.id_hospital', $2, true), set_config('app.rol', $3, true)` (el `true` = local a la transacción).
4. Ejecuta el callback; `COMMIT` o `ROLLBACK` ante error; siempre `release()`.
Así los GRANT, la RLS y la bitácora funcionan con la identidad real del usuario.
Un `ExceptionFilter` traduce los `RAISE EXCEPTION` de PostgreSQL (SQLSTATE propios, p. ej. `BS001`…) a 409/422 con mensaje en español para la UI.

## Reglas del dominio (implementar en la BD)

Catálogos:
- Tipos sanguíneos: A, B, AB, O × Rh +/− (8 registros).
- Componentes y vida útil: Concentrado eritrocitario 42 días · Plasma fresco congelado 365 · Concentrado plaquetario 5 · Crioprecipitado 365.
- Roles de aplicación: recepcion, laboratorio, inventario, hospital, admin.
- Pruebas de tamizaje obligatorias por donación: VIH, VHB, VHC, Sífilis, Chagas.

Estados (CHECK o ENUM; documentar la elección):
- `unidad_sangre.estado`: cuarentena → disponible → asignada → entregada; también caducada, descartada.
- `prueba_tamizaje.resultado`: pendiente | no_reactivo | reactivo.
- `solicitud.estado`: pendiente | parcial | surtida | cancelada. `prioridad`: normal | urgente | emergencia.
- `movimiento_inventario.tipo_movimiento`: entrada | salida | baja | cambio_estado.

Reglas (todas en PostgreSQL):
1. **Falla segura:** toda unidad nace en `cuarentena`. Pasa a `disponible` solo cuando las 5 pruebas de su donación son `no_reactivo` (trigger). Si alguna es `reactivo`, todas las unidades de esa donación pasan a `descartada` con movimiento `baja`.
2. **Fraccionamiento:** función que, dada una donación y una lista de componentes, crea las unidades con `fecha_caducidad = fecha_obtencion + vida_util_dias` y registra movimiento `entrada`.
3. **Asignación con control de concurrencia:** `sp_asignar_unidad(id_solicitud, id_unidad)` toma la unidad con `SELECT … FOR UPDATE`, valida (disponible, no caducada, mismo tipo sanguíneo y componente, solicitud abierta), inserta en `asignacion` (UK en `id_unidad` como segunda barrera), cambia estado a `asignada`, registra movimiento `salida` y recalcula el estado de la solicitud. El usuario sale de `current_setting('app.id_usuario')`. Cualquier fallo revierte toda la transacción.
4. **Asignación automática FEFO:** `sp_asignar_automatica(id_solicitud)` elige las unidades que caducan primero con `FOR UPDATE SKIP LOCKED`.
5. **Caducidad:** `fn_marcar_caducadas()` pasa a `caducada` las unidades vencidas no asignadas (se invoca al consultar dashboard/inventario).
6. Ninguna operación de inventario se hace con UPDATE directo desde Nest: solo vía funciones/procedimientos (los roles no tienen UPDATE sobre `unidad_sangre`).

## Seguridad y auditoría

- Roles de grupo `NOLOGIN` con **privilegios mínimos** (GRANT por tabla/vista/función). `rol_hospital` no ve datos personales de donantes.
- Nest se conecta como `app_login` (LOGIN, SCRAM-SHA-256, sin privilegios propios, miembro de los roles de grupo). Las migraciones corren con un rol owner distinto.
- **RLS** en `solicitud` (y lo que exponga datos por hospital) usando `current_setting('app.id_hospital', true)`.
- **Bitácora:** trigger genérico `AFTER INSERT/UPDATE/DELETE` → `bitacora_auditoria` con `to_jsonb(OLD/NEW)`, `current_user` y `current_setting('app.id_usuario', true)`. Ningún rol de la app puede UPDATE/DELETE en la bitácora.
- Además de la BD, Nest aplica `@Roles()` en cada endpoint (defensa en profundidad) y React oculta lo que el rol no usa.
- Secretos solo en `.env` (ignorado); `.env.example` versionado. Solo datos sintéticos.

### Esquema y funciones `SECURITY DEFINER`
- Todos los objetos viven en el esquema **`banco`** (no en `public`).
- Toda función `SECURITY DEFINER` lleva `SET search_path = banco, pg_temp`, `REVOKE EXECUTE … FROM PUBLIC`
  y `GRANT EXECUTE` solo al rol que la usa, con un comentario SQL que explique el porqué
  (sin search_path fijo, un objeto homónimo en otro esquema o en `pg_temp` podría secuestrar la función,
  que corre con privilegios del dueño; `pg_temp` al final para que no tenga prioridad; EXECUTE es de PUBLIC por defecto).

### Identidad de la app en la bitácora
- Dentro de `SECURITY DEFINER`, `current_user` es el dueño. Por eso `withContext` además hace
  `set_config('app.rol', <rol>, true)` y la bitácora registra `usuario_bd` (`coalesce(nullif(current_setting('role'), 'none'), session_user)`, no `current_user`),
  `rol_app` (`current_setting('app.rol', true)`) y `usuario_app` (`current_setting('app.id_usuario', true)`).
- Prueba obligatoria en `seguridad.spec.ts`: una asignación hecha por `rol_inventario` queda en la bitácora
  con ese rol y ese usuario, no con el dueño.

### Desviaciones permitidas respecto al ER (documentarlas en `docs/arquitectura.md`)
- `usuario.password_hash varchar`.
- `bitacora_auditoria.usuario_app varchar`.
- `bitacora_auditoria.rol_app varchar`.
- `tipo_sanguineo.grupo_abo varchar(2)` con `CHECK (grupo_abo IN ('A','B','AB','O'))`.
- Cualquier otra: **preguntar antes**.

## Rendimiento y respaldo
- Índice parcial: `unidad_sangre (id_tipo_sanguineo, id_componente, fecha_caducidad) WHERE estado = 'disponible'`, más índices en FKs de joins frecuentes.
- Vistas: `v_disponibilidad`, `v_unidades_por_caducar`, `v_solicitudes_pendientes`, `v_trazabilidad_unidad` (unidad → donación → donante → pruebas → unidades hermanas → asignación → hospital). Considerar vista materializada para el dashboard.
- `scripts/benchmark-indices.ts`: con ≥100 000 unidades, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` de la consulta de disponibilidad sin y con índices; escribe `docs/evidencias/benchmark.md` con tiempos y % de mejora.
- `scripts/backup.sh` / `restore.sh`: `pg_dump -Fc` + restauración cronometrada → `docs/evidencias/restauracion.md`. (Opcional: archivado WAL + PITR en el contenedor.)

## Pruebas (responden las preguntas de investigación)
- `concurrencia.spec.ts`: N clientes del pool intentan asignar la misma unidad con `Promise.all` → exactamente 1 éxito, N−1 rechazos.
- `reglas.spec.ts`: se rechaza asignar unidad caducada, reactiva, con pruebas pendientes, de otro tipo o de otro componente.
- `seguridad.spec.ts`: privilegios por rol, RLS de hospital, bitácora no modificable.
- e2e (supertest) de los flujos principales por rol.
- Guardar salida de `npm test` en `docs/evidencias/pruebas.md` al cerrar features de pruebas.

## Comandos (mantener en package.json raíz)
`npm run db:up` (docker compose) · `npm run db:migrate` · `npm run db:reset` (drop + migrate + seeds) · `npm run db:sintetico -- --unidades 100000` · `npm run dev` (api + web en paralelo) · `npm test` · `npm run lint`.

## Flujo de trabajo Git (Git Flow) — obligatorio

- Ramas: `main` (solo releases etiquetadas), `develop` (integración), `feature/<area>-<descripcion>`, `release/<x.y.z>`, `hotfix/<descripcion>`.
- Toda funcionalidad nace de `develop` en `feature/*` y regresa con `git merge --no-ff`.
- **Commits atómicos y significativos**, Conventional Commits en español:
  `tipo(alcance): descripción en imperativo` — tipos: feat, fix, refactor, test, docs, chore, perf, style. Alcances: db, api, web, auth, seguridad, datos, pruebas, docs, infra.
  Ej.: `feat(db): agrega sp_asignar_unidad con bloqueo FOR UPDATE`.
- Un commit = un cambio lógico que compila y pasa pruebas. No mezclar migraciones, API y UI en el mismo commit.
- Antes de cerrar una feature: `npm run db:reset` + `npm test` + `npm run lint`. No mergear en rojo.
- **No hacer `git push` ni crear remotos sin preguntar.** No reescribir historia de `develop`/`main`.
- Antes de la release: `feature/infra-docker` con Dockerfiles multi-stage de api y web (nginx con proxy de `/api`)
  y `docker-compose.prod.yml` (db, migración, api, web) que levanta todo con un comando; documentado en README
  y en `docs/arquitectura.md` con diagrama de despliegue.
- Final: `release/1.0.0` → `main` y `develop`, tag `v1.0.0`.
- Sin línea `Co-Authored-By` en los commits.

## Cómo trabajar conmigo
- Responde y comenta en **español**; identificadores de BD en español snake_case como en el ER; código TS en camelCase.
- Skills de diseño aprobadas en `.claude/skills/`: `emil-design-eng`, `pick-ui-library`, `break-ui`, `ask-sonner`.
  Al usar `emil-design-eng`, aplica sus **criterios de diseño** pero **ignora sus instrucciones de formato de conversación**
  (frase fija de apertura, esperar a que pregunte, tablas Before/After obligatorias).
- Antes de cada feature, di en 3–5 líneas qué harás y en qué commits; luego ejecútalo sin esperar confirmación salvo decisiones ambiguas o destructivas.
- Prioriza que funcione de punta a punta antes que pulir. Tiempo: ~2 días.
- Todo lo que sirva como evidencia (salidas de pruebas, benchmarks, capturas, diagramas) va a `docs/evidencias/` y lo mencionas.
- README con: requisitos, cómo levantar, usuarios demo por rol.
