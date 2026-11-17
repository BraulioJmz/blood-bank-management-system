# Evidencia de pruebas

- Fecha: 16/11/2026, 11:04:20 p.m.
- Comando: `npm test` (Jest `--runInBand`) contra PostgreSQL real (`banco_test`), sin mocks de BD
- Entorno: Node v22.23.5, postgres (PostgreSQL) 16.16, darwin arm64
- Resultado: **65/65 pruebas pasan** en 6 suites ✅

Detalle numérico: `resultados-concurrencia.md`, `resultados-reglas.md`, `resultados-seguridad.md`, `resultados-e2e.md`.

## src/common/pg-error.filter.spec.ts

| Prueba | Resultado | ms |
|---|---|---|
| traduce BS001 a 409 con el mensaje del RAISE | ✅ | 1 |
| traduce BS002 a 422 con el mensaje del RAISE | ✅ | 0 |
| traduce BS007 a 404 con el mensaje del RAISE | ✅ | 0 |
| traduce BS015 a 401 con el mensaje del RAISE | ✅ | 1 |
| traduce 42501 (permiso denegado) a 403 sin exponer el detalle técnico | ✅ | 0 |
| traduce 23505 (unique_violation) a 409 | ✅ | 0 |
| respeta las HttpException de Nest | ✅ | 0 |
| un rol fuera de la lista blanca es 403 | ✅ | 0 |
| cualquier otro error es 500 genérico | ✅ | 1 |

## test/bd/concurrencia.spec.ts

| Prueba | Resultado | ms |
|---|---|---|
| 20 operadores asignan la MISMA unidad a la vez: exactamente 1 éxito y 19 rechazos | ✅ | 79 |
| segunda barrera: sin FOR UPDATE, la UK de asignacion.id_unidad rechaza el duplicado (23505) | ✅ | 30 |
| FEFO concurrente con SKIP LOCKED: solicitudes simultáneas reciben unidades distintas sin errores | ✅ | 84 |
| tamizaje concurrente: dos laboratoristas capturan las 2 últimas pruebas a la vez y la unidad se libera (sin write skew) | ✅ | 645 |

## test/bd/conexion.spec.ts

| Prueba | Resultado | ms |
|---|---|---|
| se conecta a banco_test como app_login y encuentra los usuarios demo | ✅ | 8 |

## test/bd/reglas.spec.ts

| Prueba | Resultado | ms |
|---|---|---|
| asignación (sp_asignar_unidad) › acepta una asignación válida y deja salida + solicitud surtida | ✅ | 36 |
| asignación (sp_asignar_unidad) › rechaza una unidad caducada (fecha vencida aunque siga "disponible") | ✅ | 48 |
| asignación (sp_asignar_unidad) › rechaza una unidad marcada como caducada por fn_marcar_caducadas | ✅ | 56 |
| asignación (sp_asignar_unidad) › rechaza una unidad reactiva (descartada por tamizaje) | ✅ | 49 |
| asignación (sp_asignar_unidad) › rechaza una unidad con pruebas pendientes (cuarentena) | ✅ | 63 |
| asignación (sp_asignar_unidad) › rechaza una unidad de otro tipo sanguíneo | ✅ | 46 |
| asignación (sp_asignar_unidad) › rechaza una unidad de otro componente | ✅ | 44 |
| asignación (sp_asignar_unidad) › rechaza una unidad ya asignada | ✅ | 47 |
| asignación (sp_asignar_unidad) › rechaza asignar a una solicitud cancelada | ✅ | 48 |
| asignación (sp_asignar_unidad) › rechaza exceder la cantidad de una solicitud ya surtida | ✅ | 49 |
| asignación (sp_asignar_unidad) › rechaza operar sin usuario en el contexto (BS015) | ✅ | 13 |
| falla segura y otras reglas › una prueba reactiva descarta TODAS las unidades hermanas con movimiento de baja | ✅ | 35 |
| falla segura y otras reglas › no permite cambiar un resultado de tamizaje ya capturado (BS014) | ✅ | 13 |
| falla segura y otras reglas › rechaza donantes fuera de 18–65 años (BS008) | ✅ | 2 |
| falla segura y otras reglas › no permite fraccionar dos veces el mismo componente (BS009) | ✅ | 11 |
| falla segura y otras reglas › la máquina de estados impide retroceder una unidad entregada (BS010) | ✅ | 23 |
| falla segura y otras reglas › FEFO elige primero las unidades que caducan antes | ✅ | 52 |

