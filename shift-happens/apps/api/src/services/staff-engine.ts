import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  hashPin,
  pinLookup,
  prisma,
  verifyPin,
} from '@shift-happens/db';
import { ROLE_LABELS, permissionsForRole } from '@shift-happens/shared';
import { env } from '../env.js';
import { badRequest, conflict, notFound } from '../errors.js';

/** Never return a full SIN over the wire — only the last three digits. */
function maskSin(sin: string | null | undefined) {
  if (!sin) return null;
  const digits = sin.replace(/\D/g, '');
  if (digits.length < 3) return '••• ••• •••';
  return `••• ••• ${digits.slice(-3)}`;
}

export function serializeTeamMember(staff: any) {
  return {
    id: staff.id,
    name: staff.name,
    role: staff.role,
    roleLabel: ROLE_LABELS[staff.role] ?? staff.role,
    permissions: permissionsForRole(staff.role),
    hourlyRate: Number(staff.hourlyRate ?? 0),
    phone: staff.phone ?? null,
    email: staff.email ?? null,
    address: staff.address ?? null,
    sinMasked: maskSin(staff.sin),
    startDate: staff.startDate ? staff.startDate.toISOString() : null,
    isActive: staff.isActive,
    createdAt: staff.createdAt.toISOString(),
  };
}

export async function listTeam(
  restaurantId = env.RESTAURANT_ID,
  options: { includeInactive?: boolean } = {},
) {
  const staff = await prisma.staff.findMany({
    where: {
      restaurantId,
      ...(options.includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  return staff.map(serializeTeamMember);
}

export interface StaffInput {
  name: string;
  role: string;
  pin?: string;
  hourlyRate?: number;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  sin?: string | null;
  startDate?: string | null;
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

/**
 * Pins are salted hashes, so uniqueness is checked by verifying the candidate
 * against every other active member rather than by a SQL equality lookup.
 * Legacy plaintext rows are included until the backfill completes.
 */
async function assertPinFree(
  restaurantId: string,
  pin: string,
  excludeId?: string,
) {
  const lookup = pinLookup(pin, restaurantId);
  const clash = await prisma.staff.findFirst({
    where: {
      restaurantId,
      pinLookup: lookup,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { name: true },
  });
  if (clash) {
    throw conflict(`That PIN is already assigned to ${clash.name}.`);
  }

  // Rows hashed before the lookup column existed have no index entry; verify
  // the candidate against those few rows so uniqueness still holds.
  const legacy = await prisma.staff.findMany({
    where: {
      restaurantId,
      pinLookup: null,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [{ pinHash: { not: null } }, { pin: { not: null } }],
    },
    select: { name: true, pin: true, pinHash: true },
  });
  const legacyClash = legacy.find((candidate) =>
    candidate.pinHash
      ? verifyPin(pin, candidate.pinHash)
      : candidate.pin === pin,
  );
  if (legacyClash) {
    throw conflict(`That PIN is already assigned to ${legacyClash.name}.`);
  }
}

export async function createStaffMember(
  input: StaffInput,
  restaurantId = env.RESTAURANT_ID,
) {
  if (input.pin) {
    assertPinFormat(input.pin);
    await assertPinFree(restaurantId, input.pin);
  }

  const staff = await prisma.staff.create({
    data: {
      restaurantId,
      name: input.name.trim(),
      role: input.role as never,
      // No shared default credential: a member without a PIN cannot sign in
      // until a manager assigns one.
      pin: null,
      pinHash: input.pin ? hashPin(input.pin) : null,
      pinLookup: input.pin ? pinLookup(input.pin, restaurantId) : null,
      hourlyRate: input.hourlyRate ?? 18,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      sin: input.sin ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
    },
  });
  return serializeTeamMember(staff);
}

export async function updateStaffMember(
  id: string,
  input: Partial<StaffInput> & { isActive?: boolean },
  restaurantId = env.RESTAURANT_ID,
) {
  const existing = await prisma.staff.findFirst({ where: { id, restaurantId } });
  if (!existing) throw notFound('Employee not found');

  if (input.pin !== undefined) {
    assertPinFormat(input.pin);
    await assertPinFree(restaurantId, input.pin, id);
  }

  const staff = await prisma.staff.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.role !== undefined ? { role: input.role as never } : {}),
      ...(input.pin !== undefined
        ? {
            pin: null,
            pinHash: hashPin(input.pin),
            pinLookup: pinLookup(input.pin, restaurantId),
          }
        : {}),
      ...(input.hourlyRate !== undefined ? { hourlyRate: input.hourlyRate } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.sin !== undefined ? { sin: input.sin } : {}),
      ...(input.startDate !== undefined
        ? { startDate: input.startDate ? new Date(input.startDate) : null }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return serializeTeamMember(staff);
}

export async function deactivateStaffMember(
  id: string,
  restaurantId = env.RESTAURANT_ID,
) {
  const existing = await prisma.staff.findFirst({ where: { id, restaurantId } });
  if (!existing) throw notFound('Employee not found');
  const staff = await prisma.staff.update({
    where: { id },
    data: { isActive: false },
  });
  return serializeTeamMember(staff);
}
