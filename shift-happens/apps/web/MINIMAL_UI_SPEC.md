# Minimal UI spec — SHIFT HAPPENS! server screens

The goal is a clean, fast, touch-friendly operations app. Remove decorative or
duplicated telemetry. Every page should answer one question and expose the
actions a server/manager actually needs on a shift.

## Hard rules

1. Use `AppShell` from `@/components/AppShell`. It already renders the sidebar
   and top bar. Do not add another sidebar or brand header.
2. Use the shared kit from `@/components/ui` (Button, Badge, Card, EmptyState,
   Modal, PageHeader, Progress, SearchInput, Stat, Tabs, Avatar).
3. Create ONLY the files assigned to you:
   - `apps/web/src/app/<route>/page.tsx`
   - optional page-specific components under
     `apps/web/src/components/<route>/...`
   Do NOT edit shared components, `AppShell`, `lib/*`, `types.ts`, the API,
   Prisma, `tailwind.config.cjs`, or another agent's route.
4. Pages are client components (`'use client';`) because they fetch and mutate
   live data.
5. No legacy `ScreenShell`, binders, `screens.generated.json`, or static design
   markup. Build the page with React + the shared kit.
6. Use the Nocturnal Command tokens (Tailwind classes):
   colors `bg-bg-canvas`, `bg-surface-container-low`, `bg-surface-container`,
   `bg-surface-container-high`, `bg-surface-container-highest`,
   `border-border-subtle`, `text-text-primary/secondary/tertiary/subtle`,
   `text-secondary`, `text-accent-purple-glow`, `text-accent-cyan-bright`,
   `text-accent-lime`, `text-status-ready/caution/urgent/info`;
   fonts `font-headline-xl`, `font-headline-lg`, `font-headline-md`,
   `font-body-base`, `font-body-sm`, `font-label-badge`,
   `font-mono-metric-lg/md/sm`.
7. Layout: wrap content in
   `<div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">`.
   Use standard Tailwind spacing for the rest (`gap-3`, `p-4`, `mt-2`).
8. Keep each page to at most 3–4 Stat tiles. Prefer one main list/table and one
   supporting card. No decorative charts, tickers, or duplicate KPI shelves.
9. Minimum touch height 44px for interactive controls. Use `Button` (h-11/h-12),
   or `h-11`/`h-12` classes.
10. Handle loading, empty, and error states. Use `EmptyState` and toasts.
11. Real-time: subscribe with `listen(event, handler)` from `@/lib/socket`;
    it returns an unsubscribe function. Clean it up in `useEffect`.
12. Run `pnpm --filter @shift-happens/web typecheck` from the repo root
    (`shift-happens`), and fix errors in your files. Do not start dev servers,
    run builds, or modify the database.

## Shared kit API

```tsx
import {
  Avatar, Badge, Button, Card, EmptyState, Modal, PageHeader, Progress,
  SearchInput, Stat, Tabs,
} from '@/components/ui';

<PageHeader eyebrow="Live floor" icon="table_restaurant" title="Floor Plan"
  description="Tap a table to seat or open its check."
  actions={<Button variant="primary" icon="add">New</Button>} />

<Stat label="On shift" value={8} icon="group" tone="ready" hint="3 scheduled" />

<Card title="Tickets" icon="receipt_long" actions={<Badge tone="urgent">2 overdue</Badge>}>
  ...
</Card>

<Button variant="primary|secondary|ghost|danger|success" size="sm|md|lg"
  icon="edit" loading={busy}>Label</Button>

<Badge tone="ready|caution|urgent|info|neutral|violet|lime">Status</Badge>

<Tabs value={tab} onChange={setTab}
  items={[{ id: 'all', label: 'All', count: 12 }, ...]} />

<Modal open={open} onClose={() => setOpen(false)} title="New reservation"
  icon="book_online" footer={<><Button ...>Cancel</Button><Button ...>Save</Button></>}>
  ...
</Modal>

<EmptyState icon="inbox" title="Nothing here" description="..." action={<Button .../>} />
<Progress value={72} tone="secondary|ready|caution|urgent|primary" />
<SearchInput value={query} onChange={setQuery} placeholder="Search..." />
<Avatar name="Zach Arroyo" size="sm|md|lg" />
```

Helpers:

```ts
import { api } from '@/lib/api';           // api.get/post/patch
import { listen } from '@/lib/socket';     // live events
import { showToast } from '@/lib/toast';   // showToast(message, 'success'|'error'|'warn'|'info')
import { playChime } from '@/lib/audio';   // optional
import { money, timeLabel, dateLabel, relativeMinutes, initials, titleCase } from '@/lib/format';
```

Types are in `apps/web/src/lib/types.ts`. If a response field is missing there,
define a local interface in your page and keep it narrow; do not edit types.ts.

## Reference page

Read `apps/web/src/app/serve/page.tsx` for the visual language: table map →
cover picker → guest-by-guest ordering. Match its spacing, card borders,
typography, and button hierarchy.

## API map (all prefixed with `/api` by the client)

- POS/orders: `GET /orders?limit=50`, `POST /orders/:id/pay`, `POST /orders/:id/void`.
- Menu: `GET /menu`, `PATCH /menu/:id/availability`.
- KDS: `GET /kds/tickets?station=expo|grill|saute_fryer|cold_larder|pastry_dessert|bar`,
  `GET /kds/counts`, `POST /kds/bump` (`{orderId, station?, action: 'bump'|'recall'|'hold'}`).
- Tables: `GET /tables`, `POST /tables/:id/seat`, `PATCH /tables/:id/stage`,
  `POST /tables/:id/advance`, `POST /tables/:id/reset`.
- Reservations: `GET /reservations`, `POST /reservations`, `PATCH /reservations/:id`,
  `POST /reservations/:id/seat`.
- Inventory: `GET /inventory`, `POST /inventory/adjust`,
  `GET /inventory/purchase-orders`, `POST /inventory/purchase-orders/approve`.
- Scheduling: `GET /shifts`, `POST /shifts`, `POST /shifts/:id/clock-in`,
  `POST /shifts/:id/clock-out`, `POST /labor/broadcast-cut`, `GET /labor/pacing`.
- Briefing: `GET /briefing`, `POST /briefing/signoff/:shiftId`,
  `POST /briefing/narrative`, `POST /briefing/biometric-broadcast`.
- Training: `GET /training`, `POST /training/enroll`, `POST /training/progress`.
- Architect: `GET /architect`, `POST /architect/publish`,
  `POST /architect/publish-all`, `POST /architect/sync-voice`.
- Voice calls (optional): `GET /voice/calls`.
- Auth: `GET /auth/staff`, `POST /auth/pin`.

Realtime events: `KDS_NEW_TICKET`, `KDS_TICKET_UPDATED`, `KDS_TICKET_BUMPED`,
`TABLE_STAGE_ADVANCED`, `TABLE_UPDATED`, `GLOBAL_86_ITEM_UPDATE`,
`LOW_STOCK_ALERT`, `INVENTORY_UPDATED`, `LABOR_PACING_UPDATE`,
`RESERVATION_CREATED`, `RESERVATION_UPDATED`, `BRIEFING_UPDATED`.

## Tone

Service staff are on their feet in low light. Use large type, clear statuses,
short labels, one obvious primary action per screen. If a panel is explanatory
or duplicated elsewhere, remove it.
