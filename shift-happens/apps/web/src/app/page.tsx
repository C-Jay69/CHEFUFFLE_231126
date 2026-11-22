import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteHeader from '@/components/marketing/SiteHeader';

export const metadata: Metadata = {
  title: { absolute: 'Chefuffle — Restaurant Operations' },
  alternates: { canonical: '/' },
  description:
    'Run the restaurant. Skip the kerfuffle. Chefuffle connects the floor, the kitchen, the check and the close in real time — table service, course-aware KDS, split payments, close-out and voice AI in one system.',
};

const TABLES = [
  { number: 'T-01', state: 'Entrée', className: 'border-rose-400/40 bg-rose-400/10 text-rose-200' },
  { number: 'T-02', state: 'Ready', className: 'border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200' },
  { number: 'BAR-01', state: 'Starters', className: 'border-rose-400/40 bg-rose-400/10 text-rose-200' },
  { number: 'T-03', state: 'Ready', className: 'border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200' },
  { number: 'T-04', state: 'Mains', className: 'border-rose-400/40 bg-rose-400/10 text-rose-200' },
  { number: 'WS-01', state: 'Ready', className: 'border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200' },
  { number: 'T-05', state: 'Reserved', className: 'border-amber-300/40 bg-amber-300/10 text-amber-200' },
  { number: 'T-06', state: 'Dessert', className: 'border-rose-400/40 bg-rose-400/10 text-rose-200' },
  { number: 'P-01', state: 'Ready', className: 'border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200' },
];

const MODULES = [
  {
    icon: 'room_service',
    name: 'Serve',
    copy: 'Table → covers → guest by guest. Starters and mains split by course automatically.',
  },
  {
    icon: 'skillet',
    name: 'Kitchen',
    copy: 'Course-aware tickets, station routing, holds, fire mains, bump and recall.',
  },
  {
    icon: 'table_restaurant',
    name: 'Floor plan',
    copy: 'Drag tables onto your own uploaded plan. Design once, run service on it.',
  },
  {
    icon: 'book_online',
    name: 'Reservations',
    copy: 'Day, week, month and year views, waitlist, VIP flags and SMS confirmation.',
  },
  {
    icon: 'inventory_2',
    name: 'Inventory',
    copy: 'Recipe depletion, stock counts, auto-86 and purchase orders from the same sales.',
  },
  {
    icon: 'calendar_month',
    name: 'Scheduling',
    copy: 'Shifts, clock in and out, labor pacing and early-cut recommendations.',
  },
  {
    icon: 'nightlife',
    name: 'End of Night',
    copy: 'Server tallies, card-brand slip counts, gift cards, cash due, bar till and over/short.',
  },
  {
    icon: 'neurology',
    name: 'Voice AI',
    copy: 'Answers the phone, checks live availability, books the table and knows the 86 list.',
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Seat',
    copy: 'Tap the table, set the covers, and the room moves. Or take the reservation straight from the host view.',
  },
  {
    number: '02',
    title: 'Order',
    copy: 'Guest by guest, with required modifiers and add-ons priced on the option, not on a duplicate menu item.',
  },
  {
    number: '03',
    title: 'Fire',
    copy: 'Starters fire immediately. Food mains hold until the kitchen fires them — the KDS shows the same break.',
  },
  {
    number: '04',
    title: 'Close',
    copy: 'Split by guest or evenly, take part card and part cash, then reconcile every drawer against the computer total.',
  },
];

