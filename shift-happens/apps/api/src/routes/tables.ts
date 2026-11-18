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
  getTable,
  getTables,
  resetTable,
  saveFloorLayout,
  seatTable,
  setTableStage,
} from '../services/stage-engine.js';

const tableRoutes: FastifyPluginAsync = async (app) => {
  app.get('/tables', async () => getTables());

  app.get('/tables/:id', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return getTable(id);
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
