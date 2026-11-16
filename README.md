# Banco de Sangre — Sistema de administración

Proyecto integrador de **Administración de Bases de Datos** (UDG/CUCEI, Mtro. Jovan Ricardo Zepeda Gómez).
Equipo: Braulio Jiménez Chávez, Emanuel Cavazos Woo, Faed Federico Velasco Mero.

Aplicación web para administrar un banco de sangre sobre **PostgreSQL 16**. Las reglas de negocio críticas
(falla segura por tamizaje, asignación con bloqueo de fila, caducidad, roles, RLS, bitácora) viven en la base de
datos; NestJS y React son capas delgadas.

## Requisitos

| Herramienta | Versión usada |
|---|---|
| Node.js | 20 LTS (20.20.0) |
| npm | 10.8 |
| Docker Desktop / Compose | 29.8 / v5.6 |
| PostgreSQL (contenedor) | 16 (alpine) |
| SO de desarrollo | macOS 26.6 (Apple Silicon) |

No hace falta `psql` local: los scripts usan `docker exec`.

## Cómo levantar (desarrollo)

```bash
cp .env.example .env      # y cambia las contraseñas
npm install
npm run db:up             # PostgreSQL 16 en Docker
npm run db:reset          # crea roles y bases, migra y carga seeds
npm run dev               # API en :3000 y web en :5173
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run db:up` / `db:down` | Levanta / detiene PostgreSQL |
| `npm run db:migrate` | Aplica migraciones pendientes (`db/migrations/*.sql`) |
| `npm run db:reset` | Drop + bootstrap + migraciones + seeds |
| `npm run db:sintetico -- --unidades 100000` | Genera datos sintéticos |
| `npm run dev` | API + web en paralelo |
| `npm test` | Pruebas (Jest contra `banco_test`) |
| `npm run lint` | ESLint en api y web |
| `npm run test:evidencia` | Corre las pruebas y escribe `docs/evidencias/pruebas.md` y `resultados-*.md` |
| `npm run benchmark` | Benchmark de índices con ≥100k unidades → `docs/evidencias/benchmark.md` |
| `npm run db:backup -- [base]` / `npm run db:restore -- <dump> [base]` | Respaldo `pg_dump -Fc` / restauración cronometrada |
| `npm run prueba:restauracion` | Respaldo → falla simulada → restauración → `docs/evidencias/restauracion.md` |

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
