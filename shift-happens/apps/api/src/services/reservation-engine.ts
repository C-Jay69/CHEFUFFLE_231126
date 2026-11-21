import { prisma } from '@shift-happens/db';
import type { ReservationInput } from '@shift-happens/shared';
import { env } from '../env.js';
import { badRequest, notFound } from '../errors.js';
import { emitRestaurant } from '../realtime.js';
import { sendMessage } from './notifier.js';
import { seatTable, toTableDto } from './stage-engine.js';

export const reservationInclude = {
  table: true,
  server: true,
};

export function serializeReservation(reservation: any) {
  return {
    id: reservation.id,
    guestName: reservation.guestName,
    phone: reservation.phone,
    email: reservation.email,
    partySize: reservation.partySize,
    reservationTime: reservation.reservationTime.toISOString(),
    tableId: reservation.tableId,
    tableNumber: reservation.table?.tableNumber ?? null,
    zone: reservation.table?.zone ?? null,
    status: reservation.status,
    source: reservation.source,
    notes: reservation.notes,
    vip: reservation.vip,
    occasion: reservation.occasion,
    serverId: reservation.serverId,
    serverName: reservation.server?.name ?? null,
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
  };
}

const dayBounds = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

/**
 * Resolves the requested window. `from`/`to` are ISO timestamps with `to`
 * exclusive (day/week/month/year ranges from the calendar UI). `date` keeps the
 * original single-day behaviour for existing callers.
 */
function resolveRange(filters: { date?: string; from?: string; to?: string }) {
  if (filters.from || filters.to) {
    const start = new Date(filters.from ?? filters.to!);
    const end = new Date(filters.to ?? filters.from!);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw badRequest('Invalid reservation date range');
    }
    if (end <= start) {
      return dayBounds(start);
    }
    return { start, end };
  }
  return dayBounds(filters.date ? new Date(filters.date) : new Date());
}

