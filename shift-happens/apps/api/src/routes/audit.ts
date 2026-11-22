import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest, forbidden } from '../errors.js';
import { parse } from '../lib/validate.js';
import { requirePermission } from '../lib/staff-auth.js';
import {
  AUDIT_MAX_LIMIT,
  listAudit,
  type AuditQuery,
} from '../services/audit-engine.js';

const auditQuerySchema = z.object({
  entity: z.string().trim().min(1).max(80).optional(),
  entityId: z.string().trim().min(1).max(80).optional(),
  actorStaffId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(AUDIT_MAX_LIMIT).optional(),
});

const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get('/audit', async (request) => {
    // `staff.manage` includes owners and general managers. requirePermission
    // returns null when no staff identity was supplied, so reject that case
    // explicitly: the audit trail is never public.
    const staff = await requirePermission(request, 'staff.manage');
    if (!staff) {
      throw forbidden('Sign in with a manager account to view the audit log.');
    }

    const query = parse(auditQuerySchema, request.query);
    if (query.from && query.to && query.from > query.to) {
      throw badRequest('`from` must be earlier than or equal to `to`.');
    }

    const audit = await listAudit(staff.restaurantId, query as AuditQuery);
    return { audit, count: audit.length };
  });
};

export default auditRoutes;
