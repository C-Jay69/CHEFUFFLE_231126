'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import { Badge, Button, EmptyState, PageHeader, Stat, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { isMuted, playChime, setMuted as setAudioMuted } from '@/lib/audio';
import { cn } from '@/lib/cn';
import { elapsed, titleCase } from '@/lib/format';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import type { KdsTicket } from '@/lib/types';

type StationId = 'expo' | 'grill' | 'saute_fryer' | 'cold_larder' | 'pastry_dessert' | 'bar';
type BumpAction = 'bump' | 'hold' | 'recall';

interface KdsTicketsResponse {
  tickets: KdsTicket[];
  counts: Record<string, number>;
  station: string;
}

const OVERDUE_SECONDS = 15 * 60;

const STATIONS: Array<{ id: StationId; label: string }> = [
  { id: 'expo', label: 'All' },
  { id: 'grill', label: 'Grill' },
  { id: 'saute_fryer', label: 'Sauté' },
  { id: 'cold_larder', label: 'Cold' },
  { id: 'pastry_dessert', label: 'Pastry' },
  { id: 'bar', label: 'Bar' },
];

const ITEM_STATION_LABEL: Record<string, string> = {
  expo: 'Expo',
  grill: 'Grill',
  saute_fryer: 'Sauté',
  cold_larder: 'Cold',
  pastry_dessert: 'Pastry',
  bar: 'Bar',
};

const cardTone: Record<KdsTicket['priority'], string> = {
  urgent: 'border-status-urgent/50 bg-status-urgent/[0.07]',
  hero: 'border-status-caution/45 bg-status-caution/[0.05]',
  regular: 'border-border-subtle bg-surface-container-low',
  new: 'border-secondary/35 bg-surface-container-low',
};

function liveSeconds(ticket: KdsTicket, now: number, syncedAt: number) {
  return Math.max(0, Math.round(ticket.elapsedSeconds + (now - syncedAt) / 1000));
}

function priorityFor(seconds: number): KdsTicket['priority'] {
  if (seconds > 20 * 60) return 'urgent';
  if (seconds > 10 * 60) return 'hero';
  if (seconds < 5 * 60) return 'new';
  return 'regular';
}

