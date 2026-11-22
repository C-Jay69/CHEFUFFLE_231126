import type { CourseStage, KdsStation } from './constants';

export const SOCKET_EVENTS = {
  KDS_NEW_TICKET: 'KDS_NEW_TICKET',
  KDS_TICKET_UPDATED: 'KDS_TICKET_UPDATED',
  KDS_TICKET_BUMPED: 'KDS_TICKET_BUMPED',
  TABLE_STAGE_ADVANCED: 'TABLE_STAGE_ADVANCED',
  TABLE_UPDATED: 'TABLE_UPDATED',
  GLOBAL_86_ITEM_UPDATE: 'GLOBAL_86_ITEM_UPDATE',
  LOW_STOCK_ALERT: 'LOW_STOCK_ALERT',
  INVENTORY_UPDATED: 'INVENTORY_UPDATED',
  LABOR_PACING_UPDATE: 'LABOR_PACING_UPDATE',
  RESERVATION_CREATED: 'RESERVATION_CREATED',
  RESERVATION_UPDATED: 'RESERVATION_UPDATED',
  VOICE_CALL_COMPLETED: 'VOICE_CALL_COMPLETED',
  BRIEFING_UPDATED: 'BRIEFING_UPDATED',
  MEDIA_PUBLISHED: 'MEDIA_PUBLISHED',
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_VOIDED: 'ORDER_VOIDED',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export interface TableStageAdvancedPayload {
  event: 'TABLE_STAGE_ADVANCED';
  table_id: string;
  table_number: string;
  previous_stage: CourseStage;
  new_stage: CourseStage;
  triggered_by: string;
  ticket_id?: string;
  timestamp: string;
}

export interface KdsNewTicketPayload {
  event: 'KDS_NEW_TICKET';
  station: KdsStation;
  ticket: unknown;
  timestamp: string;
}

export interface Global86Payload {
  event: 'GLOBAL_86_ITEM_UPDATE';
  menuItemId: string;
  name: string;
  is86ed: boolean;
  reason?: string;
  source: 'stock' | 'manual' | 'voice_ai';
  timestamp: string;
}

export interface LowStockPayload {
  event: 'LOW_STOCK_ALERT';
  ingredientId: string;
  name: string;
  currentStock: number;
  parLevel: number;
  reorderTrigger: number;
  unit: string;
  severity: 'low' | 'depleted';
  timestamp: string;
}

export interface LaborPacingPayload {
  event: 'LABOR_PACING_UPDATE';
  activeStaffCount: number;
  currentHourlyBurn: number;
  currentHourSales: number;
  laborPercentage: string;
  status: 'OPTIMAL' | 'PACING_ALERT';
  recommendation: string;
  targetPercentage: number;
  timestamp: string;
}

export interface ReservationCreatedPayload {
  event: 'RESERVATION_CREATED';
  reservation: unknown;
  source: string;
  timestamp: string;
}

export interface ServerToClientEvents {
  KDS_NEW_TICKET: (payload: KdsNewTicketPayload) => void;
  KDS_TICKET_UPDATED: (payload: Record<string, unknown>) => void;
  KDS_TICKET_BUMPED: (payload: Record<string, unknown>) => void;
  TABLE_STAGE_ADVANCED: (payload: TableStageAdvancedPayload) => void;
  TABLE_UPDATED: (payload: Record<string, unknown>) => void;
  GLOBAL_86_ITEM_UPDATE: (payload: Global86Payload) => void;
  LOW_STOCK_ALERT: (payload: LowStockPayload) => void;
  INVENTORY_UPDATED: (payload: Record<string, unknown>) => void;
  LABOR_PACING_UPDATE: (payload: LaborPacingPayload) => void;
  RESERVATION_CREATED: (payload: ReservationCreatedPayload) => void;
  RESERVATION_UPDATED: (payload: ReservationCreatedPayload) => void;
  VOICE_CALL_COMPLETED: (payload: Record<string, unknown>) => void;
  BRIEFING_UPDATED: (payload: Record<string, unknown>) => void;
  MEDIA_PUBLISHED: (payload: Record<string, unknown>) => void;
  ORDER_CREATED: (payload: Record<string, unknown>) => void;
  ORDER_VOIDED: (payload: Record<string, unknown>) => void;
}

export interface ClientToServerEvents {
  'restaurant:join': (restaurantId: string) => void;
  'kds:join': (station: KdsStation) => void;
}
