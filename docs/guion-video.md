# Guion del video de demostración

**Duración: 14 minutos** (rango aceptable 12–15). Dos partes:

1. **Navegación por roles (≈6 min):** el flujo completo donante → donación → tamizaje → unidad liberada →
   solicitud → asignación → trazabilidad, con al menos un rechazo de la base de datos.
2. **Recorrido del proyecto (≈7 min):** `db/migrations/` archivo por archivo (lo central de la materia),
   módulos de Nest por patrón con uno a fondo, páginas de React por patrón, Docker y scripts.

Más 1 minuto de apertura y cierre. Tres voces (Braulio, Emanuel, Faed); el reparto es una propuesta.
Hilo conductor: **la base de datos protege al paciente aunque la aplicación falle.**

## Preparación

```bash
npm run db:up && npm run db:reset    # BD limpia con ≈5 000 unidades sintéticas
npm run dev                          # API :3000 y web :5173
```

- Navegador a 1440 px, zoom 100 %, una sola pestaña. Terminal y editor con letra grande (≥16 pt).
- Contraseña de los usuarios demo: la del README (sección *Usuarios demo por rol*).
- En el editor, dejar abiertas las pestañas de la parte 2 en orden: las 7 migraciones,
  `apps/api/src/db/contexto.ts`, `apps/api/src/solicitudes/solicitudes.controller.ts`,
  `apps/api/src/common/pg-error.filter.ts`, `apps/web/src/pages/Solicitudes.tsx`, `apps/web/src/api/hooks.ts`,
  `docker-compose.prod.yml`, `scripts/prueba-pitr.sh`.
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

### `db/migrations/` archivo por archivo (6:30–10:00) · Braulio y Emanuel

| Tiempo | Archivo | Qué señalar en el código |
|---|---|---|
| 6:30–6:50 | `db/migrate.ts` | Runner propio: cada archivo en su transacción (el DDL de PostgreSQL es transaccional) y checksum para detectar migraciones editadas |
| 6:50–7:20 | `001_esquema.sql` | Esquema `banco`, PK *identity*, FK, `uk_asignacion_unidad` (segunda barrera) y los CHECK de estados (por qué `varchar + CHECK` y no ENUM) |
| 7:20–7:30 | `002_catalogos.sql` | 8 tipos, 4 componentes con vida útil, 5 roles |
| 7:30–8:30 | `003_logica.sql` | Catálogo de SQLSTATE `BS001`–`BS016`; `fn_evaluar_tamizaje` (falla segura); `tg_unidad_transicion` (máquina de estados); **`sp_asignar_unidad`**: `FOR UPDATE`, validaciones, `INSERT` en asignación, movimiento de salida; `sp_asignar_automatica` con `SKIP LOCKED` |
| 8:30–9:20 | `004_seguridad.sql` | Roles `NOLOGIN` y `app_login` con `INHERIT FALSE, SET TRUE`; GRANT por columna; `SECURITY DEFINER` con `search_path` fijo; políticas RLS `USING`/`WITH CHECK`; trigger de bitácora e inmutabilidad |
| 9:20–9:45 | `005_indices_vistas.sql` | Índice **parcial** de disponibles, BRIN de bitácora, vistas `security_invoker`, vista materializada con `REFRESH CONCURRENTLY` y advisory lock |
| 9:45–10:00 | `006_…` y `007_…` | 006: `usuario_bd` desde el GUC `role`, porque `current_user` en `SECURITY DEFINER` es el dueño. 007: umbral de caducidad por componente; nueva migración en lugar de editar una aplicada |

### Módulos de Nest por patrón, uno a fondo (10:00–11:30) · Faed

- **Patrón común (30 s):** todos los módulos tienen controlador con `@Roles()`, DTO con `class-validator`, SQL
  parametrizado (`$1, $2`) dentro de `db.withContext(usuario, …)` y sin ORM. Mostrar `contexto.ts`:
  `BEGIN` → `SET LOCAL ROLE` (lista blanca) → `set_config('app.*', …, true)` → `COMMIT`/`ROLLBACK`.
- **A fondo, `solicitudes.controller.ts` (45 s):** `listar` no filtra por hospital en el SQL (lo hace la RLS);
  `asignar` es solo `CALL banco.sp_asignar_unidad($1, $2, NULL)`, sin reglas en TypeScript.
- **El otro extremo (15 s):** `pg-error.filter.ts` convierte `BS008` en un 422 con el mensaje del `RAISE`,
  que es el toast que se vio en la parte 1 (BS008).

### Páginas de React por patrón (11:30–12:30) · Emanuel

- **Patrón:** cada página tiene `useQuery` para leer, `useMutacion` para escribir (toast + recarga de lo
  afectado) y diálogos de confirmación de Base UI. Mostrar `hooks.ts`.
- **Ejemplo:** `Solicitudes.tsx`: tabla en escritorio y lista en móvil; la asignación pide confirmar en la misma fila.
- **Componentes y estilo:** `components/ui/` (botón, diálogo, tabla) y tokens en `index.css`. Mencionar
  `docs/evidencias/break-ui.md`: se probó con nombres de 150 caracteres e IDs de 10 dígitos.

### Docker y scripts (12:30–13:30) · Braulio

- **`docker-compose.prod.yml` (30 s):** `db` → `migrador` (`db:setup`, idempotente) → `api` → `web` (nginx con
  proxy de `/api`). Un comando: `docker compose -f docker-compose.prod.yml up --build -d`. PostgreSQL con
  archivado de WAL y sin puerto expuesto.
- **Scripts y resultados (30 s):**
  - `benchmark-indices.ts`: el índice parcial reduce la consulta de disponibilidad 98.7 %.
  - `prueba-pitr.sh`: `pg_basebackup` + WAL + `recovery_target_time`; se pierden 5 donaciones contra 35 con `pg_dump`, y nace el timeline 2.
  - `concurrencia.spec.ts`: 20 transacciones → 1 éxito.

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
