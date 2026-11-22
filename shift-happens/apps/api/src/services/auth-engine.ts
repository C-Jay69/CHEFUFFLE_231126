import { randomBytes } from 'node:crypto';
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  hashPin,
  prisma,
  verifyPin,
} from '@shift-happens/db';
import type { Staff } from '@shift-happens/db';
import {
  ROLE_LABELS,
  isServeOnlyRole,
  permissionsForRole,
} from '@shift-happens/shared';
import { env } from '../env.js';
import { AppError, badRequest, notFound } from '../errors.js';
import { recordAudit } from '../lib/audit.js';
import { hashSessionToken } from '../lib/staff-auth.js';
import { calculateLaborPacing } from './labor-engine.js';

/** Server-issued bearer sessions live for 12 hours. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** 5 failed PIN attempts from one source locks further attempts for 5 minutes. */
export const PIN_THROTTLE_WINDOW_MS = 5 * 60 * 1000;
export const PIN_THROTTLE_MAX_FAILURES = 5;

interface ThrottleEntry {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number | null;
}

const pinAttempts = new Map<string, ThrottleEntry>();

/** Test hook: clear in-process lockout state. */
export function resetPinThrottle(): void {
  pinAttempts.clear();
}

function throttleKey(ipAddress: string | null | undefined): string {
  return ipAddress?.trim() || 'unknown';
}

function assertNotLockedOut(key: string): void {
  const entry = pinAttempts.get(key);
  if (!entry) return;
  const now = Date.now();
  if (entry.lockedUntil) {
    if (entry.lockedUntil > now) {
      const seconds = Math.ceil((entry.lockedUntil - now) / 1000);
      throw new AppError(
        429,
        `Too many incorrect PIN attempts. Try again in ${seconds} seconds.`,
      );
    }
    // The lock has expired; start a fresh failure window.
    pinAttempts.delete(key);
    return;
  }
  if (now - entry.firstFailureAt > PIN_THROTTLE_WINDOW_MS) {
    pinAttempts.delete(key);
  }
}

function recordFailure(key: string): void {
  const now = Date.now();
  const existing = pinAttempts.get(key);
  const entry =
    existing && now - existing.firstFailureAt <= PIN_THROTTLE_WINDOW_MS
      ? existing
      : { failures: 0, firstFailureAt: now, lockedUntil: null as number | null };

  entry.failures += 1;
  if (entry.failures >= PIN_THROTTLE_MAX_FAILURES) {
    entry.lockedUntil = now + PIN_THROTTLE_WINDOW_MS;
  }
  pinAttempts.set(key, entry);
}

function assertPinFormat(pin: string): void {
  if (!/^\d+$/.test(pin)) {
    throw badRequest('PIN must contain digits only.');
  }
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
    throw badRequest(
      `PIN must be ${PIN_MIN_LENGTH}-${PIN_MAX_LENGTH} digits.`,
    );
  }
}

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

/** The only staff shape that may cross the wire — never includes PIN material. */
export function serializeAuthStaff(staff: {
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

export interface PinLoginContext {
  restaurantId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function combineOrFilter() {
  return [{ pinHash: { not: null } }, { pin: { not: null } }];
}

/**
 * Verify a PIN against the stored hash and issue an opaque bearer session.
 *
 * - The PIN is never compared in SQL (hashes are salted), so we verify each
 *   active candidate with `verifyPin`.
 * - A legacy plaintext `pin` that matches is transparently upgraded to
 *   `pinHash` and the legacy column is nulled.
 * - Successful and failed attempts are audited; an audit failure never blocks
 *   the login.
 */
export async function pinLogin(
  pin: string,
  context: PinLoginContext = {},
) {
  const restaurantId = context.restaurantId ?? env.RESTAURANT_ID;
  const ipAddress = context.ipAddress ?? null;
  const userAgent = context.userAgent?.slice(0, 255) ?? null;

  assertPinFormat(pin);

  const key = throttleKey(ipAddress);
  assertNotLockedOut(key);

  const candidates = await prisma.staff.findMany({
    where: {
      restaurantId,
      isActive: true,
      OR: combineOrFilter(),
    },
  });

  let matched: Staff | null = null;
  let legacyMatch = false;

  for (const candidate of candidates) {
    if (candidate.pinHash && verifyPin(pin, candidate.pinHash)) {
      matched = candidate;
      legacyMatch = false;
      break;
    }
    if (!candidate.pinHash && candidate.pin && candidate.pin === pin) {
      matched = candidate;
      legacyMatch = true;
      break;
    }
  }

  if (!matched) {
    recordFailure(key);
    await recordAudit({
      restaurantId,
      action: 'auth.login_failed',
      entity: 'auth',
      reason: 'invalid_pin',
      ipAddress,
    });
    throw new AppError(401, 'Invalid PIN');
  }

  let staff = matched;
  if (legacyMatch) {
    staff = await prisma.staff.update({
      where: { id: matched.id },
      data: { pinHash: hashPin(pin), pin: null },
    });
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const session = await prisma.session.create({
    data: {
      restaurantId,
      staffId: staff.id,
      tokenHash,
      expiresAt,
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    },
  });

  const active = await activeShiftFor(staff.id, restaurantId);

  await recordAudit({
    restaurantId,
    actorStaffId: staff.id,
    action: legacyMatch ? 'auth.login_upgraded' : 'auth.login',
    entity: 'auth',
    entityId: staff.id,
    after: { legacyPinUpgraded: legacyMatch },
    ipAddress,
  });

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    restaurantId,
    sessionId: session.id,
    staff: serializeAuthStaff(staff),
    activeShift: active ? serializeActiveShift(active) : null,
    shiftHint: active ? serializeActiveShift(active) : null,
  };
}

/** Revoke the session behind a bearer token. Idempotent and audit-logged. */
export async function logoutSession(
  token: string,
  context: { ipAddress?: string | null } = {},
): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
  });
  if (!session) return false;

  if (!session.revokedAt) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  }

  await recordAudit({
    restaurantId: session.restaurantId,
    actorStaffId: session.staffId,
    action: 'auth.logout',
    entity: 'auth',
    entityId: session.id,
    ipAddress: context.ipAddress ?? null,
  });

  return true;
}

/** Safe `/auth/me` payload: staff, tenant and the live shift. */
export async function sessionPayload(
  staff: Staff,
  restaurantId: string | null,
) {
  const tenantId = restaurantId ?? staff.restaurantId;
  const active = await activeShiftFor(staff.id, tenantId);
  return {
    restaurantId: tenantId,
    staff: serializeAuthStaff(staff),
    activeShift: active ? serializeActiveShift(active) : null,
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
