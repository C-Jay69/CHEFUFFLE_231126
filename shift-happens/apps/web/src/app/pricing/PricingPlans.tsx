'use client';

import Link from 'next/link';
import { useState } from 'react';

const PLANS = [
  {
    id: 'core',
    name: 'Core',
    monthly: 79,
    note: 'or $0 with Whiteout Payments',
    description: 'The till, the menu and the floor — enough to run service.',
    features: [
      'POS, menu and tables',
      'Open checks and payment screen',
      'Split bills and part payments',
      'Staff PINs and role permissions',
      'Basic reporting',
    ],
    cta: 'Start with Core',
    featured: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    monthly: 199,
    note: 'The working room',
    description: 'Adds the kitchen, stock, rota and the close.',
    features: [
      'Everything in Core',
      'KDS — 2 screens included',
      'Inventory and recipes',
      'Scheduling and labor pacing',
      'End of Night and slip reconciliation',
    ],
    cta: 'Choose Growth',
    featured: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 349,
    note: 'The full-service room',
    description: 'The whole floor, front to back, with the book and the briefing.',
    features: [
      'Everything in Growth',
      'KDS — 3 screens included',
      'Reservations and waitlist',
      'Onboarding, training and roles',
      'Briefing and sign-off',
    ],
    cta: 'Choose Pro',
    featured: true,
  },
  {
    id: 'full-stack',
    name: 'Full Stack',
    monthly: 449,
    note: 'Pro + Voice AI',
    description: 'Everything, including the phone.',
    features: [
      'Everything in Pro',
      'Voice AI — 300 minutes included',
      '$0.12/min after the included minutes',
      'Priority support',
    ],
    cta: 'Choose Full Stack',
    featured: false,
  },
];

const annualPrice = (monthly: number) => Math.round(monthly * 0.85);

export default function PricingPlans() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2">
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className={`h-9 rounded-full px-4 font-body-sm text-body-sm font-bold transition-colors ${
              !annual ? 'bg-white text-[#0c1322]' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            className={`h-9 rounded-full px-4 font-body-sm text-body-sm font-bold transition-colors ${
              annual ? 'bg-white text-[#0c1322]' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Annual · save 15%
          </button>
        </div>
        <span className="font-body-sm text-[12px] text-text-subtle">
          No multi-year contract either way.
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const price = annual ? annualPrice(plan.monthly) : plan.monthly;
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col gap-4 rounded-2xl border p-6 ${
                plan.featured
                  ? 'border-[#4cd7f6]/60 bg-[#4cd7f6]/[0.06]'
                  : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-2.5 right-5 rounded-full bg-[#4cd7f6] px-2.5 py-0.5 font-label-badge text-[10px] font-bold uppercase tracking-widest text-[#04121a]">
                  Most popular
                </span>
              )}
              <div className="flex flex-col gap-1">
                <span className="font-headline-lg text-headline-lg font-bold">{plan.name}</span>
                <span className="font-body-sm text-[12px] text-text-tertiary">{plan.note}</span>
              </div>

              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-4xl font-bold text-text-primary">
                    ${price}
                  </span>
                  <span className="font-body-sm text-body-sm text-text-tertiary">/mo</span>
                </div>
                <span className="font-body-sm text-[11px] text-text-subtle">
                  {annual
                    ? `billed annually · $${price * 12}/year`
                    : `per location · $${plan.monthly * 12}/year if annual`}
                </span>
              </div>

              <p className="font-body-sm text-[13px] leading-relaxed text-text-tertiary">
                {plan.description}
              </p>

              <ul className="flex flex-1 flex-col gap-2 border-t border-white/10 pt-4 font-body-sm text-[13px] text-text-secondary">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#ff8a1f]" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href="/serve"
                className={`flex h-11 items-center justify-center gap-1.5 rounded-lg font-body-sm text-body-sm font-bold transition-colors ${
                  plan.featured
                    ? 'bg-white text-[#0c1322] hover:bg-white/90'
                    : 'border border-white/15 text-text-primary hover:bg-white/5'
                }`}
              >
                {plan.cta}
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-headline-md text-headline-md font-bold">Enterprise / multi-site</span>
          <span className="font-body-sm text-[13px] text-text-tertiary">
            Full Stack, API, multi-location roll-up, guided rollout and named support.
          </span>
        </div>
        <span className="font-mono text-2xl font-bold text-text-primary">
          $599<span className="font-body-sm text-body-sm font-normal text-text-tertiary">/mo</span>
        </span>
      </div>
      <p className="-mt-4 font-body-sm text-[12px] text-text-subtle">
        Enterprise includes one location; additional locations are $99/mo each. Annual
        agreement with a 30-day exit after year one.
      </p>
    </div>
  );
}