function TicketCard({
  ticket,
  seconds,
  showStation,
  busyAction,
  leaving,
  onAction,
}: {
  ticket: KdsTicket;
  seconds: number;
  showStation: boolean;
  busyAction?: BumpAction;
  leaving: boolean;
  onAction: (action: BumpAction) => void;
}) {
  const overdue = seconds > OVERDUE_SECONDS;
  const priority = priorityFor(seconds);
  const tone = overdue ? 'urgent' : priority;
  const busy = Boolean(busyAction);

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-2xl border p-4 shadow-md transition-all',
        cardTone[tone],
        leaving && 'sh-ticket-leaving',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-text-primary">
              {ticket.tableNumber}
            </span>
            {overdue ? (
              <Badge tone="urgent">Overdue</Badge>
            ) : priority === 'hero' ? (
              <Badge tone="caution">Priority</Badge>
            ) : priority === 'new' ? (
              <Badge tone="info">New</Badge>
            ) : null}
          </div>
          <span className="mt-0.5 block font-body-sm text-body-sm text-text-tertiary">
            #{ticket.orderNumber} · {ticket.zone}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span
            className={cn(
              'font-mono-metric-lg text-mono-metric-lg font-bold tabular-nums',
              overdue
                ? 'text-status-urgent'
                : priority === 'hero'
                  ? 'text-status-caution'
                  : 'text-text-primary',
            )}
          >
            {elapsed(seconds)}
          </span>
          <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
            {ticket.itemCount} items
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-body-sm text-body-sm text-text-secondary">
        <span className="flex min-w-0 items-center gap-1">
          <span className="material-symbols-outlined text-body-base text-text-tertiary">person</span>
          <span className="truncate">{ticket.serverName}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-body-base text-text-tertiary">group</span>
          {ticket.partySize ? `${ticket.partySize} guests` : 'Guests —'}
        </span>
      </div>

      {ticket.hasAllergy && (
        <div className="flex items-start gap-2 rounded-xl border border-status-urgent/50 bg-status-urgent/15 px-3 py-2">
          <span className="material-symbols-outlined text-body-base text-status-urgent">warning</span>
          <div className="min-w-0">
            <span className="block font-label-badge text-label-badge font-bold uppercase text-status-urgent">
              Allergy alert
            </span>
            <p className="font-body-sm text-body-sm font-semibold text-text-primary">
              {ticket.allergyNotes?.trim() || 'Allergen flagged — confirm before plating.'}
            </p>
          </div>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-border-subtle/80">
        {ticket.items.map((item) => {
          const bumped = item.prepStatus === 'bumped';
          return (
            <li key={item.id} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <span
                className={cn(
                  'mt-0.5 inline-flex h-6 min-w-[28px] shrink-0 items-center justify-center rounded-md px-1 font-mono-metric-sm text-mono-metric-sm',
                  bumped
                    ? 'bg-surface-container text-text-subtle line-through'
                    : 'bg-surface-container-highest text-text-primary',
                )}
              >
                {item.quantity}×
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      'font-body-base text-body-base font-semibold',
                      bumped ? 'text-text-tertiary line-through' : 'text-text-primary',
                    )}
                  >
                    {item.name}
                  </span>
                  {item.seat && (
                    <span className="shrink-0 rounded bg-surface-container px-1.5 py-0.5 font-label-badge text-label-badge text-text-tertiary">
                      Seat {item.seat}
                    </span>
                  )}
                </div>
                {item.modifiers.length > 0 && (
                  <p className="font-body-sm text-body-sm text-text-tertiary">
                    {item.modifiers.map((modifier) => modifier.name).join(' · ')}
                  </p>
                )}
                {item.notes && (
                  <p className="mt-0.5 flex items-start gap-1 font-body-sm text-body-sm font-semibold text-status-caution">
                    <span className="material-symbols-outlined text-body-base">sticky_note_2</span>
                    {item.notes}
                  </p>
                )}
                {showStation && (
                  <span className="mt-1 inline-block rounded bg-surface-container px-1.5 py-0.5 font-label-badge text-label-badge uppercase text-text-tertiary">
                    {ITEM_STATION_LABEL[item.station] ?? titleCase(item.station)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border-subtle pt-3">
        <Button
          variant="success"
          size="lg"
          className="col-span-2"
          icon="check"
          loading={busyAction === 'bump'}
          disabled={busy && busyAction !== 'bump'}
          onClick={() => onAction('bump')}
        >
          Bump
        </Button>
        <Button
          variant="secondary"
          size="md"
          icon="pause"
          loading={busyAction === 'hold'}
          disabled={busy && busyAction !== 'hold'}
          onClick={() => onAction('hold')}
        >
          Hold
        </Button>
        <Button
          variant="ghost"
          size="md"
          icon="undo"
          loading={busyAction === 'recall'}
          disabled={busy && busyAction !== 'recall'}
          onClick={() => onAction('recall')}
        >
          Recall
        </Button>
      </div>
    </article>
  );
}

export default function KdsPage() {
  const [station, setStation] = useState<StationId>('expo');
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(() => isMuted());
  const [now, setNow] = useState(() => Date.now());
  const [syncedAt, setSyncedAt] = useState(() => Date.now());
  const [ticketBusy, setTicketBusy] = useState<Record<string, BumpAction>>({});
  const [leaving, setLeaving] = useState<Record<string, boolean>>({});
  const requestRef = useRef(0);

  const loadData = useCallback(
    async (silent = false) => {
      const requestId = ++requestRef.current;
      try {
        const [ticketData, countData] = await Promise.all([
          api.get<KdsTicketsResponse>(`/kds/tickets?station=${station}`),
          api.get<Record<string, number>>('/kds/counts'),
        ]);
        if (requestId !== requestRef.current) return;
        setTickets(ticketData.tickets);
        setCounts({ ...ticketData.counts, ...countData });
        setSyncedAt(Date.now());
        setError(null);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : 'Could not reach the kitchen feed.';
        if (requestId === requestRef.current) setError(message);
        if (!silent) showToast(message, 'error');
      }
    },
    [station],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void loadData(false).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [loadData]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void loadData(true);
      }, 300);
    };
    const offs = [
      listen('KDS_NEW_TICKET', () => {
        playChime('ticket');
        schedule();
      }),
      listen('KDS_TICKET_UPDATED', schedule),
      listen('KDS_TICKET_BUMPED', schedule),
      listen('GLOBAL_86_ITEM_UPDATE', schedule),
    ];
    return () => {
      offs.forEach((off) => off());
      if (timer) clearTimeout(timer);
    };
  }, [loadData]);

  const manualRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(false);
    setRefreshing(false);
  }, [loadData]);

  const toggleMuted = () => {
    const next = !muted;
    setAudioMuted(next);
    setMutedState(next);
  };

  const visibleTickets = useMemo(() => {
    const rank: Record<KdsTicket['priority'], number> = {
      urgent: 0,
      hero: 1,
      regular: 2,
      new: 3,
    };
    return tickets
      .filter((ticket) => ticket.bumpedCount < ticket.itemCount)
      .sort(
        (a, b) =>
          rank[a.priority] - rank[b.priority] || a.createdAt.localeCompare(b.createdAt),
      );
  }, [tickets]);

  const overdueCount = useMemo(
    () =>
      visibleTickets.filter((ticket) => liveSeconds(ticket, now, syncedAt) > OVERDUE_SECONDS)
        .length,
    [syncedAt, now, visibleTickets],
  );

  const allergyCount = useMemo(
    () => visibleTickets.filter((ticket) => ticket.hasAllergy).length,
    [visibleTickets],
  );

  const handleAction = useCallback(
    async (ticket: KdsTicket, action: BumpAction) => {
      if (ticketBusy[ticket.id] || leaving[ticket.id]) return;

      setTicketBusy((current) => ({ ...current, [ticket.id]: action }));
      if (action === 'bump') {
        setLeaving((current) => ({ ...current, [ticket.id]: true }));
      }

      try {
        const result = await api.post<{ updatedCount: number; allBumped: boolean }>('/kds/bump', {
          orderId: ticket.id,
          station,
          action,
        });

        if (action === 'bump') {
          showToast(
            `Ticket #${ticket.orderNumber} bumped${
              result.allBumped ? ' — all items cleared' : ''
            }.`,
            'success',
          );
          await new Promise((resolve) => setTimeout(resolve, 220));
          setTickets((current) => current.filter((entry) => entry.id !== ticket.id));
        } else if (action === 'hold') {
          showToast(`Ticket #${ticket.orderNumber} held.`, 'info');
        } else {
          showToast(`Ticket #${ticket.orderNumber} recalled to the line.`, 'info');
        }

        await loadData(true);
      } catch (actionError) {
        showToast(
          actionError instanceof Error ? actionError.message : 'Kitchen action failed.',
          'error',
        );
      } finally {
        setTicketBusy((current) => {
          const next = { ...current };
          delete next[ticket.id];
          return next;
        });
        setLeaving((current) => {
          const next = { ...current };
          delete next[ticket.id];
          return next;
        });
      }
    },
    [leaving, loadData, station, ticketBusy],
  );

  const stationLabel = station === 'expo' ? 'All stations' : (STATIONS.find((entry) => entry.id === station)?.label ?? 'Station');

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow="Line"
          icon="skillet"
          title="Kitchen"
          description="Live tickets by station. Bump a plate when it leaves the pass."
          actions={
            <>
              <Button
                variant="ghost"
                size="md"
                icon={muted ? 'volume_off' : 'volume_up'}
                aria-pressed={muted}
                title={muted ? 'Unmute ticket chimes' : 'Mute ticket chimes'}
                onClick={toggleMuted}
              >
                {muted ? 'Muted' : 'Sound'}
              </Button>
              <Button
                variant="secondary"
                size="md"
                icon="refresh"
                loading={refreshing}
                onClick={() => void manualRefresh()}
              >
                Refresh
              </Button>
            </>
          }
        />

        <Tabs
          value={station}
          onChange={(id) => setStation(id as StationId)}
          items={STATIONS.map((entry) => ({
            id: entry.id,
            label: entry.label,
            count: entry.id === 'expo' ? (counts.all ?? 0) : (counts[entry.id] ?? 0),
          }))}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="On station"
            value={visibleTickets.length}
            icon="receipt_long"
            hint={stationLabel}
          />
          <Stat
            label="Overdue"
            value={overdueCount}
            icon="timer"
            tone={overdueCount > 0 ? 'urgent' : 'ready'}
            hint="15 minutes or more"
          />
          <Stat
            label="Allergy alerts"
            value={allergyCount}
            icon="warning"
            tone={allergyCount > 0 ? 'urgent' : 'ready'}
            hint="Check before plating"
          />
        </div>

        {error && visibleTickets.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-status-urgent/40 bg-status-urgent/10 px-4 py-3">
            <span className="flex items-center gap-2 font-body-sm text-body-sm text-text-primary">
              <span className="material-symbols-outlined text-body-base text-status-urgent">
                wifi_off
              </span>
              Live feed interrupted — showing last known tickets.
            </span>
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              loading={refreshing}
              onClick={() => void manualRefresh()}
            >
              Retry
            </Button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="sh-skeleton h-[340px] rounded-2xl" />
            ))}
          </div>
        ) : error && visibleTickets.length === 0 ? (
          <EmptyState
            icon="cloud_off"
            title="Kitchen feed unavailable"
            description={error}
            action={
              <Button
                variant="secondary"
                icon="refresh"
                loading={refreshing}
                onClick={() => void manualRefresh()}
              >
                Retry
              </Button>
            }
          />
        ) : visibleTickets.length === 0 ? (
          <EmptyState
            icon="skillet"
            title="No open tickets"
            description={`Nothing open on ${stationLabel}. New orders appear here automatically.`}
            action={
              <Button
                variant="secondary"
                icon="refresh"
                loading={refreshing}
                onClick={() => void manualRefresh()}
              >
                Refresh
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                seconds={liveSeconds(ticket, now, syncedAt)}
                showStation={station === 'expo'}
                busyAction={ticketBusy[ticket.id]}
                leaving={Boolean(leaving[ticket.id])}
                onAction={(action) => void handleAction(ticket, action)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
