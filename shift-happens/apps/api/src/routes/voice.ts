import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { voiceSimulateSchema } from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import { requirePermission } from '../lib/staff-auth.js';
import {
  answerUtterance,
  createKnowledgeEntry,
  deleteKnowledgeEntry,
  gatherTwiml,
  inboundTwiml,
  listCallLogs,
  listKnowledgeBase,
  simulateCall,
  updateKnowledgeEntry,
} from '../services/voice-agent.js';

const knowledgeSchema = z.object({
  category: z.string().min(1).max(100),
  title: z.string().min(1).max(255),
  content: z.string().min(1).max(5000),
});

const voiceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/voice/calls', async (request) => {
    // Call logs contain guest phone numbers and transcripts: manager only.
    await requirePermission(request, 'voice.manage');
    const { limit } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }),
      request.query,
    );
    return listCallLogs(undefined, limit ?? 30);
  });

  app.get('/voice/knowledge', async () => ({
    entries: await listKnowledgeBase(),
  }));

  app.post('/voice/knowledge', async (request, reply) => {
    await requirePermission(request, 'voice.manage');
    const body = parse(knowledgeSchema, request.body);
    const entry = await createKnowledgeEntry(body);
    return reply.code(201).send({ entry });
  });

  app.patch('/voice/knowledge/:id', async (request) => {
    await requirePermission(request, 'voice.manage');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(knowledgeSchema.partial(), request.body);
    const entry = await updateKnowledgeEntry(id, body);
    return { entry };
  });

  app.delete('/voice/knowledge/:id', async (request) => {
    await requirePermission(request, 'voice.manage');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return deleteKnowledgeEntry(id);
  });

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
