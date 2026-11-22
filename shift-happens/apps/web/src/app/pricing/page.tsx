import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteHeader from '@/components/marketing/SiteHeader';
import PricingPlans from './PricingPlans';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Whiteout pricing: a $79 Core POS or $0 with Whiteout Payments, modular add-ons, Growth at $199, Pro at $349 and Full Stack at $449 — per location, month-to-month.',
};

const ADDONS = [
  { name: 'Kitchen display', price: '$29', unit: '/ screen / mo', copy: 'Course-aware KDS, holds, fire mains, bump and recall.' },
  { name: 'Inventory & recipes', price: '$99', unit: '/ mo', copy: 'Recipe depletion, counts, auto-86 and purchase orders.' },
  { name: 'Reservations', price: '$59', unit: '/ mo', copy: 'Calendar, waitlist, table assignment, SMS confirmation.' },
  { name: 'Scheduling & labor', price: '$39', unit: '/ mo', copy: 'Shifts, clock in/out, pacing and early-cut advice.' },
  { name: 'End of Night', price: '$29', unit: '/ mo', copy: 'Server tallies, slip counts, cash due and over/short.' },
  { name: 'Onboarding & training', price: '$19', unit: '/ mo', copy: 'Employee records, permissions, tracks and badges.' },
  { name: 'Briefing', price: '$19', unit: '/ mo', copy: 'Lineup, 86 watch, VIPs, directives and sign-off.' },
  { name: 'Voice AI', price: '$149', unit: '/ mo', copy: 'Phone concierge, 300 minutes included, then $0.12/min.' },
  { name: 'Multi-location', price: '$49', unit: '/ extra location', copy: 'Roll-up reporting, shared menu and staff.' },
  { name: 'API access', price: '$49', unit: '/ mo', copy: 'Partner and data access for your own stack.' },
];

const COMPARISON = [
  ['POS + payments', '$0–$399 / mo', 'Included in Core'],
  ['Kitchen display', '$20–$30 / screen', '$29 / screen'],
  ['Scheduling & labor', '$45–$150 / mo', 'Growth onwards'],
  ['Inventory & recipes', '$249–$449 / mo', 'Growth onwards'],
  ['Reservations', '$149–$499 / mo + $1 / cover', 'Pro onwards'],
  ['Assembled stack', '$600–$1,000+ / mo', 'Pro from $349'],
];

