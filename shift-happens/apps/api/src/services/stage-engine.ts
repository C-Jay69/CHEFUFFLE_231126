import { prisma } from '@shift-happens/db';
import {
  STAGE_LABELS,
  STAGE_SEQUENCE,
  type CourseStage,
} from '@shift-happens/shared';
import { env } from '../env.js';
import { notFound } from '../errors.js';
import { emitRestaurant } from '../realtime.js';

const money = (v: unknown) => Number(v ?? 0);

export interface TableDto {
  id: string;
  tableNumber: string;
  zone: string;
  capacity: number;
  posX: number;
  posY: number;
  rotation: number;
  shape: string;
  currentStage: CourseStage;
  stageLabel: string;
  stageNumber: number;
  stageShort: string;
  currentPartyName: string | null;
  currentPartySize: number | null;
  seatedAt: string | null;
  seatedMinutes: number | null;
  stageUpdatedAt: string | null;
  serverId: string | null;
  serverName: string | null;
  isActive: boolean;
  activeOrder: {
    id: string;
    orderNumber: number;
    status: string;
    total: number;
    itemCount: number;
    allergyNotes: string | null;
    serverId: string;
  } | null;
  status: 'available' | 'occupied' | 'reserved' | 'dirty';
}

export function toTableDto(table: any): TableDto {
  const stage = table.currentStage as CourseStage;
  const label = STAGE_LABELS[stage] ?? STAGE_LABELS.ready;
  const seatedMinutes = table.seatedAt
    ? Math.max(0, Math.round((Date.now() - new Date(table.seatedAt).getTime()) / 60_000))
    : null;
  const activeOrder = table.orders?.[0] ?? null;
  const status: TableDto['status'] =
    stage === 'ready' && !table.currentPartyName
      ? 'available'
      : stage === 'dirty_bussing'
        ? 'dirty'
        : stage === 'seated' && !activeOrder
          ? table.currentPartyName
            ? 'occupied'
            : 'reserved'
          : 'occupied';
  return {
    id: table.id,
    tableNumber: table.tableNumber,
    zone: table.zone,
    capacity: table.capacity,
    posX: money(table.posX),
    posY: money(table.posY),
    rotation: table.rotation,
    shape: table.shape,
    currentStage: stage,
    stageLabel: label.label,
    stageNumber: label.number,
    stageShort: label.short,
    currentPartyName: table.currentPartyName,
    currentPartySize: table.currentPartySize,
    seatedAt: table.seatedAt?.toISOString() ?? null,
    seatedMinutes,
    stageUpdatedAt: table.stageUpdatedAt?.toISOString() ?? null,
    serverId: table.serverId,
    serverName: table.server?.name ?? null,
    isActive: table.isActive,
    activeOrder: activeOrder
      ? {
          id: activeOrder.id,
          orderNumber: activeOrder.orderNumber,
          status: activeOrder.status,
          total: money(activeOrder.total),
          itemCount: activeOrder.items?.reduce(
            (sum: number, item: { quantity: number }) => sum + item.quantity,
            0,
          ) ?? 0,
          allergyNotes: activeOrder.allergyNotes,
          serverId: activeOrder.serverId,
        }
      : null,
    status,
  };
}

