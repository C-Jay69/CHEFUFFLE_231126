'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { money, timeLabel } from '@/lib/format';
import { useSession } from '@/lib/session';
import { showToast } from '@/lib/toast';
import type { Order } from '@/lib/types';

type Method = 'card' | 'cash' | 'gift_card' | 'house';
type Brand = 'visa' | 'mastercard' | 'amex' | 'debit' | 'other';
type SplitMode = 'full' | 'equal' | 'guest';

interface Share {
  label: string;
  amount: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const METHOD_LABELS: Record<Method, string> = {
  card: 'Card',
  cash: 'Cash',
  gift_card: 'Gift card',
  house: 'House',
};

const BRAND_LABELS: Record<Brand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  debit: 'Debit',
  other: 'Other',
};

const INPUT =
  'h-11 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-base text-body-base text-text-primary outline-none transition-colors focus:border-secondary';

function equalShares(total: number, count: number): Share[] {
  const cents = Math.max(0, Math.round(total * 100));
  const base = Math.floor(cents / count);
  const extra = cents - base * count;
  return Array.from({ length: count }, (_, index) => ({
    label: `Person ${index + 1} of ${count}`,
    amount: (base + (index < extra ? 1 : 0)) / 100,
  }));
}

function guestShares(order: Order, tip: number): Share[] {
  const subtotal = order.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const taxRate = subtotal > 0 ? order.tax / subtotal : 0;
  const bySeat = new Map<string, number>();
  for (const item of order.items) {
    const key = item.seat?.trim() || 'Shared';
    bySeat.set(key, (bySeat.get(key) ?? 0) + item.unitPrice * item.quantity);
  }
  return [...bySeat.entries()]
    .sort(([a], [b]) => {
      if (a === 'Shared') return 1;
      if (b === 'Shared') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    })
    .map(([seat, amount]) => {
      const tipShare = subtotal > 0 ? tip * (amount / subtotal) : 0;
      return {
        label: seat === 'Shared' ? 'Shared items' : `Guest ${seat}`,
        amount: round2(amount + amount * taxRate + tipShare),
      };
    });
}