const FAQ = [
  {
    q: 'Is pricing per location or per terminal?',
    a: 'Per location. A location can run as many handhelds and terminals as the room needs; only kitchen display screens are priced individually because each screen is a real device.',
  },
  {
    q: 'Can we start with just the POS and menu?',
    a: 'Yes. Core is the POS, the menu, the tables, the payment screen and staff permissions. KDS, inventory, reservations, scheduling, close-out and voice AI switch on when you want them, with a 14-day trial on each module.',
  },
  {
    q: 'What is the difference between $0 Core and $79 Core?',
    a: '$0 Core bundles Whiteout Payments at 2.79% + 15¢ card-present. $79 Core lets you keep a lower 2.49% + 15¢ processing rate. If you bring your own processor, Core is $79 plus $29/mo.',
  },
  {
    q: 'Do we have to use Whiteout Payments?',
    a: 'No. Bring your own processor for $29/mo on top of Core. Whiteout Payments is the path that makes the software free.',
  },
  {
    q: 'Is there really no long contract?',
    a: 'Standard plans are month-to-month with 30 days of notice. Annual billing takes 15% off the software if you prefer to prepay; it is a discount, not a lock-in. Enterprise agreements run annually after the first year.',
  },
  {
    q: 'What does Voice AI include?',
    a: 'Inbound calls, live availability, reservations with SMS confirmation, answers from your knowledge base, an 86-aware menu and call logs. 300 minutes are included each month, then $0.12/min.',
  },
  {
    q: 'What hardware do we need?',
    a: 'A tablet or terminal, a receipt printer and a cash drawer if you take cash. Bring your own or order a station bundle from $849; a KDS screen is $249.',
  },
  {
    q: 'How do we launch?',
    a: 'Self-serve launch is $0: import the menu, draw the floor plan and add staff. Guided launch is $499 and includes menu import, the floor plan, staff and permissions, training and your first close-out.',
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#060a13] text-text-primary">
      <SiteHeader />

      <main>
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[800px] -translate-x-1/2 rounded-full bg-[#4cd7f6]/10 blur-[140px]" />
          <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-4 pb-14 pt-16 text-center sm:px-6 lg:px-8 lg:pt-24">
            <span className="font-label-badge text-label-badge uppercase tracking-[0.18em] text-[#4cd7f6]">
              Pricing
            </span>
            <h1 className="font-headline-xl text-[clamp(2.4rem,5vw,4rem)] font-black leading-[1.02] tracking-[-0.035em]">
              Start with the till.
              <br />
              Add the shift.
            </h1>
            <p className="max-w-2xl font-body-base text-body-base leading-relaxed text-text-secondary">
              One price per location, month-to-month. Switch modules on when the room
              grows — nothing is bundled that you did not ask for.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-body-sm text-[12px] text-text-tertiary">
              <span>USD · per location</span>
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span>15% off annual</span>
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span>No multi-year contract</span>
            </div>
          </div>
        </section>

        <section className="border-b border-white/10">
          <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <PricingPlans />

            <div className="mt-10 grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-xl border border-[#ff8a1f]/25 bg-[#ff8a1f]/[0.05] p-5">
                <span className="font-label-badge text-[10px] uppercase tracking-widest text-[#ff8a1f]">
                  Payments-included path
                </span>
                <span className="font-headline-md text-headline-md font-bold">
                  $0 Core · 2.79% + 15¢
                </span>
                <p className="font-body-sm text-[13px] leading-relaxed text-text-tertiary">
                  The software is free when Whiteout Payments handles card-present
                  transactions. Same Core features, no monthly subscription.
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <span className="font-label-badge text-[10px] uppercase tracking-widest text-[#4cd7f6]">
                  Lower-rate path
                </span>
                <span className="font-headline-md text-headline-md font-bold">
                  $79 Core · 2.49% + 15¢
                </span>
                <p className="font-body-sm text-[13px] leading-relaxed text-text-tertiary">
                  Pay for the software and keep the lower card rate. Bring your own
                  processor instead for $79 + $29/mo.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-white/10 bg-[#08101d]">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="flex max-w-2xl flex-col gap-3">
              <span className="font-label-badge text-label-badge uppercase tracking-[0.18em] text-[#4cd7f6]">
                Add-ons
              </span>
              <h2 className="font-headline-xl text-[clamp(1.9rem,3.6vw,2.6rem)] font-black leading-[1.06] tracking-[-0.03em]">
                Pay for the modules you switch on.
              </h2>
              <p className="font-body-sm text-body-sm leading-relaxed text-text-tertiary">
                Add-ons are available on Core and included in the bundles above. The
                annual discount applies to add-ons too.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ADDONS.map((addon) => (
                <div
                  key={addon.name}
                  className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-body-base text-body-base font-bold">{addon.name}</span>
                    <span className="shrink-0 font-mono text-body-base font-bold text-[#ff8a1f]">
                      {addon.price}
                      <span className="ml-1 font-body-sm text-[11px] font-normal text-text-subtle">
                        {addon.unit}
                      </span>
                    </span>
                  </div>
                  <p className="font-body-sm text-[13px] leading-relaxed text-text-tertiary">
                    {addon.copy}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-4 font-body-sm text-[13px] text-text-tertiary sm:flex-row sm:items-center sm:justify-between">
              <span>Every plan includes unlimited staff PINs, menu items and tables.</span>
              <span className="font-mono text-text-secondary">Extra KDS screens $29/mo</span>
            </div>
          </div>
        </section>

        <section className="border-b border-white/10">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div className="flex flex-col gap-3">
              <span className="font-label-badge text-label-badge uppercase tracking-[0.18em] text-[#4cd7f6]">
                The stack you would otherwise buy
              </span>
              <h2 className="font-headline-xl text-[clamp(1.9rem,3.6vw,2.6rem)] font-black leading-[1.06] tracking-[-0.03em]">
                One vendor instead of five.
              </h2>
              <p className="font-body-sm text-body-sm leading-relaxed text-text-tertiary">
                Bought separately, the same capabilities run $600–$1,000+ a month before
                card processing. Pro puts them on one check — and on one data model.
              </p>
              <p className="font-body-sm text-[11px] leading-relaxed text-text-subtle">
                Public list prices, late 2026; several vendors quote add-ons privately.
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    <th className="px-4 py-3 font-label-badge text-[10px] uppercase tracking-widest text-text-subtle">
                      Capability
                    </th>
                    <th className="px-4 py-3 font-label-badge text-[10px] uppercase tracking-widest text-text-subtle">
                      Bought separately
                    </th>
                    <th className="px-4 py-3 font-label-badge text-[10px] uppercase tracking-widest text-text-subtle">
                      Whiteout
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map(([capability, separately, whiteout]) => (
                    <tr key={capability} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 font-body-sm text-[13px] text-text-secondary">
                        {capability}
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] text-text-tertiary">
                        {separately}
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] font-bold text-[#4cd7f6]">
                        {whiteout}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-b border-white/10 bg-[#08101d]">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="flex max-w-2xl flex-col gap-3">
              <span className="font-label-badge text-label-badge uppercase tracking-[0.18em] text-[#4cd7f6]">
                Launch
              </span>
              <h2 className="font-headline-xl text-[clamp(1.9rem,3.6vw,2.6rem)] font-black leading-[1.06] tracking-[-0.03em]">
                Start this week, not next quarter.
              </h2>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { title: 'Self-serve launch', price: '$0', copy: 'Import the menu, draw the floor and add staff yourself.' },
                { title: 'Guided launch', price: '$499', copy: 'We import the menu, build the floor plan, set staff and run the first close.' },
                { title: 'Station bundle', price: 'from $849', copy: 'Tablet, stand, receipt printer and cash drawer. Or bring your own.' },
                { title: 'KDS screen', price: '$249', copy: 'A kitchen screen ready for the line, or use a browser on your own.' },
              ].map((item) => (
                <div key={item.title} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <span className="font-body-sm text-[12px] text-text-tertiary">{item.title}</span>
                  <span className="font-mono text-xl font-bold">{item.price}</span>
                  <p className="font-body-sm text-[12px] leading-relaxed text-text-subtle">
                    {item.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:px-8">
            <div className="flex flex-col gap-3">
              <span className="font-label-badge text-label-badge uppercase tracking-[0.18em] text-[#4cd7f6]">
                Questions
              </span>
              <h2 className="font-headline-xl text-[clamp(1.9rem,3.6vw,2.6rem)] font-black leading-[1.06] tracking-[-0.03em]">
                The things operators ask first.
              </h2>
            </div>

            <div className="flex flex-col gap-2">
              {FAQ.map((entry) => (
                <details
                  key={entry.q}
                  className="group rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-body-base text-body-base font-bold text-text-primary [&::-webkit-details-marker]:hidden">
                    {entry.q}
                    <span className="material-symbols-outlined text-[18px] text-text-tertiary transition-transform group-open:rotate-45">
                      add
                    </span>
                  </summary>
                  <p className="mt-2 max-w-2xl font-body-sm text-[13px] leading-relaxed text-text-tertiary">
                    {entry.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[680px] -translate-x-1/2 rounded-full bg-[#4cd7f6]/10 blur-[120px]" />
          <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-4 py-20 text-center sm:px-6 lg:px-8">
            <img src="/whiteout-logo.png" alt="Whiteout" className="h-9 w-auto" />
            <h2 className="font-headline-xl text-[clamp(2rem,4.4vw,3.2rem)] font-black leading-[1.03] tracking-[-0.03em]">
              Put the whole shift on one check.
            </h2>
            <p className="max-w-xl font-body-base text-body-base leading-relaxed text-text-secondary">
              Open the terminal and see the floor, the kitchen and the close in one
              system. Modules switch on when you need them.
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
                href="/"
                className="flex h-12 items-center justify-center rounded-xl border border-white/15 px-6 font-body-base text-body-base font-bold text-text-primary transition-colors hover:bg-white/5"
              >
                Back to the product
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
