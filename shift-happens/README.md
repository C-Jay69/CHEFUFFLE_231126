# SHIFT HAPPENS! by HYDRAFORGE AI

A production-shaped, full-stack restaurant operations engine built from the
`stitch_shift_happens_design_system` screens. The ten supplied screens are used
verbatim (only their static onclick/script shims are replaced) and wired to a
live Fastify + PostgreSQL + Socket.io backend.

```
stitch_shift_happens_design_system/*/code.html
        │  scripts/gen-screens.mjs  (extract body + Nocturnal Command tokens)
        ▼
apps/web  Next.js 14 App Router  ── REST + WebSocket ──  apps/api  Fastify
        │                                              │
        ├── /pos            POS & Orders                ├── POS engine
        ├── /kds            Kitchen Display System      ├── KDS + stage engine
        ├── /floor-plan     6-stage course matrix       ├── Labor pacing engine
        ├── /reservations   Table CRM + waitlist        ├── Inventory engine
        ├── /inventory      Par levels + auto-PO        ├── Reservations engine
        ├── /scheduling     Roster + live labor         ├── Voice AI (RAG)
        ├── /briefing       Pre-shift cockpit           └── Training engine
        ├── /onboarding     SOPs, drills, certifications
        ├── /architect      Floor plan + menu media studio
        ├── /mobile         Mobile floor manager companion
        ├── /voice-ai       Voice AI command centre (Twilio + Gemini RAG)
        └── /login          PIN terminal + staff roster
                                                        packages/db (Prisma)
                                                        packages/shared (Zod)
```

## Quick start

Prerequisites: Node 20+, pnpm 9+, PostgreSQL 16 binaries. The repository ships a
self-contained local Postgres bootstrap so you do **not** need sudo or Docker.

```bash
cd shift-happens
cp .env.example .env           # already present in this workspace; adjust if needed

pnpm install
pnpm db:up                     # starts a local PG16 cluster on :5433 (trust auth)
pnpm db:push                   # prisma db push + generate
pnpm db:seed                   # realistic 24-table Downtown Flagship dataset
pnpm dev                       # API :4000 + web :3000 in parallel
```

Open <http://localhost:3000/pos>. The root redirects to `/pos`.

If you prefer Docker/Postgres:

```bash
docker compose up -d           # pgvector-enabled Postgres on :5433 + Redis on :6379
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/shift_happens?schema=public" pnpm db:push
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/shift_happens?schema=public" pnpm db:seed
pnpm dev
```

> `pnpm build` (and `next build`) must not run while `pnpm dev` is using the
> same `.next` directory. Restart the dev server after a production build.

### Demo PINs

| PIN | Staff | Role |
| --- | --- | --- |
| `1111` | Chef Marco Vance | General Manager |
| `2222` | Zach Arroyo | Server |
| `3333` | Maya Santos | Bartender |
| `6666` | Priya Kapoor | Host |

`/login` accepts any seeded staff PIN (3-6 digits). The token is stored locally
for the terminal session. This is a demo gate, not a hardened auth boundary.

## What is actually wired

### POS → KDS → Floor Plan → Inventory (atomic flow)

`POST /api/orders` runs a single Prisma transaction:

1. validates menu items and rejects 86'd items with a 409;
2. computes subtotal (`unit price + modifiers`), 8% tax, optional 18% patio
   auto-gratuity;
3. decrements every linked ingredient by `quantity × recipe quantity`;
4. writes a `sale_deduction` row to `stock_transactions`;
5. raises low-stock alerts when `current_stock <= reorder_trigger`;
6. auto-86s menu items whose ingredient reaches zero;
7. moves the table into `starters` if it was `ready`/`seated`;
8. commits, then emits `ORDER_CREATED`, per-station `KDS_NEW_TICKET`,
   `LOW_STOCK_ALERT`, `GLOBAL_86_ITEM_UPDATE`, `INVENTORY_UPDATED`, and a fresh
   `LABOR_PACING_UPDATE`.

KDS `POST /api/kds/bump` updates the order items, then detects that every
"main" item (main-course category or `Signature` tag) is bumped and advances the
table to `entree`. The UI receives `TABLE_STAGE_ADVANCED` and both the Floor Plan
and Mobile Manager update in real time.

### Labor pacing

`labor-engine.ts` sums the hourly rates of active clocked-in shifts and divides
by gross sales in the rolling four-hour trading window. Every 60 seconds (and
after every sale, clock-in, or clock-out) it emits `LABOR_PACING_UPDATE`. The
scheduling, mobile, and briefing screens all subscribe. The seeded dataset
produces a ~19.3% labor ratio against an 18.5% target, i.e. a live pacing alert
with a cut recommendation.

### Voice AI (Twilio + Gemini RAG)

