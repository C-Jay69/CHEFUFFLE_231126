'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Progress,
  Stat,
  Tabs,
  type BadgeTone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { money, timeLabel, titleCase } from '@/lib/format';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import type { DiningTable } from '@/lib/types';

const tableSorter = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const statusTone: Record<DiningTable['status'], BadgeTone> = {
  available: 'ready',
  occupied: 'info',
  reserved: 'caution',
  dirty: 'neutral',
};

const statusLabel: Record<DiningTable['status'], string> = {
  available: 'Available',
  occupied: 'In service',
  reserved: 'Reserved',
  dirty: 'Needs bus',
};

const cardTone: Record<DiningTable['status'], string> = {
  available:
    'border-status-ready/35 bg-status-ready/[0.06] hover:bg-status-ready/[0.11]',
  occupied: 'border-status-info/35 bg-status-info/[0.06] hover:bg-status-info/[0.11]',
  reserved:
    'border-status-caution/35 bg-status-caution/[0.06] hover:bg-status-caution/[0.11]',
  dirty: 'border-border-subtle bg-surface-container/50 hover:bg-surface-container/75',
};

function badgeFor(table: DiningTable): { label: string; tone: BadgeTone } {
  if (table.status === 'occupied') {
    return { label: table.stageShort || statusLabel.occupied, tone: 'info' };
  }
  return { label: statusLabel[table.status], tone: statusTone[table.status] };
}

function partyLabel(table: DiningTable) {
  if (table.currentPartyName) return table.currentPartyName;
  if (table.status === 'available') return 'Open table';
  if (table.status === 'dirty') return 'Awaiting reset';
  if (table.status === 'reserved') return 'Reserved party';
  return 'Walk-in';
}

function seatedLabel(table: DiningTable) {
  if (table.status === 'available') return 'Ready for guests';
  if (table.status === 'dirty') return 'Needs bus';
  if (table.seatedAt) {
    return `${timeLabel(table.seatedAt)} · ${table.seatedMinutes ?? 0}m`;
  }
  return table.status === 'reserved' ? 'Not seated yet' : 'Not seated';
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg bg-surface-container px-3 py-2">
      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">{label}</span>
      <span className="mt-0.5 truncate font-body-sm text-body-sm font-semibold text-text-primary">
        {value}
      </span>
    </div>
  );
}

