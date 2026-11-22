import type { FastifyRequest } from 'fastify';
import { prisma } from '@shift-happens/db';
import {
  ROLE_LABELS,
  permissionsForRole,
  type Permission,
} from '@shift-happens/shared';
import { forbidden } from '../errors.js';

/**
 * Resolves the signed-in staff member from `x-staff-id`. No header means an
 * unidentified terminal/script (demo bypass); a bad or deactivated id is
 * rejected.
 */
export async function currentStaff(request: FastifyRequest) {
  const header = request.headers['x-staff-id'];
  if (header === undefined) return null;

  const staffId = Array.isArray(header) ? header[0] : header;
  if (!staffId || !/^[0-9a-f-]{36}$/i.test(staffId)) {
    throw forbidden('Unknown staff session. Sign in again.');
  }

  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff || !staff.isActive) {
    throw forbidden('This staff login is no longer active. Sign in again.');
  }
  return staff;
}

export function canViewAllTables(staff: { role: string } | null) {
  if (!staff) return true;
  return permissionsForRole(staff.role).includes('tables.viewAll');
}

/**
 * Demo-grade role gate. The terminal sends `x-staff-id` for the signed-in
 * staff member; managers pass every check, restricted roles get a 403.
 */
export async function requirePermission(
  request: FastifyRequest,
  permission: Permission,
) {
  const staff = await currentStaff(request);
  if (!staff) return null;

  const permissions = permissionsForRole(staff.role);
  if (!permissions.includes(permission)) {
    const label = ROLE_LABELS[staff.role] ?? staff.role;
    throw forbidden(
      `${label} cannot perform this action. Ask a manager to approve it.`,
    );
  }
  return staff;
}

/**
 * Servers may only open, add to or settle their own checks. Managers can act
 * on any check.
 */
export async function requireOrderAccess(
  request: FastifyRequest,
  orderId: string,
  permission: Permission,
) {
  const staff = await requirePermission(request, permission);
  if (!staff || canViewAllTables(staff)) return staff;

  const order = await prisma.order.findFirst({
    where: { id: orderId },
    select: { serverId: true },
  });
  if (!order) return staff;

  if (order.serverId !== staff.id) {
    const label = ROLE_LABELS[staff.role] ?? staff.role;
    throw forbidden(`${label}s only manage their own checks. Ask a manager.`);
  }
  return staff;
}

/**
 * Servers may only act on their own tables (or a ready table they are about to
 * claim). Floor managers, GMs and owners can act on any table.
 */
export async function requireTableAccess(
  request: FastifyRequest,
  tableId: string,
  permission: Permission,
) {
  const staff = await requirePermission(request, permission);
  if (!staff || canViewAllTables(staff)) return { staff, table: null };

  const table = await prisma.diningTable.findFirst({
    where: { id: tableId },
    include: {
      orders: {
        where: { status: { notIn: ['paid', 'void'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { serverId: true },
      },
    },
  });
  if (!table) return { staff, table: null };

  const owns =
    table.serverId === staff.id ||
    table.orders[0]?.serverId === staff.id ||
    table.currentStage === 'ready';

  if (!owns) {
    const label = ROLE_LABELS[staff.role] ?? staff.role;
    throw forbidden(`${label}s only manage their own tables. Ask a manager.`);
  }
  return { staff, table };
}
