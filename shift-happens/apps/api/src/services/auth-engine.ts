import { prisma } from '@shift-happens/db';
import { env } from '../env.js';
import { badRequest } from '../errors.js';

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
  }));
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
  return {
    token,
    staff: {
      id: staff.id,
      name: staff.name,
      role: staff.role,
      roleLabel: ROLE_LABELS[staff.role] ?? staff.role,
      hourlyRate: Number(staff.hourlyRate),
    },
    shiftHint: await prisma.staffShift.findFirst({
      where: { restaurantId, staffId: staff.id, clockOut: null, clockIn: { not: null } },
      orderBy: { clockIn: 'desc' },
    }),
  };
}
