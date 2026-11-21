import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { stockAdjustSchema } from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import { requirePermission } from '../lib/staff-auth.js';
import {
  adjustStock,
  approvePurchaseOrder,
  get86List,
  getPurchaseOrders,
  listIngredients,
  listStockTransactions,
} from '../services/inventory-engine.js';

const inventoryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/inventory', async (request) => {
    const query = parse(
      z.object({
        category: z.string().optional(),
        search: z.string().optional(),
      }),
      request.query,
    );
    return listIngredients(undefined, query);
  });

  app.get('/inventory/transactions', async (request) => {
    const { limit } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }),
      request.query,
    );
    return listStockTransactions(undefined, limit ?? 40);
  });

  app.post('/inventory/adjust', async (request) => {
    await requirePermission(request, 'inventory.manage');
    const body = parse(stockAdjustSchema, request.body);
    return adjustStock(body);
  });

  app.get('/inventory/purchase-orders', async () => getPurchaseOrders());

  app.post('/inventory/purchase-orders/approve', async (request) => {
    await requirePermission(request, 'inventory.manage');
    const body = parse(
      z.object({
        supplier: z.string().min(1),
        ingredientIds: z.array(z.string().uuid()).optional(),
      }),
      request.body,
    );
    return approvePurchaseOrder(body.supplier, body.ingredientIds);
  });

  app.get('/inventory/86', async () => get86List());
};

export default inventoryRoutes;
