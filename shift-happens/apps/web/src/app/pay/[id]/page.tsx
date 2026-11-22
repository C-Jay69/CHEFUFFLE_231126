'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { escapeHtml, money, timeLabel } from '@/lib/format';
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

/** Money helpers: all arithmetic happens on integer cents. */
const toCents = (value: number | string | null | undefined) =>
  Math.round(Number(value ?? 0) * 100);
const fromCents = (cents: number) => cents / 100;
const percentOfCents = (cents: number, percent: number) =>
  Math.round((cents * percent) / 100);
const taxFromGrossCents = (
  cents: number,
  percent: number,
  inclusive: boolean,
) =>
  inclusive
    ? Math.round((cents * percent) / (100 + percent))
    : percentOfCents(cents, percent);
const centsToInput = (cents: number) => {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
};

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

const RECEIPT_CSS = `
  @page { margin: 4mm; }
  * { box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; font-family: "Courier New", Courier, monospace; font-size: 11px; color: #000; }
  h1 { font-size: 16px; text-align: center; margin: 0; letter-spacing: 2px; }
  .meta { font-size: 10px; text-align: center; margin: 2px 0 6px; }
  .section { font-size: 10px; text-align: center; margin: 2px 0; text-transform: uppercase; }
  hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  td { padding: 1px 0; vertical-align: top; }
  .right { text-align: right; white-space: nowrap; }
  .total { font-weight: bold; font-size: 13px; }
  .muted { font-size: 9px; color: #333; }
  .seat { font-weight: bold; margin-top: 6px; }
  .blank { letter-spacing: 1px; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
`;

function printReceipt(html: string) {
  if (typeof window === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    win.focus();
    win.print();
    window.setTimeout(() => frame.remove(), 1500);
  }, 300);
}

function equalShares(total: number, count: number): Share[] {
  const cents = Math.max(0, Math.round(total * 100));
  const base = Math.floor(cents / count);
  const extra = cents - base * count;
  return Array.from({ length: count }, (_, index) => ({
    label: `Person ${index + 1} of ${count}`,
    amount: (base + (index < extra ? 1 : 0)) / 100,
  }));
}