export async function listReservations(
  restaurantId = env.RESTAURANT_ID,
  filters: {
    date?: string;
    from?: string;
    to?: string;
    status?: string;
    search?: string;
    view?: string;
  } = {},
) {
  const { start, end } = resolveRange(filters);
  const todayReservations = await prisma.reservation.findMany({
    where: {
      restaurantId,
      reservationTime: { gte: start, lt: end },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search
        ? {
            OR: [
              { guestName: { contains: filters.search, mode: 'insensitive' } },
              { phone: { contains: filters.search, mode: 'insensitive' } },
              { notes: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: reservationInclude,
    orderBy: { reservationTime: 'asc' },
    take: 2000,
  });

  const stats = {
    total: todayReservations.length,
    covers: todayReservations.reduce((sum, r) => sum + r.partySize, 0),
    seated: todayReservations.filter((r) => r.status === 'seated').length,
    confirmed: todayReservations.filter((r) => r.status === 'confirmed').length,
    waitlist: todayReservations.filter((r) => r.status === 'waitlist').length,
    vip: todayReservations.filter((r) => r.vip).length,
    voiceAi: todayReservations.filter((r) => r.source === 'voice_ai').length,
  };

  const upcoming = await prisma.reservation.findMany({
    where: {
      restaurantId,
      reservationTime: { gte: new Date() },
      status: { in: ['confirmed', 'waitlist'] },
    },
    include: reservationInclude,
    orderBy: { reservationTime: 'asc' },
    take: 8,
  });

  return {
    date: start.toISOString(),
    range: { from: start.toISOString(), to: end.toISOString() },
    reservations: todayReservations.map(serializeReservation),
    upcoming: upcoming.map(serializeReservation),
    stats,
    timeSlots: buildTimeSlots(todayReservations),
  };
}

function buildTimeSlots(reservations: any[]) {
  const slots: Array<{ label: string; count: number; covers: number }> = [];
  for (let hour = 17; hour <= 22; hour++) {
    const inSlot = reservations.filter((r) => {
      const h = new Date(r.reservationTime).getHours();
      return h === hour;
    });
    slots.push({
      label: `${String(hour).padStart(2, '0')}:00`,
      count: inSlot.length,
      covers: inSlot.reduce((sum, r) => sum + r.partySize, 0),
    });
  }
  return slots;
}

export async function checkAvailability(
  restaurantId = env.RESTAURANT_ID,
  options: { time?: string; partySize?: number } = {},
) {
  const time = options.time ? new Date(options.time) : new Date(Date.now() + 2 * 3_600_000);
  const partySize = options.partySize ?? 2;
  const windowStart = new Date(time.getTime() - 90 * 60_000);
  const windowEnd = new Date(time.getTime() + 90 * 60_000);

  const [tables, conflicts] = await Promise.all([
    prisma.diningTable.findMany({
      where: {
        restaurantId,
        isActive: true,
        capacity: { gte: partySize },
        currentStage: 'ready',
      },
      include: { server: true },
      orderBy: [{ capacity: 'asc' }, { tableNumber: 'asc' }],
    }),
    prisma.reservation.findMany({
      where: {
        restaurantId,
        status: { in: ['confirmed', 'seated'] },
        reservationTime: { gte: windowStart, lte: windowEnd },
      },
      select: { tableId: true },
    }),
  ]);
  const bookedTableIds = new Set(conflicts.map((c) => c.tableId).filter(Boolean));
  const available = tables.filter((t) => !bookedTableIds.has(t.id)).map(toTableDto);
  return {
    time: time.toISOString(),
    partySize,
    availableTables: available,
    availableCount: available.length,
    tableNumbers: available.map((t) => t.tableNumber),
  };
}

async function autoAssignTable(
  restaurantId: string,
  partySize: number,
  time: Date,
): Promise<string | null> {
  const sameDay = time.toDateString() === new Date().toDateString();
  if (!sameDay) return null;
  const availability = await checkAvailability(restaurantId, {
    time: time.toISOString(),
    partySize,
  });
  return availability.availableTables[0]?.id ?? null;
}

export async function createReservation(
  input: ReservationInput,
  restaurantId = env.RESTAURANT_ID,
) {
  const time = new Date(input.reservationTime);
  if (Number.isNaN(time.getTime())) throw badRequest('Invalid reservation time');

  let tableId = input.tableId ?? null;
  if (tableId) {
    const table = await prisma.diningTable.findFirst({
      where: { id: tableId, restaurantId },
    });
    if (!table) throw notFound('Table not found');
  } else if (input.status === 'confirmed') {
    tableId = await autoAssignTable(restaurantId, input.partySize, time);
  }

  const reservation = await prisma.reservation.create({
    data: {
      restaurantId,
      guestName: input.guestName,
      phone: input.phone,
      email: input.email || null,
      partySize: input.partySize,
      reservationTime: time,
      tableId,
      status: input.status,
      source: input.source,
      notes: input.notes ?? null,
      vip: input.vip,
      occasion: input.occasion ?? null,
    },
    include: reservationInclude,
  });

  const serialized = serializeReservation(reservation);
  emitRestaurant('RESERVATION_CREATED', {
    event: 'RESERVATION_CREATED',
    reservation: serialized,
    source: input.source,
    timestamp: new Date().toISOString(),
  }, restaurantId);

  void sendMessage({
    restaurantId,
    channel: 'sms',
    recipients: [input.phone],
    message: `SHIFT HAPPENS! reservation confirmed for ${input.partySize} on ${time.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${reservation.table ? ` at ${reservation.table.tableNumber}` : ''}. Reply HELP for assistance.`,
  }).catch((error) => console.warn('reservation SMS failed', error));

  return serialized;
}

export async function updateReservation(
  id: string,
  input: Partial<ReservationInput> & { status?: string },
  restaurantId = env.RESTAURANT_ID,
) {
  const existing = await prisma.reservation.findFirst({
    where: { id, restaurantId },
  });
  if (!existing) throw notFound('Reservation not found');

  const updated = await prisma.reservation.update({
    where: { id },
    data: {
      ...(input.guestName !== undefined ? { guestName: input.guestName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.partySize !== undefined ? { partySize: input.partySize } : {}),
      ...(input.reservationTime !== undefined
        ? { reservationTime: new Date(input.reservationTime) }
        : {}),
      ...(input.tableId !== undefined ? { tableId: input.tableId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.vip !== undefined ? { vip: input.vip } : {}),
      ...(input.occasion !== undefined ? { occasion: input.occasion } : {}),
    },
    include: reservationInclude,
  });

  if (input.status === 'seated' && updated.tableId) {
    await seatTable(updated.tableId, {
      partyName: updated.guestName,
      partySize: updated.partySize,
      reservationId: updated.id,
      serverId: updated.serverId,
    });
  }
  if (['cancelled', 'completed', 'no_show'].includes(input.status ?? '') && updated.tableId) {
    const table = await prisma.diningTable.findUnique({ where: { id: updated.tableId } });
    if (table?.currentPartyName === updated.guestName) {
      await prisma.diningTable.update({
        where: { id: updated.tableId },
        data: { currentStage: 'dirty_bussing', currentPartyName: null, currentPartySize: null },
      });
    }
  }

  const serialized = serializeReservation(updated);
  emitRestaurant('RESERVATION_UPDATED', {
    event: 'RESERVATION_UPDATED',
    reservation: serialized,
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return serialized;
}

export async function seatReservation(id: string, restaurantId = env.RESTAURANT_ID) {
  const reservation = await prisma.reservation.findFirst({
    where: { id, restaurantId },
    include: reservationInclude,
  });
  if (!reservation) throw notFound('Reservation not found');
  let tableId = reservation.tableId;
  if (!tableId) {
    tableId = await autoAssignTable(restaurantId, reservation.partySize, new Date());
  }
  if (!tableId) throw badRequest('No available table for this party');

  await seatTable(tableId, {
    partyName: reservation.guestName,
    partySize: reservation.partySize,
    serverId: reservation.serverId,
    reservationId: reservation.id,
  });
  return updateReservation(
    id,
    { status: 'seated', tableId },
    restaurantId,
  );
}
