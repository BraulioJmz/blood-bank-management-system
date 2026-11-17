# Prueba de respaldo y restauración (generado por scripts/prueba-restauracion.sh)

- Fecha: 2026-11-16 22:41:17 CST
- Servidor: postgres (PostgreSQL) 16.16 en Docker (Darwin arm64)
- BD: `banco_bench` con ≈100000 unidades sintéticas; tamaño en disco **89 MB**

## Resultados

| Métrica | Valor |
|---|---|
| Tipo de respaldo | Lógico, `pg_dump -Fc -Z 6` (+ `pg_dumpall --roles-only`) |
| Tamaño del respaldo | 6.85 MB |
| Tiempo de respaldo | **1.47 s** |
| Falla simulada | `DROP DATABASE banco_bench WITH (FORCE)` a las 22:41:15 (respaldo a las 22:41:13) |
| Tiempo de restauración (RTO medido) | **1.09 s** (`pg_restore -j 4` + permisos + ANALYZE) |
| Datos perdidos (RPO) | **25 donaciones** registradas después del respaldo (todo lo posterior al último `pg_dump`) |
| Trazabilidad íntegra tras restaurar | sí (v_trazabilidad_unidad = unidad_sangre) |
| La app puede operar (app_login → rol_inventario) | sí |

## Conteo por tabla

| Tabla | Al respaldar | Al fallar | Restaurado | ¿Igual al respaldo? | Perdido |
|---|---|---|---|---|---|
| asignacion | 48,651 | 48,651 | 48,651 | ✅ | 0 |
| bitacora_auditoria | 10 | 185 | 10 | ✅ | 175 |
| donacion | 37,038 | 37,063 | 37,038 | ✅ | 25 |
| donante | 18,519 | 18,544 | 18,519 | ✅ | 25 |
| movimiento_inventario | 199,169 | 199,169 | 199,169 | ✅ | 0 |
| prueba_tamizaje | 185,190 | 185,315 | 185,190 | ✅ | 125 |
| solicitud | 48,667 | 48,667 | 48,667 | ✅ | 0 |
| unidad_sangre | 99,815 | 99,815 | 99,815 | ✅ | 0 |

## Interpretación

- El respaldo lógico recupera **exactamente** el estado del instante del respaldo (snapshot consistente de `pg_dump`); las FK, CHECK, triggers, RLS, GRANT y vistas se restauran con los datos.
- Lo perdido es todo lo escrito entre el último respaldo y la falla: el RPO de esta política es igual al intervalo entre respaldos. Con un respaldo diario se podría perder hasta un día de donaciones.
- Para reducir el RPO a segundos se usa archivado continuo de WAL + respaldo base + PITR (sección PITR más abajo).
- Las propiedades de la BD (`search_path`, zona horaria, `CONNECT`) y los roles no viajan en `pg_dump`; `restore.sh` las reaplica y `pg_dumpall --roles-only` respalda los roles.

## Recuperación a un punto en el tiempo (PITR)

Generado por `scripts/prueba-pitr.sh` el 2026-11-16 22:42:47 CST. Clúster de **223 MB**
(bases `banco`, `banco_test` y `banco_bench` con ≈100000 unidades).

### Línea de tiempo de la prueba

| Paso | Hora del servidor | LSN |
|---|---|---|
| Respaldo base (`pg_basebackup -X stream`) y `pg_dump` de `banco_bench` | — | inicio `0/B2000028` |
| Lote A: 30 donaciones `PITR-A` | 22:42:39.410 | `0/B3037A00` |
| **Objetivo de recuperación** (`recovery_target_time`) | **2026-11-16 22:42:41.534596-06:00** | `0/B3037A00` |
| Lote B: 5 donaciones `PITR-B` | 22:42:43.753 | — |
| **Falla**: `DROP DATABASE banco_bench WITH (FORCE)` | 22:42:44.851 | `0/B3047E10` |

### Resultados

| Métrica | PITR (base + WAL) | Solo `pg_dump` (mismo instante que la base) |
|---|---|---|
| Tamaño del respaldo | base 239.5M (clúster completo) + 2 segmentos de WAL de 16 MB | ver tabla de arriba |
| Tiempo de respaldo | 0.64 s (`pg_basebackup`) | ver tabla de arriba |
| **Tiempo de recuperación** | **0.92 s** (copiar la base + reproducir WAL + promover) | 0.96 s (`pg_restore -j 4`) |
| Lote A recuperado (antes del objetivo) | **30 de 30** | 0 de 30 |
| Lote B recuperado (después del objetivo) | 0 de 5 | 0 de 5 |
| **Datos perdidos** | **5 donaciones**: solo lo posterior al objetivo elegido | **35 donaciones**: todo lo posterior al respaldo |
| Trazabilidad íntegra tras recuperar | sí | sí |
| Timeline del clúster recuperado | **2** (era 1) | — |