`POST /api/voice/inbound` returns valid TwiML. `POST /api/voice/gather` accepts
Twilio `SpeechResult`, runs the RAG pipeline, and replies. `POST
/api/voice/simulate` exercises the same pipeline without a phone call.

* The live 86 list is injected into every answer.
* `searchKnowledge()` uses a deterministic local 128-dim embedding + cosine
  similarity over `knowledge_base`, with keyword scoring as a tie-breaker. If
  `GEMINI_API_KEY` is set, the answer is generated by Gemini 2.0 Flash with the
  RAG context and live availability tool results in the system instruction.
* Booking intent calls `createReservation()`, which checks live table
  availability, assigns a table, writes the reservation, emits
  `RESERVATION_CREATED`, and sends an SMS (Twilio when configured; otherwise the
  notification is persisted as `simulated`).
* Call logs, transcripts, sentiment, outcome, and duration are stored in
  `call_logs` and shown in `/voice-ai`.

### Inventory

`POST /api/inventory/adjust` supports `newStock` (audit) or `quantityChange`
(waste/receipt/transfer). It recalculates linked menu availability, emits
low-stock and 86 events, and records a transaction. `GET
/api/inventory/purchase-orders` groups low-stock lines by supplier and
`POST /api/inventory/purchase-orders/approve` restocks to par (auto-PO).

### Reservations

CRUD + auto-assignment, live availability (`GET
/api/reservations/availability`), waitlist, seating, SMS confirmation, VIP/press
flags, and real-time notifications to the host CRM and pre-shift view.

### Training and briefing

* Enrollment creates the trainee plus assignments for the selected tracks.
* Progress updates recalculate the certification percentage and award badges.
* Briefing attendance sign-offs (`briefing_signoffs`), 86/par watch, VIP alerts,
  station directives, and the generated GM nightcap narrative are all backed by
  live aggregates.

## Realtime event contract

| Event | Emitted when | Consumers |
| --- | --- | --- |
| `ORDER_CREATED` | POS checkout / payment | POS, dashboards |
| `KDS_NEW_TICKET` | order is fired to a station | KDS, Expo, Mobile |
| `KDS_TICKET_UPDATED` / `KDS_TICKET_BUMPED` | line bump / recall / hold | KDS |
| `TABLE_STAGE_ADVANCED` | stage change (KDS mains bump, host seat, manual) | Floor Plan, Mobile, Reservations |
| `TABLE_UPDATED` | table geometry/stage refresh | Floor Plan |
| `GLOBAL_86_ITEM_UPDATE` | manual or stock-driven 86 | POS, KDS, Inventory, Mobile, Voice AI |
| `LOW_STOCK_ALERT` | par threshold crossed | Inventory, Briefing |
| `INVENTORY_UPDATED` | stock mutation | Inventory, POS |
| `LABOR_PACING_UPDATE` | every 60s / sale / punch | Scheduling, Mobile, Briefing |
| `RESERVATION_CREATED` / `RESERVATION_UPDATED` | host or Voice AI booking | Reservations, Briefing, Mobile |
| `VOICE_CALL_COMPLETED` | simulated or Twilio call | Voice AI, Reservations |
| `BRIEFING_UPDATED` | sign-off / training change | Briefing, Scheduling |
| `MEDIA_PUBLISHED` | media studio publish | Architect |

Rooms: every client joins `restaurant:{id}`; KDS clients also join
`kds:station:{station}` and `kds:station:all`. Redis is optional: set
`REDIS_URL` and Socket.io uses the Redis adapter; without it the gateway uses
in-process pub/sub.

## API surface

```
GET    /api/health
GET    /api/dashboard/summary
GET    /api/menu                          PATCH /api/menu/:id/availability
POST   /api/orders                        GET   /api/orders
GET    /api/orders/:id                    POST  /api/orders/:id/pay
POST   /api/orders/:id/void
GET    /api/kds/tickets?station=          GET   /api/kds/counts
POST   /api/kds/bump                      GET   /api/kds/bumps
POST   /api/kds/simulate/:tableId
GET    /api/tables                        POST  /api/tables/:id/seat
PATCH  /api/tables/:id/stage              POST  /api/tables/:id/advance
POST   /api/tables/:id/reset              GET/POST /api/floor-layout
GET    /api/inventory                     POST  /api/inventory/adjust
GET    /api/inventory/transactions        GET   /api/inventory/purchase-orders
POST   /api/inventory/purchase-orders/approve
GET    /api/inventory/86
GET    /api/reservations                  POST  /api/reservations
PATCH  /api/reservations/:id              POST  /api/reservations/:id/seat
GET    /api/reservations/availability
GET    /api/shifts                        POST  /api/shifts
POST   /api/shifts/:id/clock-in           POST  /api/shifts/:id/clock-out
GET    /api/shifts/logs                   GET   /api/labor/pacing
GET    /api/labor/forecast                POST  /api/labor/broadcast-cut
POST   /api/shifts/:id/approve-swap       POST  /api/shifts/:id/decline-swap
GET    /api/briefing                      POST  /api/briefing/signoff/:shiftId
POST   /api/briefing/narrative            POST  /api/briefing/biometric-broadcast
GET    /api/training                      POST  /api/training/enroll
POST   /api/training/progress
GET    /api/architect                     POST  /api/architect/publish
POST   /api/architect/publish-all         POST  /api/architect/sync-voice
POST   /api/architect/layout
GET    /api/voice/calls                   GET   /api/voice/knowledge
POST   /api/voice/ask                     POST  /api/voice/simulate
POST   /api/voice/inbound                 POST  /api/voice/gather
GET    /api/voice/twilio-status
GET    /api/auth/staff                    POST  /api/auth/pin
```

