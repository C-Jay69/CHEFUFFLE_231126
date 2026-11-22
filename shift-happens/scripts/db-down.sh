#!/usr/bin/env bash
# Stops the repo-local PostgreSQL cluster.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
if "$PGBIN/pg_ctl" -D "$ROOT/.dev/pgdata" status >/dev/null 2>&1; then
  "$PGBIN/pg_ctl" -D "$ROOT/.dev/pgdata" stop
fi
echo "✓ PostgreSQL stopped"
