import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { prisma } from '@shift-happens/db';
import type { Session, Staff } from '@shift-happens/db';
import {
  ROLE_LABELS,
  permissionsForRole,
  type Permission,
} from '@shift-happens/shared';
import { AppError, forbidden } from '../errors.js';

/**
 * Server-resolved identity.
 *
 * The browser presents an opaque bearer token. Only its SHA-256 digest is
 * stored (Session.tokenHash), so a database read can never recover a usable
 * token. Roles and permissions always come from the Staff row — never from a
 * client-supplied id or role.
 */

export interface ResolvedAuth {
  session: Session;
  staff: Staff;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by the global auth guard once a session is verified. */
    authSession?: ResolvedAuth;
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Extract `Authorization: Bearer <token>`; anything else is anonymous. */
export function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(raw.trim());
  return match?.[1] ?? null;
}

function isUsable(
  session: Pick<Session, 'expiresAt' | 'revokedAt'>,
  staff: Pick<Staff, 'isActive'>,
): boolean {
  if (session.revokedAt) return false;
  if (session.expiresAt.getTime() <= Date.now()) return false;
  return staff.isActive;
}

/**
 * Load the session (with its staff member) for a raw bearer token.
 * Missing, expired, revoked and deactivated sessions all resolve to null.
 */
export async function loadSessionByToken(
  token: string,
): Promise<ResolvedAuth | null> {
  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { staff: true },
  });
  if (!session || !session.staff) return null;
  if (!isUsable(session, session.staff)) return null;
  return { session, staff: session.staff };
}

/** Resolve the signed-in staff member, or null when unauthenticated. */
export async function currentStaff(
  request: FastifyRequest,
): Promise<Staff | null> {
  if (request.authSession) {
    const { session, staff } = request.authSession;
    return isUsable(session, staff) ? staff : null;
  }

  const token = extractBearerToken(request);
  if (!token) return null;
  const resolved = await loadSessionByToken(token);
  return resolved?.staff ?? null;
}

/**
 * Full auth context for handlers that need the tenant (`session.restaurantId`).
 */
export async function currentSession(
  request: FastifyRequest,
): Promise<ResolvedAuth | null> {
  if (request.authSession) {
    const { session, staff } = request.authSession;
    return isUsable(session, staff) ? request.authSession : null;
  }

  const token = extractBearerToken(request);
  if (!token) return null;
  return loadSessionByToken(token);
}

/**
 * Only managers (tables.viewAll) see every table. Anonymous requests are never
 * privileged.
 */
export function canViewAllTables(staff: { role: string } | null) {
  if (!staff) return false;
  return permissionsForRole(staff.role).includes('tables.viewAll');
}

/** Throws 401 rather than silently allowing an unauthenticated caller. */
async function requireStaff(request: FastifyRequest): Promise<Staff> {
  const staff = await currentStaff(request);
  if (!staff) {
    throw new AppError(401, 'Authentication required. Sign in again.');
  }
  return staff;
}

/**
 * Role gate. Roles and permissions come from the authenticated Staff row, so a
 * caller cannot escalate by claiming another role or staff id.
 */
export async function requirePermission(
  request: FastifyRequest,
  permission: Permission,
) {
  const staff = await requireStaff(request);
  if (!permissionsForRole(staff.role).includes(permission)) {
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
  if (canViewAllTables(staff)) return staff;

  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId: staff.restaurantId },
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
  if (canViewAllTables(staff)) return { staff, table: null };

  const table = await prisma.diningTable.findFirst({
    where: { id: tableId, restaurantId: staff.restaurantId },
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
