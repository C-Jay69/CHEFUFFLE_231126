export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string | null;
  category: string | null;
  station: string;
  course: string;
  targetPrepTimeSeconds: number;
  imageUrlPos: string | null;
  imageUrlMobile: string | null;
  tags: string[];
  is86ed: boolean;
  eightySixReason: string | null;
  portionsLeft: number;
  stockStatus: 'in_stock' | 'low' | 'out';
  linkedIngredients: Array<{
    id: string;
    name: string;
    quantityRequired: number;
    currentStock: number;
    unit: string;
  }>;
  modifierGroups?: ModifierGroup[];
}

export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  kind: string;
  selection: 'single' | 'multi' | string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  prompt: string | null;
  displayOrder: number;
  options: ModifierOption[];
}

export interface MenuResponse {
  items: MenuItem[];
  categories: Array<{ id: string; name: string; displayOrder: number; itemCount: number }>;
  availableCount: number;
  eightySixCount: number;
}

export interface DiningTable {
  id: string;
  tableNumber: string;
  zone: string;
  capacity: number;
  posX: number;
  posY: number;
  rotation: number;
  shape: string;
  currentStage: string;
  stageLabel: string;
  stageNumber: number;
  stageShort: string;
  currentPartyName: string | null;
  currentPartySize: number | null;
  seatedAt: string | null;
  seatedMinutes: number | null;
  stageUpdatedAt: string | null;
  serverId: string | null;
  serverName: string | null;
  isActive: boolean;
  activeOrder: {
    id: string;
    orderNumber: number;
    status: string;
    total: number;
    itemCount: number;
    allergyNotes: string | null;
  } | null;
  status: 'available' | 'occupied' | 'reserved' | 'dirty';
}

export interface TicketItem {
  id: string;
  menuItemId: string;
  name: string;
  category: string | null;
  quantity: number;
  unitPrice: number;
  modifiers: Array<{ name: string; priceDelta: number }>;
  prepStatus: string;
  station: string;
  course: string;
  seat: string | null;
  notes: string | null;
  isAllergen: boolean;
  targetPrepSeconds: number;
  prepSeconds: number;
  bumpedAt: string | null;
}

export interface KdsTicket {
  id: string;
  orderNumber: number;
  tableId: string | null;
  tableNumber: string;
  zone: string;
  partyName: string | null;
  partySize: number | null;
  serverName: string;
  status: string;
  allergyNotes: string | null;
  hasAllergy: boolean;
  createdAt: string;
  elapsedSeconds: number;
  elapsedLabel: string;
  isOverdue: boolean;
  overdueBySeconds: number;
  maxPrepSeconds: number;
  itemCount: number;
  bumpedCount: number;
  heldCount: number;
  items: TicketItem[];
  stations: string[];
  priority: 'hero' | 'urgent' | 'regular' | 'new';
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: Array<{ name: string; priceDelta: number }>;
  prepStatus: string;
  station: string;
  course: string;
  seat: string | null;
  notes: string | null;
  createdAt: string;
  bumpedAt: string | null;
}

export interface OrderPayment {
  id: string;
  amount: number;
  method: string;
  cardBrand: string | null;
  label: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: number;
  tableId: string | null;
  tableNumber: string | null;
  zone: string | null;
  partyName: string | null;
  serverId: string;
  serverName: string | null;
  status: string;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  allergyNotes: string | null;
  createdAt: string;
  closedAt: string | null;
  items: OrderItem[];
  payments?: OrderPayment[];
  paidAmount?: number;
  balance?: number;
}

