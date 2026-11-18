import { prisma } from '@shift-happens/db';
import type { KdsStation } from '@shift-happens/shared';
import { env } from '../env.js';
import { badRequest, notFound } from '../errors.js';
import { emitRestaurant, emitStation } from '../realtime.js';
import { setTableStage } from './stage-engine.js';

const money = (v: unknown) => Number(v ?? 0);
const MAIN_CATEGORIES = new Set(['Burgers & Mains', 'Woodfired Pizza', 'Chef Favorites']);
const OVERDUE_SECONDS = 15 * 60;

export interface KdsTicketItemDto {
  id: string;
  menuItemId: string;
  name: string;
  category: string | null;
  quantity: number;
  unitPrice: number;
  modifiers: Array<{ name: string; priceDelta: number }>;
  prepStatus: string;
  station: string;
  seat: string | null;
  notes: string | null;
  isAllergen: boolean;
  targetPrepSeconds: number;
  prepSeconds: number;
  bumpedAt: string | null;
}

export interface KdsTicketDto {
  id: string;
  orderNumber: number;
  tableId: string | null;
  tableNumber: string;
  zone: string;
  partyName: string | null;
  partySize: number | null;
  serverName: string;
  status: string;
  allergyNotes: string | null;
  hasAllergy: boolean;
  createdAt: string;
  elapsedSeconds: number;
  elapsedLabel: string;
  isOverdue: boolean;
  overdueBySeconds: number;
  maxPrepSeconds: number;
  itemCount: number;
  bumpedCount: number;
  items: KdsTicketItemDto[];
  stations: string[];
  priority: 'hero' | 'urgent' | 'regular' | 'new';
}

const orderInclude = {
  items: {
    include: {
      menuItem: { include: { category: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  table: true,
  server: true,
};

export const elapsedLabel = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

export function toTicket(order: any, station?: KdsStation): KdsTicketDto | null {
  const allItems = order.items as any[];
  const items = station && station !== 'expo'
    ? allItems.filter((item) => item.station === station)
    : allItems;
  if (items.length === 0) return null;

  const now = Date.now();
  const earliest = items.reduce(
    (min, item) => Math.min(min, new Date(item.createdAt).getTime()),
    now,
  );
  const elapsedSeconds = Math.max(0, Math.round((now - earliest) / 1000));
  const maxPrepSeconds = Math.max(...items.map((i) => i.menuItem.targetPrepTimeSeconds));
  const bumpedCount = items.filter((i) => i.prepStatus === 'bumped').length;
  const isOverdue = elapsedSeconds > OVERDUE_SECONDS && bumpedCount < items.length;
  const hasAllergy =
    Boolean(order.allergyNotes) ||
    items.some((i) => /allerg/i.test(i.notes ?? '')) ||
    items.some((i) => /allerg/i.test(i.menuItem.description ?? '') && /shell|nut|gluten/i.test(i.menuItem.description ?? ''));

  const priority: KdsTicketDto['priority'] =
    isOverdue && elapsedSeconds > 20 * 60
      ? 'urgent'
      : elapsedSeconds > 10 * 60
        ? 'hero'
        : elapsedSeconds < 5 * 60
          ? 'new'
          : 'regular';

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    tableId: order.tableId,
    tableNumber: order.table?.tableNumber ?? 'BAR',
    zone: order.table?.zone ?? 'Bar & Lounge',
    partyName: order.table?.currentPartyName ?? null,
    partySize: order.table?.currentPartySize ?? null,
    serverName: order.server?.name ?? 'Unassigned',
    status: order.status,
    allergyNotes: order.allergyNotes,
    hasAllergy,
    createdAt: order.createdAt.toISOString(),
    elapsedSeconds,
    elapsedLabel: elapsedLabel(elapsedSeconds),
    isOverdue,
    overdueBySeconds: Math.max(0, elapsedSeconds - OVERDUE_SECONDS),
    maxPrepSeconds,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    bumpedCount,
    stations: [...new Set(items.map((i) => i.station))],
    items: items.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      name: item.menuItem.name,
      category: item.menuItem.category?.name ?? null,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
      prepStatus: item.prepStatus,
      station: item.station,
      seat: item.seat,
      notes: item.notes,
      isAllergen:
        Boolean(order.allergyNotes) ||
        /allerg/i.test(item.notes ?? ''),
      targetPrepSeconds: item.menuItem.targetPrepTimeSeconds,
      prepSeconds: Math.max(
        0,
        Math.round((now - new Date(item.createdAt).getTime()) / 1000),
      ),
      bumpedAt: item.bumpedAt?.toISOString() ?? null,
    })),
    priority,
  };
}