export default function PayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can, ready, staff } = useSession();
  const canPay = can('serve.pay');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [tipInput, setTipInput] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('full');
  const [splitCount, setSplitCount] = useState(2);
  const [selectedShare, setSelectedShare] = useState<number | null>(null);
  const [method, setMethod] = useState<Method>('card');
  const [brand, setBrand] = useState<Brand>('visa');
  const [amountInput, setAmountInput] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<Order>(`/orders/${params.id}`);
      setOrder(response);
      setTipInput(response.tip > 0 ? response.tip.toFixed(2) : '');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not load this check.',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const subtotal = order?.subtotal ?? 0;
  const tax = order?.tax ?? 0;
  const tip = Number(tipInput) || 0;
  const total = round2(subtotal + tax + tip);
  const paid = order?.paidAmount ?? 0;
  const balance = order ? round2(total - paid) : 0;
  const isPaid = order?.status === 'paid';

  const shares = useMemo<Share[]>(() => {
    if (!order) return [];
    if (splitMode === 'equal') return equalShares(total, splitCount);
    if (splitMode === 'guest') return guestShares(order, tip);
    return [];
  }, [order, splitMode, splitCount, total, tip]);

  const allocated = useMemo(() => {
    let left = paid;
    return shares.map((share) => {
      const applied = Math.max(0, Math.min(share.amount, left));
      left = round2(left - applied);
      return {
        ...share,
        paid: applied,
        remaining: round2(share.amount - applied),
      };
    });
  }, [shares, paid]);

  useEffect(() => {
    const selected = selectedShare !== null ? allocated[selectedShare] : null;
    const target = selected ? selected.remaining : Math.max(0, balance);
    setAmountInput(target > 0.005 ? target.toFixed(2) : '');
  }, [allocated, selectedShare, balance]);

  const setTipPreset = (percent: number) => {
    setTipInput((subtotal * (percent / 100)).toFixed(2));
  };

  const addPayment = async () => {
    if (!order) return;
    const amount = round2(Number(amountInput));
    if (!(amount > 0)) {
      showToast('Enter a payment amount.', 'warn');
      return;
    }
    setBusy(true);
    try {
      const label =
        selectedShare !== null ? allocated[selectedShare]?.label ?? null : null;
      const updated = await api.post<Order>(`/orders/${order.id}/payments`, {
        amount,
        method,
        ...(method === 'card' ? { cardBrand: brand } : {}),
        tip: round2(tip),
        label,
      });
      setOrder(updated);
      setSelectedShare(null);
      showToast(
        updated.status === 'paid'
          ? `Check #${updated.orderNumber} paid — ${money(updated.total)}.`
          : `${money(amount)} taken — ${money(updated.balance ?? 0)} left.`,
        'success',
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not record the payment.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  if (ready && staff && !canPay) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
          <div className="flex max-w-sm flex-col items-center gap-2">
            <span className="material-symbols-outlined text-headline-xl text-status-caution">lock</span>
            <p className="font-body-base text-body-base font-bold text-text-primary">
              No access to payments
            </p>
            <p className="font-body-sm text-body-sm text-text-tertiary">
              {staff.roleLabel} cannot take payment. Ask a manager.
            </p>
            <Button variant="primary" icon="arrow_back" onClick={() => router.push('/serve')}>
              Back to tables
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-4 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/serve')}
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
              aria-label="Back to tables"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div className="flex flex-col">
              <h1 className="font-headline-lg text-headline-lg font-bold text-text-primary">
                Payment
              </h1>
              <span className="font-body-sm text-body-sm text-text-secondary">
                {order
                  ? `${order.tableNumber ?? 'Takeout'} · Check #${order.orderNumber} · ${
                      order.serverName ?? 'Unassigned'
                    }`
                  : 'Loading check…'}
              </span>
            </div>
          </div>
          {order && (
            <Badge tone={isPaid ? 'ready' : 'caution'}>
              {isPaid ? 'PAID' : `BALANCE ${money(balance)}`}
            </Badge>
          )}
        </header>

        {loading && !order ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-headline-xl text-secondary">
              progress_activity
            </span>
          </div>
        ) : !order ? (
          <EmptyState
            icon="receipt_long"
            title="Check not found"
            description="This check may already be closed or belongs to another server."
            action={
              <Button variant="primary" icon="arrow_back" onClick={() => router.push('/serve')}>
                Back to tables
              </Button>
            }
          />
        ) : isPaid ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Check paid" icon="check_circle" subtitle={`Closed ${order.closedAt ? timeLabel(order.closedAt) : ''}`}>
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-body-base text-body-base text-text-secondary">Total collected</span>
                  <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-status-ready">
                    {money(order.total)}
                  </span>
                </div>
                <div className="flex items-center justify-between font-body-sm text-body-sm text-text-tertiary">
                  <span>
                    Subtotal {money(order.subtotal)} · Tax {money(order.tax)} · Tip {money(order.tip)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
                  {(order.payments ?? []).map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between font-body-sm text-body-sm"
                    >
                      <span className="text-text-secondary">
                        {payment.method === 'card'
                          ? `${BRAND_LABELS[(payment.cardBrand as Brand) ?? 'other'] ?? 'Card'} card`
                          : METHOD_LABELS[payment.method as Method] ?? payment.method}
                        {payment.label ? ` · ${payment.label}` : ''}
                      </span>
                      <span className="font-mono-metric-sm text-mono-metric-sm font-bold text-text-primary">
                        {money(payment.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="primary"
                    icon="table_restaurant"
                    onClick={() => router.push('/serve')}
                    className="flex-1"
                  >
                    Back to tables
                  </Button>
                  <Button
                    variant="secondary"
                    icon="receipt_long"
                    onClick={() => router.push('/pos')}
                    className="flex-1"
                  >
                    Checks &amp; tables
                  </Button>
                </div>
              </div>
            </Card>

            <Card title="Items" icon="list_alt">
              <ul className="flex max-h-[420px] flex-col gap-1 overflow-y-auto">
                {order.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 font-body-sm text-body-sm"
                  >
                    <span className="min-w-0 truncate text-text-secondary">
                      {item.quantity}× {item.name}
                      {item.seat ? <span className="text-text-subtle"> · Guest {item.seat}</span> : null}
                    </span>
                    <span className="shrink-0 font-mono-metric-sm text-mono-metric-sm text-text-primary">
                      {money(item.unitPrice * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="flex flex-col gap-4 lg:col-span-5">
              <Card
                title="Bill"
                icon="receipt_long"
                subtitle={`Opened ${timeLabel(order.createdAt)}`}
                actions={<Badge tone="neutral">{order.items.length} items</Badge>}
              >
                <ul className="flex max-h-[280px] flex-col gap-1 overflow-y-auto">
                  {order.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 font-body-sm text-body-sm"
                    >
                      <span className="min-w-0 truncate text-text-secondary">
                        {item.quantity}× {item.name}
                        {item.seat ? (
                          <span className="text-text-subtle"> · G{item.seat}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-mono-metric-sm text-mono-metric-sm text-text-primary">
                        {money(item.unitPrice * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
                  <div className="flex items-center justify-between font-body-sm text-body-sm text-text-secondary">
                    <span>Subtotal</span>
                    <span>{money(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between font-body-sm text-body-sm text-text-secondary">
                    <span>Tax (8%)</span>
                    <span>{money(tax)}</span>
                  </div>

                  <div className="flex flex-col gap-1 rounded-lg bg-surface-container p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-body-sm text-body-sm font-bold text-text-primary">
                        Gratuity
                      </span>
                      <input
                        inputMode="decimal"
                        value={tipInput}
                        onChange={(event) => setTipInput(event.target.value)}
                        placeholder="0.00"
                        className="h-10 w-28 rounded-lg border border-border-subtle bg-surface-container-lowest px-2 text-right font-mono-metric-md text-mono-metric-md text-text-primary outline-none focus:border-secondary"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {[15, 18, 20].map((percent) => (
                        <button
                          key={percent}
                          type="button"
                          onClick={() => setTipPreset(percent)}
                          className="h-7 rounded-full bg-surface-container-high px-2.5 font-body-sm text-[11px] font-bold text-text-secondary hover:text-text-primary"
                        >
                          {percent}%
                        </button>
                      ))}
                      <span className="ml-auto font-body-sm text-[11px] text-text-subtle">
                        Guest fills in
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border-subtle pt-2">
                    <span className="font-body-base text-body-base font-bold text-text-primary">
                      Total
                    </span>
                    <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-accent-cyan-bright">
                      {money(total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-body-sm text-body-sm text-text-secondary">
                    <span>Paid</span>
                    <span>{money(paid)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                      Balance
                    </span>
                    <span
                      className={`font-mono-metric-md text-mono-metric-md font-bold ${
                        balance > 0.005 ? 'text-status-caution' : 'text-status-ready'
                      }`}
                    >
                      {money(Math.max(0, balance))}
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            <div className="flex flex-col gap-4 lg:col-span-7">
              <Card
                title="Split the bill"
                icon="call_split"
                subtitle="Pay in full, split equally, or pay by guest"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex rounded-full bg-surface-container p-1">
                    {(
                      [
                        ['full', 'Pay in full'],
                        ['equal', 'Split equally'],
                        ['guest', 'Pay by guest'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setSplitMode(value);
                          setSelectedShare(null);
                        }}
                        className={`h-9 flex-1 rounded-full font-body-sm text-body-sm font-bold transition-colors ${
                          splitMode === value
                            ? 'bg-gradient-to-r from-accent-purple-glow to-secondary text-bg-canvas'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {splitMode === 'equal' && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {[2, 3, 4, 5, 6, 8].map((count) => (
                          <button
                            key={count}
                            type="button"
                            onClick={() => {
                              setSplitCount(count);
                              setSelectedShare(null);
                            }}
                            className={`h-8 rounded-full px-3 font-body-sm text-body-sm font-bold transition-colors ${
                              splitCount === count
                                ? 'bg-accent-cyan-bright text-bg-canvas'
                                : 'bg-surface-container text-text-secondary hover:bg-surface-container-high'
                            }`}
                          >
                            {count}
                          </button>
                        ))}
                        <span className="ml-2 font-body-sm text-body-sm text-text-tertiary">
                          {money(total / splitCount)} each
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {allocated.map((share, index) => (
                          <button
                            key={share.label}
                            type="button"
                            onClick={() => setSelectedShare(index)}
                            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                              selectedShare === index
                                ? 'border-secondary bg-secondary/10'
                                : 'border-border-subtle bg-surface-container hover:bg-surface-container-high'
                            }`}
                          >
                            <span className="font-body-sm text-body-sm font-bold text-text-primary">
                              {share.label}
                            </span>
                            <span className="font-mono-metric-sm text-mono-metric-sm text-text-secondary">
                              {share.remaining > 0.005
                                ? money(share.remaining)
                                : 'Paid'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {splitMode === 'guest' && (
                    <div className="flex flex-col gap-1">
                      {allocated.length === 0 ? (
                        <p className="font-body-sm text-body-sm text-text-tertiary">
                          This check has no items to split.
                        </p>
                      ) : (
                        allocated.map((share, index) => (
                          <button
                            key={share.label}
                            type="button"
                            onClick={() => setSelectedShare(index)}
                            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                              selectedShare === index
                                ? 'border-secondary bg-secondary/10'
                                : 'border-border-subtle bg-surface-container hover:bg-surface-container-high'
                            }`}
                          >
                            <span className="font-body-sm text-body-sm font-bold text-text-primary">
                              {share.label}
                            </span>
                            <span className="font-mono-metric-sm text-mono-metric-sm text-text-secondary">
                              {share.remaining > 0.005
                                ? money(share.remaining)
                                : 'Paid'}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {splitMode === 'full' && (
                    <p className="font-body-sm text-body-sm text-text-tertiary">
                      One payment for the whole balance. For part card, part cash, just add a
                      payment for the card amount — the rest stays on the balance.
                    </p>
                  )}

                  {selectedShare !== null && allocated[selectedShare] && (
                    <div className="flex items-center justify-between rounded-lg border border-secondary/40 bg-secondary/10 px-3 py-2">
                      <span className="font-body-sm text-body-sm text-text-secondary">
                        Paying {allocated[selectedShare].label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedShare(null)}
                        className="font-body-sm text-body-sm font-bold text-text-tertiary hover:text-text-primary"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              </Card>

              <Card title="Take payment" icon="payments" subtitle="Part card, part cash, part gift card">
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        ['card', 'Card'],
                        ['cash', 'Cash'],
                        ['gift_card', 'Gift'],
                        ['house', 'House'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMethod(value)}
                        className={`h-10 rounded-lg font-body-sm text-body-sm font-bold transition-colors ${
                          method === value
                            ? 'bg-accent-cyan-bright text-bg-canvas'
                            : 'bg-surface-container text-text-secondary hover:bg-surface-container-high'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {method === 'card' && (
                    <div className="flex flex-wrap gap-1">
                      {(Object.keys(BRAND_LABELS) as Brand[]).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setBrand(value)}
                          className={`h-8 rounded-full px-3 font-body-sm text-[12px] font-bold transition-colors ${
                            brand === value
                              ? 'bg-secondary text-bg-canvas'
                              : 'bg-surface-container text-text-secondary hover:bg-surface-container-high'
                          }`}
                        >
                          {BRAND_LABELS[value]}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                        Amount
                      </span>
                      <input
                        inputMode="decimal"
                        value={amountInput}
                        onChange={(event) => setAmountInput(event.target.value)}
                        placeholder="0.00"
                        className={INPUT}
                      />
                    </label>
                    <Button
                      variant="primary"
                      size="lg"
                      icon="add_card"
                      loading={busy}
                      disabled={balance <= 0.005}
                      onClick={() => void addPayment()}
                      className="sm:min-w-[190px]"
                    >
                      Add payment
                    </Button>
                  </div>

                  {(order.payments ?? []).length > 0 && (
                    <div className="flex flex-col gap-1 border-t border-border-subtle pt-2">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                        Payments taken
                      </span>
                      {(order.payments ?? []).map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between font-body-sm text-body-sm"
                        >
                          <span className="text-text-secondary">
                            {payment.method === 'card'
                              ? `${BRAND_LABELS[(payment.cardBrand as Brand) ?? 'other'] ?? 'Card'} card`
                              : METHOD_LABELS[payment.method as Method] ?? payment.method}
                            {payment.label ? ` · ${payment.label}` : ''}
                          </span>
                          <span className="font-mono-metric-sm text-mono-metric-sm font-bold text-text-primary">
                            {money(payment.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