Lo que registró PostgreSQL al recuperar:

    consistent recovery state reached at 0/B2000100
    recovery stopping before commit of transaction 17779, time 2026-11-16 22:42:43.689801-06
    selected new timeline ID: 2
    archive recovery complete

Archivo de historia del nuevo timeline (`pg_wal/00000002.history`):

    1	0/B303D670	before 2026-11-16 22:42:43.689801-06

### Procedimiento

1. **Archivado continuo** (`docker-compose.yml`): `archive_mode=on`, `archive_command='test ! -f /wal_archive/%f && cp %p /wal_archive/%f'`, `archive_timeout=60`.
2. **Respaldo base**: `pg_basebackup -U postgres -D /respaldos/base -Fp -X stream -c fast`. Copia física de TODO el clúster (todas las bases y roles); `-X stream` incluye el WAL generado durante la copia.
3. **Ante una falla**, en un servidor limpio (aquí, un contenedor temporal para no tocar el de desarrollo):
   1. copiar la base a un directorio de datos vacío;
   2. en `postgresql.auto.conf`: `restore_command = 'cp /wal_archive/%f %p'`, `recovery_target_time = '<hora con zona>'`, `recovery_target_action = 'promote'`;
   3. crear `recovery.signal` y arrancar PostgreSQL;
   4. el servidor reproduce el WAL desde el checkpoint del `backup_label` hasta el objetivo, se detiene antes de la primera transacción confirmada después de esa hora, abre un **timeline nuevo** y acepta conexiones.
4. Verificar los datos y redirigir la aplicación al servidor recuperado.

### Conceptos

- **WAL (Write-Ahead Log)**: antes de modificar una página de datos, PostgreSQL escribe el cambio en un registro secuencial, el WAL, y hace `fsync`. Un `COMMIT` termina cuando su registro está en disco, no cuando lo están las tablas. Si el servidor cae, al arrancar reproduce el WAL desde el último *checkpoint* y recupera todo lo confirmado. Se escribe en **segmentos** de 16 MB (`000000010000000000000072`); archivarlos es guardar la historia completa de cambios del clúster.
- **Respaldo base + WAL = PITR**: la copia base es una foto física del clúster, que puede quedar incoherente porque se copia mientras hay escrituras. El WAL archivado desde el inicio de la copia permite primero volverla coherente y luego "avanzar la película" hasta **cualquier instante** posterior. Así se puede volver al segundo anterior a un `DROP DATABASE`, un `DELETE` sin `WHERE` o un error de la aplicación.
- **LSN (Log Sequence Number)**: posición en bytes dentro del WAL (`0/B3037A00` = segmento y desplazamiento). Es el "reloj" interno de PostgreSQL: crece con cada cambio, e identifica dónde empieza una copia (`START WAL LOCATION` en `backup_label`), hasta dónde se reprodujo o dónde va una réplica. Además de por hora, se puede recuperar con `recovery_target_lsn` o `recovery_target_xid`.
- **Timeline**: al recuperar a un punto anterior y seguir operando, nace una historia alternativa: el WAL viejo (timeline 1) contiene el `DROP DATABASE`, y el nuevo no. PostgreSQL numera cada historia (timeline 2) y deja un archivo `.history` con el LSN donde se bifurcó, para que una recuperación posterior no mezcle segmentos de historias distintas. Por eso los nombres de los segmentos empiezan con el timeline (`00000002…`).
- **RPO y RTO**: el RPO (datos que se pueden perder) baja del intervalo entre `pg_dump` a los segundos que tarda en archivarse el último segmento (`archive_timeout`), o a cero si el segmento final sobrevive a la falla, como aquí. El RTO (tiempo de recuperación) crece con la cantidad de WAL a reproducir, por eso conviene una base reciente (por ejemplo, diaria).

### Interpretación (pregunta 3)

- Con solo `pg_dump` se pierde **todo** lo posterior al último respaldo (aquí, los 30 + 5 lotes de prueba).
- Con PITR se recupera exactamente hasta el instante elegido: el lote A completo y nada del B, que ocurrió después del objetivo. La falla (`DROP DATABASE`) no se reprodujo.
- El lote B se perdió **porque el objetivo se eligió antes que él a propósito**, para demostrar la precisión: PostgreSQL se detuvo justo antes del commit de ese lote. Con un objetivo un instante antes del `DROP DATABASE`, también se recuperaría y la pérdida sería cero.
- El costo: el respaldo base es del clúster entero y hay que guardar el WAL. La recuperación tardó 0.92 s contra 0.96 s de `pg_restore` de una sola base, porque copia todo el clúster y reproduce el WAL. A cambio, el RPO pasa de "desde el último respaldo" a segundos.
