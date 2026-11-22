'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  SearchInput,
  Stat,
  Tabs,
  type BadgeTone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { localInputValue, timeLabel, titleCase } from '@/lib/format';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import type { Reservation, ReservationResponse } from '@/lib/types';

const TAB_IDS = ['all', 'confirmed', 'seated', 'waitlist', 'vip'] as const;
type TabId = (typeof TAB_IDS)[number];

const INPUT_CLASS =
  'h-12 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-base text-body-base text-text-primary outline-none placeholder:text-text-subtle focus:border-secondary';

interface ReservationForm {
  guestName: string;
  phone: string;
  partySize: string;
  time: string;
  notes: string;
  vip: boolean;
}

function nextTimeSlot() {
  const next = new Date();
  next.setMinutes(next.getMinutes() + 30 - (next.getMinutes() % 30), 0, 0);
  return localInputValue(next);
}

function formTimeFor(base?: Date) {
  const day = startOfDay(base ?? new Date());
  if (day.getTime() !== startOfDay(new Date()).getTime()) {
    const slot = new Date(day);
    slot.setHours(19, 0, 0, 0);
    return localInputValue(slot);
  }
  return nextTimeSlot();
}

function emptyForm(base?: Date): ReservationForm {
  return {
    guestName: '',
    phone: '',
    partySize: '2',
    time: formTimeFor(base),
    notes: '',
    vip: false,
  };
}

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'confirmed':
      return 'info';
    case 'seated':
      return 'ready';
    case 'waitlist':
      return 'caution';
    case 'no_show':
      return 'urgent';
    default:
      return 'neutral';
  }
}

function statusLabel(status: string) {
  return status === 'no_show' ? 'No show' : titleCase(status);
}

function sourceLabel(source: string) {
  if (source === 'voice_ai') return 'Voice AI';
  if (source === 'walk_in') return 'Walk-in';
  return titleCase(source);
}

type ViewMode = 'day' | 'week' | 'month' | 'year';

const VIEW_ITEMS: Array<{ id: ViewMode; label: string }> = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];

const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
};

const dayKey = (value: string | Date) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const shortDay = (value: Date) =>
  value.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const monthName = (value: Date) =>
  value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

/** `6:30p` / `9a` — compact arrival time for calendar cells. */
const compactTime = (value: string | Date) => {
  const date = new Date(value);
  const hour = date.getHours() % 12 || 12;
  const minutes = date.getMinutes();
  return `${hour}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}${
    date.getHours() >= 12 ? 'p' : 'a'
  }`;
};

function rangeFor(view: ViewMode, cursor: Date) {
  const day = startOfDay(cursor);
  if (view === 'day') {
    return {
      from: day,
      to: addDays(day, 1),
      label: day.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    };
  }
  if (view === 'week') {
    const from = addDays(day, -day.getDay());
    const to = addDays(from, 7);
    return {
      from,
      to,
      label: `${shortDay(from)} – ${shortDay(addDays(from, 6))}`,
    };
  }
  if (view === 'month') {
    const from = new Date(day.getFullYear(), day.getMonth(), 1);
    const to = new Date(day.getFullYear(), day.getMonth() + 1, 1);
    return { from, to, label: monthName(from) };
  }
  const from = new Date(day.getFullYear(), 0, 1);
  const to = new Date(day.getFullYear() + 1, 0, 1);
  return { from, to, label: String(day.getFullYear()) };
}

