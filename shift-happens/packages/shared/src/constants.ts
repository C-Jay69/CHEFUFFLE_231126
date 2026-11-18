export const USER_ROLES = [
  'owner',
  'general_manager',
  'floor_manager',
  'chef_expo',
  'line_cook',
  'server',
  'bartender',
  'host',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const COURSE_STAGES = [
  'seated',
  'starters',
  'mains_firing',
  'entree',
  'dessert',
  'check_dropped',
  'dirty_bussing',
  'ready',
] as const;
export type CourseStage = (typeof COURSE_STAGES)[number];

/** Human-facing six-stage matrix used by the Floor Plan + Manager Companion. */
export const STAGE_LABELS: Record<CourseStage, { number: number; label: string; short: string }> = {
  seated: { number: 0, label: 'Seated / Water Pour', short: 'Seated' },
  starters: { number: 1, label: 'Stage 1: Starters', short: 'Starters' },
  mains_firing: { number: 2, label: 'Stage 2: Mains Firing', short: 'Mains' },
  entree: { number: 2, label: 'Stage 2: Entrée', short: 'Entrée' },
  dessert: { number: 3, label: 'Stage 3: Dessert', short: 'Dessert' },
  check_dropped: { number: 4, label: 'Stage 4: Billed', short: 'Billed' },
  dirty_bussing: { number: 5, label: 'Stage 5: Bus', short: 'Bus' },
  ready: { number: 6, label: 'Stage 6: Ready', short: 'Ready' },
};

export const STAGE_SEQUENCE: CourseStage[] = [
  'seated',
  'starters',
  'mains_firing',
  'entree',
  'dessert',
  'check_dropped',
  'dirty_bussing',
  'ready',
];

export const ORDER_STATUSES = [
  'open',
  'sent_to_kitchen',
  'preparing',
  'ready_at_pass',
  'served',
  'paid',
  'void',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const KDS_STATIONS = [
  'expo',
  'grill',
  'saute_fryer',
  'cold_larder',
  'pastry_dessert',
  'bar',
] as const;
export type KdsStation = (typeof KDS_STATIONS)[number];

export const STOCK_REASONS = [
  'sale_deduction',
  'waste_spoilage',
  'purchase_receipt',
  'inventory_audit',
  'transfer',
] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

export const CALL_OUTCOMES = [
  'reservation_booked',
  'faq_answered',
  'transferred_to_staff',
  'voicemail',
  'abandoned',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const RESERVATION_STATUSES = [
  'confirmed',
  'seated',
  'waitlist',
  'cancelled',
  'completed',
  'no_show',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const PREP_STATUSES = ['firing', 'bumped', 'ready', 'recalled'] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];

export const KDS_STATION_LABELS: Record<KdsStation, string> = {
  expo: 'Expo / Pass',
  grill: 'Grill Station',
  saute_fryer: 'Sauté & Fryer',
  cold_larder: 'Cold Larder',
  pastry_dessert: 'Pastry & Dessert',
  bar: 'Bar',
};

export const TAX_RATE = 0.08;
export const AUTO_GRATUITY_RATE = 0.18;
export const DEFAULT_TARGET_LABOR_PERCENTAGE = 18.5;

export const RESTAURANT_ID =
  process.env.RESTAURANT_ID || '11111111-1111-4111-8111-111111111111';
