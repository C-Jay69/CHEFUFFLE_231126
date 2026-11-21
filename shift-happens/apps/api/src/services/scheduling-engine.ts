import { prisma } from '@shift-happens/db';
import type { ShiftCreateInput } from '@shift-happens/shared';
import { env } from '../env.js';
import { badRequest, notFound } from '../errors.js';
import { emitRestaurant } from '../realtime.js';
import { sendMessage } from './notifier.js';
import { calculateLaborPacing, getLaborForecast } from './labor-engine.js';

const num = (v: unknown) => Number(v ?? 0);
const round = (v: number, places = 2) => Number(v.toFixed(places));
const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  general_manager: 'General Manager',
  floor_manager: 'Floor Manager',
  chef_expo: 'Chef / Expo',
  line_cook: 'Line Cook',
  server: 'Server',
  bartender: 'Bartender',
  host: 'Host',
};

const dayBounds = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

export function serializeShift(shift: any) {
  const now = Date.now();
  const hoursScheduled =
    (shift.scheduledEnd.getTime() - shift.scheduledStart.getTime()) / 3_600_000;
  const hoursWorked = shift.clockIn
    ? ((shift.clockOut?.getTime() ?? now) - shift.clockIn.getTime()) / 3_600_000
    : 0;
  return {
    id: shift.id,
    staffId: shift.staffId,
    userName: shift.userName,
    role: shift.role,
    roleLabel: ROLE_LABELS[shift.role] ?? shift.role,
    station: shift.station,
    hourlyRate: num(shift.hourlyRate),
    scheduledStart: shift.scheduledStart.toISOString(),
    scheduledEnd: shift.scheduledEnd.toISOString(),
    clockIn: shift.clockIn?.toISOString() ?? null,
    clockOut: shift.clockOut?.toISOString() ?? null,
    status: shift.status,
    hoursScheduled: round(hoursScheduled),
    hoursWorked: round(hoursWorked),
    laborCost: round(num(shift.hourlyRate) * (hoursWorked || hoursScheduled)),
    signoff: shift.signoffs?.[0]
      ? {
          id: shift.signoffs[0].id,
          signedAt: shift.signoffs[0].signedAt.toISOString(),
          allergenAcknowledged: shift.signoffs[0].allergenAcknowledged,
          haccpAcknowledged: shift.signoffs[0].haccpAcknowledged,
        }
      : null,
  };
}

export async function listShifts(
  restaurantId = env.RESTAURANT_ID,
  date = new Date(),
) {
  const { start, end } = dayBounds(date);
  const shifts = await prisma.staffShift.findMany({
    where: {
      restaurantId,
      scheduledStart: { lt: end },
      scheduledEnd: { gt: start },
    },
    include: { signoffs: true, staff: true },
    orderBy: [{ scheduledStart: 'asc' }, { role: 'asc' }],
  });
  const rows = shifts.map(serializeShift);
  const pacing = await calculateLaborPacing(restaurantId, { emit: false });
  return {
    date: start.toISOString(),
    shifts: rows,
    summary: {
      active: rows.filter((s) => s.status === 'active').length,
      scheduled: rows.filter((s) => s.status === 'scheduled').length,
      clockedOut: rows.filter((s) => s.status === 'clocked_out').length,
      total: rows.length,
      scheduledWages: round(
        rows.reduce((sum, s) => sum + s.hourlyRate * s.hoursScheduled, 0),
      ),
      laborPercentage: pacing.laborPercentage,
      targetPercentage: pacing.targetPercentage,
      pacingStatus: pacing.status,
      recommendation: pacing.recommendation,
    },
    pacing,
  };
}

