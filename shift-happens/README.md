# Chefuffle by HYDRAFORGE AI

**Run the restaurant. Skip the kerfuffle.**

A production-shaped, full-stack restaurant operations engine. The screens are
clean, purpose-built React pages (no dense cockpit mockups) backed by a live
Fastify + PostgreSQL + Socket.io API.

```
apps/web  Next.js 14 App Router  ── REST + WebSocket ──  apps/api  Fastify
        │                                              │
        ├── /               landing page + pricing link
        ├── /pricing        plans, modules and FAQ
        ├── /setup          device, API, database and realtime checks
        ├── /serve          table → covers → guest order ├── POS engine
        ├── /pay/:id        tip + split + part payments
        ├── /kds            live station tickets         ├── KDS + stage engine
        ├── /floor-plan     table status + actions       ├── Labor pacing engine
        ├── /reservations   calendar + arrivals          ├── Inventory engine
        ├── /pos            checks + close tables        ├── Reservations engine
        ├── /end-of-night   close-out + slip count       ├── Voice AI (RAG)
        ├── /inventory      stock + reorders             └── Training engine
        ├── /scheduling     shifts + labor pacing
        ├── /briefing       lineup + sign-off
        ├── /onboarding     employee records + training
        ├── /architect      menu media publishing
        ├── /mobile         one-hand floor manager
        ├── /voice-ai       Voice AI command centre (Twilio + Gemini RAG)
        └── /login          PIN terminal (hashed PIN → bearer session)
                                                        packages/db (Prisma)
                                                        packages/shared (Zod)
```

The original design system remains in `stitch_shift_happens_design_system/` as
reference; its Nocturnal Command token palette is extracted into the generated
Tailwind config. The old static screen runtime has been removed.

## Quick start

Prerequisites: Node 20+, pnpm 9+, PostgreSQL 16 binaries. The repository ships a
self-contained local Postgres bootstrap so you do **not** need sudo or Docker.

```bash
cd shift-happens
cp .env.example .env           # already present in this workspace; adjust if needed

pnpm install
pnpm db:up                     # starts a local PG16 cluster on :5433 (trust auth)
pnpm db:migrate                # prisma migrate deploy (versioned schema)
SEED_DEMO=1 pnpm db:seed       # demo dataset (WIPES existing data)
pnpm dev                       # ensures the DB is up, then API :4000 + web :3010
```

`pnpm dev` runs `scripts/db-ensure.sh` first: if nothing is listening on the
database port it starts the repo-local cluster, so a reboot no longer leaves the
app pointed at a dead database. If the cluster is not running and you start the
API by hand, every screen shows `Database unreachable … Start it with
pnpm db:up` instead of a bare `Internal server error`.

Open <http://localhost:3010/> for the landing page, <http://localhost:3010/setup>
for diagnostics, or <http://localhost:3010/serve> for the terminal.
You can also run the same commands from the repository root; the root
`package.json` delegates to `shift-happens/`.

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

`/login` accepts any seeded staff PIN (4-8 digits). PINs are stored as salted
scrypt hashes. A successful login issues a 12-hour server-side bearer session;
only the token's SHA-256 digest is stored, roles resolve from the database, and
every `/api` route denies requests without a valid session except health, PIN
login and the signed Twilio webhooks. The browser keeps the bearer token for the
terminal session.

### Onboarding and permissions

`/onboarding` has two tabs:

* **Team** — add an employee with full name, position, pay rate, phone, email,
  home address, S.I.N. (stored masked, only the last three digits are returned),
  start date and terminal PIN. Edits and removals work too; removing
  deactivates rather than deletes, so shifts and orders stay on record.
* **Training** — the existing tracks, roster and badge flow.

The selected **position** sets the role permission list (shared by
`packages/shared/src/permissions.ts`, the API and the web app):

| Position | Can open | Cannot |
| --- | --- | --- |
| Server / Bartender | Serve (order food & drink), Open Checks (their own checks only), Floor Plan (their own + ready tables) | Other servers’ tables and checks, voids, inventory, menu/86s, scheduling, employee records |
| Host | Floor Plan, Reservations | Orders, payments, voids, inventory, menus |
| Line Cook | Kitchen, Inventory | Service floor, payments, voids |
| Chef / Expo | Kitchen, Inventory, Menu & 86s, Briefing, Training | Service floor, payments, scheduling |
| Floor Manager | Everything day-to-day including voids, floor design, table close-out and End of Night | Employee records, Voice AI |
| General Manager / Owner | Everything | — |

