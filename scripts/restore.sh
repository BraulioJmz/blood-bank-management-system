#!/usr/bin/env bash
# Restaura un respaldo -Fc en una BD (la recrea) y cronometra.
#   scripts/restore.sh <archivo.dump> [base_destino]
#
# pg_restore -j 4 restaura en paralelo: carga datos de varias tablas a la vez y
# construye índices/constraints en paralelo al final (lo más costoso).
# --exit-on-error: cualquier error aborta (una restauración "a medias" no sirve).
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
ARCHIVO="${1:?uso: restore.sh <archivo.dump> [base_destino]}"
DESTINO="${2:-${DB_NAME:-banco}}"
CONT=banco-sangre-db
PSQL=(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONT" psql -U postgres -v ON_ERROR_STOP=1 -q)

INICIO=$(python3 -c 'import time;print(time.time())')
docker cp -q "$ARCHIVO" "$CONT:/tmp/restaurar.dump"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"$DESTINO\" WITH (FORCE)"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE \"$DESTINO\" OWNER ${DB_OWNER_USER:-banco_owner} TEMPLATE template0"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONT" \
  pg_restore -U postgres -d "$DESTINO" -j 4 --exit-on-error /tmp/restaurar.dump
# Las propiedades de la BD (search_path, zona horaria, CONNECT) no viajan en pg_dump.
"${PSQL[@]}" -d postgres -c "REVOKE ALL ON DATABASE \"$DESTINO\" FROM PUBLIC" \
  -c "GRANT CONNECT ON DATABASE \"$DESTINO\" TO ${DB_APP_USER:-app_login}" \
  -c "ALTER DATABASE \"$DESTINO\" SET search_path = banco, public" \
  -c "ALTER DATABASE \"$DESTINO\" SET timezone = 'America/Mexico_City'"
"${PSQL[@]}" -d "$DESTINO" -c "ANALYZE"
docker exec "$CONT" rm -f /tmp/restaurar.dump
FIN=$(python3 -c 'import time;print(time.time())')
python3 -c "print(f'Restaurado $ARCHIVO en $DESTINO en {$FIN-$INICIO:.2f} s')" >&2
python3 -c "print(f'{$FIN-$INICIO:.2f}')"
