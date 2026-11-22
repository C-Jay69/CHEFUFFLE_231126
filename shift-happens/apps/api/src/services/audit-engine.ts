import { prisma, type Prisma } from '@shift-happens/db';

export const AUDIT_DEFAULT_LIMIT = 100;
export const AUDIT_MAX_LIMIT = 500;

export interface AuditQuery {
  entity?: string;
  entityId?: string;
  actorStaffId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

/**
 * Read the append-only audit trail for one restaurant.
 *
 * The restaurant scope is always applied from the authenticated staff member,
 * never from an untrusted query parameter, so one tenant can never read another
 * tenant's audit history.
 */
export async function listAudit(restaurantId: string, query: AuditQuery = {}) {
  const where: Prisma.AuditLogWhereInput = { restaurantId };

  if (query.entity) where.entity = query.entity;
  if (query.entityId) where.entityId = query.entityId;
  if (query.actorStaffId) where.actorStaffId = query.actorStaffId;
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  const limit = Math.min(
    Math.max(query.limit ?? AUDIT_DEFAULT_LIMIT, 1),
    AUDIT_MAX_LIMIT,
  );

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      actor: { select: { id: true, name: true, role: true } },
    },
  });
}
