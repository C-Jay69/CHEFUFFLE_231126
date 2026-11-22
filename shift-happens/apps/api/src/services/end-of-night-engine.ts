import { prisma } from '@shift-happens/db';
import { env } from '../env.js';
import { minorToNumber, toMinor } from '../lib/money.js';

/** Add money exactly by converting both sides to integer minor units. */
const addMoney = (current: number, amount: unknown) =>
  minorToNumber(toMinor(current) + toMinor(amount));
/** Add an already-computed minor-unit delta to a major-unit running total. */
const addMinorAmount = (current: number, deltaMinor: number) =>
  minorToNumber(toMinor(current) + deltaMinor);

export const TENDER_KEYS = [
  'visa',
  'mastercard',
  'amex',
  'debit',
  'otherCard',
  'cash',
  'giftCard',
  'house',
  'unallocated',
] as const;

export type TenderKey = (typeof TENDER_KEYS)[number];
type Tender = { count: number; amount: number };
type Tenders = Record<TenderKey, Tender>;

const emptyTenders = (): Tenders =>
  Object.fromEntries(TENDER_KEYS.map((key) => [key, { count: 0, amount: 0 }])) as Tenders;

function tenderKey(order: {
  paymentMethod: string | null;
  cardBrand: string | null;
}): TenderKey {
  if (order.paymentMethod === 'cash') return 'cash';
  if (order.paymentMethod === 'gift_card') return 'giftCard';
  if (order.paymentMethod === 'house') return 'house';
  if (order.paymentMethod === 'card') {
    if (order.cardBrand === 'visa') return 'visa';
    if (order.cardBrand === 'mastercard') return 'mastercard';
    if (order.cardBrand === 'amex') return 'amex';
    if (order.cardBrand === 'debit') return 'debit';
    return 'otherCard';
  }
  return 'unallocated';
}

const CARD_KEYS: TenderKey[] = ['visa', 'mastercard', 'amex', 'debit', 'otherCard'];

function coversFor(order: { items?: Array<{ seat: string | null }> }) {
  const seats = new Set(
    (order.items ?? []).map((item) => item.seat).filter((seat): seat is string => Boolean(seat)),
  );
  return seats.size || 1;
}

function isBarOrder(order: {
  table?: { zone: string; tableNumber: string } | null;
}) {
  const zone = (order.table?.zone ?? '').toLowerCase();
  const number = (order.table?.tableNumber ?? '').toLowerCase();
  return zone.includes('bar') || number.startsWith('bar');
}

interface CheckSummary {
  id: string;
  orderNumber: number;
  total: number;
  tip: number;
  closedAt: string | null;
  status: string;
}

interface Tally {
  sales: number;
  tax: number;
  tips: number;
  /** Refunds issued against the day's captured charges (positive amount). */
  refunds: number;
  gross: number;
  checks: number;
  covers: number;
  checkList: CheckSummary[];
  tenders: Tenders;
}

function emptyTally(): Tally {
  return {
    sales: 0,
    tax: 0,
    tips: 0,
    refunds: 0,
    gross: 0,
    checks: 0,
    covers: 0,
    checkList: [],
    tenders: emptyTenders(),
  };
}