export async function getTables(
  restaurantId = env.RESTAURANT_ID,
  options: { staffId?: string | null; viewAll?: boolean } = {},
): Promise<TableDto[]> {
  const viewAll = options.viewAll ?? true;
  const tables = await prisma.diningTable.findMany({
    where: {
      restaurantId,
      isActive: true,
      // Servers see the tables they own (or already hold a check on) plus
      // ready tables they can claim. Managers see the whole floor.
      ...(!viewAll && options.staffId
        ? {
            OR: [
              { serverId: options.staffId },
              { currentStage: 'ready' as const },
              {
                orders: {
                  some: {
                    serverId: options.staffId,
                    status: { notIn: ['paid', 'void'] as never[] },
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { tableNumber: 'asc' },
    include: {
      server: true,
      orders: {
        where: { status: { notIn: ['paid', 'void'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { items: { select: { quantity: true } } },
      },
    },
  });
  return tables.map(toTableDto);
}

export async function getTable(id: string): Promise<TableDto> {
  const table = await prisma.diningTable.findUnique({
    where: { id },
    include: {
      server: true,
      orders: {
        where: { status: { notIn: ['paid', 'void'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { items: { select: { quantity: true } } },
      },
    },
  });
  if (!table) throw notFound('Table not found');
  return toTableDto(table);
}

export function emitTableUpdate(table: TableDto) {
  emitRestaurant('TABLE_UPDATED', {
    event: 'TABLE_UPDATED',
    table,
    timestamp: new Date().toISOString(),
  });
}

/** Advances a table to the next stage and broadcasts the transition. */
export async function advanceTableStage(
  tableId: string,
  triggeredBy = 'MANUAL',
  ticketId?: string,
) {
  const table = await prisma.diningTable.findUnique({ where: { id: tableId } });
  if (!table) throw notFound('Table not found');
  const current = table.currentStage as CourseStage;
  const index = STAGE_SEQUENCE.indexOf(current);
  const next = STAGE_SEQUENCE[Math.min(STAGE_SEQUENCE.length - 1, index + 1)] ?? 'ready';
  return setTableStage(tableId, next, { triggeredBy, ticketId });
}

export async function setTableStage(
  tableId: string,
  stage: CourseStage,
  options: { triggeredBy?: string; ticketId?: string; emit?: boolean } = {},
) {
  const table = await prisma.diningTable.findUnique({ where: { id: tableId } });
  if (!table) throw notFound('Table not found');
  const previous = table.currentStage as CourseStage;

  const isClosing = stage === 'ready';
  const updated = await prisma.diningTable.update({
    where: { id: tableId },
    data: {
      currentStage: stage,
      stageUpdatedAt: new Date(),
      ...(stage === 'seated' && !table.seatedAt ? { seatedAt: new Date() } : {}),
      ...(isClosing
        ? {
            currentPartyName: null,
            currentPartySize: null,
            seatedAt: null,
            serverId: null,
          }
        : {}),
    },
    include: { server: true },
  });

  if (options.emit !== false) {
    emitRestaurant('TABLE_STAGE_ADVANCED', {
      event: 'TABLE_STAGE_ADVANCED',
      table_id: updated.id,
      table_number: updated.tableNumber,
      previous_stage: previous,
      new_stage: stage,
      triggered_by: options.triggeredBy ?? 'MANUAL',
      ticket_id: options.ticketId,
      timestamp: new Date().toISOString(),
    });
    emitTableUpdate(toTableDto(updated));
  }
  return { previousStage: previous, table: updated, stage };
}

export async function seatTable(
  tableId: string,
  input: {
    partyName: string;
    partySize: number;
    serverId?: string | null;
    stage?: CourseStage;
    reservationId?: string | null;
  },
) {
  const table = await prisma.diningTable.findUnique({ where: { id: tableId } });
  if (!table) throw notFound('Table not found');

  const updated = await prisma.diningTable.update({
    where: { id: tableId },
    data: {
      currentStage: input.stage ?? 'seated',
      currentPartyName: input.partyName,
      currentPartySize: input.partySize,
      seatedAt: new Date(),
      stageUpdatedAt: new Date(),
      serverId: input.serverId ?? table.serverId,
    },
    include: { server: true },
  });

  if (input.reservationId) {
    await prisma.reservation.update({
      where: { id: input.reservationId },
      data: { status: 'seated', tableId },
    });
  }

  emitRestaurant('TABLE_STAGE_ADVANCED', {
    event: 'TABLE_STAGE_ADVANCED',
    table_id: updated.id,
    table_number: updated.tableNumber,
    previous_stage: table.currentStage,
    new_stage: updated.currentStage,
    triggered_by: 'HOST_SEAT',
    timestamp: new Date().toISOString(),
  });
  emitTableUpdate(toTableDto(updated));
  return updated;
}

export async function resetTable(tableId: string) {
  return setTableStage(tableId, 'ready', { triggeredBy: 'TABLE_RESET' });
}

export async function getFloorPlanConfig(restaurantId = env.RESTAURANT_ID) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      name: true,
      floorPlanImageUrl: true,
      floorPlanImageType: true,
    },
  });
  return {
    name: restaurant?.name ?? 'Restaurant',
    backgroundUrl: restaurant?.floorPlanImageUrl ?? null,
    backgroundType: restaurant?.floorPlanImageType ?? null,
  };
}

export async function createTable(
  input: {
    tableNumber: string;
    zone?: string;
    capacity?: number;
    shape?: string;
    posX?: number;
    posY?: number;
    rotation?: number;
  },
  restaurantId = env.RESTAURANT_ID,
) {
  const table = await prisma.diningTable.create({
    data: {
      restaurantId,
      tableNumber: input.tableNumber,
      zone: input.zone ?? 'Main Dining Room',
      capacity: input.capacity ?? 4,
      shape: input.shape ?? 'square',
      posX: input.posX ?? 500,
      posY: input.posY ?? 500,
      rotation: input.rotation ?? 0,
      currentStage: 'ready',
    },
    include: {
      server: true,
      orders: {
        where: { status: { notIn: ['paid', 'void'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { items: { select: { quantity: true } } },
      },
    },
  });
  emitRestaurant('TABLE_UPDATED', {
    event: 'TABLE_UPDATED',
    tables: await getTables(restaurantId),
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return toTableDto(table);
}

export async function updateTable(
  id: string,
  input: {
    tableNumber?: string;
    zone?: string;
    capacity?: number;
    shape?: string;
    posX?: number;
    posY?: number;
    rotation?: number;
    isActive?: boolean;
  },
  restaurantId = env.RESTAURANT_ID,
) {
  const existing = await prisma.diningTable.findFirst({
    where: { id, restaurantId },
  });
  if (!existing) throw notFound('Table not found');
  const updated = await prisma.diningTable.update({
    where: { id },
    data: {
      ...(input.tableNumber !== undefined ? { tableNumber: input.tableNumber } : {}),
      ...(input.zone !== undefined ? { zone: input.zone } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.shape !== undefined ? { shape: input.shape } : {}),
      ...(input.posX !== undefined ? { posX: input.posX } : {}),
      ...(input.posY !== undefined ? { posY: input.posY } : {}),
      ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: {
      server: true,
      orders: {
        where: { status: { notIn: ['paid', 'void'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { items: { select: { quantity: true } } },
      },
    },
  });
  emitRestaurant('TABLE_UPDATED', {
    event: 'TABLE_UPDATED',
    tables: await getTables(restaurantId),
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return toTableDto(updated);
}

export async function removeTable(id: string, restaurantId = env.RESTAURANT_ID) {
  const existing = await prisma.diningTable.findFirst({
    where: { id, restaurantId },
  });
  if (!existing) throw notFound('Table not found');
  await prisma.diningTable.update({
    where: { id },
    data: { isActive: false, currentStage: 'ready', currentPartyName: null, currentPartySize: null },
  });
  emitRestaurant('TABLE_UPDATED', {
    event: 'TABLE_UPDATED',
    tables: await getTables(restaurantId),
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return { id, active: false };
}

export async function setFloorPlanBackground(
  url: string | null,
  type: string | null,
  restaurantId = env.RESTAURANT_ID,
) {
  const restaurant = await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { floorPlanImageUrl: url, floorPlanImageType: type },
  });
  return {
    backgroundUrl: restaurant.floorPlanImageUrl,
    backgroundType: restaurant.floorPlanImageType,
  };
}

export async function saveFloorLayout(
  tables: Array<{
    id: string;
    posX: number;
    posY: number;
    rotation?: number;
    zone?: string;
    capacity?: number;
    shape?: string;
  }>,
) {
  await prisma.$transaction(
    tables.map((t) =>
      prisma.diningTable.update({
        where: { id: t.id },
        data: {
          posX: t.posX,
          posY: t.posY,
          ...(t.rotation !== undefined ? { rotation: t.rotation } : {}),
          ...(t.zone !== undefined ? { zone: t.zone } : {}),
          ...(t.capacity !== undefined ? { capacity: t.capacity } : {}),
          ...(t.shape !== undefined ? { shape: t.shape } : {}),
        },
      }),
    ),
  );
  const updated = await getTables();
  emitRestaurant('TABLE_UPDATED', {
    event: 'TABLE_UPDATED',
    tables: updated,
    timestamp: new Date().toISOString(),
  });
  return updated;
}