Validation is Zod-first (`packages/shared/src/schemas.ts`); every mutation
returns a typed error envelope (`{ error, details }`).

## Database

Prisma schema: `packages/db/prisma/schema.prisma`. It mirrors the prompt DDL and
adds the tables the wired screens require (`reservations`, `staff`, `trainees`,
`training_modules`, `training_assignments`, `notifications`, `briefing_signoffs`).
Seed data: `packages/db/src/seed.ts` (24 tables, 21 menu items, 20 ingredients,
16 staff, live orders, reservations, calls, training).

`knowledge_base.embedding` is stored as JSON (deterministic local 128-dim
vectors) so the demo works without an embedding provider. For a pgvector-backed
deployment, the optional SQL in `packages/db/prisma/pgvector-optional.sql`
creates the extension, a `vector(1536)` column, and an ivfflat index. The RAG
code falls back to JSON cosine scoring when pgvector is absent.

Redis is optional. If `REDIS_URL` is set, the Socket.io Redis adapter is loaded
and the gateway is multi-instance safe; otherwise the server runs in-process.

## Design fidelity

The design system files are **never modified**. `scripts/gen-screens.mjs`:

1. extracts the exact `<body>` markup and body class list for each screen;
2. extracts the exact Tailwind token config into
   `apps/web/tailwind.config.cjs` (no CDN required at runtime);
3. strips only the static onclick/script shims so React owns behaviour;
4. writes `apps/web/screens.generated.json`.

`ScreenShell.tsx` renders that markup with `dangerouslySetInnerHTML` and then
runs a per-screen binder (`apps/web/src/lib/binders/*`) that hydrates the
existing DOM with live data, adds real event handlers, and wires the shared
navigation. Run `pnpm gen:screens` after changing a design file.

## Tests

```bash
pnpm test
```

The integration suite (`apps/api/test/integration.test.ts`) creates a
disposable tenant and verifies:

* POS order → recipe depletion → `stock_transactions` → KDS ticket;
* KDS mains bump → table auto-advance to `entree`;
* depleted ingredient → automatic 86 of the linked menu item.

The suite cleans up after itself (including interrupted-run leftovers).

## Environment variables

See `.env.example`. Every integration degrades gracefully:

* Twilio unset → SMS rows are written as `simulated`; TwiML endpoints still work.
* Gemini unset → deterministic RAG replies using the knowledge base.
* Redis unset → in-process Socket.io adapter.
* SendGrid/Stripe unset → notifications are persisted; payment is simulated by
  the POS payload (`method: 'card'`).
* `NEXT_PUBLIC_API_URL` defaults to `http://localhost:4000`.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm db:up` / `pnpm db:down` | start/stop the repo-local Postgres cluster |
| `pnpm db:push` | Prisma push + client generate |
| `pnpm db:seed` | wipe + reseed the Downtown Flagship dataset |
| `pnpm db:reset` | force-reset schema and reseed |
| `pnpm gen:screens` | regenerate screen JSON + Tailwind config from design files |
| `pnpm dev` | gen screens + API + web |
| `pnpm build` | production build (stop dev first) |
| `pnpm test` | API integration tests |
| `pnpm typecheck` | workspace typechecks |

## Known demo limits

* The seeded labor window is a **rolling four-hour trading window** so the
  cockpit stays useful before the first sale; the prompt's pseudocode used the
  current hour. Both `currentHourSales` and `windowSales` are returned.
* Media studio images are intentionally unmapped in the seed (real designs
  shipped with external stock URLs). Use **Replace Photo** to stage a URL and
  **Publish Media to POS**; coverage updates live.
* `/login` is a PIN terminal demo; all seeded staff share the roster PINs shown
  in the UI. Do not use these values in production.
