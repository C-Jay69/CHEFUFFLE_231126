import type { FastifyRequest } from 'fastify';
import { prisma } from '@shift-happens/db';
import {
  ROLE_LABELS,
  permissionsForRole,
  type Permission,
} from '@shift-happens/shared';
import { forbidden } from '../errors.js';

/**
 * Demo-grade role gate. The terminal sends `x-staff-id` for the signed-in
 * staff member; managers pass every check, restricted roles get a 403.
 *
 * Requests without the header (scripts, integration tests, the raw API) are
 * allowed through: this is a PIN terminal, not a hardened auth boundary.
 */
export async function requirePermission(
  request: FastifyRequest,
  permission: Permission,
) {
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

  const permissions = permissionsForRole(staff.role);
  if (!permissions.includes(permission)) {
    const label = ROLE_LABELS[staff.role] ?? staff.role;
    throw forbidden(
      `${label} cannot perform this action. Ask a manager to approve it.`,
    );
  }
  return staff;
}
