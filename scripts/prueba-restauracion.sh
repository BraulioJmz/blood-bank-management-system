#!/usr/bin/env bash
# Pregunta de investigación 3 — ¿Cuánto tiempo toma recuperar la BD tras una falla
# y cuántos datos se pierden?  (respaldo lógico; PITR en prueba-pitr.sh)
#
#   scripts/prueba-restauracion.sh [unidades]
#
# 1. Prepara banco_bench con datos sintéticos (≥ 100 000 unidades por defecto).
# 2. Cuenta filas por tabla → respaldo pg_dump -Fc (cronometrado).
# 3. Simula actividad DESPUÉS del respaldo (donaciones nuevas).
# 4. Simula la falla: DROP DATABASE.
# 5. Restaura (cronometrado), compara conteos y mide lo perdido.
# Escribe docs/evidencias/restauracion.md.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
UNIDADES="${1:-100000}"
DB=banco_bench
CONT=banco-sangre-db
DIR=backups
OUT=docs/evidencias/restauracion.md
NUEVAS=25
q() { docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONT" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -Atq -c "$2"; }

CONTEO="SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (
  SELECT 'donante' t, count(*) n FROM banco.donante UNION ALL
  SELECT 'donacion', count(*) FROM banco.donacion UNION ALL
  SELECT 'prueba_tamizaje', count(*) FROM banco.prueba_tamizaje UNION ALL
  SELECT 'unidad_sangre', count(*) FROM banco.unidad_sangre UNION ALL
  SELECT 'movimiento_inventario', count(*) FROM banco.movimiento_inventario UNION ALL
  SELECT 'solicitud', count(*) FROM banco.solicitud UNION ALL
  SELECT 'asignacion', count(*) FROM banco.asignacion UNION ALL
  SELECT 'bitacora_auditoria', count(*) FROM banco.bitacora_auditoria) x"

echo "1) Preparando ${DB}…"
npm run -s db:reset -- --db "$DB" >/dev/null
npm run -s db:sintetico -- --unidades "$UNIDADES" --db "$DB" >/dev/null
ANTES=$(q "$DB" "$CONTEO")
TAM_BD=$(q "$DB" "SELECT pg_size_pretty(pg_database_size('$DB'))")

echo "2) Respaldo…"
T0=$(python3 -c 'import time;print(time.time())')
ARCHIVO=$(scripts/backup.sh "$DB" "$DIR" 2>/dev/null)
T1=$(python3 -c 'import time;print(time.time())')
T_BACKUP=$(python3 -c "print(f'{$T1-$T0:.2f}')")
TAM_DUMP=$(python3 -c "import os;print(f'{os.path.getsize(\"$ARCHIVO\")/1024/1024:.2f} MB')")
HORA_BACKUP=$(date '+%H:%M:%S')

echo "3) Actividad posterior al respaldo ($NUEVAS donaciones)…"
sleep 2
q "$DB" "BEGIN;
  SELECT set_config('app.id_usuario', (SELECT id_usuario::text FROM banco.usuario WHERE username = 'recepcion'), true);
  WITH d AS (
    INSERT INTO banco.donante (nombre, fecha_nacimiento, sexo, id_tipo_sanguineo)
    SELECT 'Donante post-respaldo ' || g, DATE '1990-01-01', 'F', 1 FROM generate_series(1, $NUEVAS) g
    RETURNING id_donante)
  INSERT INTO banco.donacion (id_donante, tipo_donacion, volumen_ml)
  SELECT id_donante, 'altruista', 450 FROM d;
  COMMIT;" >/dev/null
DESPUES_ACT=$(q "$DB" "$CONTEO")
HORA_FALLA=$(date '+%H:%M:%S')

echo "4) Falla simulada: DROP DATABASE ${DB}…"
q postgres "DROP DATABASE $DB WITH (FORCE)"

