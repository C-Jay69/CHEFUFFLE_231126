# CHEFUFFLE — MASTER PLATFORM AUDIT REPORT

**Product:** CHEFUFFLE (internal build name "SHIFT HAPPENS! by HYDRAFORGE AI")
**Audit date:** 22 November 2026
**Repository:** `/home/c-jay69/Documents/GitHub/CHEFUFFLE_231126`
**Application root:** `/home/c-jay69/Documents/GitHub/CHEFUFFLE_231126/shift-happens`
**Original specification:** `/home/c-jay69/Documents/GitHub/CHEFUFFLE_231126/RESTAURANT MANAGEMENT SYSTEM BUILD PROMPT.md` (407 lines)
**Audit status:** READ-ONLY. No application source was modified. The working tree was verified clean at the end of the audit.

---

## How this audit was conducted

This is a three-agent independent audit consolidated by a lead reviewer, conducted to the standard expected of a 30-year restaurant-technology executive evaluating a platform intended to compete with Toast, Oracle MICROS Simphony, Lightspeed, NCR Aloha, OpenTable, Resy and SevenRooms.

| Stream | Auditor scope | Output |
|---|---|---|
| Agent 1 | Software architecture, backend, database, security, reliability, scalability | `/tmp/chefuffle-audit/agent1-architecture.md` (616 lines) |
| Agent 2 | Restaurant operations: POS, payments, reservations, inventory, recipes, scheduling, KDS, reporting | `/tmp/chefuffle-audit/agent2-operations.md` (507 lines) |
| Agent 3 | Specification extraction, UX/product design, commercial strategy | `/tmp/chefuffle-audit/agent3-ux-spec-commercial.md` (913 lines) |
| Lead | Independent runtime verification + conflict resolution + consolidation | This report |

The agents worked independently before consolidation. Every material claim that influenced the verdict was re-checked by the lead against source or a live process. Three agent conclusions conflicted; each is resolved in **Appendix B**. The most important resolution: Agent 1 could not probe the live API, while the lead did — and the live probe **confirmed** the authorization bypass rather than disproving it.

### Evidence tags

- **[Verified]** — executed by the lead or an agent, with the command/result recorded.
- **[Code]** — established by reading the cited source.
- **[Untested]** — plausible from code but not executed (no live credentials, hardware or production access).
- **[Assumption]** — stated as an assumption, not evidence.
- **[Recommendation]** — proposed action, not current state.

### Verified runtime baseline (lead)

| Check | Result | Tag |
|---|---|---|
| `pnpm typecheck` (Turborepo, 4 packages) | 4/4 successful | [Verified] |
| `pnpm --filter @shift-happens/api test` | 12/12 tests pass in 4.0 s | [Verified] |
| `pnpm --filter @shift-happens/web build` | Production build succeeds; 22 routes | [Verified] |
| API live smoke test on a spare port (4011) | Server starts; `/api/health` reports `{"status":"ok","db":"ok"}` | [Verified] |
| Unauthenticated GETs | 12/12 returned HTTP 200 with no credentials, including `/api/staff` (phone, address, masked SIN, pay rate), `/api/reservations` (guest names/phones), `/api/end-of-night` (financials), `/api/labor/pacing` (wages) | [Verified] |
| Database (seeded tenant) | 24 tables; 1 restaurant, 25 staff, 32 tables, 182 menu items, 103 ingredients, 68 recipes, 312 recipe lines, 29 orders, 14 payments, 176 stock transactions, 59 reservations | [Verified] |
| Recipe coverage by category | All 8 beverage categories (Beer, Cocktails, Frozen, Happy Hour Drinks, Margaritas, Sangria & Spritz, Wine, Zero-proof) plus Classics have **0 recipes** | [Verified] |
| KDS mains-category match | 0 of 21 seeded categories match `MAIN_CATEGORIES`; 25 of 34 `course='main'` items lack the `Signature` tag | [Verified] |
| Stripe SDK / call | Absent; only `STRIPE_SECRET_KEY` is read from env | [Verified] |
| Twilio | Outbound SMS helper only; no inbound Media Streams | [Code] |
| pgvector | Optional side SQL; live DB has only `plpgsql`; embeddings are 128-dim SHA-256 JSON | [Verified] |
| Service worker | Caches a shell; explicitly refuses `/api/` and non-GET requests; no write queue | [Code] |
| Production build output | No `error.tsx`, `loading.tsx` or `not-found.tsx` route files | [Verified] |

---

# 1. EXECUTIVE SUMMARY

**CHEFUFFLE is a strong, production-shaped restaurant operations demo with one genuinely excellent product idea, wrapped in claims it cannot yet support.** It is not a commercial restaurant management platform, and it must not take live money or run a real Friday service in its current state.

The genuinely real core is narrow but credible: order capture with seats, required/optional modifiers and custom kitchen text; recipe-based food depletion for 68 menu items; automatic 86 at zero stock with live propagation to POS, KDS and the voice agent; KDS station routing and bump; table seating/stage/close; real-time Socket.io updates; a dashboard derived from live data; a role/permission matrix the UI respects; and an end-of-night aggregation of paid checks, tender mix, per-server tallies and bar till. The 12/12 integration suite is meaningful — for that happy path.

Everything around that core is partial, simulated or absent:

- **There is no authentication or authorization boundary.** Identity is a client-supplied `x-staff-id` header. When the header is *absent*, `currentStaff` returns `null` and `requirePermission` returns without throwing, so omitting a header grants full privilege. PINs are plaintext 3–6-digit strings with a default of `1234`; the "session token" is unsigned base64 that is never validated; staff UUIDs are enumerable from a public endpoint. The lead's live probe confirmed 12 sensitive endpoints return 200 with no credentials.
- **The money layer is not trustworthy.** There is no card processor — `STRIPE_SECRET_KEY` is declared and never used. `payOrder` inserts a full-total payment even when partial payments exist, so partial-pay → Pay/Settle double-counts tenders. Voids do not reverse stock or money and do not persist a reason. Tax is a global 8% constant, and the seed is a Toronto restaurant (HST 13%).
- **The flagship integration fails on the real menu.** KDS "bump mains → advance the table to Entrée" looks for categories `Burgers & Mains`, `Woodfired Pizza`, `Chef Favorites`, none of which exist in the seeded 21-category menu; only `Signature`-tagged items work, covering 9 of 34 mains. The integration test passes because it creates a synthetic category with exactly that name.
- **Inventory is half a system.** All beverage sales deplete nothing (0 recipes across 8 drink categories); modifiers never touch stock ("no cheese" still deducts cheese); stock writes are read-then-write with a zero clamp, so concurrent sales lose deductions and shrinkage disappears; purchase orders are regenerated on every read with fake IDs and "approve" instantly restocks every item to par with no PO or receipt.
- **Reservations are a calendar, not a reservation system.** The UI never calls the availability endpoint; create/update accept any table with no capacity or conflict check; the seed already double-books WS-01 and seats 8 covers at a 6-top; "Notify" is a toast; there is no edit/cancel/no-show UI, waitlist creation, guest history, deposit or turn-time model.
- **Offline is a shell, not a capability.** The service worker refuses to cache `/api/` or any non-GET. A Wi-Fi drop stops order entry, ticket firing and payments. The spec explicitly required an offline-capable PWA.
- **Reporting is largely absent.** There is a today dashboard and a one-day end-of-night report. No sales by period/category/item/employee, no food or beverage cost, no GP, no waste, no supplier spend, no reservation performance, no turnover, no average check, no export.
- **The commercial surface is ahead of the product.** The pricing work is the strongest document in the repo, but there is no billing, entitlement gating, signup, API keys, device metering, payments programme or multi-location tenancy. Several visible actions are theatre: "Publish all" runs `updateMany({ data: {} })` and reports "14 terminals", "Notify" sends nothing, "biometric sign-off" broadcasts a policy for a capability that does not exist, and the onboarding "magic link" points at `shift-happens.local`.

**Aggregate assessment (independent agent estimates, reconciled):** approximately **60% of the specification's surface area exists in some form**, **35% is operationally credible**, and **under 15% is production-ready**. Security, financial correctness and offline resilience score worst. The UI craft and the close-out concept score best.

**Bottom line:** this is a fundable prototype and a persuasive sales demo. Before a paid pilot it needs (1) a deny-by-default identity and tenancy layer, (2) a correct, idempotent money and inventory core, (3) an offline-capable POS with durable event delivery, and (4) honest packaging of what the product actually does. The single best commercial wedge is not Voice AI or the floor-plan canvas — it is **a fast, trustworthy close and service loop for 40–120-cover independent restaurants**.

### Headline scorecard

| Dimension | Grade | Summary |
|---|---|---|
| Product thesis | A− | One data model from seat → course → check → close is the right idea |
| UI craft / information architecture | B | Operational screens are legible and coherent; accessibility and tablet ergonomics lag |
| Frontend engineering | B− | Clean Next.js structure; pages are 500–1,700-line monoliths; no error boundaries |
| Backend architecture | C | Fastify/Prisma/Zod are appropriate; fat services, no domain/event boundary |
| Database design | D+ | Correct `NUMERIC` money and FKs; no migrations, checks, tenancy, audit or core restaurant entities |
| POS correctness | D | Happy path works; no discounts/transfers/refunds/split checks; tip and void risks |
| Payments / financial integrity | F | Simulated capture; double-charge path; no reversals; float math; fixed 8% tax |
| Inventory / food cost | D− | 68/182 recipe coverage; zero beverages; no modifiers; race/clamp; no costing |
| Reservations / host | D | Calendar only; no availability engine, conflict prevention, lifecycle or CRM |
| Workforce | D | Today-only scheduling; fake swaps; hardcoded forecast; wrong labor denominator |
| Kitchen (KDS) | C− | Good screen; hold/recall broken; per-item bump absent; mains detection wrong for real menu |
| Reporting / BI | F | Today + one-day close only; no exports; no cost/profit reporting |
| Security | F | No auth boundary; public PII/financials; unverified webhooks; plaintext PIN/SIN |
| Reliability / offline | D | No offline writes, no durable events, no retries, no backups automation |
| Scalability / multi-location | D+ | Single tenant by env var; no pooling/caching/jobs; disk-bound uploads |
| Observability / testing / CI | D− | Pino only; 12 service tests; no CI, metrics, tracing or audit log |
| Commercial readiness | D | Strong pricing strategy; no billing, entitlements, payments programme or tenancy |
| **Overall** | **D / prototype** | **Sellable demo; not safe for live money or a real service night** |

---

# 2. CURRENT PLATFORM ASSESSMENT

## 2.1 What exists

| Area | Reality |
|---|---|
| Stack | pnpm workspaces + Turborepo; Next.js 14.2.25 App Router; Fastify 4.28; Prisma 5.22; PostgreSQL 16; Socket.io 4.8; Zod 3; Tailwind |
| Size | ~6,430 LOC API source, ~10,800 LOC web pages, 525-line Prisma schema, 24 models + 6 enums, 88 HTTP endpoints across 16 route modules |
| Deployment | Single-node Docker Compose + Caddy, or a local Postgres bootstrap script; API runs TypeScript through `tsx`; schema applied with `prisma db push` on boot |
| Data | One seeded tenant; 182 real menu items, 103 ingredients, 68 recipes, 32 tables, 25 staff, 59 reservations |
| Tests | 12 integration tests (services, not HTTP); no auth, tenancy, concurrency, failure-injection or UI tests; no CI |
| Integrations | Twilio SMS (optional, outbound), SendGrid (optional), Gemini (optional, single-shot), Stripe (declared, unused), Redis (optional socket adapter), pgvector (optional side script) |

## 2.2 Module scorecard — presence vs production readiness

"Presence" = the feature exists in UI/API in some usable form. "Production readiness" = it would survive a real service, real money, real staff and an auditor.

| Module | Presence | Production readiness | Judgement |
|---|---:|---:|---|
| POS ordering / Serve | 72% | 45% | Strong flow; missing notes, discounts, transfer, images, keyboard |
| Payments / split | 55% | 5% | Split maths real; capture, refunds, tip governance, printers absent |
| KDS | 60% | 25% | Good visual language; hold/recall/main-advance broken |
| Floor plan | 78% | 50% | Geometry works; reservation semantics and tablet ergonomics fail |
| Reservations / host | 65% | 25% | Calendar good; host actions, CRM, waitlist and authz missing |
| Inventory | 55% | 35% | Adjust/auto-86 work; no CRUD, no costing; PO is fake |
| Scheduling / labour | 45% | 20% | Today view and pacing work; forecast fabricated, swaps stubs |
| Briefing / training | 55% | 20% | Good cockpit shape; directives and biometrics fabricated |
| Voice AI | 45% | 10% | Useful RAG demo; not a live phone agent; metrics invented |
| Menu media studio | 25% | 10% | A URL field; images never render in POS/KDS |
| End of night / close | 75% | 55% | Best feature; counts live only in localStorage |
| Mobile manager | 60% | 40% | 86 shelf works; no floor actions |
| Reporting / analytics | 15% | 5% | No reports page, no exports, no menu engineering |
| Auth / RBAC / tenancy | 25% | 5% | Header-spoofable, anonymous bypass, no tenant isolation |
| PWA / offline | 35% | 20% | Installable shell; no offline writes; CDN fonts/icons |
| Billing / entitlements | 0% | 0% | No subscription, metering, trials or gating |
| Multi-location | 5% | 0% | One restaurant pinned by env var |

## 2.3 Real vs demo-ware — the distinction that matters

| Genuinely functional | Partial / plausible | Visual placeholder or fabricated |
|---|---|---|
| Order create/append with seats, modifiers, pricing | Split bills (tender allocation only, not check split) | "Publish all" / "Sync Voice AI" (no-ops with success counts) |
| Recipe depletion for 68 food items | Inventory adjustments (one item at a time) | "14 terminals synced" (hardcoded) |
| Auto-86 at zero + live propagation | Reservations (calendar + create + seat) | "Notify" guest (toast only) |
| KDS routing, bump, fire mains | Scheduling (today only, create/clock) | Labor forecast (`620 × shape`) |
| Table seat/stage/reset/close | End-of-night aggregation (real) but count sheet is browser-local | Briefing station directives (hardcoded fiction) |
| Socket.io live updates | Voice AI (turn-based Gather + keyword/hash RAG) | "Biometric sign-off" (no biometric capability) |
| Dashboard summary from live data | Menu 86 (manual toggle works) | Magic-link onboarding (`shift-happens.local`, recipient is a name) |
| Staff CRUD + role matrix | Training (tracks/progress, no content or quizzes) | Call duration/sentiment (`elapsed + 45`, fixed 0.8/0.9) |
| End-of-night day totals, tender mix, server tallies | Floor-plan designer (geometry works; no reservations overlay) | Menu media "publishing" (URL fields, no processing) |

---

# 3. TECHNICAL ARCHITECTURE ASSESSMENT

## 3.1 Layer assessment