export async function getTickets(
  station?: KdsStation,
  restaurantId = env.RESTAURANT_ID,
): Promise<KdsTicketDto[]> {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: { in: ['sent_to_kitchen', 'preparing', 'ready_at_pass'] },
      ...(station && station !== 'expo'
        ? { items: { some: { station, prepStatus: { not: 'bumped' } } } }
        : {}),
    },
    include: orderInclude,
    orderBy: { createdAt: 'asc' },
  });
  return orders
    .map((order) => toTicket(order, station))
    .filter((ticket): ticket is KdsTicketDto => Boolean(ticket));
}

export async function getTicket(orderId: string): Promise<KdsTicketDto> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  if (!order) throw notFound('Ticket not found');
  const ticket = toTicket(order);
  if (!ticket) throw notFound('Ticket has no items');
  return ticket;
}

export async function getStationCounts(restaurantId = env.RESTAURANT_ID) {
  const tickets = await getTickets('expo' as KdsStation, restaurantId);
  const counts: Record<string, number> = {
    all: tickets.length,
    expo: tickets.length,
    grill: 0,
    saute_fryer: 0,
    cold_larder: 0,
    pastry_dessert: 0,
    bar: 0,
  };
  for (const ticket of tickets) {
    for (const station of ticket.stations) counts[station] = (counts[station] ?? 0) + 1;
  }
  return counts;
}