export interface Reservation {
  id: string;
  guestName: string;
  phone: string;
  email: string | null;
  partySize: number;
  reservationTime: string;
  tableId: string | null;
  tableNumber: string | null;
  zone: string | null;
  status: string;
  source: string;
  notes: string | null;
  vip: boolean;
  occasion: string | null;
  serverId: string | null;
  serverName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationResponse {
  date: string;
  reservations: Reservation[];
  upcoming: Reservation[];
  stats: {
    total: number;
    covers: number;
    seated: number;
    confirmed: number;
    waitlist: number;
    vip: number;
    voiceAi: number;
  };
  timeSlots: Array<{ label: string; count: number; covers: number }>;
}

export interface Ingredient {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  parLevel: number;
  unit: string;
  unitCost: number;
  supplierName: string | null;
  reorderTrigger: number;
  lastUpdated: string;
  status: 'ok' | 'watch' | 'low' | 'depleted';
  stockPercentage: number;
  value: number;
  linkedMenuItems: string[];
  sku: string;
}

export interface InventoryResponse {
  ingredients: Ingredient[];
  summary: {
    totalItems: number;
    lowStock: number;
    depleted: number;
    totalValue: number;
    categories: Array<{ name: string; count: number }>;
  };
}

export interface StockTransaction {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantityChange: number;
  reason: string;
  referenceOrderId: string | null;
  note: string | null;
  createdAt: string;
  direction: 'up' | 'down';
}

export interface Shift {
  id: string;
  staffId: string | null;
  userName: string;
  role: string;
  roleLabel: string;
  station: string | null;
  hourlyRate: number;
  scheduledStart: string;
  scheduledEnd: string;
  clockIn: string | null;
  clockOut: string | null;
  status: string;
  hoursScheduled: number;
  hoursWorked: number;
  laborCost: number;
  signoff: {
    id: string;
    signedAt: string;
    allergenAcknowledged: boolean;
    haccpAcknowledged: boolean;
  } | null;
}

export interface LaborPacing {
  activeStaffCount: number;
  activeStaff: Array<{
    shiftId: string;
    name: string;
    role: string;
    roleLabel: string;
    station: string | null;
    hourlyRate: number;
    clockIn: string | null;
    scheduledEnd: string;
    hoursWorked: number;
  }>;
  currentHourlyBurn: number;
  currentHourSales: number;
  windowSales: number;
  laborPercentage: string;
  laborRatio: number;
  targetPercentage: number;
  status: 'OPTIMAL' | 'PACING_ALERT';
  recommendation: string;
  cutRecommendation: string;
  window: { start: string; end: string; label: string; fallback: boolean };
  projectedSalesAtClose: number;
  projectedLaborPercentage: string;
  timestamp: string;
}

export interface ShiftResponse {
  date: string;
  shifts: Shift[];
  summary: {
    active: number;
    scheduled: number;
    clockedOut: number;
    total: number;
    scheduledWages: number;
    laborPercentage: string;
    targetPercentage: number;
    pacingStatus: string;
    recommendation: string;
  };
  pacing: LaborPacing;
}

export interface Briefing {
  date: string;
  restaurant: { name: string; address: string; phone: string; targetLaborPercentage: number } | null;
  eightySix: Array<{
    id: string;
    name: string;
    station: string;
    category: string | null;
    reason: string | null;
    price: number;
  }>;
  lowStock: Array<{
    id: string;
    name: string;
    currentStock: number;
    parLevel: number;
    reorderTrigger: number;
    unit: string;
    supplier: string | null;
    severity: string;
  }>;
  vipReservations: Array<{
    id: string;
    guestName: string;
    partySize: number;
    time: string;
    tableNumber: string | null;
    notes: string | null;
    occasion: string | null;
    status: string;
  }>;
  stationDirectives: Array<{ station: string; directive: string; priority: string }>;
  attendance: Shift[];
  summary: {
    covers: number;
    sales: number;
    activeStaff: number;
    totalShifts: number;
    signedOff: number;
    signoffRate: number;
    laborPercentage: string;
    pacingStatus: string;
    topSellers: Array<{ name: string; quantity: number }>;
  };
  narrative: string;
  narrativeGeneratedAt: string;
}

export interface TrainingModule {
  id: string;
  title: string;
  track: string;
  description: string | null;
  durationMinutes: number;
  displayOrder: number;
}

export interface Trainee {
  id: string;
  fullName: string;
  role: string;
  mentor: string | null;
  status: string;
  progress: number;
  badges: string[];
  createdAt: string;
  assignments: Array<{
    id: string;
    moduleId: string;
    moduleTitle: string;
    track: string;
    status: string;
    score: number | null;
  }>;
}

export interface TrainingResponse {
  modules: TrainingModule[];
  tracks: Array<{ track: string; label: string; modules: number; minutes: number }>;
  trainees: Trainee[];
  summary: {
    trainees: number;
    certified: number;
    inTraining: number;
    completionRate: number;
    assignments: number;
    completedAssignments: number;
  };
}

export interface VoiceCall {
  id: string;
  callerPhone: string;
  callerName: string | null;
  durationSeconds: number;
  summary: string | null;
  transcript: string | null;
  outcome: string;
  reservationId: string | null;
  sentimentScore: number | null;
  createdAt: string;
}

export interface VoiceResponse {
  calls: VoiceCall[];
  stats: {
    totalCalls: number;
    booked: number;
    bookingRate: number;
    avgDurationSeconds: number;
    avgSentiment: number;
    live86: number;
  };
}

export interface ArchitectAsset {
  id: string;
  name: string;
  description: string | null;
  price: number;
  station: string;
  categoryId: string | null;
  category: string | null;
  imageUrlPos: string | null;
  imageUrlMobile: string | null;
  cropPos: unknown;
  cropMobile: unknown;
  is86ed: boolean;
  hasPosMedia: boolean;
  hasMobileMedia: boolean;
  tags: string[];
}

export interface ArchitectResponse {
  menuItems: ArchitectAsset[];
  categories: Array<{ id: string; name: string; count: number }>;
  tables: DiningTable[];
  mediaHealth: {
    total: number;
    mappedPos: number;
    mappedMobile: number;
    unmapped: number;
    coverage: number;
  };
}

export interface DashboardSummary {
  restaurant: { id: string; name: string; address: string; phone: string; targetLaborPercentage: number } | null;
  tables: {
    total: number;
    occupied: number;
    available: number;
    reserved: number;
    dirty: number;
    occupancy: number;
  };
  kds: {
    openTickets: number;
    overdue: number;
    allergies: number;
    stationCounts: Record<string, number>;
  };
  labor: {
    percentage: string;
    target: number;
    status: string;
    activeStaff: number;
    recommendation: string;
  };
  inventory: {
    lowStock: number;
    depleted: number;
    totalItems: number;
    totalValue: number;
  };
  eightySix: Array<{ id: string; name: string; reason: string | null }>;
  reservations: { today: number; covers: number; vip: number; waitlist: number };
  voice: { callsToday: number };
  sales: { today: number };
  timestamp: string;
}

/** Safe staff fields returned by the auth endpoints (never PIN material). */
export interface AuthStaff {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  permissions?: string[];
  serveOnlyWhenClockedIn?: boolean;
}

export interface AuthShift {
  id: string;
  staffId: string | null;
  clockIn: string | null;
  clockOut: string | null;
  status: string;
}

/** `POST /api/auth/pin` response. */
export interface AuthLoginResponse {
  token: string;
  expiresAt: string;
  restaurantId: string;
  sessionId: string;
  staff: AuthStaff;
  activeShift: AuthShift | null;
  shiftHint: AuthShift | null;
}

/** `GET /api/auth/me` response. */
export interface AuthMeResponse {
  restaurantId: string;
  staff: AuthStaff;
  activeShift: AuthShift | null;
}