| Layer | Technology | Assessment | Evidence |
|---|---|---|---|
| Monorepo | pnpm + Turborepo | Clean boundaries. API "build" is `tsc --noEmit`; production runs `tsx src/index.ts`, compiling TypeScript at boot. API turbo output is empty, so nothing is cached. | `package.json:7-22`, `turbo.json:20-22`, `apps/api/package.json:7-11`, `deploy/Dockerfile.api:29` |
| Frontend | Next.js 14 App Router, React 18 | Screens are wired to REST/socket. Session lives in `localStorage` as a plain staff object; permissions computed client-side and default to allow when no staff. No route middleware. | `apps/web/src/lib/session.ts:26-131`, `lib/api.ts:60-83` |
| API framework | Fastify 4.28 | Appropriate choice. But no auth plugin, no rate limiting, no security headers, no cookie/CSRF layer, no `trustProxy`. | `apps/api/src/index.ts:15-40`, `apps/api/package.json:13-27` |
| Request layer | 16 route modules | Thin handlers, inline Zod. No controllers, no global auth hook; each route remembers or forgets its own check. | `routes/index.ts:19-36`; `routes/reservations.ts` has zero checks |
| Service layer | 19 service modules | Fat services mixing business logic, Prisma, Socket.io emission, serialization and fabricated analytics. Circular-ish imports (`pos-engine` → `kds-engine`/`labor-engine`; `kds-engine` → `stage-engine`; `table-close` → `pos-engine`). Hard to unit test. | `pos-engine.ts` (746 LOC), `voice-agent.ts` (531), `stage-engine.ts` (448) |
| Data access | Prisma 5.22 | Type-safe and productive. `findUnique`/`update` by bare id in 20+ places without a tenant predicate. Only two `$transaction` call sites for domain flows. | `stage-engine.ts:144-159,183-193,415-447`; `kds-engine.ts:174-183`; `pos-engine.ts:376,465` |
| Validation | Zod 3 | Broad request-body coverage — a genuine strength. Gaps: date params are opaque strings; Twilio body untyped; upload trusts client MIME; shared schemas drift from inline ones. | `packages/shared/src/schemas.ts`; `routes/*.ts` |
| Error handling | Central Fastify handler | Good pattern (Zod→400, AppError→status, Prisma P20xx→404/409/400, DB init→503). Weaknesses: auth errors throw raw `Error`; 503 leaks DB host:port. | `index.ts:42-83`; `auth-engine.ts:83-87` |
| Config | Zod-validated env | Good. Single global tenant ID; all third-party secrets optional in production; no production readiness check. | `env.ts:14-39` |
| AuthN / AuthZ | Header + localStorage | **Critical gap.** Missing header = full access; unsigned token; no sessions, expiry, revocation, lockout or password. | `lib/staff-auth.ts:15-55`; `auth-engine.ts:78-98`; `web/src/lib/session.ts:109-117` |
| Realtime | Socket.io 4.8 | Rooms exist in name only: no handshake auth; any client joins any restaurant and `kds:station:all`; payloads carry PII; optional Redis with silent in-process fallback; no outbox, sequence or replay. | `realtime.ts:15-86`; `packages/shared/src/events.ts` |
| Cache | Redis (optional) | Used only for the socket adapter. Not used for sessions, rate limits, 86 cache or idempotency despite spec claims. | `realtime.ts:22-36`; no other `redis` import |
| Background jobs | `setInterval` in API process | No queue, durability, retry or leader election. Runs per instance; duplicates under replicas. | `index.ts:98-104`; `pos-engine.ts:330-332` |
| Integrations | Raw `fetch` | No timeouts, retries, circuit breakers, signature verification or delivery state machine. Twilio/SendGrid failures logged and swallowed. Stripe never called. | `notifier.ts:11-94`; `voice-agent.ts:142-170`; `env.ts:30-32` |
| File storage | Local disk + static serving | Floor plans written to container disk and served publicly under `/uploads/` with no auth. No object storage, virus scan or magic-byte validation. | `index.ts:35-40`; `floor-plan.ts:26-53` |
| Observability | Pino + 8 `console.*` | Request logs only; no metrics, tracing, error reporting, business-event log or audit. `/api/health` checks only `SELECT 1`. | `index.ts:15-24`; `dashboard.ts:7-20` |
| Testing | Vitest, 12 cases | Service-level happy path; no HTTP/auth/tenancy/concurrency/failure tests; no CI. | `apps/api/test/integration.test.ts` |
| Deployment | Compose + Caddy | Sensible single node; schema push on boot; local uploads; no HA, backups automation, resource limits; TS in production. | `deploy/*` |
| Tenancy | `RESTAURANT_ID` env | Single tenant baked into the process; most routes pass `undefined` to services, defaulting to the env value. | `env.ts:22`; `services/*` signatures |
| Offline | Service-worker shell | API and mutations explicitly excluded; no IndexedDB queue or conflict resolution. | `apps/web/public/sw.js:23-30` |

## 3.2 Architecture verdict

The stack choice is sound and the module boundaries are clean at the folder level. The problem is **internal** architecture: there is no identity layer, no domain/event boundary, no transactional financial core, and no tenancy abstraction. At 6,400 backend LOC this is workable; at 2–3× size it becomes a change amplifier. The absence of an outbox means correctness depends on call order inside a process; a crash between commit and emit loses the event permanently.

**Would I build it this way today?** The monorepo, Fastify, Prisma, Zod and Next choices: yes. The auth-as-header, single-tenant env, fat services and simulated payment row: no. I would build an explicit identity/session boundary, a tenant-resolved request context, an append-only ledger for money and stock, and a transactional outbox before adding any more modules.

# 4. COMPLETE MODULE-BY-MODULE FUNCTIONALITY AUDIT

Legend: ✅ works as specified · ⚠️ partial · ❌ absent · 🚫 incorrect · ➕ beyond specification · 🔧 improvement required.

## 4.1 POS, orders and payments

| Feature | Status | Evidence | Operational consequence |
|---|---|---|---|
| Order create, line items, quantity, pricing, totals | ✅ | `pos-engine.ts:335-426`; 12/12 test | Happy path works; rounding per line |
| Table link, server assignment | ⚠️ | `pos-engine.ts:344-368`; `serve/page.tsx:141-146` | Unsigned terminal defaults to first server ("Zach"); tips misattributed |
| Guest/seat assignment | ✅ | `serve/page.tsx:509-518`; `pos-engine.ts:134` | Per-guest splitting and receipts |
| Courses; starters fire, mains hold | ⚠️ | `pos-engine.ts:123-156` | Holds only within a round; no timed firing |
| Modifiers: required/min/max, price deltas, custom text | ✅ capture / 🚫 stock | `serve/page.tsx:339-459`; `pos-engine.ts:173-199` | Prices right; ingredient usage wrong for every substitution |
| Item-level notes / seat-level allergens | ❌ | `serve/page.tsx:90,1136-1146` | Kitchen cannot tell which guest is allergic |
| Split bills | ⚠️ | `pay/[id]/page.tsx:82-116` | Tender allocation only; no check split, item transfer or separate checks |
| Part payments / multi-tender | ✅ `addOrderPayment` / 🚫 `payOrder` | `pos-engine.ts:584-722` | Partial-pay then Pay/Settle double-counts |
| Card capture | ❌ | `env.ts:32`; no Stripe SDK | Staff must run a second terminal; no reconciliation |
| Refunds | ❌ | none | Only full-check void or cash manipulation |
| Voids | 🚫 | `pos-engine.ts:724-746` | No stock reversal, no refund, no reason persisted, can void a paid check |
| Transfers (table/check/server) | ❌ | none | Requires void-and-re-ring, corrupting stock and sales |
| Discounts / comps / promos | ❌ | none | Workarounds corrupt reports |
| Service charge / gratuity | ⚠️ | `serve/page.tsx:287-292`; `constants.ts:161` | 18% only patio/6+; stored as tip; no policy config |
| Tax | 🚫 | `constants.ts:160` | Hardcoded 8%; Toronto seed implies 13% HST |
| Tip governance | 🚫 | `pay/[id]/page.tsx:608-635`; `pos/page.tsx:36,154` | Staff-editable tip; Open Checks silently adds 20% |
| Cash management / till | ❌ | no drawer model | Cash variance is a browser calculation |
| End-of-day totals | ✅ | `end-of-night-engine.ts:187-260` | Real aggregation of paid checks |
| End-of-day count / reconciliation | ⚠️ placeholder | `end-of-night/page.tsx:206-228` | Counts in `localStorage`; not submitted; no day lock |
| Receipts / printing | ⚠️ | `pay/[id]/page.tsx:61-80` | Browser print only; no ESC/POS, drawer kick or tax registration |
| Receipt numbering | 🚫 | `schema.prisma:288` | Global sequence, not per-venue/per-day |
| Idempotency / duplicate protection | ❌ | no keys anywhere | Timeout + retry can double-charge |
| Audit trail | ❌ | no model | Cannot answer who voided/comped/reopened and why |

## 4.2 Kitchen display (KDS)

| Feature | Status | Evidence | Consequence |
|---|---|---|---|
| Station routing and tabs | ✅ | `schema.prisma:173`; `kds/page.tsx:25-32` | Grill/sauté/cold/pastry/bar/expo |
| Ticket creation and live push | ✅ | `pos-engine.ts:287-305`; `realtime.ts` | Works; chime on new ticket |
| Bump ticket | ✅ | `kds-engine.ts:202-357` | Station or expo bump works |
| Per-item bump | ❌ | API accepts `itemIds`; UI never sends | One slow dish holds the whole ticket |
| Hold | 🚫 | `kds-engine.ts:258-263` | Writes `firing`; Hold does nothing |
| Recall | 🚫 | `kds-engine.ts:219-230` | Targets un-bumped items; cannot recall a bumped plate |
| Ticket lifecycle | ⚠️ | `kds/page.tsx:397-410` | Fully bumped ticket vanishes; no recent-bumps tray |
| Ticket timer | ⚠️ | `kds-engine.ts:83-87` | Based on oldest item; appended rounds look overdue at once |
| Course timing / delayed fire | ⚠️ | `schemas.ts:50` `bumpMinutes` unused | No timed release or fire-at-time |
| Priority (VIP/allergy/course) | ⚠️ | elapsed-only thresholds | Allergy gets a banner, not priority |
| All-day counts / station load / rush mode | ❌ | absent | Expo cannot see aggregate load |
| Overdue / allergen audio | ⚠️ | `kds/page.tsx:371-373` | Only new-ticket chime; spec requires overdue/allergen chimes |
| Mains bump → table Entrée | 🚫 real menu | `kds-engine.ts:9,288-314` | 0 categories match; 25/34 mains lack `Signature`; test uses synthetic category |
| Served / picked-up state | ❌ | `served` never written | No runner handoff or service-time metric |
| Table → KDS context | ❌ | none | Kitchen cannot see the table's course state |
| Touch targets ≥48 px | ⚠️ | Hold/Recall at 44 px | Below spec minimum on secondary controls |
| Printer routing | ❌ | none | Screen only |

## 4.3 Floor plan and table management

| Feature | Status | Evidence | Consequence |
|---|---|---|---|
| Canvas geometry (x/y/rotation/pax/zone/shape) | ✅ | `floor-plan/page.tsx:670-712`; schema | Real persisted layout |
| Drag-and-drop design mode | ✅ | `floor-plan/page.tsx:478-513` | No snap, undo or multi-select |
| Background upload | ✅ | `floor-plan/page.tsx:440-476` | Client MIME trust; public static serving |
| Seat / advance / reset / close | ✅ | `floor-plan/page.tsx:270-321` | Good manager controls |
| Stage state machine | 🚫 | `stage-engine.ts:183-225` | Any stage in any order; no history |
| "Reserved" status | 🚫 | `stage-engine.ts:53-62` | Derived from seated-no-order, not reservations; effectively unreachable |
| Reservation overlay | ❌ | none | Host cannot see upcoming bookings on the room |
| Table combine / split / move | ❌ | none | Large parties and PDRs manual |
| Turn timers | ❌ | none | No pacing or turnover data |
| Tablet ergonomics | 🚫 | `floor-plan/page.tsx:635-638` | 760 px minimum forces horizontal pan on a 10-inch tablet |
| Close table | ⚠️ | `table-close-engine.ts` | Sequential non-atomic settle; skips dirty/bus stage; double-charge risk |

## 4.4 Reservations and guest CRM

| Feature | Status | Evidence | Consequence |
|---|---|---|---|
| Create / list / calendar | ⚠️ / ✅ | `reservation-engine.ts:65-126`; UI | Calendar is genuinely usable |
| Availability engine | 🚫 | `reservation-engine.ts:144-182` | Only currently-`ready` tables; ignores future occupancy and turn time; UI never calls it |
| Table assignment | ⚠️ | `reservation-engine.ts:184-196,205-213` | Same-day first-fit; explicit table accepted without checks |
| Double-booking prevention | ❌ | no constraint; seed WS-01 19:00/20:00 [Verified] | Two parties promised one table |
| Capacity validation | ❌ | 8 covers on 6-top in seed [Verified] | Over-capacity seated silently |
| Modify / cancel / no-show / complete | ⚠️ API / ❌ UI | `reservation-engine.ts:251-305` | Host cannot run the book; reservations stay `seated` forever |
| Waitlist | ⚠️ seed only | `reservations/page.tsx:420-440` | No creation, position, quote or notify |
| Walk-ins | ⚠️ | floor plan seat | Not recorded; invisible to book and reporting |
| Guest profiles / history / preferences | ❌ | no `Guest` model | Repeat guests duplicated; no lifetime spend |
| VIP / occasion | ⚠️ | flag + briefing | Badge only |
| Deposits / prepayment | ❌ | none | 8+ party policy unenforceable |
| SMS confirmation / reminders | ⚠️ | `reservation-engine.ts:241-246` | Create-time only; simulated without Twilio; no reminders |
| "Notify" button | 🚫 | `reservations/page.tsx:343-349` | Toast only; guest never messaged |
| Reservation → floor state | ⚠️ | seat only | No hold, no completion, no floor display |
| Authorization | 🚫 | `routes/reservations.ts` | Anonymous can read/modify/seat any booking |

## 4.5 Inventory, recipes and purchasing

| Feature | Status | Evidence | Consequence |
|---|---|---|---|
| Ingredient master, stock, par, reorder, cost | ✅ | `inventory-engine.ts:30-107` | Solid master data |
| Stock movements / ledger | ⚠️ | `pos-engine.ts:190-199` | Sale + adjustment only; no opening/closing balances |
| Adjustments | ⚠️ | `inventory-engine.ts:176-265` | One item at a time; no count session |
| Physical counts | ⚠️ | `inventory/page.tsx:526-585` | 80 items = 80 modals; no blind count or sign-off |
| Transfers / locations | 🚫 | UI relabels `transfer` as "Shortage" | No source/destination; misleading ledger |
| Suppliers | ❌ | free-text string | No contacts, lead times, price lists |
| Purchase orders | 🚫 | `inventory-engine.ts:306-338` | Regenerated per read with fake IDs |
| Receiving | ❌ | "approve" restocks to par | No short shipment, invoice cost or partial receipt |
| Par / reorder triggers | ✅ | schema | Drive suggestions |
| Unit conversions | ❌ | none | Case → kg impossible; recipe units must match stock |
| Batch / expiry / lot | ❌ | none | No FEFO, recall or expiry alerts |
| Waste / spoilage | ⚠️ | reason + note | Not costed or reported |
| Theoretical vs actual usage | ❌ | none | Cannot detect over-portioning or theft |
| Valuation | ⚠️ | `currentStock × unitCost` | Snapshot only; no FIFO/weighted average |
| Sale → recipe depletion | ⚠️ / 🚫 | `pos-engine.ts:173-199` | 68/182 items; 0 beverages; modifiers ignored; concurrency loses updates |
| Auto-86 at zero | ✅ | `pos-engine.ts:215-236` | Works; void does not restore stock |
| Food cost / GP from real costs | ❌ | none | Data supports 19.0% average across recipe items, but no code computes it |
| Ingredient / recipe CRUD | ❌ | none | Onboarding requires SQL or reseed |

## 4.6 Menu, pricing and media

| Feature | Status | Evidence | Consequence |
|---|---|---|---|
| Menu read, categories, modifiers | ✅ | `menu-engine.ts` | Works |
| 86 toggle | ✅ | `menu-engine.ts:153-182` | Real-time propagation |
| Menu item / category / price CRUD | ❌ | only availability PATCH | Cannot onboard or reprice in-product |
| Recipe costing / GP / food-cost % | ❌ | `menu-engine.ts:51-109` | No margin visibility |
| Menu engineering | ❌ | none | No stars/plowhorses/puzzles/dogs |
| Availability schedules / dayparts | ❌ | happy hour = duplicate items | Wrong-price risk every service |
| Structured allergens / dietary | ⚠️ | `tags` strings + KDS heuristic | False positives; no ingredient-level allergen model |
| Menu versioning / audit | ❌ | none | Cannot roll back or prove what was live |
| Item imagery in POS/KDS | ❌ | `imageUrlPos` never rendered | Media studio is a dead end |
| Media upload / crop / multi-ratio | ❌ | URL field only | No 1:1 or 16:9 processing |
| "Publish all" / "Sync Voice AI" | 🚫 | `architect-engine.ts:112-153` | No-op / counts only; reports 14 terminals |

## 4.7 Staff, scheduling, labour and training

| Feature | Status | Evidence | Consequence |
|---|---|---|---|
| Staff profiles / CRUD | ✅ | `staff-engine.ts:14-142` | Good fields; masked SIN on read |
| Roles and permission matrix | ✅ shared/UI / 🚫 API | `permissions.ts:63-100`; `staff-auth.ts` | Matrix sensible; enforcement evaporates |
| PIN login / session | 🚫 | plaintext PIN; unsigned token | Impersonation; default `1234` |
| Shift create / list | ⚠️ | today only in UI | No week roster or templates |
| Clock in / out | ⚠️ | `scheduling-engine.ts:130-158` | No breaks, OT, rounding or geofence; re-clock-in erases prior hours |
| Stale punches | 🚫 | `labor-engine.ts:59-62` | Forgotten clock-outs accumulate wage burn forever |
| Shift swaps | 🚫 | `scheduling-engine.ts:232-242` | Stubs return success and change nothing |
| Availability / requests | ❌ | none | Managers cannot honor availability |
| Labour % | 🚫 | `labor-engine.ts:65-94` | Rolling 4 h gross sales incl. tax/tip; ~4× understatement; fires with zero sales |
| Labour forecast | 🚫 | `labor-engine.ts:194-207` | Hardcoded `620 × shape` |
| Cut recommendation / broadcast | 🚫 | `labor-engine.ts:97-135`; `scheduling-engine.ts:182-226` | Fixed `$17.5` saving; SMS addressed to names, so never sends |
| Tip pooling / payroll export | ❌ | none | Tips tracked but not distributed |
| Briefing cockpit | ✅ shape / 🚫 content | `briefing-engine.ts:73-106` | Hardcoded station directives every night |
| Briefing sign-off | 🚫 | `briefing-engine.ts:207-220` | Manager click auto-attests allergen/HACCP; no employee identity |
| Biometric policy broadcast | 🚫 | `briefing-engine.ts:235-252` | Claims a capability that does not exist |
| Training tracks / progress | ✅ | `training-engine.ts:15-101` | Real records |
| SOP content / quizzes | ❌ | modules are titles/durations | No content, questions or pass mark |
| Magic-link enrollment | 🚫 | `training-engine.ts:113,134-140` | `.local` URL; recipient is a person's name; UI claims sent |

## 4.8 Voice AI

