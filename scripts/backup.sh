#!/usr/bin/env bash
# Respaldo lógico de una BD con pg_dump en formato custom (-Fc).
#   scripts/backup.sh [base] [directorio]     → imprime la ruta del .dump
#
# -Fc: formato binario comprimido; permite restaurar en paralelo (pg_restore -j)
# y de forma selectiva (una tabla, solo esquema…). pg_dump toma un snapshot
# consistente (una transacción REPEATABLE READ): el respaldo refleja un único
# instante aunque la BD siga recibiendo escrituras mientras corre.
# Los ROLES son globales al clúster y pg_dump no los incluye: se respaldan aparte
# con pg_dumpall --roles-only (o se recrean con el bootstrap del proyecto).
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
BASE="${1:-${DB_NAME:-banco}}"
DIR="${2:-backups}"
CONT=banco-sangre-db
SELLO=$(date +%Y%m%d_%H%M%S)
ARCHIVO="$DIR/${BASE}_${SELLO}.dump"
mkdir -p "$DIR"

INICIO=$(python3 -c 'import time;print(time.time())')
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONT" \
  pg_dump -U postgres -d "$BASE" -Fc -Z 6 -f "/tmp/${BASE}.dump"
docker cp -q "$CONT:/tmp/${BASE}.dump" "$ARCHIVO"
docker exec "$CONT" rm -f "/tmp/${BASE}.dump"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONT" \
  pg_dumpall -U postgres --roles-only > "$DIR/roles_${SELLO}.sql"
FIN=$(python3 -c 'import time;print(time.time())')

python3 - "$INICIO" "$FIN" "$ARCHIVO" >&2 <<'PY'
import os, sys
ini, fin, archivo = float(sys.argv[1]), float(sys.argv[2]), sys.argv[3]
print(f"Respaldo: {archivo} ({os.path.getsize(archivo)/1024/1024:.2f} MB) en {fin-ini:.2f} s")
PY
echo "$ARCHIVO"
