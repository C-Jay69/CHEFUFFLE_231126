import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createOrderSchema, orderItemInputSchema } from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import {
  canViewAllTables,
  currentStaff,
  requireOrderAccess,
  requirePermission,
} from '../lib/staff-auth.js';
import { forbidden } from '../errors.js';
import {
  appendOrderItems,
  createOrder,
  getOrder,
  listOrders,
  payOrder,
  voidOrder,
} from '../services/pos-engine.js';

const idParams = z.object({ id: z.string().uuid() });

const posRoutes: FastifyPluginAsync = async (app) => {
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
    await requireOrderAccess(request, id, 'serve.pay');
    const body = parse(
      z.object({
        tip: z.number().min(0).max(5000).optional(),
        method: z.enum(['card', 'cash', 'gift_card', 'house']).optional(),
        cardBrand: z
          .enum(['visa', 'mastercard', 'amex', 'debit', 'other'])
          .optional(),
      }),
      request.body ?? {},
    );
    return payOrder(id, body);
  });

  app.post('/orders/:id/void', async (request) => {
    await requirePermission(request, 'orders.void');
    const { id } = parse(idParams, request.params);
    const body = parse(
      z.object({ reason: z.string().max(300).optional() }),
      request.body ?? {},
    );
    return voidOrder(id, body.reason);
  });
};

export default posRoutes;