| Feature | Status | Evidence | Consequence |
|---|---|---|---|
| Inbound TwiML `<Gather>` | ✅ | `voice-agent.ts:498-522` | Works as a turn-based IVR |
| Streaming / barge-in | ❌ | none | 3–5 s pauses; not a live agent |
| Gemini answer generation | ⚠️ | `voice-agent.ts:142-170` | Single-shot text; no tools; deterministic fallback |
| RAG / embeddings | 🚫 | 128-dim SHA hash in `jsonb` | Not semantic; O(N) scoring; contradicts spec |
| Live 86 injection | ✅ | `voice-agent.ts:74-79` | Works |
| Availability / booking | ⚠️ | weak availability model | Books regardless of true availability |
| Time parsing | 🚫 | `voice-agent.ts:114-126` | "7:30 tonight" fails without am/pm |
| Call logs / transcripts | ✅ | `voice-agent.ts:325-338` | Useful, but PII with no consent policy |
| Sentiment / duration | 🚫 | `voice-agent.ts:324-337` | Invented (`elapsed + 45`, fixed 0.8/0.9) |
| Signature verification | ❌ | `routes/voice.ts:78-89` | Unsigned webhooks can create bookings |
| Prompt-injection / tool allowlist | ❌ | none | KB and caller speech go into the prompt ungated |

## 4.9 End of night, reporting and dashboards

| Feature | Status | Evidence | Consequence |
|---|---|---|---|
| Day totals, tender mix, per-server, bar till | ✅ | `end-of-night-engine.ts:129-260` | Best real reporting in the product |
| Cash due / over-short | ⚠️ | `end-of-night-engine.ts:155-169` | Unallocated tenders inflate cash due |
| Count worksheet | ⚠️ browser only | `end-of-night/page.tsx:206-294` | Lost on refresh/device change; no audit |
| Z-report lock / day close | ❌ | none | Closed days can change silently |
| Export / print | ⚠️ | `window.print()` | Prints app chrome; no CSV/PDF/accounting export |
| Sales by period / category / item / employee | ❌ | none | Owner cannot run the business |
| Food / beverage cost, GP, P&L | ❌ | none | No profitability reporting |
| Waste, supplier spend, reservation performance | ❌ | none | No cost or conversion analysis |
| Table turnover / average check / retention | ❌ | none | Data exists but is not exposed |
| Dashboard summary | ✅ | `dashboard-engine.ts:9-98` | Real counts, today only |
| Scheduled reports / owner email | ❌ | none | No retention habit |

## 4.10 Authentication, tenancy, accessibility and PWA

| Area | Status | Evidence | Consequence |
|---|---|---|---|
| Authentication boundary | 🚫 | `staff-auth.ts:15-45` | No header = full access |
| Signed session / expiry / revocation | ❌ | `auth-engine.ts:88-90` | Token is decorative |
| PIN hashing / uniqueness / lockout | ❌ | `schema.prisma:106`; `auth-engine.ts:78-97` | Plaintext, default `1234`, no throttle |
| Route permission coverage | 🚫 | 60/88 routes have no check [Code] | Public PII, financials, mutations |
| Tenant isolation | ❌ | `env.ts:22` | One tenant per process; unscoped queries |
| Audit log | ❌ | no model | No accountability |
| Socket authorization | ❌ | `realtime.ts:38-51` | Any client joins any room; PII leaks |
| Upload safety | 🚫 | `floor-plan.ts:16-38` | Client MIME trust; public serving |
| Security headers / rate limits / CORS | ❌ | `index.ts:26-40` | Reflect-all CORS with credentials when unset |
| Offline writes | ❌ | `sw.js:23-30` | Network loss stops service |
| 48 px touch targets | 🚫 | 57 controls below minimum [Code] | Mis-taps with gloves |
| Focus / ARIA / zoom / contrast | ❌ | no `focus-visible`; `maximumScale:1`; `text-subtle` 2.28:1 | WCAG failures |
| Error / loading / not-found routes | ❌ | none | A render error blanks the screen |
| Self-hosted fonts / icons | ❌ | Google CDN | Offline/LAN loses icons and typography |

---

# 5. RESTAURANT OPERATIONAL ASSESSMENT

## 5.1 Role-by-role readiness

| Role | What they can actually do | What forces them back to paper/Excel | Readiness |
|---|---|---|---|
| Owner | See today's paid sales, table/KDS/labor/inventory counts | Week/month trends, menu mix, food/bev cost, GP, labor actual vs scheduled, waste, supplier spend, average check, exports | 2/5 |
| GM | Staff, schedules, stock adjust, 86, tables, close | Week roster, real swaps, labor compliance, audit of voids/comps, reporting | 2/5 |
| Floor manager | Seat/advance/close tables, see allergy note, 86 from mobile | Comp/discount, transfer/merge, split check, reservation overlay, void item, audit | 2/5 |
| Host | Calendar, create/seat reservation | Availability checks, edit/cancel/no-show, waitlist creation, table picker, guest history, deposits, floor overlay | 1.5/5 |
| Server | Strong order capture with seats/modifiers, append rounds, part payments | Item notes/void, transfer, split check, discount, fire-at-time, reliable mains stage, offline | 3/5 |
| Bartender | Same order flow, bar till in close | Any drink recipe at all; happy-hour pricing is manual duplicate items; no pour variance | 1.5/5 |
| Head chef / expo | Station KDS, bump, fire mains, 86 board | Per-item bump, working hold/recall, all-day counts, course timing, reliable mains→floor, prep lists, recipe cards | 2/5 |
| Line cook | Read tickets, bump station | Per-plate bump, recall, station load, doneness chips, call-for-runner | 2.5/5 |
| Inventory manager | Stock, par, suggestions, one-at-a-time adjust | Count sessions, receiving, invoices, transfers, batches/expiry, costed waste, theoretical vs actual, supplier records | 1.5/5 |
| Finance | One-day close totals, tender mix, server tallies, browser count sheet | Persisted counts, Z-lock, tax report, GL/CSV export, COGS, labor ledger, P&L | 1/5 |

## 5.2 A Friday dinner service — where it breaks

1. **Host stand, 17:00.** The calendar loads and looks credible. The host cannot check true availability before promising a time, cannot assign a table, cannot edit/cancel, cannot mark a no-show, cannot add a waitlist party, and "Notify" is a toast. A walk-in seated from the floor plan creates no record and can collide with an invisible future booking. The seed already contains a double-booked table. **Paper comes out.**
2. **Server, 18:30.** Order capture is the strongest part of the product. But there is no line-item void, no item note, no transfer, no split check, no discount or comp, and no timed fire. If the server is not signed in, checks attach to the first seeded server, misattributing tips. A burger or salmon order may never advance the floor plan because mains detection does not match the real menu.
3. **Kitchen, 19:15.** Tickets are legible and station routing is right. But Hold does nothing, Recall cannot recover a bumped plate, there is no per-item bump, a fully bumped ticket disappears, and the ticket timer inherits the oldest item so second rounds look overdue immediately. Expo cannot see all-day counts or station load. The first mis-bump requires a manager to void or reopen the check.
4. **Allergy, 19:40.** A guest reports a severe peanut allergy. The server types it into one order-level box. The KDS alert depends on free text and also scans menu descriptions, producing both misses and false alarms, and it cannot say which seat is at risk. This is the highest-consequence failure in the product.
5. **Payment, 21:00.** The split screen is well designed and part payments are real. But there is no card authorization; staff run a second terminal. If a guest pays part card and the server later taps "Pay" or closes the table with "Settle", a second full-total payment is recorded and the tender mix overstates. Open Checks silently adds a 20% tip. A paid void removes revenue from the close while the money stays collected.
6. **Close, 23:30.** The end-of-night aggregation is the best feature. But the count sheet lives only in the browser, there is no day lock, no CSV, and duplicate payments or paid voids can corrupt the reconciliation. **The close is a calculator, not a controlled process.**
7. **Network, any time.** A Wi-Fi blip stops order entry, ticket firing and payments. The service worker explicitly refuses `/api/` and non-GETs. The header still says "Live".

## 5.3 A Monday admin morning

- **Owner:** can see today's dashboard, not last week. Cannot change a price, cost a dish, see margin, or export a report. Cannot answer "how did we do?" without a spreadsheet.
- **GM:** scheduling is today-only; swaps are fake; cuts target names instead of phone numbers; timeclock has no breaks or overtime and can overwrite prior hours; inventory adjustments are one at a time; POs are synthetic. Monday is spent re-keying.
- **Inventory manager:** cannot run a count session, receive a delivery, record a short shipment, transfer between stores, track batches/expiry, or reconcile theoretical vs actual. Beverage stock never moves. The real work stays in the supplier portal and Excel.
- **Finance:** the close is one day, not persisted, not locked, not exportable, not processor-reconciled, and corruptible by duplicate payments. No tax report, no GL export, no COGS, no P&L. The month cannot be closed from this product.
- **Head chef:** can 86 and adjust stock and sign a briefing, but cannot create or edit a recipe, set yields, cost a dish, reprice, build a prep list, or schedule course firing.

## 5.4 Operational verdict

You could take orders and run a kitchen for one night, with paper backups and a separate card terminal. You could not close the money, trust bar inventory, run a reservation book, schedule a week, cost a menu, or report on the business. The product is a strong prototype and a weak system of record.

# 6. ORIGINAL SPECIFICATION VS ACTUAL IMPLEMENTATION

## 6.1 An important framing correction

The original document is **not a full restaurant product requirements specification**. It is a 407-line *technical build prompt*: stack mandates, an exact PostgreSQL DDL, five real-time workflows, design tokens, touch-target rules and a six-step implementation roadmap. It says almost nothing about procurement, reporting depth, guest CRM, payroll, billing, multi-location or a security model. Several areas the audit brief (and every commercial competitor) expects were never specified at all.

This cuts both ways and must be stated honestly:

- Some "gaps" are **not spec failures**; they are industry-standard expectations the spec omitted. I judge them against the market in Sections 7 and 11.
- Some features are **genuinely beyond the spec** — reservations calendar, end-of-night close, staff/training, pricing and deployment kit were built without being required.
- Some **explicit spec mandates fail outright**: pgvector RAG, Stripe, offline-capable POS, KDS mains→floor on the real menu, the 48 px rule, and the exact token palette.

## 6.2 Specification gap matrix — every major requirement

Status legend: ✅ fully · ⚠️ partial · ❌ not implemented · 🚫 incorrectly implemented · ➕ beyond spec · 🔧 improve.

| Area | Requirement | Current implementation | Status | Missing / problem |
|---|---|---|---|---|
| 1. Mission | POS → recipes → stock → ledger | Transactional depletion for 68 items | ⚠️ | 68/182 items; 0 beverages; modifiers ignored; lost updates |
| 1 | Stock → auto-86 → POS/KDS/Voice | Present and live | ✅ | Works; void does not restore stock |
| 1 | KDS bump → table Entrée | Category-name heuristic | 🚫 | 0/21 real categories match; 25/34 mains fail; test uses synthetic category |
| 1 | Labor pacing cockpit | Rolling 4 h gross-sales ratio | 🚫 | Includes tax/tip; ~4× understatement; stale punches; fires at $0 sales |
| 1 | Voice AI: Twilio + Gemini + pgvector | Turn-based Gather + hash vectors | 🚫 | Not streaming; 128-dim SHA; no tools; unverified webhook |
| 1 | Menu media studio + floor architect | Geometry real; media URL-only | ⚠️ | No upload/crop/processing; publish is a no-op |
| 2. Stack | Turborepo / pnpm monorepo | Present | ✅ | Clean boundaries |
| 2 | Next.js 14+ App Router | 14.2.25 | ✅ | Version now old; audit CVEs |
| 2 | Tailwind + Lucide icons | Tailwind yes; Material Symbols CDN instead | ⚠️ | Lucide absent; CDN breaks offline |
| 2 | Fastify + TypeScript + Zod | Present | ✅ | Validation broad; some inline drift |
| 2 | Socket.io + Redis adapter | Socket.io yes; Redis optional | ⚠️ | Silent in-process fallback; no auth |
| 2 | PostgreSQL 16 + pgvector + uuid-ossp | PG yes; no vector; Prisma UUIDs | 🚫 | Spec's vector mandate unmet |
| 2 | Prisma ORM + migrations | Prisma yes; `db push` only | ⚠️ | No migration history or rollback |
| 2 | Redis for sessions, limits, 86 cache | Socket adapter only | ❌ | None of the stated uses implemented |
| 2 | Twilio Voice/SMS, Stripe, SendGrid | SMS partial; Stripe unused | ⚠️ | No card capture; voice not streaming; email generic |
| 3. Layout | `routes/controllers/services/sockets/middleware` | routes/services/lib | ⚠️ | No controllers/sockets/middleware separation |
| 3 | Shared UI library, hooks, lib | `components/ui` + lib | ⚠️ | Pages are 500–1,700-line monoliths; no hooks layer |
| 4. DDL | Six enums exactly | Present + additions | ✅ | Extra values only |
| 4 | Core tables and FKs | All core tables present | ✅ | Good FK coverage for the specified model |
| 4 | `knowledge_base.embedding vector(1536)` | `Json?`, 128-dim hash | 🚫 | No vector type or index |
| 4 | Crucial indexes | Present plus extras | ✅ | Missing some reporting indexes |
| 4 | Strict tenant FKs | FKs are id-only | ⚠️ | DB cannot prevent cross-tenant references |
| 5A | Atomic checkout transaction | Partial transaction | 🚫 | Stock read outside tx; absolute write; zero clamp; no idempotency |
| 5A | Low-stock alert and 86 broadcast | Present | ✅ | Events emitted; no durable outbox |
| 5B | Bump mains → stage update + event | Present but wrong predicate | 🚫 | Fails on real menu; bump/advance not one transaction |
| 5C | Labor every 60 s / on sale | Present | ⚠️ | Runs per process; duplicated under replicas; wrong formula |
| 5D | Inbound call, RAG, booking, SMS | Partial | 🚫 | No Media Streams; weak availability; simulated SMS |
| 6 | Exact Nocturnal Command tokens | Applied with drift | ⚠️ | Accents differ from spec hex values |
| 6 | 440/880 chime on allergen/overdue | New-ticket chime only | ⚠️ | No overdue or allergen escalation sound |
| 6 | Optimistic UI + rollback | Minimal | ⚠️ | No mutation queue or rollback |
| 6 | 48 px minimum touch targets | 57 controls below minimum | 🚫 | Explicit spec violation |
| 6 | High contrast for kitchen glare | Dark, low-contrast captions | 🚫 | `text-subtle` 2.28:1; borders 1.17:1 |
| 7 | Step 6 integration test | 12 tests pass | ✅ | Happy path only; synthetic menu masks the real bug |
| 7 | Offline-capable PWA POS | Shell only | ❌ | API and writes excluded; no queue |
| Roles | Eight roles | Present | ✅ | Matches spec |
| Auth | PIN pad / role switch | Present but insecure | 🚫 | Header identity; plaintext PIN; unsigned token |
| Auth | API enforces every mutation | 60/88 routes unchecked | 🚫 | Anonymous full access |
| DB implied | Suppliers / POs / receipts | Absent or fake | ❌ | No entities; computed suggestions |
| DB implied | Waste / counts / transfers | Reason strings only | ❌ | No costed workflows |
| DB implied | Payments / refunds / processor refs | Payment rows only | ❌ | No capture, refund or processor ID |
| DB implied | Guest CRM | Absent | ❌ | No guest master or history |
| DB implied | Audit log | Absent | ❌ | No actor/before/after/reason |
| DB implied | Sessions / devices / printers | Absent | ❌ | No session or device registry |
| Reporting | Sales/cost/labor/menu reports | Today + one-day close | ❌ | No period, category, item or cost reporting |
| Ops | Multi-location / franchise | Single env tenant | ❌ | No tenancy or roll-up |
| Ops | Billing / entitlements / trials | Absent | ❌ | Pricing is copy only |
| Ops | Backups / migrations / CI | Manual docs; no CI | ⚠️ | No automated restore or pipeline |

