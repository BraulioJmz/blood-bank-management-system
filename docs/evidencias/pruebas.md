# Evidencia de pruebas

- Fecha: 16/11/2026, 5:13:13 p.m.
- Comando: `npm test` (Jest `--runInBand`) contra PostgreSQL real (`banco_test`), sin mocks de BD
- Entorno: Node v20.20.0, postgres (PostgreSQL) 16.16, darwin arm64
- Resultado: **38/38 pruebas pasan** en 5 suites ✅

Detalle numérico: `resultados-concurrencia.md`, `resultados-reglas.md`, `resultados-seguridad.md`.

## src/app.controller.spec.ts

| Prueba | Resultado | ms |
|---|---|---|
| root › should return "Hello World!" | ✅ | 4 |

## test/bd/concurrencia.spec.ts

| Prueba | Resultado | ms |
|---|---|---|
| 20 operadores asignan la MISMA unidad a la vez: exactamente 1 éxito y 19 rechazos | ✅ | 70 |
| segunda barrera: sin FOR UPDATE, la UK de asignacion.id_unidad rechaza el duplicado (23505) | ✅ | 29 |
| FEFO concurrente con SKIP LOCKED: solicitudes simultáneas reciben unidades distintas sin errores | ✅ | 86 |
| tamizaje concurrente: dos laboratoristas capturan las 2 últimas pruebas a la vez y la unidad se libera (sin write skew) | ✅ | 656 |

## test/bd/conexion.spec.ts

| Prueba | Resultado | ms |
|---|---|---|
| se conecta a banco_test como app_login y encuentra los usuarios demo | ✅ | 13 |

## test/bd/reglas.spec.ts

| Prueba | Resultado | ms |
|---|---|---|
| asignación (sp_asignar_unidad) › acepta una asignación válida y deja salida + solicitud surtida | ✅ | 41 |
| asignación (sp_asignar_unidad) › rechaza una unidad caducada (fecha vencida aunque siga "disponible") | ✅ | 42 |
| asignación (sp_asignar_unidad) › rechaza una unidad marcada como caducada por fn_marcar_caducadas | ✅ | 48 |
| asignación (sp_asignar_unidad) › rechaza una unidad reactiva (descartada por tamizaje) | ✅ | 41 |
| asignación (sp_asignar_unidad) › rechaza una unidad con pruebas pendientes (cuarentena) | ✅ | 46 |
| asignación (sp_asignar_unidad) › rechaza una unidad de otro tipo sanguíneo | ✅ | 41 |
| asignación (sp_asignar_unidad) › rechaza una unidad de otro componente | ✅ | 37 |
| asignación (sp_asignar_unidad) › rechaza una unidad ya asignada | ✅ | 39 |
| asignación (sp_asignar_unidad) › rechaza asignar a una solicitud cancelada | ✅ | 42 |
| asignación (sp_asignar_unidad) › rechaza exceder la cantidad de una solicitud ya surtida | ✅ | 54 |
| asignación (sp_asignar_unidad) › rechaza operar sin usuario en el contexto (BS015) | ✅ | 11 |
| falla segura y otras reglas › una prueba reactiva descarta TODAS las unidades hermanas con movimiento de baja | ✅ | 32 |
| falla segura y otras reglas › no permite cambiar un resultado de tamizaje ya capturado (BS014) | ✅ | 11 |
| falla segura y otras reglas › rechaza donantes fuera de 18–65 años (BS008) | ✅ | 2 |
| falla segura y otras reglas › no permite fraccionar dos veces el mismo componente (BS009) | ✅ | 9 |
| falla segura y otras reglas › la máquina de estados impide retroceder una unidad entregada (BS010) | ✅ | 18 |
| falla segura y otras reglas › FEFO elige primero las unidades que caducan antes | ✅ | 44 |

## test/bd/seguridad.spec.ts

| Prueba | Resultado | ms |
|---|---|---|
| cuenta de conexión app_login › sin SET ROLE no puede leer nada (no hereda privilegios) | ✅ | 2 |
| cuenta de conexión app_login › su contraseña está guardada como verificador SCRAM-SHA-256 | ✅ | 8 |
| cuenta de conexión app_login › withContext rechaza roles fuera de la lista blanca antes de tocar la BD | ✅ | 0 |
| privilegios mínimos por rol › hospital no ve datos personales de donantes | ✅ | 7 |
| privilegios mínimos por rol › nadie lee password_hash | ✅ | 2 |
| privilegios mínimos por rol › inventario no modifica unidades con UPDATE directo (solo vía funciones) | ✅ | 2 |
| privilegios mínimos por rol › recepción no puede asignar ni capturar resultados | ✅ | 1 |
| privilegios mínimos por rol › laboratorio solo puede actualizar la columna resultado | ✅ | 0 |
| RLS por hospital › cada hospital ve solo sus solicitudes | ✅ | 5 |
| RLS por hospital › la vista v_solicitudes_pendientes respeta la RLS (security_invoker) | ✅ | 2 |
| RLS por hospital › un hospital no puede crear solicitudes a nombre de otro (WITH CHECK) | ✅ | 0 |
| RLS por hospital › un hospital no puede cancelar solicitudes de otro | ✅ | 2 |
| bitácora de auditoría › ningún rol de la app puede modificarla o borrarla | ✅ | 3 |
| bitácora de auditoría › ni el dueño puede hacer UPDATE, DELETE o TRUNCATE (trigger BS013) | ✅ | 16 |
| bitácora de auditoría › una asignación hecha por rol_inventario queda con ese rol y ese usuario, no con el dueño | ✅ | 15 |
