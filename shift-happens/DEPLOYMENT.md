# Whiteout deployment reference

Companion to [SETUP.md](SETUP.md). This page is the reference for the deployment
kit in `deploy/`: services, configuration, networking, operations and recovery.

## Architecture

```
browser (tablet / KDS / phone)
   │  HTTPS + WebSocket
   ▼
Caddy :80/:443
   ├── /            → web   :3010   Next.js (landing, pricing, app)
   ├── /api/*       → api   :4000   Fastify REST
   ├── /socket.io/* → api   :4000   Socket.io (WebSocket upgrade)
   └── /uploads/*   → api   :4000   uploaded floor plans
                          │
                          └── db    :5432   PostgreSQL 16 (pgvector image)
```

- **web** and **api** are built from this repository by `deploy/Dockerfile.web`
  and `deploy/Dockerfile.api`.
- **db** is `pgvector/pgvector:pg16`; the schema is pushed by the API container
  on boot.
- **caddy** terminates TLS and is the only service that should be exposed.

## Runtime API configuration

The browser finds the API at load time from `/config.js`, which reads the
server-side `PUBLIC_API_URL`. That means changing the address does **not** need
a rebuild.

| `PUBLIC_API_URL` | Browser calls | Use when |
| --- | --- | --- |
| `same-origin` | `https://pos.example.com/api/...` | Behind Caddy (the kit's default) |
| `https://api.example.com` | that host | API on a separate domain |
| `http://192.168.1.50:4000` | that host | Direct LAN access without a proxy |
| empty / unset | `NEXT_PUBLIC_API_URL`, else `<hostname>:4000` (a localhost value is remapped to the page host on the LAN) | Local development |

`CORS_ORIGIN` must list the page origins that call the API directly. With
`same-origin` behind Caddy, browser requests are same-origin and CORS is not
involved; set it anyway to the public origin for safety.

After changing `PUBLIC_API_URL`, restart the web container (or `pnpm dev`).
`/setup` shows the resolved API address, database health, realtime status and
menu count — use it on every new device.

## Services and volumes

| Service | Image / build | Port | Volume |
| --- | --- | --- | --- |
| `db` | `pgvector/pgvector:pg16` | internal 5432 | `whiteout-db` |
| `api` | `deploy/Dockerfile.api` | internal 4000 | `whiteout-uploads` → `/app/apps/api/uploads` |
| `web` | `deploy/Dockerfile.web` | internal 3010 | — |
| `caddy` | `caddy:2-alpine` | 80, 443 (TCP+UDP) | `whiteout-caddy-data`, `whiteout-caddy-config` |

The API container starts with:

```sh
pnpm --filter @shift-happens/db exec prisma db push --skip-generate
pnpm --filter @shift-happens/api start
```

`db push` is convenient for a single-node, pre-1.0 install. For a production
change process, switch to Prisma migrations (`prisma migrate deploy`) and remove
`db push` from the command.

## Environment variables (`deploy/.env`)

| Variable | Required | Meaning |
| --- | --- | --- |
| `SITE_ADDRESS` | yes | Caddy site address (`pos.example.com` or `https://whiteout.local`) |
| `PUBLIC_ORIGIN` | yes | Public URL used in CORS, SMS links and Twilio callbacks |
| `PUBLIC_API_URL` | yes | Browser API resolution; `same-origin` with Caddy |
| `POSTGRES_PASSWORD` | yes | Database password; generate a long random string |
| `RESTAURANT_ID` | yes | Tenant id; the seed uses `11111111-1111-4111-8111-111111111111` |
| `TWILIO_*` | no | Voice/SMS; without them messages are persisted as `simulated` |
| `GEMINI_API_KEY` | no | LLM answers; without it Voice AI uses local RAG |
| `SENDGRID_API_KEY` | no | Email notifications |
| `STRIPE_SECRET_KEY` | no | Reserved for payment integration; the app currently simulates payments |
| `REDIS_URL` | no | Socket.io Redis adapter for multi-instance realtime |

`deploy/.env` is ignored by git and Docker. Keep it out of backups of the code
repo; include it in your secret store.

## HTTPS choices

**Public domain (recommended):** keep `deploy/Caddyfile`; point DNS at the
server; forward 80/443. Caddy obtains and renews certificates automatically.
Voice AI webhooks and SMS links require a public HTTPS origin.

**LAN only:** use `deploy/Caddyfile.lan` (`tls internal`). Install Caddy's root
certificate on each tablet:

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./root.crt
```

Then set `SITE_ADDRESS=https://whiteout.local`, `PUBLIC_ORIGIN` to the same, and
add a local DNS/hosts entry for `whiteout.local`.

Plain HTTP is supported for quick tests but the PWA cannot install and offline
caching does not work.

## Operations

```bash
cd shift-happens/deploy

docker compose ps
docker compose logs -f api
docker compose logs -f caddy
docker compose restart web
docker compose down              # data stays in volumes
docker compose up -d --build     # deploy a new version
```

### Seed and reset

```bash
# demo dataset — WIPES existing data
docker compose exec api pnpm --filter @shift-happens/db seed

# schema-only reset (destructive)
docker compose exec api pnpm --filter @shift-happens/db db:reset
```

### Backups

```bash
# database
docker compose exec -T db pg_dump -U whiteout whiteout | gzip > backup-$(date +%F).sql.gz

# uploaded floor plans
docker run --rm -v whiteout_whiteout-uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

Restore:

```bash
gunzip -c backup-2026-11-21.sql.gz | docker compose exec -T db psql -U whiteout whiteout
```

Keep at least seven daily and four weekly backups off the server. Test a restore
before you need one.

### Upgrades

1. Back up.
2. `git pull` in the repo.
3. `docker compose up -d --build`.
4. Watch `docker compose logs -f api` for schema changes or errors.
5. Open `/setup` and walk one check to payment.

## Multi-location

For a handful of sites, the simplest model is **one stack per restaurant** (its
own database, uploads and local network resilience) with a shared login and
reporting layer later. If you centralise:

- move Postgres to a managed service and point each API at it;
- put the web/API behind a load balancer;
- set `REDIS_URL` so Socket.io works across API instances;
- use one `RESTAURANT_ID` per location and the multi-location module for
  roll-up reporting.

## Monitoring

At minimum:

- `GET /api/health` every minute (status, database, uptime) — wire to Uptime
  Kuma, Better Stack or your monitoring of choice;
- Docker restart policies and log rotation;
- disk space on the server (database + uploads + Caddy certificates);
- UPS status if the server exposes it.

The built-in `/setup` page is the human check: API, database, realtime, menu and
a test receipt.

## Payments and Voice AI

The app currently **simulates** card payments. Before selling “Whiteout
Payments”, integrate a processor (Stripe Terminal, Adyen, Moneris, Chase) and
their terminal SDK, then set the merchant-facing rates with that processor's
approval.

Voice AI works with or without Twilio. With Twilio configured, `PUBLIC_ORIGIN`
must be the public HTTPS address so Twilio can reach `/api/voice/inbound` and
`/api/voice/gather`. Without it, use the simulator on `/voice-ai`.

## Security

- Expose only 80/443. Keep 3010/4000 bound to the Docker network.
- Use a strong `POSTGRES_PASSWORD`; rotate it and redeploy if leaked.
- The PIN terminal is a demo gate. Replace the seeded PINs and keep the app on
  the restaurant network; do not publish it to the open internet without real
  authentication.
- Restrict SSH to keys, enable unattended security updates, and keep the host
  firewall closed except 22/80/443.
- Back up and test restores of the database and uploads volume.
- Uploaded files live on the `whiteout-uploads` volume; a failed disk loses
  floor-plan images even if the database is backed up.
