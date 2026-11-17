# Resultados de concurrencia (generado por concurrencia.spec.ts)

Fecha: 2026-11-17T05:04:19.942Z

## Misma unidad, 20 transacciones simultáneas (sp_asignar_unidad, FOR UPDATE)

| Métrica | Valor |
|---|---|
| Transacciones concurrentes | 20 |
| Éxitos | 1 |
| Rechazos | 19 (SQLSTATE: BS001) |
| Filas en asignacion para la unidad | 1 |
| Movimientos de salida | 1 |
| Tiempo total | 39 ms |

## Segunda barrera (UK uk_asignacion_unidad)

Dos transacciones leen 'disponible' sin bloquear e insertan la asignación: la segunda falla con SQLSTATE **23505** (unique_violation).

## Asignación automática FEFO concurrente (FOR UPDATE SKIP LOCKED)

| Métrica | Valor |
|---|---|
| Solicitudes simultáneas | 8 |
| Unidades asignadas | 8 |
| Unidades distintas | 8 |
| Errores | 0 |
| Tiempo total | 9 ms |

## Tamizaje concurrente (bloqueo de la donación en fn_evaluar_tamizaje)

Dos transacciones simultáneas capturan las 2 últimas pruebas: estado final de la unidad = **disponible**.