export default function FloorPlanPage() {
  const router = useRouter();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [zone, setZone] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seatTarget, setSeatTarget] = useState<DiningTable | null>(null);
  const [partyName, setPartyName] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [resetTarget, setResetTarget] = useState<DiningTable | null>(null);
  const requestRef = useRef(0);

  const loadTables = useCallback(async (silent = false) => {
    const requestId = ++requestRef.current;
    try {
      const response = await api.get<DiningTable[]>('/tables');
      if (requestId !== requestRef.current) return;
      setTables(response);
      setError(null);
    } catch (loadError) {
      if (requestId !== requestRef.current) return;
      const message = errorText(loadError, 'Could not load the floor plan.');
      setError(message);
      if (!silent) showToast(message, 'error');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void loadTables(false).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [loadTables]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void loadTables(true);
      }, 300);
    };
    const offs = [
      listen('TABLE_STAGE_ADVANCED', schedule),
      listen('TABLE_UPDATED', schedule),
    ];
    return () => {
      offs.forEach((off) => off());
      if (timer) clearTimeout(timer);
    };
  }, [loadTables]);

  const manualRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTables(false);
    setRefreshing(false);
  }, [loadTables]);

  const zones = useMemo(
    () => Array.from(new Set(tables.map((table) => table.zone))).sort(),
    [tables],
  );

  const zoneTabs = useMemo(
    () => [
      { id: 'all', label: 'All', count: tables.length },
      ...zones.map((entry) => ({
        id: entry,
        label: entry,
        count: tables.filter((table) => table.zone === entry).length,
      })),
    ],
    [tables, zones],
  );

  const visibleTables = useMemo(
    () =>
      tables
        .filter((table) => zone === 'all' || table.zone === zone)
        .sort((a, b) => tableSorter.compare(a.tableNumber, b.tableNumber)),
    [tables, zone],
  );

  const stats = useMemo(() => {
    const summary = { occupied: 0, available: 0, reserved: 0, dirty: 0 };
    for (const table of tables) {
      if (table.status === 'occupied') summary.occupied += 1;
      else if (table.status === 'available') summary.available += 1;
      else if (table.status === 'reserved') summary.reserved += 1;
      else summary.dirty += 1;
    }
    return summary;
  }, [tables]);

  const selected = useMemo(
    () => tables.find((table) => table.id === selectedId) ?? null,
    [selectedId, tables],
  );

  const allergyNotes = selected?.activeOrder?.allergyNotes ?? null;
  const seatMax = seatTarget ? Math.min(40, Math.max(1, seatTarget.capacity)) : 40;

  const openSeat = (table: DiningTable) => {
    const max = Math.min(40, Math.max(1, table.capacity));
    setSeatTarget(table);
    setPartyName(table.currentPartyName ?? '');
    setPartySize(Math.min(max, Math.max(1, table.currentPartySize ?? Math.min(2, max))));
  };

  const closeSeat = () => {
    if (busy) return;
    setSeatTarget(null);
    setPartyName('');
  };

  const changeCovers = (delta: number) => {
    setPartySize((current) => Math.min(seatMax, Math.max(1, current + delta)));
  };

  const submitSeat = async () => {
    if (!seatTarget) return;
    const name = partyName.trim() || 'Walk-in';
    setBusy(true);
    try {
      await api.post(`/tables/${seatTarget.id}/seat`, {
        partyName: name,
        partySize,
      });
      showToast(`${name} seated at ${seatTarget.tableNumber}.`, 'success');
      setSeatTarget(null);
      setPartyName('');
      await loadTables(true);
    } catch (seatError) {
      showToast(errorText(seatError, 'Could not seat the party.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const advanceStage = async (table: DiningTable) => {
    setBusy(true);
    try {
      const result = await api.post<{ stage?: string }>(`/tables/${table.id}/advance`);
      showToast(
        `${table.tableNumber} advanced to ${titleCase(result.stage ?? 'next stage')}.`,
        'success',
      );
      await loadTables(true);
    } catch (advanceError) {
      showToast(errorText(advanceError, 'Could not advance the table.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const resetTable = async (table: DiningTable) => {
    setBusy(true);
    try {
      await api.post(`/tables/${table.id}/reset`);
      showToast(`${table.tableNumber} reset — ready for the next party.`, 'success');
      setResetTarget(null);
      await loadTables(true);
    } catch (resetError) {
      showToast(errorText(resetError, 'Could not reset the table.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const requestReset = (table: DiningTable) => {
    if (table.status === 'occupied' || table.status === 'reserved') {
      setResetTarget(table);
      return;
    }
    void resetTable(table);
  };

  const startOrder = (table: DiningTable) => {
    router.push(`/serve?table=${table.tableNumber}`);
  };

  let primaryAction: { label: string; icon: string; run: () => void } | null = null;
  if (selected) {
    if (selected.status === 'dirty') {
      primaryAction = {
        label: 'Reset / Bus',
        icon: 'cleaning_services',
        run: () => {
          void resetTable(selected);
        },
      };
    } else if (selected.status === 'occupied') {
      primaryAction = {
        label: 'Advance stage',
        icon: 'arrow_forward',
        run: () => {
          void advanceStage(selected);
        },
      };
    } else {
      primaryAction = {
        label: 'Seat party',
        icon: 'event_seat',
        run: () => openSeat(selected),
      };
    }
  }

  const showReset = selected?.status === 'occupied' || selected?.status === 'reserved';
  const selectedBadge = selected ? badgeFor(selected) : null;
  const selectedZone = selected?.zone ?? '';

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow="Live floor"
          icon="table_restaurant"
          title="Floor Plan"
          description="Tap a table to see its party, stage and check, then seat, advance or reset it."
          actions={
            <Button
              variant="secondary"
              size="md"
              icon="refresh"
              loading={refreshing}
              onClick={() => void manualRefresh()}
            >
              Refresh
            </Button>
          }
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="In service"
            value={stats.occupied}
            icon="room_service"
            tone="violet"
            hint="Occupied tables"
          />
          <Stat
            label="Available"
            value={stats.available}
            icon="check_circle"
            tone="ready"
            hint="Ready to seat"
          />
          <Stat
            label="Reserved"
            value={stats.reserved}
            icon="book_online"
            tone="caution"
            hint="Upcoming parties"
          />
          <Stat
            label="Needs bus"
            value={stats.dirty}
            icon="cleaning_services"
            tone="urgent"
            hint="Awaiting reset"
          />
        </div>

        <Tabs
          value={zone}
          onChange={setZone}
          items={zoneTabs}
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="order-2 flex min-w-0 flex-col gap-3 xl:order-1">
            {error && tables.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-status-urgent/40 bg-status-urgent/10 px-4 py-3">
                <span className="flex items-center gap-2 font-body-sm text-body-sm text-text-primary">
                  <span className="material-symbols-outlined text-body-base text-status-urgent">
                    wifi_off
                  </span>
                  Live floor feed interrupted — showing the last known state.
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="sh-skeleton h-[180px] rounded-2xl" />
                ))}
              </div>
            ) : error && tables.length === 0 ? (
              <EmptyState
                icon="cloud_off"
                title="Floor plan unavailable"
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
            ) : visibleTables.length === 0 ? (
              <EmptyState
                icon="table_restaurant"
                title="No tables in this zone"
                description="Try another zone or refresh the floor."
                action={
                  zone !== 'all' ? (
                    <Button variant="secondary" onClick={() => setZone('all')}>
                      Show all zones
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      icon="refresh"
                      loading={refreshing}
                      onClick={() => void manualRefresh()}
                    >
                      Refresh
                    </Button>
                  )
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {visibleTables.map((table) => {
                  const badge = badgeFor(table);
                  const isSelected = table.id === selectedId;
                  return (
                    <button
                      key={table.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedId(table.id)}
                      className={cn(
                        'group flex min-h-[180px] flex-col justify-between rounded-2xl border p-4 text-left shadow-md transition-all active:scale-[0.98]',
                        cardTone[table.status],
                        isSelected &&
                          'border-accent-cyan-bright ring-1 ring-accent-cyan-bright/60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-text-primary">
                          {table.tableNumber}
                        </span>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </div>

                      <div className="mt-2 flex flex-col gap-0.5">
                        <span className="truncate font-body-base text-body-base font-bold text-text-primary">
                          {partyLabel(table)}
                        </span>
                        <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                          {table.zone} · {table.capacity} seats
                        </span>
                      </div>

                      <div className="mt-3 flex items-end justify-between gap-2 border-t border-border-subtle/70 pt-2">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-mono-metric-sm text-mono-metric-sm text-text-secondary">
                            {seatedLabel(table)}
                          </span>
                          <span className="truncate font-label-badge text-label-badge uppercase text-text-tertiary">
                            {table.activeOrder
                              ? `Check ${money(table.activeOrder.total)} · ${table.activeOrder.itemCount} items`
                              : 'No open check'}
                          </span>
                        </div>
                        <span className="material-symbols-outlined shrink-0 text-body-base text-secondary transition-transform group-hover:translate-x-0.5">
                          chevron_right
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="order-1 xl:order-2">
            {selected && primaryAction && selectedBadge ? (
              <Card
                title={selected.tableNumber}
                subtitle={`${selectedZone} · ${selected.capacity} seats`}
                icon="table_restaurant"
                actions={<Badge tone={selectedBadge.tone}>{selectedBadge.label}</Badge>}
                className="xl:sticky xl:top-20"
              >
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <DetailRow label="Party" value={partyLabel(selected)} />
                    <DetailRow
                      label="Covers"
                      value={
                        selected.currentPartySize != null
                          ? String(selected.currentPartySize)
                          : '—'
                      }
                    />
                    <DetailRow label="Stage" value={selected.stageLabel} />
                    <DetailRow
                      label="Seated"
                      value={
                        selected.seatedAt
                          ? `${timeLabel(selected.seatedAt)} · ${selected.seatedMinutes ?? 0}m`
                          : seatedLabel(selected)
                      }
                    />
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-surface-container px-3 py-2">
                    <Avatar name={selected.serverName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <span className="block font-label-badge text-label-badge uppercase text-text-tertiary">
                        Server
                      </span>
                      <span className="block truncate font-body-sm text-body-sm font-semibold text-text-primary">
                        {selected.serverName ?? 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-surface-container px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                        Check
                      </span>
                      <span className="font-mono-metric-md text-mono-metric-md font-bold text-text-primary">
                        {selected.activeOrder ? money(selected.activeOrder.total) : '—'}
                      </span>
                    </div>
                    <span className="font-body-sm text-body-sm text-text-tertiary">
                      {selected.activeOrder
                        ? `Ticket #${selected.activeOrder.orderNumber} · ${selected.activeOrder.itemCount} items`
                        : 'No open check'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                        Stage progress
                      </span>
                      <span className="font-label-badge text-label-badge text-text-secondary">
                        {Math.min(selected.stageNumber, 6)} / 6
                      </span>
                    </div>
                    <Progress
                      value={(Math.min(selected.stageNumber, 6) / 6) * 100}
                      tone={
                        selected.status === 'dirty'
                          ? 'caution'
                          : selected.status === 'occupied'
                            ? 'secondary'
                            : 'ready'
                      }
                    />
                  </div>

                  {allergyNotes && (
                    <div className="flex items-start gap-2 rounded-lg border border-status-urgent/40 bg-status-urgent/10 px-3 py-2">
                      <span className="material-symbols-outlined text-body-base text-status-urgent">
                        warning
                      </span>
                      <div className="min-w-0">
                        <span className="block font-label-badge text-label-badge font-bold uppercase text-status-urgent">
                          Allergy
                        </span>
                        <p className="font-body-sm text-body-sm font-semibold text-text-primary">
                          {allergyNotes}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
                    <Button
                      variant="primary"
                      size="lg"
                      icon={primaryAction.icon}
                      loading={busy}
                      onClick={primaryAction.run}
                      className="w-full"
                    >
                      {primaryAction.label}
                    </Button>

                    {selected.status !== 'dirty' && (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="secondary"
                          size="md"
                          icon="restaurant_menu"
                          disabled={busy}
                          onClick={() => startOrder(selected)}
                        >
                          Start Order
                        </Button>

                        {selected.status === 'occupied' ? (
                          showReset ? (
                            <Button
                              variant="danger"
                              size="md"
                              icon="cleaning_services"
                              disabled={busy}
                              onClick={() => requestReset(selected)}
                            >
                              Reset / Bus
                            </Button>
                          ) : null
                        ) : (
                          <Button
                            variant="secondary"
                            size="md"
                            icon="arrow_forward"
                            disabled={busy}
                            onClick={() => void advanceStage(selected)}
                          >
                            Advance stage
                          </Button>
                        )}

                        {selected.status !== 'occupied' && showReset && (
                          <Button
                            variant="danger"
                            size="md"
                            icon="cleaning_services"
                            disabled={busy}
                            onClick={() => requestReset(selected)}
                            className="col-span-2"
                          >
                            Reset / Bus
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ) : (
              <Card
                title="No table selected"
                subtitle="Tap a table to see its party and actions."
                icon="table_restaurant"
                className="hidden xl:block"
              >
                <EmptyState
                  icon="touch_app"
                  title="Select a table"
                  description="Party details, stage controls and check totals appear here."
                />
              </Card>
            )}
          </aside>
        </div>
      </div>

      <Modal
        open={Boolean(seatTarget)}
        onClose={closeSeat}
        title={seatTarget ? `Seat ${seatTarget.tableNumber}` : 'Seat party'}
        description={
          seatTarget ? `${seatTarget.zone} · up to ${seatTarget.capacity} covers` : undefined
        }
        icon="event_seat"
        footer={
          <>
            <Button variant="ghost" onClick={closeSeat} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="event_seat"
              loading={busy}
              onClick={() => void submitSeat()}
            >
              Seat party
            </Button>
          </>
        }
      >
        {seatTarget && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                Party name
              </span>
              <input
                value={partyName}
                onChange={(event) => setPartyName(event.target.value)}
                placeholder="Walk-in"
                className="h-12 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-4 font-body-base text-body-base text-text-primary outline-none focus:border-secondary"
              />
            </label>

            <div className="flex flex-col gap-1">
              <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                Party size
              </span>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  className="h-12 w-12 px-0"
                  aria-label="Decrease party size"
                  disabled={busy || partySize <= 1}
                  onClick={() => changeCovers(-1)}
                >
                  −
                </Button>
                <div className="flex flex-1 items-baseline justify-center gap-1 rounded-lg bg-surface-container py-2">
                  <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-text-primary">
                    {partySize}
                  </span>
                  <span className="font-body-sm text-body-sm text-text-tertiary">covers</span>
                </div>
                <Button
                  variant="secondary"
                  size="lg"
                  className="h-12 w-12 px-0"
                  aria-label="Increase party size"
                  disabled={busy || partySize >= seatMax}
                  onClick={() => changeCovers(1)}
                >
                  +
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => {
          if (!busy) setResetTarget(null);
        }}
        title="Reset table"
        description={resetTarget ? `${resetTarget.tableNumber} · ${resetTarget.zone}` : undefined}
        icon="cleaning_services"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="cleaning_services"
              loading={busy}
              onClick={() => {
                if (resetTarget) void resetTable(resetTarget);
              }}
            >
              Reset / Bus
            </Button>
          </>
        }
      >
        <p className="font-body-base text-body-base text-text-secondary">
          This clears the party, covers and server, and returns{' '}
          <span className="font-bold text-text-primary">{resetTarget?.tableNumber}</span> to ready.
        </p>
      </Modal>
    </AppShell>
  );
}
