# Operational scripts

## Database backup

```bash
DATABASE_URL="postgresql://postgres@127.0.0.1:5433/shift_happens" \
  bash scripts/db-backup.sh
# or, from shift-happens/ (reads DATABASE_URL from .env when unset):
pnpm db:backup
```

The script writes `backups/chefuffle-<UTC timestamp>.dump.gz` using
`pg_dump --format=custom`, then prunes files older than
`BACKUP_RETENTION_DAYS` (default 14; `0` disables pruning).

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Source database. Falls back to `../.env`. |
| `BACKUP_DIR` | Output directory (default `shift-happens/backups`). |
| `BACKUP_RETENTION_DAYS` | Days to keep (default `14`, `0` = keep forever). |
| `BACKUP_GPG_RECIPIENT` | When set, encrypts with `gpg --encrypt --recipient`. The file becomes `.dump.gz.gpg`. |
| `PG_DUMP` | Explicit `pg_dump` path (auto-detected otherwise). |

Backups are created with mode `0600`; the directory is `0700`. Credentials
are never printed.

### Encrypted backups

```bash
BACKUP_GPG_RECIPIENT="ops@example.com" pnpm db:backup
```

The recipient's public key must already be in the `gpg` keyring. To restore:

```bash
gpg --decrypt backup.dump.gz.gpg | gzip -dc | pg_restore -d "$TARGET"
```

or use `db-restore.sh`, which detects the `.gpg` extension.

## Database restore

```bash
bash scripts/db-restore.sh backups/chefuffle-20260101T000000Z.dump.gz \
  --target "postgresql://postgres@127.0.0.1:5433/shift_happens_restore"
```

- `--target` (or `RESTORE_DATABASE_URL`) is **required**; the script never
  infers a destination.
- It prints the target with the password masked, then requires typing
  `RESTORE` unless `--yes` or `CONFIRM_RESTORE=1` is supplied.
- `--no-clean` restores without dropping existing objects. By default it uses
  `pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error`.
- The target **database** must already exist; the script restores objects into
  it. Restore into a scratch database first, verify, then promote.

## Seed guard check

```bash
bash scripts/check-seed-guard.sh
```

Confirms `db:seed` exits non-zero without `SEED_DEMO=1`. It never connects to
the database. CI runs this check.

## Migration commands

See `packages/db/prisma/MIGRATIONS.md`.