The nav only shows screens the role can open, and the API enforces the same
matrix on order create/pay/void, inventory adjustments, menu availability, KDS
bumps, floor-plan edits and employee records (`x-staff-id` header → 403).
Typing a URL for a screen the role cannot open bounces back to their home
screen — a server cannot reach `/kds`, `/end-of-night` or Onboarding directly.

Only **owner, general manager and floor manager** can see the whole floor
(`tables.viewAll`). A server or bartender sees the **ready tables they can claim
plus the tables they own** (assigned by seating or by their open check);
`GET /api/tables` and `GET /api/orders` are scoped the same way, and a server
can only advance, reset, add to or settle their own tables and checks. Seating a
table claims it for a service role.

**Clocking in:** the header has a Clock in / Clock out control for the signed-in
staff member. A clocked-in **server or bartender** is restricted to `/serve` —
the table plan — with a note in the sidebar; any other route redirects back.
Clock out to regain the rest of their permitted screens. Managers keep full
access while clocked in. The time clock reuses today’s scheduled shift or opens
an eight-hour shift, and closes yesterday’s forgotten punch automatically.

## Deployment and tablets

The tablet is a browser client; it reaches the server over the LAN. Two runbooks
ship with the repo:

* **[SETUP.md](SETUP.md)** — step-by-step walkthrough: laptop → tablet, on-prem
  server, cloud, PWA install, printers, first shift.
* **[DEPLOYMENT.md](DEPLOYMENT.md)** — reference: services, configuration,
  HTTPS, backups, upgrades, security.

The deployment kit lives in `deploy/`:

```bash
cd shift-happens/deploy
cp .env.example .env            # set SITE_ADDRESS, PUBLIC_ORIGIN, POSTGRES_PASSWORD
docker compose up -d --build
```

It runs Postgres, the Fastify API, the Next.js web app and Caddy (TLS +
reverse proxy). `deploy/Caddyfile` is for a public domain; `deploy/Caddyfile.lan`
uses Caddy's internal CA for an offline LAN install.

### API address at runtime

The browser resolves the API from `/config.js`, which reads `PUBLIC_API_URL`
on the server at load time — no rebuild when the address changes:

| `PUBLIC_API_URL` | Result |
| --- | --- |
| `same-origin` | Uses the page origin; Caddy proxies `/api` and `/socket.io` |
| `https://api.example.com` | Calls that host |
| `http://192.168.1.50:4000` | Direct LAN API access |
| empty | `NEXT_PUBLIC_API_URL`, else `<hostname>:4000`; a localhost API value is remapped to the page host on the LAN |

`CORS_ORIGIN` must include every origin that calls the API directly. After
changing the value, restart the web app (or the `web` container). `/setup` shows
the resolved API address, database health, realtime connection, menu count and a
test receipt — use it on every new tablet.

## The Serve workflow

`/serve` is the primary server screen:

1. Tap a table on the live table map.
2. Choose the number of covers and optionally a party name.
3. The menu opens on **Guest 1**. Tap dishes to add them to that guest.
4. Press **Done with Guest 1 → Guest 2** to advance automatically; tabs let you
   jump back to any guest.
5. Review every guest, add allergy/kitchen notes, and **Send to Kitchen**.
6. The order posts to `/api/orders` with each item’s `seat` set to its guest
   number, so the KDS and floor plan update immediately.

**Tables that already have a check never open a second one.** Tapping an
occupied table opens that check — number, server, items, seats, total and
allergies — with **Pay check**, **Add items** and **Cancel** actions. **Pay
check** opens the payment screen for that table.

Adding items posts the new round to `POST /api/orders/:id/items`, which appends
to the same check, recalculates the totals, depletes stock for only the new
items and sends only the new items to the kitchen. Managers and servers can pick
up any table this way, whoever opened it.

### Taking payment

`/pay/[orderId]` is the server’s payment screen (also reached from **Pay** in
Open Checks and **Pay check** on a table):

* **Bill** — every item with its guest seat, subtotal, 8% tax and a **blank
  gratuity field** for the guest to fill in (15/18/20% shortcuts are offered,
  but nothing is pre-populated). Total, amount paid and balance update live.
* **Split the bill** — pay in full, **split equally** between 2, 3, 4, 5, 6 or
  8 people, or **pay by guest** using the seats on the check. Each share shows
  what is still due and prefills the tender amount when selected.
