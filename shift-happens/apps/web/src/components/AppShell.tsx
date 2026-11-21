'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Permission } from '@shift-happens/shared/permissions';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { initials, timeLabel } from '@/lib/format';
import { writeShift, useSession, type ActiveShift } from '@/lib/session';
import { showToast } from '@/lib/toast';
import { Button } from '@/components/ui';

const NAV: Array<{
  href: string;
  label: string;
  icon: string;
  color: string;
  permissions: Permission[];
}> = [
  { href: '/serve', label: 'Serve', icon: 'room_service', color: 'text-accent-cyan-bright', permissions: ['serve.order', 'floor.seat'] },
  { href: '/kds', label: 'Kitchen', icon: 'skillet', color: 'text-status-caution', permissions: ['kds.operate'] },
  { href: '/floor-plan', label: 'Floor Plan', icon: 'table_restaurant', color: 'text-secondary', permissions: ['floor.seat', 'floor.manage'] },
  { href: '/reservations', label: 'Reservations', icon: 'book_online', color: 'text-secondary', permissions: ['reservations.manage'] },
  { href: '/pos', label: 'Open Checks', icon: 'receipt_long', color: 'text-secondary', permissions: ['serve.pay'] },
  { href: '/inventory', label: 'Inventory', icon: 'inventory_2', color: 'text-secondary', permissions: ['inventory.manage'] },
  { href: '/scheduling', label: 'Scheduling', icon: 'calendar_month', color: 'text-secondary', permissions: ['scheduling.manage'] },
  { href: '/briefing', label: 'Briefing', icon: 'campaign', color: 'text-accent-purple-glow', permissions: ['briefing.manage'] },
  { href: '/onboarding', label: 'Onboarding', icon: 'badge', color: 'text-secondary', permissions: ['staff.manage', 'training.manage'] },
  { href: '/architect', label: 'Menu Studio', icon: 'architecture', color: 'text-secondary', permissions: ['menu.manage'] },
  { href: '/mobile', label: 'Mobile Manager', icon: 'smartphone', color: 'text-secondary', permissions: ['reports.view'] },
  { href: '/voice-ai', label: 'Voice AI', icon: 'neurology', color: 'text-accent-purple-glow', permissions: ['voice.manage'] },
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
  const router = useRouter();
  const { staff, shift, ready, can, onShift, lockedToServe } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clocking, setClocking] = useState<'in' | 'out' | null>(null);

  // A clocked-in server or bartender only gets the table plan.
  useEffect(() => {
    if (!ready || !lockedToServe) return;
    if (pathname !== '/serve') router.replace('/serve');
  }, [ready, lockedToServe, pathname, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const staffName = staff?.name ?? 'Shift Terminal';
  const visibleNav = NAV.filter((item) => item.permissions.some((permission) => can(permission)));
  const shownNav = lockedToServe
    ? visibleNav.filter((item) => item.href === '/serve')
    : visibleNav;

  const clockIn = async () => {
    if (!staff) return;
    setClocking('in');
    try {
      const response = await api.post<{ shift: ActiveShift; clockedIn: boolean }>(
        '/auth/clock-in',
        { staffId: staff.id },
      );
      writeShift(response.shift);
      showToast(`${staff.name} clocked in.`, 'success');
      if (
        staff.serveOnlyWhenClockedIn ||
        staff.role === 'server' ||
        staff.role === 'bartender'
      ) {
        router.push('/serve');
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not clock in.',
        'error',
      );
    } finally {
      setClocking(null);
    }
  };

  const clockOut = async () => {
    if (!staff) return;
    setClocking('out');
    try {
      await api.post('/auth/clock-out', { staffId: staff.id });
      writeShift(null);
      showToast(`${staff.name} clocked out.`, 'success');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not clock out.',
        'error',
      );
    } finally {
      setClocking(null);
    }
  };

  const nav = (
    <nav className="flex flex-col gap-1">
      {shownNav.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
              active
                ? 'bg-gradient-to-r from-accent-purple-glow/20 to-secondary/20 font-bold text-text-primary shadow-[inset_2px_0_0_0_#4cd7f6]'
                : 'text-text-secondary hover:bg-surface-container hover:text-text-primary',
            )}
          >
            <span className={cn('material-symbols-outlined text-[20px]', item.color)}>{item.icon}</span>
            <span className="font-body-sm text-body-sm font-semibold">{item.label}</span>
          </Link>
        );
      })}
      {lockedToServe && (
        <p className="mt-3 rounded-xl border border-status-ready/25 bg-status-ready/10 px-3 py-2 font-body-sm text-body-sm text-status-ready">
          Clocked in — table plan only. Clock out to reach the rest of the app.
        </p>
      )}
    </nav>
  );

  const clockControl = !staff ? (
    <Link
      href="/login"
      className="flex h-9 items-center gap-1.5 rounded-full bg-surface-container-high px-3 font-label-badge text-label-badge font-bold text-text-primary transition-colors hover:bg-surface-container-highest"
    >
      <span className="material-symbols-outlined text-body-base text-secondary">login</span>
      SIGN IN
    </Link>
  ) : onShift ? (
    <Button variant="ghost" size="sm" icon="logout" loading={clocking === 'out'} onClick={() => void clockOut()}>
      Clock out
    </Button>
  ) : (
    <Button variant="secondary" size="sm" icon="login" loading={clocking === 'in'} onClick={() => void clockIn()}>
      Clock in
    </Button>
  );

  return (
    <div className="min-h-screen bg-bg-canvas text-on-surface">
      <aside className="fixed left-0 top-0 z-50 hidden h-full w-64 flex-col justify-between border-r border-border-subtle bg-bg-chrome lg:flex">
        <div className="flex min-h-0 flex-col">
          <Link href="/serve" className="flex h-16 items-center gap-3 border-b border-border-subtle px-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-purple-glow to-secondary font-headline-md text-headline-md font-black text-bg-canvas">
              S
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-headline-md text-headline-md uppercase tracking-tight text-text-primary">
                SHIFT HAPPENS!
              </span>
              <span className="truncate font-label-badge text-label-badge font-bold uppercase tracking-widest text-secondary">
                HYDRAFORGE AI
              </span>
            </span>
          </Link>
          <div className="flex-1 overflow-y-auto p-3">{nav}</div>
        </div>
        <Link
          href="/login"
          className="m-3 flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-container-low p-3 transition-colors hover:bg-surface-container"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-purple-glow/15 font-label-badge text-label-badge font-bold text-accent-purple-glow">
            {initials(staffName)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
              {staff?.roleLabel ?? 'Active staff'}
            </span>
            <span className="truncate font-body-sm text-body-sm font-bold text-text-primary">{staffName}</span>
          </span>
          <span className="material-symbols-outlined ml-auto text-body-base text-text-tertiary">chevron_right</span>
        </Link>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-bg-canvas/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-border-subtle bg-bg-chrome p-3">
            <div className="mb-3 flex items-center justify-between border-b border-border-subtle pb-3">
              <span className="font-headline-md text-headline-md uppercase text-text-primary">SHIFT HAPPENS!</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border-subtle bg-bg-chrome/95 px-4 backdrop-blur-xl lg:left-64 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-container lg:hidden"
              aria-label="Open navigation"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <div className="flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1.5">
              <span className="sh-live-dot" />
              <span className="font-label-badge text-label-badge uppercase tracking-wider text-text-primary">
                Live
              </span>
            </div>
            <div className="hidden min-w-0 items-center gap-1.5 text-body-sm text-text-secondary sm:flex">
              <span className="material-symbols-outlined text-body-base text-text-tertiary">store</span>
              <span className="truncate">Downtown Flagship</span>
            </div>
            {onShift && shift?.clockIn && (
              <span className="hidden items-center gap-1.5 rounded-full bg-status-ready/15 px-3 py-1.5 font-label-badge text-label-badge font-bold uppercase text-status-ready md:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-status-ready" />
                On shift since {timeLabel(shift.clockIn)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {clockControl}
            {!lockedToServe && (
              <Link
                href="/voice-ai"
                className="hidden h-9 items-center gap-1.5 rounded-full bg-surface-container-high px-3 transition-colors hover:bg-surface-container-highest sm:flex"
              >
                <span className="material-symbols-outlined text-body-base text-accent-purple-glow">graphic_eq</span>
                <span className="font-label-badge text-label-badge font-bold text-accent-purple-glow">VOICE AI</span>
              </Link>
            )}
            <Link href="/login" className="flex items-center gap-2 rounded-full py-1 pl-2 transition-colors hover:bg-surface-container">
              <div className="hidden flex-col text-right sm:flex">
                <span className="font-body-sm text-body-sm font-bold leading-tight text-text-primary">{staffName}</span>
                <span className="font-label-badge text-label-badge uppercase text-secondary">
                  {staff?.roleLabel ?? 'On shift'}
                </span>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-purple-glow/30 to-secondary/30 font-label-badge text-label-badge font-bold text-text-primary ring-2 ring-primary/30">
                {initials(staffName)}
              </span>
            </Link>
          </div>
        </header>

        <main className="min-h-screen bg-bg-canvas pt-16">
          {(title || subtitle) && (
            <div className="border-b border-border-subtle px-4 py-6 lg:px-8">
              {title && <h1 className="font-headline-xl text-headline-xl tracking-tight text-text-primary">{title}</h1>}
              {subtitle && <p className="mt-1 max-w-4xl font-body-base text-body-base text-text-secondary">{subtitle}</p>}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
