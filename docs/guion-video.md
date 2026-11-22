# Guion del video de demostración

**Duración: 14 minutos** (rango aceptable 12–15). Dos partes:

1. **Navegación por roles (≈6 min):** el flujo completo donante → donación → tamizaje → unidad liberada →
   solicitud → asignación → trazabilidad, con al menos un rechazo de la base de datos.
2. **Recorrido del proyecto (≈7 min):** carpeta por carpeta, con una frase por carpeta y más detalle donde está
   lo central de la materia (`db/migrations/`, el contexto por petición en Nest, los scripts de evidencia).

Más 1 minuto de apertura y cierre. Tres voces (Braulio, Emanuel, Faed); el reparto es una propuesta.
Hilo conductor: **la base de datos protege al paciente aunque la aplicación falle.**

## Preparación

```bash
npm run db:up && npm run db:reset    # BD limpia con ≈5 000 unidades sintéticas
npm run dev                          # API :3000 y web :5173
```

- Navegador a 1440 px, zoom 100 %, una sola pestaña. Terminal y editor con letra grande (≥16 pt).
- Contraseña de los usuarios demo: la del README (sección *Usuarios demo por rol*).
- En el editor, dejar el explorador con todas las carpetas **colapsadas** (se abren en orden durante la parte 2) y
  las pestañas de lo marcado con ★ ya abiertas en orden: `db/migrate.ts`, las 7 migraciones,
  `apps/api/src/db/contexto.ts`, `apps/api/src/solicitudes/solicitudes.controller.ts`,
  `apps/api/src/common/pg-error.filter.ts`, `apps/web/src/api/hooks.ts`, `apps/web/src/pages/Solicitudes.tsx`,
  `docker-compose.prod.yml`, `scripts/benchmark-indices.ts`, `scripts/prueba-pitr.sh`.
- Para cambiar de rol rápido: cerrar sesión desde el pie del menú.

## Parte 0 — Apertura (0:00–0:30) · Braulio

Panel como `inventario`. Problema: un banco de sangre no puede entregar una unidad caducada, reactiva o
asignada dos veces. Decisión del proyecto: esas reglas viven en PostgreSQL, no en la interfaz.

## Parte 1 — Navegación por roles (0:30–6:30)

| Tiempo | Quién | Rol | Qué se hace en pantalla | Qué se explica |
|---|---|---|---|---|
| 0:30–1:20 | Emanuel | `recepcion` | **Rechazo de la BD**: *Donantes* → **Nuevo donante** con nacimiento en 2012 → **Registrar donación** → toast rojo. Luego **Nuevo donante** adulto → **Registrar donación** | El formulario no valida la edad: el trigger `tg_donacion_validar` rechaza con "El donante tiene 14 años; solo pueden donar personas de 18 a 65 (BS008)". Con el adulto, el toast "se crearon las 5 pruebas" también lo produjo un trigger |
| 1:20–2:30 | Emanuel | `laboratorio` | *Laboratorio* → *Sin fraccionar* → **Fraccionar** (eritrocitos, plasma, plaquetas) → *Por atender* → capturar 5 × **No reactivo** | Las unidades nacen en **cuarentena** (falla segura). Al capturar la quinta, un trigger las libera: toast "Donación liberada". Abrir y cancelar el diálogo de **Reactivo** para mostrar que descartaría todas las unidades hermanas |
| 2:30–3:20 | Faed | `hospital.norte` | *Solicitudes* → **Nueva solicitud** del mismo tipo, eritrocitos, 2 unidades, emergencia | Se registra a nombre de su hospital. Luego entrar como `hospital.sur`: la solicitud **no aparece** (RLS) |
| 3:20–4:50 | Faed | `inventario` | Abrir la solicitud → la lista de compatibles viene en orden FEFO → **Asignar** la recién liberada → **Asignar automáticamente (FEFO)** → queda *surtida* | Manual: `SELECT … FOR UPDATE`. Automática: las que caducan primero, con `SKIP LOCKED` |
| 4:50–5:30 | Faed | `inventario` | *Inventario* → filtrar *Asignada* → la unidad → **Entregar** (confirmar). Opcional: segundo rechazo con dos pestañas, asignando la misma unidad en ambas (`web-error-bd-bs001-asignacion.jpg`) | La entrega pasa por `fn_entregar_unidad`; ningún rol tiene `UPDATE` directo sobre las unidades. Si dos personas asignan la misma unidad, la segunda recibe BS001 por el `FOR UPDATE` |
| 5:30–6:30 | Braulio | `inventario` → `admin` | *Trazabilidad* de esa unidad → recorrer la cadena. Como `admin`: *Bitácora* → filtrar `asignacion` → expandir el registro | Hemovigilancia: unidad → donación → pruebas → hermanas → donante → hospital. La bitácora la escribe un trigger con el rol y el usuario reales (`rol_inventario`), y nadie puede modificarla |

