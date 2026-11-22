import type { FastifyInstance } from 'fastify';
import {
  extractBearerToken,
  loadSessionByToken,
} from '../lib/staff-auth.js';

/**
 * Deny by default.
 *
 * Every `/api` route requires a valid bearer session except the exact public
 * allow-list below (health probe, PIN login and the two Twilio webhooks).
 * There is no header-based or client-id bypass. Non-`/api` surfaces (static
 * uploads, CORS preflight) are not API operations and are left to their own
 * handlers.
 */

interface PublicRoute {
  method: string;
  path: string;
}

const PUBLIC_ROUTES: PublicRoute[] = [
  { method: 'GET', path: '/api/health' },
  { method: 'POST', path: '/api/auth/pin' },
  { method: 'POST', path: '/api/voice/inbound' },
  { method: 'POST', path: '/api/voice/gather' },
];

function requestPath(url: string): string {
  const path = url.split('?')[0] ?? '/';
  // Treat a trailing slash as the same route for allow-list purposes.
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function isPublic(method: string, path: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => route.method === method && route.path === path,
  );
}

export function registerAuthGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    const method = request.method.toUpperCase();

    // CORS preflight carries no credentials and must reach @fastify/cors.
    if (method === 'OPTIONS') return;

    const path = requestPath(request.url);
    if (!path.startsWith('/api')) return;
    if (isPublic(method, path)) return;

    const token = extractBearerToken(request);
    if (!token) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const resolved = await loadSessionByToken(token);
    if (!resolved) {
      return reply
        .code(401)
        .send({ error: 'Session expired or invalid. Sign in again.' });
    }

    request.authSession = resolved;
  });
}