* **Take payment** — Card / Cash / Gift card / House, and for cards the brand
  (Visa / Mastercard / Amex / Debit / Other), with an **editable amount**. A
  guest can pay part Visa, part cash, part gift card; each payment is a row on
  the check and one card payment is one slip at close-out.
* **Print** — a receipt menu with **Total bill**, **Print by seat** and
  **Individual bills**. Each prints an 80mm/72mm monospace receipt through the
  browser’s print dialog (pick the thermal receipt printer installed on the
  terminal); individual bills print one guest per page.
* The check closes itself when the payments cover the total (tip included);
  the screen then shows the paid receipt with every tender. The API rejects
  overpayments and a tip lower than what has already been taken.

Payments live in the `payments` table (`amount`, `method`, `card_brand`,
`label`) and feed the End of Night tender mix and slip counts.

### Modifiers

Every menu item can carry shared modifier groups from a single library
(`modifier_groups`, `modifier_options`, `menu_item_modifiers`):

* **Required groups** force the choice before an item can be added — steak
  temperature is a required, single-select group labelled *Non-negotiable*, and
  the modifier sheet opens automatically when a steak is tapped.
* **Optional groups** cover side dishes, sauces, cooking method, spice, bread,
  cheese, drink size and ice, dietary notes, toppings, add-ons, removals and
  substitutions. Groups are single- or multi-select with a max, and every option
  carries its own price delta (for example *Prawn skewer +$9.00*).
* The item card has a **Modifiers** button; items with required groups open the
  sheet on tap, other items quick-add and can be customised via the button.
* **Custom modifiers** — type anything that isn't in the list (for example
  *extra cold* or *no cilantro*) and add it. A built-in **on-screen keyboard**
  (numbers, QWERTY, shift, space, backspace, clear) makes text entry possible on
  a touch terminal with no physical keyboard. Custom entries are stored as
  `Custom: …` at no charge, appear on the cart, bill and KDS ticket, and can be
  removed before adding the item.
* Selections are stored on the order item as `modifiers` (name and priceDelta),
  so the price, the printed bill, the KDS ticket and reporting all agree.

The seed builds 21 shared groups and attaches them by category (steaks get
temperature + steak add-ons + side + sauce; handhelds get bun, cheese, burger
add-ons and side; drinks get drink size and ice; everything gets dietary and
removals). `GET /api/menu` returns `modifierGroups` with each item.

### Courses: starters versus mains

Every item carries a course derived from its menu category:

* **Starters** fire immediately (Start + Share, Eats, Features, Sushi, Greens).
* **Food mains are held** when the same round contains starters (Bowls, Casual
  Favourites, Burgers, Mains, Steaks).
* **Desserts and drinks** fire immediately.

The server sees a `**************` divider between courses in the guest cart and
review. The KDS ticket shows the same break, marks held mains as **HOLD**, and
exposes a **Fire mains** button. Mains are not sent to the line until the chef
fires them after the starters are cleared; bumping the mains then advances the
table as usual. A mains-only round fires immediately.

### Menu source

The seed uses the actual **C-JAYS RESTAURANT MENU** from
`MENU/C-JAYS RESTAURANT MENU.docx`: 182 menu items across 21 categories
(cocktails, frozen, margaritas, sangria & spritz, classics, wine, beer,
zero-proof, features, sushi, start & share, bowls, greens, pasta, handhelds,
mains, signature steaks, à la carte steaks, desserts, plus the Happy Hour Eats
and Happy Hour Drinks sections). It includes real prices, descriptions, kitchen
stations, 103 stock ingredients and 68 recipes. Source fractions such as
`¼`, `½`, `¾` are converted to decimals. Wine prices use the bottle price and
the description retains the 9oz/6oz prices where the source lists them.

`/pos` (**Checks & Tables**) is the manager view: **Open tables** lists every
table that is occupied, reserved or waiting to be bussed, with its party, stage,
minutes seated and open check. The **Close** action opens the close-out dialog:

* **Settle check & close** — pays the open check (card or cash), then frees the
  table.
* **Void check & close** — manager void with a reason, then frees the table.
* **Clear table only** — resets a table that has no check (stale demo tables,
  forgotten parties, dirty tables).

Clearing resets the stage to ready, and clears the party, covers, seated time
and server. The API refuses to clear a table while a check is still open, so no
orphan checks are left behind. **Open Checks** below it still lists active
tickets to add items (deep-links back into Serve), settle, or void. The full
ordering cockpit was removed.

The same **Close table** action is on the Floor Plan service panel for managers
(`floor.close` permission).

