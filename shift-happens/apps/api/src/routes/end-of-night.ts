import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../lib/validate.js';
import { getEndOfNight } from '../services/end-of-night-engine.js';

const endOfNightRoutes: FastifyPluginAsync = async (app) => {
  app.get('/end-of-night', async (request) => {
    const { date } = parse(
      z.object({ date: z.string().optional() }),
      request.query,
    );
    return getEndOfNight(undefined, date);
  });
};

export default endOfNightRoutes;
