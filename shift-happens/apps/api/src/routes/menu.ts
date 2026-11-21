import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../lib/validate.js';
import { requirePermission } from '../lib/staff-auth.js';
import { listMenu, toggleMenuAvailability } from '../services/menu-engine.js';

const availabilitySchema = z.object({
  is86ed: z.boolean(),
  reason: z.string().max(300).optional(),
});

const menuRoutes: FastifyPluginAsync = async (app) => {
  app.get('/menu', async () => listMenu());

  app.patch('/menu/:id/availability', async (request) => {
    await requirePermission(request, 'menu.manage');
    const { id } = parse(
      z.object({ id: z.string().uuid() }),
      request.params,
    );
    const body = parse(availabilitySchema, request.body);
    return toggleMenuAvailability(id, body.is86ed, body.reason);
  });
};

export default menuRoutes;