## Parte 2 — Recorrido del proyecto (6:30–13:30)

Recorrido **carpeta por carpeta** desde el explorador del editor: de cada carpeta se dice en una frase qué
contiene y para qué sirve; solo se abre código donde está lo central de la materia (marcado con ★).
Orden: raíz → `db/` → `apps/api/` → `apps/web/` → Docker y `scripts/` → `docs/`.

### Raíz del repositorio (6:30–6:50) · Braulio

- **Monorepo con npm workspaces:** tres paquetes, `db/`, `apps/api/` y `apps/web/`, con un solo `package-lock.json`.
- **`package.json` raíz:** los comandos del proyecto (`db:up`, `db:reset`, `dev`, `test`, `benchmark`, `prueba:pitr`…).
- **`docker-compose.yml`:** PostgreSQL 16 para desarrollo. `docker-compose.prod.yml` se ve al final.
- **`.env.example`:** las variables que hacen falta (el `.env` real con secretos no se versiona). `README.md` explica cómo
  levantar todo y lista los usuarios demo; `CHANGELOG.md` resume las versiones.

### `db/` — la base de datos (6:50–9:50) · Braulio y Emanuel

Vista rápida de la carpeta (20 s):

| Carpeta / archivo | De qué va |
|---|---|
| `lib/` | `config.ts` lee el `.env` y crea conexiones; `bootstrap.ts` crea los **roles** del clúster (son globales, no de una BD, por eso no van en una migración) |
| `migrate.ts` ★ | Runner propio: aplica los `.sql` en orden, cada uno en su transacción (el DDL de PostgreSQL es transaccional), y guarda un checksum en `schema_migrations` para detectar migraciones editadas |
| `reset.ts`, `setup.ts` | `reset` borra y recrea todo (desarrollo); `setup` es idempotente (lo usa Docker) |
| `migrations/` ★ | El esquema y toda la lógica de negocio (se abre abajo) |
| `seeds/` | Hospitales y usuarios demo, uno por rol |
| `sintetico/` | `generar.sql` usa `generate_series` para volumen (100 000 unidades) y `generar.ts` agrega nombres realistas con faker `es_MX` |

**★ `migrations/`, archivo por archivo (2 min 40 s):**