### End of Night

`/end-of-night` is the close-out report for a business day (`night.close`
permission: owner, GM, floor manager). It is populated from **paid checks**, and
every payment records its tender at the till.

* **Totals** — collected, net sales, tax and declared tips for the day, with
  check and cover counts.
* **Tender mix** — Visa / Mastercard / Amex / debit / other card / cash / gift
  cards / house accounts, each with a slip count and a total, or an
  **Unallocated** bucket when a check was settled without a tender (with a
  prompt to pick the brand next time).
* **Recall** — type a check number and press Recall to pull the check up with
  its items, payments and balance. A manager can **Re-open** a paid check
  (payments stay on the check) to amend items or the tip, or jump to the
  payment screen to settle any difference.
* **Server & bar tallies** — one drawer per server plus the **bar till** as its
  own drawer; the check count on each row opens the recorded check numbers for
  that drawer, with **Recall** and **Open** per check. (bar-zone orders are attributed to the till, so server tallies +
  bar reconcile to the computer total). Each row shows sales, card total, cash
  due (`sales − card − gift − house`), and the expected Visa / Mastercard / Amex
  slip counts. **Count** opens a worksheet to enter the counted Visa,
  Mastercard, Amex, other-card and cash amounts; line-by-line and total
  short/over appear as you type. Counts are saved per date in the terminal
  (localStorage) and can be cleared with **Clear count sheet**.
* **Reconciliation** — computer total vs slips + cash counted, expected to
  count, and the over/short once every drawer is counted.

Tenders come from the **payment rows** recorded on each check (one card payment
= one slip), with the legacy order fields as a fallback for older checks.

## Floor plan designer

`/floor-plan` has a **Design layout** mode:

* Upload a **PNG / JPG / WebP / PDF** floor plan as the room background. The
  file is stored under `apps/api/uploads/floorplans/` and served at
  `/uploads/floorplans/...`; replacing or removing it deletes the old file.
* Drag tables anywhere on the plan. Positions are saved as `posX/posY` on a
  0–1000 canvas, with rotation.
* Add a table, edit its number, zone, covers, shape (square / rectangle /
  round / booth) and rotation, or remove it from the floor.
* **Save layout** persists all table positions and metadata; **Exit design**
  returns to the live service view.
* The service view colours tables by status (ready / in service / reserved /
  needs bus) and keeps the existing seat, advance, reset and Start Order
  actions.

The editor uses `POST /api/tables`, `PATCH /api/tables/:id`,
`DELETE /api/tables/:id`, `POST /api/floor-layout`,
`POST /api/floor-plan/background` and `DELETE /api/floor-plan/background`.
`GET /api/floor-plan/config` returns the current background URL/type.

The minimal page conventions are documented in
`apps/web/MINIMAL_UI_SPEC.md`; shared primitives live in
`apps/web/src/components/ui/`.

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
* **Knowledge base editing** — on `/voice-ai`, owners and general managers can
  add, edit and delete entries (category, title, content). Each save regenerates
  the local embedding, so the next call can use the new answer immediately.
  Live data — the 86 list and table availability — is still checked separately
  and overrides the text. The API routes are `POST /api/voice/knowledge`,
  `PATCH /api/voice/knowledge/:id` and `DELETE /api/voice/knowledge/:id`
  (`voice.manage` permission).

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

`/reservations` opens on today’s book and has a **calendar** with Day, Week,
Month and Year views:

* `‹` / `›` step back and forward through the selected view; **Today** jumps to
  the current day while keeping the view.
* The week board shows each day’s arrivals; the month grid shows up to three
  bookings per day plus a `+N more` count; the year grid shows booking and
  cover totals per month.
* Click any day (or month in year view) to drill down; the status tabs, search,
  and waitlist banner apply to every view, and the KPI row totals whatever range
  is in view.
* **New reservation** pre-fills the selected day at 19:00 instead of the next
  half-hour slot, so you can book from any date.

