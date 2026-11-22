import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@shift-happens/db';
import { parse } from '../lib/validate.js';
import { extractBearerToken, currentSession } from '../lib/staff-auth.js';
import { AppError } from '../errors.js';
import {
  clockStaff,
  listStaff,
  logoutSession,
  pinLogin,
  sessionPayload,
} from '../services/auth-engine.js';

const pinSchema = z.object({
  pin: z
    .string()
    .regex(/^\d+$/, 'PIN must contain digits only.')
    .min(PIN_MIN_LENGTH, `PIN must be at least ${PIN_MIN_LENGTH} digits.`)
    .max(PIN_MAX_LENGTH, `PIN must be at most ${PIN_MAX_LENGTH} digits.`),
});

const authRoutes: FastifyPluginAsync = async (app) => {
  // Protected by the global guard (not on the public allow-list).
  app.get('/auth/staff', async () => ({ staff: await listStaff() }));

  // Public: verifies the PIN and issues a bearer session.
  app.post('/auth/pin', async (request) => {
    const { pin } = parse(pinSchema, request.body);
    const userAgent = request.headers['user-agent'];
    return pinLogin(pin, {
      ipAddress: request.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    });
  });

  app.post('/auth/logout', async (request) => {
    const token = extractBearerToken(request);
    const revoked = token
      ? await logoutSession(token, { ipAddress: request.ip })
      : false;
    return { ok: true, revoked };
  });

  app.get('/auth/me', async (request) => {
    const resolved = await currentSession(request);
    if (!resolved) {
      throw new AppError(401, 'Authentication required. Sign in again.');
    }
    return sessionPayload(resolved.staff, resolved.session.restaurantId);
  });

  // Identity always comes from the bearer session, never the request body.
  app.post('/auth/clock-in', async (request) => {
    const resolved = await currentSession(request);
    if (!resolved) {
      throw new AppError(401, 'Authentication required. Sign in again.');
    }
    return clockStaff(
      resolved.staff.id,
      'in',
      resolved.session.restaurantId,
    );
  });

  app.post('/auth/clock-out', async (request) => {
    const resolved = await currentSession(request);
    if (!resolved) {
      throw new AppError(401, 'Authentication required. Sign in again.');
    }
    return clockStaff(
      resolved.staff.id,
      'out',
      resolved.session.restaurantId,
    );
  });
};

export default authRoutes;
