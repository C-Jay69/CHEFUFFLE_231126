import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  reservationSchema,
  reservationUpdateSchema,
} from '@shift-happens/shared';
import { parse } from '../lib/validate.js';
import {
  checkAvailability,
  createReservation,
  listReservations,
  seatReservation,
  updateReservation,
} from '../services/reservation-engine.js';

const reservationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/reservations', async (request) => {
    const query = parse(
      z.object({
        date: z.string().optional(),
        status: z.string().optional(),
        search: z.string().optional(),
        view: z.string().optional(),
      }),
      request.query,
    );
    return listReservations(undefined, query);
  });

  app.get('/reservations/availability', async (request) => {
    const query = parse(
      z.object({
        time: z.string().optional(),
        partySize: z.coerce.number().int().min(1).max(40).optional(),
      }),
      request.query,
    );
    return checkAvailability(undefined, query);
  });

  app.post('/reservations', async (request, reply) => {
    const body = parse(reservationSchema, request.body);
    const reservation = await createReservation(body);
    return reply.code(201).send({ reservation });
  });

  app.patch('/reservations/:id', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(reservationUpdateSchema.partial(), request.body);
    return updateReservation(id, body);
  });

  app.post('/reservations/:id/seat', async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return seatReservation(id);
  });
};

export default reservationRoutes;
