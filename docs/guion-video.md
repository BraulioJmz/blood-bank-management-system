# Guion del video de demostración

Duración objetivo: **10 minutos**. Tres voces (Braulio, Emanuel, Faed); el reparto es una
propuesta y se puede cambiar. Cada bloque dice **qué se ve**, **qué se dice** (idea, no texto
para leer) y **qué preparar**. El hilo conductor: *la base de datos protege al paciente aunque la
aplicación falle*.

## Preparación (antes de grabar)

```bash
npm run db:up && npm run db:reset    # BD limpia con ≈5 000 unidades sintéticas
npm run dev                          # API :3000 y web :5173
```

- Navegador a 1440 px, zoom 100 %, sin otras pestañas. Una ventana de terminal con letra grande.
- Contraseña de todos los usuarios demo: la del README (`Usuarios demo por rol`).
- Tener abiertos en el editor: `db/migrations/003_logica.sql` (en `sp_asignar_unidad`) y
  `apps/api/src/db/contexto.ts`.
- Correr una vez `npm run prueba:pitr` antes de grabar si se quiere mostrar el reporte reciente
  (`docs/evidencias/restauracion.md`).

## Guion

| # | Tiempo | Quién | Qué se ve | Qué se dice |
|---|---|---|---|---|
| 1 | 0:00–0:45 | Braulio | Login y panel como `inventario` (`web-dashboard-inventario.jpg`) | Problema: un banco de sangre no puede entregar una unidad caducada, reactiva o asignada dos veces. Objetivo: que esas reglas vivan en PostgreSQL y no dependan de la interfaz |
| 2 | 0:45–2:00 | Braulio | `docs/arquitectura.md` → diagrama de vista general y secuencia de `withContext`; luego `contexto.ts` | Capas: React → Nest → PostgreSQL. Nest se conecta como `app_login` sin privilegios y en cada petición hace `SET LOCAL ROLE` y fija `app.id_usuario`. Así GRANT, RLS y bitácora ven a la persona real. Sin ORM: SQL parametrizado |
| 3 | 2:00–3:15 | Emanuel | `recepcion`: nuevo donante → registrar donación (toast "se crearon las 5 pruebas") | La BD valida la edad y crea las 5 pruebas obligatorias con un trigger. La unidad todavía no existe |
| 4 | 3:15–4:30 | Emanuel | `laboratorio`: fraccionar (diálogo) → capturar 5 "No reactivo" → toast "Donación liberada" | **Falla segura**: las unidades nacen en cuarentena y solo un trigger las libera cuando las 5 pruebas salen no reactivas. Mostrar también el diálogo de "reactivo": una reactiva descarta todas las unidades hermanas |
| 5 | 4:30–5:45 | Faed | `hospital.norte`: nueva solicitud de emergencia. Luego `hospital.sur`: no la ve | **RLS**: la misma consulta devuelve solo las solicitudes del hospital de la sesión; para el sur, la del norte "no existe" (404) |
| 6 | 5:45–7:00 | Faed | `inventario`: abrir la solicitud → lista FEFO → asignar una → asignar automáticamente (FEFO) → "surtida" | Asignación con `SELECT … FOR UPDATE`; la automática elige las que caducan primero con `SKIP LOCKED`. Mostrar el error BS001 (`web-error-bd-bs001-asignacion.jpg`): si otra sesión ya tomó la unidad, la BD la rechaza y la pantalla se actualiza |
| 7 | 7:00–7:45 | Braulio | Terminal: `cd apps/api && npx jest test/bd/concurrencia.spec.ts` y `docs/evidencias/resultados-concurrencia.md` | Pregunta 1: 20 transacciones simultáneas sobre la misma unidad → 1 éxito y 19 rechazos. La UK es la segunda barrera |
| 8 | 7:45–8:30 | Emanuel | Trazabilidad de la unidad entregada → bitácora como `admin` (`web-bitacora-usuario-bd.jpg`) | Hemovigilancia: de la unidad al donante, sus pruebas, sus hermanas y el hospital. La bitácora la escribe un trigger, guarda rol y usuario reales y nadie puede modificarla |
| 9 | 8:30–9:30 | Faed | `docs/evidencias/benchmark.md` y la tabla de PITR en `restauracion.md` | Pregunta 2: con 100 000 unidades el índice parcial reduce la consulta de disponibilidad 98.7 %. Pregunta 3: con `pg_dump` se pierde todo lo posterior al respaldo; con WAL archivado + `pg_basebackup` se recupera hasta el segundo elegido (se explica timeline y LSN en una frase) |
| 10 | 9:30–10:00 | Braulio | `docs/evidencias/pruebas.md` (65/65) y el panel | Cierre: reglas críticas en la BD, probadas contra PostgreSQL real; qué se aprendió y qué faltaría (cookie `HttpOnly`, particionar la bitácora) |

## Frases clave (para no improvisar los conceptos)

- **Falla segura**: "Si nadie captura las pruebas, la unidad se queda en cuarentena. Lo seguro es el estado por defecto."
- **FOR UPDATE**: "La segunda transacción espera a la primera y luego ve que la unidad ya no está disponible."
- **SKIP LOCKED**: "En la asignación automática, en vez de esperar una unidad bloqueada, se salta a la siguiente."
- **RLS**: "La base de datos agrega el filtro por hospital a cada consulta; la aplicación no puede olvidarlo."
- **SECURITY DEFINER**: "La función corre con permisos del dueño, pero con `search_path` fijo para que nadie la secuestre."
- **WAL / PITR**: "Todo cambio se escribe primero en el WAL; guardando ese registro podemos volver a cualquier segundo."

## Respaldo si algo falla en vivo

Las capturas de `docs/evidencias/capturas/` cubren cada paso del guion; si la demo se traba,
mostrar la captura correspondiente y seguir.
