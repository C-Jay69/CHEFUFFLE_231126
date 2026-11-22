import { prisma, type Prisma, type PrismaClient } from '@shift-happens/db';

export interface AuditInput {
  restaurantId: string;
  actorStaffId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
}

type AuditClient = Pick<PrismaClient, 'auditLog'>;

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

/**
 * Append an audit row for a privileged mutation.
 *
 * Audit writes must never break the business transaction they describe, so a
 * failure is logged rather than thrown. Call this with the transaction client
 * when the mutation is transactional so the audit row commits atomically.
 */
export async function recordAudit(
  input: AuditInput,
  client: AuditClient = prisma,
): Promise<void> {
  try {
    await client.auditLog.create({
      data: {
        restaurantId: input.restaurantId,
        actorStaffId: input.actorStaffId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: asJson(input.before),
        after: asJson(input.after),
        reason: input.reason ?? null,
        ipAddress: input.ipAddress ?? null,
        correlationId: input.correlationId ?? null,
      },
    });
  } catch (error) {
    console.warn('audit write failed', error);
  }
}