**Distribution across 241 extracted requirement rows** (Agent 3's row-level classification, counted mechanically): roughly **86 ✅, 46 ⚠️, 71 ❌, 40 🚫, 4 ➕, 1 🔧** — a few rows carry two statuses. The ✅ cluster is the core order/KDS/floor data path; the 🚫 cluster is money, auth and derived logic; the ❌ cluster is procurement, CRM, reporting, billing and tenancy.

## 6.3 Requirements silently dropped

These are absent from both UI and API, with no visible "not implemented" state:

**Payments and money** — card capture/authorization/settlement/refund/chargeback; customer-facing tip entry; discounts/comps/promos; cash drawer float, paid-in/out and drops; ESC/POS printing and drawer kick; immutable Z-report and accounting export.

**Kitchen and service** — per-item bump and recall; correct hold; all-day counts, station load, rush mode, target countdown, split pass, recent-bumps tray; overdue/allergen audio; per-seat allergens and per-item notes; item imagery in POS/KDS; multi-ratio image processing; keyboard shortcuts; transfer, merge and split-by-item.

**Host and guest** — edit/cancel/no-show/complete actions; waitlist creation with quote and "table ready" SMS; guest CRM; deposits and cancellation policy; online booking widget; turn-time model; reservation overlay on the floor plan.

**Workforce** — week/month scheduling, templates, copy-week, availability; real swap requests; demand-based forecast; overtime, breaks and minor-labor rules; tip pooling and payroll export; self-service punch; certification gating.

**Voice and AI** — streaming audio and barge-in; real embeddings/pgvector; real call duration and sentiment; prompt-injection and tool allowlists.

**Platform** — Redis session/rate-limit/lock/86 cache; tenant isolation and multi-location; billing/entitlements/trials/API keys; offline write queue; audit log; accessibility conformance; security headers; reporting and exports.

**Trust** — a route-permission coverage test (would have caught the auth hole); a real-menu regression test (would have caught the mains bug); a demo-mode flag separating seeded bypasses from production; a CI claim audit matching marketing strings to capabilities.

## 6.4 Beyond specification

These were built without being required, and are durable assets:

- Reservations calendar with day/week/month/year views and VIP/occasion flags.
- End-of-night close with tender mix, per-server drawers and bar till.
- Staff records, role/permission matrix, briefing cockpit, training tracks.
- Pricing page, pricing strategy study, deployment kit (`deploy/`, `SETUP.md`, `DEPLOYMENT.md`, Caddy, local Postgres bootstrap).
- Dashboard summary, 86 list, mobile manager companion.
- Seed based on the restaurant's real 182-item menu.

## 6.5 Spec verdict

- **Explicitly met:** monorepo, Fastify/Next/Prisma/Zod, core DDL, POS→stock→86, KDS routing/bump, floor geometry, 12-test integration suite, seed realism.
- **Explicitly failed:** pgvector RAG, Stripe, offline POS, KDS mains→floor on real data, 48 px rule, exact tokens, atomic checkout, labor formula, voice streaming.
- **Silently dropped:** 44 distinct requirements across money, kitchen, host, workforce, platform and trust.
- **Beyond spec:** a credible reservations calendar, close-out, staff/training and a commercial pricing strategy.

# 7. INDUSTRY BENCHMARK ASSESSMENT

**Method note:** no competitor product was licensed, installed or tested in this audit. The benchmarks below compare CHEFUFFLE against the operating standards of the named platforms, based on their documented workflows and the auditors' domain knowledge. They are professional judgements, not measured side-by-side tests. [Assumption]

## 7.1 POS architecture and workflow

| Criterion | Toast / MICROS / Aloha / Lightspeed standard | CHEFUFFLE today | Gap |
|---|---|---|---|
| Order entry speed | 3–5 taps for a simple 2-cover order; hotkeys, item numbers, recent/frequent | 8 taps; no hotkeys or item numbers | Material |
| Modifiers | Required/min/max, nested, upcharges, kitchen routing per modifier, substitution inventory | Capture and pricing good; no inventory deltas; no nested groups | Partial |
| Split checks | Split by item, by seat, by amount, equal; move items; merge checks | Tender allocation only; no item/seat split | Material |
| Transfers / merge | Move table, move check, merge tables, transfer server | Absent | Material |
| Discounts / comps | Item/check, reason codes, manager approval, audit | Absent | Material |
| Voids | Item and check, reason, manager approval, stock/money reversal, audit | Check void only; no reversal or reason; can void paid | Critical |
| Payments | Card-present, tip adjust, refunds, chargebacks, settlement | Manual ledger rows; no processor | Critical |
| Cash management | Drawer open/close, float, drops, paid-in/out, blind counts | Absent | Material |
| Offline | Store-and-forward ordering and card auth | None | Critical |
| Receipts / printers | ESC/POS, kitchen routing, drawer kick, tax registration | Browser print | Material |
| Audit | Every privileged action recorded | None | Critical |

**Benchmark verdict:** the order-capture UX is credible and the table/course/seat model is better than many QSR-first POS products. Everything that protects money after the order is sent is below market — in several cases below the legal minimum for operation.

## 7.2 Reservations and table management

| Criterion | OpenTable / Resy / SevenRooms / Toast Tables | CHEFUFFLE | Gap |
|---|---|---|---|
| Availability by turn time and table | Interval-based, table/combination aware, pacing rules | Checks currently-`ready` tables within ±90 min; UI never calls it | Critical |
| Conflict prevention | Holds, waitlist, overbooking rules | None; seed double-books | Critical |
| Lifecycle | Confirm, modify, cancel, no-show, complete, deposit | Create/seat only in UI | Material |
| Guest CRM | Profiles, visit history, spend, preferences, tags, consent | No guest model | Critical |
| Waitlist | Position, quote, SMS, seat | Seed status only | Material |
| Deposits / prepayment | Policy-driven, integrated payments | None | Material |
| Floor integration | Reservation ghosts, arrival badges, turn timers | None | Material |
| Online booking | Widget, Google/website integration | None | Material |
| Reporting | Covers, conversion, no-show, turn time, source | None | Material |

**Benchmark verdict:** CHEFUFFLE is not a reservations product. Its calendar is pleasant, but a host would need paper and a second system. Do not position against OpenTable/Resy/SevenRooms; integrate or sell the host/floor/close layer they do not own.

## 7.3 Inventory, recipes, purchasing and food cost

| Criterion | Market standard (MarketMan, Craftable, Toast Inventory, Lightspeed) | CHEFUFFLE | Gap |
|---|---|---|---|
| Recipe coverage | Every sellable item, including beverages, modifiers and sub-recipes | 68/182; 0/113 drinks; no modifiers | Critical |
| Recipe costing | Yield, waste, portion, cost roll-up, versioning | No computation; data supports ~19% average | Critical |
| Counts | Count sheets, blind count, variance, approval | One item at a time; browser only | Material |
| Purchasing | Supplier records, POs, sending, receiving, invoices | Synthetic suggestions; one-click restock-to-par | Critical |
| Unit conversion | Case → each → kg/ml | Absent | Material |
| Waste | Costed waste log with reason and trend | Stock delta with note | Material |
| Theoretical vs actual | Usage variance and theft detection | Absent | Critical |
| Valuation | FIFO/weighted average, period movement | Current snapshot only | Material |
| Locations / transfers | Multi-store, requisitions | Absent; "transfer" relabelled "Shortage" | Material |

**Benchmark verdict:** inventory is presentable but not operable. The single most damaging fact is that **all beverage revenue depletes nothing** — beverage is usually the highest-margin category, and the bar's COGS and variance are therefore fiction. Food cost could be computed from existing data but no code does it.

## 7.4 Workforce management

| Criterion | Market standard (7shifts, HotSchedules, Toast Payroll) | CHEFUFFLE | Gap |
|---|---|---|---|
| Scheduling | Week/month roster, templates, copy-week, demand forecast | Today only; hardcoded forecast | Critical |
| Availability | Staff-submitted, honored, swap workflow | Absent; swaps are stubs | Material |
| Timeclock | Breaks, OT, rounding, approvals, geofence/device | Basic punch; no breaks/OT; can overwrite hours | Material |
| Labor cost | Net-sales denominator, actual vs scheduled, accrual | Gross incl. tax/tip over 4 h; stale punches | Critical |
| Tip management | Declaration, pooling, payroll export | Tips recorded, not distributed | Material |
| Compliance | Minor rules, meal penalties, overtime alerts | None | Material |
| Payroll | Export/API | None | Material |

**Benchmark verdict:** this is the weakest module after security and payments. Labor % is roughly 4× understated by construction, and the forecast is invented. A GM cannot build next week's rota or trust a cut recommendation.

## 7.5 Kitchen operations

| Criterion | Market standard KDS | CHEFUFFLE | Gap |
|---|---|---|---|
| Station routing | Per item/modifier, multiple stations, expo consolidation | Per item; expo = All | Partial |
| Bump | Per item and per ticket, undo, recent bumps | Ticket only; no undo; ticket vanishes | Material |
| Hold / recall | Real state transitions, recall any plate | Hold is a no-op; recall targets wrong rows | Critical |
| Course timing | Fire-at-time, auto-fire, pacing | Manual fire mains only | Material |
| All-day counts | Aggregate item counts | Absent | Critical |
| Prioritization | VIP, allergy, course, overdue escalation | Elapsed colour only; new-ticket chime only | Material |
| Handoff | Ready → picked up → served | `served` never written | Material |
| Resilience | Wake lock, offline cache, printer routing | None | Material |
| Floor synchronization | Bidirectional table/course state | One-way, and mains detection fails | Critical |

**Benchmark verdict:** the KDS screen has strong hierarchy and would demo well. The state machine beneath it is not reliable enough for a real line; the first mis-bump has no recovery path, and the flagship floor auto-advance does not work on the real menu.

## 7.6 UX, task depth and ergonomics

| Task | Market expectation | CHEFUFFLE | Verdict |
|---|---|---|---|
| Start a 2-cover, 2-dish order | 3–5 taps | 8 | Acceptable but heavy |
| Bump one plate | 1 tap | Not possible | Blocker |
| Recall a plate | 1 tap | Not possible | Blocker |
| 86 an arbitrary item | 2 taps from anywhere | No path for a stocked item | Blocker |
| Void/comp one item | 2–3 taps + approval | Not possible | Blocker |
| Split a check 3 ways | 3–5 taps | 8–9 | Below market |
| Clock in | 1 tap + PIN/QR | 1 tap (or 2 for someone else) | Fast but unverified |
| Run end of day | Guided, persisted, exportable | 4+ steps; counts not saved | Shape good, truth missing |
| Tablet floor plan | Fit-to-width, pinch zoom | 760 px minimum, horizontal pan | Below market |
| Touch targets | ≥48 px | 57 controls below | Spec violation |
| Accessibility | Focus, ARIA, zoom, contrast | Fails focus, dialog semantics, zoom, contrast | Below market |

## 7.7 Cross-cutting benchmark

| Dimension | Market standard | CHEFUFFLE | Gap |
|---|---|---|---|
| Integration | One data model; sales → inventory → cost → reporting | Core path real; costing/reporting links missing | Material |
| Reliability | Offline POS, durable events, resync, backups | No offline writes, no outbox, no backup automation | Critical |
| Security | Deny-by-default RBAC, tenant isolation, audit, rate limits | No auth boundary, public PII, no audit | Critical |
| Scalability | Multi-tenant control plane, caching, queues, pooling | Single tenant env; no cache/queue/pool | Material |
| Observability | Metrics, traces, error reporting, business events | Request logs only | Material |
| Commercial | Billing, entitlements, metering, support tooling | Copy only | Critical |
| Multi-location | Shared menu, local overrides, roll-up, SSO | One stack per site | Critical |

## 7.8 Where CHEFUFFLE genuinely wins

- **A coherent table → seat → course → check → close model** in one place, which many SMB products bolt together poorly.
- **The close-out concept**: per-server drawers, tender mix, bar till and over/short in one screen. This is the most defensible wedge.
- **Course-aware service**: starters fire, mains hold, per-seat ordering — a real full-service model, not QSR pretending.
- **Simple, honest pricing**: per location, month-to-month, no per-terminal tax.
- **On-prem/LAN deployment option** and a local Postgres bootstrap, which some independent operators value.
- **Visual craft** on operational screens; the palette and hierarchy are better than most seed-stage products.

## 7.9 Benchmark verdict

CHEFUFFLE is **competitive in product concept and table-service UX**, and **below market in every system-of-record dimension**: money, inventory truth, reservations lifecycle, workforce compliance, reporting, security and offline. It cannot win a feature-count war with Toast or Lightspeed. It can win a narrow fight on **the close and the service loop** — but only after the correctness and trust work in Sections 11–15.

---

# 8. SYSTEM INTEGRATION ASSESSMENT

## 8.1 Dependency map — does the ecosystem actually connect?

| Link | Status | Exact code path / evidence | What breaks |
|---|---|---|---|
| POS order → recipe → ingredient stock | ⚠️ partial data | `createOrder` → `depleteStock` (`pos-engine.ts:158-241`) | 68/182 items; 0 drinks; modifiers ignored; lost updates |
| POS order → stock ledger | ✅ | `tx.stockTransaction.create` (`pos-engine.ts:190-199`) | No reversal on void; no opening balances |
| Stock → auto-86 → POS/KDS/Voice | ✅ | `pos-engine.ts:215-236`; `GLOBAL_86_ITEM_UPDATE` | Works at zero; void/refund does not un-86 |
| POS order → KDS ticket | ✅ | `fanOutOrder` → `getTickets` → `emitStation` (`pos-engine.ts:287-305`) | Works; hold/recall broken; timer not per round |
| KDS bump → order status | ✅ | `bumpTicket` (`kds-engine.ts:267-286`) | `served` never reached; append can regress status |
| KDS mains bump → table stage | 🚫 broken on real menu | `kds-engine.ts:9,288-314`; 0/21 categories, 25/34 mains [Verified] | Floor plan does not advance for most mains |
| Table stage → POS/serve | ✅ | `toTableDto` (`stage-engine.ts:46-100`) | Works; realtime updates |
| Table stage → KDS | ❌ | no path | Kitchen has no table/course context |
| Reservation → table state | ⚠️ seat only | `seatReservation`/`updateReservation` | No hold, conflict prevention or completion |
| Reservation → POS / guest history | ❌ | no guest model; orders do not reference reservations | No spend/history attached to a booking |
| Inventory → recipe costing | ❌ | cost data exists; `menu-engine.ts:51-109` lacks cost | No food cost or GP |
| Recipe → menu profitability | ❌ | no cost/GP in DTO or report | No pricing intelligence |
| Menu 86 → POS/KDS/Voice | ✅ | `menu-engine.ts:172-180` | Works |
| POS payments → end-of-night | ⚠️ / 🚫 | `payOrder`/`addOrderPayment` → `getEndOfNight` | Duplicate tenders; paid voids remove revenue; no processor feed |
| Scheduling → labor reporting | 🚫 | `staff_shifts` → `calculateLaborPacing` | Wrong denominator; stale punches; hardcoded forecast |
| Purchasing → inventory valuation | ⚠️ | `approvePurchaseOrder` → `adjustStock` | Instant restock-to-par; no PO/receipt/invoice |
| Waste → food cost | ❌ | waste is a stock delta | No costed waste or variance |
| POS → sales reporting | ❌ | only dashboard/EON | No category/item/period mix |
| KDS bump → inventory | ❌ by design | deduction at order time | Remakes/comps not tracked or costed |
| Floor plan → POS | ✅ | "Start Order" deep link | Works; server attribution caveats |
| Reservation → floor display | ❌ | floor reads `/tables` only | Host cannot see upcoming bookings |
| Voice AI → reservation | ⚠️ unsafe | `simulateCall` → `createReservation` | Books regardless of true availability |
| Briefing → labor/inventory/86/reservations | ⚠️ | real lists; hardcoded directives; one-click sign-off | Directives are fiction; attestation is theatre |

## 8.2 Central data model assessment

The database is a reasonable first draft of the spec's DDL, not a model of a restaurant business.

- **Correct:** money stored as `NUMERIC` (10,2 / 12,3); foreign keys on the core path; sensible unique keys for tables and recipes; 44 indexes.
- **Missing:** versioned migrations (schema is `db push` on boot); `CHECK` constraints; a unique staff PIN; per-venue/per-day check numbering; enums where free strings are used (`reservation.status`, `order_items.prep_status`, `staff_shifts.status`).
- **Missing entities:** Tenant/Location, Session, AuditLog, Supplier, PurchaseOrder/Line, GoodsReceipt, InventoryCount/Line, WasteLog, Transfer, Discount/Comp/Promo, GiftCard, Loyalty, TaxRate/Jurisdiction, ServiceCharge, CashDrawer/Count, TipPool/Declaration, PaymentRefund, ProcessorTransaction, TableTurn/Slot, WaitlistEntry, StaffAvailability, ShiftSwap, Break, TimeclockEvent, Printer/Device/Terminal, structured Allergen, RecipeVersion/SubRecipe, MenuEngineeringSnapshot, CallRecording/Consent, WebhookEvent/Outbox, IdempotencyKey.
- **No audit trail:** no table records actor, before/after or reason for price changes, voids, comps, 86s, staff/pay changes, permission changes or stock adjustments.
- **No tenant-consistent composite FKs:** child tables carry `restaurantId`, but FKs reference only the id, so the DB cannot prevent cross-tenant references.

## 8.3 Integration verdict

The product is **one integrated happy path plus a collection of adjacent screens**, not one integrated restaurant ecosystem. The core loop (order → food depletion → 86 → KDS → table) is real and is the right foundation. But inventory does not feed costing, costing does not feed menu profitability, reservations do not feed table availability or the floor display, scheduling does not feed trustworthy labor reporting, purchasing does not feed valuation, waste does not feed food cost, and POS does not feed a reporting suite. Until those links exist, CHEFUFFLE is a point-of-sale/floor tool with modules attached — not the "unified reactive operations engine" the specification describes.

# 9. SECURITY AND RELIABILITY ASSESSMENT

## 9.1 The headline finding — verified, not inferred

The lead started the API on a spare port and called 12 endpoints with **no credentials and no headers**. All 12 returned HTTP 200:

| Endpoint | Data exposed with no credentials |
|---|---|
| `GET /api/staff` | Name, role, hourly rate, phone, email, address, masked SIN, start date |
| `GET /api/auth/staff` | Full roster, roles, permissions and rates (also enumerates login targets) |
| `GET /api/reservations?date=...` | Guest names and phone numbers |
| `GET /api/end-of-night` | Day sales, tender mix, cash due per server |
| `GET /api/labor/pacing` | Active staff names, roles, hourly rates, clock-in times |
| `GET /api/inventory` | Stock levels, unit costs, supplier names, valuation |
| `GET /api/voice/knowledge` | Proprietary operating knowledge and allergen answers |
| `GET /api/tables`, `/api/dashboard/summary`, `/api/menu`, `/api/kds/tickets`, `/api/bootstrap` | Floor, financials, menu, tickets |

This confirms the code-level finding: **there is no authentication boundary.** `currentStaff` returns `null` when `x-staff-id` is absent, and `requirePermission` returns without throwing (`apps/api/src/lib/staff-auth.ts:15-18,40-45`). The comment in the source calls it a "demo bypass". The consequence is that *every* permission check in the product is decorative.

## 9.2 Security findings

| # | Issue | Evidence | Severity | Required fix |
|---|---|---|---|---|
| S1 | Missing header grants full access | `staff-auth.ts:15-18,40-45`; live probe | **Critical** | Deny by default; global auth hook with explicit public allow-list |
| S2 | Identity is a client-supplied staff UUID; enumerable | `staff-auth.ts:15-29`; `GET /api/auth/staff` | **Critical** | Server-issued signed session; role resolved server-side |
| S3 | PINs plaintext, 3–6 digits, default `1234`, no lockout | `schema.prisma:106`; `auth-engine.ts:78-97` | **Critical** | Argon2id hash; unique per tenant; throttle + lockout |
| S4 | "Token" is unsigned base64 and never validated | `auth-engine.ts:88-90` | High | Remove or replace with verified signed token |
| S5 | Any caller can impersonate any role | `staff-auth.ts:24-27`; `session.ts:30-37` | **Critical** | Session-bound identity; never trust client role/id |
| S6 | Public PII, wages, addresses, SIN, guest phones, call transcripts | `routes/staff.ts:31-41`; `routes/voice.ts:25-31`; `routes/reservations.ts:17-30` | **Critical** | Permission-gate; field minimization; access audit |
| S7 | SIN and payroll data stored unencrypted | `schema.prisma:111`; `staff-engine.ts:121` | High | Encrypt at rest; restrict to payroll role |
| S8 | IDOR / cross-tenant queries by bare id | `kds-engine.ts:174-183`; `stage-engine.ts:144-159,415-447` | High | Tenant predicate on every query |
| S9 | Socket.io accepts any client into any restaurant/station room | `realtime.ts:38-51` | **Critical** | Authenticate handshake; authorize room joins |
| S10 | Twilio webhooks unsigned; `/voice/gather` creates bookings | `routes/voice.ts:78-89` | High | Validate `X-Twilio-Signature`; rate-limit |
| S11 | Upload trusts client MIME and is served publicly | `floor-plan.ts:16-38`; `index.ts:35-40` | High | Magic-byte allow-list; private storage |
| S12 | Gemini key in URL query string | `voice-agent.ts:148-149` | Medium | Use header auth; rotate keys |
| S13 | No security headers, CSP, HSTS or rate limiting | `index.ts:26-40`; no dependencies | High | Helmet, rate-limit, CSP, per-route body limits |
| S14 | Reflect-all CORS with credentials when env unset | `index.ts:26-30`; `env.ts:37-39` | Medium | Fail closed in production |
| S15 | No CSRF protection | no token layer | Medium | Add once cookie sessions exist |
| S16 | No audit log for privileged actions | no model | High | Append-only audit table with actor/reason |
| S17 | Public mass-message endpoints | `routes/scheduling.ts:61-67`; `routes/briefing.ts:30` | High | Manager permission + rate limit |
| S18 | Predictable magic link from `Math.random` | `training-engine.ts:113,251-253` | Medium | CSPRNG, hashed, one-time, expiring |
| S19 | Unvalidated date/query strings can 500 | `end-of-night.ts:7-13`; `scheduling.ts:19-25` | Low | Zod validation; 400 |
| S20 | DB host:port leaked in 503 | `index.ts:56-67` | Low | Generic dependency error |
| S21 | TypeScript executed via `tsx` in production | `apps/api/package.json:8`; Dockerfile | Low | Compile in build stage; run `node dist` |
| S22 | No CI, dependency scan or container scan | no CI config [Verified] | Medium | CI with typecheck, tests, audit, scan |

**Compliance statement:** this audit neither asserts nor denies PCI DSS, SOC 2, GDPR/PIPEDA or AODA conformance. The factual position: no PAN/CVV is stored (only brand/method strings), but no processor is integrated and no card data is tokenized; PII including SIN, addresses, phones and call transcripts is stored unencrypted with no retention, consent or deletion workflow; there is no audit log. Those are observations, not a compliance determination.

## 9.3 Money and inventory integrity

| Failure mode | Behavior | Evidence | Impact |
|---|---|---|---|
| Partial payment then "Pay"/"Settle" | `payOrder` inserts a **second full-total payment** | `pos-engine.ts:584-616`; `table-close-engine.ts:52-63` | Over-collection; tender mix and cash due overstated |
| Reopen paid check and re-pay | Payments are left in place; re-pay adds another | `pos-engine.ts:557-582` | Duplicate revenue |
| Concurrent payments | Read-then-write without lock/idempotency | `pos-engine.ts:660-678` | Overpayment |
| Void a paid check | Status flips; no refund, no stock reversal, reason discarded | `pos-engine.ts:724-746` | Revenue disappears from report; money stays collected |
| Concurrent sales | Stock read before transaction; absolute write; zero clamp | `pos-engine.ts:94-104,180-199` | Lost deductions; hidden shrinkage |
| Modifiers/substitutions | Never touch stock | `pos-engine.ts:173-199` | "No cheese" deducts cheese; "extra patty" adds no beef |
| Beverage sales | 0 recipes across all drink categories [Verified] | seed/data | Bar COGS and variance are fiction |
| Tax | Global 8% constant; Toronto seed implies 13% HST | `constants.ts:160`; `seed.ts:90` | Every check and remittance can be wrong |
| Money math | `Number()` + `toFixed` floats | `pos-engine.ts:14-15`; `labor-engine.ts:11` | Rounding drift; no minor-unit discipline |

## 9.4 Reliability and offline

| Scenario | Current behavior | Consequence | Evidence |
|---|---|---|---|
| Postgres down | 503 with DB host:port; `/health` degraded | Graceful request error, but leaks infrastructure; no retry/circuit breaker | `index.ts:56-68`; `dashboard.ts:7-20` |
| Redis unset/down | In-process Socket.io; silent multi-instance split | Half the clients see half the events | `realtime.ts:22-36` |
| API crash between commit and emit | No outbox; event lost | KDS/floor never learn about the order | `pos-engine.ts:411-418` |
| Client network blip | Socket reconnects, rejoins rooms, does not resync | Missed tickets/stage changes until manual reload | `apps/web/src/lib/socket.ts:21-26` |
| Two API replicas | Duplicate labor interval per instance | Duplicate `LABOR_PACING_UPDATE` every minute | `index.ts:99-104` |
| Wi-Fi loss at POS | `/api` and non-GET explicitly not cached; no queue | Order entry, firing and payment stop | `sw.js:23-30` |
| Twilio/SendGrid/Gemini failure | Logged and swallowed; notification row `simulated` | Guest messages silently not sent | `notifier.ts:11-94` |
| Slow provider | Raw `fetch` with no timeout/abort | Request/worker can hang | `notifier.ts:18,42`; `voice-agent.ts:148` |
| Server restart | Prisma/Redis not closed; open sockets drop | In-flight work at risk; clients must reload | `index.ts:106-113` |
| Backups | Manual `pg_dump` instructions only | No tested restore; data-loss exposure | `DEPLOYMENT.md` |
| Seed | Deletes all rows from every table globally | A mistaken production run is total loss | `seed.ts:55-77` |
| Schema change | `prisma db push` on every boot | Unreviewed destructive migration; no rollback | `deploy/docker-compose.yml:39-44` |

## 9.5 Security and reliability verdict

**Security: F.** This is not a hardening gap; it is the absence of the control itself. Nothing else in the product can be trusted until identity, authorization and tenancy are real.

**Reliability: D.** Single-node operation is coherent, and dependency errors are handled politely. But there is no offline write path, no durable event delivery, no retry, no tested backup and no safe migration discipline — precisely the failures that end a restaurant's trust in a POS.

---

# 10. UX AND PRODUCT DESIGN ASSESSMENT

## 10.1 Task depth under service pressure

Measured on the implemented UI, already signed in, excluding network wait.

| Service task | Clicks/taps | Assessment |
|---|---|---|
| Start a walk-in order, 2 covers, 2 dishes, send | 8 | Acceptable but heavy; Toast/Square are 3–5 |
| Add a second round | 5 | Good |
| Fire mains held behind starters | 3 | Good when hold works |
| Bump one plate | Not possible | **Blocker** |
| Recall a bumped plate | Not possible | **Blocker** |
| 86 an arbitrary stocked item | No path | **Blocker** |
| Split a check 3 ways | 8–9 | Below market |
| Seat a reservation | 2, but no table choice/edit/no-show | Partial |
| Seat a walk-in as host | 4–6 via New reservation; no waitlist | Partial |
| Clock yourself in | 1 | Excellent |
| Clock someone else in | 2, no verification | Too easy |
| Run end of day | 4+ plus 6 fields per drawer | Good shape, counts not saved |
| Void a check | 3 plus reason | Good |
| Void/comp one item | Not possible | **Blocker** |

## 10.2 UX findings

### Service speed and correctness

| # | Issue | Evidence | Impact |
|---|---|---|---|
| U1 | Header "Live" indicator is unconditional; not bound to socket state | `AppShell.tsx:231-236` | Staff trust stale data when realtime is down |
| U2 | Anonymous terminal gets full permissions; orders default to first server | `session.ts:109-118`; `serve/page.tsx:141-146` | Wrong tip attribution; no accountability |
| U3 | Visible one-click GM login on login screen | `login/page.tsx:198-206` | Any guest can become GM |
| U4 | Payment writes immediately with no confirmation | `pay/[id]/page.tsx:350-384` | Mis-keyed amount cannot be undone |
| U5 | Tip editable by staff; Open Checks silently adds 20% | `pay/[id]/page.tsx:608-635`; `pos/page.tsx:36,154` | Tip inflation; guest charged an unchosen tip |
| U6 | Quantity steppers 36 px; "Modifiers" is a 10 px link | `serve/page.tsx:955-969,874-884` | Missed taps; lost upsell |
| U7 | Guest-by-guest flow forces a screen advance per cover | `serve/page.tsx:493-499,997-1008` | 8-top shared order = 8 avoidable taps |
| U8 | Send to Kitchen irreversible; no undo window | `serve/page.tsx:1182-1190` | Wrong dish fired; waste and remakes |
| U9 | No item images anywhere in POS/KDS | `serve/page.tsx`; `kds/page.tsx` | Slower recognition for new staff |
| U10 | KDS Hold no-op; Recall wrong; ticket vanishes when bumped | `kds-engine.ts:219-264`; `kds/page.tsx:397-410` | No recovery from a mis-bump |
| U11 | No per-item bump, all-day counts, station load, target countdown | `kds/page.tsx` | Expo cannot pace the line |
| U12 | Overdue/allergen tickets make no sound | `kds/page.tsx:371-373` | Late food discovered visually |
| U13 | Floor plan forces 760 px minimum on tablets; side panel jumps above map | `floor-plan/page.tsx:635-638,744` | Horizontal panning; tapping scrolls the room away |
| U14 | Floor "Reserved" is not reservation-driven | `stage-engine.ts:53-62` | Host and servers see the wrong room |
| U15 | Host Notify is a toast; no edit/cancel/no-show; no waitlist creation | `reservations/page.tsx:343-349,695-718` | Host needs paper |
| U16 | Seating a future reservation seats it now | `reservation-engine.ts:307-329` | Wrong table state; walk-ins displaced |
| U17 | Scheduling only shows today; forecast hardcoded | `scheduling/page.tsx:356-463`; `labor-engine.ts:194-207` | Can't plan; staffing decisions on invented data |
| U18 | Briefing directives are hardcoded fiction; sign-off auto-attests; biometric claim | `briefing-engine.ts:73-106,207-252` | Compliance theatre; false policy |
| U19 | End-of-night counts only in `localStorage`; print prints app chrome | `end-of-night/page.tsx:206-228,320-327` | Lost reconciliation; unusable Z-report |
| U20 | 86 control exists only on `/mobile`, only for already-flagged items | `mobile/page.tsx:130-139` | Cannot 86 a dish that just ran out |

### Accessibility and ergonomics

| # | Issue | Evidence | Impact |
|---|---|---|---|
| A1 | 57 controls below the 48 px spec minimum | `h-8/h-9/h-10` across app [Code] | Mis-taps with gloves/greasy hands |
| A2 | `text-subtle` 2.28:1, `text-muted` 3.56:1, borders 1.17:1 | `tailwind.config.cjs` | Illegible in glare; WCAG fail |
| A3 | No `focus-visible`/focus ring; inputs use `outline-none` | `components/ui/*`; pages | Keyboard users lost |
| A4 | Modals lack `role="dialog"`, `aria-modal`, focus trap, focus restore | `components/ui/Modal.tsx` | Screen-reader/keyboard failure |
| A5 | Toasts have no `aria-live` | `lib/toast.ts` | Errors missed |
| A6 | Many icon-only buttons unlabelled | e.g. `serve/page.tsx:718-724,955-969` | Unusable with assistive tech |
| A7 | Pinch zoom disabled (`maximumScale: 1`) | `layout.tsx:29-35` | WCAG 1.4.4 violation |
| A8 | Scrollbars globally hidden | `globals.css:27-33` | Overflow areas look complete |
| A9 | Google Fonts + Material Symbols CDN | `layout.tsx:44-51` | Offline/LAN loses icons and typography |
| A10 | No wake lock on KDS/POS | absent | Tablet sleeps mid-service |
| A11 | No `error.tsx`/`loading.tsx`/`not-found.tsx` | `apps/web/src/app/` | Render error blanks the screen |
| A12 | Serve has no loading skeleton | `serve/page.tsx:665-710` | Looks broken on slow LAN |

### Trust and product honesty

| # | Issue | Evidence | Impact |
|---|---|---|---|
| T1 | "Publish all" no-op; "14 terminals synced" hardcoded; "Sync Voice AI" counts only | `architect-engine.ts:108-153` | Staff believe changes are live |
| T2 | "Magic link sent" to `.local` URL and a person's name | `training-engine.ts:113,134-140` | Onboarding silently fails |
| T3 | Simulated call duration/sentiment presented as metrics | `voice-agent.ts:324-337` | Managers act on invented data |
| T4 | Two visual brands: marketing orange vs app purple/cyan | `page.tsx:124`; `tailwind.config.cjs` | Feels like two products |
| T5 | Tenant name hardcoded "Downtown Flagship" | `AppShell.tsx:239` | Wrong for every other customer |
| T6 | No onboarding wizard; `/setup` is diagnostics only | `setup/SetupPanel.tsx` | New restaurant cannot self-serve |
| T7 | Marketing claims exceed capability (payments, SMS, biometrics, multi-location, API) | README, landing, pricing | Credibility and legal risk |

## 10.3 What is genuinely good

- The Serve table map is immediately legible: table, state, party, covers, elapsed time, check total (`serve/page.tsx:665-709`).
- Required modifier groups open automatically; optional groups price on the option rather than duplicating menu items (`serve/page.tsx:339-470`).
- The guest strip and course dividers express seat-level service cleanly (`serve/page.tsx:757-785,920-935`).
- KDS card hierarchy is strong: table number and timer dominate; allergy callout is prominent; bump is a full-width 48 px target (`kds/page.tsx:97-305`).
- End of Night is the best screen in the product: tender mix, per-server drawers, bar till, cash due, over/short, recall.
- Empty/loading/error states are thoughtful on KDS, floor plan, reservations, inventory, end of night and voice AI.
- The audio chime is synthesised with WebAudio, so it works offline (`lib/audio.ts`).
- The pricing comparison table is honest about list prices and late-2026 volatility.

## 10.4 UX verdict

The design is **better than the backend it sits on** — which is the dangerous direction. It looks like a system that enforces rules, records money and survives a rush; it does not. Under real service pressure the experience degrades exactly where the product must be strongest: the pass, the allergy conversation, the close and the network. The first investment should be truth and recovery, not more screens.

# 11. ARCHITECTURAL RECOMMENDATIONS

Ordered by value-to-effort. Effort: **S** ≤2 dev days, **M** 3–10 days, **L** >10 days, **Major** = architectural change. Priority: **Critical / High / Medium / Low**. Every recommendation states all nine required fields.

---

## A1 — Deny-by-default authentication and authorization
- **WHAT:** Replace `x-staff-id`/`localStorage` identity with server-issued, signed, expiring sessions (HttpOnly cookie or short-lived JWT); hash PINs with Argon2id; enforce uniqueness and lockout; resolve staff and role server-side; add a global Fastify auth hook with an explicit public allow-list (health, login, signed webhooks); remove every client-side `if (!staff) return true`.
- **WHY:** Omitting a header currently grants full privilege, and any staff UUID can be impersonated. Every other control is invalid until this is fixed.
- **RESTAURANT OPERATIONAL IMPACT:** Prevents unauthorized voids, comps, 86s, price/media changes and payroll/PII access from a floor tablet or compromised network.
- **END-USER EXPERIENCE:** A real PIN pad with lockout and idle timeout; "signed in as" clarity; managers can revoke a lost device; no change for legitimate staff.
- **COMMERCIAL IMPACT:** Removes the largest blocker to any pilot, insurance review, PCI conversation or enterprise sale; enables auditable RBAC.
- **TECHNICAL IMPLEMENTATION:** `sessions` table or Redis store; `@fastify/jwt` or `@fastify/secure-session`; `argon2`; preHandler scoped per plugin; server-authoritative permission map; route-matrix tests.
- **EFFORT:** L. **PRIORITY:** Critical. **DEPENDENCIES:** A2 for correct scoping.

## A2 — Introduce a tenant model and enforce scoping everywhere
- **WHAT:** Add `Tenant`/`Location` (or make `Restaurant` a location under a tenant); resolve tenant from the session or host, not `RESTAURANT_ID`; add composite tenant FKs or a Prisma extension injecting `restaurantId`; fix every bare `findUnique`/`update`.
- **WHY:** The process is hard-wired to one tenant, several services read/update by id without a tenant predicate, and multi-location is a priced tier with no capability.
- **RESTAURANT OPERATIONAL IMPACT:** Prevents one location from seeing or corrupting another's sales, guests, staff or payroll; enables franchise operation.
- **END-USER EXPERIENCE:** A location switcher and per-location role scoping; unchanged single-site experience.
- **COMMERCIAL IMPACT:** Unlocks the multi-location market the pricing page already sells; required for group operators.
- **TECHNICAL IMPLEMENTATION:** New tables + migration; tenant-aware Prisma client extension; composite unique keys; two-tenant integration tests.
- **EFFORT:** Major (or L if single-tenant near term). **PRIORITY:** Critical. **DEPENDENCIES:** A1.

## A3 — Make the payment ledger idempotent and reversible
- **WHAT:** Settle only the remaining balance; add an explicit reopen/amend flow; add refund/reversal rows; forbid silent void of paid checks; enforce `sum(payments) <= total` with a unique idempotency key per tender attempt; derive paid/balance from the ledger.
- **WHY:** `payOrder` always inserts a full-total payment, so partial-pay + Pay/Settle and reopen + re-pay double-count tenders; paid voids remove revenue without refunding.
- **RESTAURANT OPERATIONAL IMPACT:** End-of-night tender mix and cash due become trustworthy; no over-collection; refunds and voids are defensible.
- **END-USER EXPERIENCE:** "Pay" shows the remaining balance; reopen opens amendment mode with explicit refund/charge; paid void requires a refund step.
- **COMMERCIAL IMPACT:** Revenue integrity is a prerequisite for accounting reconciliation, chargebacks and any payments revenue story.
- **TECHNICAL IMPLEMENTATION:** Payment ledger with signed amounts and `type`; idempotency key; transactional guard; tests for partial→pay, reopen→repay, void-paid.
- **EFFORT:** M. **PRIORITY:** Critical. **DEPENDENCIES:** A10, A6.

## A4 — Integrate a real card-present processor (or declare the boundary)
- **WHAT:** Implement Stripe Terminal or an equivalent (Adyen/Moneris) with reader pairing, auth/capture, tip adjust, void/refund, webhooks as source of truth and settlement import. If not, remove "card" as a tender and document the system as a ledger for an external POS.
- **WHY:** No money actually moves; all card payments are manual rows; the "$0 with Chefuffle Payments" offer has no acquirer, terminal, PCI programme or settlement.
- **RESTAURANT OPERATIONAL IMPACT:** Eliminates a second terminal and double entry; enables chargebacks, tip adjustment and true reconciliation.
- **END-USER EXPERIENCE:** Tap/insert/dip states, decline recovery, printed/emailed receipt, guest-facing tip.
- **COMMERCIAL IMPACT:** Turns a demo ledger into a sellable payments product and makes the software price defensible.
- **TECHNICAL IMPLEMENTATION:** Processor SDK + terminal; `ProcessorTransaction` fields; signed, idempotent webhook handler; settlement mapping; PCI scope decision.
- **EFFORT:** L (plus certification). **PRIORITY:** Critical. **DEPENDENCIES:** A1, A2, A3, A6.

## A5 — Make inventory depletion atomic and reconcile the ledger
- **WHAT:** Deduct with an atomic conditional update (`SET current_stock = current_stock - $1 WHERE id = $2 AND current_stock >= $1 RETURNING …`) or row lock inside the sale transaction; never clamp at zero; record the true delta and unit-cost snapshot; add a reconciliation job comparing the ledger sum to the balance; handle oversell explicitly.
- **WHY:** Stock is read before the transaction and written as an absolute value, so concurrent sales lose deductions; clamping destroys shrinkage evidence; the ledger cannot explain actual stock.
- **RESTAURANT OPERATIONAL IMPACT:** Trustworthy inventory, correct 86s, credible food-cost and variance reporting, fewer mid-service stockouts.
- **END-USER EXPERIENCE:** The POS does not oversell; the 86 list reflects reality; counts reconcile.
- **COMMERCIAL IMPACT:** Inventory and food-cost control are primary purchase reasons; current behavior destroys trust in the numbers.
- **TECHNICAL IMPLEMENTATION:** Atomic SQL or row locks; server-side numeric math; ledger invariant tests with concurrent orders; idempotent sale key.
- **EFFORT:** M. **PRIORITY:** Critical. **DEPENDENCIES:** A3, A6.

## A6 — Replace float money math with a decimal/minor-unit engine and real tax config
- **WHAT:** Keep `NUMERIC` in Postgres; do arithmetic in integer minor units or `decimal.js`; add per-restaurant tax rates/jurisdictions, inclusive/exclusive flags, service charge, discount/comp/promo entities, rounding rules and tax breakdowns; remove the global 8% and 18% constants.
- **WHY:** Floating-point `toFixed` and a hardcoded rate cannot support real jurisdictions, comps or audit; the Toronto seed implies 13% HST.
- **RESTAURANT OPERATIONAL IMPACT:** Correct tax remittance, comp tracking, discount controls and penny-accurate close.
- **END-USER EXPERIENCE:** Correct totals and tax lines; manager-controlled comps with reasons.
- **COMMERCIAL IMPACT:** Tax and comp correctness are non-negotiable for accounting integrations and multi-jurisdiction sales.
- **TECHNICAL IMPLEMENTATION:** `TaxRate`, `Discount`, `ServiceCharge` tables; money helpers; order snapshots of tax lines; property-based rounding tests.
- **EFFORT:** M. **PRIORITY:** Critical. **DEPENDENCIES:** A5, A3.

## A7 — Adopt migrations, backups and production data safety
- **WHAT:** Replace `prisma db push` on boot with versioned `prisma migrate deploy` in CI/CD; gate destructive changes; add encrypted automated backups with restore drills; scope seed/wipe to a named demo tenant; add schema-drift checks.
- **WHY:** Boot-time schema push is an unreviewed destructive migration; the seed deletes every row in every table; backups are manual and untested.
- **RESTAURANT OPERATIONAL IMPACT:** Prevents a deploy or mistaken command from wiping a live menu, sales history or payroll.
- **END-USER EXPERIENCE:** Zero-downtime upgrades; no schema-error outages.
- **COMMERCIAL IMPACT:** Data loss is existential for a restaurant; this is a prerequisite for any paid pilot.
- **TECHNICAL IMPLEMENTATION:** Migration baseline; backup cron + object storage; restore runbook; `--demo-only` seed guard.
- **EFFORT:** M. **PRIORITY:** Critical. **DEPENDENCIES:** none.

## A8 — Add durable events, reconnect resync and authenticated rooms
- **WHAT:** Write domain events to an outbox in the same transaction; publish at-least-once; add per-tenant sequence numbers; add `GET /api/state?since=` or full refetch on socket connect; authenticate the handshake and authorize room joins; remove the unconditional all-station join.
- **WHY:** Emits happen after commit with no durability; a crash or network blip permanently hides tickets and stage changes; any client can join any room.
- **RESTAURANT OPERATIONAL IMPACT:** KDS and floor recover automatically after Wi-Fi or API restarts instead of silently losing tickets.
- **END-USER EXPERIENCE:** No manual reloads mid-service; live screens stay correct; honest connection state.
- **COMMERCIAL IMPACT:** Reliability during service is the product's core promise; missed tickets mean cold food and lost revenue.
- **TECHNICAL IMPLEMENTATION:** `outbox_events` + publisher worker; Redis Streams or Postgres LISTEN/NOTIFY; socket auth middleware; sync-on-connect.
- **EFFORT:** M. **PRIORITY:** High. **DEPENDENCIES:** A1, A2, A7.

## A9 — Build an offline-capable POS with a write queue
- **WHAT:** Cache menu/floor/staff snapshots in IndexedDB; queue orders, fires, bumps and payment intents while offline; replay with idempotency keys; define conflict policy; show offline/unsynced states; never claim a card payment succeeded offline.
- **WHY:** The spec mandates an offline PWA; the service worker refuses `/api` and all non-GETs; a Wi-Fi drop stops service.
- **RESTAURANT OPERATIONAL IMPACT:** Service continues through the most common real-world failure in a dining room.
- **END-USER EXPERIENCE:** A visible "Offline — orders queued" indicator; no lost checks when the network returns.
- **COMMERCIAL IMPACT:** Offline resilience is a top-three purchase criterion; its absence eliminates many deals.
- **TECHNICAL IMPLEMENTATION:** Workbox/IndexedDB queue; mutation idempotency; background sync; server conflict resolution; reconciliation UI; offline E2E tests.
- **EFFORT:** L. **PRIORITY:** High. **DEPENDENCIES:** A5, A8.

## A10 — Add an append-only audit log
- **WHAT:** Record actor, tenant, action, entity, before/after, reason, device/IP and correlation id for every privileged mutation; persist void/comp/discount reasons; make money/stock entries append-only with reversal rows; expose a manager audit view.
- **WHY:** No audit model exists; void reasons are discarded; payments/reopens mutate in place; shrinkage, theft and disputes are uninvestigable.
- **RESTAURANT OPERATIONAL IMPACT:** Loss prevention, dispute resolution and manager accountability.
- **END-USER EXPERIENCE:** Managers see who did what and why; staff know actions are recorded.
- **COMMERCIAL IMPACT:** Required by serious operators and insurers; a differentiator against demo-grade competitors.
- **TECHNICAL IMPLEMENTATION:** Partitioned `audit_log`; service wrapper/middleware; immutable/reversal pattern; retention and export.
- **EFFORT:** M. **PRIORITY:** High. **DEPENDENCIES:** A1, A3.

## A11 — Operational hardening: observability, rate limits, headers, CI
- **WHAT:** Add `@fastify/helmet`, `@fastify/rate-limit`, per-route body limits, CSP/HSTS, structured business logging with correlation ids, OpenTelemetry/Sentry, dependency health (Redis/providers), and CI running typecheck, tests, audit, migration checks, concurrency and failure-injection tests.
- **WHY:** No rate limiting, security headers, metrics, tracing or CI; only 12 service tests; external fetches have no timeouts.
- **RESTAURANT OPERATIONAL IMPACT:** Incidents are detected and diagnosed in minutes; brute force and abuse are contained.
- **END-USER EXPERIENCE:** Fewer outages, faster recovery, no login lockout from a hostile network.
- **COMMERCIAL IMPACT:** Enterprise buyers require evidence of operational maturity; this is a procurement checkbox.
- **TECHNICAL IMPLEMENTATION:** Fastify plugins; OTel SDK; Sentry; GitHub Actions; Vitest `inject` HTTP tests; k6 concurrency tests; chaos tests for Redis/DB/provider outages.
- **EFFORT:** M. **PRIORITY:** High. **DEPENDENCIES:** A1, A7, A8.

## A12 — Build a correctness test strategy that would have caught these bugs
- **WHAT:** Add route-permission coverage tests (enumerate Fastify routes, assert a permission hook), real-seed regression tests for KDS mains→stage, concurrency tests for stock/payments, and HTTP-level integration tests; run them in CI.
- **WHY:** The auth hole and the mains bug both survived because tests exercise services directly and use a synthetic menu category that does not exist in production.
- **RESTAURANT OPERATIONAL IMPACT:** Prevents regressions in the exact flows that cost money and trust.
- **END-USER EXPERIENCE:** Fewer silent failures; predictable behavior across releases.
- **COMMERCIAL IMPACT:** Shortens the path to a pilot and reduces support cost.
- **TECHNICAL IMPLEMENTATION:** Fastify route table introspection; seeded fixture matching the real 21 categories; `Promise.all` concurrent sale tests; CI gate.
- **EFFORT:** S–M. **PRIORITY:** High. **DEPENDENCIES:** none (can start immediately).

# 12. NEW FEATURE RECOMMENDATIONS

Only features with a clear operational or commercial justification are listed. Ordered by value-to-effort.

## N1 — Real reservation lifecycle and waitlist
- **WHAT:** Turn-time/interval availability, conflict and capacity validation on create/update/seat, table holds, modify/cancel/no-show/complete UI, waitlist creation with quoted time and "table ready" SMS, reservation ghosts on the floor plan, auto-complete on table close.
- **WHY:** Today the calendar cannot check availability, prevent double-booking or run a host stand; the seed already contains a double-book and an over-capacity seating.
- **RESTAURANT OPERATIONAL IMPACT:** One host can run the door without paper; no overbooking; covers and no-show data become reliable.
- **END-USER EXPERIENCE:** Time-first booking with ranked tables, drag-to-table, a waitlist tab, and one-tap guest notify.
- **COMMERCIAL IMPACT:** Makes the Pro tier credible and is a primary reason operators buy this category.
- **TECHNICAL IMPLEMENTATION:** `ReservationSlot`/turn-time model; interval-overlap query; exclusion constraint (`btree_gist`); status machine; table-close hook; UI drawer.
- **EFFORT:** L. **PRIORITY:** High. **DEPENDENCIES:** A1, A2, A7.

## N2 — Recipe costing, GP and menu engineering
- **WHAT:** Cost every recipe from ingredient `unitCost × quantity × yield`; show plate cost, GP and food-cost %; add a price simulator, versioned recipes and menu-engineering classification.
- **WHY:** The database already supports a ~19.0% average food cost across 68 recipe items, but no application code computes it; chefs and owners cannot see margin.
- **RESTAURANT OPERATIONAL IMPACT:** Prices move from guesswork to data; low-margin items become visible; price changes are controlled.
- **END-USER EXPERIENCE:** A cost panel on every dish, margin targets and a "what-if" price.
- **COMMERCIAL IMPACT:** Direct margin improvement and a headline feature for the menu-architect story.
- **TECHNICAL IMPLEMENTATION:** Cost roll-up service; `RecipeVersion`; cost snapshot at sale; price update endpoint; menu matrix report.
- **EFFORT:** M. **PRIORITY:** High. **DEPENDENCIES:** A5, A6.

## N3 — Supplier, purchase-order and receiving workflow
- **WHAT:** Persisted suppliers, POs and lines, send/receive states, short shipments, invoice costs, lead times, transfers and unit conversions.
- **WHY:** POs are regenerated per read with fake IDs; "approve" instantly restocks every item to par; suppliers are free text; food cost and valuation are therefore unreliable.
- **RESTAURANT OPERATIONAL IMPACT:** No over-ordering; deliveries match invoices; purchasing has history; valuation reflects reality.
- **END-USER EXPERIENCE:** Suggested order → edit quantities → send → receive against lines → record invoice.
- **COMMERCIAL IMPACT:** Purchasing is a major cost lever and a natural expansion module.
- **TECHNICAL IMPLEMENTATION:** `Supplier`, `PurchaseOrder`, `POLine`, `GoodsReceipt`, `Invoice`; state machine; cost layers; unit conversion.
- **EFFORT:** L. **PRIORITY:** High. **DEPENDENCIES:** A5, A6.

## N4 — Reporting suite, nightly Z-report and weekly review
- **WHAT:** Sales by day/week/month, category, item, employee and service period; average check; covers; table turnover; food/bev cost; waste; supplier spend; reservation performance; labour actual vs scheduled; CSV export; a nightly owner email and a Monday "week in review".
- **WHY:** Only a today dashboard and a one-day close exist; retention depends on a recurring reason to open the product.
- **RESTAURANT OPERATIONAL IMPACT:** Owners and finance run the business from the product instead of spreadsheets.
- **END-USER EXPERIENCE:** A report hub with date ranges, comparisons and export; a trusted nightly artifact.
- **COMMERCIAL IMPACT:** Reporting is a top purchase criterion and an upsell tier; the Z-report email is the cheapest lock-in available.
- **TECHNICAL IMPLEMENTATION:** Daily aggregate tables/materialized views; query service; RBAC; CSV; SendGrid schedule.
- **EFFORT:** L. **PRIORITY:** High. **DEPENDENCIES:** A3, A10, N2.

## N5 — Billing, entitlements, trials and device metering
- **WHAT:** Subscription billing, plan entitlements, module trials, KDS screen registration, voice-minute metering and self-serve provisioning.
- **WHY:** Every plan currently gets every feature; "2 screens", "300 minutes" and "14-day trial" are copy only; there is no way to charge.
- **RESTAURANT OPERATIONAL IMPACT:** The company can onboard and bill a restaurant without engineering.
- **END-USER EXPERIENCE:** In-app plan page, trial countdown, upgrade prompts at the point of use.
- **COMMERCIAL IMPACT:** Converts the pricing study into revenue; enables the Growth hero plan.
- **TECHNICAL IMPLEMENTATION:** Stripe Billing + webhooks; `entitlements` table; middleware gate; device registry; admin console.
- **EFFORT:** L. **PRIORITY:** High. **DEPENDENCIES:** A1, A2, A4.

## N6 — Seat-level allergens and a global 86 control
- **WHAT:** Per-seat allergen chips, per-item notes, KDS rendering tied to seat and item, structured allergen taxonomy on ingredients/recipes, and a searchable 86 action available from every shell with reason, actor, restore and an 86 board.
- **WHY:** Allergy is a single order-level free-text box; the detector also scans menu descriptions, producing misses and false alarms. There is no path to 86 a stocked item that just ran out.
- **RESTAURANT OPERATIONAL IMPACT:** Safer plating; fewer remakes; staff can stop selling a dish immediately.
- **END-USER EXPERIENCE:** Guest strip allergen badges; KDS "Guest 3 — peanut — separate board"; two taps to 86 from anywhere.
- **COMMERCIAL IMPACT:** Allergen safety is a purchase criterion and an insurance requirement; 86 is basic table stakes.
- **TECHNICAL IMPLEMENTATION:** `orderItem.allergens`, structured `Allergen`; KDS chip component; global command palette; reuse `menu-engine` toggle; audit.
- **EFFORT:** M. **PRIORITY:** Critical. **DEPENDENCIES:** A1, A10.

## N7 — KDS operational depth
- **WHAT:** All-day counts, station load, target-time countdown, rush mode, per-item bump, fixed hold/recall, recent-bumps tray, overdue/allergen audio escalation, doneness chips, wake lock, split pass.
- **WHY:** The KDS is the chef's primary tool; today it cannot pace a line, recover a mis-bump or surface aggregate load.
- **RESTAURANT OPERATIONAL IMPACT:** Better pacing, fewer remakes, less expo guesswork.
- **END-USER EXPERIENCE:** One-tap per-line bump, visible all-day bar, audible escalation, screen that stays awake.
- **COMMERCIAL IMPACT:** Kitchen execution is the core of a restaurant OS; a chef must prefer it to the ticket rail.
- **TECHNICAL IMPLEMENTATION:** Round/item timers; state machine tests; all-day aggregate query; Web Audio triggers; Wake Lock API.
- **EFFORT:** M. **PRIORITY:** High. **DEPENDENCIES:** A8.

## N8 — Online booking widget and reservation integrations
- **WHAT:** An embeddable booking widget/API, plus optional two-way sync with OpenTable/Resy/SevenRooms rather than competing head-on.
- **WHY:** There is no public booking surface; most restaurants already have a reservation channel and will not abandon it.
- **RESTAURANT OPERATIONAL IMPACT:** Guests book directly; existing channels keep working; the host sees one book.
- **END-USER EXPERIENCE:** A branded booking page and confirmations; no double entry.
- **COMMERCIAL IMPACT:** Removes an objection to switching and creates a partnership path.
- **TECHNICAL IMPLEMENTATION:** Public API with rate limits; availability service; webhook sync; consent and deposits.
- **EFFORT:** M. **PRIORITY:** Medium. **DEPENDENCIES:** N1, A4.

## N9 — Multi-location control plane
- **WHAT:** Tenant/location hierarchy, consolidated dashboard, shared menu with local price/86 overrides, central staff and per-site roles, device registry, audit export and support impersonation with consent.
- **WHY:** The Enterprise tier is priced but unsupported; one stack per site cannot serve groups.
- **RESTAURANT OPERATIONAL IMPACT:** A group can standardize menus and compare sites without rebuilding each location.
- **END-USER EXPERIENCE:** A location switcher and roll-up views; local overrides.
- **COMMERCIAL IMPACT:** Opens the highest-value segment and the $99/location line.
- **TECHNICAL IMPLEMENTATION:** Tenant model (A2), aggregate reporting, shared catalog, device registry, SSO later.
- **EFFORT:** Major. **PRIORITY:** Medium. **DEPENDENCIES:** A1, A2, N4.

## N10 — Menu import and guided first-run
- **WHAT:** CSV/Toast/Square menu importer with modifier groups, floor plan from a photo, staff CSV, and a "first shift" checklist that gates go-live.
- **WHY:** Activation is currently a developer task (seed, env, SQL); the guided-launch promise has no tooling.
- **RESTAURANT OPERATIONAL IMPACT:** A restaurant can go live in days, not weeks.
- **END-USER EXPERIENCE:** A step-by-step wizard with validation, preview and rollback.
- **COMMERCIAL IMPACT:** Supports the launch fee, shortens sales cycles and reduces professional-services cost.
- **TECHNICAL IMPLEMENTATION:** Import service + mapping UI; reuse seed patterns; turn `/setup` into an installer.
- **EFFORT:** L. **PRIORITY:** High. **DEPENDENCIES:** A7, N5.

---

# 13. FEATURES RECOMMENDED FOR REMOVAL

A lean, honest platform is more valuable than a bloated one. Remove or hide these until they are real. Every item below is either misleading, unused, duplicated, or a production hazard.

| Item | Why remove | Action |
|---|---|---|
| Visible demo GM login / one-click bypass | Any guest can become GM | Remove from production builds; env-gate a separate demo mode |
| Missing-header authorization bypass | Existence of the bypass is the vulnerability | Delete the bypass (A1) |
| Default PIN `1234` and plaintext PINs | Shared credentials; unreadable from DB protection | Hash, force change, unique per tenant |
| "Biometric sign-off" broadcast | Claims a capability that does not exist; labour/legal risk | Remove immediately |
| "Publish all" / "Sync Voice AI" success toasts | No-ops that report success | Hide until real; then implement upload/crop/embedding sync |
| Hardcoded "14 terminals synced" | Fabricated metric | Remove; report only real device counts |
| Hardcoded station directives in briefing | Tells staff fictional tasks every night | Generate from data or remove the block |
| Hardcoded labor forecast (`620 × shape`) | Managers staff on invented demand | Replace with history-based model or label "not configured" |
| Fixed cut saving `$17.5` | Fabricated recommendation | Compute from actual wage/role data |
| Simulated call duration/sentiment | Presented as telemetry | Remove until provider metrics exist |
| "Magic link sent" to `.local` and a name | Silently fails; false confirmation | Implement token route + real contact, or remove |
| "Notify" reservation toast | Guest never messaged; host misled | Wire to notifier or remove |
| `POST /api/kds/simulate/:tableId` | Demo affordance shipped in production | Remove from production builds |
| Stub swap approve/decline | Returns success, changes nothing | Implement or remove |
| Duplicate happy-hour menu items | Wrong-price risk; manual selection every service | Replace with daypart pricing |
| Duplicate 86 endpoints (`toggleMenuItem86` vs availability PATCH) | Two paths, one audited? neither | Consolidate into one audited action |
| Client-side permission defaults (`if (!staff) return true`) | Mirrors the server bypass | Remove; server is authoritative |
| `$0 Core with Chefuffle Payments` | No acquirer, terminal, PCI or settlement | Remove until a payments programme exists |
| Hardware bundles ($849/$249) | Implies procurement/RMA/MDM operations | Partner or drop |
| Multi-location/Enterprise pricing | No tenancy or roll-up capability | Keep as "coming soon" or remove |
| Two visual brands (marketing orange vs app palette) | Feels like two products | Choose one system or define a marketing variant |

# 14. COMMERCIAL OPPORTUNITIES

## 14.1 The commercial artifacts

`pricing-strategy.html` is the strongest document in the repository. It benchmarks Toast, Square, Lightspeed, TouchBistro, SpotOn and Clover with plausible late-2026 list prices; correctly observes that no vendor is truly all-in-one; chooses a defensible wedge (the operating loop and the close, not a feature-count war); and recommends per-location pricing, month-to-month terms, per-screen KDS, inventory/reservations expansion and 14-day module trials. The public pricing page expresses that strategy faithfully: Core $79, Growth $199, Pro $349, Full Stack $449, Enterprise $599 + $99/location, add-ons $19–$149, "$0 Core with Chefuffle Payments", guided launch $499, hardware from $849.

**The strategy is sound. The product cannot yet support the promises attached to it.**

## 14.2 Ideal customer profile

| Segment | Fit today | Why |
|---|---|---|
| 40–120-cover independent full-service, single location, $1–4M revenue | **Best fit** | Needs course timing, table service, split checks and a credible close; price-sensitive; hates per-terminal fees |
| 20–40-cover bistro / wine bar | Good | POS + floor + close is enough; KDS optional |
| Counter-service / QSR | Poor | No online ordering, loyalty or throughput model |
| Multi-unit groups (3–20 sites) | Not ready | No tenancy, roll-up, shared menu or central admin |
| Franchise / enterprise | Not ready | No SSO, audit, SLA, support tooling or compliance posture |
| Fine dining where reservations are the core | Partial | Calendar good; host flow and CRM are not |

The honest ICP is the owner-operator of one full-service room, currently on Toast or Square, who hates the close and will switch for a materially better service loop. That is a real, reachable market in Toronto and similar cities.

## 14.3 Packaging and pricing — strengths and problems

**Strengths:** per location rather than per terminal; month-to-month with an annual discount; inventory/reservations as expansion modules; KDS per screen; a guided-launch fee.

**Problems:**
- **The $0 plan is a payments deal, not a software plan.** It needs an acquirer, terminal estate, PCI programme, underwriting and residuals — none of which exist. Remove it or partner with an ISO/PSP.
- **No entitlement layer.** Every plan gets every feature. "2 KDS screens", "300 voice minutes", "14-day trial" and "API access" are copy, not software.
- **No billing.** No subscriptions, invoices, tax, dunning or usage metering.
- **À la carte arithmetic is confusing.** Growth-equivalent à la carte is ~$304 vs $199; Pro-equivalent ~$409+ vs $349.
- **Enterprise is unsupportable.** No multi-location capability, API keys or support operation.
- **Hardware is a distraction.** Selling tablets/printers/drawers requires procurement, RMA, MDM and installation.

**Recommended architecture:** Core $99; Growth $249 as the hero plan (KDS 2 screens, inventory, scheduling, close); Pro $399 (reservations, briefing, training, 3 KDS screens); Voice AI as a $199 add-on or per-minute only when it is a real agent; multi-location $149/site with a 3-site minimum only when tenancy ships; guided launch $1,250 with menu import; processor-neutral payments until a programme exists.

## 14.4 Competitive differentiation

| Competitor | CHEFUFFLE wins on | CHEFUFFLE loses on | Strategy |
|---|---|---|---|
| Toast | No per-terminal fee, month-to-month, close-out per server/slip, course holds, simpler pricing | Payments, hardware, payroll, online ordering, loyalty, delivery, reporting depth, support, brand | Compete on **the close and the service loop**, not breadth |
| Lightspeed | Simpler UX, lower total cost, course-aware KDS in Growth, Canadian on-prem story | Inventory depth, multi-location, e-commerce, payments, integrations | Win on time-to-live and nightly reconciliation |
| Square | Full-service table/course/seat model; stronger close | Price, payments, hardware, ecosystem, brand | Target restaurants that have outgrown Square's table service |
| OpenTable / Resy / SevenRooms | Owns the host/floor/close layer they do not | Turn times, deposits, CRM, online booking, review network | Do **not** position against them; integrate and sell the adjacent layer |
| MICROS / Aloha / Squirrel | Modern UX, transparent pricing, faster setup | Enterprise depth, hardware estate, integrations, support | Win independents, not chains |

## 14.5 The wedge

> "Your close takes 45 minutes and still doesn't balance. Ours takes 10 and tells you which server, which brand and which slip."

That is measurable, painful and unbundled by the majors. Lead with it. Do **not** lead with Voice AI, the floor-plan canvas, the mobile companion or AI narratives — they are demos, not purchase drivers.

## 14.6 Activation and retention

**Activation today is a developer task:** seed a database, edit env, upload a floor plan. There is no self-serve import. The fastest path is a done-for-you migration: menu CSV/Toast export → floor plan from a photo → staff CSV → one test order → one test close. Charge for it; it protects quality. Add an in-app "first shift" checklist that gates go-live. Turn `/setup` from a status board into an installer.

**Retention is thin once live:** no weekly insight, no labor savings report, no menu margin, no payroll, no guest marketing. Build:
- A Monday "week in review" (sales, covers, labor %, over/short, top sellers, 86 loss, table turn).
- A nightly Z-report email to the owner — the strongest cheap lock-in.
- Tip pooling/payroll export — embeds the product in payday.
- Reservation/SMS and guest history once the core is trusted.

## 14.7 Credibility gaps — claims vs capability

| Claim | Reality | Risk |
|---|---|---|
| "$0 Core with Chefuffle Payments at 2.79% + 15¢" | No acquirer, terminal, PCI or settlement | **High** — regulated-adjacent |
| "SMS confirmation" | Twilio optional; simulated otherwise; "Notify" never sends | **High** |
| "Voice AI answers the phone" | Turn-based Gather bot; no barge-in; weak time parsing | **High** |
| "Biometric sign-off" | No biometric clock exists | **High** — labour/legal |
| "Multi-location roll-up" | Single tenant env var | **High** |
| "Allergen flags directly to KDS" | Order-level only; false positives | **High** — safety |
| "API enforces the same matrix" | Anonymous bypass; many unguarded routes | **High** — security |
| "14 terminals synced" | Hardcoded | Medium |
| "API access $49" | No API keys or developer portal | Medium |
| "Basic reporting" | No reports page or export | Medium |
| "14-day trial on each module" | No entitlements or trial clock | Medium |
| "KDS — 2 screens" | No screen registration | Low |
| "Magic link sent" | `.local` URL; recipient is a name | Medium |

## 14.8 Multi-location / franchise readiness

**5% ready.** One `RESTAURANT_ID` env; no consolidated reporting, shared menu, central staff, per-location overrides, device registry, remote configuration, audit suitable for a franchise relationship, SLA, support desk or data-residency programme.

Minimum viable multi-site: tenant model + scoped sessions, consolidated dashboard, shared menu with local price/86 overrides, central staff + per-site roles, device registration, audit export, support impersonation. That is a **6–9 month programme**, not a pricing line.

## 14.9 What would actually make a restaurant switch and pay

1. A close that saves 30–45 minutes and eliminates over/short arguments — prove it in a two-week parallel pilot on their numbers.
2. Course-aware service that reduces remakes: working holds, per-item bump, all-day counts, a KDS a cook prefers.
3. No per-terminal tax.
4. Migration done for them: menu, floor, staff, history. Never "import it yourself".
5. Payment rate parity or better; otherwise stay processor-neutral and charge for software.
6. A named human and a 60-day exit.
7. One nightly artifact the owner trusts — the Z-report email.

What will not make them switch: Voice AI, a prettier floor plan, a mobile companion, or AI narratives.

---

# 15. PRIORITISED IMPLEMENTATION ROADMAP

Ordered by risk reduction and value per unit of effort. "Exit criteria" is what must be true to move on.

## Phase 0 — Stop the bleeding (1–2 weeks)
| # | Work | Effort | Exit criterion |
|---|---|---|---|
| 0.1 | Delete the missing-header bypass; deny by default for all mutating and sensitive routes | S | Unauthenticated request returns 401 on every non-public route |
| 0.2 | Remove visible demo GM login, demo PIN in UI, `kds/simulate`, stub swap endpoints from production builds | S | No bypass path exists in a production build |
| 0.3 | Fix `payOrder` to settle only the remaining balance; block paid voids without refund | S–M | Tests: partial→pay, reopen→repay, void-paid |
| 0.4 | Fix KDS mains detection to `orderItem.course === 'main'`; add a real-seed regression test | S | A burger/salmon/pasta on the seeded menu advances the table |
| 0.5 | Fix Hold (`held`), Recall (`bumped`), vanished bumped tickets | S | Hold/recall tests pass on the KDS |
| 0.6 | Remove or label every fabricated number: 14 terminals, forecast, directives, sentiment, magic link, Notify | S | No success toast without a persisted effect |
| 0.7 | Add route-permission coverage + real-seed + concurrency tests to CI | S–M | CI fails if a route is unguarded or a mains item cannot advance |
| 0.8 | Restore a clean working tree; document the demo-data boundary | S | `git status` clean; demo mode env-gated |

**Do not proceed to a paid pilot until Phase 0 is complete.**

## Phase 1 — Pilot-ready (3–6 weeks)
| # | Work | Effort | Exit criterion |
|---|---|---|---|
| 1.1 | Signed sessions, Argon2id PINs, lockout, server-resolved roles, idle timeout | L | Pen-test: no impersonation or header spoofing |
| 1.2 | Tenant decision + scoping on every query (single-tenant acceptable if documented) | L/Major | No bare-id IDOR; two-tenant test passes |
| 1.3 | Atomic inventory decrement, no zero clamp, ledger reconciliation | M | Concurrent-sale test keeps stock exact |
| 1.4 | Decimal/minor-unit money + configurable tax (13% HST if Ontario) | M | Receipt and remittance match jurisdiction |
| 1.5 | Versioned migrations + encrypted automated backups + restore drill + demo-only seed guard | M | Restore drill succeeds; `migrate deploy` in CI |
| 1.6 | Append-only audit log for voids/comps/reopens/stock/permissions | M | Manager audit view answers "who/why" |
| 1.7 | Seat-level allergens + per-item notes + KDS rendering | M | A seat-3 peanut allergy is unmissable and correctly attributed |
| 1.8 | Global 86 from any shell with reason/actor/restore | S–M | A stocked item can be 86'd in two taps |
| 1.9 | Persist close counts, lock the day, export CSV/Z-report | M | Count survives device change; day cannot silently change |
| 1.10 | Reservation conflict + capacity validation; fix double-seat; hide future-seat | M | Seed double-book and 8-on-6 are rejected |

**Pilot exit criteria:** a real restaurant can run a full service and close, with real money via an external terminal, and every void/comp is attributable.

## Phase 2 — Sellable (6–12 weeks)
| # | Work | Effort | Exit criterion |
|---|---|---|---|
| 2.1 | Real card-present processor (Stripe Terminal/Adyen/Moneris), webhooks, refunds, settlement | L | Card payment, refund and reconciliation end-to-end |
| 2.2 | Offline POS write queue with idempotent replay | L | Service continues through a Wi-Fi drop; no duplicate orders |
| 2.3 | Durable event outbox + reconnect resync + authenticated rooms | M | No ticket lost on crash/reconnect |
| 2.4 | Reporting suite + nightly Z-report + Monday review email | L | Owner runs the week from the product |
| 2.5 | Recipe costing/GP/menu engineering | M | Every dish shows cost, GP and food-cost % |
| 2.6 | Supplier/PO/receiving workflow | L | A delivery is received against a PO with an invoice cost |
| 2.7 | Billing/entitlements/trials/device metering | L | A customer can subscribe and be gated by plan |
| 2.8 | Menu import + guided first-run | L | A new restaurant goes live without engineering |
| 2.9 | Accessibility + touch-target pass; error boundaries; self-hosted fonts/icons | M | 48 px, focus, ARIA, zoom, contrast pass; offline icons work |
| 2.10 | Floor plan fit-to-width/pinch zoom/bottom sheet | M | Usable on a 10-inch tablet |
| 2.11 | Observability, rate limits, security headers, CI hardening | M | Incident detectable in minutes; abuse contained |

## Phase 3 — Scale (3–6 months)
| # | Work | Effort | Exit criterion |
|---|---|---|---|
| 3.1 | Multi-location control plane, roll-up, shared menu + local overrides | Major | A 3-site group runs centrally |
| 3.2 | Guest CRM + loyalty + consent | L | Repeat-guest history and preferences across bookings |
| 3.3 | Online booking widget + OpenTable/Resy integration | M | Direct and channel bookings in one book |
| 3.4 | Workforce depth: week roster, real swaps, breaks/OT, tip pooling, payroll export | L | GM plans and payroll runs from the product |
| 3.5 | Voice AI: partner for streaming or de-scope honestly | L | Either a real agent or no claim |
| 3.6 | Delivery/online-ordering integrations | L | Orders enter the same order/stock model |
| 3.7 | SLOs, support tooling, status page, DR drills | M | Enterprise procurement checklist met |

## Value-to-effort ordering (do in this sequence)

1. Remove the auth bypass + demo credentials (**hours**).
2. Fix `payOrder` double-charge and KDS mains detection (**days**).
3. Add the tests that would have caught them (**days**).
4. Atomic inventory + decimal/tax (**1–2 weeks**).
5. Session/PIN hardening + tenant scoping (**2–3 weeks**).
6. Persist the close + audit log (**2 weeks**).
7. Seat-level allergens + global 86 (**1 week**).
8. Real processor + offline queue (**the expensive, unavoidable core**).
9. Reporting + recipe costing + procurement (**the sellable expansion**).
10. Billing/entitlements, then multi-location (**commercial scale**).

# 16. FINAL PROFESSIONAL VERDICT

## 16.1 The direct answer

**No — I would not ship this as a commercial restaurant platform today, and I would not let a restaurant take money on it.** I would, however, invest in the team and the product thesis, because the hardest part — a coherent operational model that a restaurant person recognises — is already there.

This is the best kind of seed-stage hospitality demo: the screens are legible, the table/seat/course/check/close model is right, the close-out is the sharpest idea in the repository, and the core order → stock → 86 → KDS → floor loop is real code, not mock-ups. The 12/12 integration suite and the clean typecheck/build are genuine engineering signals.

It is also the most dangerous kind of production claim. It *looks* like a system that enforces permissions, captures money and survives a rush. It does not. The gap between the README/marketing and the code is now the largest commercial liability: anonymous access to staff PII and financials, a double-charge path, a flagship KDS integration that fails on the real menu, and a set of visible actions that report success while doing nothing.

## 16.2 If I were designing CHEFUFFLE from the ground up today

**I would keep:** the monorepo and stack choices; the table → seat → course → check → close data model; the close-out concept; the Nocturnal Command visual language; the per-location, month-to-month commercial posture; the local/on-prem deployment option; the seed based on a real menu.

**I would change before writing another feature:**
1. **Identity first.** Server-issued sessions, hashed PINs, deny-by-default routes, tenant context on every query. This is not hardening; it is the product's foundation.
2. **An append-only financial and stock core.** Money and stock are ledgers, not mutable columns. Idempotency keys on every money mutation; reversals, not edits; tax as configuration, not a constant.
3. **A real reservation/availability model** with turn times, conflict constraints and a guest record — or an explicit decision to integrate rather than build.
4. **Inventory that is truthful**: recipes for every sellable item including beverages, modifier deltas, yields, atomic decrements, counts, receiving and costing.
5. **Offline and durable events as first-class requirements**, not later optimizations. A restaurant's network fails; the product must not.
6. **Honesty as a design constraint.** If a capability is not real, the UI says "not configured", not "success". Every marketing claim should have a matching test.

**I would not add** Voice AI depth, a mobile companion, AI narratives or more floor-plan chrome until the money, inventory, reservations, offline and reporting cores are trusted.

## 16.3 Go / no-go

| Decision | Verdict |
|---|---|
| Use as a sales demo / fundable prototype | **Go.** It tells the story well; be explicit that it is a demo. |
| Use in an internal pilot on a trusted LAN, no live money | **Conditional go** after Phase 0 (remove bypass and demo credentials, fix double-charge, fix mains detection, add tests). |
| Use in a real restaurant taking real money | **No-go** until at least Phases 0 and 1 are complete, plus a real processor and offline path. |
| Sell as commercial SaaS | **No-go.** No billing, entitlements, tenancy, support tooling or payment programme. |
| Sell to multi-location / franchise | **No-go.** No tenancy or roll-up; the pricing tier is unsupported. |
| Claim PCI/SOC 2/GDPR/AODA compliance | **Do not.** No evidence exists; several controls are absent. |

## 16.4 Final scorecard

| Dimension | Grade |
|---|---|
| Product thesis and operational model | A− |
| UI craft and information architecture | B |
| Frontend engineering | B− |
| Backend architecture | C |
| Database design | D+ |
| POS correctness | D |
| Payments / financial integrity | F |
| Inventory / food cost | D− |
| Reservations / host | D |
| Workforce | D |
| Kitchen (KDS) | C− |
| Reporting / BI | F |
| Security | F |
| Reliability / offline | D |
| Scalability / multi-location | D+ |
| Observability / testing / CI | D− |
| Commercial readiness | D |
| **Overall** | **D / prototype** |

## 16.5 The one thing to do first

**Delete the authorization bypass and make the API deny by default.** It is hours of work, it removes an existential liability, and it makes every subsequent security and audit investment meaningful. The second thing is to add the two tests that would have caught the two most damaging bugs: a route-permission coverage test and a real-menu KDS mains regression test.

Then fix the money path. A restaurant will forgive a missing report; it will not forgive a double charge or a close that does not balance.

## 16.6 Closing statement

CHEFUFFLE has a real product idea and real craft. It does not yet have a system of record. The distance between those two things is not a feature backlog — it is identity, financial correctness, inventory truth, reservation integrity, offline resilience and honest claims. Close that distance and there is a credible, differentiated product for independent full-service restaurants. Skip it and the demo will keep winning meetings while losing the first dinner service.

---

# APPENDIX A — VERIFIED EVIDENCE LOG

| Command / check | Result | Tag |
|---|---|---|
| `pnpm typecheck` in `shift-happens/` | 4/4 packages successful | [Verified] |
| `pnpm --filter @shift-happens/api test` | 12/12 tests pass; 4.0 s | [Verified] |
| `pnpm --filter @shift-happens/web build` | Compiled successfully; 22 routes; first-load JS 87.1 kB shared | [Verified] |
| Start API with `API_PORT=4011` | Listening; `/api/health` → `{"status":"ok","db":"ok"}` | [Verified] |
| 12 unauthenticated GETs | All 200; staff PII, guest phones, financials, wages exposed | [Verified] |
| DB table/row inventory | 24 tables; counts listed in Section 0 | [Verified] |
| Recipes by category | 8 beverage categories + Classics = 0 recipes; 68 total across food | [Verified] |
| KDS category match | 0 of 21 categories match `MAIN_CATEGORIES` | [Verified] |
| Mains lacking `Signature` | 25 of 34 | [Verified] |
| `payOrder` source review | Inserts full-total payment regardless of prior payments | [Code] |
| `signOffBriefing` source review | Writes `allergenAcknowledged=true`, `haccpAcknowledged=true` | [Code] |
| `publishAllMedia` source review | `updateMany({ data: {} })`; returns `terminals: 14` | [Code] |
| `seatReservation` source review | Calls `seatTable`, then `updateReservation(status='seated')` calls it again | [Code] |
| Labor formula review | `hourlyBurn / order.total` over rolling 4 h; includes tax/tip | [Code] |
| PIN/session review | Plaintext PIN, default `1234`; unsigned base64 token | [Code] |
| Stripe/Twilio/Gemini/pgvector grep | No Stripe SDK; Twilio outbound only; Gemini optional; pgvector optional | [Verified] |
| Service worker review | `/api/` and non-GET excluded; no write queue | [Code] |
| `git status` at audit end | Clean (typecheck artifact restored) | [Verified] |

# APPENDIX B — AGENT REPORTS AND CONFLICT RESOLUTION

| Agent | Report | Headline |
|---|---|---|
| Agent 1 | `/tmp/chefuffle-audit/agent1-architecture.md` | No auth boundary; simulated payments; single-tenant, migrationless DB; no offline |
| Agent 2 | `/tmp/chefuffle-audit/agent2-operations.md` | Real service-floor core; demo-ware reservations/inventory; money and KDS mains failures |
| Agent 3 | `/tmp/chefuffle-audit/agent3-ux-spec-commercial.md` | ~60% surface / 35% credible / <15% production-ready; strongest artifact is the pricing study |

**Conflicts and resolutions:**

1. **Live auth probe.** Agent 1 could not start a server (port 4000 closed) and marked the bypass `[Code]/[Untested]`. The lead started the API on a spare port and confirmed all 12 sensitive endpoints return 200 with no credentials. **Resolution: the finding stands, upgraded to [Verified].**
2. **KDS assessment.** Agent 2 says the order→KDS transport, routing and bump work; Agent 3 says the KDS core loop is broken. Both are true at different layers. **Resolution: split the verdict — transport/routing ✅, state machine (hold/recall/per-item) 🚫, mains→floor 🚫 on the real menu.**
3. **Overall percentage.** Agent 3's 60/35/15 estimate, Agent 1's D/prototype grade and Agent 2's "strong prototype" are consistent at different granularities. **Resolution: present 60/35/15 as a directional independent estimate, and the D grade as the consolidated readiness verdict.**
4. **Beverage count.** Agent 2 cited 113 drink items; the lead's query found 107 across 8 explicit drink categories plus 6 `Classics` items with no recipe = 113. **Resolution: consistent; 113 is correct.**
5. **Working-tree artifact.** Agent 3 noted `tsconfig.tsbuildinfo` as modified. The lead's typecheck caused it; it was restored with `git checkout`. **Resolution: no source change; tree clean.**
6. **Payment-row counts.** Agent 1 reported 21 of 25 paid orders without payment rows; Agent 2 reported 4 orders with payment rows out of 29. **Resolution: consistent (25 paid, 4 with rows; legacy seeded paid orders carry tender fields only).**

# APPENDIX C — ASSUMPTIONS

1. The intended near-term deployment is one restaurant per stack; multi-location is aspirational.
2. `x-staff-id` and the missing-header bypass are intentional demo affordances, not an accidentally deleted auth layer. The security consequence is identical either way.
3. The seeded "Downtown Flagship" and C-JAYS menu represent the intended launch customer.
4. The 8% tax is a placeholder; the real jurisdiction is undecided. If Toronto/Ontario, HST is 13%.
5. `pricing-strategy.html` is internal strategy; the public pricing page is the commercial offer.
6. "Production-ready" means deployable to a real restaurant with real money; the README's "production-shaped" is a weaker claim.
7. The tablet/KDS client relies on Socket.io and does not independently poll, so missed events are user-visible until reload.
8. Prisma uses its default connection pool; no external pooler is assumed.
9. No third-party service is configured in the audited environment; integration conclusions describe code paths, not a configured production.
10. Restaurant scale for this audit is one to a few venues, tens of terminals, hundreds of open checks per day — not a national chain.

# APPENDIX D — WHAT COULD NOT BE TESTED

- **Rendered UI, hardware ergonomics and real browser behavior.** No dev server was run by the agents and no browser/tablet/printer was used; UI findings are source-derived. Contrast findings are computed from tokens, not screenshots.
- **Real Twilio/Gemini/SendGrid/Stripe calls.** All credentials are blank locally; only degraded paths are evidenced.
- **Production deployment state.** No access to the live server, its env, schema, backups or TLS configuration; `DEPLOYMENT.md` describes intent, not verified operation.
- **Redis adapter and multi-instance behavior under load.** `REDIS_URL` is empty locally; the adapter branch never executed.
- **Concurrency races.** Stock/payment race analysis is code-level reasoning, not an executed race (the integration suite is serial).
- **Screen-reader and WCAG conformance.** Source-level gaps assessed; no assistive-technology testing.
- **Lighthouse/Core Web Vitals and low-end tablet performance.**
- **Competitor side-by-side testing.** Benchmarks are professional judgements.
- **Menu document fidelity** (`MENU/C-JAYS RESTAURANT MENU.docx`) beyond seed claims; the .docx was not parsed.
- **Legal/commercial terms and competitor list prices** in the pricing study; treated as the author's research.
- **Hostinger/Render deployment execution.**

# APPENDIX E — KEY FILE INDEX

| Area | Evidence |
|---|---|
| Specification | `RESTAURANT MANAGEMENT SYSTEM BUILD PROMPT.md` |
| Schema | `shift-happens/packages/db/prisma/schema.prisma` |
| Seed / real menu | `shift-happens/packages/db/src/seed.ts` |
| POS / payments | `apps/api/src/services/pos-engine.ts`; `apps/web/src/app/pay/[id]/page.tsx` |
| KDS | `apps/api/src/services/kds-engine.ts`; `apps/web/src/app/kds/page.tsx` |
| Floor / stage | `apps/api/src/services/stage-engine.ts`; `apps/web/src/app/floor-plan/page.tsx` |
| Reservations | `apps/api/src/services/reservation-engine.ts`; `apps/web/src/app/reservations/page.tsx` |
| Inventory | `apps/api/src/services/inventory-engine.ts`; `apps/web/src/app/inventory/page.tsx` |
| Labour / scheduling | `apps/api/src/services/labor-engine.ts`, `scheduling-engine.ts`; `apps/web/src/app/scheduling/page.tsx` |
| Briefing / training | `apps/api/src/services/briefing-engine.ts`, `training-engine.ts` |
| Voice AI | `apps/api/src/services/voice-agent.ts`; `apps/web/src/app/voice-ai/page.tsx` |
| End of night | `apps/api/src/services/end-of-night-engine.ts`; `apps/web/src/app/end-of-night/page.tsx` |
| Auth | `apps/api/src/lib/staff-auth.ts`; `apps/api/src/services/auth-engine.ts`; `apps/web/src/lib/session.ts` |
| Realtime | `apps/api/src/realtime.ts`; `apps/web/src/lib/socket.ts` |
| Tests | `apps/api/test/integration.test.ts` |
| Design tokens | `apps/web/tailwind.config.cjs`; `stitch_shift_happens_design_system/nocturnal_command/DESIGN.md` |
| Marketing / pricing | `apps/web/src/app/page.tsx`; `apps/web/src/app/pricing/`; `pricing-strategy.html`; `README.md` |
| Deployment | `shift-happens/deploy/`; `DEPLOYMENT.md`; `SETUP.md`; `docker-compose.yml` |

---

*End of report. Prepared from three independent specialist audits plus lead runtime verification. No application source was modified; the repository working tree was clean at completion.*

**Awaiting your explicit approval before any implementation work begins.**
