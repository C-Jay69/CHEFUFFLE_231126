import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { voiceSimulateSchema } from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import {
  answerUtterance,
  gatherTwiml,
  inboundTwiml,
  listCallLogs,
  listKnowledgeBase,
  simulateCall,
} from '../services/voice-agent.js';

const voiceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/voice/calls', async (request) => {
    const { limit } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }),
      request.query,
    );
    return listCallLogs(undefined, limit ?? 30);
  });

  app.get('/voice/knowledge', async () => ({
    entries: await listKnowledgeBase(),
  }));

  app.post('/voice/ask', async (request) => {
    const body = parse(
      z.object({
        utterance: z.string().min(1).max(1000),
        partySize: z.number().int().min(1).max(40).optional(),
        reservationTime: z.string().datetime().optional(),
      }),
      request.body,
    );
    return answerUtterance(body.utterance, undefined, {
      partySize: body.partySize,
      reservationTime: body.reservationTime,
    });
  });

  app.post('/voice/simulate', async (request) => {
    const body = parse(voiceSimulateSchema, request.body);
    return simulateCall(body);
  });

  app.post('/voice/inbound', async (request, reply) => {
    void request.body;
    return reply.type('text/xml').send(inboundTwiml());
  });

  app.post('/voice/gather', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string>;
    const speech = body.SpeechResult || body.speech || 'I would like to book a table.';
    const callerPhone = body.From || body.Caller || '+15550001111';
    const xml = await gatherTwiml(speech, callerPhone);
    return reply.type('text/xml').send(xml);
  });

  app.get('/voice/twilio-status', async () => ({
    configured: Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_PHONE_NUMBER,
    ),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    webhookPath: '/api/voice/inbound',
  }));
};

export default voiceRoutes;