function addToTally(
  tally: Tally,
  order: {
    id: string;
    orderNumber: number;
    status: string;
    closedAt: Date | null;
    subtotal: unknown;
    tax: unknown;
    tip: unknown;
    total: unknown;
    paymentMethod: string | null;
    cardBrand: string | null;
    items?: Array<{ seat: string | null }>;
    payments?: Array<{
      amount: unknown;
      method: string;
      cardBrand: string | null;
      kind?: string | null;
      status?: string | null;
    }>;
  },
) {
  tally.sales = addMoney(tally.sales, order.subtotal);
  tally.tax = addMoney(tally.tax, order.tax);
  tally.tips = addMoney(tally.tips, order.tip);
  tally.checks += 1;
  tally.covers += coversFor(order);
  tally.checkList.push({
    id: order.id,
    orderNumber: order.orderNumber,
    total: minorToNumber(toMinor(order.total)),
    tip: minorToNumber(toMinor(order.tip)),
    closedAt: order.closedAt ? order.closedAt.toISOString() : null,
    status: order.status,
  });

  // Split/partial payments: each payment row is one tender (one card slip).
  // Refund rows are negative and reduce both the tender mix and the collected
  // gross. Legacy paid orders without payment rows fall back to order fields.
  const payments: Array<{
    amount: unknown;
    method: string;
    cardBrand: string | null;
    kind: string;
    status: string;
  }> =
    order.payments && order.payments.length > 0
      ? order.payments.map((payment) => ({
          amount: payment.amount,
          method: payment.method,
          cardBrand: payment.cardBrand,
          kind: payment.kind ?? 'payment',
          status: payment.status ?? 'captured',
        }))
      : [
          {
            amount: order.total,
            method: order.paymentMethod ?? '',
            cardBrand: order.cardBrand,
            kind: 'payment',
            status: 'captured',
          },
        ];

  let netMinor = 0;
  let refundMinor = 0;
  for (const payment of payments) {
    if (payment.status !== 'captured') continue;
    const key = tenderKey({
      paymentMethod: payment.method || null,
      cardBrand: payment.cardBrand,
    });
    const amountMinor = toMinor(payment.amount);
    const signedMinor =
      payment.kind === 'refund' ? -Math.abs(amountMinor) : amountMinor;

    // A refund is not a new slip, but it does reduce the tender.
    if (payment.kind !== 'refund') {
      tally.tenders[key].count += 1;
    } else {
      refundMinor += Math.abs(amountMinor);
    }
    tally.tenders[key].amount = addMinorAmount(
      tally.tenders[key].amount,
      signedMinor,
    );
    netMinor += signedMinor;
  }

  // Refunds reduce the sales/tax/tips lines proportionally, so
  // sales + tax + tips continues to equal the ledger gross.
  if (refundMinor > 0) {
    const subtotalMinor = toMinor(order.subtotal);
    const taxMinor = toMinor(order.tax);
    const tipMinor = toMinor(order.tip);
    const chargeMinor = subtotalMinor + taxMinor + tipMinor;
    tally.refunds = addMinorAmount(tally.refunds, refundMinor);
    if (chargeMinor > 0) {
      const refundSales = Math.round(
        (refundMinor * subtotalMinor) / chargeMinor,
      );
      const refundTax = Math.round((refundMinor * taxMinor) / chargeMinor);
      const refundTips = refundMinor - refundSales - refundTax;
      tally.sales = addMinorAmount(tally.sales, -refundSales);
      tally.tax = addMinorAmount(tally.tax, -refundTax);
      tally.tips = addMinorAmount(tally.tips, -refundTips);
    } else {
      tally.sales = addMinorAmount(tally.sales, -refundMinor);
    }
  }

  // Collected gross follows the ledger (payments minus refunds). For the
  // legacy fallback above it is simply the stored order total.
  tally.gross = addMinorAmount(tally.gross, netMinor);
}

function finishTally<T extends Tally>(tally: T) {
  const cardMinor = CARD_KEYS.reduce(
    (sum, key) => sum + toMinor(tally.tenders[key].amount),
    0,
  );
  const giftMinor = toMinor(tally.tenders.giftCard.amount);
  const houseMinor = toMinor(tally.tenders.house.amount);
  const cashMinor = toMinor(tally.tenders.cash.amount);
  const unallocatedMinor = toMinor(tally.tenders.unallocated.amount);
  // Expected cash is the collected gross that was not settled on a card, gift
  // card or house account — and an unallocated legacy tender is *not* assumed
  // to be cash, otherwise it would inflate the drawer expectation.
  const cashDueMinor =
    toMinor(tally.gross) - cardMinor - giftMinor - houseMinor - unallocatedMinor;
  const slipCount = CARD_KEYS.reduce(
    (sum, key) => sum + tally.tenders[key].count,
    0,
  );
  return {
    ...tally,
    cardTotal: minorToNumber(cardMinor),
    cashRecorded: minorToNumber(cashMinor),
    cashDue: minorToNumber(cashDueMinor),
    slipCount,
  };
}

function dayBounds(date?: string) {
  const base = date ? new Date(date) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * End-of-night report for one business day: day totals, tender mix, per-server
 * tallies (sales, slip counts, expected cash) and the bar till as its own
 * drawer. Bar-zone orders are attributed to the till rather than to a server,
 * so server tallies + bar till reconcile to the computer total.
 */
export async function getEndOfNight(
  restaurantId = env.RESTAURANT_ID,
  date?: string,
) {
  const { start, end } = dayBounds(date);

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: 'paid',
      closedAt: { gte: start, lt: end },
    },
    include: {
      server: true,
      table: true,
      items: { select: { seat: true } },
      payments: true,
    },
    orderBy: { closedAt: 'asc' },
  });

  const totals = emptyTally();
  const barTally = emptyTally();
  const serverMap = new Map<
    string,
    { serverId: string; name: string; role: string; tally: Tally }
  >();

  for (const order of orders) {
    addToTally(totals, order);

    if (isBarOrder(order)) {
      addToTally(barTally, order);
      continue;
    }

    const key = order.serverId;
    const existing = serverMap.get(key);
    if (existing) {
      addToTally(existing.tally, order);
    } else {
      const tally = emptyTally();
      addToTally(tally, order);
      serverMap.set(key, {
        serverId: key,
        name: order.server?.name ?? 'Unassigned',
        role: order.server?.role ?? 'server',
        tally,
      });
    }
  }

  const servers = [...serverMap.values()]
    .map((entry) => ({
      serverId: entry.serverId,
      serverName: entry.name,
      role: entry.role,
      ...finishTally(entry.tally),
    }))
    .sort((a, b) => b.gross - a.gross);

  return {
    date: start.toISOString(),
    range: { from: start.toISOString(), to: end.toISOString() },
    totals: finishTally(totals),
    tenders: totals.tenders,
    servers,
    bar: {
      name: 'Bar till',
      ...finishTally(barTally),
    },
    unallocatedChecks: totals.tenders.unallocated.count,
  };
}
