#!/usr/bin/env bash
# Verify that `db:seed` refuses to run without an explicit demo opt-in.
# This check never touches the database: the guard exits before connecting.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

set +e
OUTPUT="$(SEED_DEMO= pnpm --filter @shift-happens/db exec tsx src/seed.ts 2>&1)"
STATUS=$?
set -e

if [ "$STATUS" -eq 0 ]; then
  echo "✗ seed guard failed: seed exited 0 without SEED_DEMO=1." >&2
  printf '%s\n' "$OUTPUT" >&2
  exit 1
fi

if ! printf '%s' "$OUTPUT" | grep -q 'Refusing to run the demo seed'; then
  echo "✗ seed guard failed: expected a refusal message, got:" >&2
  printf '%s\n' "$OUTPUT" >&2
  exit 1
fi

echo "✓ seed guard refuses to run without SEED_DEMO=1 (exit $STATUS)."