| Tiempo | Archivo | Qué señalar en el código |
|---|---|---|
| 7:10–7:40 | `001_esquema.sql` | Esquema `banco`, PK *identity*, FK, `uk_asignacion_unidad` (segunda barrera contra la doble asignación) y los CHECK de estados (por qué `varchar + CHECK` y no ENUM) |
| 7:40–7:50 | `002_catalogos.sql` | 8 tipos sanguíneos, 4 componentes con su vida útil, 5 roles |
| 7:50–8:40 | `003_logica.sql` | Catálogo de SQLSTATE `BS001`–`BS016`; `fn_evaluar_tamizaje` (falla segura); `tg_unidad_transicion` (máquina de estados); **`sp_asignar_unidad`**: `FOR UPDATE`, validaciones, `INSERT` en asignación y movimiento de salida; `sp_asignar_automatica` con `SKIP LOCKED` |
| 8:40–9:20 | `004_seguridad.sql` | Roles `NOLOGIN` y `app_login` con `INHERIT FALSE, SET TRUE`; GRANT por columna (`rol_hospital` no ve datos del donante); `SECURITY DEFINER` con `search_path` fijo; políticas RLS `USING`/`WITH CHECK`; trigger de bitácora y su inmutabilidad |
| 9:20–9:40 | `005_indices_vistas.sql` | Índice **parcial** de disponibles, BRIN en la bitácora, vistas `security_invoker`, vista materializada con `REFRESH CONCURRENTLY` y advisory lock |
| 9:40–9:50 | `006_…` y `007_…` | 006: `usuario_bd` sale del GUC `role`, porque dentro de `SECURITY DEFINER` `current_user` es el dueño. 007: umbral de caducidad por componente; se hizo una migración nueva en lugar de editar una ya aplicada |

### `apps/api/` — backend NestJS (9:50–11:10) · Faed

Vista rápida de `src/` (25 s):

| Carpeta | De qué va |
|---|---|
| `db/` ★ | `DbService` (un solo `Pool` conectado como `app_login`) y `contexto.ts` con `withContext` |
| `auth/` | Login con `argon2` y JWT (`id_usuario`, `rol`, `id_hospital`); `jwt.guard.ts` y `roles.guard.ts` aplican `@Roles()` en cada endpoint |
| `common/` | `pg-error.filter.ts` (errores de PostgreSQL → HTTP) y el DTO de paginación |
| `donantes/`, `laboratorio/`, `inventario/`, `solicitudes/`, `hospitales/`, `trazabilidad/`, `dashboard/`, `admin/` | Un módulo por dominio, todos con el mismo patrón: controlador con `@Roles()`, DTO con `class-validator` y SQL parametrizado (`$1, $2`) sin ORM |

A detalle (45 s):

- **★ `db/contexto.ts`:** `BEGIN` → `SET LOCAL ROLE` (el nombre se valida contra una lista blanca porque no se puede
  parametrizar) → `set_config('app.id_usuario' / 'app.id_hospital' / 'app.rol', …, true)` → callback →
  `COMMIT`/`ROLLBACK` → `release()`. Gracias a esto los GRANT, la RLS y la bitácora ven al usuario real.
- **★ `solicitudes/solicitudes.controller.ts`:** `listar` no filtra por hospital en el SQL (lo hace la RLS);
  `asignar` es solo `CALL banco.sp_asignar_unidad($1, $2, NULL)`, sin reglas en TypeScript.
- **`common/pg-error.filter.ts`:** convierte `BS008` en un 422 con el mensaje del `RAISE`; es el toast de la parte 1.

`test/` (10 s): `bd/` tiene las pruebas que responden las preguntas de investigación (`concurrencia`, `reglas`,
`seguridad`, `conexion`) contra la BD real `banco_test`, sin mocks; `e2e/flujos.spec.ts` recorre los flujos por
rol con supertest; `helpers/` arma las conexiones de prueba.

### `apps/web/` — frontend React (11:10–12:10) · Emanuel

Vista rápida de `src/` (35 s):

| Carpeta | De qué va |
|---|---|
| `api/` | `cliente.ts` (fetch con el JWT), `hooks.ts` (TanStack Query) y los tipos de las respuestas |
| `auth/` | Sesión y `RutaProtegida`: sin sesión manda al login y oculta las rutas que el rol no usa (solo es comodidad: la BD decide los permisos) |
| `layout/` | Menú lateral; `navegacion.ts` define qué ve cada rol |
| `pages/` | Una página por pantalla: Donantes, Laboratorio, Inventario, Solicitudes, Trazabilidad, Bitácora, Usuarios… |
| `components/` | `ui/` (botón, diálogo, tabla, insignias) y `dominio/` (progreso del tamizaje) |
| `lib/` | Formato de fechas en zona de México, toasts con el mensaje de la BD, búsqueda diferida |
| `dev/` | Datos de peor caso, solo en desarrollo; Vite los quita del build (`docs/evidencias/break-ui.md`: nombres de 150 caracteres, IDs de 10 dígitos) |