The API accepts either `?date=YYYY-MM-DD` (single day, legacy) or an ISO
`?from=…&to=…` window where `to` is exclusive — the calendar computes the window
from local midnight to local midnight. The seed also writes a sample forward
book across the next twelve months so all four views have a diary to show.

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
GET    /api/dashboard/summary             GET   /api/end-of-night?date=
GET    /api/menu                          PATCH /api/menu/:id/availability
POST   /api/orders                        GET   /api/orders
GET    /api/orders/:id                    POST  /api/orders/:id/items
GET    /api/orders/by-number/:number       POST  /api/orders/:id/payments
POST   /api/orders/:id/pay                 POST  /api/orders/:id/reopen
POST   /api/orders/:id/void
GET    /api/kds/tickets?station=          GET   /api/kds/counts
POST   /api/kds/bump                      GET   /api/kds/bumps
POST   /api/kds/simulate/:tableId
GET    /api/tables                        POST  /api/tables
PATCH  /api/tables/:id                    DELETE /api/tables/:id
POST   /api/tables/:id/seat               PATCH  /api/tables/:id/stage
POST   /api/tables/:id/advance            POST   /api/tables/:id/reset
POST   /api/tables/:id/close
GET    /api/floor-plan/config             POST   /api/floor-plan/background
DELETE /api/floor-plan/background         GET/POST /api/floor-layout
GET    /api/inventory                     POST  /api/inventory/adjust
GET    /api/inventory/transactions        GET   /api/inventory/purchase-orders
POST   /api/inventory/purchase-orders/approve
GET    /api/inventory/86
GET    /api/reservations?from=&to=        POST  /api/reservations
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
POST   /api/voice/knowledge               PATCH /api/voice/knowledge/:id
DELETE /api/voice/knowledge/:id
POST   /api/voice/ask                     POST  /api/voice/simulate
POST   /api/voice/inbound                 POST  /api/voice/gather
GET    /api/voice/twilio-status
GET    /api/auth/staff                    POST  /api/auth/pin
POST   /api/auth/clock-in                 POST  /api/auth/clock-out
GET    /api/staff                         POST  /api/staff
PATCH  /api/staff/:id                     DELETE /api/staff/:id
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

## Design tokens & minimal UI

The original design system files are **never modified**. `scripts/gen-screens.mjs`
reads the Nocturnal Command token config from
`stitch_shift_happens_design_system/pos_order_terminal/code.html` and writes
`apps/web/tailwind.config.cjs` (no CDN at runtime). All screens are hand-built
React pages using the shared `components/ui` primitives (`PageHeader`, `Stat`,
`Card`, `Button`, `Badge`, `Modal`, `Tabs`, `Progress`, `SearchInput`,
`EmptyState`, `Avatar`) and the `AppShell` navigation.

Run `pnpm gen:screens` after changing the token palette. The app no longer ships
the original static HTML or the old DOM binders.

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
* `NEXT_PUBLIC_API_URL` defaults to `http://localhost:4000` and is only a
  fallback; `PUBLIC_API_URL` (runtime) is preferred. Set it to `same-origin`
  behind a reverse proxy.
* `deploy/.env.example` documents the production deployment variables.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm db:ensure` | start the local cluster only if the DB port is closed |
| `pnpm db:up` / `pnpm db:down` | start/stop the repo-local Postgres cluster |
| `pnpm db:push` | Prisma push + client generate |
| `pnpm db:seed` | wipe + reseed the Downtown Flagship dataset |
| `pnpm db:reset` | force-reset schema and reseed |
| `pnpm gen:screens` | regenerate the Tailwind token config from the design file |
| `pnpm dev` | generate tokens + API + web |
| `pnpm build` | production build (stop dev first) |
| `pnpm test` | API integration tests |
| `pnpm typecheck` | workspace typechecks |

## Known demo limits

* The seeded labor window is a **rolling four-hour trading window** so the
  cockpit stays useful before the first sale; the prompt's pseudocode used the
  current hour. Both `currentHourSales` and `windowSales` are returned.
* The seed’s stock levels and recipes are mapped from the menu descriptions, so
  ordering a dish depletes the relevant ingredients; the quantities are
  demo-grade rather than a full costing exercise.
* Menu Studio images are intentionally unmapped in the seed. Paste an image URL
  in the dish preview and press **Publish dish**; coverage updates live.
* `/login` is a PIN terminal demo; all seeded staff share the roster PINs shown
  in the UI. Do not use these values in production.
* Floor-plan uploads are stored on the API host’s local disk. The deployment kit
  mounts a `chefuffle-uploads` volume for them; any other production deployment
  needs a persistent disk or object storage. The rest of the app is stateless.
* The PIN terminal is a demo gate, and card payments are simulated until a
  processor (Stripe Terminal, Adyen, Moneris, Chase) is integrated.
* Serving an occupied table creates a new ticket/round for that table rather
  than merging into the original check. This keeps the ordering flow simple and
  leaves the original check intact for the manager view.
