import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createOrderSchema } from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import { requirePermission } from '../lib/staff-auth.js';
import {
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

  app.get('/orders', async (request) => {
    const query = parse(
      z.object({
        status: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }),
      request.query,
    );
    return listOrders(undefined, query);
  });

  app.get('/orders/:id', async (request) => {
    const { id } = parse(idParams, request.params);
    return getOrder(id);
  });

  app.post('/orders/:id/pay', async (request) => {
    await requirePermission(request, 'serve.pay');
    const { id } = parse(idParams, request.params);
    const body = parse(
      z.object({
        tip: z.number().min(0).max(5000).optional(),
        method: z.enum(['card', 'cash', 'gift_card', 'house']).optional(),
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