echo "5) Restauración…"
T_RESTORE=$(scripts/restore.sh "$ARCHIVO" "$DB" 2>/dev/null)
RESTAURADO=$(q "$DB" "$CONTEO")
TRAZA=$(q "$DB" "SELECT (SELECT count(*) FROM banco.v_trazabilidad_unidad) = (SELECT count(*) FROM banco.unidad_sangre)")
APP_OK=$(docker exec -e PGPASSWORD="$DB_APP_PASSWORD" "$CONT" psql -h localhost -U "$DB_APP_USER" -d "$DB" -Atq \
  -c "BEGIN; SET LOCAL ROLE rol_inventario; SELECT count(*) > 0 FROM banco.v_disponibilidad; COMMIT;" | tail -1)

python3 - "$OUT" <<PY
import sys
def parse(s): return dict(p.split('=') for p in s.split())
antes, act, rest = parse("""$ANTES"""), parse("""$DESPUES_ACT"""), parse("""$RESTAURADO""")
filas = "\n".join(
    f"| {t} | {int(antes[t]):,} | {int(act[t]):,} | {int(rest[t]):,} | {'✅' if rest[t]==antes[t] else '❌'} | {int(act[t])-int(rest[t]):,} |"
    for t in sorted(antes))
md = f"""# Prueba de respaldo y restauración (generado por scripts/prueba-restauracion.sh)

- Fecha: $(date '+%Y-%m-%d %H:%M:%S %Z')
- Servidor: $(docker exec "$CONT" postgres --version) en Docker ($(uname -sm))
- BD: \`$DB\` con ≈$UNIDADES unidades sintéticas; tamaño en disco **$TAM_BD**

## Resultados

| Métrica | Valor |
|---|---|
| Tipo de respaldo | Lógico, \`pg_dump -Fc -Z 6\` (+ \`pg_dumpall --roles-only\`) |
| Tamaño del respaldo | $TAM_DUMP |
| Tiempo de respaldo | **$T_BACKUP s** |
| Falla simulada | \`DROP DATABASE $DB WITH (FORCE)\` a las $HORA_FALLA (respaldo a las $HORA_BACKUP) |
| Tiempo de restauración (RTO medido) | **$T_RESTORE s** (\`pg_restore -j 4\` + permisos + ANALYZE) |
| Datos perdidos (RPO) | **$NUEVAS donaciones** registradas después del respaldo (todo lo posterior al último \`pg_dump\`) |
| Trazabilidad íntegra tras restaurar | $( [ "$TRAZA" = t ] && echo 'sí (v_trazabilidad_unidad = unidad_sangre)' || echo 'NO') |
| La app puede operar (app_login → rol_inventario) | $( [ "$APP_OK" = t ] && echo 'sí' || echo 'NO') |

## Conteo por tabla

| Tabla | Al respaldar | Al fallar | Restaurado | ¿Igual al respaldo? | Perdido |
|---|---|---|---|---|---|
{filas}

## Interpretación

- El respaldo lógico recupera **exactamente** el estado del instante del respaldo (snapshot consistente de \`pg_dump\`); las FK, CHECK, triggers, RLS, GRANT y vistas se restauran con los datos.
- Lo perdido es todo lo escrito entre el último respaldo y la falla: el RPO de esta política es igual al intervalo entre respaldos. Con un respaldo diario se podría perder hasta un día de donaciones.
- Para reducir el RPO a segundos se usa archivado continuo de WAL + respaldo base + PITR (\`docs/evidencias/pitr.md\`).
- Las propiedades de la BD (\`search_path\`, zona horaria, \`CONNECT\`) y los roles no viajan en \`pg_dump\`; \`restore.sh\` las reaplica y \`pg_dumpall --roles-only\` respalda los roles.
"""
open(sys.argv[1], "w").write(md)
PY
echo "Evidencia escrita en $OUT (respaldo ${T_BACKUP}s, restauración ${T_RESTORE}s)"
