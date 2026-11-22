import { prisma } from '@shift-happens/db';
import {
  ROLE_LABELS,
  isServeOnlyRole,
  permissionsForRole,
} from '@shift-happens/shared';
import { env } from '../env.js';
import { badRequest, notFound } from '../errors.js';
import { calculateLaborPacing } from './labor-engine.js';

export async function listStaff(restaurantId = env.RESTAURANT_ID) {
  const staff = await prisma.staff.findMany({
    where: { restaurantId, isActive: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  return staff.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    roleLabel: ROLE_LABELS[s.role] ?? s.role,
    hourlyRate: Number(s.hourlyRate),
    permissions: permissionsForRole(s.role),
  }));
}

function serializeAuthStaff(staff: {
  id: string;
  name: string;
  role: string;
  hourlyRate: unknown;
}) {
  return {
    id: staff.id,
    name: staff.name,
    role: staff.role,
    roleLabel: ROLE_LABELS[staff.role] ?? staff.role,
    hourlyRate: Number(staff.hourlyRate ?? 0),
    permissions: permissionsForRole(staff.role),
    serveOnlyWhenClockedIn: isServeOnlyRole(staff.role),
  };
}

function serializeActiveShift(shift: {
  id: string;
  staffId: string | null;
  clockIn: Date | null;
  clockOut: Date | null;
  status: string;
}) {
  return {
    id: shift.id,
    staffId: shift.staffId,
    clockIn: shift.clockIn ? shift.clockIn.toISOString() : null,
    clockOut: shift.clockOut ? shift.clockOut.toISOString() : null,
    status: shift.status,
  };
}

function startOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Only a shift opened today counts as the live punch — stale ones are closed. */
async function activeShiftFor(staffId: string, restaurantId: string) {
  return prisma.staffShift.findFirst({
    where: {
      restaurantId,
      staffId,
      clockIn: { not: null, gte: startOfToday() },
      clockOut: null,
    },
    orderBy: { clockIn: 'desc' },
  });
}

export async function pinLogin(pin: string, restaurantId = env.RESTAURANT_ID) {
  if (!/^\d{3,6}$/.test(pin)) throw badRequest('PIN must be 3-6 digits');
  const staff = await prisma.staff.findFirst({
    where: { restaurantId, pin, isActive: true },
  });
  if (!staff) {
    const error = new Error('Invalid PIN') as Error & { statusCode?: number };
    error.statusCode = 401;
    throw error;
  }
  const token = Buffer.from(
    JSON.stringify({ staffId: staff.id, role: staff.role, issuedAt: Date.now() }),
  ).toString('base64url');
  const active = await activeShiftFor(staff.id, restaurantId);
  return {
    token,
    staff: serializeAuthStaff(staff),
    activeShift: active ? serializeActiveShift(active) : null,
    shiftHint: active,
  };
}

/**
 * Header time clock for the signed-in staff member: clocks into today's
 * scheduled shift when one exists, otherwise opens an eight-hour shift.
 */
export async function clockStaff(
  staffId: string,
  action: 'in' | 'out',
  restaurantId = env.RESTAURANT_ID,
) {
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, restaurantId, isActive: true },
  });
  if (!staff) throw notFound('Employee not found');

  const active = await activeShiftFor(staff.id, restaurantId);

  if (action === 'out') {
    if (!active) throw badRequest('You are not clocked in.');
    const updated = await prisma.staffShift.update({
      where: { id: active.id },
      data: { clockOut: new Date(), status: 'clocked_out' },
    });
    void calculateLaborPacing(restaurantId).catch(() => undefined);
    return {
      shift: serializeActiveShift(updated),
      staff: serializeAuthStaff(staff),
      clockedIn: false,
    };
  }

  if (active) {
    return {
      shift: serializeActiveShift(active),
      staff: serializeAuthStaff(staff),
      clockedIn: true,
    };
  }

  const dayStart = startOfToday();
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // Close yesterday's forgotten punch before opening today's.
  await prisma.staffShift.updateMany({
    where: {
      restaurantId,
      staffId: staff.id,
      clockIn: { not: null, lt: dayStart },
      clockOut: null,
    },
    data: { clockOut: dayStart, status: 'clocked_out' },
  });

  const scheduled = await prisma.staffShift.findFirst({
    where: {
      restaurantId,
      staffId: staff.id,
      scheduledStart: { gte: dayStart, lt: dayEnd },
    },
    orderBy: { scheduledStart: 'asc' },
  });

  const shift =
    scheduled ??
    (await prisma.staffShift.create({
      data: {
        restaurantId,
        staffId: staff.id,
        userName: staff.name,
        role: staff.role,
        hourlyRate: staff.hourlyRate,
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 8 * 3_600_000),
        status: 'scheduled',
      },
    }));

  const updated = await prisma.staffShift.update({
    where: { id: shift.id },
    data: { clockIn: new Date(), clockOut: null, status: 'active' },
  });
  void calculateLaborPacing(restaurantId).catch(() => undefined);

  return {
    shift: serializeActiveShift(updated),
    staff: serializeAuthStaff(staff),
    clockedIn: true,
  };
}
