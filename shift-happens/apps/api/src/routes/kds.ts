import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { bumpTicketSchema, KDS_STATIONS } from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import {
  bumpTicket,
  getRecentBumps,
  getStationCounts,
  getTicket,
  getTickets,
  simulateMainsBumpForTable,
} from '../services/kds-engine.js';

const kdsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/kds/tickets', async (request) => {
    const query = parse(
      z.object({ station: z.enum(KDS_STATIONS).optional() }),
      request.query,
    );
    const [tickets, counts] = await Promise.all([
      getTickets(query.station),
      getStationCounts(),
    ]);
    return { tickets, counts, station: query.station ?? 'expo' };
  });

  app.get('/kds/counts', async () => getStationCounts());

  app.get('/kds/tickets/:id', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return getTicket(id);
  });

  app.post('/kds/bump', async (request) => {
    const body = parse(bumpTicketSchema, request.body);
    return bumpTicket(body);
  });

  app.get('/kds/bumps', async (request) => {
    const { limit } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }),
      request.query,
    );
    return getRecentBumps(undefined, limit ?? 10);
  });

  app.post('/kds/simulate/:tableId', async (request) => {
    const { tableId } = parse(
      z.object({ tableId: z.string().uuid() }),
      request.params,
    );
    return simulateMainsBumpForTable(tableId);
  });
};

export default kdsRoutes;
