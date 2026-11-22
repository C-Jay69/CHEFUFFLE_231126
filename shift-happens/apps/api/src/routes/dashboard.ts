import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@shift-happens/db';
import { getDashboardSummary } from '../services/dashboard-engine.js';
import { getStationCounts } from '../services/kds-engine.js';

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/dashboard/summary', async () => getDashboardSummary());

  app.get('/dashboard/stations', async () => getStationCounts());

  app.get('/bootstrap', async () => {
    const summary = await getDashboardSummary();
    return { summary };
  });
};

export default dashboardRoutes;
