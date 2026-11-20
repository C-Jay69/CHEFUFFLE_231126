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
import { dateLabel, localInputValue, timeLabel, titleCase } from '@/lib/format';
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

function emptyForm(): ReservationForm {
  return {
    guestName: '',
    phone: '',
    partySize: '2',
    time: nextTimeSlot(),
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

export default function ReservationsPage() {
  const [data, setData] = useState<ReservationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<ReservationForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [seatingId, setSeatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await api.get<ReservationResponse>('/reservations');
    setData(response);
    setError(null);
    return response;
  }, []);

  useEffect(() => {
    load()
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : 'Could not reach the reservations API.');
        showToast('Could not load reservations.', 'error');
      })
      .finally(() => setLoading(false));
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

  const openCreate = () => {
    setForm(emptyForm());
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
    ? `${dateLabel(data.date)} · ${data.stats.total} bookings · ${data.stats.covers} covers`
    : 'Loading today’s book…';

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
                hint={`${data.stats.total} bookings today`}
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
                                <Button
                                  variant="success"
                                  size="md"
                                  icon="chair"
                                  className="flex-1 lg:flex-none"
                                  disabled={!canSeat}
                                  loading={seatingId === reservation.id}
                                  onClick={() => void seat(reservation)}
                                >
                                  Seat
                                </Button>
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
