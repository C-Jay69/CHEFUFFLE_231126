import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createOrderSchema,
  orderItemInputSchema,
  orderPaymentSchema,
  payOrderSchema,
  refundSchema,
  voidOrderSchema,
} from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import {
  canViewAllTables,
  currentStaff,
  requireOrderAccess,
  requirePermission,
} from '../lib/staff-auth.js';
import { forbidden } from '../errors.js';
import {
  addOrderPayment,
  appendOrderItems,
  createOrder,
  getOrder,
  getOrderByNumber,
  getRestaurantConfig,
  listOrders,
  payOrder,
  refundOrder,
  reopenOrder,
  voidOrder,
} from '../services/pos-engine.js';

const idParams = z.object({ id: z.string().uuid() });

/** Accept `Idempotency-Key` (preferred) or `idempotencyKey` in the body. */
function idempotencyKeyFrom(
  request: FastifyRequest,
  body?: { idempotencyKey?: string },
): string | undefined {
  const header = request.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.trim() || body?.idempotencyKey?.trim() || undefined;
}

const posRoutes: FastifyPluginAsync = async (app) => {
  app.get('/pos/config', async () => getRestaurantConfig());

  app.post('/orders', async (request, reply) => {
    await requirePermission(request, 'serve.order');
    const body = parse(createOrderSchema, request.body);
    const result = await createOrder(body);
    return reply.code(201).send(result);
  });

  app.post('/orders/:id/items', async (request) => {
    const { id } = parse(idParams, request.params);
    await requireOrderAccess(request, id, 'serve.order');
    const body = parse(
      z.object({
        items: z.array(orderItemInputSchema).min(1),
        allergyNotes: z.string().max(1000).optional().nullable(),
        sendToKitchen: z.boolean().default(true),
        autoGratuity: z.boolean().default(false),
      }),
      request.body,
    );
    return appendOrderItems(id, body);
  });

  app.get('/orders', async (request) => {
    const staff = await currentStaff(request);
    const query = parse(
      z.object({
        status: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }),
      request.query,
    );
    return listOrders(undefined, {
      ...query,
      ...(staff && !canViewAllTables(staff) ? { serverId: staff.id } : {}),
    });
  });

  app.post('/orders/:id/payments', async (request) => {
    const { id } = parse(idParams, request.params);
    const staff = await requireOrderAccess(request, id, 'serve.pay');
    const body = parse(orderPaymentSchema, request.body);
    return addOrderPayment(
      id,
      { ...body, idempotencyKey: idempotencyKeyFrom(request, body) },
      undefined,
      { actorStaffId: staff?.id ?? null },
    );
  });

  app.get('/orders/by-number/:number', async (request) => {
    const { number } = parse(
      z.object({ number: z.coerce.number().int().positive() }),
      request.params,
    );
    const staff = await currentStaff(request);
    const order = await getOrderByNumber(number);
    if (staff && !canViewAllTables(staff) && order.serverId !== staff.id) {
      throw forbidden('This check belongs to another server. Ask a manager.');
    }
    return order;
  });

  app.post('/orders/:id/reopen', async (request) => {
    const { id } = parse(idParams, request.params);
    const staff = await requirePermission(request, 'orders.void');
    return reopenOrder(id, undefined, { actorStaffId: staff?.id ?? null });
  });

  app.get('/orders/:id', async (request) => {
    const { id } = parse(idParams, request.params);
    const staff = await currentStaff(request);
    const order = await getOrder(id);
    if (staff && !canViewAllTables(staff) && order.serverId !== staff.id) {
      throw forbidden('This check belongs to another server. Ask a manager.');
    }
    return order;
  });

  app.post('/orders/:id/pay', async (request) => {
    const { id } = parse(idParams, request.params);
    const staff = await requireOrderAccess(request, id, 'serve.pay');
    const body = parse(payOrderSchema, request.body ?? {});
    return payOrder(
      id,
      { ...body, idempotencyKey: idempotencyKeyFrom(request, body) },
      undefined,
      { actorStaffId: staff?.id ?? null },
    );
  });

  app.post('/orders/:id/refunds', async (request) => {
    const { id } = parse(idParams, request.params);
    const staff = await requirePermission(request, 'orders.void');
    const body = parse(refundSchema, request.body);
    return refundOrder(
      id,
      { ...body, idempotencyKey: idempotencyKeyFrom(request, body) },
      undefined,
      { actorStaffId: staff?.id ?? null },
    );
  });

  app.post('/orders/:id/void', async (request) => {
    const staff = await requirePermission(request, 'orders.void');
    const { id } = parse(idParams, request.params);
    const body = parse(voidOrderSchema, request.body ?? {});
    return voidOrder(id, body.reason, undefined, {
      actorStaffId: staff?.id ?? null,
      refund: body.refund,
    });
  });
};

export default posRoutes;
