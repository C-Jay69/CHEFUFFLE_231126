import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { USER_ROLES } from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import { requirePermission } from '../lib/staff-auth.js';
import {
  createStaffMember,
  deactivateStaffMember,
  listTeam,
  updateStaffMember,
} from '../services/staff-engine.js';

const roleSchema = z.enum(USER_ROLES);

const staffBody = z.object({
  name: z.string().min(1).max(100),
  role: roleSchema,
  pin: z
    .string()
    .regex(/^\d{4,8}$/, 'PIN must be 4-8 digits')
    .optional(),
  hourlyRate: z.number().min(0).max(500).optional(),
  phone: z.string().max(30).nullish(),
  email: z.string().max(120).nullish(),
  address: z.string().max(240).nullish(),
  sin: z.string().max(20).nullish(),
  startDate: z.string().nullish(),
});

const staffRoutes: FastifyPluginAsync = async (app) => {
  app.get('/staff', async (request) => {
    // Full staff records include phone, address and masked SIN: manager only.
    await requirePermission(request, 'staff.manage');
    const { includeInactive } = parse(
      z.object({ includeInactive: z.enum(['true', 'false']).optional() }),
      request.query,
    );
    return {
      staff: await listTeam(undefined, {
        includeInactive: includeInactive === 'true',
      }),
    };
  });

  app.post('/staff', async (request, reply) => {
    await requirePermission(request, 'staff.manage');
    const body = parse(staffBody, request.body);
    const member = await createStaffMember(body);
    return reply.code(201).send({ staff: member });
  });

  app.patch('/staff/:id', async (request) => {
    await requirePermission(request, 'staff.manage');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(
      staffBody.partial().extend({ isActive: z.boolean().optional() }),
      request.body,
    );
    const member = await updateStaffMember(id, body);
    return { staff: member };
  });

  app.delete('/staff/:id', async (request) => {
    await requirePermission(request, 'staff.manage');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const member = await deactivateStaffMember(id);
    return { staff: member };
  });
};

export default staffRoutes;
