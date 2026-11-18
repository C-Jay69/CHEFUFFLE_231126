import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { corsOrigins, env } from './env.js';
import { AppError } from './errors.js';
import { initRealtime } from './realtime.js';
import { registerRoutes } from './routes/index.js';
import { calculateLaborPacing } from './services/labor-engine.js';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
  },
  bodyLimit: 2 * 1024 * 1024,
});

await app.register(cors, {
  origin: corsOrigins.length ? corsOrigins : true,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
});
await app.register(formbody);

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Validation failed',
      details: error.flatten(),
    });
  }
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      details: error.details,
    });
  }
  const err = error as Error & { statusCode?: number; code?: string };
  if (err.code === 'P2025') {
    return reply.status(404).send({ error: 'Resource not found' });
  }
  if (err.code === 'P2002') {
    return reply.status(409).send({ error: 'A unique constraint was violated' });
  }
  if (err.code === 'P2003') {
    return reply.status(400).send({ error: 'Invalid related record' });
  }
  const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (statusCode >= 500) request.log.error({ err }, 'Unhandled request failure');
  return reply.status(statusCode).send({
    error: statusCode >= 500 ? 'Internal server error' : err.message,
  });
});

app.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    error: `Route ${request.method} ${request.url} not found`,
  });
});

await registerRoutes(app);

const io = await initRealtime(app.server);
app.log.info(
  `Realtime gateway ready · /socket.io · Redis ${env.REDIS_URL ? 'adapter' : 'in-process'}`,
);

// Emit live labor pacing every 60 seconds (and after every sale).
const laborInterval = setInterval(() => {
  void calculateLaborPacing(env.RESTAURANT_ID).catch((error) =>
    app.log.warn({ error }, 'periodic labor pacing failed'),
  );
}, 60_000);
laborInterval.unref?.();

async function shutdown(signal: string) {
  app.log.info(`${signal} received — shutting down`);
  clearInterval(laborInterval);
  await app.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  app.log.info(`SHIFT HAPPENS! API listening on http://localhost:${env.API_PORT}`);
  app.log.info(`REST endpoints under http://localhost:${env.API_PORT}/api`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
