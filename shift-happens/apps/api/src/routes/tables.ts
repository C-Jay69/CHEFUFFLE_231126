import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  floorLayoutSchema,
  tableSeatSchema,
  tableStageSchema,
} from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import {
  canViewAllTables,
  currentStaff,
  requirePermission,
  requireTableAccess,
} from '../lib/staff-auth.js';
import { forbidden } from '../errors.js';
import { permissionsForRole } from '@shift-happens/shared';
import { closeTable } from '../services/table-close-engine.js';
import {
  advanceTableStage,
  createTable,
  getTable,
  getTables,
  removeTable,
  resetTable,
  saveFloorLayout,
  seatTable,
  setTableStage,
  updateTable,
} from '../services/stage-engine.js';

const tableRoutes: FastifyPluginAsync = async (app) => {
  app.get('/tables', async (request) => {
    const staff = await currentStaff(request);
    return getTables(undefined, {
      staffId: staff?.id ?? null,
      viewAll: canViewAllTables(staff),
    });
  });

  app.post('/tables', async (request, reply) => {
    await requirePermission(request, 'floor.manage');
    const body = parse(
      z.object({
        tableNumber: z.string().min(1).max(20),
        zone: z.string().max(50).optional(),
        capacity: z.number().int().min(1).max(40).optional(),
        shape: z.enum(['square', 'rectangle', 'circle', 'booth']).optional(),
        posX: z.number().min(0).max(1000).optional(),
        posY: z.number().min(0).max(1000).optional(),
        rotation: z.number().int().optional(),
      }),
      request.body,
    );
    const table = await createTable(body);
    return reply.code(201).send({ table });
  });

  app.get('/tables/:id', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const staff = await currentStaff(request);
    const table = await getTable(id);
    if (staff && !canViewAllTables(staff)) {
      const owns =
        table.serverId === staff.id ||
        table.activeOrder?.serverId === staff.id ||
        table.status === 'available';
      if (!owns) {
        throw forbidden('This table belongs to another server. Ask a manager.');
      }
    }
    return table;
  });

  app.patch('/tables/:id', async (request) => {
    await requirePermission(request, 'floor.manage');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(
      z.object({
        tableNumber: z.string().min(1).max(20).optional(),
        zone: z.string().max(50).optional(),
        capacity: z.number().int().min(1).max(40).optional(),
        shape: z.enum(['square', 'rectangle', 'circle', 'booth']).optional(),
        posX: z.number().min(0).max(1000).optional(),
        posY: z.number().min(0).max(1000).optional(),
        rotation: z.number().int().optional(),
        isActive: z.boolean().optional(),
      }),
      request.body,
    );
    return updateTable(id, body);
  });

  app.delete('/tables/:id', async (request) => {
    await requirePermission(request, 'floor.manage');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return removeTable(id);
  });

  app.post('/tables/:id/seat', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const { staff } = await requireTableAccess(request, id, 'floor.seat');
    const body = parse(tableSeatSchema, request.body);
    // Only a service role takes ownership by seating; a host seats without
    // claiming the table, so any server can pick it up.
    const claimsTable = Boolean(
      staff && permissionsForRole(staff.role).includes('serve.order'),
    );
    const table = await seatTable(id, {
      ...body,
      serverId: body.serverId ?? (claimsTable ? staff!.id : null),
    });
    return { table };
  });

  app.patch('/tables/:id/stage', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    await requireTableAccess(request, id, 'floor.seat');
    const body = parse(tableStageSchema, request.body);
    return setTableStage(id, body.stage, {
      triggeredBy: body.reason ?? 'MANUAL',
    });
  });

  app.post('/tables/:id/advance', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    await requireTableAccess(request, id, 'floor.seat');
    return advanceTableStage(id, 'FLOOR_MANAGER');
  });

  app.post('/tables/:id/reset', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    await requireTableAccess(request, id, 'floor.seat');
    return resetTable(id);
  });

  app.post('/tables/:id/close', async (request) => {
    const staff = await requirePermission(request, 'floor.close');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(
      z.object({
        action: z.enum(['settle', 'void', 'clear']),
        method: z.enum(['card', 'cash', 'gift_card', 'house']).optional(),
        reason: z.string().trim().max(300).optional(),
        refund: z.boolean().optional(),
      }),
      request.body ?? {},
    );
    return closeTable(id, { ...body, actorStaffId: staff?.id ?? null });
  });

  app.get('/floor-layout', async () => getTables());

  app.post('/floor-layout', async (request) => {
    await requirePermission(request, 'floor.manage');
    const body = parse(floorLayoutSchema, request.body);
    return saveFloorLayout(body.tables);
  });
};

export default tableRoutes;
