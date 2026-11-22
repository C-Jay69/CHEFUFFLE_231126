import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@shift-happens/db';
import { AppError } from '../src/errors.js';
import { recordAudit } from '../src/lib/audit.js';
import auditRoutes from '../src/routes/audit.js';
import { listAudit } from '../src/services/audit-engine.js';

/**
 * The audit trail must survive a write/read round-trip, carry actor + action +
 * entity + reason, and never leak rows across restaurants. The HTTP checks also
 * prove that unauthenticated and non-manager callers are rejected.
 */
describe('audit trail', () => {
  const restaurantId = randomUUID();
  const otherRestaurantId = randomUUID();
  const managerId = randomUUID();
  const serverId = randomUUID();
  const otherManagerId = randomUUID();
  const sharedEntityId = randomUUID();

  let app: FastifyInstance;

  beforeAll(async () => {
    const stale = await prisma.restaurant.findMany({
      where: { name: { in: ['Vitest Audit Tenant', 'Vitest Audit Other Tenant'] } },
      select: { id: true },
    });
    for (const tenant of stale) {
      await prisma.restaurant.delete({ where: { id: tenant.id } }).catch(() => undefined);
    }

    await prisma.restaurant.createMany({
      data: [
        { id: restaurantId, name: 'Vitest Audit Tenant', address: 'Audit St', phone: '+1 555-0100' },
        {
          id: otherRestaurantId,
          name: 'Vitest Audit Other Tenant',
          address: 'Other St',
          phone: '+1 555-0101',
        },
      ],
    });
    await prisma.staff.createMany({
      data: [
        {
          id: managerId,
          restaurantId,
          name: 'Audit Manager',
          role: 'general_manager',
          hourlyRate: 40,
        },
        {
          id: serverId,
          restaurantId,
          name: 'Audit Server',
          role: 'server',
          hourlyRate: 18,
        },
        {
          id: otherManagerId,
          restaurantId: otherRestaurantId,
          name: 'Other Manager',
          role: 'owner',
          hourlyRate: 50,
        },
      ],
    });

    await recordAudit({
      restaurantId,
      actorStaffId: managerId,
      action: 'order.void',
      entity: 'order',
      entityId: sharedEntityId,
      reason: 'Manager approved a void after guest complaint',
      before: { status: 'paid' },
      after: { status: 'void' },
    });
    await recordAudit({
      restaurantId,
      actorStaffId: serverId,
      action: 'staff.update',
      entity: 'staff',
      entityId: managerId,
      reason: 'Contact details corrected',
    });
    // Same entity id in a second tenant — must never appear in tenant one.
    await recordAudit({
      restaurantId: otherRestaurantId,
      actorStaffId: otherManagerId,
      action: 'order.void',
      entity: 'order',
      entityId: sharedEntityId,
      reason: 'Other tenant row',
    });

    app = Fastify();
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      return reply.status(500).send({ error: 'Internal server error' });
    });
    await app.register(auditRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.restaurant
      .deleteMany({ where: { id: { in: [restaurantId, otherRestaurantId] } } })
      .catch(() => undefined);
  });

  it('writes an audit row and reads it back with actor, action, entity and reason', async () => {
    const rows = await listAudit(restaurantId, {
      entity: 'order',
      entityId: sharedEntityId,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      restaurantId,
      actorStaffId: managerId,
      action: 'order.void',
      entity: 'order',
      entityId: sharedEntityId,
      reason: 'Manager approved a void after guest complaint',
      before: { status: 'paid' },
      after: { status: 'void' },
    });
    expect(rows[0].actor?.id).toBe(managerId);
    expect(rows[0].actor?.name).toBe('Audit Manager');
  });

  it('scopes reads to the restaurant, even for an identical entity id', async () => {
    const own = await listAudit(restaurantId, { entityId: sharedEntityId });
    expect(own).toHaveLength(1);
    expect(own[0].restaurantId).toBe(restaurantId);
    expect(own[0].reason).not.toBe('Other tenant row');

    const other = await listAudit(otherRestaurantId, { entityId: sharedEntityId });
    expect(other).toHaveLength(1);
    expect(other[0].restaurantId).toBe(otherRestaurantId);
    expect(other[0].actorStaffId).toBe(otherManagerId);

    const allOwn = await listAudit(restaurantId);
    expect(allOwn.length).toBeGreaterThanOrEqual(2);
    expect(allOwn.every((row) => row.restaurantId === restaurantId)).toBe(true);
  });

  it('filters by actor and respects limit', async () => {
    const actorRows = await listAudit(restaurantId, { actorStaffId: managerId });
    expect(actorRows).toHaveLength(1);
    expect(actorRows[0].action).toBe('order.void');

    const limited = await listAudit(restaurantId, { limit: 1 });
    expect(limited).toHaveLength(1);
  });

  it('serves GET /api/audit to a manager with the restaurant scoped rows', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/audit?entity=order&entityId=${sharedEntityId}`,
      headers: { 'x-staff-id': managerId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      audit: Array<Record<string, unknown>>;
      count: number;
    };
    expect(body.count).toBe(1);
    expect(body.audit).toHaveLength(1);
    expect(body.audit[0]).toMatchObject({
      restaurantId,
      actorStaffId: managerId,
      action: 'order.void',
      entity: 'order',
      entityId: sharedEntityId,
      reason: 'Manager approved a void after guest complaint',
    });
  });

  it('rejects unauthenticated callers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/audit' });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: expect.stringContaining('Sign in') });
  });

  it('rejects authenticated staff without staff.manage', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/audit',
      headers: { 'x-staff-id': serverId },
    });
    expect(response.statusCode).toBe(403);
  });
});
