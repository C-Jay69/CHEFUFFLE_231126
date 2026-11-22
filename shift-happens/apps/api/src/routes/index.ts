import type { FastifyInstance } from 'fastify';
import architectRoutes from './architect.js';
import authRoutes from './auth.js';
import briefingRoutes from './briefing.js';
import dashboardRoutes from './dashboard.js';
import endOfNightRoutes from './end-of-night.js';
import floorPlanRoutes from './floor-plan.js';
import inventoryRoutes from './inventory.js';
import kdsRoutes from './kds.js';
import menuRoutes from './menu.js';
import posRoutes from './pos.js';
import reservationsRoutes from './reservations.js';
import schedulingRoutes from './scheduling.js';
import staffRoutes from './staff.js';
import tablesRoutes from './tables.js';
import trainingRoutes from './training.js';
import voiceRoutes from './voice.js';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(posRoutes, { prefix: '/api' });
  await app.register(menuRoutes, { prefix: '/api' });
  await app.register(kdsRoutes, { prefix: '/api' });
  await app.register(tablesRoutes, { prefix: '/api' });
  await app.register(floorPlanRoutes, { prefix: '/api' });
  await app.register(inventoryRoutes, { prefix: '/api' });
  await app.register(reservationsRoutes, { prefix: '/api' });
  await app.register(schedulingRoutes, { prefix: '/api' });
  await app.register(briefingRoutes, { prefix: '/api' });
  await app.register(trainingRoutes, { prefix: '/api' });
  await app.register(architectRoutes, { prefix: '/api' });
  await app.register(voiceRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(staffRoutes, { prefix: '/api' });
  await app.register(endOfNightRoutes, { prefix: '/api' });
  await app.register(dashboardRoutes, { prefix: '/api' });
}
