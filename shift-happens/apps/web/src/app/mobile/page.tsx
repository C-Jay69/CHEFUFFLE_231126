'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { Badge, Button, Card, EmptyState, PageHeader, Progress } from '@/components/ui';
import { api } from '@/lib/api';
import { money, timeLabel } from '@/lib/format';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import type {
  KdsTicket,
  LaborPacing,
  MenuItem,
  MenuResponse,
  Reservation,
  ReservationResponse,
} from '@/lib/types';

interface KdsResponse {
  tickets: KdsTicket[];
}

type LoadMode = 'initial' | 'refresh' | 'silent';

const laborTone = (status: LaborPacing['status']) =>
  status === 'OPTIMAL' ? 'ready' : 'caution';

export default function MobileManagerPage() {
  const [labor, setLabor] = useState<LaborPacing | null>(null);
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [reservations, setReservations] = useState<ReservationResponse | null>(null);
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  const loadLabor = useCallback(async () => {
    const data = await api.get<LaborPacing>('/labor/pacing');
    setLabor(data);
  }, []);

  const loadTickets = useCallback(async () => {
    const data = await api.get<KdsResponse>('/kds/tickets?station=expo');
    setTickets(data.tickets);
  }, []);

  const loadReservations = useCallback(async () => {
    const data = await api.get<ReservationResponse>('/reservations');
    setReservations(data);
  }, []);

  const loadMenu = useCallback(async () => {
    const data = await api.get<MenuResponse>('/menu');
    setMenu(data);
  }, []);

  const loadAll = useCallback(
    async (mode: LoadMode = 'initial') => {
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      try {
        await Promise.all([loadLabor(), loadTickets(), loadReservations(), loadMenu()]);
      } catch (error) {
        showToast(
          error instanceof Error
            ? error.message
            : 'Could not reach the operations API. Is it running on :4000?',
          'error',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadLabor, loadMenu, loadReservations, loadTickets],
  );

  useEffect(() => {
    void loadAll('initial');
  }, [loadAll]);

  useEffect(() => {
    const offs = [
      listen('LABOR_PACING_UPDATE', () => void loadLabor().catch(() => undefined)),
      listen('KDS_NEW_TICKET', () => void loadTickets().catch(() => undefined)),
      listen('KDS_TICKET_BUMPED', () => void loadTickets().catch(() => undefined)),
      listen('GLOBAL_86_ITEM_UPDATE', () => void loadMenu().catch(() => undefined)),
      listen('RESERVATION_CREATED', () => void loadReservations().catch(() => undefined)),
    ];
    return () => offs.forEach((off) => off());
  }, [loadLabor, loadMenu, loadReservations, loadTickets]);

  const toggleAvailability = async (item: MenuItem) => {
    const next = !item.is86ed;
    setBusyItem(item.id);
    try {
      await api.patch(`/menu/${item.id}/availability`, {
        is86ed: next,
        reason: next ? "86'd from Floor Manager" : 'Restored from Floor Manager',
      });
      showToast(next ? `${item.name} is 86'd.` : `${item.name} is back on the menu.`, next ? 'warn' : 'success');
      await loadMenu();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update availability.', 'error');
    } finally {
      setBusyItem(null);
    }
  };

  const overdueTickets = useMemo(
    () =>
      tickets
        .filter((ticket) => ticket.isOverdue)
        .sort((a, b) => b.overdueBySeconds - a.overdueBySeconds),
    [tickets],
  );

  const vipArrivals = useMemo<Reservation[]>(
    () =>
      (reservations?.reservations ?? [])
        .filter((reservation) => reservation.vip && reservation.status !== 'cancelled')
        .sort(
          (a, b) =>
            new Date(a.reservationTime).getTime() - new Date(b.reservationTime).getTime(),
        ),
    [reservations],
  );

  const shelfItems = useMemo(() => {
    const items = (menu?.items ?? []).filter(
      (item) =>
        item.is86ed || item.stockStatus === 'low' || item.stockStatus === 'out',
    );
    return items.sort((a, b) => {
      if (a.is86ed !== b.is86ed) return a.is86ed ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [menu]);

  const laborPercent = labor ? Number(labor.laborPercentage) : 0;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow="Live floor"
          icon="smartphone"
          title="Floor Manager"
          description="Labor, late tickets, VIP arrivals and the 86 shelf — one hand, one screen."
          actions={
            <>
              <Badge tone={labor ? laborTone(labor.status) : 'neutral'}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {labor ? `${labor.laborPercentage}% labor` : 'Labor —'}
              </Badge>
              <Button
                variant="secondary"
                icon="refresh"
                loading={refreshing}
                onClick={() => void loadAll('refresh')}
              >
                Refresh
              </Button>
            </>
          }
        />

        {loading ? (
          <Card>
            <div className="flex items-center justify-center gap-2 py-8 font-body-sm text-body-sm text-text-tertiary">
              <span className="material-symbols-outlined animate-spin text-body-base">progress_activity</span>
              Loading live floor…
            </div>
          </Card>
        ) : (
          <>
            <Card
              title="Labor pacing"
              icon="payments"
              actions={
                labor && (
                  <Badge tone={laborTone(labor.status)}>
                    {labor.status === 'OPTIMAL' ? 'Optimal' : 'Pacing alert'}
                  </Badge>
                )
              }
            >
              {labor ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-end justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="font-mono-metric-lg text-[40px] font-bold leading-none text-text-primary">
                        {labor.laborPercentage}%
                      </span>
                      <span className="mt-1 font-body-sm text-body-sm text-text-tertiary">
                        Target {labor.targetPercentage}% · {labor.activeStaffCount} on the floor
                      </span>
                    </div>
                    <span className="font-mono-metric-sm text-mono-metric-sm text-text-secondary">
                      {money(labor.currentHourlyBurn)}/hr
                    </span>
                  </div>
                  <Progress
                    value={laborPercent}
                    tone={labor.status === 'OPTIMAL' ? 'ready' : 'urgent'}
                  />
                  <p className="rounded-xl bg-surface-container p-3 font-body-sm text-body-sm text-text-secondary">
                    {labor.recommendation}
                  </p>
                </div>
              ) : (
                <EmptyState
                  icon="payments"
                  title="Labor data unavailable"
                  description="The pacing feed did not load."
                  action={
                    <Button variant="secondary" icon="refresh" onClick={() => void loadAll('refresh')}>
                      Retry
                    </Button>
                  }
                />
              )}
            </Card>

            <Card
              title="Overdue tickets"
              icon="timer"
              actions={
                <Badge tone={overdueTickets.length > 0 ? 'urgent' : 'neutral'}>
                  {overdueTickets.length} overdue
                </Badge>
              }
            >
              {overdueTickets.length === 0 ? (
                <EmptyState
                  icon="check_circle"
                  title="Kitchen is on pace"
                  description="No expo tickets past their target prep time."
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {overdueTickets.map((ticket) => (
                    <li
                      key={ticket.id}
                      className="flex items-center gap-3 rounded-xl border border-status-urgent/30 bg-status-urgent/[0.06] p-3"
                    >
                      <span className="flex h-11 min-w-11 items-center justify-center rounded-lg bg-status-urgent/15 px-2 font-mono-metric-md text-mono-metric-md font-bold text-status-urgent">
                        {ticket.tableNumber}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-body-sm text-body-sm font-bold text-text-primary">
                          {ticket.items[0]
                            ? `${ticket.items[0].quantity}× ${ticket.items[0].name}`
                            : 'Ticket'}
                        </span>
                        <span className="font-body-sm text-body-sm text-text-tertiary">
                          {ticket.itemCount} items · {ticket.serverName}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-mono-metric-md text-mono-metric-md font-bold text-status-urgent">
                          {ticket.elapsedLabel}
                        </span>
                        <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                          elapsed
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/kds"
                className="mt-3 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface-container font-body-sm font-bold text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
              >
                <span className="material-symbols-outlined text-body-base">skillet</span>
                Open kitchen board
              </Link>
            </Card>

            <Card
              title="VIP arrivals"
              icon="stars"
              actions={<Badge tone="violet">{vipArrivals.length} today</Badge>}
            >
              {vipArrivals.length === 0 ? (
                <EmptyState
                  icon="book_online"
                  title="No VIP bookings today"
                  description="VIP reservations will surface here as they arrive."
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {vipArrivals.map((reservation) => (
                    <li
                      key={reservation.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface-container p-3"
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-body-base text-body-base font-bold text-text-primary">
                          {reservation.guestName}
                        </span>
                        <span className="font-body-sm text-body-sm text-text-tertiary">
                          {reservation.partySize} guests
                          {reservation.occasion ? ` · ${reservation.occasion}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono-metric-md text-mono-metric-md font-bold text-accent-purple-glow">
                          {timeLabel(reservation.reservationTime)}
                        </span>
                        <span className="rounded-lg bg-surface-container-high px-2.5 py-1.5 font-mono-metric-sm text-mono-metric-sm text-text-secondary">
                          {reservation.tableNumber ?? 'Unassigned'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title="86 shelf"
              icon="do_not_disturb_on"
              subtitle="86'd and low-stock items"
              actions={
                <Badge tone={shelfItems.length > 0 ? 'caution' : 'neutral'}>
                  {shelfItems.length} items
                </Badge>
              }
            >
              {shelfItems.length === 0 ? (
                <EmptyState
                  icon="check_circle"
                  title="Everything is available"
                  description="No items are 86'd or running low right now."
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {shelfItems.map((item) => {
                    const out = item.stockStatus === 'out';
                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-container p-3"
                      >
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-body-sm text-body-sm font-bold text-text-primary">
                            {item.name}
                          </span>
                          <span className="font-body-sm text-body-sm text-text-tertiary">
                            {item.category ?? item.station}
                            {!item.is86ed && item.portionsLeft > 0
                              ? ` · ${item.portionsLeft} left`
                              : ''}
                          </span>
                        </div>
                        <Badge tone={item.is86ed || out ? 'urgent' : 'caution'}>
                          {item.is86ed ? "86'd" : out ? 'Out' : 'Low stock'}
                        </Badge>
                        <Button
                          variant={item.is86ed ? 'success' : 'danger'}
                          icon={item.is86ed ? 'restore' : 'do_not_disturb_on'}
                          loading={busyItem === item.id}
                          onClick={() => void toggleAvailability(item)}
                        >
                          {item.is86ed ? 'Restore' : '86 now'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
