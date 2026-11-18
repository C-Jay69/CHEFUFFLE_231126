import { z } from 'zod';
import {
  CALL_OUTCOMES,
  COURSE_STAGES,
  KDS_STATIONS,
  RESERVATION_STATUSES,
  STOCK_REASONS,
  USER_ROLES,
} from './constants';

export const uuidSchema = z.string().uuid();

export const orderItemInputSchema = z.object({
  menuItemId: uuidSchema,
  quantity: z.number().int().min(1).max(50).default(1),
  modifiers: z
    .array(
      z.object({
        name: z.string().min(1),
        priceDelta: z.number().default(0),
      }),
    )
    .default([]),
  seat: z.union([z.string(), z.number()]).optional(),
  notes: z.string().max(500).optional(),
});

export const createOrderSchema = z.object({
  tableId: uuidSchema.optional().nullable(),
  serverId: uuidSchema.optional(),
  serverName: z.string().optional(),
  partyName: z.string().max(100).optional(),
  partySize: z.number().int().min(1).max(40).optional(),
  items: z.array(orderItemInputSchema).min(1),
  allergyNotes: z.string().max(1000).optional().nullable(),
  sendToKitchen: z.boolean().default(true),
  autoGratuity: z.boolean().default(false),
});

export const voidOrderSchema = z.object({
  reason: z.string().max(300).optional(),
});

export const bumpTicketSchema = z.object({
  orderId: uuidSchema,
  station: z.enum(KDS_STATIONS).optional(),
  itemIds: z.array(uuidSchema).optional(),
  action: z.enum(['bump', 'recall', 'hold', 'fire']).default('bump'),
  bumpMinutes: z.number().int().min(1).max(30).optional(),
});

export const stockAdjustSchema = z.object({
  ingredientId: uuidSchema,
  newStock: z.number().min(0).optional(),
  quantityChange: z.number().optional(),
  reason: z.enum(STOCK_REASONS),
  note: z.string().max(500).optional(),
});

export const menuAvailabilitySchema = z.object({
  is86ed: z.boolean(),
  reason: z.string().max(300).optional(),
});

export const reservationSchema = z.object({
  guestName: z.string().min(1).max(100),
  phone: z.string().min(3).max(40),
  email: z.string().email().optional().or(z.literal('')),
  partySize: z.number().int().min(1).max(40),
  reservationTime: z.string().datetime(),
  tableId: uuidSchema.optional().nullable(),
  status: z.enum(RESERVATION_STATUSES).default('confirmed'),
  source: z.enum(['host', 'web', 'voice_ai', 'walk_in']).default('host'),
  notes: z.string().max(1000).optional().nullable(),
  vip: z.boolean().default(false),
  occasion: z.string().max(120).optional().nullable(),
});

export const reservationUpdateSchema = reservationSchema.partial().extend({
  id: uuidSchema,
});

export const shiftCreateSchema = z.object({
  userName: z.string().min(1).max(100),
  role: z.enum(USER_ROLES),
  hourlyRate: z.number().min(0).max(500),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  station: z.string().max(100).optional().nullable(),
});

export const clockSchema = z.object({
  shiftId: uuidSchema,
});

export const broadcastSchema = z.object({
  message: z.string().min(1).max(500),
  recipients: z.array(z.string()).optional(),
  channel: z.enum(['sms', 'push', 'all']).default('sms'),
});

export const trainingEnrollSchema = z.object({
  fullName: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  mentor: z.string().max(100).optional().nullable(),
  tracks: z.array(z.string()).default([]),
  sendMagicLink: z.boolean().default(true),
});

export const trainingProgressSchema = z.object({
  traineeId: uuidSchema,
  moduleId: uuidSchema,
  status: z.enum(['not_started', 'in_progress', 'completed', 'failed']),
  score: z.number().min(0).max(100).optional(),
});

export const mediaPublishSchema = z.object({
  menuItemId: uuidSchema,
  imageUrlPos: z.string().max(2000).optional().nullable(),
  imageUrlMobile: z.string().max(2000).optional().nullable(),
  cropPos: z.record(z.number()).optional().nullable(),
  cropMobile: z.record(z.number()).optional().nullable(),
  publishTo: z.array(z.enum(['pos', 'mobile', 'kds', 'voice_ai'])).default(['pos']),
});

export const floorLayoutSchema = z.object({
  tables: z
    .array(
      z.object({
        id: uuidSchema,
        posX: z.number(),
        posY: z.number(),
        rotation: z.number().int().default(0),
        zone: z.string().optional(),
        capacity: z.number().int().min(1).optional(),
        shape: z.string().optional(),
      }),
    )
    .min(1),
});

export const tableSeatSchema = z.object({
  partyName: z.string().min(1).max(100),
  partySize: z.number().int().min(1).max(40),
  serverId: uuidSchema.optional().nullable(),
  stage: z.enum(COURSE_STAGES).default('seated'),
  reservationId: uuidSchema.optional().nullable(),
});

export const tableStageSchema = z.object({
  stage: z.enum(COURSE_STAGES),
  reason: z.string().max(200).optional(),
});

export const voiceSimulateSchema = z.object({
  callerPhone: z.string().min(3).max(40).default('+15550001111'),
  utterance: z.string().min(1).max(1000),
  partySize: z.number().int().min(1).max(40).optional(),
  reservationTime: z.string().datetime().optional(),
});

export const callOutcomeSchema = z.enum(CALL_OUTCOMES);

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type BumpTicketInput = z.infer<typeof bumpTicketSchema>;
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;
export type ReservationInput = z.infer<typeof reservationSchema>;
export type ShiftCreateInput = z.infer<typeof shiftCreateSchema>;
export type TrainingEnrollInput = z.infer<typeof trainingEnrollSchema>;
export type MediaPublishInput = z.infer<typeof mediaPublishSchema>;
export type FloorLayoutInput = z.infer<typeof floorLayoutSchema>;
export type VoiceSimulateInput = z.infer<typeof voiceSimulateSchema>;