const PRICING = [
  {
    name: 'Core',
    price: '$79',
    note: 'or $0 with Chefuffle Payments',
    bullets: ['POS, menu and tables', 'Open checks and payments', 'Staff PINs and permissions'],
    href: '/pricing',
  },
  {
    name: 'Growth',
    price: '$199',
    note: 'KDS, inventory, scheduling, close-out',
    bullets: ['Everything in Core', 'KDS — 2 screens', 'Inventory, scheduling, End of Night'],
    href: '/pricing',
  },
  {
    name: 'Pro',
    price: '$349',
    note: 'The full-service room',
    bullets: ['Everything in Growth', 'KDS — 3 screens', 'Reservations, onboarding, briefing'],
    href: '/pricing',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#060a13] text-text-primary">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#4cd7f6]/10 blur-[150px]" />
          <div className="pointer-events-none absolute right-[-120px] top-40 h-[360px] w-[360px] rounded-full bg-[#ff8a1f]/10 blur-[130px]" />

          <div className="relative mx-auto grid w-full max-w-7xl gap-14 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-12 lg:px-8 lg:pb-28 lg:pt-24">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-2 font-label-badge text-label-badge uppercase tracking-[0.18em] text-text-tertiary">
                <span className="h-2 w-2 rounded-full bg-[#ff8a1f]" />
                Run the restaurant. Skip the kerfuffle.
              </div>

              <h1 className="font-headline-xl text-[clamp(2.35rem,4.6vw,3.8rem)] font-black leading-[1.02] tracking-[-0.035em]">
                Run the whole shift
                <br />
                from <span className="text-[#ff8a1f]">one screen.</span>
              </h1>

              <p className="max-w-xl font-body-lg text-body-lg leading-relaxed text-text-secondary">
                Chefuffle connects the floor, the kitchen, the check and the close in
                real time. Take an order guest by guest, fire courses, split the bill,
                and reconcile the night without leaving the app.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/pricing"
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 font-body-base text-body-base font-bold text-[#0c1322] transition-colors hover:bg-white/90"
                >
                  See pricing
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </Link>
                <Link
                  href="/serve"
                  className="flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-6 font-body-base text-body-base font-bold text-text-primary transition-colors hover:bg-white/[0.07]"
                >
                  <span className="material-symbols-outlined text-[20px] text-[#4cd7f6]">
                    play_arrow
                  </span>
                  Open the terminal
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 font-body-sm text-body-sm text-text-tertiary">
                <span>Month-to-month</span>
                <span className="h-1 w-1 rounded-full bg-white/20" />
                <span>Per location, not per terminal</span>
                <span className="h-1 w-1 rounded-full bg-white/20" />
                <span>Start with just the POS</span>
              </div>
            </div>

            {/* Product mock */}
            <div className="relative mx-auto w-full max-w-[560px]">
              <div className="rounded-2xl border border-white/10 bg-[#0a1120] p-3 shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2">
                    <img src="/chefuffle-wordmark.png" alt="" className="h-4 w-auto" />
                    <span className="font-label-badge text-[9px] uppercase tracking-widest text-white/40">
                      Downtown Flagship
                    </span>
                  </div>
                  <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 font-label-badge text-[9px] uppercase tracking-widest text-emerald-300">
                    Live
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-5 gap-2">
                  <div className="col-span-3 rounded-xl border border-white/10 bg-[#080e19] p-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-label-badge text-[8px] uppercase tracking-widest text-white/35">
                        Floor
                      </span>
                      <span className="font-mono text-[8px] text-white/35">9 / 24</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {TABLES.map((table) => (
                        <div
                          key={table.number}
                          className={`flex flex-col gap-0.5 rounded-md border px-1.5 py-1 ${table.className}`}
                        >
                          <span className="font-mono text-[9px] font-bold">{table.number}</span>
                          <span className="text-[7px] uppercase tracking-wide opacity-80">
                            {table.state}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="col-span-2 flex flex-col rounded-xl border border-white/10 bg-[#080e19] p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-label-badge text-[8px] uppercase tracking-widest text-white/35">
                        Expo
                      </span>
                      <span className="font-mono text-[8px] text-white/35">#228</span>
                    </div>
                    <div className="mt-1 flex flex-col gap-1 font-mono text-[9px] text-white/75">
                      <span className="font-bold text-white">T-01 · 2 covers</span>
                      <span>2× Ribeye</span>
                      <span className="text-[8px] text-white/40">Temp: Medium Rare</span>
                      <span>1× Negroni</span>
                      <span className="text-center text-[8px] tracking-[0.2em] text-white/25">
                        **************
                      </span>
                      <span>2× Truffle Fries</span>
                    </div>
                    <div className="mt-auto flex flex-col gap-1 pt-2">
                      <span className="rounded-md bg-[#4cd7f6] py-1 text-center text-[8px] font-bold text-[#04121a]">
                        Fire mains
                      </span>
                      <span className="rounded-md bg-emerald-400 py-1 text-center text-[8px] font-bold text-[#04150b]">
                        Bump
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {[
                    ['Visa', '4 · $219.00'],
                    ['Mastercard', '4 · $751.40'],
                    ['Cash due', '$450.97'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-[#080e19] px-2 py-1.5">
                      <span className="block font-label-badge text-[7px] uppercase tracking-widest text-white/35">
                        {label}
                      </span>
                      <span className="font-mono text-[9px] font-bold text-white/80">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 text-center font-label-badge text-[7px] uppercase tracking-[0.18em] text-white/25">
                  Sample service
                </div>
              </div>

              <div className="absolute -left-7 top-1/3 hidden rounded-lg border border-white/10 bg-[#0b1220] px-2.5 py-1.5 shadow-xl sm:block">
                <span className="block font-label-badge text-[8px] uppercase tracking-widest text-white/35">
                  Check #263
                </span>
                <span className="font-mono text-[10px] font-bold text-white">$342.40 · Paid</span>
              </div>
              <div className="absolute -right-3 -top-3 h-3 w-3 rounded-full bg-[#ff8a1f] shadow-[0_0_18px_rgba(255,138,31,0.65)]" />
            </div>
          </div>
        </section>

        {/* Modules */}
        <section id="modules" className="border-b border-white/10">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
            <div className="flex max-w-3xl flex-col gap-3">
              <span className="font-label-badge text-label-badge uppercase tracking-[0.18em] text-[#4cd7f6]">
                The modules
              </span>
              <h2 className="font-headline-xl text-[clamp(2rem,4vw,3rem)] font-black leading-[1.05] tracking-[-0.03em]">
                Everything after the order.
              </h2>
              <p className="font-body-base text-body-base leading-relaxed text-text-secondary">
                Turn on what the room needs. A counter-service diner can run on the POS
                alone; a full-service floor can switch on the kitchen, the cellar, the
                book and the close.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {MODULES.map((module) => (
                <div
                  key={module.name}
                  className="group flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <span className="material-symbols-outlined text-[22px] text-[#ff8a1f]">
                    {module.icon}
                  </span>
                  <span className="font-headline-md text-headline-md font-bold">{module.name}</span>
                  <p className="font-body-sm text-body-sm leading-relaxed text-text-tertiary">
                    {module.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Shift loop */}
        <section id="product" className="border-b border-white/10 bg-[#08101d]">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div className="flex flex-col gap-3 lg:sticky lg:top-24">
                <span className="font-label-badge text-label-badge uppercase tracking-[0.18em] text-[#4cd7f6]">
                  The shift loop
                </span>
                <h2 className="font-headline-xl text-[clamp(2rem,4vw,3rem)] font-black leading-[1.05] tracking-[-0.03em]">
                  One loop, four moves.
                </h2>
                <p className="max-w-md font-body-base text-body-base leading-relaxed text-text-secondary">
                  Most systems stop at the ticket. Chefuffle carries the table from the
                  first seat to the last slip — the data your team needs is already on
                  the same check.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {STEPS.map((step) => (
                  <div
                    key={step.number}
                    className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-5"
                  >
                    <span className="font-mono text-[12px] font-bold text-[#ff8a1f]">
                      {step.number}
                    </span>
                    <span className="font-headline-md text-headline-md font-bold">{step.title}</span>
                    <p className="font-body-sm text-body-sm leading-relaxed text-text-tertiary">
                      {step.copy}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Why */}
        <section id="why" className="border-b border-white/10">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
            <div className="flex max-w-3xl flex-col gap-3">
              <span className="font-label-badge text-label-badge uppercase tracking-[0.18em] text-[#4cd7f6]">
                Why it feels different
              </span>
              <h2 className="font-headline-xl text-[clamp(2rem,4vw,3rem)] font-black leading-[1.05] tracking-[-0.03em]">
                The details your team feels at 9pm.
              </h2>
            </div>

            <div className="mt-10 grid gap-3 md:grid-cols-2">
              {[
                {
                  title: 'No duplicate checks',
                  copy: 'Tapping a table that already has a check opens that check. Add a round, split it, settle it — the table never grows a second ticket.',
                  icon: 'table_restaurant',
                },
                {
                  title: 'Courses are native',
                  copy: 'Starters fire the moment the round lands. Food mains hold until the kitchen fires them, and the KDS shows the same break the server saw.',
                  icon: 'skillet',
                },
                {
                  title: 'The night reconciles',
                  copy: 'Every server drawer shows sales, slip counts by card brand, gift cards and the cash they owe. The bar till reconciles alongside it.',
                  icon: 'nightlife',
                },
                {
                  title: 'Roles that hold',
                  copy: 'Positions set what a person can open. A server on shift sees the table plan; a manager sees the floor, the voids and the close.',
                  icon: 'badge',
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-6"
                >
                  <span className="material-symbols-outlined text-[24px] text-[#4cd7f6]">
                    {card.icon}
                  </span>
                  <span className="font-headline-md text-headline-md font-bold">{card.title}</span>
                  <p className="max-w-lg font-body-sm text-body-sm leading-relaxed text-text-tertiary">
                    {card.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Voice AI */}
        <section className="border-b border-white/10 bg-[#08101d]">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-24">
            <div className="flex flex-col gap-4">
              <span className="font-label-badge text-label-badge uppercase tracking-[0.18em] text-[#4cd7f6]">
                Voice AI
              </span>
              <h2 className="font-headline-xl text-[clamp(2rem,4vw,3rem)] font-black leading-[1.05] tracking-[-0.03em]">
                It answers the phone, too.
              </h2>
              <p className="max-w-lg font-body-base text-body-base leading-relaxed text-text-secondary">
                The concierge checks live availability, knows tonight&apos;s 86 list,
                answers the questions your team repeats all night, and books the table
                straight into the floor plan.
              </p>
              <ul className="flex flex-col gap-2 font-body-sm text-body-sm text-text-tertiary">
                {[
                  'Reservations with live table availability',
                  'Allergens, hours, parking and menu answers from your knowledge base',
                  'Never promises an 86ed dish',
                  'Every call logged with outcome and transcript',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff8a1f]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0a1120] p-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-label-badge text-[9px] uppercase tracking-widest text-white/35">
                  Inbound call · 00:42
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-white/[0.05] px-3 py-2 font-body-sm text-[12px] text-white/80">
                  Hi, do you have a table for four around 7:30 tonight?
                </div>
                <div className="ml-auto max-w-[88%] rounded-xl rounded-tr-sm bg-[#4cd7f6]/15 px-3 py-2 font-body-sm text-[12px] text-[#bff3ff]">
                  I have the patio at 7:30 or the dining room at 7:45. Would you like me
                  to hold the patio?
                </div>
                <div className="max-w-[70%] rounded-xl rounded-tl-sm bg-white/[0.05] px-3 py-2 font-body-sm text-[12px] text-white/80">
                  Patio works. Under Ellis.
                </div>
                <div className="ml-auto flex max-w-[88%] flex-col gap-1 rounded-xl rounded-tr-sm bg-emerald-400/10 px-3 py-2 font-body-sm text-[12px] text-emerald-200">
                  <span>Booked · Patio 12 · 4 guests · 7:30 PM</span>
                  <span className="font-mono text-[10px] text-emerald-300/70">
                    SMS confirmation sent
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing teaser */}
        <section className="border-b border-white/10">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex max-w-2xl flex-col gap-3">
                <span className="font-label-badge text-label-badge uppercase tracking-[0.18em] text-[#4cd7f6]">
                  Pricing
                </span>
                <h2 className="font-headline-xl text-[clamp(2rem,4vw,3rem)] font-black leading-[1.05] tracking-[-0.03em]">
                  Start with the till. Add the shift.
                </h2>
                <p className="font-body-base text-body-base leading-relaxed text-text-secondary">
                  Per location, month-to-month. Begin with the POS and switch modules on
                  as the room grows.
                </p>
              </div>
              <Link
                href="/pricing"
                className="flex h-11 items-center gap-2 rounded-lg border border-white/15 px-4 font-body-sm text-body-sm font-bold text-text-primary transition-colors hover:bg-white/5"
              >
                Full pricing
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
            </div>

            <div className="mt-10 grid gap-3 md:grid-cols-3">
              {PRICING.map((tier) => (
                <Link
                  key={tier.name}
                  href={tier.href}
                  className="group flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-[#4cd7f6]/40 hover:bg-white/[0.04]"
                >
                  <span className="font-headline-md text-headline-md font-bold">{tier.name}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-3xl font-bold">{tier.price}</span>
                    <span className="font-body-sm text-body-sm text-text-tertiary">/mo</span>
                  </div>
                  <span className="font-body-sm text-[12px] text-text-tertiary">{tier.note}</span>
                  <ul className="mt-1 flex flex-col gap-1.5 border-t border-white/10 pt-3 font-body-sm text-[13px] text-text-tertiary">
                    {tier.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#ff8a1f]" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </Link>
              ))}
            </div>
            <p className="mt-4 font-body-sm text-[12px] text-text-subtle">
              Full Stack adds Voice AI at $449. Enterprise and multi-location from $599 +
              $99 per extra location.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[700px] -translate-x-1/2 rounded-full bg-[#4cd7f6]/10 blur-[120px]" />
          <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-5 px-4 py-24 text-center sm:px-6 lg:px-8">
            <img src="/chefuffle-wordmark.png" alt="Chefuffle" className="h-9 w-auto" />
            <span className="font-body-sm text-body-sm font-bold text-text-secondary">Run the restaurant. Skip the kerfuffle.</span>
            <h2 className="font-headline-xl text-[clamp(2.2rem,5vw,3.6rem)] font-black leading-[1.02] tracking-[-0.03em]">
              The whole shift is already on the check.
            </h2>
            <p className="max-w-xl font-body-base text-body-base leading-relaxed text-text-secondary">
              Open the terminal and walk a table from seat to close in one system.
            </p>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Link
                href="/serve"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 font-body-base text-body-base font-bold text-[#0c1322] transition-colors hover:bg-white/90"
              >
                Open the terminal
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </Link>
              <Link
                href="/pricing"
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-6 font-body-base text-body-base font-bold text-text-primary transition-colors hover:bg-white/5"
              >
                Compare plans
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
