'use client';

import { io, type Socket } from 'socket.io-client';
import { API_BASE } from './api';

export const RESTAURANT_ID =
  process.env.NEXT_PUBLIC_RESTAURANT_ID || '11111111-1111-4111-8111-111111111111';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      query: { restaurantId: RESTAURANT_ID },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      timeout: 8000,
    });
    socket.on('connect', () => {
      socket?.emit('restaurant:join', RESTAURANT_ID);
    });
    socket.on('connect_error', () => {
      // A quiet retry — the UI keeps working against REST while reconnecting.
    });
  }
  return socket;
}

export function listen<T = unknown>(
  event: string,
  handler: (payload: T) => void,
): () => void {
  const s = getSocket();
  const wrapped = (payload: T) => handler(payload);
  s.on(event, wrapped as never);
  return () => {
    s.off(event, wrapped as never);
  };
}

export function joinKdsStation(station: string) {
  getSocket().emit('kds:join', station);
}

export function connectionState(): 'connected' | 'connecting' | 'offline' {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
  if (!socket) return 'connecting';
  return socket.connected ? 'connected' : 'connecting';
}
