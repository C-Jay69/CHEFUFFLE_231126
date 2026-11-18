import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../lib/validate.js';
import { listStaff, pinLogin } from '../services/auth-engine.js';

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/staff', async () => ({ staff: await listStaff() }));

  app.post('/auth/pin', async (request) => {
    const { pin } = parse(
      z.object({ pin: z.string().min(3).max(6) }),
      request.body,
    );
    return pinLogin(pin);
  });
};

export default authRoutes;
