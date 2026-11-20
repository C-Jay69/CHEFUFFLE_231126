'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dateLabel, localInputValue, money, timeLabel, titleCase } from '@/lib/format';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import type { Shift, ShiftResponse } from '@/lib/types';

const ROLE_OPTIONS = [
  { value: 'server', label: 'Server' },
  { value: 'bartender', label: 'Bartender' },
  { value: 'host', label: 'Host' },
  { value: 'line_cook', label: 'Line Cook' },
  { value: 'chef_expo', label: 'Chef / Expo' },
  { value: 'floor_manager', label: 'Floor Manager' },
  { value: 'general_manager', label: 'General Manager' },
  { value: 'owner', label: 'Owner' },
];

const FOH_ROLES = ['server', 'bartender', 'host'];
const BOH_ROLES = ['chef_expo', 'line_cook'];
const MGMT_ROLES = ['owner', 'general_manager', 'floor_manager'];

type GroupId = 'all' | 'foh' | 'boh' | 'management';

function groupForRole(role: string): Exclude<GroupId, 'all'> {
  if (BOH_ROLES.includes(role)) return 'boh';
  if (MGMT_ROLES.includes(role)) return 'management';
  return 'foh';
}

function shiftStatusTone(status: string): 'ready' | 'info' | 'neutral' {
  if (status === 'active') return 'ready';
  if (status === 'clocked_out') return 'neutral';
  return 'info';
}

function shiftStatusLabel(status: string) {
  if (status === 'active') return 'On shift';
  if (status === 'clocked_out') return 'Clocked out';
  return 'Scheduled';
}

const inputClass =
  'h-11 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-sm text-body-sm text-text-primary outline-none transition-colors [color-scheme:dark] focus:border-secondary';

function defaultStart() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  return localInputValue(date);
}

function defaultEnd() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 8);
  return localInputValue(date);
}

function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">{label}</span>
      {children}
      {hint && <span className="font-body-sm text-body-sm text-text-subtle">{hint}</span>}
    </label>
  );
}

