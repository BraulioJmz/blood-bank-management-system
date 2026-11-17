# Banco de Sangre — Sistema de administración

Proyecto integrador de **Administración de Bases de Datos** (UDG/CUCEI, Mtro. Jovan Ricardo Zepeda Gómez).
Equipo: Braulio Jiménez Chávez, Emanuel Cavazos Woo, Faed Federico Velasco Mero.

Aplicación web para administrar un banco de sangre sobre **PostgreSQL 16**. Las reglas de negocio críticas
(falla segura por tamizaje, asignación con bloqueo de fila, caducidad, roles, RLS, bitácora) viven en la base de
datos; NestJS y React son capas delgadas.

## Requisitos

| Herramienta | Versión usada |
|---|---|
| Node.js / npm | 22.23 LTS (`.nvmrc`; `nvm use`) / 10.9 |
| Docker Desktop / Compose | 29.8 / v5 |
| PostgreSQL (contenedor) | 16.16 (`postgres:16-alpine`) |
| NestJS / `pg` | 11.2 / 8.23 (sin ORM) |
| React / Vite / TypeScript | 19.3 / 6.4 / 5.9 |
| SO y equipo de desarrollo | macOS 26.6, Apple M4, 16 GB RAM |

Versiones completas de librerías y arquitectura: `docs/arquitectura.md`. Mapa de archivos: `docs/archivos.md`.

No hace falta `psql` local: los scripts usan `docker exec`.

## Cómo levantar (desarrollo)

```bash
cp .env.example .env      # y cambia las contraseñas
npm install
npm run db:up             # PostgreSQL 16 en Docker
npm run db:reset          # crea roles y bases, migra, carga seeds y ≈5 000 unidades sintéticas
npm run dev               # API en :3000 y web en :5173
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run db:up` / `db:down` | Levanta / detiene PostgreSQL |
| `npm run db:migrate` | Aplica migraciones pendientes (`db/migrations/*.sql`) |
| `npm run db:setup` | Inicialización idempotente (no borra datos): roles, base, migraciones pendientes, seeds si faltan |
| `npm run db:reset` | Drop + bootstrap + migraciones + seeds en `banco` y `banco_test`; además ≈5 000 unidades sintéticas en `banco` (`--sin-sintetico` para omitirlas, `--unidades 100000` para más volumen) |
| `npm run db:sintetico -- --unidades 100000` | Genera datos sintéticos |
| `npm run dev` | API + web en paralelo |
| `npm test` | Pruebas de BD y e2e (Jest + supertest contra `banco_test`, sin mocks) |
| `npm run lint` | ESLint en api y web |
| `npm run test:evidencia` | Corre las pruebas y escribe `docs/evidencias/pruebas.md` y `resultados-*.md` |
| `npm run benchmark` | Benchmark de índices con ≥100k unidades → `docs/evidencias/benchmark.md` |
| `npm run db:backup -- [base]` / `npm run db:restore -- <dump> [base]` | Respaldo `pg_dump -Fc` / restauración cronometrada |
| `npm run prueba:restauracion` | Respaldo → falla simulada → restauración → `docs/evidencias/restauracion.md` |
| `npm run prueba:pitr` | Respaldo base + WAL archivado → lotes con hora conocida → `DROP DATABASE` → recuperación con `recovery_target_time` en un contenedor temporal → sección PITR de `restauracion.md` |

## Despliegue con Docker (todo en un comando)

```bash
cp .env.example .env    # define POSTGRES_PASSWORD, DB_OWNER_PASSWORD, DB_APP_PASSWORD y JWT_SECRET
docker compose -f docker-compose.prod.yml up --build -d
# → http://localhost:8080   (WEB_PORT en .env para cambiarlo)
docker compose -f docker-compose.prod.yml down        # detener (los datos quedan en volúmenes)
```

Levanta `db` (PostgreSQL 16 con archivado de WAL), `migrador` (`db:setup` idempotente: roles, migraciones
pendientes, seeds y ≈5 000 unidades sintéticas solo la primera vez), `api` (NestJS) y `web` (nginx con
proxy de `/api`). Los secretos no tienen valor por defecto: si falta uno, Compose se detiene.
Detalle y diagrama: `docs/arquitectura.md` → Despliegue.

## Usuarios demo por rol

Contraseña de todos: **`Demo2026!`** (solo datos sintéticos; cargados por `db/seeds/`).

| Usuario | Rol | Qué puede hacer |
|---|---|---|
| `recepcion` | recepción | Registrar donantes y donaciones; ver el avance del tamizaje |
| `laboratorio` | laboratorio | Capturar resultados de tamizaje; fraccionar donaciones |
| `inventario` | inventario | Inventario, semáforo de caducidad, bajas, asignación manual/FEFO, entregas, trazabilidad |
| `hospital.norte` | hospital (Hospital General Norte) | Crear y seguir **sus** solicitudes (RLS) |
| `hospital.sur` | hospital (Hospital Regional Sur) | Ídem; no ve las del Norte |
| `admin` | admin | Usuarios, hospitales, bitácora de auditoría, consulta global |

Población/muestra: 6 usuarios demo (uno por rol, dos de hospital) y 4 hospitales; los datos de volumen
se generan con `npm run db:sintetico`.

## Documentación

- `docs/contexto/`: propuesta (TC15), modelo ER (TC16) y requisitos del reporte.
- `docs/arquitectura.md`: capas, roles de BD, diagramas y desviaciones del ER.
- `docs/evidencias/`: pruebas, benchmark, restauración y capturas.
