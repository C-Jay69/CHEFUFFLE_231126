#!/usr/bin/env bash
# Timestamped, compressed PostgreSQL backup with optional GPG encryption.
#
#   DATABASE_URL=postgresql://... bash scripts/db-backup.sh
#   BACKUP_GPG_RECIPIENT=ops@example.com bash scripts/db-backup.sh
#
# Environment:
#   DATABASE_URL             source database (falls back to the root .env)
#   BACKUP_DIR               output directory (default: <repo>/backups)
#   BACKUP_RETENTION_DAYS    delete backups older than this (default: 14, 0 = keep)
#   BACKUP_GPG_RECIPIENT     encrypt with `gpg --recipient <value>` when set
#   PG_DUMP                  path to pg_dump (auto-detected)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-}"

if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | cut -d= -f2-)"
  DATABASE_URL="${DATABASE_URL%\"}"
  DATABASE_URL="${DATABASE_URL#\"}"
  DATABASE_URL="${DATABASE_URL%\'}"
  DATABASE_URL="${DATABASE_URL#\'}"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "✗ DATABASE_URL is not set. Export it or add it to $ROOT/.env." >&2
  exit 1
fi

# libpq rejects Prisma-only query parameters such as `?schema=public`. Keep
# standard libpq parameters (sslmode, connect_timeout, …) and remember the
# Prisma schema so pg_dump can scope the dump to it.
PG_SCHEMA="${BACKUP_SCHEMA:-}"
case "$DATABASE_URL" in
  *\?*)
    PG_BASE="${DATABASE_URL%%\?*}"
    PG_QUERY="${DATABASE_URL#*\?}"
    ;;
  *)
    PG_BASE="$DATABASE_URL"
    PG_QUERY=""
    ;;
esac
PG_KEPT=""
if [ -n "$PG_QUERY" ]; then
  IFS='&' read -r -a PG_PARAMS <<< "$PG_QUERY"
  for param in "${PG_PARAMS[@]}"; do
    case "$param" in
      schema=*)
        if [ -z "$PG_SCHEMA" ]; then
          PG_SCHEMA="${param#schema=}"
        fi
        ;;
      connection_limit=*|pool_timeout=*|pgbouncer=*|socket_timeout=*|statement_cache_size=*)
        ;;
      '')
        ;;
      *)
        PG_KEPT="${PG_KEPT:+$PG_KEPT&}$param"
        ;;
    esac
  done
fi
if [ -n "$PG_KEPT" ]; then
  PG_URL="$PG_BASE?$PG_KEPT"
else
  PG_URL="$PG_BASE"
fi

server_major() {
  local psql_bin
  psql_bin="$(command -v psql 2>/dev/null || true)"
  [ -n "$psql_bin" ] || return 1
  local version_num
  version_num="$("$psql_bin" "$PG_URL" -tAc 'show server_version_num' 2>/dev/null | tr -d '[:space:]')"
  case "$version_num" in
    ''|*[!0-9]*) return 1 ;;
  esac
  printf '%s\n' "$((version_num / 10000))"
}

find_pg_binary() {
  local name="$1"
  if [ -n "${PG_DUMP:-}" ] && [ "$name" = "pg_dump" ]; then
    printf '%s\n' "$PG_DUMP"
    return 0
  fi
  # Prefer the client that matches the server major version. A newer client
  # can emit settings/archive formats the older server cannot restore.
  local major
  if major="$(server_major)"; then
    local matched="/usr/lib/postgresql/$major/bin/$name"
    if [ -x "$matched" ]; then
      printf '%s\n' "$matched"
      return 0
    fi
  fi
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi
  local candidate
  for candidate in /usr/lib/postgresql/*/bin/"$name"; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

PG_DUMP_BIN="$(find_pg_binary pg_dump)" || {
  echo "✗ pg_dump not found. Install PostgreSQL client tools or set PG_DUMP." >&2
  exit 1
}

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "✗ BACKUP_RETENTION_DAYS must be a non-negative integer." >&2
  exit 1
fi

if [ -n "$GPG_RECIPIENT" ] && ! command -v gpg >/dev/null 2>&1; then
  echo "✗ BACKUP_GPG_RECIPIENT is set but gpg is not installed." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASENAME="chefuffle-$STAMP.dump.gz"
TARGET="$BACKUP_DIR/$BASENAME"
if [ -n "$GPG_RECIPIENT" ]; then
  TARGET="$TARGET.gpg"
fi

TMP="$TARGET.partial"
cleanup() {
  rm -f "$TMP"
}
trap cleanup EXIT

echo "→ dumping database to $TARGET"
if [ -n "$PG_SCHEMA" ]; then
  echo "  scoped to schema: $PG_SCHEMA"
fi

DUMP_ARGS=(--format=custom --no-owner --no-privileges --dbname="$PG_URL")
if [ -n "$PG_SCHEMA" ]; then
  DUMP_ARGS+=(--schema="$PG_SCHEMA")
fi

if [ -n "$GPG_RECIPIENT" ]; then
  "$PG_DUMP_BIN" "${DUMP_ARGS[@]}" \
    | gzip -9 \
    | gpg --batch --yes --encrypt --recipient "$GPG_RECIPIENT" --output "$TMP"
else
  "$PG_DUMP_BIN" "${DUMP_ARGS[@]}" \
    | gzip -9 > "$TMP"
fi

chmod 600 "$TMP"
mv "$TMP" "$TARGET"
trap - EXIT

SIZE="$(du -h "$TARGET" | cut -f1)"
echo "✓ backup complete: $TARGET ($SIZE)"

if [ "$RETENTION_DAYS" -gt 0 ]; then
  echo "→ pruning backups older than $RETENTION_DAYS day(s) in $BACKUP_DIR"
  find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name 'chefuffle-*.dump.gz' -o -name 'chefuffle-*.dump.gz.gpg' \) \
    -mtime +"$RETENTION_DAYS" -print -delete
fi
