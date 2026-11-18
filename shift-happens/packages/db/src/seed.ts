/* eslint-disable no-console */
import 'dotenv/config';
import { PrismaClient, type KdsStation, type UserRole } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

const RESTAURANT_ID = '11111111-1111-4111-8111-111111111111';
const uuid = (prefix: string, n: number) =>
  `${prefix}${'0'.repeat(8 - prefix.length)}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TABLE = (n: number) => uuid('33333333', n);
const STAFF = (n: number) => uuid('44444444', n);
const CATEGORY = (n: number) => uuid('55555555', n);
const MENU = (n: number) => uuid('66666666', n);
const ING = (n: number) => uuid('77777777', n);
const RECIPE = (n: number) => uuid('88888888', n);
const ORDER = (n: number) => uuid('99999999', n);
const SHIFT = (n: number) => uuid('aaaaaaaa', n + 1);
const RES = (n: number) => uuid('bbbbbbbb', n + 1);
const KB = (n: number) => uuid('cccccccc', n + 1);
const TRAINEE = (n: number) => uuid('dddddddd', n + 1);
const MODULE = (n: number) => uuid('eeeeeeee', n + 1);

const now = new Date();
const startOfDay = new Date(now);
startOfDay.setHours(0, 0, 0, 0);
const at = (hours: number, minutes = 0, dayOffset = 0) => {
  const d = new Date(startOfDay);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d;
};
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

/** Deterministic local embedding used when no Gemini key is configured. */
export function embedText(text: string, dims = 128): number[] {
  const vector = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  for (const token of tokens) {
    const hash = createHash('sha256').update(token).digest();
    for (let i = 0; i < 4; i++) {
      const idx = hash.readUInt32BE(i * 4) % dims;
      vector[idx] += 1;
    }
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
  return vector.map((v) => Number((v / norm).toFixed(6)));
}

async function wipe() {
  await prisma.briefingSignoff.deleteMany();
  await prisma.trainingAssignment.deleteMany();
  await prisma.trainingModule.deleteMany();
  await prisma.trainee.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.callLog.deleteMany();
  await prisma.knowledgeBase.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.stockTransaction.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.recipeIngredient.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.staffShift.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.diningTable.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.restaurant.deleteMany();
}

async function main() {
  console.log('→ wiping existing tenant data');
  await wipe();

  console.log('→ restaurant');
  await prisma.restaurant.create({
    data: {
      id: RESTAURANT_ID,
      name: 'SHIFT HAPPENS! Downtown Flagship',
      address: '1811 Nocturne Ave, Downtown Arts District',
      phone: '+1 (555) 018-1811',
      targetLaborPercentage: 18.5,
    },
  });

  console.log('→ staff');
  const staffSeed: Array<{
    n: number; name: string; role: UserRole; pin: string; rate: string;
  }> = [
    { n: 1, name: 'Chef Marco Vance', role: 'general_manager', pin: '1111', rate: '46.00' },
    { n: 2, name: 'Zach Arroyo', role: 'server', pin: '2222', rate: '18.50' },
    { n: 3, name: 'Maya Santos', role: 'bartender', pin: '3333', rate: '19.00' },
    { n: 4, name: 'James Guerrero', role: 'server', pin: '4444', rate: '18.00' },
    { n: 5, name: 'Maurice Thompson', role: 'server', pin: '5555', rate: '18.00' },
    { n: 6, name: 'Priya Kapoor', role: 'host', pin: '6666', rate: '17.00' },
    { n: 7, name: 'Elena Rossi', role: 'chef_expo', pin: '7777', rate: '28.00' },
    { n: 8, name: 'Dante Brooks', role: 'line_cook', pin: '8888', rate: '22.00' },
    { n: 9, name: 'Sofia Marin', role: 'line_cook', pin: '9999', rate: '21.00' },
    { n: 10, name: 'Liam Chen', role: 'line_cook', pin: '1010', rate: '20.00' },
    { n: 11, name: 'Nadia Okafor', role: 'floor_manager', pin: '1212', rate: '26.00' },
    { n: 12, name: 'Kris Walker', role: 'server', pin: '1313', rate: '18.00' },
    { n: 13, name: 'Raj Patel', role: 'server', pin: '1414', rate: '18.00' },
    { n: 14, name: 'Tess Nguyen', role: 'server', pin: '1515', rate: '18.00' },
    { n: 15, name: 'Mateo Rivera', role: 'server', pin: '1616', rate: '17.50' },
    { n: 16, name: 'Imani Clark', role: 'host', pin: '1717', rate: '17.00' },
  ];
  await prisma.staff.createMany({
    data: staffSeed.map((s) => ({
      id: STAFF(s.n),
      restaurantId: RESTAURANT_ID,
      name: s.name,
      role: s.role,
      pin: s.pin,
      hourlyRate: s.rate,
    })),
  });

  console.log('→ dining tables');
  const tableSeed: Array<{
    n: number; number: string; zone: string; cap: number; x: number; y: number;
    shape: string; stage: 'seated' | 'starters' | 'mains_firing' | 'entree' | 'dessert' | 'check_dropped' | 'dirty_bussing' | 'ready';
    party?: string; size?: number; mins?: number; server?: number; rot?: number;
  }> = [
    { n: 1, number: 'T-01', zone: 'Main Dining Room', cap: 4, x: 150, y: 120, shape: 'square', stage: 'entree', party: 'James G.', size: 4, mins: 22, server: 4 },
    { n: 2, number: 'T-02', zone: 'Main Dining Room', cap: 4, x: 300, y: 120, shape: 'square', stage: 'ready' },
    { n: 3, number: 'T-03', zone: 'Main Dining Room', cap: 4, x: 450, y: 120, shape: 'square', stage: 'entree', party: 'Maurice T.', size: 4, mins: 18, server: 5 },
    { n: 4, number: 'T-04', zone: 'Main Dining Room', cap: 2, x: 600, y: 120, shape: 'circle', stage: 'starters', party: 'Kris W.', size: 2, mins: 7, server: 12 },
    { n: 5, number: 'T-05', zone: 'Main Dining Room', cap: 4, x: 150, y: 280, shape: 'square', stage: 'mains_firing', party: 'Raj T.', size: 4, mins: 11, server: 13 },
    { n: 6, number: 'T-06', zone: 'Main Dining Room', cap: 6, x: 340, y: 280, shape: 'rectangle', stage: 'seated', party: 'Tess N.', size: 5, mins: 3, server: 14 },
    { n: 7, number: 'T-07', zone: 'Main Dining Room', cap: 4, x: 560, y: 280, shape: 'square', stage: 'check_dropped', party: 'Dana P.', size: 4, mins: 46, server: 2 },
    { n: 8, number: 'T-08', zone: 'Main Dining Room', cap: 2, x: 710, y: 280, shape: 'circle', stage: 'ready' },
    { n: 9, number: 'T-11', zone: 'Main Dining Room', cap: 2, x: 150, y: 430, shape: 'circle', stage: 'starters', party: 'Alex R.', size: 2, mins: 6, server: 15 },
    { n: 10, number: 'T-12', zone: 'Main Dining Room', cap: 2, x: 300, y: 430, shape: 'circle', stage: 'ready' },
    { n: 11, number: 'T-14', zone: 'Patio & Garden', cap: 4, x: 480, y: 430, shape: 'square', stage: 'seated', party: 'Marcus Sterling', size: 4, mins: 2, server: 2 },
    { n: 12, number: 'T-16', zone: 'Main Dining Room', cap: 2, x: 630, y: 430, shape: 'circle', stage: 'dessert', party: 'Jo & Sam', size: 2, mins: 9, server: 3 },
    { n: 13, number: 'T-17', zone: 'Main Dining Room', cap: 3, x: 780, y: 430, shape: 'square', stage: 'check_dropped', party: 'Overstay • VIP', size: 3, mins: 54, server: 4 },
    { n: 14, number: 'T-18', zone: 'Main Dining Room', cap: 4, x: 150, y: 570, shape: 'square', stage: 'dirty_bussing', party: 'Just left', size: 0, mins: 2 },
    { n: 15, number: 'WS-01', zone: 'Window Side', cap: 6, x: 340, y: 570, shape: 'rectangle', stage: 'dessert', party: 'Raj T.', size: 6, mins: 11, server: 13 },
    { n: 16, number: 'WS-02', zone: 'Window Side', cap: 8, x: 570, y: 570, shape: 'rectangle', stage: 'ready' },
    { n: 17, number: 'WS-05', zone: 'Window Side', cap: 4, x: 800, y: 570, shape: 'square', stage: 'dirty_bussing', party: 'Held for Kris W.', size: 4, mins: 5 },
    { n: 18, number: 'BS-01', zone: 'Bar & Lounge', cap: 4, x: 150, y: 720, shape: 'booth', stage: 'starters', party: 'Bar Seating', size: 4, mins: 14, server: 3 },
    { n: 19, number: 'BS-02', zone: 'Bar & Lounge', cap: 4, x: 340, y: 720, shape: 'booth', stage: 'check_dropped', party: 'Bar Tab', size: 4, mins: 31, server: 3 },
    { n: 20, number: 'BAR-01', zone: 'Bar & Lounge', cap: 2, x: 530, y: 720, shape: 'circle', stage: 'ready' },
    { n: 21, number: 'BAR-02', zone: 'Bar & Lounge', cap: 2, x: 680, y: 720, shape: 'circle', stage: 'mains_firing', party: 'Walk-up', size: 2, mins: 8, server: 3 },
    { n: 22, number: 'P-01', zone: 'Patio & Garden', cap: 4, x: 150, y: 870, shape: 'circle', stage: 'ready' },
    { n: 23, number: 'P-02', zone: 'Patio & Garden', cap: 4, x: 340, y: 870, shape: 'circle', stage: 'seated', party: 'Nguyen party', size: 4, mins: 4, server: 12 },
    { n: 24, number: 'PDR-01', zone: 'Private Dining (PDR)', cap: 12, x: 620, y: 870, shape: 'rectangle', stage: 'ready' },
  ];
  await prisma.diningTable.createMany({
    data: tableSeed.map((t) => ({
      id: TABLE(t.n),
      restaurantId: RESTAURANT_ID,
      tableNumber: t.number,
      zone: t.zone,
      capacity: t.cap,
      posX: t.x,
      posY: t.y,
      rotation: t.rot ?? 0,
      shape: t.shape,
      currentStage: t.stage,
      currentPartyName: t.party ?? null,
      currentPartySize: t.size ?? null,
      seatedAt: t.party ? minutesAgo(t.mins ?? 5) : null,
      stageUpdatedAt: minutesAgo(t.mins ?? 5),
      serverId: t.server ? STAFF(t.server) : null,
    })),
  });

  console.log('→ menu');
  const categories = [
    { n: 1, name: 'Chef Favorites', order: 1 },
    { n: 2, name: 'Shareables', order: 2 },
    { n: 3, name: 'Woodfired Pizza', order: 3 },
    { n: 4, name: 'Burgers & Mains', order: 4 },
    { n: 5, name: 'Cocktails & Spirits', order: 5 },
    { n: 6, name: 'Curated Wines', order: 6 },
    { n: 7, name: 'Coffee & Cold Tea', order: 7 },
    { n: 8, name: 'Craft Desserts', order: 8 },
    { n: 9, name: 'Raw Bar & Cold Larder', order: 9 },
  ];
  await prisma.menuCategory.createMany({
    data: categories.map((c) => ({
      id: CATEGORY(c.n), restaurantId: RESTAURANT_ID, name: c.name, displayOrder: c.order,
    })),
  });

  const menuSeed: Array<{
    n: number; cat: number; name: string; desc: string; price: string;
    station: KdsStation; prep: number; tags: string[]; is86?: boolean; reason?: string;
  }> = [
    { n: 1, cat: 3, name: 'Margherita D.O.P.', desc: 'San Marzano tomatoes, buffalo mozzarella, fresh basil, cold-pressed EVOO.', price: '22.00', station: 'grill', prep: 780, tags: ['Vegetarian', 'Chef Favorite'] },
    { n: 2, cat: 4, name: 'Wagyu Smash Burger', desc: 'Double American Wagyu patties, smoked gouda, caramelized onion jam, brioche.', price: '24.50', station: 'grill', prep: 720, tags: ['Popular'] },
    { n: 3, cat: 2, name: 'Crispy Calamari', desc: 'Point Judith squid, shaved jalapeños, smoked lemon aioli, fresh parsley.', price: '18.00', station: 'saute_fryer', prep: 540, tags: ['Shareable'] },
    { n: 4, cat: 1, name: 'Truffle Cacio e Pepe', desc: 'Housemade tonnarelli, toasted black peppercorn medley, aged Pecorino Romano.', price: '26.00', station: 'saute_fryer', prep: 660, tags: ['Vegetarian'], is86: true, reason: 'Black Winter Truffle out of stock' },
    { n: 5, cat: 2, name: 'Charred Broccolini', desc: 'Calabrian chili crisps, roasted garlic purée, lemon zest, toasted almonds.', price: '14.00', station: 'saute_fryer', prep: 480, tags: ['Vegan', 'GF'] },
    { n: 6, cat: 5, name: 'Hibiscus Paloma', desc: 'Casamigos Blanco, organic hibiscus infusion, fresh lime, grapefruit soda, pink salt.', price: '17.00', station: 'bar', prep: 240, tags: ['Popular', 'Cocktail'] },
    { n: 7, cat: 2, name: 'Truffle Parmesan Fries', desc: 'Triple-cooked fries, white truffle oil, shaved pecorino, chive.', price: '16.00', station: 'saute_fryer', prep: 420, tags: ['Shareable', 'Vegetarian'] },
    { n: 8, cat: 4, name: 'Crispy Chicken Sandwich', desc: 'Buttermilk-brined chicken, spicy chipotle mayo, pickles, sesame bun.', price: '19.50', station: 'saute_fryer', prep: 720, tags: ['Spicy'] },
    { n: 9, cat: 3, name: 'Woodfired Margherita', desc: 'Buffalo burrata, hot honey drizzle, San Marzano base, woodfired crust.', price: '27.00', station: 'grill', prep: 780, tags: ['Chef Favorite'] },
    { n: 10, cat: 5, name: 'Smoked Old Fashioned', desc: 'Woodford Bourbon Reserve, king cube, orange peel, hickory smoke.', price: '22.00', station: 'bar', prep: 300, tags: ['Cocktail'] },
    { n: 11, cat: 4, name: '28-Day Dry-Aged Ribeye', desc: 'Prime ribeye, compound rosemary garlic butter, charred lemon.', price: '68.00', station: 'grill', prep: 1080, tags: ['GF', 'Signature'] },
    { n: 12, cat: 4, name: 'Pan-Seared Seabass', desc: 'Chilean seabass, saffron beurre blanc, fennel confit.', price: '38.00', station: 'saute_fryer', prep: 900, tags: ['GF'] },
    { n: 13, cat: 4, name: 'Wagyu Striploin', desc: 'A5 wagyu striploin, bone marrow crust, pommes purée.', price: '72.00', station: 'grill', prep: 1020, tags: ['Signature'] },
    { n: 14, cat: 9, name: 'Artisan Burrata', desc: 'Pugliese burrata, heirloom tomatoes, basil oil, aged balsamic.', price: '18.00', station: 'cold_larder', prep: 300, tags: ['Vegetarian', 'GF'] },
    { n: 15, cat: 9, name: 'Yellowfin Tuna Crudo', desc: 'Yellowfin tuna, yuzu ponzu, radish, micro shiso.', price: '21.00', station: 'cold_larder', prep: 360, tags: ['GF', 'Raw'] },
    { n: 16, cat: 8, name: 'Basque Cheesecake', desc: 'Burnt Basque cheesecake, macerated berries, crème fraîche.', price: '14.00', station: 'pastry_dessert', prep: 240, tags: ['Dessert'] },
    { n: 17, cat: 8, name: 'Dark Chocolate Torte', desc: '70% Valrhona torte, olive oil, flaky sea salt.', price: '15.00', station: 'pastry_dessert', prep: 240, tags: ['Dessert'] },
    { n: 18, cat: 5, name: 'Espresso Martini', desc: 'Cold brew, vodka, coffee liqueur, vanilla bean.', price: '16.00', station: 'bar', prep: 240, tags: ['Cocktail'] },
    { n: 19, cat: 6, name: 'Sommelier Pour — Sangiovese', desc: 'Brunello di Montalcino, 6oz pour.', price: '19.00', station: 'bar', prep: 120, tags: ['Wine'] },
    { n: 20, cat: 7, name: 'Cold Brew Tonic', desc: 'Single-origin cold brew, tonic, orange twist.', price: '9.00', station: 'bar', prep: 180, tags: ['NA'] },
    { n: 21, cat: 1, name: 'Black Winter Truffle Supplement', desc: 'Fresh-shaved black winter truffle, per gram.', price: '12.00', station: 'cold_larder', prep: 120, tags: ['Supplement'], is86: true, reason: 'Black Winter Truffle out of stock' },
  ];
  await prisma.menuItem.createMany({
    data: menuSeed.map((m) => ({
      id: MENU(m.n),
      restaurantId: RESTAURANT_ID,
      categoryId: CATEGORY(m.cat),
      name: m.name,
      description: m.desc,
      price: m.price,
      station: m.station,
      targetPrepTimeSeconds: m.prep,
      tags: m.tags,
      is86ed: m.is86 ?? false,
      eightySixReason: m.reason ?? null,
    })),
  });

  console.log('→ ingredients');
  const ingredientSeed: Array<{
    n: number; name: string; cat: string; stock: string; par: string; unit: string;
    cost: string; supplier: string; reorder: string;
  }> = [
    { n: 1, name: '28-Day Dry-Aged Ribeye', cat: 'Proteins', stock: '8.500', par: '20.000', unit: 'kg', cost: '42.00', supplier: 'Prime Meats Co.', reorder: '6.000' },
    { n: 2, name: 'American Wagyu Patties', cat: 'Proteins', stock: '42.000', par: '80.000', unit: 'piece', cost: '6.50', supplier: 'Prime Meats Co.', reorder: '20.000' },
    { n: 3, name: 'Chicken Breast', cat: 'Proteins', stock: '18.000', par: '40.000', unit: 'kg', cost: '9.00', supplier: 'Halal Poultry Direct', reorder: '12.000' },
    { n: 4, name: 'Point Judith Squid', cat: 'Proteins', stock: '3.200', par: '15.000', unit: 'kg', cost: '14.00', supplier: 'Atlantic Fish Co.', reorder: '5.000' },
    { n: 5, name: 'Chilean Seabass', cat: 'Proteins', stock: '6.000', par: '12.000', unit: 'kg', cost: '31.00', supplier: 'Atlantic Fish Co.', reorder: '4.000' },
    { n: 6, name: 'Buffalo Mozzarella', cat: 'Dairy & Cheeses', stock: '6.500', par: '18.000', unit: 'kg', cost: '12.00', supplier: 'Latteria Dairy', reorder: '5.000' },
    { n: 7, name: 'Artisan Burrata', cat: 'Dairy & Cheeses', stock: '3.000', par: '24.000', unit: 'piece', cost: '4.50', supplier: 'Latteria Dairy', reorder: '8.000' },
    { n: 8, name: 'Aged Pecorino Romano', cat: 'Dairy & Cheeses', stock: '4.000', par: '10.000', unit: 'kg', cost: '23.00', supplier: 'Latteria Dairy', reorder: '3.000' },
    { n: 9, name: 'Smoked Gouda', cat: 'Dairy & Cheeses', stock: '5.500', par: '12.000', unit: 'kg', cost: '14.00', supplier: 'Latteria Dairy', reorder: '3.000' },
    { n: 10, name: 'Black Winter Truffle', cat: 'Produce', stock: '0.000', par: '2.000', unit: 'kg', cost: '850.00', supplier: 'Tartufi Italia', reorder: '0.500' },
    { n: 11, name: 'San Marzano Tomatoes', cat: 'Produce', stock: '22.000', par: '30.000', unit: 'kg', cost: '4.20', supplier: 'Green Valley Produce', reorder: '10.000' },
    { n: 12, name: 'Fresh Basil', cat: 'Produce', stock: '1.800', par: '5.000', unit: 'kg', cost: '18.00', supplier: 'Green Valley Produce', reorder: '2.000' },
    { n: 13, name: 'Broccolini', cat: 'Produce', stock: '7.000', par: '12.000', unit: 'kg', cost: '6.50', supplier: 'Green Valley Produce', reorder: '4.000' },
    { n: 14, name: 'Tipo 00 Flour', cat: 'Dry Goods', stock: '34.000', par: '50.000', unit: 'kg', cost: '2.10', supplier: 'Molino Rossi', reorder: '15.000' },
    { n: 15, name: 'Tonnarelli Pasta', cat: 'Dry Goods', stock: '9.000', par: '20.000', unit: 'kg', cost: '5.80', supplier: 'Molino Rossi', reorder: '6.000' },
    { n: 16, name: 'Canola Fry Oil', cat: 'Dry Goods', stock: '12.000', par: '30.000', unit: 'litre', cost: '3.40', supplier: 'Sysco', reorder: '10.000' },
    { n: 17, name: 'Brioche Buns', cat: 'Packaging', stock: '24.000', par: '120.000', unit: 'piece', cost: '0.85', supplier: 'Sysco', reorder: '30.000' },
    { n: 18, name: '8oz Kraft Containers', cat: 'Packaging', stock: '300.000', par: '500.000', unit: 'piece', cost: '0.22', supplier: 'EcoPack', reorder: '150.000' },
    { n: 19, name: 'Casamigos Blanco', cat: 'Bar & Beverage', stock: '6.000', par: '12.000', unit: 'bottle', cost: '38.00', supplier: 'Southern Glazer', reorder: '3.000' },
    { n: 20, name: 'Woodford Bourbon Reserve', cat: 'Bar & Beverage', stock: '8.000', par: '10.000', unit: 'bottle', cost: '44.00', supplier: 'Southern Glazer', reorder: '2.000' },
  ];
  await prisma.ingredient.createMany({
    data: ingredientSeed.map((i) => ({
      id: ING(i.n),
      restaurantId: RESTAURANT_ID,
      name: i.name,
      category: i.cat,
      currentStock: i.stock,
      parLevel: i.par,
      unit: i.unit,
      unitCost: i.cost,
      supplierName: i.supplier,
      reorderTrigger: i.reorder,
    })),
  });

  console.log('→ recipes');
  const recipeMap: Record<number, Array<[number, string]>> = {
    1: [[14, '0.250'], [11, '0.200'], [6, '0.150'], [12, '0.020']],
    2: [[2, '1.000'], [17, '1.000'], [9, '0.050']],
    3: [[4, '0.180'], [16, '0.050']],
    4: [[15, '0.200'], [8, '0.060'], [10, '0.010']],
    5: [[13, '0.180'], [16, '0.020']],
    6: [[19, '0.060']],
    7: [[16, '0.080'], [8, '0.020']],
    8: [[3, '0.180'], [17, '1.000'], [16, '0.040']],
    9: [[14, '0.250'], [11, '0.200'], [7, '1.000']],
    10: [[20, '0.070']],
    11: [[1, '0.350']],
    12: [[5, '0.220'], [16, '0.030']],
    13: [[1, '0.300']],
    14: [[7, '1.000'], [11, '0.120'], [12, '0.010']],
    15: [[5, '0.120']],
    16: [[6, '0.080']],
    17: [[6, '0.020']],
    18: [[19, '0.040']],
    19: [[20, '0.060']],
    20: [[14, '0.010']],
    21: [[10, '0.005']],
  };
  for (const [menuN, ings] of Object.entries(recipeMap)) {
    const recipeId = RECIPE(Number(menuN));
    await prisma.recipe.create({ data: { id: recipeId, menuItemId: MENU(Number(menuN)) } });
    await prisma.recipeIngredient.createMany({
      data: ings.map(([ingN, qty]) => ({
        recipeId,
        ingredientId: ING(ingN),
        quantityRequired: qty,
      })),
    });
  }

  console.log('→ shifts (labor pacing ≈ 19.4%)');
  const shiftSeed: Array<{
    n: number; staff: number; role: UserRole; rate: string; start: Date; end: Date;
    clockIn?: Date; clockOut?: Date; status: string; station?: string;
  }> = [
    { n: 1, staff: 1, role: 'general_manager', rate: '55.00', start: at(15), end: at(23, 30), clockIn: hoursAgo(3), status: 'active', station: 'Expo' },
    { n: 2, staff: 2, role: 'server', rate: '20.00', start: at(16), end: at(23), clockIn: hoursAgo(2.2), status: 'active', station: 'Main Dining' },
    { n: 3, staff: 3, role: 'bartender', rate: '20.00', start: at(16), end: at(23, 30), clockIn: hoursAgo(2.1), status: 'active', station: 'Bar' },
    { n: 4, staff: 4, role: 'server', rate: '18.00', start: at(16), end: at(22, 30), clockIn: hoursAgo(2), status: 'active', station: 'Main Dining' },
    { n: 5, staff: 5, role: 'server', rate: '18.00', start: at(17), end: at(23), clockIn: hoursAgo(1.4), status: 'active', station: 'Patio' },
    { n: 6, staff: 6, role: 'host', rate: '17.00', start: at(16, 30), end: at(22, 30), clockIn: hoursAgo(1.6), status: 'active', station: 'Host Stand' },
    { n: 7, staff: 7, role: 'chef_expo', rate: '30.00', start: at(15, 30), end: at(23), clockIn: hoursAgo(3.2), status: 'active', station: 'Pass' },
    { n: 8, staff: 8, role: 'line_cook', rate: '22.00', start: at(15, 30), end: at(23), clockIn: hoursAgo(3.1), status: 'active', station: 'Grill' },
    { n: 9, staff: 9, role: 'line_cook', rate: '21.00', start: at(16), end: at(23), clockIn: hoursAgo(2.4), status: 'active', station: 'Sauté' },
    { n: 10, staff: 10, role: 'line_cook', rate: '20.00', start: at(16), end: at(22), clockIn: hoursAgo(2.2), status: 'active', station: 'Cold Larder' },
    { n: 11, staff: 11, role: 'floor_manager', rate: '30.00', start: at(16), end: at(23, 30), clockIn: hoursAgo(2), status: 'active', station: 'Floor' },
    { n: 12, staff: 12, role: 'server', rate: '18.00', start: at(16), end: at(22), clockIn: hoursAgo(2), clockOut: hoursAgo(0.2), status: 'clocked_out', station: 'Patio' },
    { n: 13, staff: 13, role: 'server', rate: '18.00', start: at(17), end: at(23), status: 'scheduled', station: 'Window Side' },
    { n: 14, staff: 14, role: 'server', rate: '18.00', start: at(17), end: at(23), clockIn: hoursAgo(1.2), status: 'active', station: 'Main Dining' },
    { n: 15, staff: 15, role: 'server', rate: '17.50', start: at(17), end: at(23), clockIn: hoursAgo(1), status: 'active', station: 'Patio' },
  ];
  await prisma.staffShift.createMany({
    data: shiftSeed.map((s) => ({
      id: SHIFT(s.n),
      restaurantId: RESTAURANT_ID,
      staffId: STAFF(s.staff),
      userName: staffSeed.find((x) => x.n === s.staff)!.name,
      role: s.role,
      hourlyRate: s.rate,
      station: s.station ?? null,
      scheduledStart: s.start,
      scheduledEnd: s.end,
      clockIn: s.clockIn ?? null,
      clockOut: s.clockOut ?? null,
      status: s.status,
    })),
  });

  console.log('→ briefing sign-offs');
  await prisma.briefingSignoff.createMany({
    data: [1, 2, 3, 7, 8, 9, 10, 11].map((n) => {
      const shift = shiftSeed.find((s) => s.n === n)!;
      const member = staffSeed.find((x) => x.n === shift.staff)!;
      return {
        restaurantId: RESTAURANT_ID,
        shiftId: SHIFT(n),
        staffName: member.name,
        allergenAcknowledged: true,
        haccpAcknowledged: true,
        signedAt: minutesAgo(120 - n * 3),
      };
    }),
  });

  console.log('→ live orders + paid sales');
  type OrderSeed = {
    n: number; table: number; server: number; status: 'open' | 'sent_to_kitchen' | 'preparing' | 'ready_at_pass' | 'served' | 'paid' | 'void';
    mins: number; items: Array<{ menu: number; qty: number; prep?: string; seat?: string; notes?: string }>;
    allergy?: string; tip?: string;
  };
  const orderSeed: OrderSeed[] = [
    {
      n: 1, table: 3, server: 5, status: 'preparing', mins: 18,
      allergy: 'Shellfish allergy at seat 3 — no cross-contact',
      items: [
        { menu: 11, qty: 2, seat: '1' },
        { menu: 7, qty: 1, seat: '2' },
        { menu: 11, qty: 1, seat: '3', notes: 'SHELLFISH ALLERGY — separate board' },
        { menu: 6, qty: 2, seat: 'Bar' },
      ],
    },
    {
      n: 2, table: 7, server: 2, status: 'sent_to_kitchen', mins: 22,
      allergy: 'Gluten intolerance — no bread service',
      items: [
        { menu: 12, qty: 2, seat: '1' },
        { menu: 5, qty: 1, seat: '2' },
        { menu: 16, qty: 2, seat: '3' },
      ],
    },
    {
      n: 3, table: 5, server: 13, status: 'sent_to_kitchen', mins: 11,
      items: [
        { menu: 1, qty: 1, seat: '1' },
        { menu: 3, qty: 1, seat: '2' },
        { menu: 19, qty: 2, seat: 'Bar' },
      ],
    },
    {
      n: 4, table: 12, server: 3, status: 'open', mins: 2,
      items: [
        { menu: 6, qty: 2, seat: '1' },
        { menu: 14, qty: 1, seat: '2' },
      ],
    },
    {
      n: 5, table: 21, server: 3, status: 'sent_to_kitchen', mins: 8,
      items: [
        { menu: 2, qty: 2, seat: 'Bar' },
        { menu: 6, qty: 1, seat: 'Bar' },
      ],
    },
    {
      n: 6, table: 1, server: 4, status: 'served', mins: 34,
      items: [
        { menu: 9, qty: 2, seat: '1' },
        { menu: 10, qty: 2, seat: '2' },
        { menu: 17, qty: 2, seat: '3' },
      ],
    },
    {
      n: 7, table: 15, server: 13, status: 'ready_at_pass', mins: 11,
      items: [
        { menu: 13, qty: 1, seat: '1' },
        { menu: 12, qty: 1, seat: '2' },
        { menu: 18, qty: 2, seat: 'Bar' },
      ],
    },
    {
      n: 8, table: 19, server: 3, status: 'paid', mins: 31, tip: '28.00',
      items: [{ menu: 2, qty: 3, seat: 'Bar' }, { menu: 6, qty: 4, seat: 'Bar' }],
    },
    {
      n: 9, table: 13, server: 4, status: 'paid', mins: 54, tip: '32.00',
      items: [{ menu: 11, qty: 2, seat: '1' }, { menu: 13, qty: 1, seat: '2' }, { menu: 19, qty: 3, seat: '3' }],
    },
    {
      n: 10, table: 7, server: 2, status: 'paid', mins: 88, tip: '24.00',
      items: [{ menu: 8, qty: 2, seat: '1' }, { menu: 9, qty: 1, seat: '2' }, { menu: 18, qty: 2, seat: 'Bar' }],
    },
    {
      n: 11, table: 16, server: 3, status: 'paid', mins: 76, tip: '18.00',
      items: [{ menu: 1, qty: 2, seat: '1' }, { menu: 17, qty: 2, seat: '2' }, { menu: 20, qty: 2, seat: '2' }],
    },
    {
      n: 12, table: 23, server: 12, status: 'paid', mins: 110, tip: '20.00',
      items: [{ menu: 14, qty: 2, seat: '1' }, { menu: 15, qty: 1, seat: '2' }, { menu: 19, qty: 2, seat: 'Bar' }],
    },
    {
      n: 13, table: 2, server: 2, status: 'paid', mins: 95, tip: '22.00',
      items: [{ menu: 1, qty: 2, seat: '1' }, { menu: 6, qty: 2, seat: '2' }, { menu: 16, qty: 2, seat: '2' }],
    },
    {
      n: 14, table: 4, server: 12, status: 'paid', mins: 65, tip: '20.00',
      items: [{ menu: 2, qty: 2, seat: '1' }, { menu: 3, qty: 2, seat: '2' }, { menu: 17, qty: 2, seat: '2' }],
    },
    {
      n: 15, table: 8, server: 4, status: 'paid', mins: 120, tip: '28.00',
      items: [{ menu: 12, qty: 2, seat: '1' }, { menu: 15, qty: 2, seat: '2' }, { menu: 16, qty: 2, seat: '2' }],
    },
    {
      n: 16, table: 18, server: 5, status: 'paid', mins: 140, tip: '16.00',
      items: [{ menu: 8, qty: 2, seat: '1' }, { menu: 7, qty: 2, seat: '2' }, { menu: 20, qty: 2, seat: '2' }],
    },
  ];
  const menuById = new Map(menuSeed.map((m) => [m.n, m]));
  for (const o of orderSeed) {
    const items = o.items.map((it) => {
      const menu = menuById.get(it.menu)!;
      return {
        menuItemId: MENU(it.menu),
        quantity: it.qty,
        unitPrice: menu.price,
        prepStatus: o.status === 'paid' ? 'bumped' : o.status === 'open' ? 'firing' : it.prep ?? 'firing',
        station: menu.station,
        seat: it.seat ?? null,
        notes: it.notes ?? null,
        modifiers: [],
        createdAt: minutesAgo(o.mins),
        bumpedAt: o.status === 'paid' ? minutesAgo(Math.max(1, o.mins - 15)) : null,
      };
    });
    const subtotal = items.reduce((s, it) => s + Number(it.unitPrice) * it.quantity, 0);
    const tax = Number((subtotal * 0.08).toFixed(2));
    const tip = o.tip ? Number(o.tip) : 0;
    await prisma.order.create({
      data: {
        id: ORDER(o.n),
        restaurantId: RESTAURANT_ID,
        tableId: TABLE(o.table),
        serverId: STAFF(o.server),
        status: o.status,
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        tip: tip.toFixed(2),
        total: (subtotal + tax + tip).toFixed(2),
        allergyNotes: o.allergy ?? null,
        createdAt: minutesAgo(o.mins),
        closedAt: o.status === 'paid' ? minutesAgo(o.mins - 20) : null,
        items: { create: items },
      },
    });
  }

  console.log('→ reservations');
  const reservationSeed: Array<{
    n: number; name: string; phone: string; party: number; hour: number; minute: number;
    table?: number; status: string; source: string; vip?: boolean; notes?: string; occasion?: string;
    server?: number;
  }> = [
    { n: 1, name: 'Marcus Sterling', phone: '+1 555-0142', party: 4, hour: 19, minute: 30, table: 11, status: 'confirmed', source: 'voice_ai', vip: true, notes: 'VIP • 850 PTS • Anniversary', occasion: 'Anniversary', server: 2 },
    { n: 2, name: 'Elena Voss', phone: '+1 555-0188', party: 6, hour: 20, minute: 0, table: 15, status: 'confirmed', source: 'host', vip: true, notes: 'Food critic — Eater', occasion: 'Press' },
    { n: 3, name: 'Daniel & Priya', phone: '+1 555-0104', party: 2, hour: 19, minute: 45, table: 12, status: 'seated', source: 'host', server: 3 },
    { n: 4, name: 'The Okonkwo Party', phone: '+1 555-0133', party: 8, hour: 20, minute: 15, table: 16, status: 'confirmed', source: 'web', notes: 'Two high chairs' },
    { n: 5, name: 'Sam Whitfield', phone: '+1 555-0177', party: 2, hour: 21, minute: 0, status: 'waitlist', source: 'walk_in', notes: 'Waiting at bar' },
    { n: 6, name: 'Dr. Amara Osei', phone: '+1 555-0159', party: 3, hour: 20, minute: 30, status: 'waitlist', source: 'voice_ai', notes: 'Severe shellfish allergy', vip: true },
    { n: 7, name: 'Luca Bianchi', phone: '+1 555-0121', party: 4, hour: 18, minute: 30, table: 5, status: 'seated', source: 'host', server: 13 },
    { n: 8, name: 'Harper Quinn', phone: '+1 555-0193', party: 2, hour: 22, minute: 0, status: 'confirmed', source: 'web' },
    { n: 9, name: 'Raj T.', phone: '+1 555-0164', party: 6, hour: 19, minute: 0, table: 15, status: 'seated', source: 'host', notes: 'Birthday candle at dessert', occasion: 'Birthday', server: 13 },
    { n: 10, name: 'Naomi Park', phone: '+1 555-0110', party: 2, hour: 20, minute: 45, status: 'confirmed', source: 'voice_ai', notes: 'Gluten-free — celiac' },
    { n: 11, name: 'Garcia Family', phone: '+1 555-0198', party: 5, hour: 21, minute: 15, status: 'waitlist', source: 'walk_in' },
    { n: 12, name: 'Theo Marsh', phone: '+1 555-0129', party: 2, hour: 19, minute: 15, table: 8, status: 'completed', source: 'host' },
  ];
  await prisma.reservation.createMany({
    data: reservationSeed.map((r) => ({
      id: RES(r.n),
      restaurantId: RESTAURANT_ID,
      guestName: r.name,
      phone: r.phone,
      email: `${r.name.toLowerCase().replace(/[^a-z]+/g, '.')}@guest.local`,
      partySize: r.party,
      reservationTime: at(r.hour, r.minute),
      tableId: r.table ? TABLE(r.table) : null,
      status: r.status,
      source: r.source,
      notes: r.notes ?? null,
      vip: r.vip ?? false,
      occasion: r.occasion ?? null,
      serverId: r.server ? STAFF(r.server) : null,
    })),
  });

  console.log('→ knowledge base + calls');
  const kbSeed: Array<{ n: number; category: string; title: string; content: string }> = [
    { n: 1, category: 'Allergens', title: 'Gluten-free dining', content: 'Our 28-day dry-aged ribeye is naturally gluten-free; it is finished with compound rosemary garlic butter. Gluten-free crust is available on all woodfired pizzas for $4. The kitchen uses a dedicated gluten-free prep board and fryer.' },
    { n: 2, category: 'Allergens', title: 'Shellfish allergy protocol', content: 'Calamari and seafood are handled at the sauté station. Guests with shellfish allergies are flagged red on the POS and KDS; runners and expo are notified before the ticket fires. Tuna crudo is prepared at the cold larder with separate utensils.' },
    { n: 3, category: 'Allergens', title: 'Nut and sesame allergies', content: 'Broccolini is finished with toasted almonds and can be made nut-free on request. Brioche buns contain sesame. The pastry kitchen handles tree nuts; macerated berries are prepared on a separate board.' },
    { n: 4, category: 'Hours', title: 'Opening hours', content: 'Dinner service runs Tuesday through Sunday from 5:00 PM to 11:00 PM. The bar opens at 4:30 PM and late-night bites run until midnight on Friday and Saturday. We are closed Mondays.' },
    { n: 5, category: 'Dress Code', title: 'Dress code', content: 'Smart casual. Jackets are welcome but not required. We recommend closed-toe shoes in the garden patio.' },
    { n: 6, category: 'Reservations', title: 'Reservation policy', content: 'We hold reservations for 15 minutes past the booking time. Parties of eight or more require a $25 per-person deposit. Walk-ins are welcome at the bar and patio.' },
    { n: 7, category: 'Private Dining', title: 'Private dining room', content: 'The PDR seats up to 12 guests with a prix-fixe menu starting at $95 per person. It includes a dedicated captain and AV for presentations.' },
    { n: 8, category: 'Parking', title: 'Parking and transit', content: 'Valet is available from 5 PM on Nocturne Ave. The Arts District garage is two blocks east; the first 90 minutes are validated.' },
    { n: 9, category: 'Menu', title: 'Signature dishes', content: 'Guest favorites include the A5 Wagyu striploin, the 28-day dry-aged ribeye, Margherita D.O.P., and the smoked old fashioned. Truffle Cacio e Pepe is unavailable while black winter truffle is out of stock.' },
    { n: 10, category: 'Menu', title: 'Vegan and vegetarian', content: 'Charred broccolini is vegan and gluten-free. Margherita D.O.P. is vegetarian; we can remove mozzarella for a vegan marinara pizza. The chef recommends the heirloom tomato burrata for vegetarian guests.' },
    { n: 11, category: 'Voice AI', title: 'Table availability guidance', content: 'The live availability tool checks the dining room, window side, patio, bar, and PDR in real time. Prime dinner slots are 5:30 PM, 7:30 PM, and 9:00 PM. On Friday and Saturday, a party of four should be offered the patio or bar if the main dining room is full.' },
    { n: 12, category: 'Voice AI', title: '86 escalation', content: 'When an ingredient reaches zero the menu item is automatically 86ed across POS, KDS, and this voice agent. Never promise an item that is 86ed. Offer the chef alternative from the same category.' },
  ];
  await prisma.knowledgeBase.createMany({
    data: kbSeed.map((k) => ({
      id: KB(k.n),
      restaurantId: RESTAURANT_ID,
      category: k.category,
      title: k.title,
      content: k.content,
      embedding: embedText(`${k.title}\n${k.content}`),
    })),
  });

  const callSeed = [
    { n: 1, phone: '+1 555-0142', name: 'Marcus Sterling', dur: 184, outcome: 'reservation_booked' as const, summary: 'Booked anniversary table for 4 at 7:30 PM; flagged VIP and added champagne note.', sentiment: '0.92', mins: 26 },
    { n: 2, phone: '+1 555-0177', name: 'Sam Whitfield', dur: 96, outcome: 'faq_answered' as const, summary: 'Answered parking + dress code. Added to waitlist for 9:00 PM.', sentiment: '0.78', mins: 41 },
    { n: 3, phone: '+1 555-0159', name: 'Dr. Amara Osei', dur: 212, outcome: 'reservation_booked' as const, summary: 'Booked party of 3; severe shellfish allergy flagged to KDS + CRM.', sentiment: '0.88', mins: 55 },
    { n: 4, phone: '+1 555-0133', name: 'The Okonkwo Party', dur: 142, outcome: 'reservation_booked' as const, summary: 'Party of 8 confirmed in window side; two high chairs requested.', sentiment: '0.85', mins: 73 },
    { n: 5, phone: '+1 555-0199', name: null, dur: 38, outcome: 'voicemail' as const, summary: 'Caller asked about Monday hours; voicemail left after hours.', sentiment: '0.20', mins: 96 },
    { n: 6, phone: '+1 555-0110', name: 'Naomi Park', dur: 167, outcome: 'reservation_booked' as const, summary: 'Celiac guest booked for 2; gluten-free protocol added to reservation.', sentiment: '0.90', mins: 118 },
  ];
  await prisma.callLog.createMany({
    data: callSeed.map((c) => ({
      restaurantId: RESTAURANT_ID,
      callerPhone: c.phone,
      callerName: c.name,
      durationSeconds: c.dur,
      summary: c.summary,
      transcript: `Agent: Thank you for calling SHIFT HAPPENS! How can I help?\nCaller: ${c.summary}\nAgent: I've taken care of that for you.`,
      outcome: c.outcome,
      sentimentScore: c.sentiment,
      createdAt: minutesAgo(c.mins),
    })),
  });

  console.log('→ training');
  const moduleSeed: Array<{ n: number; title: string; track: string; desc: string; minutes: number }> = [
    { n: 1, title: 'Service & POS Mastery', track: 'Service & POS Mastery', desc: 'Floor flow, POS ticket lifecycle, modifiers, split checks, and VIP handling.', minutes: 35 },
    { n: 2, title: 'Kitchen Ops & KDS Speed', track: 'Kitchen Ops & KDS Speed', desc: 'Station routing, bump discipline, hold/recall, and 15-minute ticket thresholds.', minutes: 40 },
    { n: 3, title: 'Allergen Protocol & Cross-Contamination Guard', track: 'Allergen & Cross-Contam', desc: 'HACCP sign-off, red allergen lock, dedicated boards and fryers.', minutes: 45 },
    { n: 4, title: 'Voice AI Concierge Sync', track: 'Voice AI Concierge Sync', desc: 'How the voice agent books tables, flags allergens, and respects 86ed items.', minutes: 20 },
    { n: 5, title: 'Wine, Cocktails & Responsible Service', track: 'Service & POS Mastery', desc: 'Sommelier pours, cocktail specs, and ID checks.', minutes: 30 },
  ];
  await prisma.trainingModule.createMany({
    data: moduleSeed.map((m) => ({
      id: MODULE(m.n), restaurantId: RESTAURANT_ID, title: m.title, track: m.track,
      description: m.desc, durationMinutes: m.minutes, displayOrder: m.n,
    })),
  });

  const traineeSeed: Array<{ n: number; name: string; role: string; mentor: string; status: string; progress: number; badges: string[] }> = [
    { n: 1, name: 'Mateo Rivera', role: 'Front of House Server', mentor: 'Zach Arroyo', status: 'in_training', progress: 72, badges: ['POS Certified'] },
    { n: 2, name: 'Imani Clark', role: 'Host / Reservations', mentor: 'Priya Kapoor', status: 'in_training', progress: 58, badges: ['Guest First'] },
    { n: 3, name: 'Noah Kim', role: 'Line Cook / Sauté', mentor: 'Dante Brooks', status: 'in_training', progress: 41, badges: [] },
    { n: 4, name: 'Ava Thompson', role: 'Bartender', mentor: 'Maya Santos', status: 'certified', progress: 100, badges: ['Bar Lead', 'Allergen Guard'] },
    { n: 5, name: 'Diego Alvarez', role: 'Barback / Busser', mentor: 'Kris Walker', status: 'in_training', progress: 29, badges: [] },
    { n: 6, name: 'Leah Bennett', role: 'Front of House Server', mentor: 'Tess Nguyen', status: 'certified', progress: 100, badges: ['POS Certified', 'Allergen Guard'] },
  ];
  await prisma.trainee.createMany({
    data: traineeSeed.map((t) => ({
      id: TRAINEE(t.n), restaurantId: RESTAURANT_ID, fullName: t.name, role: t.role,
      mentor: t.mentor, status: t.status, progress: t.progress, badges: t.badges,
    })),
  });
  const assignments = [
    [1, 1, 'in_progress', null], [1, 3, 'in_progress', null], [1, 2, 'completed', 100],
    [2, 1, 'completed', 96], [2, 4, 'in_progress', null],
    [3, 2, 'in_progress', null], [3, 3, 'not_started', null],
    [4, 1, 'completed', 100], [4, 3, 'completed', 100], [4, 5, 'completed', 94],
    [5, 1, 'in_progress', null], [6, 1, 'completed', 100], [6, 3, 'completed', 98],
  ] as const;
  await prisma.trainingAssignment.createMany({
    data: assignments.map(([t, m, status, score]) => ({
      traineeId: TRAINEE(t), moduleId: MODULE(m), status, score,
    })),
  });

  await prisma.notification.createMany({
    data: [
      { restaurantId: RESTAURANT_ID, channel: 'sms', recipients: ['Tess Nguyen', 'Mateo Rivera'], message: 'Voluntary early cut available at 21:00 — reply YES to accept.', status: 'sent' },
      { restaurantId: RESTAURANT_ID, channel: 'sms', recipients: ['Marcus Sterling'], message: 'Reservation confirmed: 4 guests at 7:30 PM. See you tonight!', status: 'sent' },
    ],
  });

  console.log('✓ seed complete');
  console.log(`  restaurant: ${RESTAURANT_ID}`);
  console.log(`  staff PINs: Marco 1111 · Zach 2222 · Maya 3333 · Priya 6666`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