export async function bumpTicket(
  input: {
    orderId: string;
    station?: KdsStation;
    itemIds?: string[];
    action: 'bump' | 'recall' | 'hold' | 'fire';
    bumpMinutes?: number;
  },
  restaurantId = env.RESTAURANT_ID,
) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: orderInclude,
  });
  if (!order) throw notFound('Ticket not found');
  if (order.restaurantId !== restaurantId) throw notFound('Ticket not found');

  let targetItems = order.items.filter((item) => item.prepStatus !== 'bumped');
  if (input.itemIds?.length) {
    targetItems = targetItems.filter((item) => input.itemIds!.includes(item.id));
  } else if (input.station && input.station !== 'expo') {
    targetItems = targetItems.filter((item) => item.station === input.station);
  }

  if (input.action === 'bump' && targetItems.length === 0) {
    throw badRequest('No un-bumped items match this action');
  }

  const now = new Date();
  let updatedCount = 0;
  if (targetItems.length > 0) {
    if (input.action === 'bump') {
      const result = await prisma.orderItem.updateMany({
        where: { id: { in: targetItems.map((i) => i.id) }, orderId: order.id },
        data: { prepStatus: 'bumped', bumpedAt: now },
      });
      updatedCount = result.count;
    } else if (input.action === 'recall') {
      const result = await prisma.orderItem.updateMany({
        where: { id: { in: targetItems.map((i) => i.id) }, orderId: order.id },
        data: { prepStatus: 'recalled', bumpedAt: null },
      });
      updatedCount = result.count;
    } else {
      const result = await prisma.orderItem.updateMany({
        where: { id: { in: targetItems.map((i) => i.id) }, orderId: order.id },
        data: { prepStatus: input.action === 'fire' ? 'firing' : 'firing' },
      });
      updatedCount = result.count;
    }
  }

  const afterBump = await prisma.order.findUnique({
    where: { id: order.id },
    include: orderInclude,
  });
  if (!afterBump) throw notFound('Ticket not found');

  const allItems = afterBump.items;
  const allBumped = allItems.every((i) => i.prepStatus === 'bumped');
  const anyStarted = allItems.some((i) => i.prepStatus !== 'firing');
  const nextStatus = allBumped
    ? 'ready_at_pass'
    : anyStarted || input.action === 'bump'
      ? 'preparing'
      : afterBump.status;
  if (nextStatus !== afterBump.status) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: nextStatus },
    });
  }

  // A complete mains bump advances the dining table to Stage 2: Entrée.
  const mains = allItems.filter((item) => {
    const category = item.menuItem.category?.name ?? '';
    const tags = item.menuItem.tags ?? [];
    return MAIN_CATEGORIES.has(category) || tags.includes('Signature');
  });
  const mainsBumped =
    mains.length > 0 && mains.every((item) => item.prepStatus === 'bumped');

  let tableAdvanced = false;
  let previousStage: string | null = null;
  let newStage: string | null = null;
  if (
    input.action === 'bump' &&
    mainsBumped &&
    afterBump.tableId &&
    afterBump.table &&
    ['seated', 'starters', 'mains_firing'].includes(afterBump.table.currentStage)
  ) {
    previousStage = afterBump.table.currentStage;
    const result = await setTableStage(afterBump.tableId, 'entree', {
      triggeredBy: input.station === 'grill' ? 'KDS_BUMP_MAINS' : 'KDS_BUMP_MAINS',
      ticketId: `#${afterBump.orderNumber}`,
    });
    newStage = result.stage;
    tableAdvanced = true;
  }

  const ticket = toTicket(
    await prisma.order.findUnique({ where: { id: order.id }, include: orderInclude }),
    input.station,
  );

  emitRestaurant('KDS_TICKET_BUMPED', {
    event: 'KDS_TICKET_BUMPED',
    ticketId: order.id,
    orderNumber: order.orderNumber,
    action: input.action,
    station: input.station,
    updatedCount,
    allBumped,
    tableAdvanced,
    previousStage,
    newStage,
    ticket,
    timestamp: now.toISOString(),
  });
  if (input.station) {
    emitStation(input.station, 'KDS_TICKET_UPDATED', {
      event: 'KDS_TICKET_UPDATED',
      ticket,
      timestamp: now.toISOString(),
    });
  }
  emitRestaurant('KDS_TICKET_UPDATED', {
    event: 'KDS_TICKET_UPDATED',
    ticket,
    timestamp: now.toISOString(),
  });

  return {
    ticket,
    updatedCount,
    allBumped,
    tableAdvanced,
    previousStage,
    newStage,
    orderStatus: nextStatus,
  };
}

export async function getRecentBumps(restaurantId = env.RESTAURANT_ID, limit = 10) {
  const items = await prisma.orderItem.findMany({
    where: {
      bumpedAt: { not: null },
      order: { restaurantId },
    },
    include: {
      menuItem: true,
      order: { include: { table: true } },
    },
    orderBy: { bumpedAt: 'desc' },
    take: limit,
  });
  return items.map((item) => ({
    id: item.id,
    name: item.menuItem.name,
    station: item.station,
    orderNumber: item.order.orderNumber,
    tableNumber: item.order.table?.tableNumber ?? 'BAR',
    bumpedAt: item.bumpedAt?.toISOString(),
    bumpedSecondsAgo: item.bumpedAt
      ? Math.round((Date.now() - item.bumpedAt.getTime()) / 1000)
      : null,
  }));
}

/** Used by the Floor Plan "Simulate KDS Mains Bump" control. */
export async function simulateMainsBumpForTable(
  tableId: string,
  restaurantId = env.RESTAURANT_ID,
) {
  const order = await prisma.order.findFirst({
    where: {
      restaurantId,
      tableId,
      status: { in: ['open', 'sent_to_kitchen', 'preparing', 'ready_at_pass'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!order) throw badRequest('No active ticket for this table');
  return bumpTicket(
    { orderId: order.id, station: 'grill', action: 'bump' },
    restaurantId,
  );
}