## test/bd/seguridad.spec.ts

| Prueba | Resultado | ms |
|---|---|---|
| cuenta de conexión app_login › sin SET ROLE no puede leer nada (no hereda privilegios) | ✅ | 1 |
| cuenta de conexión app_login › su contraseña está guardada como verificador SCRAM-SHA-256 | ✅ | 4 |
| cuenta de conexión app_login › withContext rechaza roles fuera de la lista blanca antes de tocar la BD | ✅ | 0 |
| privilegios mínimos por rol › hospital no ve datos personales de donantes | ✅ | 7 |
| privilegios mínimos por rol › nadie lee password_hash | ✅ | 2 |
| privilegios mínimos por rol › inventario no modifica unidades con UPDATE directo (solo vía funciones) | ✅ | 2 |
| privilegios mínimos por rol › recepción no puede asignar ni capturar resultados | ✅ | 3 |
| privilegios mínimos por rol › laboratorio solo puede actualizar la columna resultado | ✅ | 1 |
| RLS por hospital › cada hospital ve solo sus solicitudes | ✅ | 6 |
| RLS por hospital › la vista v_solicitudes_pendientes respeta la RLS (security_invoker) | ✅ | 2 |
| RLS por hospital › un hospital no puede crear solicitudes a nombre de otro (WITH CHECK) | ✅ | 2 |
| RLS por hospital › un hospital no puede cancelar solicitudes de otro | ✅ | 3 |
| bitácora de auditoría › ningún rol de la app puede modificarla o borrarla | ✅ | 4 |
| bitácora de auditoría › ni el dueño puede hacer UPDATE, DELETE o TRUNCATE (trigger BS013) | ✅ | 16 |
| bitácora de auditoría › una asignación hecha por rol_inventario queda con ese rol y ese usuario, no con el dueño | ✅ | 21 |

## test/e2e/flujos.spec.ts

| Prueba | Resultado | ms |
|---|---|---|
| autenticación › rechaza credenciales inválidas y peticiones sin token | ✅ | 31 |
| recepción → laboratorio: falla segura › recepción registra donante y dos donaciones; la BD crea 5 pruebas pendientes por donación | ✅ | 64 |
| recepción → laboratorio: falla segura › un resultado ya capturado no se puede cambiar (BS014) | ✅ | 5 |
| recepción → laboratorio: falla segura › recepción no puede ver el inventario (@Roles) | ✅ | 1 |
| hospital: solicitudes con RLS › hospital norte crea una solicitud; el sur no la ve (RLS → 404) y no aparece en su lista | ✅ | 10 |
| hospital: solicitudes con RLS › un hospital no puede asignar unidades (@Roles) | ✅ | 0 |
| inventario: asignación, concurrencia y entrega › asigna manualmente una unidad compatible; la solicitud queda parcial | ✅ | 7 |
| inventario: asignación, concurrencia y entrega › asignar otra vez la misma unidad se rechaza (BS001) | ✅ | 2 |
| inventario: asignación, concurrencia y entrega › la asignación automática FEFO completa la solicitud | ✅ | 5 |
| inventario: asignación, concurrencia y entrega › entrega la unidad y ya no se puede dar de baja | ✅ | 4 |
| inventario: asignación, concurrencia y entrega › la trazabilidad muestra donación, pruebas y hospital destino | ✅ | 9 |
| admin: bitácora y usuarios › la asignación quedó en la bitácora con el rol y el usuario de inventario (usuario_bd = rol_app) | ✅ | 5 |
| admin: bitácora y usuarios › un usuario de rol hospital sin hospital se rechaza en la BD (BS016) | ✅ | 29 |
| admin: bitácora y usuarios › solo admin consulta la bitácora (@Roles) | ✅ | 1 |
| dashboard › recepcion ve el panel (próximas a caducar: false) | ✅ | 38 |
| dashboard › laboratorio ve el panel (próximas a caducar: true) | ✅ | 13 |
| dashboard › inventario ve el panel (próximas a caducar: true) | ✅ | 13 |
| dashboard › hospital.norte ve el panel (próximas a caducar: false) | ✅ | 12 |
| dashboard › admin ve el panel (próximas a caducar: true) | ✅ | 11 |
