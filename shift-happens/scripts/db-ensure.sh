#!/usr/bin/env bash
# Ensures PostgreSQL is reachable before `pnpm dev` launches the API.
# If nothing is listening on the configured port it starts the repo-local
# cluster via db-up.sh; an already-running server (local or Docker) is reused.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGPORT:-5433}"

# Read the port from DATABASE_URL when .env provides one.
if [ -f "$ROOT/.env" ]; then
  URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"
  if [ -n "${URL:-}" ]; then
    HOSTPORT="${URL#*@}"
    HOSTPORT="${HOSTPORT%%/*}"
    case "$HOSTPORT" in
      *:*) PORT="${HOSTPORT##*:}" ;;
    esac
  fi
fi

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$PORT") >/dev/null 2>&1
}

if port_open; then
  echo "→ PostgreSQL reachable on :$PORT"
  exit 0
fi

echo "→ Nothing listening on :$PORT — starting the local PostgreSQL cluster"
if ! bash "$ROOT/scripts/db-up.sh"; then
  echo "✗ Could not start PostgreSQL on :$PORT." >&2
  echo "  Start it with 'pnpm db:up', or point DATABASE_URL at your own server." >&2
  exit 1
fi

# Give the server a moment to accept connections.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if port_open; then
    echo "✓ PostgreSQL ready on :$PORT"
    exit 0
  fi
  sleep 1
done

echo "✗ PostgreSQL did not start listening on :$PORT. See .dev/pg.log." >&2
exit 1
