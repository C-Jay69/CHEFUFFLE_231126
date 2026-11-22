import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketEventName,
} from '@shift-happens/shared';
import { env, corsOrigins } from './env.js';

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents>;

let io: RealtimeServer | null = null;
let initialized = false;

export async function initRealtime(httpServer: HttpServer): Promise<RealtimeServer> {
  if (io) return io;
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    path: '/socket.io',
  });

  if (env.REDIS_URL) {
    try {
      const [{ createAdapter }, { default: Redis }] = await Promise.all([
        import('@socket.io/redis-adapter'),
        import('ioredis'),
      ]);
      const pubClient = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('✓ Socket.io Redis adapter connected');
    } catch (error) {
      console.warn('! Redis adapter unavailable, falling back to in-process pub/sub', error);
    }
  }

  io.on('connection', (socket) => {
    const queryRestaurant = String(socket.handshake.query.restaurantId ?? '');
    const restaurantId = queryRestaurant || env.RESTAURANT_ID;
    void socket.join(`restaurant:${restaurantId}`);
    socket.join('kds:station:all');

    socket.on('restaurant:join', (id) => {
      if (id) void socket.join(`restaurant:${id}`);
    });
    socket.on('kds:join', (station) => {
      if (station) void socket.join(`kds:station:${station}`);
    });
    socket.emit('BRIEFING_UPDATED', { connected: true, restaurantId, timestamp: new Date().toISOString() });
  });

  initialized = true;
  return io;
}

export function getRealtime(): RealtimeServer | null {
  return io;
}

export function isRealtimeReady(): boolean {
  return initialized;
}

type UntypedEmitter = { emit: (event: string, payload: unknown) => void };

export function emitRestaurant(
  event: SocketEventName,
  payload: Record<string, unknown> | object,
  restaurantId = env.RESTAURANT_ID,
): void {
  if (!io) return;
  (io.to(`restaurant:${restaurantId}`) as unknown as UntypedEmitter).emit(event, payload);
}

export function emitStation(
  station: string,
  event: SocketEventName,
  payload: Record<string, unknown> | object,
): void {
  if (!io) return;
  const payloadAny = payload as object;
  for (const room of [`kds:station:${station}`, 'kds:station:all']) {
    (io.to(room) as unknown as UntypedEmitter).emit(event, payloadAny);
  }
}
