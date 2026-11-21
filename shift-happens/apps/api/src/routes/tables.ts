import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  floorLayoutSchema,
  tableSeatSchema,
  tableStageSchema,
} from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
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
  app.get('/tables', async () => getTables());

  app.post('/tables', async (request, reply) => {
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
    return getTable(id);
  });

  app.patch('/tables/:id', async (request) => {
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
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return removeTable(id);
  });

  app.post('/tables/:id/seat', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(tableSeatSchema, request.body);
    const table = await seatTable(id, body);
    return { table };
  });

  app.patch('/tables/:id/stage', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(tableStageSchema, request.body);
    return setTableStage(id, body.stage, {
      triggeredBy: body.reason ?? 'MANUAL',
    });
  });

  app.post('/tables/:id/advance', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return advanceTableStage(id, 'FLOOR_MANAGER');
  });

  app.post('/tables/:id/reset', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return resetTable(id);
  });

  app.get('/floor-layout', async () => getTables());

  app.post('/floor-layout', async (request) => {
    const body = parse(floorLayoutSchema, request.body);
    return saveFloorLayout(body.tables);
  });
};

export default tableRoutes;
