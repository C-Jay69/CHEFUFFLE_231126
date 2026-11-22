# Database migrations & data safety

The schema is managed with **versioned Prisma migrations**. Deployed
environments run `prisma migrate deploy`; they never run `prisma db push`.

## Layout

```
prisma/migrations/
  20261122101500_baseline/
    migration.sql          # empty database -> current schema
  migration_lock.toml      # provider = "postgresql"
```

## Everyday commands

Run these from `shift-happens/` with `DATABASE_URL` pointing at the target
database (the Prisma URL's `?schema=` selects the Postgres schema):

| Command | What it does |
| --- | --- |
| `pnpm db:migrate` | Apply all pending migrations (`prisma migrate deploy`). Safe for production. |
| `pnpm db:migrate:dev` | Create/apply a migration during development (`prisma migrate dev`). Needs a shadow database. |
| `pnpm db:migrate:status` | Show applied and pending migrations. |
| `pnpm db:reset` | Drop, re-apply migrations and reseed the demo (explicit `--demo` opt-in built in). |
| `pnpm db:push` | Legacy ad-hoc sync. **Do not use on deployed databases.** |

Create a migration after editing `schema.prisma`:

```bash
DATABASE_URL="postgresql://postgres@127.0.0.1:5433/shift_happens?schema=public" \
  pnpm db:migrate:dev --name add_my_change
```

Commit the generated `prisma/migrations/<timestamp>_<name>/migration.sql` and
`migration_lock.toml`. Do not edit a migration that has already been applied.

## Deploying

`deploy/docker-compose.yml` runs `prisma migrate deploy` in the API container
during startup, after Postgres reports healthy and before the API starts.
`deploy/Dockerfile.api` ships the migrations because the build context is
copied into the runtime image.

For a non-Docker install:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm --filter @shift-happens/api start
```

## Baselining a database that was created with `db push`

An existing single-node install already has the tables but no migration
history. **Back it up first**, then mark the baseline as applied without
re-running its SQL:

```bash
bash scripts/db-backup.sh

DATABASE_URL="postgresql://user:pass@host:5432/chefuffle" \
  pnpm --filter @shift-happens/db exec prisma migrate resolve \
  --applied 20261122101500_baseline

DATABASE_URL="postgresql://user:pass@host:5432/chefuffle" \
  pnpm db:migrate:status
```

`migrate resolve --applied` records the baseline in `_prisma_migrations`
only. Verify the live schema still matches the baseline before deploying
further migrations:

```bash
DATABASE_URL="..." pnpm --filter @shift-happens/db exec prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel packages/db/prisma/schema.prisma \
  --exit-code
```

A zero exit status means the database matches the datamodel. If it reports
drift, reconcile it manually before continuing.

## Backups and restore

See `scripts/README.md`. Back up before any migration or restore:

```bash
pnpm db:backup
pnpm db:restore backups/chefuffle-<timestamp>.dump.gz --target postgresql://...
```

## PIN backfill (legacy `pin` -> `pinHash`)

New writes store only `pinHash`. To hash any remaining plaintext `pin` rows
and clear the legacy column:

```bash
pnpm db:backfill:pins            # apply
pnpm db:backfill:pins -- --dry-run
```

The backfill is idempotent and never prints PINs.

## Demo seed safety

`pnpm db:seed` **wipes all restaurant data**. It refuses to run unless
`SEED_DEMO=1` or `--demo` is passed:

```bash
SEED_DEMO=1 pnpm db:seed
# or
pnpm --filter @shift-happens/db exec tsx src/seed.ts --demo
```

`scripts/check-seed-guard.sh` verifies the refusal in CI without touching the
database.