function guestShares(
  order: Order,
  tip: number,
  taxRatePercent: number,
  taxInclusive: boolean,
): Share[] {
  const subtotalCents = order.items.reduce(
    (sum, item) => sum + toCents(item.unitPrice * item.quantity),
    0,
  );
  const tipCents = toCents(tip);
  const bySeat = new Map<string, number>();
  for (const item of order.items) {
    const key = item.seat?.trim() || 'Shared';
    bySeat.set(
      key,
      (bySeat.get(key) ?? 0) + toCents(item.unitPrice * item.quantity),
    );
  }
  return [...bySeat.entries()]
    .sort(([a], [b]) => {
      if (a === 'Shared') return 1;
      if (b === 'Shared') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    })
    .map(([seat, amountCents]) => {
      const tipShareCents =
        subtotalCents > 0
          ? Math.round((tipCents * amountCents) / subtotalCents)
          : 0;
      return {
        label: seat === 'Shared' ? 'Shared items' : `Guest ${seat}`,
        amount: fromCents(
          amountCents +
            taxFromGrossCents(amountCents, taxRatePercent, taxInclusive) +
            tipShareCents,
        ),
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
  const [printOpen, setPrintOpen] = useState(false);
  const [taxRatePercent, setTaxRatePercent] = useState(8);
  const [taxInclusive, setTaxInclusive] = useState(false);

  useEffect(() => {
    void api
      .get<{ taxRate: number; taxInclusive: boolean }>('/pos/config')
      .then((config) => {
        setTaxRatePercent(Number(config.taxRate) || 8);
        setTaxInclusive(Boolean(config.taxInclusive));
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<Order>(`/orders/${params.id}`);
      setOrder(response);
      setTipInput(response.tip > 0 ? centsToInput(toCents(response.tip)) : '');
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
  const total = fromCents(toCents(subtotal) + toCents(tax) + toCents(tip));
  const paid = order?.paidAmount ?? 0;
  const balance = order ? fromCents(toCents(total) - toCents(paid)) : 0;
  const isPaid = order?.status === 'paid';

  const shares = useMemo<Share[]>(() => {
    if (!order) return [];
    if (splitMode === 'equal') return equalShares(total, splitCount);
    if (splitMode === 'guest') return guestShares(order, tip, taxRatePercent, taxInclusive);
    return [];
  }, [order, splitMode, splitCount, total, tip, taxRatePercent, taxInclusive]);

  const allocated = useMemo(() => {
    let left = toCents(paid);
    return shares.map((share) => {
      const shareCents = toCents(share.amount);
      const applied = Math.max(0, Math.min(shareCents, left));
      left -= applied;
      return {
        ...share,
        paid: fromCents(applied),
        remaining: fromCents(shareCents - applied),
      };
    });
  }, [shares, paid]);

  useEffect(() => {
    const selected = selectedShare !== null ? allocated[selectedShare] : null;
    const targetCents = selected ? toCents(selected.remaining) : Math.max(0, toCents(balance));
    setAmountInput(targetCents > 0 ? centsToInput(targetCents) : '');
  }, [allocated, selectedShare, balance]);

  const taxLabel = `Tax (${taxRatePercent}%)`;

  const seatGroups = useMemo(() => {
    if (!order) return [] as Array<{ key: string; items: Order['items']; subtotal: number }>;
    const map = new Map<string, Order['items']>();
    for (const item of order.items) {
      const key = item.seat?.trim() || 'Shared';
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === 'Shared') return 1;
        if (b === 'Shared') return -1;
        return a.localeCompare(b, undefined, { numeric: true });
      })
      .map(([key, items]) => ({
        key,
        items,
        subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      }));
  }, [order]);

  const receiptShell = (body: string) =>
    `<!doctype html><html><head><meta charset="utf-8"><title>Check #${
      order?.orderNumber ?? ''
    }</title><style>${RECEIPT_CSS}</style></head><body>${body}</body></html>`;

  const receiptHeader = () =>
    `<h1>CHEFUFFLE</h1>
     <div class="meta">Downtown Flagship</div>
     <div class="section">${escapeHtml(order?.tableNumber ?? 'Takeout')} · Check #${
       order?.orderNumber ?? ''
     }</div>
     <div class="meta">${escapeHtml(order?.serverName ?? '')} · ${timeLabel(
       order?.createdAt,
     )}</div>
     <hr/>`;

  const itemRows = (items: Order['items']) =>
    items
      .map(
        (item) =>
          `<tr><td>${item.quantity}× ${escapeHtml(item.name)}${
            item.seat ? ` <span class="muted">G${escapeHtml(item.seat)}</span>` : ''
          }</td><td class="right">${money(item.unitPrice * item.quantity)}</td></tr>`,
      )
      .join('');

  const tipRow = (amount: number) =>
    amount > 0
      ? `<tr><td>Gratuity</td><td class="right">${money(amount)}</td></tr>`
      : `<tr><td>Gratuity</td><td class="right">__________</td></tr>`;

  const printTotalBill = () => {
    if (!order) return;
    const body = `${receiptHeader()}
      <table>${itemRows(order.items)}</table>
      <hr/>
      <table>
        <tr><td>Subtotal</td><td class="right">${money(subtotal)}</td></tr>
        <tr><td>${taxLabel}</td><td class="right">${money(tax)}</td></tr>
        ${tipRow(tip)}
        <tr class="total"><td>Total</td><td class="right">${money(total)}</td></tr>
        ${
          paid > 0
            ? `<tr><td>Paid</td><td class="right">${money(paid)}</td></tr>
               <tr class="total"><td>Balance</td><td class="right">${money(
                 Math.max(0, balance),
               )}</td></tr>`
            : ''
        }
      </table>
      <hr/>
      <div class="meta">Thank you</div>`;
    printReceipt(receiptShell(body));
    setPrintOpen(false);
  };

  const printBySeat = () => {
    if (!order) return;
    const subtotalCents = toCents(subtotal);
    const tipCents = toCents(tip);
    const sections = seatGroups
      .map((group) => {
        const groupSubtotalCents = toCents(group.subtotal);
        const groupTaxCents = percentOfCents(groupSubtotalCents, taxRatePercent);
        const groupTipCents =
          subtotalCents > 0
            ? Math.round((tipCents * groupSubtotalCents) / subtotalCents)
            : 0;
        return `<div class="seat">${
          group.key === 'Shared' ? 'Shared items' : `Guest ${escapeHtml(group.key)}`
        }</div>
          <table>${itemRows(group.items)}</table>
          <table>
            <tr><td>Guest subtotal</td><td class="right">${money(group.subtotal)}</td></tr>
            <tr><td>Tax share</td><td class="right">${money(fromCents(groupTaxCents))}</td></tr>
            ${
              groupTipCents > 0
                ? `<tr><td>Tip share</td><td class="right">${money(fromCents(groupTipCents))}</td></tr>`
                : ''
            }
            <tr class="total"><td>Due</td><td class="right">${money(
              fromCents(groupSubtotalCents + groupTaxCents + groupTipCents),
            )}</td></tr>
          </table>`;
      })
      .join('<hr/>');

    const body = `${receiptHeader()}
      ${sections}
      <hr/>
      <table>
        <tr><td>Subtotal</td><td class="right">${money(subtotal)}</td></tr>
        <tr><td>${taxLabel}</td><td class="right">${money(tax)}</td></tr>
        ${tipRow(tip)}
        <tr class="total"><td>Total</td><td class="right">${money(total)}</td></tr>
      </table>
      <hr/>
      <div class="meta">Thank you</div>`;
    printReceipt(receiptShell(body));
    setPrintOpen(false);
  };

  const printIndividualBills = () => {
    if (!order) return;
    const subtotalCents = toCents(subtotal);
    const tipCents = toCents(tip);
    const pages = seatGroups
      .map((group, index) => {
        const groupSubtotalCents = toCents(group.subtotal);
        const groupTaxCents = percentOfCents(groupSubtotalCents, taxRatePercent);
        const groupTipCents =
          subtotalCents > 0
            ? Math.round((tipCents * groupSubtotalCents) / subtotalCents)
            : 0;
        return `<div class="page">
          <h1>CHEFUFFLE</h1>
          <div class="meta">Downtown Flagship</div>
          <div class="section">${
            group.key === 'Shared' ? 'Shared items' : `Guest ${escapeHtml(group.key)}`
          } · Check #${order.orderNumber}</div>
          <div class="meta">${escapeHtml(order.tableNumber ?? 'Takeout')} · ${escapeHtml(
            order.serverName ?? '',
          )} · ${timeLabel(order.createdAt)}</div>
          <div class="meta">Bill ${index + 1} of ${seatGroups.length}</div>
          <hr/>
          <table>${itemRows(group.items)}</table>
          <hr/>
          <table>
            <tr><td>Subtotal</td><td class="right">${money(group.subtotal)}</td></tr>
            <tr><td>${taxLabel}</td><td class="right">${money(fromCents(groupTaxCents))}</td></tr>
            ${tipRow(fromCents(groupTipCents))}
            <tr class="total"><td>Total</td><td class="right">${money(
              fromCents(groupSubtotalCents + groupTaxCents + groupTipCents),
            )}</td></tr>
          </table>
          <hr/>
          <div class="meta">Thank you</div>
        </div>`;
      })
      .join('');
    printReceipt(receiptShell(pages));
    setPrintOpen(false);
  };

  const setTipPreset = (percent: number) => {
    setTipInput(centsToInput(percentOfCents(toCents(subtotal), percent)));
  };

  const addPayment = async () => {
    if (!order) return;
    const amountCents = toCents(Number(amountInput));
    if (!(amountCents > 0)) {
      showToast('Enter a payment amount.', 'warn');
      return;
    }
    setBusy(true);
    try {
      const label =
        selectedShare !== null ? allocated[selectedShare]?.label ?? null : null;
      const idempotencyKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const updated = await api.post<Order>(
        `/orders/${order.id}/payments`,
        {
          amount: fromCents(amountCents),
          method,
          ...(method === 'card' ? { cardBrand: brand } : {}),
          tip: fromCents(toCents(tip)),
          label,
        },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
      setOrder(updated);
      setSelectedShare(null);
      showToast(
        updated.status === 'paid'
          ? `Check #${updated.orderNumber} paid — ${money(updated.total)}.`
          : `${money(fromCents(amountCents))} taken — ${money(updated.balance ?? 0)} left.`,
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
            <div className="flex items-center gap-2">
              <Badge tone={isPaid ? 'ready' : 'caution'}>
                {isPaid ? 'PAID' : `BALANCE ${money(balance)}`}
              </Badge>
              <div className="relative">
                <Button
                  variant="secondary"
                  size="md"
                  icon="print"
                  onClick={() => setPrintOpen((open) => !open)}
                >
                  Print
                </Button>
                {printOpen && (
                  <div className="absolute right-0 top-12 z-30 flex w-56 flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-container-high shadow-2xl">
                    <button
                      type="button"
                      onClick={printTotalBill}
                      className="flex items-center gap-2 px-3 py-2.5 text-left font-body-sm text-body-sm font-bold text-text-primary hover:bg-surface-container-highest"
                    >
                      <span className="material-symbols-outlined text-[18px] text-secondary">receipt_long</span>
                      Total bill
                    </button>
                    <button
                      type="button"
                      onClick={printBySeat}
                      className="flex items-center gap-2 px-3 py-2.5 text-left font-body-sm text-body-sm font-bold text-text-primary hover:bg-surface-container-highest"
                    >
                      <span className="material-symbols-outlined text-[18px] text-secondary">table_rows</span>
                      Print by seat
                    </button>
                    <button
                      type="button"
                      onClick={printIndividualBills}
                      className="flex items-center gap-2 px-3 py-2.5 text-left font-body-sm text-body-sm font-bold text-text-primary hover:bg-surface-container-highest"
                    >
                      <span className="material-symbols-outlined text-[18px] text-secondary">content_copy</span>
                      Individual bills
                    </button>
                  </div>
                )}
              </div>
            </div>
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
                    <span>{taxLabel}</span>
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
