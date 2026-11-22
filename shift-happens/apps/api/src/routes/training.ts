import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  trainingEnrollSchema,
  trainingProgressSchema,
} from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import {
  enrollTrainee,
  listTraining,
  updateTrainingProgress,
} from '../services/training-engine.js';

const trainingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/training', async () => listTraining());

  app.post('/training/enroll', async (request, reply) => {
    const body = parse(trainingEnrollSchema, request.body);
    const result = await enrollTrainee(body);
    return reply.code(201).send(result);
  });

  app.post('/training/progress', async (request) => {
    const body = parse(trainingProgressSchema, request.body);
    return updateTrainingProgress(body);
  });
};

export default trainingRoutes;
