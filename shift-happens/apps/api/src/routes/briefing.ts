import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../lib/validate.js';
import {
  broadcastBiometricPolicy,
  getBriefing,
  signOffBriefing,
} from '../services/briefing-engine.js';

const briefingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/briefing', async () => getBriefing());

  app.post('/briefing/signoff/:shiftId', async (request) => {
    const { shiftId } = parse(
      z.object({ shiftId: z.string().uuid() }),
      request.params,
    );
    return signOffBriefing(shiftId);
  });

  app.post('/briefing/narrative', async () => {
    const briefing = await getBriefing();
    return {
      narrative: briefing.narrative,
      generatedAt: briefing.narrativeGeneratedAt,
      summary: briefing.summary,
    };
  });

  app.post('/briefing/biometric-broadcast', async () => broadcastBiometricPolicy());
};

export default briefingRoutes;
