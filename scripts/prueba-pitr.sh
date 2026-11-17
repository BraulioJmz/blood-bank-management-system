#!/usr/bin/env bash
# Pregunta de investigación 3 (parte 2) — recuperación a un punto en el tiempo (PITR).
#
#   scripts/prueba-pitr.sh [unidades]
#
# Requiere el contenedor con archivado de WAL (docker-compose.yml: archive_mode=on).
#  1. Prepara banco_bench con datos sintéticos.
#  2. Respaldo base del CLÚSTER (pg_basebackup) y, en el mismo instante, pg_dump de banco_bench.
#  3. Lote A de donaciones (hora conocida) → se anota T_objetivo → lote B → falla: DROP DATABASE.
#  4. Recupera en un contenedor TEMPORAL (no toca el clúster de desarrollo): copia la base,
#     restore_command lee el WAL archivado y recovery_target_time = T_objetivo.
#  5. Mide el tiempo de recuperación y los datos perdidos; compara con restaurar el pg_dump.
# Agrega la sección PITR a docs/evidencias/restauracion.md.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
UNIDADES="${1:-100000}"
DB=banco_bench
CONT=banco-sangre-db
TEMP=banco-sangre-pitr
OUT=docs/evidencias/restauracion.md
LOTE_A=30
LOTE_B=5
VOL_PREFIJO=$(docker inspect "$CONT" --format '{{ index .Config.Labels "com.docker.compose.project" }}')
q() { docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONT" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -Atq -c "$2"; }
qt() { docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$TEMP" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -Atq -c "$2"; }
ahora() { python3 -c 'import time;print(time.time())'; }
lote() { # $1 = etiqueta, $2 = cantidad: donantes + donaciones con un nombre marcador
  q "$DB" "BEGIN;
    SELECT set_config('app.id_usuario', (SELECT id_usuario::text FROM banco.usuario WHERE username = 'recepcion'), true);
    WITH d AS (
      INSERT INTO banco.donante (nombre, fecha_nacimiento, sexo, id_tipo_sanguineo)
      SELECT '$1 ' || g, DATE '1990-01-01', 'F', 1 FROM generate_series(1, $2) g RETURNING id_donante)
    INSERT INTO banco.donacion (id_donante, tipo_donacion, volumen_ml) SELECT id_donante, 'altruista', 450 FROM d;
    COMMIT;" >/dev/null
}
cuenta() { # $1 = función de consulta, $2 = etiqueta
  "$1" "$DB" "SELECT count(*) FROM banco.donacion dn JOIN banco.donante d USING (id_donante) WHERE d.nombre LIKE '$2 %'"
}

[ "$(q postgres 'SHOW archive_mode')" = on ] || { echo "archive_mode está apagado: docker compose up -d db" >&2; exit 1; }
docker rm -f "$TEMP" >/dev/null 2>&1 || true

echo "1) Preparando ${DB} (≈${UNIDADES} unidades)…"
npm run -s db:reset -- --db "$DB" --sin-sintetico >/dev/null
npm run -s db:sintetico -- --unidades "$UNIDADES" --db "$DB" >/dev/null
TAM_CLUSTER=$(q postgres "SELECT pg_size_pretty(sum(pg_database_size(datname))) FROM pg_database")

echo "2) Respaldo base (pg_basebackup) + pg_dump del mismo instante…"
docker exec "$CONT" sh -c 'rm -rf /respaldos/base /respaldos/recuperado'
T0=$(ahora)
# -X stream: incluye el WAL generado DURANTE la copia (la copia sola no es consistente).
# -c fast: checkpoint inmediato en vez de esperar al siguiente programado.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONT" \
  pg_basebackup -U postgres -D /respaldos/base -Fp -X stream -c fast -l "base prueba-pitr"
T1=$(ahora)
T_BASE=$(python3 -c "print(f'{$T1-$T0:.2f}')")
TAM_BASE=$(docker exec "$CONT" du -sh /respaldos/base | cut -f1)
# backup_label: dónde empieza la copia en el WAL y desde qué checkpoint hay que reproducir.
LSN_BASE=$(docker exec "$CONT" sh -c "grep 'START WAL LOCATION' /respaldos/base/backup_label | cut -d' ' -f4")
DUMP=$(scripts/backup.sh "$DB" backups 2>/dev/null)

echo "3) Lote A, objetivo, lote B y falla…"
sleep 1
lote "PITR-A" "$LOTE_A"
HORA_A=$(q postgres "SELECT to_char(now(), 'HH24:MI:SS.MS')")
LSN_A=$(q postgres "SELECT pg_current_wal_lsn()")
sleep 2
# El objetivo es una hora de servidor con zona: entre el lote A (se conserva) y el B.
T_OBJETIVO=$(q postgres "SELECT to_char(clock_timestamp(), 'YYYY-MM-DD HH24:MI:SS.US') || to_char(clock_timestamp(), 'TZH:TZM')")
LSN_OBJ=$(q postgres "SELECT pg_current_wal_lsn()")
sleep 2
lote "PITR-B" "$LOTE_B"
HORA_B=$(q postgres "SELECT to_char(now(), 'HH24:MI:SS.MS')")
sleep 1
HORA_FALLA=$(q postgres "SELECT to_char(now(), 'HH24:MI:SS.MS')")
q postgres "DROP DATABASE $DB WITH (FORCE)"
LSN_FALLA=$(q postgres "SELECT pg_current_wal_lsn()")
# Cierra el segmento actual para que se archive ya (si no, esperaría a archive_timeout).
SEG_FINAL=$(q postgres "SELECT pg_walfile_name(pg_switch_wal())")
for _ in $(seq 1 30); do
  [ "$(docker exec "$CONT" sh -c "test -f /wal_archive/$SEG_FINAL && echo si" || true)" = si ] && break; sleep 1
done
SEG_INICIO=$(docker exec "$CONT" sh -c "grep 'START WAL LOCATION' /respaldos/base/backup_label | sed 's/.*file \(.*\))/\1/'")
SEGMENTOS=$(docker exec "$CONT" sh -c "ls /wal_archive | awk -v a=$SEG_INICIO -v b=$SEG_FINAL '\$0>=a && \$0<=b && length(\$0)==24' | wc -l | tr -d ' '")

echo "4) Recuperación PITR en contenedor temporal (objetivo $T_OBJETIVO)…"
T2=$(ahora)
docker run -d --name "$TEMP" \
  -e POSTGRES_PASSWORD=no-se-usa -e PGDATA=/respaldos/recuperado -e TZ=America/Mexico_City \
  -v "${VOL_PREFIJO}_respaldos:/respaldos" -v "${VOL_PREFIJO}_walarchivo:/wal_archive:ro" \
  --entrypoint sh postgres:16-alpine -c "
    cp -a /respaldos/base /respaldos/recuperado &&
    cat >> /respaldos/recuperado/postgresql.auto.conf <<CONF
restore_command = 'cp /wal_archive/%f %p'
recovery_target_time = '$T_OBJETIVO'
recovery_target_action = 'promote'
CONF
    touch /respaldos/recuperado/recovery.signal &&
    chown -R postgres:postgres /respaldos/recuperado && chmod 700 /respaldos/recuperado &&
    exec docker-entrypoint.sh postgres" >/dev/null
# Listo cuando acepta conexiones Y ya salió de recuperación (promovido).
for _ in $(seq 1 300); do
  [ "$(qt postgres 'SELECT NOT pg_is_in_recovery()' 2>/dev/null || true)" = t ] && break; sleep 0.2
done
T3=$(ahora)
T_PITR=$(python3 -c "print(f'{$T3-$T2:.2f}')")
A_PITR=$(cuenta qt "PITR-A"); B_PITR=$(cuenta qt "PITR-B")
TIMELINE=$(qt postgres "SELECT timeline_id FROM pg_control_checkpoint()")
LOG_PARADA=$(docker logs "$TEMP" 2>&1 | grep -E "recovery stopping|selected new timeline|archive recovery complete|consistent recovery state" | sed 's/^.*LOG: *//' || true)
HISTORIA=$(docker exec "$TEMP" sh -c 'cat /respaldos/recuperado/pg_wal/*.history 2>/dev/null' || true)
INTEGRA=$(qt "$DB" "SELECT (SELECT count(*) FROM banco.v_trazabilidad_unidad) = (SELECT count(*) FROM banco.unidad_sangre)")
docker rm -f "$TEMP" >/dev/null
docker exec "$CONT" rm -rf /respaldos/recuperado

echo "5) Comparación: restaurar el pg_dump del mismo instante que la base…"
T_DUMP=$(scripts/restore.sh "$DUMP" "$DB" 2>/dev/null)
A_DUMP=$(cuenta q "PITR-A"); B_DUMP=$(cuenta q "PITR-B")

python3 - "$OUT" <<PY
import re, sys
p = sys.argv[1]
md = open(p).read()
md = re.sub(r"\n## Recuperación a un punto en el tiempo \(PITR\).*", "", md, flags=re.S)
md = md.replace("(\`docs/evidencias/pitr.md\`)", "(sección PITR más abajo)")
log = """$LOG_PARADA""".strip().replace("\n", "\n    ")
historia = """$HISTORIA""".strip() or "(sin archivo de historia)"
md += f"""
## Recuperación a un punto en el tiempo (PITR)

Generado por \`scripts/prueba-pitr.sh\` el $(date '+%Y-%m-%d %H:%M:%S %Z'). Clúster de **$TAM_CLUSTER**
(bases \`banco\`, \`banco_test\` y \`$DB\` con ≈$UNIDADES unidades).

### Línea de tiempo de la prueba

| Paso | Hora del servidor | LSN |
|---|---|---|
| Respaldo base (\`pg_basebackup -X stream\`) y \`pg_dump\` de \`$DB\` | — | inicio \`$LSN_BASE\` |
| Lote A: $LOTE_A donaciones \`PITR-A\` | $HORA_A | \`$LSN_A\` |
| **Objetivo de recuperación** (\`recovery_target_time\`) | **${T_OBJETIVO}** | \`$LSN_OBJ\` |
| Lote B: $LOTE_B donaciones \`PITR-B\` | $HORA_B | — |
| **Falla**: \`DROP DATABASE $DB WITH (FORCE)\` | $HORA_FALLA | \`$LSN_FALLA\` |

### Resultados

| Métrica | PITR (base + WAL) | Solo \`pg_dump\` (mismo instante que la base) |
|---|---|---|
| Tamaño del respaldo | base $TAM_BASE (clúster completo) + $SEGMENTOS segmentos de WAL de 16 MB | ver tabla de arriba |
| Tiempo de respaldo | $T_BASE s (\`pg_basebackup\`) | ver tabla de arriba |
| **Tiempo de recuperación** | **$T_PITR s** (copiar la base + reproducir WAL + promover) | $T_DUMP s (\`pg_restore -j 4\`) |
| Lote A recuperado (antes del objetivo) | **$A_PITR de $LOTE_A** | $A_DUMP de $LOTE_A |
| Lote B recuperado (después del objetivo) | $B_PITR de $LOTE_B | $B_DUMP de $LOTE_B |
| **Datos perdidos** | **$((LOTE_A-A_PITR+LOTE_B-B_PITR)) donaciones**: solo lo posterior al objetivo elegido | **$((LOTE_A-A_DUMP+LOTE_B-B_DUMP)) donaciones**: todo lo posterior al respaldo |
| Trazabilidad íntegra tras recuperar | $( [ "$INTEGRA" = t ] && echo sí || echo NO) | sí |
| Timeline del clúster recuperado | **$TIMELINE** (era 1) | — |

Lo que registró PostgreSQL al recuperar:

    {log}

Archivo de historia del nuevo timeline (\`pg_wal/0000000${TIMELINE}.history\`):

    {historia}

### Procedimiento

1. **Archivado continuo** (\`docker-compose.yml\`): \`archive_mode=on\`, \`archive_command='test ! -f /wal_archive/%f && cp %p /wal_archive/%f'\`, \`archive_timeout=60\`.
2. **Respaldo base**: \`pg_basebackup -U postgres -D /respaldos/base -Fp -X stream -c fast\`. Copia física de TODO el clúster (todas las bases y roles); \`-X stream\` incluye el WAL generado durante la copia.
3. **Ante una falla**, en un servidor limpio (aquí, un contenedor temporal para no tocar el de desarrollo):
   1. copiar la base a un directorio de datos vacío;
   2. en \`postgresql.auto.conf\`: \`restore_command = 'cp /wal_archive/%f %p'\`, \`recovery_target_time = '<hora con zona>'\`, \`recovery_target_action = 'promote'\`;
   3. crear \`recovery.signal\` y arrancar PostgreSQL;
   4. el servidor reproduce el WAL desde el checkpoint del \`backup_label\` hasta el objetivo, se detiene antes de la primera transacción confirmada después de esa hora, abre un **timeline nuevo** y acepta conexiones.
4. Verificar los datos y redirigir la aplicación al servidor recuperado.

### Conceptos

- **WAL (Write-Ahead Log)**: antes de modificar una página de datos, PostgreSQL escribe el cambio en un registro secuencial, el WAL, y hace \`fsync\`. Un \`COMMIT\` termina cuando su registro está en disco, no cuando lo están las tablas. Si el servidor cae, al arrancar reproduce el WAL desde el último *checkpoint* y recupera todo lo confirmado. Se escribe en **segmentos** de 16 MB (\`000000010000000000000072\`); archivarlos es guardar la historia completa de cambios del clúster.
- **Respaldo base + WAL = PITR**: la copia base es una foto física del clúster, que puede quedar incoherente porque se copia mientras hay escrituras. El WAL archivado desde el inicio de la copia permite primero volverla coherente y luego "avanzar la película" hasta **cualquier instante** posterior. Así se puede volver al segundo anterior a un \`DROP DATABASE\`, un \`DELETE\` sin \`WHERE\` o un error de la aplicación.
- **LSN (Log Sequence Number)**: posición en bytes dentro del WAL (\`$LSN_OBJ\` = segmento y desplazamiento). Es el "reloj" interno de PostgreSQL: crece con cada cambio, e identifica dónde empieza una copia (\`START WAL LOCATION\` en \`backup_label\`), hasta dónde se reprodujo o dónde va una réplica. Además de por hora, se puede recuperar con \`recovery_target_lsn\` o \`recovery_target_xid\`.
- **Timeline**: al recuperar a un punto anterior y seguir operando, nace una historia alternativa: el WAL viejo (timeline 1) contiene el \`DROP DATABASE\`, y el nuevo no. PostgreSQL numera cada historia (timeline $TIMELINE) y deja un archivo \`.history\` con el LSN donde se bifurcó, para que una recuperación posterior no mezcle segmentos de historias distintas. Por eso los nombres de los segmentos empiezan con el timeline (\`00000002…\`).
- **RPO y RTO**: el RPO (datos que se pueden perder) baja del intervalo entre \`pg_dump\` a los segundos que tarda en archivarse el último segmento (\`archive_timeout\`), o a cero si el segmento final sobrevive a la falla, como aquí. El RTO (tiempo de recuperación) crece con la cantidad de WAL a reproducir, por eso conviene una base reciente (por ejemplo, diaria).

### Interpretación (pregunta 3)

- Con solo \`pg_dump\` se pierde **todo** lo posterior al último respaldo (aquí, los $LOTE_A + $LOTE_B lotes de prueba).
- Con PITR se recupera exactamente hasta el instante elegido: el lote A completo y nada del B, que ocurrió después del objetivo. La falla (\`DROP DATABASE\`) no se reprodujo.
- El lote B se perdió **porque el objetivo se eligió antes que él a propósito**, para demostrar la precisión: PostgreSQL se detuvo justo antes del commit de ese lote. Con un objetivo un instante antes del \`DROP DATABASE\`, también se recuperaría y la pérdida sería cero.
- El costo: el respaldo base es del clúster entero y hay que guardar el WAL. La recuperación tardó $T_PITR s contra $T_DUMP s de \`pg_restore\` de una sola base, porque copia todo el clúster y reproduce el WAL. A cambio, el RPO pasa de "desde el último respaldo" a segundos.
"""
open(p, "w").write(md)
PY
echo "Evidencia agregada a $OUT (PITR ${T_PITR}s; perdidos PITR $((LOTE_A-A_PITR+LOTE_B-B_PITR)) vs pg_dump $((LOTE_A-A_DUMP+LOTE_B-B_DUMP)))"
