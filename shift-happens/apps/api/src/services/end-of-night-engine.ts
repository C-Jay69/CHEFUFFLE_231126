import { prisma } from '@shift-happens/db';
import { env } from '../env.js';

const num = (v: unknown) => Number(v ?? 0);
const round = (v: number) => Number(v.toFixed(2));

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
    }>;
  },
) {
  tally.sales = round(tally.sales + num(order.subtotal));
  tally.tax = round(tally.tax + num(order.tax));
  tally.tips = round(tally.tips + num(order.tip));
  tally.gross = round(tally.gross + num(order.total));
  tally.checks += 1;
  tally.covers += coversFor(order);
  tally.checkList.push({
    id: order.id,
    orderNumber: order.orderNumber,
    total: num(order.total),
    tip: num(order.tip),
    closedAt: order.closedAt ? order.closedAt.toISOString() : null,
    status: order.status,
  });

  // Split/partial payments: each payment row is one tender (one card slip).
  // Legacy paid orders without payment rows fall back to the order fields.
  const payments =
    order.payments && order.payments.length > 0
      ? order.payments.map((payment) => ({
          key: tenderKey({
            paymentMethod: payment.method,
            cardBrand: payment.cardBrand,
          }),
          amount: num(payment.amount),
        }))
      : [
          {
            key: tenderKey(order),
            amount: num(order.total),
          },
        ];

  for (const payment of payments) {
    tally.tenders[payment.key].count += 1;
    tally.tenders[payment.key].amount = round(
      tally.tenders[payment.key].amount + payment.amount,
    );
  }
}

function finishTally<T extends Tally>(tally: T) {
  const cardTotal = round(
    CARD_KEYS.reduce((sum, key) => sum + tally.tenders[key].amount, 0),
  );
  const giftTotal = tally.tenders.giftCard.amount;
  const houseTotal = tally.tenders.house.amount;
  const cashDue = round(tally.gross - cardTotal - giftTotal - houseTotal);
  const slipCount = CARD_KEYS.reduce((sum, key) => sum + tally.tenders[key].count, 0);
  return {
    ...tally,
    cardTotal,
    cashRecorded: tally.tenders.cash.amount,
    cashDue,
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