export default function SchedulingPage() {
  const [data, setData] = useState<ShiftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [serverName, setServerName] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupId>('all');
  const [query, setQuery] = useState('');
  const [clocking, setClocking] = useState<string | null>(null);
  const [cutting, setCutting] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    role: 'server',
    rate: '',
    start: defaultStart(),
    end: defaultEnd(),
  });

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const response = await api.get<ShiftResponse>('/shifts');
      setData(response);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not load the schedule.',
        'error',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('sh-staff') || 'null');
      if (stored?.name) setServerName(String(stored.name));
    } catch {
      /* ignore malformed local storage */
    }
  }, []);

  useEffect(() => {
    const offs = [
      listen('LABOR_PACING_UPDATE', () => void load()),
      listen('BRIEFING_UPDATED', () => void load()),
    ];
    return () => offs.forEach((off) => off());
  }, [load]);

  const shifts = data?.shifts ?? [];
  const summary = data?.summary;
  const pacing = data?.pacing;

  const counts = useMemo(() => {
    const base = { all: shifts.length, foh: 0, boh: 0, management: 0 };
    for (const shift of shifts) base[groupForRole(shift.role)] += 1;
    return base;
  }, [shifts]);

  const visibleShifts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return shifts.filter((shift) => {
      if (group !== 'all' && groupForRole(shift.role) !== group) return false;
      if (!term) return true;
      return (
        shift.userName.toLowerCase().includes(term) ||
        shift.roleLabel.toLowerCase().includes(term) ||
        (shift.station ?? '').toLowerCase().includes(term)
      );
    });
  }, [shifts, group, query]);

  const openNew = () => {
    setForm({
      name: '',
      role: 'server',
      rate: '',
      start: defaultStart(),
      end: defaultEnd(),
    });
    setNewOpen(true);
  };

  const toggleClock = async (shift: Shift) => {
    const action = shift.status === 'active' ? 'clock-out' : 'clock-in';
    setClocking(shift.id);
    try {
      await api.post(`/shifts/${shift.id}/${action}`);
      showToast(
        `${shift.userName} clocked ${action === 'clock-in' ? 'in' : 'out'}.`,
        'success',
      );
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not update the time clock.',
        'error',
      );
    } finally {
      setClocking(null);
    }
  };

  const createShift = async () => {
    const name = form.name.trim();
    const rate = Number(form.rate);
    if (!name) {
      showToast('Enter a staff name for the shift.', 'warn');
      return;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      showToast('Enter a valid hourly rate.', 'warn');
      return;
    }
    if (!form.start || !form.end) {
      showToast('Set a start and end time.', 'warn');
      return;
    }
    const start = new Date(form.start);
    const end = new Date(form.end);
    if (!(start.getTime() < end.getTime())) {
      showToast('End time must be after the start time.', 'warn');
      return;
    }

    setSaving(true);
    try {
      await api.post('/shifts', {
        userName: name,
        role: form.role,
        hourlyRate: rate,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
      });
      showToast(`${name} added to the schedule.`, 'success');
      setNewOpen(false);
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not create the shift.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const broadcastCut = async () => {
    setCutting(true);
    try {
      const result = await api.post<{ recipients?: string[]; activeStaff?: number }>(
        '/labor/broadcast-cut',
        {},
      );
      const recipients = result?.recipients ?? [];
      showToast(
        recipients.length > 0
          ? `Early cut broadcast sent to ${recipients.join(', ')}.`
          : 'Early cut broadcast sent to the active floor.',
        'success',
      );
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not broadcast the early cut.',
        'error',
      );
    } finally {
      setCutting(false);
    }
  };

  const description = `${data ? dateLabel(data.date) : dateLabel(new Date())}${
    serverName ? ` · Serving as ${serverName}` : ''
  }`;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow="Live floor"
          icon="calendar_month"
          title="Scheduling"
          description={description}
          actions={
            <>
              <Button
                variant="ghost"
                icon="refresh"
                loading={refreshing}
                onClick={() => void load(true)}
              >
                Refresh
              </Button>
              <Button variant="primary" icon="add" onClick={openNew}>
                New shift
              </Button>
            </>
          }
        />

        {loading && !data ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-headline-xl text-secondary">
              progress_activity
            </span>
          </div>
        ) : !data || !summary || !pacing ? (
          <EmptyState
            icon="cloud_off"
            title="Schedule unavailable"
            description="The scheduling API did not respond. Check the operations service and try again."
            action={
              <Button variant="primary" icon="refresh" onClick={() => void load(true)}>
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="On shift"
                value={summary.active}
                icon="group"
                tone="ready"
                hint={`${summary.total} on today's roster`}
              />
              <Stat
                label="Scheduled"
                value={summary.scheduled}
                icon="pending_actions"
                tone="secondary"
                hint="Awaiting clock-in"
              />
              <Stat
                label="Labor %"
                value={`${summary.laborPercentage}%`}
                icon="percent"
                tone={summary.pacingStatus === 'PACING_ALERT' ? 'urgent' : 'ready'}
                hint={`Target ${summary.targetPercentage}%`}
              />
              <Stat
                label="Target"
                value={`${summary.targetPercentage}%`}
                icon="flag"
                tone="violet"
                hint="Labor budget"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <Card
                  title="Today's shifts"
                  icon="badge"
                  actions={<Badge tone="neutral">{summary.total} total</Badge>}
                >
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Tabs
                      value={group}
                      onChange={(id) => setGroup(id as GroupId)}
                      items={[
                        { id: 'all', label: 'All', count: counts.all },
                        { id: 'foh', label: 'FOH', count: counts.foh },
                        { id: 'boh', label: 'BOH', count: counts.boh },
                        { id: 'management', label: 'Mgmt', count: counts.management },
                      ]}
                    />
                    <SearchInput
                      value={query}
                      onChange={setQuery}
                      placeholder="Search name, role, or station…"
                      className="sm:ml-auto sm:max-w-[260px]"
                    />
                  </div>

                  {visibleShifts.length === 0 ? (
                    <EmptyState
                      icon="event_busy"
                      title={shifts.length === 0 ? 'No shifts today' : 'No shifts match'}
                      description={
                        shifts.length === 0
                          ? 'Build the floor by adding the first shift for today.'
                          : 'Try another group or clear the search.'
                      }
                      action={
                        shifts.length === 0 ? (
                          <Button variant="primary" icon="add" onClick={openNew}>
                            New shift
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            icon="filter_alt_off"
                            onClick={() => {
                              setGroup('all');
                              setQuery('');
                            }}
                          >
                            Clear filters
                          </Button>
                        )
                      }
                    />
                  ) : (
                    <div className="flex flex-col gap-2">
                      {visibleShifts.map((shift) => (
                        <div
                          key={shift.id}
                          className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-container p-3 sm:flex-row sm:items-center"
                        >
                          <Avatar name={shift.userName} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-body-base text-body-base font-bold text-text-primary">
                                {shift.userName}
                              </span>
                              <Badge tone={shiftStatusTone(shift.status)}>
                                {shiftStatusLabel(shift.status)}
                              </Badge>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-body-sm text-body-sm text-text-tertiary">
                              <span>{shift.roleLabel || titleCase(shift.role)}</span>
                              <span className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">place</span>
                                {shift.station || 'Unassigned'}
                              </span>
                              <span className="font-mono-metric-sm text-mono-metric-sm text-text-secondary">
                                {timeLabel(shift.scheduledStart)} – {timeLabel(shift.scheduledEnd)}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {shift.status === 'clocked_out' ? (
                              <span className="flex min-w-[132px] items-center justify-end gap-1 font-mono-metric-sm text-mono-metric-sm text-text-tertiary">
                                <span className="material-symbols-outlined text-body-base text-status-ready">
                                  check_circle
                                </span>
                                {shift.hoursWorked > 0
                                  ? `${shift.hoursWorked.toFixed(1)}h worked`
                                  : 'Shift complete'}
                              </span>
                            ) : (
                              <Button
                                size="md"
                                variant={shift.status === 'active' ? 'secondary' : 'success'}
                                icon={shift.status === 'active' ? 'logout' : 'login'}
                                loading={clocking === shift.id}
                                onClick={() => void toggleClock(shift)}
                                className="min-w-[132px]"
                              >
                                {shift.status === 'active' ? 'Clock out' : 'Clock in'}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <div>
                <Card
                  title="Labor pacing"
                  icon="query_stats"
                  actions={
                    <Badge tone={pacing.status === 'PACING_ALERT' ? 'urgent' : 'ready'}>
                      {pacing.status === 'PACING_ALERT' ? 'Over pace' : 'Optimal'}
                    </Badge>
                  }
                >
                  <div className="flex items-end gap-2">
                    <span
                      className={cn(
                        'font-headline-xl text-headline-xl tracking-tight',
                        pacing.status === 'PACING_ALERT'
                          ? 'text-status-urgent'
                          : 'text-status-ready',
                      )}
                    >
                      {pacing.laborPercentage}%
                    </span>
                    <span className="pb-1 font-body-sm text-body-sm text-text-tertiary">
                      labor cost
                    </span>
                  </div>

                  <p className="mt-3 font-body-sm text-body-sm text-text-secondary">
                    {pacing.recommendation}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-surface-container p-3">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                        Burn / hr
                      </span>
                      <span className="mt-0.5 block font-mono-metric-md text-mono-metric-md font-bold text-text-primary">
                        {money(pacing.currentHourlyBurn)}
                      </span>
                      <span className="font-body-sm text-body-sm text-text-subtle">
                        {pacing.activeStaffCount} clocked in
                      </span>
                    </div>
                    <div className="rounded-xl bg-surface-container p-3">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                        Window sales
                      </span>
                      <span className="mt-0.5 block font-mono-metric-md text-mono-metric-md font-bold text-text-primary">
                        {money(pacing.windowSales)}
                      </span>
                      <span className="font-body-sm text-body-sm text-text-subtle">
                        vs {pacing.targetPercentage}% target
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 font-body-sm text-body-sm text-text-subtle">
                    {pacing.window.label}
                  </p>

                  <Button
                    variant="secondary"
                    icon="campaign"
                    className="mt-4 w-full"
                    loading={cutting}
                    disabled={pacing.activeStaffCount === 0}
                    onClick={() => void broadcastCut()}
                  >
                    Broadcast early cut
                  </Button>
                  {pacing.activeStaffCount === 0 && (
                    <p className="mt-2 text-center font-body-sm text-body-sm text-text-subtle">
                      Clock someone in to broadcast a cut.
                    </p>
                  )}
                </Card>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New shift"
        description="Add a name, role, rate, and scheduled window."
        icon="event_available"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="add"
              loading={saving}
              onClick={() => void createShift()}
            >
              Create shift
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Staff name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. Maya Chen"
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Role">
              <select
                className={inputClass}
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hourly rate">
              <input
                className={inputClass}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.rate}
                onChange={(event) => setForm((current) => ({ ...current, rate: event.target.value }))}
                placeholder="0.00"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Starts">
              <input
                className={inputClass}
                type="datetime-local"
                value={form.start}
                onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))}
              />
            </Field>
            <Field label="Ends">
              <input
                className={inputClass}
                type="datetime-local"
                value={form.end}
                onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))}
              />
            </Field>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
