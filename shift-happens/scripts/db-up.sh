#!/usr/bin/env bash
# Starts the repo-local PostgreSQL 16 cluster on port 5433 (no sudo required).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="$ROOT/.dev/pgdata"
PORT="${PGPORT:-5433}"
DB_NAME="${PGDATABASE:-shift_happens}"

if [ ! -d "$PGDATA" ]; then
  echo "→ initializing local PostgreSQL cluster in .dev/pgdata"
  mkdir -p "$ROOT/.dev"
  "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 >/dev/null
fi

if "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  echo "→ PostgreSQL already running on :$PORT"
else
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$ROOT/.dev/pg.log" -o "-p $PORT -k /tmp" start
fi

if ! "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  echo "→ creating database $DB_NAME"
  "$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres "$DB_NAME"
fi

echo "✓ PostgreSQL ready: postgresql://postgres@127.0.0.1:$PORT/$DB_NAME"