A detalle (25 s): **`api/hooks.ts`** + **`pages/Solicitudes.tsx`**. Cada página usa `useQuery` para leer y
`useMutacion` para escribir (toast y recarga de lo afectado); los diálogos de confirmación son de Base UI.
En escritorio es una tabla y en móvil una lista; la asignación pide confirmar en la misma fila.

### Docker y `scripts/` (12:10–13:05) · Braulio

- **Docker (25 s):** cada paquete tiene su `Dockerfile` multi-stage (`apps/web/nginx.conf` hace de proxy de `/api`).
  `docker-compose.prod.yml`: `db` → `migrador` (`db:setup`) → `api` → `web`, todo con un comando:
  `docker compose -f docker-compose.prod.yml up --build -d`. PostgreSQL con archivado de WAL y sin puerto expuesto.
- **`scripts/` (30 s):** cada script deja su resultado en `docs/evidencias/`.
  - ★ `benchmark-indices.ts`: `EXPLAIN ANALYZE` con 100 000 unidades; el índice parcial reduce la consulta de disponibilidad 98.7 %.
  - `backup.sh` / `restore.sh` / `prueba-restauracion.sh`: `pg_dump -Fc`, se simula la caída y se restaura cronometrando.
  - ★ `prueba-pitr.sh`: `pg_basebackup` + WAL + `recovery_target_time`; se pierden 5 donaciones contra 35 con `pg_dump`, y nace el timeline 2.
  - `evidencia-pruebas.sh`: corre la suite y escribe `pruebas.md`.

### `docs/` (13:05–13:30) · Braulio

- `arquitectura.md`: capas, diagramas de componentes y despliegue, y las desviaciones respecto al ER.
- `archivos.md`: qué hace cada archivo del repositorio. `diseno.md`: criterios de la interfaz.
- `contexto/`: propuesta, modelo ER y requisitos del reporte.
- `evidencias/`: benchmark, restauración, resultados de cada prueba (concurrencia: 20 transacciones → 1 éxito) y capturas.

## Parte 3 — Cierre (13:30–14:00) · Braulio

`docs/evidencias/pruebas.md`: 65/65 pruebas contra PostgreSQL real. Qué aprendimos (bloqueos, RLS, WAL) y
qué faltaría (cookie `HttpOnly`, particionar la bitácora).

## Frases clave

- **Falla segura**: "Si nadie captura las pruebas, la unidad se queda en cuarentena. Lo seguro es el estado por defecto."
- **FOR UPDATE**: "La segunda transacción espera a la primera y luego ve que la unidad ya no está disponible."
- **SKIP LOCKED**: "En la asignación automática, en vez de esperar una unidad bloqueada, se salta a la siguiente."
- **RLS**: "La base de datos agrega el filtro por hospital a cada consulta; la aplicación no puede olvidarlo."
- **SECURITY DEFINER**: "Corre con permisos del dueño, pero con `search_path` fijo para que nadie la secuestre."
- **WAL / PITR**: "Todo cambio se escribe primero en el WAL; guardando ese registro podemos volver a cualquier segundo."

## Si algo falla en vivo

Las capturas de `docs/evidencias/capturas/` cubren cada paso de la parte 1 (`web-donante-registro-donacion.jpg`,
`web-laboratorio-liberacion.jpg`, `web-solicitud-nueva.jpg`, `web-solicitud-confirmar-fefo.jpg`,
`web-error-bd-bs001-asignacion.jpg`, `web-trazabilidad.jpg`, `web-bitacora-usuario-bd.jpg`).
