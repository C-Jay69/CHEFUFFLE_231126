import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { broadcastSchema, shiftCreateSchema } from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import { calculateLaborPacing } from '../services/labor-engine.js';
import {
  approveSwap,
  broadcastEarlyCut,
  clockIn,
  clockOut,
  createShift,
  declineSwap,
  getForecast,
  getTimeClockLogs,
  listShifts,
} from '../services/scheduling-engine.js';

const schedulingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/shifts', async (request) => {
    const { date } = parse(
      z.object({ date: z.string().optional() }),
      request.query,
    );
    return listShifts(undefined, date ? new Date(date) : new Date());
  });

  app.post('/shifts', async (request, reply) => {
    const body = parse(shiftCreateSchema, request.body);
    const shift = await createShift(body);
    return reply.code(201).send({ shift });
  });

  app.post('/shifts/:id/clock-in', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return clockIn(id);
  });

  app.post('/shifts/:id/clock-out', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return clockOut(id);
  });

  app.get('/shifts/logs', async (request) => {
    const { limit } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }),
      request.query,
    );
    return getTimeClockLogs(undefined, limit ?? 30);
  });

  app.get('/labor/pacing', async () => calculateLaborPacing());

  app.get('/labor/forecast', async (request) => {
    const { date } = parse(
      z.object({ date: z.string().optional() }),
      request.query,
    );
    return getForecast(undefined, date ? new Date(date) : new Date());
  });

  app.post('/labor/broadcast-cut', async (request) => {
    const body = parse(
      broadcastSchema.partial().extend({ message: z.string().optional() }),
      request.body ?? {},
    );
    return broadcastEarlyCut(undefined, body.message);
  });

  app.post('/shifts/:id/approve-swap', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return approveSwap(id);
  });

  app.post('/shifts/:id/decline-swap', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return declineSwap(id);
  });
};

export default schedulingRoutes;
