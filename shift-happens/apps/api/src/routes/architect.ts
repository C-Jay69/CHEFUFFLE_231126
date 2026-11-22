import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { floorLayoutSchema, mediaPublishSchema } from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import {
  listArchitectAssets,
  publishAllMedia,
  publishMedia,
  syncVoiceKnowledge,
} from '../services/architect-engine.js';
import { saveFloorLayout } from '../services/stage-engine.js';

const architectRoutes: FastifyPluginAsync = async (app) => {
  app.get('/architect', async () => listArchitectAssets());

  app.post('/architect/publish', async (request) => {
    const body = parse(mediaPublishSchema, request.body);
    return publishMedia(body);
  });

  app.post('/architect/publish-all', async () => publishAllMedia());

  app.post('/architect/sync-voice', async () => syncVoiceKnowledge());

  app.post('/architect/layout', async (request) => {
    const body = parse(floorLayoutSchema, request.body);
    const tables = await saveFloorLayout(body.tables);
    return { tables, savedAt: new Date().toISOString() };
  });
};

export default architectRoutes;
