import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../lib/validate.js';
import { clockStaff, listStaff, pinLogin } from '../services/auth-engine.js';

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/staff', async () => ({ staff: await listStaff() }));

  app.post('/auth/pin', async (request) => {
    const { pin } = parse(
      z.object({ pin: z.string().min(3).max(6) }),
      request.body,
    );
    return pinLogin(pin);
  });

  app.post('/auth/clock-in', async (request) => {
    const { staffId } = parse(
      z.object({ staffId: z.string().uuid() }),
      request.body,
    );
    return clockStaff(staffId, 'in');
  });

  app.post('/auth/clock-out', async (request) => {
    const { staffId } = parse(
      z.object({ staffId: z.string().uuid() }),
      request.body,
    );
    return clockStaff(staffId, 'out');
  });
};

export default authRoutes;