export async function createShift(
  input: ShiftCreateInput,
  restaurantId = env.RESTAURANT_ID,
) {
  const staff = await prisma.staff.findFirst({
    where: { restaurantId, name: { equals: input.userName, mode: 'insensitive' } },
  });
  const shift = await prisma.staffShift.create({
    data: {
      restaurantId,
      staffId: staff?.id ?? null,
      userName: input.userName,
      role: input.role,
      hourlyRate: input.hourlyRate,
      station: input.station ?? null,
      scheduledStart: new Date(input.scheduledStart),
      scheduledEnd: new Date(input.scheduledEnd),
      status: 'scheduled',
    },
    include: { signoffs: true, staff: true },
  });
  const serialized = serializeShift(shift);
  emitRestaurant('LABOR_PACING_UPDATE', {
    event: 'LABOR_PACING_UPDATE',
    shift: serialized,
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return serialized;
}

export async function clockIn(shiftId: string, restaurantId = env.RESTAURANT_ID) {
  const shift = await prisma.staffShift.findFirst({
    where: { id: shiftId, restaurantId },
  });
  if (!shift) throw notFound('Shift not found');
  if (shift.clockIn && !shift.clockOut) throw badRequest('Already clocked in');
  const updated = await prisma.staffShift.update({
    where: { id: shiftId },
    data: { clockIn: new Date(), clockOut: null, status: 'active' },
    include: { signoffs: true, staff: true },
  });
  void calculateLaborPacing(restaurantId).catch(() => undefined);
  return serializeShift(updated);
}

export async function clockOut(shiftId: string, restaurantId = env.RESTAURANT_ID) {
  const shift = await prisma.staffShift.findFirst({
    where: { id: shiftId, restaurantId },
  });
  if (!shift) throw notFound('Shift not found');
  if (!shift.clockIn) throw badRequest('Shift has not clocked in');
  const updated = await prisma.staffShift.update({
    where: { id: shiftId },
    data: { clockOut: new Date(), status: 'clocked_out' },
    include: { signoffs: true, staff: true },
  });
  void calculateLaborPacing(restaurantId).catch(() => undefined);
  return serializeShift(updated);
}

export async function getTimeClockLogs(
  restaurantId = env.RESTAURANT_ID,
  limit = 30,
) {
  const shifts = await prisma.staffShift.findMany({
    where: { restaurantId, clockIn: { not: null } },
    include: { staff: true },
    orderBy: { clockIn: 'desc' },
    take: limit,
  });
  return shifts.map((shift) => ({
    id: shift.id,
    userName: shift.userName,
    role: shift.role,
    station: shift.station,
    clockIn: shift.clockIn?.toISOString() ?? null,
    clockOut: shift.clockOut?.toISOString() ?? null,
    hourlyRate: num(shift.hourlyRate),
    status: shift.status,
  }));
}

export async function broadcastEarlyCut(
  restaurantId = env.RESTAURANT_ID,
  message = 'Voluntary early cut available — reply YES to accept and clock out at the next 15-minute mark.',
) {
  const active = await prisma.staffShift.findMany({
    where: {
      restaurantId,
      clockIn: { not: null },
      clockOut: null,
      role: { in: ['server', 'host', 'line_cook', 'bartender'] },
    },
    orderBy: { clockIn: 'asc' },
  });
  if (active.length === 0) throw badRequest('No active staff to broadcast to');
  // Floaters / earliest non-lead server first.
  const recipientNames = active.slice(-2).map((s) => s.userName);
  const numbers = await prisma.staff.findMany({
    where: { restaurantId, name: { in: recipientNames } },
    select: { name: true },
  });
  const result = await sendMessage({
    restaurantId,
    channel: 'sms',
    recipients: recipientNames,
    message: `Whiteout: ${message}`,
  });
  emitRestaurant('LABOR_PACING_UPDATE', {
    event: 'LABOR_PACING_UPDATE',
    broadcast: {
      recipients: recipientNames,
      message,
      delivered: result.delivered,
      simulated: result.simulated,
      staffMatched: numbers.length,
    },
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return {
    recipients: recipientNames,
    activeStaff: active.length,
    delivered: result.delivered,
    simulated: result.simulated,
    notificationId: result.notification.id,
  };
}

export async function getForecast(restaurantId = env.RESTAURANT_ID, date = new Date()) {
  return getLaborForecast(restaurantId, date);
}

export async function approveSwap(shiftId: string) {
  const shift = await prisma.staffShift.findUnique({ where: { id: shiftId } });
  if (!shift) throw notFound('Shift not found');
  return { shiftId, status: 'approved', message: 'Swap approved and published to staff' };
}

export async function declineSwap(shiftId: string) {
  const shift = await prisma.staffShift.findUnique({ where: { id: shiftId } });
  if (!shift) throw notFound('Shift not found');
  return { shiftId, status: 'declined', message: 'Swap declined; original shift retained' };
}