export default function ReservationsPage() {
  const [data, setData] = useState<ReservationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('day');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<ReservationForm>(() => emptyForm());
  const [saving, setSaving] = useState(false);
  const [seatingId, setSeatingId] = useState<string | null>(null);

  const range = useMemo(() => rangeFor(view, cursor), [view, cursor]);

  const load = useCallback(async () => {
    const response = await api.get<ReservationResponse>(
      `/reservations?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(
        range.to.toISOString(),
      )}`,
    );
    setData(response);
    setError(null);
    return response;
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    load()
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Could not reach the reservations API.');
        showToast('Could not load reservations.', 'error');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const offs = [
      listen('RESERVATION_CREATED', () => void load().catch(() => undefined)),
      listen('RESERVATION_UPDATED', () => void load().catch(() => undefined)),
    ];
    return () => offs.forEach((off) => off());
  }, [load]);

  const waitlistCovers = useMemo(
    () =>
      (data?.reservations ?? [])
        .filter((reservation) => reservation.status === 'waitlist')
        .reduce((sum, reservation) => sum + reservation.partySize, 0),
    [data],
  );

  const counts = useMemo<Record<TabId, number>>(
    () => ({
      all: data?.stats.total ?? 0,
      confirmed: data?.stats.confirmed ?? 0,
      seated: data?.stats.seated ?? 0,
      waitlist: data?.stats.waitlist ?? 0,
      vip: data?.stats.vip ?? 0,
    }),
    [data],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...(data?.reservations ?? [])]
      .filter((reservation) => {
        if (tab === 'vip') {
          if (!reservation.vip) return false;
        } else if (tab !== 'all' && reservation.status !== tab) {
          return false;
        }
        if (!term) return true;
        return [
          reservation.guestName,
          reservation.phone,
          reservation.tableNumber ?? '',
          reservation.notes ?? '',
          reservation.occasion ?? '',
        ].some((value) => value.toLowerCase().includes(term));
      })
      .sort(
        (a, b) =>
          new Date(a.reservationTime).getTime() - new Date(b.reservationTime).getTime(),
      );
  }, [data, search, tab]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; rows: Reservation[] }>();
    for (const reservation of filtered) {
      const at = new Date(reservation.reservationTime);
      const key = `${at.getHours()}:${at.getMinutes()}`;
      const group = map.get(key);
      if (group) {
        group.rows.push(reservation);
      } else {
        map.set(key, {
          key,
          label: timeLabel(reservation.reservationTime),
          rows: [reservation],
        });
      }
    }
    return [...map.values()];
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const reservation of filtered) {
      const key = dayKey(reservation.reservationTime);
      const rows = map.get(key);
      if (rows) rows.push(reservation);
      else map.set(key, [reservation]);
    }
    return map;
  }, [filtered]);

  const rowsFor = useCallback(
    (date: Date) => byDay.get(dayKey(date)) ?? [],
    [byDay],
  );

  const shiftRange = (direction: 1 | -1) => {
    setCursor((current) => {
      if (view === 'day') return addDays(current, direction);
      if (view === 'week') return addDays(current, 7 * direction);
      if (view === 'month') {
        return new Date(current.getFullYear(), current.getMonth() + direction, 1);
      }
      return new Date(current.getFullYear() + direction, 0, 1);
    });
  };

  const goToday = () => setCursor(startOfDay(new Date()));

  const openDay = (date: Date) => {
    setCursor(startOfDay(date));
    setView('day');
  };

  const openMonth = (month: Date) => {
    setCursor(new Date(month.getFullYear(), month.getMonth(), 1));
    setView('month');
  };

  const openCreate = () => {
    setForm(emptyForm(cursor));
    setCreateOpen(true);
  };

  const update = <K extends keyof ReservationForm>(key: K, value: ReservationForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const seat = async (reservation: Reservation) => {
    setSeatingId(reservation.id);
    try {
      await api.post<Reservation>(`/reservations/${reservation.id}/seat`);
      showToast(`${reservation.guestName} seated.`, 'success');
      await load();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not seat this party.', 'error');
    } finally {
      setSeatingId(null);
    }
  };

  const notifyGuest = (reservation: Reservation) => {
    if (!reservation.phone) {
      showToast('No phone number on file for this guest.', 'warn');
      return;
    }
    showToast(`Notified ${reservation.guestName} at ${reservation.phone}.`, 'success');
  };

  const submit = async () => {
    const guestName = form.guestName.trim();
    const phone = form.phone.trim();
    const partySize = Number(form.partySize);
    const at = new Date(form.time);

    if (!guestName) {
      showToast('Guest name is required.', 'warn');
      return;
    }
    if (phone.length < 3) {
      showToast('A phone number is required to confirm the booking.', 'warn');
      return;
    }
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 40) {
      showToast('Party size must be between 1 and 40.', 'warn');
      return;
    }
    if (!form.time || Number.isNaN(at.getTime())) {
      showToast('Choose a valid arrival date and time.', 'warn');
      return;
    }

    setSaving(true);
    try {
      await api.post<{ reservation: Reservation }>('/reservations', {
        guestName,
        phone,
        partySize,
        reservationTime: at.toISOString(),
        status: 'confirmed',
        source: 'host',
        notes: form.notes.trim() || null,
        vip: form.vip,
      });
      showToast(`Reservation created for ${guestName}.`, 'success');
      setCreateOpen(false);
      setForm(emptyForm());
      await load();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not create the reservation.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const description = data
    ? `${range.label} · ${data.stats.total} bookings · ${data.stats.covers} covers`
    : 'Loading the book…';

  const today = startOfDay(new Date());
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(range.from, index));

  const monthFirst = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
  const monthLead = monthFirst.getDay();
  const monthLength = new Date(
    range.from.getFullYear(),
    range.from.getMonth() + 1,
    0,
  ).getDate();
  const monthCellCount = Math.ceil((monthLead + monthLength) / 7) * 7;
  const monthGridDays = Array.from({ length: monthCellCount }, (_, index) =>
    addDays(addDays(monthFirst, -monthLead), index),
  );
  const yearMonths = Array.from(
    { length: 12 },
    (_, month) => new Date(range.from.getFullYear(), month, 1),
  );

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow="Front of house"
          icon="book_online"
          title="Reservations"
          description={description}
          actions={
            <>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search guest, phone, table…"
                className="min-w-[220px]"
              />
              <Button variant="primary" size="md" icon="add" onClick={openCreate}>
                New reservation
              </Button>
            </>
          }
        />

        {loading && !data ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="h-[116px] animate-pulse rounded-2xl border border-border-subtle bg-surface-container-low"
                />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-xl border border-border-subtle bg-surface-container-low"
                />
              ))}
            </div>
          </div>
        ) : !data ? (
          <EmptyState
            icon="cloud_off"
            title="Could not load reservations"
            description={error ?? 'Check the operations API and try again.'}
            action={
              <Button
                variant="primary"
                icon="refresh"
                onClick={() => {
                  setLoading(true);
                  load()
                    .catch(() => showToast('Could not load reservations.', 'error'))
                    .finally(() => setLoading(false));
                }}
              >
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat
                label="Covers"
                value={data.stats.covers}
                icon="groups"
                tone="secondary"
                hint={`${data.stats.total} bookings in view`}
              />
              <Stat
                label="Confirmed"
                value={data.stats.confirmed}
                icon="event_available"
                tone="ready"
                hint={`${data.stats.seated} already seated`}
              />
              <Stat
                label="Waitlist"
                value={data.stats.waitlist}
                icon="hourglass_top"
                tone="caution"
                hint={`${waitlistCovers} covers waiting`}
              />
              <Stat
                label="VIP"
                value={data.stats.vip}
                icon="star"
                tone="violet"
                hint="Flagged guests"
              />
            </div>

            <Tabs
              value={tab}
              onChange={(id) => setTab(id as TabId)}
              items={TAB_IDS.map((id) => ({
                id,
                label: id === 'all' ? 'All' : id === 'vip' ? 'VIP' : titleCase(id),
                count: counts[id],
              }))}
            />

            {data.stats.waitlist > 0 && tab !== 'waitlist' && (
              <button
                type="button"
                onClick={() => setTab('waitlist')}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-status-caution/30 bg-status-caution/10 px-4 text-left transition-colors hover:bg-status-caution/[0.16]"
              >
                <span className="flex items-center gap-2 font-body-sm text-body-sm font-bold text-status-caution">
                  <span className="material-symbols-outlined text-body-base">hourglass_top</span>
                  {data.stats.waitlist} parties waiting · {waitlistCovers} covers
                </span>
                <span className="material-symbols-outlined text-body-base text-status-caution">
                  chevron_right
                </span>
              </button>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => shiftRange(-1)}
                  aria-label={`Previous ${view}`}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-surface-container text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
                >
                  <span className="material-symbols-outlined text-body-base">chevron_left</span>
                </button>
                <Button variant="ghost" size="sm" onClick={goToday}>
                  Today
                </Button>
                <button
                  type="button"
                  onClick={() => shiftRange(1)}
                  aria-label={`Next ${view}`}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-surface-container text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
                >
                  <span className="material-symbols-outlined text-body-base">chevron_right</span>
                </button>
                <span className="ml-2 font-body-base text-body-base font-bold text-text-primary">
                  {range.label}
                </span>
                {refreshing && (
                  <span className="material-symbols-outlined animate-spin text-[18px] text-text-tertiary">
                    progress_activity
                  </span>
                )}
              </div>

              <div className="flex rounded-full bg-surface-container p-1">
                {VIEW_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView(item.id)}
                    className={`h-8 rounded-full px-3 font-body-sm text-body-sm font-bold transition-colors ${
                      view === item.id
                        ? 'bg-gradient-to-r from-accent-purple-glow to-secondary text-bg-canvas'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {view === 'day' ? (
            <Card
              title="Arrivals"
              subtitle="Grouped by arrival time"
              icon="book_online"
              actions={
                <Badge tone="neutral">
                  {filtered.length} shown
                </Badge>
              }
              bodyClassName="flex flex-col gap-4"
            >
              {groups.length === 0 ? (
                <EmptyState
                  icon="event_busy"
                  title={search.trim() ? 'No matching reservations' : 'Nothing booked in this view'}
                  description={
                    search.trim()
                      ? 'Try a different guest name, phone number, or table.'
                      : 'New bookings will appear here as they come in.'
                  }
                  action={
                    tab === 'all' && !search.trim() ? (
                      <Button variant="primary" icon="add" onClick={openCreate}>
                        New reservation
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                groups.map((group) => {
                  const covers = group.rows.reduce((sum, row) => sum + row.partySize, 0);
                  return (
                    <section key={group.key} className="flex flex-col gap-2">
                      <div className="flex items-center gap-3 px-1">
                        <span className="font-mono-metric-md text-mono-metric-md font-bold text-accent-cyan-bright">
                          {group.label}
                        </span>
                        <span className="h-px flex-1 bg-border-subtle" />
                        <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                          {group.rows.length} {group.rows.length === 1 ? 'party' : 'parties'} · {covers} covers
                        </span>
                      </div>

                      <div className="flex flex-col gap-2">
                        {group.rows.map((reservation) => {
                          const canSeat = !['seated', 'cancelled', 'completed', 'no_show'].includes(
                            reservation.status,
                          );
                          return (
                            <article
                              key={reservation.id}
                              className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-container p-3 sm:p-4 lg:flex-row lg:items-center"
                            >
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                <Avatar name={reservation.guestName} />
                                <div className="flex min-w-0 flex-col gap-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate font-body-base text-body-base font-bold text-text-primary">
                                      {reservation.guestName}
                                    </span>
                                    {reservation.vip && <Badge tone="violet">VIP</Badge>}
                                    <Badge tone={statusTone(reservation.status)}>
                                      {statusLabel(reservation.status)}
                                    </Badge>
                                    <Badge tone="neutral">{sourceLabel(reservation.source)}</Badge>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body-sm text-body-sm text-text-tertiary">
                                    <span className="flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[16px]">group</span>
                                      {reservation.partySize} guests
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[16px]">
                                        table_restaurant
                                      </span>
                                      {reservation.tableNumber ?? 'Unassigned'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[16px]">schedule</span>
                                      {timeLabel(reservation.reservationTime)}
                                    </span>
                                    {reservation.phone && (
                                      <span className="flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[16px]">call</span>
                                        {reservation.phone}
                                      </span>
                                    )}
                                    {reservation.occasion && (
                                      <span className="font-semibold text-accent-purple-glow">
                                        {reservation.occasion}
                                      </span>
                                    )}
                                  </div>

                                  {reservation.notes && (
                                    <p className="line-clamp-2 font-body-sm text-body-sm text-text-secondary">
                                      <span className="text-text-tertiary">Note: </span>
                                      {reservation.notes}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex gap-2 lg:shrink-0">
                                <Button
                                  variant="ghost"
                                  size="md"
                                  icon="notifications_active"
                                  className="flex-1 lg:flex-none"
                                  disabled={reservation.status === 'seated'}
                                  onClick={() => notifyGuest(reservation)}
                                >
                                  Notify
                                </Button>
                                {canSeat && (
                                  <Button
                                    variant="success"
                                    size="md"
                                    icon="chair"
                                    className="flex-1 lg:flex-none"
                                    loading={seatingId === reservation.id}
                                    onClick={() => void seat(reservation)}
                                  >
                                    Seat
                                  </Button>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  );
                })
              )}
            </Card>
            ) : view === 'week' ? (
              <Card
                title="Calendar"
                subtitle="Tap a day to open its full book"
                icon="calendar_view_week"
                actions={<Badge tone="neutral">{filtered.length} bookings</Badge>}
                bodyClassName="overflow-x-auto"
              >
                <div className="grid min-w-[860px] grid-cols-7 gap-2">
                  {weekDays.map((day) => {
                    const rows = rowsFor(day);
                    const covers = rows.reduce((sum, row) => sum + row.partySize, 0);
                    const isToday = day.getTime() === today.getTime();
                    return (
                      <div
                        key={dayKey(day)}
                        className={`flex min-h-[240px] flex-col gap-2 rounded-xl border p-2 ${
                          isToday
                            ? 'border-accent-cyan-bright/50 bg-accent-cyan-bright/[0.06]'
                            : 'border-border-subtle bg-surface-container-low'
                        }`}
                      >
                        <button
                          type="button"
                          aria-label={`${shortDay(day)} — open day`}
                          onClick={() => openDay(day)}
                          className="flex items-baseline justify-between gap-1 text-left"
                        >
                          <span
                            className={`font-body-sm text-body-sm font-bold ${
                              isToday ? 'text-accent-cyan-bright' : 'text-text-primary'
                            }`}
                          >
                            {shortDay(day)}
                          </span>
                          <span className="font-mono-metric-sm text-[10px] text-text-tertiary">
                            {rows.length}
                          </span>
                        </button>

                        <div className="flex flex-1 flex-col gap-1">
                          {rows.length === 0 ? (
                            <span className="pt-6 text-center font-body-sm text-body-sm text-text-subtle">
                              —
                            </span>
                          ) : (
                            rows.map((reservation) => (
                              <BookingPill key={reservation.id} reservation={reservation} />
                            ))
                          )}
                        </div>

                        {rows.length > 0 && (
                          <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                            {covers} covers
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : view === 'month' ? (
              <Card
                title="Calendar"
                subtitle="Tap a day to open its full book"
                icon="calendar_month"
                actions={<Badge tone="neutral">{filtered.length} bookings</Badge>}
                bodyClassName="overflow-x-auto"
              >
                <div className="min-w-[780px]">
                  <div className="grid grid-cols-7 gap-1 pb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                      <span
                        key={label}
                        className="px-1 font-label-badge text-label-badge uppercase text-text-tertiary"
                      >
                        {label}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {monthGridDays.map((day) => {
                      const rows = rowsFor(day);
                      const inMonth = day.getMonth() === range.from.getMonth();
                      const isToday = day.getTime() === today.getTime();
                      return (
                        <button
                          key={dayKey(day)}
                          type="button"
                          aria-label={`${shortDay(day)} — open day`}
                          onClick={() => openDay(day)}
                          className={`flex min-h-[104px] flex-col items-stretch gap-1 rounded-lg border p-1.5 text-left transition-colors ${
                            inMonth
                              ? 'border-border-subtle bg-surface-container-low hover:border-secondary/50 hover:bg-surface-container'
                              : 'border-transparent bg-surface-container-lowest/30 hover:border-border-subtle'
                          } ${isToday ? 'ring-1 ring-accent-cyan-bright' : ''}`}
                        >
                          <span
                            className={`px-0.5 font-mono-metric-sm text-mono-metric-sm font-bold ${
                              isToday
                                ? 'text-accent-cyan-bright'
                                : inMonth
                                  ? 'text-text-secondary'
                                  : 'text-text-subtle'
                            }`}
                          >
                            {day.getDate()}
                          </span>
                          {rows.slice(0, 3).map((reservation) => (
                            <BookingPill
                              key={reservation.id}
                              reservation={reservation}
                              compact
                            />
                          ))}
                          {rows.length > 3 && (
                            <span className="px-0.5 font-body-sm text-[10px] font-semibold text-text-tertiary">
                              +{rows.length - 3} more
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>
            ) : (
              <Card
                title="Calendar"
                subtitle="Tap a month to drill into the calendar"
                icon="calendar_today"
                actions={<Badge tone="neutral">{filtered.length} bookings</Badge>}
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {yearMonths.map((month) => {
                    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1).getTime();
                    const monthEnd = new Date(
                      month.getFullYear(),
                      month.getMonth() + 1,
                      1,
                    ).getTime();
                    const rows = filtered.filter((reservation) => {
                      const at = new Date(reservation.reservationTime).getTime();
                      return at >= monthStart && at < monthEnd;
                    });
                    const covers = rows.reduce((sum, row) => sum + row.partySize, 0);
                    const isCurrent =
                      month.getFullYear() === today.getFullYear() &&
                      month.getMonth() === today.getMonth();
                    return (
                      <button
                        key={month.toISOString()}
                        type="button"
                        onClick={() => openMonth(month)}
                        className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors ${
                          isCurrent
                            ? 'border-accent-cyan-bright/50 bg-accent-cyan-bright/[0.06] hover:bg-accent-cyan-bright/[0.1]'
                            : 'border-border-subtle bg-surface-container-low hover:border-secondary/50 hover:bg-surface-container'
                        }`}
                      >
                        <span className="font-body-base text-body-base font-bold text-text-primary">
                          {month.toLocaleDateString('en-US', { month: 'long' })}
                        </span>
                        <span className="font-mono-metric-md text-mono-metric-md font-bold text-accent-cyan-bright">
                          {rows.length}
                        </span>
                        <span className="font-body-sm text-body-sm text-text-tertiary">
                          bookings · {covers} covers
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New reservation"
        description="Book a table for tonight’s service."
        icon="book_online"
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" icon="check" loading={saving} onClick={() => void submit()}>
              Create reservation
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Guest name">
              <input
                autoFocus
                value={form.guestName}
                onChange={(event) => update('guestName', event.target.value)}
                placeholder="e.g. Jordan Ellis"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                placeholder="(555) 010-2233"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Party size">
              <input
                type="number"
                min={1}
                max={40}
                value={form.partySize}
                onChange={(event) => update('partySize', event.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Date & time">
              <input
                type="datetime-local"
                value={form.time}
                onChange={(event) => update('time', event.target.value)}
                className={`${INPUT_CLASS} [color-scheme:dark]`}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
              placeholder="Allergies, occasion, seating preference…"
              className="min-h-[84px] w-full rounded-lg border border-border-subtle bg-surface-container-lowest p-3 font-body-sm text-body-sm text-text-primary outline-none placeholder:text-text-subtle focus:border-secondary"
            />
          </Field>

          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-border-subtle bg-surface-container-lowest px-3">
            <input
              type="checkbox"
              checked={form.vip}
              onChange={(event) => update('vip', event.target.checked)}
              className="h-5 w-5 accent-accent-purple-glow"
            />
            <span className="flex flex-col">
              <span className="font-body-sm text-body-sm font-bold text-text-primary">VIP guest</span>
              <span className="font-body-sm text-body-sm text-text-tertiary">
                Flag for the host and briefing board.
              </span>
            </span>
          </label>
        </div>
      </Modal>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-label-badge text-label-badge uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}

function BookingPill({
  reservation,
  compact = false,
}: {
  reservation: Reservation;
  compact?: boolean;
}) {
  const tone =
    reservation.status === 'waitlist'
      ? 'bg-status-caution/15 text-status-caution'
      : reservation.status === 'seated'
        ? 'bg-status-ready/15 text-status-ready'
        : reservation.vip
          ? 'bg-accent-purple-glow/15 text-accent-purple-glow'
          : 'bg-surface-container-high text-text-secondary';
  return (
    <span
      className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 font-body-sm text-[11px] ${tone}`}
      title={`${timeLabel(reservation.reservationTime)} · ${reservation.guestName} · ${
        reservation.partySize
      } guests`}
    >
      <span className="shrink-0 font-mono-metric-sm text-[10px] font-bold">
        {compact ? compactTime(reservation.reservationTime) : timeLabel(reservation.reservationTime)}
      </span>
      <span className="truncate">
        {compact ? reservation.guestName.replace(/^The\s+/i, '') : reservation.guestName}
      </span>
      <span className="ml-auto shrink-0 opacity-70">
        {compact ? `${reservation.partySize}p` : reservation.partySize}
      </span>
    </span>
  );
}
