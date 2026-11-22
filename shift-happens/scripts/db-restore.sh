#!/usr/bin/env bash
# Restore a backup created by scripts/db-backup.sh into an explicit target DB.
#
#   bash scripts/db-restore.sh backups/chefuffle-20260101T000000Z.dump.gz.gpg \
#     --target postgresql://postgres@127.0.0.1:5433/shift_happens_restore
#
# The target must be supplied explicitly (never inferred). The script asks for
# confirmation unless CONFIRM_RESTORE=1 or --yes is passed.
#
# Environment:
#   RESTORE_DATABASE_URL   default target database when --target is omitted
#   CONFIRM_RESTORE=1      skip the interactive confirmation
#   PG_RESTORE             path to pg_restore (auto-detected)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat >&2 <<'EOF'
Usage: scripts/db-restore.sh <backup-file> [--target <database-url>] [--yes] [--no-clean]

  --target <url>   database to restore into (required; or RESTORE_DATABASE_URL)
  --yes            skip the interactive confirmation (also CONFIRM_RESTORE=1)
  --no-clean       do not drop existing objects before restoring
EOF
  exit 2
}

BACKUP_FILE=""
TARGET="${RESTORE_DATABASE_URL:-}"
ASSUME_YES=0
CLEAN=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      [ "$#" -ge 2 ] || usage
      TARGET="$2"
      shift 2
      ;;
    --yes|-y)
      ASSUME_YES=1
      shift
      ;;
    --no-clean)
      CLEAN=0
      shift
      ;;
    -h|--help)
      usage
      ;;
    -*)
      echo "✗ Unknown option: $1" >&2
      usage
      ;;
    *)
      if [ -n "$BACKUP_FILE" ]; then
        echo "✗ Only one backup file may be restored at a time." >&2
        usage
      fi
      BACKUP_FILE="$1"
      shift
      ;;
  esac
done

if [ -z "$BACKUP_FILE" ]; then
  echo "✗ A backup file is required." >&2
  usage
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "✗ Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [ -z "$TARGET" ]; then
  echo "✗ Refusing to restore without an explicit --target (or RESTORE_DATABASE_URL)." >&2
  usage
fi

# libpq rejects Prisma-only query parameters such as `?schema=public`. The
# dump carries its own schema-qualified objects, so strip them for pg_restore.
case "$TARGET" in
  *\?*)
    TARGET_BASE="${TARGET%%\?*}"
    TARGET_QUERY="${TARGET#*\?}"
    ;;
  *)
    TARGET_BASE="$TARGET"
    TARGET_QUERY=""
    ;;
esac
TARGET_KEPT=""
if [ -n "$TARGET_QUERY" ]; then
  IFS='&' read -r -a TARGET_PARAMS <<< "$TARGET_QUERY"
  for param in "${TARGET_PARAMS[@]}"; do
    case "$param" in
      schema=*|connection_limit=*|pool_timeout=*|pgbouncer=*|socket_timeout=*|statement_cache_size=*)
        ;;
      '')
        ;;
      *)
        TARGET_KEPT="${TARGET_KEPT:+$TARGET_KEPT&}$param"
        ;;
    esac
  done
fi
if [ -n "$TARGET_KEPT" ]; then
  TARGET_URL="$TARGET_BASE?$TARGET_KEPT"
else
  TARGET_URL="$TARGET_BASE"
fi

server_major() {
  local psql_bin
  psql_bin="$(command -v psql 2>/dev/null || true)"
  [ -n "$psql_bin" ] || return 1
  local version_num
  version_num="$("$psql_bin" "$TARGET_URL" -tAc 'show server_version_num' 2>/dev/null | tr -d '[:space:]')"
  case "$version_num" in
    ''|*[!0-9]*) return 1 ;;
  esac
  printf '%s\n' "$((version_num / 10000))"
}

find_pg_restore() {
  if [ -n "${PG_RESTORE:-}" ]; then
    printf '%s\n' "$PG_RESTORE"
    return 0
  fi
  # Match the target server's major version so the archive format is accepted.
  local major
  if major="$(server_major)"; then
    local matched="/usr/lib/postgresql/$major/bin/pg_restore"
    if [ -x "$matched" ]; then
      printf '%s\n' "$matched"
      return 0
    fi
  fi
  if command -v pg_restore >/dev/null 2>&1; then
    command -v pg_restore
    return 0
  fi
  local candidate
  for candidate in /usr/lib/postgresql/*/bin/pg_restore; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

PG_RESTORE_BIN="$(find_pg_restore)" || {
  echo "✗ pg_restore not found. Install PostgreSQL client tools or set PG_RESTORE." >&2
  exit 1
}

# Never echo credentials.
SAFE_TARGET="$(printf '%s' "$TARGET" | sed -E 's#(://[^/@]*:)[^@]*@#\1***@#')"

echo "Backup: $BACKUP_FILE"
echo "Target: $SAFE_TARGET"
echo "This will DROP and recreate objects in the target database."
echo "It cannot be undone."

if [ "$ASSUME_YES" -ne 1 ] && [ "${CONFIRM_RESTORE:-}" != "1" ]; then
  if [ ! -t 0 ]; then
    echo "✗ Refusing to run non-interactively without --yes or CONFIRM_RESTORE=1." >&2
    exit 1
  fi
  printf 'Type RESTORE to continue: '
  read -r ANSWER
  if [ "$ANSWER" != "RESTORE" ]; then
    echo "✗ Restore cancelled." >&2
    exit 1
  fi
fi

case "$BACKUP_FILE" in
  *.gpg)
    command -v gpg >/dev/null 2>&1 || {
      echo "✗ Backup is encrypted but gpg is not installed." >&2
      exit 1
    }
    ;;
esac

RESTORE_ARGS=(--dbname="$TARGET_URL" --no-owner --no-privileges --exit-on-error)
if [ "$CLEAN" -eq 1 ]; then
  RESTORE_ARGS+=(--clean --if-exists)
fi

echo "→ restoring…"
case "$BACKUP_FILE" in
  *.gpg)
    gpg --batch --yes --decrypt "$BACKUP_FILE" \
      | gzip -dc \
      | "$PG_RESTORE_BIN" "${RESTORE_ARGS[@]}"
    ;;
  *.gz)
    gzip -dc "$BACKUP_FILE" | "$PG_RESTORE_BIN" "${RESTORE_ARGS[@]}"
    ;;
  *)
    "$PG_RESTORE_BIN" "${RESTORE_ARGS[@]}" "$BACKUP_FILE"
    ;;
esac

echo "✓ restore complete into $SAFE_TARGET"
