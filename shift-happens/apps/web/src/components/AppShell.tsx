'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/pos', label: 'POS & Orders', icon: 'point_of_sale', color: 'text-secondary' },
  { href: '/floor-plan', label: 'Floor Plan & Seating', icon: 'table_restaurant', color: 'text-secondary' },
  { href: '/kds', label: 'Kitchen KDS', icon: 'skillet', color: 'text-status-caution' },
  { href: '/reservations', label: 'Reservations & CRM', icon: 'book_online', color: 'text-secondary' },
  { href: '/inventory', label: 'Inventory Management', icon: 'inventory_2', color: 'text-secondary' },
  { href: '/scheduling', label: 'Staff Scheduling & Shifts', icon: 'calendar_month', color: 'text-secondary' },
  { href: '/briefing', label: 'Pre-Shift Briefing', icon: 'campaign', color: 'text-accent-purple-glow' },
  { href: '/onboarding', label: 'Team Onboarding & Training', icon: 'school', color: 'text-secondary' },
  { href: '/architect', label: 'Architect & Media Studio', icon: 'architecture', color: 'text-secondary' },
  { href: '/mobile', label: 'Mobile Floor Manager', icon: 'smartphone', color: 'text-secondary' },
  { href: '/voice-ai', label: 'Voice AI Agent', icon: 'neurology', color: 'text-accent-purple-glow' },
];

export default function AppShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-bg-canvas text-on-surface">
      <aside className="fixed left-0 top-0 z-50 hidden h-full w-64 flex-col justify-between bg-bg-chrome shadow-[0_1px_8px_rgba(0,0,0,0.04)] lg:flex">
        <div className="flex min-h-0 flex-col">
          <div className="flex h-16 items-center gap-space-sm bg-surface-container-lowest px-space-md">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent-purple-glow to-secondary font-headline-md text-headline-md font-black text-bg-canvas">
              S
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-headline-md text-headline-md uppercase tracking-tight text-text-primary">
                SHIFT HAPPENS!
              </span>
              <span className="truncate font-label-badge text-label-badge font-bold uppercase tracking-widest text-secondary">
                HYDRAFORGE AI
              </span>
            </div>
          </div>
          <div className="px-space-md py-space-sm">
            <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="sh-live-dot" />
                <span className="font-label-badge text-label-badge uppercase text-text-secondary">Live Engine</span>
              </div>
              <span className="font-label-badge text-label-badge text-secondary">SYNCED</span>
            </div>
          </div>
          <nav className="mt-space-xs flex flex-col gap-space-xs overflow-y-auto px-space-sm pb-2" style={{ maxHeight: 'calc(100vh - 190px)' }}>
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? 'flex items-center gap-space-sm rounded-lg bg-gradient-to-r from-accent-purple-glow/20 to-secondary/20 px-space-md py-space-sm font-bold text-text-primary shadow-[inset_2px_0_0_0_#4cd7f6]'
                      : 'flex items-center gap-space-sm rounded-lg px-space-md py-space-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface'
                  }
                >
                  <span className={`material-symbols-outlined ${item.color}`}>{item.icon}</span>
                  <span className="font-body-base text-body-base font-semibold">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col gap-space-sm bg-surface-container-lowest p-space-md">
          <div className="flex items-center justify-between font-mono-metric-sm text-mono-metric-sm text-text-subtle">
            <span>HOTKEYS</span>
            <span className="rounded bg-surface-variant px-space-xs py-0.5 text-text-secondary">⌘ + K</span>
          </div>
          <Link href="/login" className="flex items-center gap-space-sm rounded-lg bg-surface-container-low p-space-sm hover:bg-surface-container">
            <span className="material-symbols-outlined text-secondary">badge</span>
            <div className="flex flex-col">
              <span className="font-label-eyebrow text-label-eyebrow uppercase text-secondary">Active Staff</span>
              <span className="truncate font-body-sm text-body-sm text-text-secondary">Shift terminal · PIN</span>
            </div>
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between bg-bg-chrome/90 px-space-lg shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl lg:left-64">
          <div className="flex items-center gap-space-md">
            <div className="flex items-center gap-space-xs rounded-full bg-surface-container-high px-space-md py-space-xs">
              <span className="sh-live-dot" />
              <span className="font-label-badge text-label-badge uppercase tracking-wider text-text-primary">
                Dinner Rush • Live • Online
              </span>
            </div>
            <div className="hidden items-center gap-space-xs rounded bg-surface-container-low px-space-sm py-space-xs font-body-sm text-body-sm text-text-secondary xl:flex">
              <span className="material-symbols-outlined text-body-base text-text-subtle">store</span>
              <span>Main Dining &amp; Bar — Downtown Flagship</span>
            </div>
          </div>
          <div className="flex items-center gap-space-md">
            <div className="flex items-center gap-space-xs rounded-full bg-surface-container-high px-space-sm py-space-xs">
              <span className="material-symbols-outlined animate-pulse text-body-base text-accent-purple-glow">graphic_eq</span>
              <span className="font-label-badge text-label-badge font-bold text-accent-purple-glow">VOICE AI ACTIVE</span>
            </div>
            <Link href="/login" className="flex items-center gap-space-sm pl-space-sm">
              <div className="hidden flex-col text-right sm:flex">
                <span className="font-body-base text-body-base font-bold leading-tight text-text-primary">Chef Marco Vance</span>
                <span className="font-label-eyebrow text-label-eyebrow uppercase text-secondary">GM &amp; Head of Ops</span>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent-purple-glow/40 to-secondary/40 font-label-badge text-label-badge font-bold text-text-primary ring-2 ring-primary/40">
                MV
              </div>
            </Link>
          </div>
        </header>

        <main className="min-h-screen bg-bg-canvas pt-16">
          {(title || subtitle) && (
            <div className="border-b border-border-subtle px-space-lg py-space-lg">
              <h1 className="font-headline-xl text-headline-xl tracking-tight text-text-primary">{title}</h1>
              {subtitle && <p className="mt-1 font-body-base text-body-base text-text-secondary">{subtitle}</p>}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
