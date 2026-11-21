'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Stat,
} from '@/components/ui';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { showToast } from '@/lib/toast';

type TenderKey =
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'debit'
  | 'otherCard'
  | 'cash'
  | 'giftCard'
  | 'house'
  | 'unallocated';

type Tender = { count: number; amount: number };

interface Drawer {
  serverId?: string;
  serverName?: string;
  name?: string;
  role?: string;
  sales: number;
  tax: number;
  tips: number;
  gross: number;
  checks: number;
  covers: number;
  tenders: Record<TenderKey, Tender>;
  cardTotal: number;
  cashRecorded: number;
  cashDue: number;
  slipCount: number;
}

interface EndOfNightResponse {
  date: string;
  range: { from: string; to: string };
  totals: Drawer;
  tenders: Record<TenderKey, Tender>;
  servers: Drawer[];
  bar: Drawer;
  unallocatedChecks: number;
}

type CountField = 'visa' | 'mastercard' | 'amex' | 'otherCard' | 'cash';
type CountValues = Record<CountField, string>;

const COUNT_FIELDS: Array<{ key: CountField; label: string }> = [
  { key: 'visa', label: 'Visa' },
  { key: 'mastercard', label: 'Mastercard' },
  { key: 'amex', label: 'Amex' },
  { key: 'otherCard', label: 'Other card' },
  { key: 'cash', label: 'Cash' },
];

const TENDER_LABELS: Record<TenderKey, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  debit: 'Debit',
  otherCard: 'Other card',
  cash: 'Cash',
  giftCard: 'Gift card',
  house: 'House account',
  unallocated: 'Unallocated',
};

const EMPTY_COUNTS: CountValues = {
  visa: '',
  mastercard: '',
  amex: '',
  otherCard: '',
  cash: '',
};

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

const dateKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`;

const dayLabel = (value: Date) =>
  value.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

const numeric = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function drawerKey(drawer: Drawer) {
  return drawer.serverId ?? 'bar';
}

function drawerName(drawer: Drawer) {
  return drawer.serverName ?? drawer.name ?? 'Unassigned';
}

function expectedFor(drawer: Drawer, field: CountField) {
  if (field === 'cash') return drawer.cashDue;
  return drawer.tenders[field].amount;
}

function countedFor(drawer: Drawer, counts: CountValues | undefined) {
  if (!counts) return 0;
  return COUNT_FIELDS.reduce((sum, field) => sum + numeric(counts[field.key]), 0);
}

function hasAnyCount(counts: CountValues | undefined) {
  if (!counts) return false;
  return COUNT_FIELDS.some((field) => counts[field.key].trim() !== '');
}

export default function EndOfNightPage() {
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [data, setData] = useState<EndOfNightResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState<Record<string, CountValues>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const storageKey = `sh-eon-${dateKey(cursor)}`;

  const load = useCallback(
    async (spinner = false) => {
      if (spinner) setRefreshing(true);
      try {
        const response = await api.get<EndOfNightResponse>(
          `/end-of-night?date=${encodeURIComponent(cursor.toISOString())}`,
        );
        setData(response);
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : 'Could not load the night report.',
          'error',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cursor],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setCounts(raw ? (JSON.parse(raw) as Record<string, CountValues>) : {});
    } catch {
      setCounts({});
    }
  }, [storageKey]);

  const updateCount = (key: string, field: CountField, value: string) => {
    setCounts((current) => {
      const next = {
        ...current,
        [key]: { ...(current[key] ?? EMPTY_COUNTS), [field]: value },
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  };

  const clearCounts = () => {
    setCounts({});
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* private mode */
    }
    showToast('Count sheet cleared for this date.', 'success');
  };

  const drawers = useMemo(() => {
    if (!data) return [] as Drawer[];
    return [...data.servers, ...(data.bar.checks > 0 ? [data.bar] : [])];
  }, [data]);

  const allCounted =
    drawers.length > 0 && drawers.every((drawer) => hasAnyCount(counts[drawerKey(drawer)]));

  const countedTotal = drawers.reduce(
    (sum, drawer) => sum + countedFor(drawer, counts[drawerKey(drawer)]),
    0,
  );
  const expectedTotal = drawers.reduce(
    (sum, drawer) => sum + drawer.cardTotal + drawer.cashDue,
    0,
  );

  const countedDrawers = drawers.filter((drawer) =>
    hasAnyCount(counts[drawerKey(drawer)]),
  ).length;

  const tenderRows = data
    ? (Object.keys(TENDER_LABELS) as TenderKey[])
        .map((key) => ({ key, ...data.tenders[key] }))
        .filter((row) => row.count > 0)
    : [];

  const description = data
    ? `${dayLabel(cursor)} · ${data.totals.checks} checks · ${money(data.totals.gross)} collected`
    : 'Loading the night report…';

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow="Close of business"
          icon="nightlife"
          title="End of Night"
          description={description}
          actions={
            <>
              <Button
                variant="secondary"
                icon="print"
                onClick={() => window.print()}
                className="hidden sm:inline-flex"
              >
                Print
              </Button>
              <Button
                variant="secondary"
                icon="refresh"
                loading={refreshing}
                onClick={() => void load(true)}
              >
                Refresh
              </Button>
            </>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => setCursor((current) => addDays(current, -1))}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-surface-container text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
            >
              <span className="material-symbols-outlined text-body-base">chevron_left</span>
            </button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(startOfDay(new Date()))}>
              Today
            </Button>
            <button
              type="button"
              aria-label="Next day"
              onClick={() => setCursor((current) => addDays(current, 1))}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-surface-container text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
            >
              <span className="material-symbols-outlined text-body-base">chevron_right</span>
            </button>
            <span className="ml-2 font-body-base text-body-base font-bold text-text-primary">
              {dayLabel(cursor)}
            </span>
          </div>
          <Button variant="ghost" size="sm" icon="restart_alt" onClick={clearCounts}>
            Clear count sheet
          </Button>
        </div>

        {loading && !data ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-headline-xl text-secondary">
              progress_activity
            </span>
          </div>
        ) : !data ? (
          <EmptyState
            icon="cloud_off"
            title="Could not load the night report"
            description="Check the operations API and try again."
            action={
              <Button variant="primary" icon="refresh" onClick={() => void load(true)}>
                Retry
              </Button>
            }
          />
        ) : data.totals.checks === 0 ? (
          <EmptyState
            icon="nightlife"
            title="No paid checks on this date"
            description="Settle checks in Open Checks and the night report will populate here."
            action={
              <Button variant="primary" icon="receipt_long" onClick={() => (window.location.href = '/pos')}>
                Open checks
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Collected"
                value={money(data.totals.gross)}
                icon="payments"
                tone="secondary"
                hint={`${data.totals.checks} checks · ${data.totals.covers} covers`}
              />
              <Stat
                label="Net sales"
                value={money(data.totals.sales)}
                icon="receipt_long"
                tone="ready"
                hint="Before tax and tips"
              />
              <Stat
                label="Tax"
                value={money(data.totals.tax)}
                icon="account_balance"
                tone="caution"
                hint="8% collected"
              />
              <Stat
                label="Tips"
                value={money(data.totals.tips)}
                icon="volunteer_activism"
                tone="violet"
                hint="Declared on checks"
              />
            </div>

            {data.unallocatedChecks > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-status-caution/40 bg-status-caution/10 px-4 py-3">
                <span className="material-symbols-outlined text-body-base text-status-caution">
                  warning
                </span>
                <p className="font-body-sm text-body-sm text-text-secondary">
                  <span className="font-bold text-status-caution">
                    {data.unallocatedChecks} paid check
                    {data.unallocatedChecks === 1 ? '' : 's'} have no tender recorded.
                  </span>{' '}
                  Pick the card brand (Visa / Mastercard / Amex) or cash when settling in Open
                  Checks so the slips reconcile.
                </p>
              </div>
            )}

            <Card
              title="Tender mix"
              icon="credit_card"
              subtitle="What the computer says came in today"
              actions={
                <Badge tone="neutral">
                  {money(data.totals.gross)} total
                </Badge>
              }
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {tenderRows.map((row) => (
                  <div
                    key={row.key}
                    className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2 ${
                      row.key === 'unallocated'
                        ? 'border-status-caution/40 bg-status-caution/10'
                        : 'border-border-subtle bg-surface-container'
                    }`}
                  >
                    <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                      {TENDER_LABELS[row.key]}
                    </span>
                    <span className="font-mono-metric-md text-mono-metric-md font-bold text-text-primary">
                      {money(row.amount)}
                    </span>
                    <span className="font-body-sm text-body-sm text-text-tertiary">
                      {row.count} {row.key === 'cash' ? 'cash checks' : 'slips'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title="Server & bar tallies"
              icon="groups"
              subtitle="Match the physical slips and cash to each drawer"
              actions={
                <Badge tone={allCounted ? 'ready' : 'neutral'}>
                  {countedDrawers}/{drawers.length} counted
                </Badge>
              }
              bodyClassName="flex flex-col gap-2"
            >
              {drawers.map((drawer) => {
                const key = drawerKey(drawer);
                const isBar = key === 'bar';
                const values = counts[key] ?? EMPTY_COUNTS;
                const counted = countedFor(drawer, values);
                const expected = drawer.cardTotal + drawer.cashDue;
                const variance = counted - expected;
                const open = expanded === key;
                const countedFlag = hasAnyCount(values);
                return (
                  <article
                    key={key}
                    className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-container p-3"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        {isBar ? (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-purple-glow/15 text-accent-purple-glow">
                            <span className="material-symbols-outlined text-[20px]">local_bar</span>
                          </span>
                        ) : (
                          <Avatar name={drawerName(drawer)} size="sm" />
                        )}
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-body-base text-body-base font-bold text-text-primary">
                              {isBar ? 'Bar till' : drawerName(drawer)}
                            </span>
                            {isBar ? (
                              <Badge tone="violet">Bar</Badge>
                            ) : (
                              <Badge tone="neutral">{drawer.checks} checks</Badge>
                            )}
                            <span className="font-body-sm text-body-sm text-text-tertiary">
                              {drawer.covers} covers
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body-sm text-body-sm text-text-tertiary">
                            <span>
                              Sales{' '}
                              <span className="font-bold text-text-secondary">
                                {money(drawer.gross)}
                              </span>
                            </span>
                            <span>
                              Card{' '}
                              <span className="font-bold text-text-secondary">
                                {money(drawer.cardTotal)}
                              </span>
                            </span>
                            <span>
                              Cash due{' '}
                              <span className="font-bold text-accent-cyan-bright">
                                {money(drawer.cashDue)}
                              </span>
                            </span>
                            <span>
                              Slips{' '}
                              <span className="font-bold text-text-secondary">
                                {drawer.tenders.visa.count}V · {drawer.tenders.mastercard.count}M ·{' '}
                                {drawer.tenders.amex.count}A
                                {drawer.tenders.debit.count + drawer.tenders.otherCard.count > 0
                                  ? ` · ${drawer.tenders.debit.count + drawer.tenders.otherCard.count} other`
                                  : ''}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {countedFlag && (
                          <span
                            className={`font-mono-metric-sm text-mono-metric-sm font-bold ${
                              Math.abs(variance) < 0.005
                                ? 'text-status-ready'
                                : variance < 0
                                  ? 'text-status-urgent'
                                  : 'text-status-caution'
                            }`}
                          >
                            {variance < 0 ? '-' : '+'}
                            {money(Math.abs(variance))}
                          </span>
                        )}
                        <Button
                          variant={open ? 'secondary' : 'ghost'}
                          size="sm"
                          icon={open ? 'expand_less' : 'edit_note'}
                          onClick={() => setExpanded(open ? null : key)}
                        >
                          {open ? 'Close' : 'Count'}
                        </Button>
                      </div>
                    </div>

                    {open && (
                      <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-container-low p-3">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                          {COUNT_FIELDS.map((field) => {
                            const expectedAmount = expectedFor(drawer, field.key);
                            const value = values[field.key];
                            const entered = value.trim() === '' ? null : numeric(value);
                            const diff =
                              entered === null ? null : entered - expectedAmount;
                            return (
                              <label key={field.key} className="flex flex-col gap-1">
                                <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                                  {field.label}
                                </span>
                                <span className="font-body-sm text-body-sm text-text-subtle">
                                  Expect {money(expectedAmount)}
                                </span>
                                <input
                                  inputMode="decimal"
                                  value={value}
                                  onChange={(event) =>
                                    updateCount(key, field.key, event.target.value)
                                  }
                                  placeholder="0.00"
                                  className="h-10 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-2 font-body-sm text-body-sm text-text-primary outline-none focus:border-secondary"
                                />
                                {diff !== null && Math.abs(diff) >= 0.005 && (
                                  <span
                                    className={`font-body-sm text-body-sm font-bold ${
                                      diff < 0 ? 'text-status-urgent' : 'text-status-caution'
                                    }`}
                                  >
                                    {diff < 0 ? 'Short ' : 'Over '}
                                    {money(Math.abs(diff))}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2">
                          <span className="font-body-sm text-body-sm text-text-tertiary">
                            Counted {money(counted)} of {money(expected)}
                            {drawer.tenders.giftCard.amount + drawer.tenders.house.amount > 0
                              ? ` · ${money(
                                  drawer.tenders.giftCard.amount + drawer.tenders.house.amount,
                                )} gift/house not counted here`
                              : ''}
                          </span>
                          <span
                            className={`font-mono-metric-sm text-mono-metric-sm font-bold ${
                              !countedFlag
                                ? 'text-text-subtle'
                                : Math.abs(variance) < 0.005
                                  ? 'text-status-ready'
                                  : variance < 0
                                    ? 'text-status-urgent'
                                    : 'text-status-caution'
                            }`}
                          >
                            {!countedFlag
                              ? 'Enter counts'
                              : Math.abs(variance) < 0.005
                                ? 'Balanced'
                                : `${variance < 0 ? 'Short' : 'Over'} ${money(Math.abs(variance))}`}
                          </span>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </Card>

            <Card
              title="Reconciliation"
              icon="calculate"
              subtitle="Counted drawers against the computer total"
              actions={
                <Badge tone={allCounted ? 'ready' : 'caution'}>
                  {allCounted ? 'Ready to close' : 'Count in progress'}
                </Badge>
              }
            >
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl bg-surface-container px-3 py-2">
                    <span className="block font-label-badge text-label-badge uppercase text-text-tertiary">
                      Computer total
                    </span>
                    <span className="font-mono-metric-md text-mono-metric-md font-bold text-text-primary">
                      {money(data.totals.gross)}
                    </span>
                  </div>
                  <div className="rounded-xl bg-surface-container px-3 py-2">
                    <span className="block font-label-badge text-label-badge uppercase text-text-tertiary">
                      Slips + cash counted
                    </span>
                    <span className="font-mono-metric-md text-mono-metric-md font-bold text-text-primary">
                      {money(countedTotal)}
                    </span>
                  </div>
                  <div className="rounded-xl bg-surface-container px-3 py-2">
                    <span className="block font-label-badge text-label-badge uppercase text-text-tertiary">
                      Expected to count
                    </span>
                    <span className="font-mono-metric-md text-mono-metric-md font-bold text-text-secondary">
                      {money(expectedTotal)}
                    </span>
                  </div>
                  <div
                    className={`rounded-xl px-3 py-2 ${
                      !allCounted
                        ? 'bg-surface-container'
                        : Math.abs(countedTotal - data.totals.gross) < 0.005
                          ? 'bg-status-ready/10'
                          : 'bg-status-urgent/10'
                    }`}
                  >
                    <span className="block font-label-badge text-label-badge uppercase text-text-tertiary">
                      Over / short
                    </span>
                    <span
                      className={`font-mono-metric-md text-mono-metric-md font-bold ${
                        !allCounted
                          ? 'text-text-subtle'
                          : Math.abs(countedTotal - data.totals.gross) < 0.005
                            ? 'text-status-ready'
                            : 'text-status-urgent'
                      }`}
                    >
                      {!allCounted
                        ? '—'
                        : `${countedTotal - data.totals.gross > 0 ? '+' : ''}${money(
                            countedTotal - data.totals.gross,
                          )}`}
                    </span>
                  </div>
                </div>

                <p className="font-body-sm text-body-sm text-text-tertiary">
                  {allCounted
                    ? 'Every drawer is counted. File the slips in the night envelope and close the till.'
                    : `Count ${
                        drawers.length - countedDrawers
                      } more drawer(s) to see the over / short against the ${
                        data.totals.checks
                      } paid checks on the computer.`}
                </p>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
