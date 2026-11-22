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
const MODG = (n: number) => uuid('f1f1f1f1', n);
const MODO = (n: number) => uuid('f2f2f2f2', n);

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
  await prisma.menuItemModifier.deleteMany();
  await prisma.modifierOption.deleteMany();
  await prisma.modifierGroup.deleteMany();
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
      name: 'Chefuffle Downtown Flagship',
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
  const streets = ['King St W', 'Queen St W', 'Dundas St W', 'College St', 'Queen St E'];
  await prisma.staff.createMany({
    data: staffSeed.map((s) => ({
      id: STAFF(s.n),
      restaurantId: RESTAURANT_ID,
      name: s.name,
      role: s.role,
      pin: s.pin,
      hourlyRate: s.rate,
      phone: `+1 555-01${String(20 + s.n).padStart(2, '0')}`,
      email: `${s.name.toLowerCase().replace(/[^a-z]+/g, '.')}@restaurant.local`,
      address: `${120 + s.n * 7} ${streets[s.n % streets.length]}, Toronto, ON`,
      startDate: new Date(now.getFullYear() - 1 - (s.n % 3), (s.n * 3) % 12, 1 + (s.n % 27)),
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
    { n: 1, name: "Cocktails", order: 1 },
    { n: 2, name: "Frozen", order: 2 },
    { n: 3, name: "Margaritas", order: 3 },
    { n: 4, name: "Sangria & Spritz", order: 4 },
    { n: 5, name: "Classics", order: 5 },
    { n: 6, name: "Wine", order: 6 },
    { n: 7, name: "Beer", order: 7 },
    { n: 8, name: "Zero-proof", order: 8 },
    { n: 9, name: "Features", order: 9 },
    { n: 10, name: "Sushi", order: 10 },
    { n: 11, name: "Start & Share", order: 11 },
    { n: 12, name: "Bowls", order: 12 },
    { n: 13, name: "Greens", order: 13 },
    { n: 14, name: "Pasta", order: 14 },
    { n: 15, name: "Handhelds", order: 15 },
    { n: 16, name: "Mains", order: 16 },
    { n: 17, name: "Signature Steaks", order: 17 },
    { n: 18, name: "\u00c0 La Carte Steaks", order: 18 },
    { n: 19, name: "Desserts", order: 19 },
    { n: 20, name: "Happy Hour Eats", order: 20 },
    { n: 21, name: "Happy Hour Drinks", order: 21 },
  ];
  await prisma.menuCategory.createMany({
    data: categories.map((c) => ({
      id: CATEGORY(c.n), restaurantId: RESTAURANT_ID, name: c.name, displayOrder: c.order,
    })),
  });

  // C-JAYS RESTAURANT MENU (from MENU/C-JAYS RESTAURANT MENU.docx).
  const menuSeed: Array<{
    n: number; cat: number; name: string; desc: string; price: string;
    station: KdsStation; course: string; prep: number; tags: string[];
    is86?: boolean; reason?: string;
  }> = [
    { n: 1, cat: 1, name: "Midnight Hour (2oz)", desc: "espresso martini with smirnoff vodka, kahlua, fresh espresso, chocolate bitters", price: '16.75', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 2, cat: 1, name: "After Dark (2oz)", desc: "tiramisu espresso martini with smirnoff vodka, bacardi superior, fresh espresso, orgeat, evaporated milk, shaved dark chocolate *contains dairy", price: '17.25', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 3, cat: 1, name: "Penicillin (2oz)", desc: "johnnie walker black, honey, ginger, lemon, lagavulin peated whisky", price: '18.25', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 4, cat: 1, name: "Sunset Soda (1.25oz)", desc: "absolut mandrin vodka, soda, bellini slush", price: '11.00', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 5, cat: 1, name: "Moscow Mule (1oz)", desc: "smirnoff vodka, fresh squeezed lime, fever-tree ginger beer, served in a copper cup", price: '14.25', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 6, cat: 2, name: "Spiked Frapp (1.5oz)", desc: "smirnoff vodka, cold brew coffee, chocolate, milk, organic cocoa nibs *contains dairy", price: '14.50', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 7, cat: 2, name: "The Bellini (2oz)", desc: "bacardi superior, peach schnapps, sparkling wine, peach, sangria", price: '14.00', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 8, cat: 3, name: "Cadillac Margarita (2oz)", desc: "don julio reposado, grand marnier, fresh lime", price: '23.00', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 9, cat: 3, name: "Jalape\u00f1o Margarita (2oz)", desc: "cazadores reposado, triple sec, lime, jalapen\u0303o, cilantro, smoked chili salt", price: '16.75', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail", "Spicy"] },
    { n: 10, cat: 3, name: "Classic Margarita (2oz)", desc: "cazadores reposado, triple sec, fresh lime", price: '14.75', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 11, cat: 3, name: "Sugar-Free Margarita (2oz)", desc: "cazadores reposado, fresh lime, zero sugar, all the flavour", price: '15.50', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 12, cat: 3, name: "Mezcal Margarita (2oz)", desc: "400 Conejos mezcal, Cuervo Tradicional Plata, triple sec, charred pineapple, fresh lime.", price: '16.50', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 13, cat: 3, name: "Blood 'N Blanco (2oz)", desc: "casamigos blanco, triple sec, mango soju, blood orange, lime, orange", price: '18.25', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 14, cat: 4, name: "Red Signature Sangria (6oz)", desc: "zinfandel, apricot brandy, fresh strawberries, raspberries, sprite, bellini slush", price: '14.75', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 15, cat: 4, name: "White Signature Sangria (6oz)", desc: "sauvignon blanc, apricot brandy, fresh raspberries, pear, soda, bellini slush", price: '14.75', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 16, cat: 4, name: "Aperol Spritz (5oz)", desc: "sparkling wine, aperol, soda, orange", price: '15.75', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 17, cat: 4, name: "Hugo Spritz (3oz)", desc: "beefeater gin, st. germain elderflower liqueur, fresh lime, sparkling wine, soda, cucumber, fresh mint", price: '15.75', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 18, cat: 5, name: "Paper Crane (2.25oz)", desc: "suntory toki whisky, aperol, amaro montenegro, fresh lemon, origami crane", price: '16.00', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 19, cat: 5, name: "Negroni (3oz)", desc: "beefeater london dry gin, campari, sweet vermouth, orange zest", price: '17.00', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 20, cat: 5, name: "Signature Caesar (1oz)", desc: "smirnoff vodka, signature spices, clamato, cornichon, bocconcini, chorizo", price: '14.25', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 21, cat: 5, name: "Whisky Sour (2oz)", desc: "bearface triple oak whisky, fresh lemon, lime, egg whites, angostura bitters", price: '16.25', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 22, cat: 5, name: "Old Fashioned (2oz)", desc: "bearface triple oak whisky, scrappy\u2019s orange bitters, angostura, maple, amarena cherry", price: '17.50', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 23, cat: 5, name: "Salted Caramel Old Fashioned (2.25oz)", desc: "traveller whiskey, grand marnier, salted caramel, chocolate and orange bitters, amarena cherry", price: '18.50', station: 'bar', course: 'drink', prep: 180, tags: ["Cocktail"] },
    { n: 24, cat: 6, name: "Codorn\u00edu Brut Clasico Cava (200ml)", desc: "Sparkling \u00b7 Penedes, Spain. Vegan-friendly, organic.", price: '15.50', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 25, cat: 6, name: "Piccini 'Venetian Dress' Prosecco", desc: "Sparkling \u00b7 Veneto, Italy. Vegan-friendly, organic. Bottle.", price: '78.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 26, cat: 6, name: "Blue Mountain Gold Label Sparkling", desc: "Sparkling \u00b7 South Okanagan, BC. Bottle.", price: '85.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 27, cat: 6, name: "Tomato Wheels Lambrusco", desc: "Sparkling \u00b7 Emilia-Romagna, Italy. Bottle.", price: '95.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 28, cat: 6, name: "Veuve Clicquot Champagne", desc: "Sparkling \u00b7 Champagne, France. Bottle.", price: '178.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 29, cat: 6, name: "Dom P\u00e9rignon Champagne", desc: "Sparkling \u00b7 Champagne, France. Bottle.", price: '523.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 30, cat: 6, name: "Amour de Tropez", desc: "Ros\u00e9 \u00b7 Provence, France. Bottle 77 \u00b7 9oz 26.25 \u00b7 6oz 17.50.", price: '77.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 31, cat: 6, name: "Narrative", desc: "Ros\u00e9 \u00b7 Summerland, BC. Vegan-friendly, organic. Bottle.", price: '69.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 32, cat: 6, name: "Portal Da Cal\u00e7ada Reserva Vinho Verde", desc: "Aromatic Whites \u00b7 Northwest Portugal. Bottle.", price: '58.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 33, cat: 6, name: "Phantom Creek Riesling", desc: "Aromatic Whites \u00b7 Oliver, BC. Bottle 62.25 \u00b7 9oz 21.50 \u00b7 6oz 14.25.", price: '62.25', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 34, cat: 6, name: "See Ya Later '5 Senses' Gew\u00fcrztraminer", desc: "Aromatic Whites \u00b7 Okanagan Falls, BC. Bottle.", price: '57.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 35, cat: 6, name: "Monvin", desc: "Pinot Gris / Grigio \u00b7 Puglia, Italy. Vegan-friendly. Bottle 50.50 \u00b7 9oz 17.25 \u00b7 6oz 11.50.", price: '50.50', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 36, cat: 6, name: "Gray Monk", desc: "Pinot Gris / Grigio \u00b7 Pacific Northwest. Bottle 60.50 \u00b7 9oz 20.75 \u00b7 6oz 13.75.", price: '60.50', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 37, cat: 6, name: "Scarpetta", desc: "Pinot Gris / Grigio \u00b7 Friuli, Italy. Vegan-friendly. Bottle.", price: '74.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 38, cat: 6, name: "Burrowing Owl", desc: "Pinot Gris / Grigio \u00b7 Oliver, BC. Bottle.", price: '86.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 39, cat: 6, name: "Winemaker's Cut", desc: "Sauvignon Blanc \u00b7 Oliver, BC. Vegan-friendly, organic. Bottle.", price: '62.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 40, cat: 6, name: "K\u014dparepare", desc: "Sauvignon Blanc \u00b7 Marlborough, New Zealand. Vegan-friendly. Bottle 70.50 \u00b7 9oz 24 \u00b7 6oz 16.", price: '70.50', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 41, cat: 6, name: "La Frenz", desc: "Sauvignon Blanc \u00b7 Penticton, BC. Bottle 79.25 \u00b7 9oz 27 \u00b7 6oz 18.", price: '79.25', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 42, cat: 6, name: "Bailly-Reverdy 'La Mercy-Dieu' Sancerre", desc: "Sauvignon Blanc \u00b7 Loire Valley, France. Bottle.", price: '110.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 43, cat: 6, name: "Orin Swift 'Blank Stare'", desc: "Sauvignon Blanc \u00b7 Russian River Valley, California. Bottle.", price: '98.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 44, cat: 6, name: "JoieFarm", desc: "Chardonnay \u00b7 Naramata, BC. Vegan-friendly, organic. Bottle.", price: '74.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 45, cat: 6, name: "Roland Lavantureux Chablis", desc: "Chardonnay \u00b7 Burgundy, France. Bottle.", price: '117.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 46, cat: 6, name: "Salentein 'Reserve'", desc: "Chardonnay \u00b7 Mendoza, Argentina. Vegan-friendly, organic. Bottle 72.50 \u00b7 9oz 24.75 \u00b7 6oz 16.50.", price: '72.50', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 47, cat: 6, name: "Giant Steps", desc: "Chardonnay \u00b7 Yarra Valley, Australia. Vegan-friendly. Bottle.", price: '98.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 48, cat: 6, name: "Frog's Leap 'Shale and Stone'", desc: "Chardonnay \u00b7 Napa Valley, California. Vegan-friendly, organic. Bottle.", price: '140.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 49, cat: 6, name: "Checkmate 'Fool's Mate'", desc: "Chardonnay \u00b7 Oliver, BC. Vegan-friendly, organic. Bottle.", price: '165.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 50, cat: 6, name: "Tread Softly", desc: "Pinot Noir \u00b7 South Australia. Vegan-friendly, organic. Bottle 57 \u00b7 9oz 19.50 \u00b7 6oz 13.", price: '57.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 51, cat: 6, name: "Origen Reserva", desc: "Pinot Noir \u00b7 Leyda Valley, Chile. Bottle.", price: '64.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 52, cat: 6, name: "Averill Creek", desc: "Pinot Noir \u00b7 Vancouver Island, BC. Bottle.", price: '76.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 53, cat: 6, name: "Ghost Rock 'Supernatural'", desc: "Pinot Noir \u00b7 Tasmania, Australia. Vegan-friendly, organic. Bottle.", price: '86.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 54, cat: 6, name: "Domaine Berthier 'Les Originals'", desc: "Pinot Noir \u00b7 Loire Valley, France. Vegan-friendly, organic. Bottle.", price: '96.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 55, cat: 6, name: "Domaine Faiveley Mercurey 'Vielles Vignes'", desc: "Pinot Noir \u00b7 Burgundy, France. Vegan-friendly, organic. Bottle.", price: '152.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 56, cat: 6, name: "Martin's Lane 'Simes Vineyard'", desc: "Pinot Noir \u00b7 Kelowna, BC. Organic. Bottle.", price: '191.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 57, cat: 6, name: "Haywire Gamay", desc: "Medium Bodied Reds \u00b7 Summerland, BC. Vegan-friendly, organic. Bottle.", price: '69.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 58, cat: 6, name: "Tenuta di Arceno Chianti Classico", desc: "Medium Bodied Reds \u00b7 Tuscany, Italy. Vegan-friendly, organic. Bottle.", price: '92.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 59, cat: 6, name: "Santa Vittoria Barbera", desc: "Medium Bodied Reds \u00b7 Piedmont, Italy. Bottle.", price: '56.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 60, cat: 6, name: "Faustino 'Art Collection' Crianza Tempranillo", desc: "Medium Bodied Reds \u00b7 Rioja, Spain. Organic. Bottle.", price: '52.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 61, cat: 6, name: "G.D. Vajra Nebbiolo", desc: "Medium Bodied Reds \u00b7 Piedmont, Italy. Organic. Bottle.", price: '89.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 62, cat: 6, name: "Remelluri Rioja Riserva Tempranillo", desc: "Medium Bodied Reds \u00b7 Rioja, Spain. Organic. Bottle.", price: '116.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 63, cat: 6, name: "Tinhorn Creek Merlot", desc: "Medium Bodied Reds \u00b7 Oliver, BC. Bottle 57 \u00b7 9oz 21.50 \u00b7 6oz 14.25.", price: '57.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 64, cat: 6, name: "Mission Hill 'Reserve' Merlot", desc: "Medium Bodied Reds \u00b7 Kelowna, BC. Bottle.", price: '68.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 65, cat: 6, name: "San Polo Brunello di Montalcino", desc: "Medium Bodied Reds \u00b7 Tuscany, Italy. Vegan-friendly, organic. Bottle.", price: '182.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 66, cat: 6, name: "Occhipinti 'SP68' Rosso Frappato", desc: "Medium Bodied Reds \u00b7 Sicily, Italy. Vegan-friendly, organic. Bottle.", price: '108.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 67, cat: 6, name: "Monvin", desc: "Cabernet Sauvignon & Blends \u00b7 Veneto, Italy. Vegan-friendly. Bottle 50.50 \u00b7 9oz 17.25 \u00b7 6oz 11.50.", price: '50.50', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 68, cat: 6, name: "Ch\u00e2teau Dauzac 'D de Dauzac' Cabernet Merlot", desc: "Cabernet Sauvignon & Blends \u00b7 Bordeaux, France. Vegan-friendly. Bottle.", price: '64.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 69, cat: 6, name: "Torres 'Gran Coronas'", desc: "Cabernet Sauvignon & Blends \u00b7 Penedes, Spain. Vegan-friendly, organic. Bottle 79.25 \u00b7 9oz 27 \u00b7 6oz 18.", price: '79.25', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 70, cat: 6, name: "Quails' Gate 'Field & Flight'", desc: "Cabernet Sauvignon & Blends \u00b7 Pacific Northwest. Bottle.", price: '92.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 71, cat: 6, name: "Black Hills 'Nota Bene' Bordeaux Blend", desc: "Cabernet Sauvignon & Blends \u00b7 Osoyoos, BC. Bottle.", price: '140.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 72, cat: 6, name: "S by Signorello", desc: "Cabernet Sauvignon & Blends \u00b7 Napa Valley, California. Bottle.", price: '216.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 73, cat: 6, name: "Punch In The Face Shiraz", desc: "Full Bodied Reds \u00b7 South Australia. Bottle 68.25 \u00b7 9oz 23.25 \u00b7 6oz 15.50.", price: '68.25', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 74, cat: 6, name: "Primaia 'SerPrimo' Super Tuscan", desc: "Full Bodied Reds \u00b7 Tuscany, Italy. Organic. Bottle.", price: '84.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 75, cat: 6, name: "Circus Malbec", desc: "Full Bodied Reds \u00b7 Mendoza, Argentina. Bottle 58.25 \u00b7 9oz 20 \u00b7 6oz 13.25.", price: '58.25', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 76, cat: 6, name: "Burrowing Owl Cabernet Franc", desc: "Full Bodied Reds \u00b7 Oliver, BC. Bottle.", price: '100.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 77, cat: 6, name: "Antinori Tignanello Super Tuscan", desc: "Full Bodied Reds \u00b7 Tuscany, Italy. Bottle.", price: '316.00', station: 'bar', course: 'drink', prep: 120, tags: ["Wine"] },
    { n: 78, cat: 7, name: "Longboard Light", desc: "By Four Winds, Delta, BC (3.2%)", price: '9.00', station: 'bar', course: 'drink', prep: 60, tags: ["Beer"] },
    { n: 79, cat: 7, name: "Coors Light", desc: "USA (4%)", price: '8.75', station: 'bar', course: 'drink', prep: 60, tags: ["Beer"] },
    { n: 80, cat: 7, name: "Longboard", desc: "By Granville Island Brewing, Vancouver, BC (5%)", price: '9.00', station: 'bar', course: 'drink', prep: 60, tags: ["Beer"] },
    { n: 81, cat: 7, name: "Heineken", desc: "Netherlands (5%)", price: '10.25', station: 'bar', course: 'drink', prep: 60, tags: ["Beer"] },
    { n: 82, cat: 7, name: "Asahi Super Dry", desc: "Japan (5%)", price: '10.50', station: 'bar', course: 'drink', prep: 60, tags: ["Beer"] },
    { n: 83, cat: 7, name: "Blue Moon", desc: "USA (5.4%)", price: '9.25', station: 'bar', course: 'drink', prep: 60, tags: ["Beer"] },
    { n: 84, cat: 7, name: "Parallel 49 Stir Crazy Hazy", desc: "Vancouver, BC (4.5%)", price: '9.25', station: 'bar', course: 'drink', prep: 60, tags: ["Beer"] },
    { n: 85, cat: 7, name: "Epic", desc: "By Parallel 49 Brewing, Vancouver, BC (6.5%)", price: '9.00', station: 'bar', course: 'drink', prep: 60, tags: ["Beer"] },
    { n: 86, cat: 7, name: "Guinness (20oz)", desc: "Ireland (4.2%)", price: '12.75', station: 'bar', course: 'drink', prep: 60, tags: ["Beer"] },
    { n: 87, cat: 7, name: "Corona (330ml)", desc: "Mexico \u00b7 4.6%.", price: '10.25', station: 'bar', course: 'drink', prep: 60, tags: ["Beer"] },
    { n: 88, cat: 7, name: "Lonetree Dry Cider (473ml)", desc: "5.5%.", price: '10.50', station: 'bar', course: 'drink', prep: 60, tags: ["Beer"] },
    { n: 89, cat: 7, name: "33 Acres of Life", desc: "Vancouver, BC (4.8%). 14oz.", price: '9.00', station: 'bar', course: 'drink', prep: 60, tags: ["Beer"] },
    { n: 90, cat: 8, name: "De Nada Limonada", desc: "brazil\u2019s famous lemonade with whole lime, sweetened condensed milk", price: '8.50', station: 'bar', course: 'drink', prep: 180, tags: ["Zero-Proof"] },
    { n: 91, cat: 8, name: "Dolce Vita Spritz", desc: "martini vibrante non-alc red vermouth, oddbird blanc de blancs non-alc sparkling, lemon-lime soda", price: '12.75', station: 'bar', course: 'drink', prep: 180, tags: ["Zero-Proof"] },
    { n: 92, cat: 8, name: "Virgin Signature Caesar", desc: "signature spices, clamato, cornichon, bocconcini, chorizo", price: '8.75', station: 'bar', course: 'drink', prep: 180, tags: ["Zero-Proof"] },
    { n: 93, cat: 8, name: "Soul Revival", desc: "fever-tree ginger beer, mango, lime, turmeric, jalape\u00f1o", price: '9.00', station: 'bar', course: 'drink', prep: 180, tags: ["Zero-Proof"] },
    { n: 94, cat: 8, name: "Fever-Tree Sparkling", desc: "", price: '7.75', station: 'bar', course: 'drink', prep: 180, tags: ["Zero-Proof"] },
    { n: 95, cat: 8, name: "Virgin Mojito", desc: "mint, fresh lime, sugar, soda", price: '8.75', station: 'bar', course: 'drink', prep: 180, tags: ["Zero-Proof"] },
    { n: 96, cat: 8, name: "Hey Hibiscus", desc: "hibiscus, rose, ginger, white peach, lemon, soda", price: '9.00', station: 'bar', course: 'drink', prep: 180, tags: ["Zero-Proof"] },
    { n: 97, cat: 8, name: "Margarita Zero", desc: "hp agave non-alc tequila, martini floreale non-alc white vermouth, agave, orange, lime", price: '10.75', station: 'bar', course: 'drink', prep: 180, tags: ["Zero-Proof"] },
    { n: 98, cat: 8, name: "Little Pearl", desc: "Kiwi, cucumber, mint, soda, popping passion fruit pearls.", price: '9.00', station: 'bar', course: 'drink', prep: 180, tags: ["Zero-Proof"] },
    { n: 99, cat: 8, name: "Heineken 0.0%", desc: "non-alcoholic beer", price: '8.25', station: 'bar', course: 'drink', prep: 180, tags: ["Zero-Proof"] },
    { n: 100, cat: 8, name: "Nonny West Coast IPA 0.5%", desc: "Non-alcoholic beer.", price: '9.00', station: 'bar', course: 'drink', prep: 180, tags: ["Zero-Proof"] },
    { n: 101, cat: 8, name: "Oddbird Blanc de Blancs", desc: "Non-alcoholic sparkling wine (France). 6oz 13.25 | bottle 57.", price: '13.25', station: 'bar', course: 'drink', prep: 180, tags: ["Zero-Proof"] },
    { n: 102, cat: 9, name: "Wagyu Beef Carpaccio", desc: "peppercorn-crusted wagyu beef, bearnaise aioli, capers, arugula, pickled onions, freshly grated horseradish, grilled bread", price: '25.25', station: 'cold_larder', course: 'starter', prep: 300, tags: ["Starter", "Signature"] },
    { n: 103, cat: 9, name: "Pan Seared Salmon", desc: "lobster tarragon butter sauce, fennel, peas, lemon marmalade", price: '37.00', station: 'saute_fryer', course: 'main', prep: 720, tags: ["Main"] },
    { n: 104, cat: 9, name: "New York Cheesecake", desc: "graham cracker crust, raspberries, hand-whipped cream", price: '13.50', station: 'pastry_dessert', course: 'dessert', prep: 240, tags: ["Dessert"] },
    { n: 105, cat: 10, name: "Tuna Temaki", desc: "ocean wise\u2122 ahi, toasted sesame, cucumber, serrano pepper, nori, green onion", price: '15.25', station: 'cold_larder', course: 'starter', prep: 360, tags: ["Starter", "Raw"] },
    { n: 106, cat: 10, name: "Salmon Aburi", desc: "flame torched salmon, crispy tempura, serrano pepper, soy glaze", price: '21.25', station: 'cold_larder', course: 'starter', prep: 360, tags: ["Starter", "Raw"] },
    { n: 107, cat: 10, name: "Prawn Crunch", desc: "crispy prawn, mango, avocado, sesame soy paper, sriracha mayo, soy glaze", price: '20.75', station: 'cold_larder', course: 'starter', prep: 360, tags: ["Starter", "Raw"] },
    { n: 108, cat: 10, name: "Yuzu Crab Temaki", desc: "citrus, nori, chive", price: '23.00', station: 'cold_larder', course: 'starter', prep: 360, tags: ["Starter", "Raw"] },
    { n: 109, cat: 10, name: "The Sushi Set", desc: "yuzu crab temaki, prawn crunch roll, torched salmon aburi, tuna temaki", price: '33.75', station: 'cold_larder', course: 'starter', prep: 360, tags: ["Starter", "Signature", "Raw"] },
    { n: 110, cat: 11, name: "Sticky Garlic Ribs", desc: "st. louis pork ribs, fish sauce caramel, chili, cilantro, lime", price: '25.25', station: 'grill', course: 'starter', prep: 600, tags: ["Starter", "Signature"] },
    { n: 111, cat: 11, name: "Creole Crab & Spinach Dip", desc: "corn tortilla chips", price: '20.75', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Starter", "Spicy"] },
    { n: 112, cat: 11, name: "Warm Pull Apart Brioche", desc: "parker rolls baked in-house, honey truffle butter", price: '10.75', station: 'pastry_dessert', course: 'starter', prep: 300, tags: ["Starter", "Vegetarian"] },
    { n: 113, cat: 11, name: "Hot Chicken & Pickles", desc: "crispy fried chicken, nashville spice, honey, creamy parmesan dip", price: '20.00', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Starter", "Spicy"] },
    { n: 114, cat: 11, name: "Crispy Yam Fries", desc: "garlic aioli", price: '14.75', station: 'saute_fryer', course: 'starter', prep: 420, tags: ["Starter", "Vegetarian"] },
    { n: 115, cat: 11, name: "Truffle Fries", desc: "truffle, herbs, grana padano, garlic aioli", price: '14.75', station: 'saute_fryer', course: 'starter', prep: 420, tags: ["Starter", "Vegetarian"] },
    { n: 116, cat: 11, name: "Avocado Dip", desc: "pico de gallo, feta, chili oil, cilantro, fresh lime", price: '15.75', station: 'cold_larder', course: 'starter', prep: 480, tags: ["Starter", "Vegetarian"] },
    { n: 117, cat: 11, name: "Wagyu Beef Carpaccio", desc: "peppercorn-crusted wagyu beef, bearnaise aioli, capers, arugula, pickled onions, freshly grated horseradish, grilled bread", price: '25.25', station: 'cold_larder', course: 'starter', prep: 480, tags: ["Starter", "Signature"] },
    { n: 118, cat: 11, name: "Chili Citrus Calamari", desc: "Crispy fried, chilis, Szechuan peppercorn, citrus dip.", price: '21.25', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Starter"] },
    { n: 119, cat: 11, name: "Ravioli & Prawn Trio", desc: "butternut squash and mascarpone ravioli, truffle butter, saut\u00e9ed prawns, pine nuts, crispy sage", price: '20.50', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Starter"] },
    { n: 120, cat: 11, name: "Mini Crispy Chicken Sandwiches", desc: "spicy panko-crusted chicken, swiss cheese, sambal mayo, lettuce, tomato, pickle, onion", price: '20.25', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Starter"] },
    { n: 121, cat: 11, name: "Szechuan Lettuce Wraps", desc: "Sweet and spicy Szechuan glaze, peanuts, wontons, Korean chili sauce, spicy yogurt. Choice of chicken or tofu.", price: '25.50', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Starter", "Spicy"] },
    { n: 122, cat: 12, name: "The Med Bowl", desc: "falafel, grilled shawarma chicken, turmeric rice, beetroot hummus, kale, cucumber, red onion, tomatoes, feta, kalamata olives, yogurt, pickled red cabbage", price: '27.25', station: 'cold_larder', course: 'main', prep: 420, tags: ["Main"] },
    { n: 123, cat: 12, name: "Tuna Poke Bowl", desc: "sesame ginger ocean wise\u2122 ahi, jasmine rice, mango, cucumber, avocado, edamame, ginger, radish, crispy tempura", price: '28.50', station: 'cold_larder', course: 'main', prep: 420, tags: ["Main"] },
    { n: 124, cat: 12, name: "Crispy Tofu Bowl", desc: "100% plant-based. Soy chili tofu, jasmine rice, mango, cucumber, avocado, edamame, ginger, radish.", price: '26.50', station: 'cold_larder', course: 'main', prep: 420, tags: ["Main", "Vegan"] },
    { n: 125, cat: 13, name: "Lemongrass Noodle Salad", desc: "rice noodles, fresh greens, peanuts, avocado, green papaya, cabbage, thai basil, tomato, sweet chili nuoc cham", price: '19.25', station: 'cold_larder', course: 'starter', prep: 300, tags: ["Starter"] },
    { n: 126, cat: 13, name: "Green Goddess Salad", desc: "avocado, tomatoes, macedonian feta, spicy pecans, egg, green goddess dressing", price: '19.75', station: 'cold_larder', course: 'starter', prep: 300, tags: ["Starter", "Vegetarian"] },
    { n: 127, cat: 13, name: "Avocado Kale Salad", desc: "crispy chickpeas, grilled avocado, pickled red cabbage, fennel chili crumb, grana padano, lemon garlic dressing", price: '18.75', station: 'cold_larder', course: 'starter', prep: 300, tags: ["Starter", "Vegetarian"] },
    { n: 128, cat: 14, name: "Bolognese", desc: "truffled pecorino, slow cooked beef and pork ragu, rosemary, fennel chili crumb", price: '28.25', station: 'saute_fryer', course: 'main', prep: 600, tags: ["Main", "Signature"] },
    { n: 129, cat: 14, name: "Spaghetti Portofino", desc: "saut\u00e9ed prawns, lobster lemon butter sauce, roasted gem tomatoes, corn, fennel chili crumb", price: '30.25', station: 'saute_fryer', course: 'main', prep: 600, tags: ["Main"] },
    { n: 130, cat: 14, name: "Butternut Squash Ravioli With Prawns", desc: "butternut squash and mascarpone ravioli, truffle butter, saut\u00e9ed prawns, pine nuts, crispy sage", price: '36.00', station: 'saute_fryer', course: 'main', prep: 600, tags: ["Main"] },
    { n: 131, cat: 15, name: "Cactus Burger", desc: "canadian brisket and chuck, saut\u00e9ed mushrooms, aged cheddar, smoked bacon, burger sauce, sesame brioche bun", price: '27.75', station: 'grill', course: 'main', prep: 600, tags: ["Main", "Signature"] },
    { n: 132, cat: 15, name: "Bacon Cheddar Burger", desc: "canadian brisket and chuck, aged cheddar, smoked bacon, burger sauce, sesame brioche bun", price: '26.50', station: 'grill', course: 'main', prep: 600, tags: ["Main"] },
    { n: 133, cat: 15, name: "Gardenburger\u00ae", desc: "aged cheddar, burger sauce, sesame brioche bun", price: '24.25', station: 'grill', course: 'main', prep: 600, tags: ["Main", "Vegetarian"] },
    { n: 134, cat: 15, name: "Chicken Tenders", desc: "panko-breaded chicken, sea salted fries, honey mustard dip", price: '22.75', station: 'saute_fryer', course: 'main', prep: 600, tags: ["Main"] },
    { n: 135, cat: 15, name: "Chipotle Chicken Tacos", desc: "achiote chicken, pineapple, cilantro, avocado crema, flour tortilla", price: '21.50', station: 'saute_fryer', course: 'main', prep: 600, tags: ["Main", "Spicy"] },
    { n: 136, cat: 15, name: "Baja Fish Tacos", desc: "beer battered ocean wise\u2122 pacific cod, pico de gallo, pickled cabbage, valentina garlic mayo, avocado crema, flour tortilla", price: '23.25', station: 'saute_fryer', course: 'main', prep: 600, tags: ["Main"] },
    { n: 137, cat: 15, name: "Crispy Chicken Sandwich", desc: "spicy panko-crusted chicken, swiss cheese, sambal mayo, lettuce, tomato, pickle, onion", price: '25.25', station: 'saute_fryer', course: 'main', prep: 600, tags: ["Main"] },
    { n: 138, cat: 15, name: "Cajun Chicken Sandwich", desc: "blackened cajun chicken, aged cheddar, lettuce, tomato, mayonnaise, potato bun", price: '25.00', station: 'saute_fryer', course: 'main', prep: 600, tags: ["Main"] },
    { n: 139, cat: 16, name: "Miso Caramel Sea Bass", desc: "Dashi butter, rice, green vegetables.", price: '52.00', station: 'saute_fryer', course: 'main', prep: 720, tags: ["Main", "Signature"] },
    { n: 140, cat: 16, name: "Pan Seared Salmon", desc: "lobster tarragon butter sauce, fennel, peas, lemon marmalade", price: '37.00', station: 'saute_fryer', course: 'main', prep: 720, tags: ["Main"] },
    { n: 141, cat: 16, name: "Truffle Parmesan Chicken", desc: "parmesan crusted chicken breast, roasted and grilled mushrooms, potato gnocchi, truffle mushroom cream sauce, arugula", price: '36.50', station: 'saute_fryer', course: 'main', prep: 720, tags: ["Main", "Signature"] },
    { n: 142, cat: 16, name: "Blackened Creole Chicken", desc: "creole butter, cajun spices, buttered mashed potatoes, seasonal vegetables", price: '35.00', station: 'saute_fryer', course: 'main', prep: 720, tags: ["Main", "Spicy"] },
    { n: 143, cat: 16, name: "Thai Red Curry", desc: "Red coconut curry, jasmine rice, bok choy, baby corn, bamboo shoots, crispy rice, Thai basil, cilantro, chilis. Choice of chicken (26) or tofu (24).", price: '26.00', station: 'saute_fryer', course: 'main', prep: 720, tags: ["Main"] },
    { n: 144, cat: 17, name: "Peppercorn Ribeye", desc: "45 day aged 14oz CAB\u00ae ribeye, brandy peppercorn sauce. Served with buttered mashed potatoes and seasonal vegetables.", price: '77.25', station: 'grill', course: 'main', prep: 900, tags: ["Main", "Signature", "GF"] },
    { n: 145, cat: 17, name: "Mushroom Striploin", desc: "12oz CAB\u00ae New York striploin, grilled oyster mushrooms, button mushrooms, red wine jus. Served with buttered mashed potatoes and seasonal vegetables.", price: '64.00', station: 'grill', course: 'main', prep: 900, tags: ["Main", "Signature", "GF"] },
    { n: 146, cat: 17, name: "Filet & Lobster", desc: "CAB\u00ae filet, Atlantic lobster tail, grilled lemon. Served with buttered mashed potatoes and seasonal vegetables.", price: '81.25', station: 'grill', course: 'main', prep: 900, tags: ["Main", "Signature", "GF"] },
    { n: 147, cat: 17, name: "Creole Steak & Prawns", desc: "8oz CAB\u00ae sirloin, cajun spices, spicy creole butter, white wine saut\u00e9ed creole prawns.", price: '50.25', station: 'grill', course: 'main', prep: 900, tags: ["Main", "Spicy", "GF"] },
    { n: 148, cat: 17, name: "Steak Frites", desc: "8oz CAB\u00ae sirloin, kale salad, horseradish cream, sea salted fries.", price: '39.75', station: 'grill', course: 'main', prep: 900, tags: ["Main", "Signature", "GF"] },
    { n: 149, cat: 18, name: "8oz CAB Sirloin", desc: "Served with buttered mashed potatoes and seasonal vegetables.", price: '39.75', station: 'grill', course: 'main', prep: 900, tags: ["Main", "GF"] },
    { n: 150, cat: 18, name: "14oz CAB Ribeye", desc: "Served with buttered mashed potatoes and seasonal vegetables.", price: '73.00', station: 'grill', course: 'main', prep: 900, tags: ["Main", "GF"] },
    { n: 151, cat: 18, name: "CAB Filet", desc: "Served with buttered mashed potatoes and seasonal vegetables.", price: '57.50', station: 'grill', course: 'main', prep: 900, tags: ["Main", "GF"] },
    { n: 152, cat: 18, name: "12oz CAB New York Striploin", desc: "Served with buttered mashed potatoes and seasonal vegetables.", price: '58.00', station: 'grill', course: 'main', prep: 900, tags: ["Main", "GF"] },
    { n: 153, cat: 19, name: "London Fog Cr\u00e8me Br\u00fbl\u00e9e", desc: "blueberries, brown sugar, vanilla", price: '11.50', station: 'pastry_dessert', course: 'dessert', prep: 240, tags: ["Dessert"] },
    { n: 154, cat: 19, name: "Six Layer Chocolate Slice", desc: "tahitian vanilla ice cream, cherrymade to share", price: '20.00', station: 'pastry_dessert', course: 'dessert', prep: 240, tags: ["Dessert"] },
    { n: 155, cat: 19, name: "Chocolate Lava Cake", desc: "molten dark chocolate cake, tahitian vanilla ice cream", price: '14.25', station: 'pastry_dessert', course: 'dessert', prep: 240, tags: ["Dessert"] },
    { n: 156, cat: 19, name: "Chocolate Peanut Butter Crunch Bar", desc: "tahitian vanilla ice cream, caramel sauce, crunchy chocolate pearls", price: '13.75', station: 'pastry_dessert', course: 'dessert', prep: 240, tags: ["Dessert"] },
    { n: 157, cat: 19, name: "Key Lime Pie", desc: "freshly squeezed key limes, graham cracker crust, whipped cream", price: '13.75', station: 'pastry_dessert', course: 'dessert', prep: 240, tags: ["Dessert"] },
    { n: 158, cat: 19, name: "New York Cheesecake", desc: "graham cracker crust, raspberries, hand-whipped cream", price: '13.50', station: 'pastry_dessert', course: 'dessert', prep: 240, tags: ["Dessert"] },
    { n: 159, cat: 20, name: "The Niner", desc: "Smash burger, cheese, pickle, onion. Happy hour exclusive. Add fries +5.", price: '9.00', station: 'grill', course: 'main', prep: 480, tags: ["Happy Hour"] },
    { n: 160, cat: 20, name: "Truffle Fries", desc: "Truffle, herbs, grana padano, garlic aioli.", price: '9.00', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Happy Hour", "Vegetarian"] },
    { n: 161, cat: 20, name: "Avocado Dip", desc: "Pico de gallo, feta, chili oil, cilantro, fresh lime.", price: '9.00', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Happy Hour", "Vegetarian"] },
    { n: 162, cat: 20, name: "Tuna Temaki", desc: "Ocean Wise\u2122 ahi, toasted sesame, cucumber, serrano pepper, nori, green onion.", price: '10.00', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Happy Hour"] },
    { n: 163, cat: 20, name: "Avocado Kale Salad", desc: "Crispy chickpeas, grilled avocado, pickled red cabbage, fennel chili crumb, grana padano, lemon garlic dressing.", price: '13.00', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Happy Hour", "Vegetarian"] },
    { n: 164, cat: 20, name: "Hot Chicken & Pickles", desc: "Crispy fried chicken, Nashville spice, honey, creamy parmesan dip.", price: '16.00', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Happy Hour", "Spicy"] },
    { n: 165, cat: 20, name: "Prawn Crunch Roll", desc: "Crispy prawn, mango, avocado, sesame soy paper, sriracha mayo, soy glaze.", price: '16.00', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Happy Hour"] },
    { n: 166, cat: 20, name: "Salmon Aburi", desc: "Flame torched salmon, crispy tempura, serrano pepper, soy glaze.", price: '17.00', station: 'saute_fryer', course: 'starter', prep: 480, tags: ["Happy Hour"] },
    { n: 167, cat: 20, name: "Chipotle Chicken Tacos", desc: "Achiote chicken, pineapple, cilantro, avocado crema, flour tortilla.", price: '17.00', station: 'saute_fryer', course: 'main', prep: 480, tags: ["Happy Hour", "Spicy"] },
    { n: 168, cat: 20, name: "Cajun Chicken Sandwich", desc: "Blackened cajun chicken, aged cheddar, lettuce, tomato, mayonnaise, potato bun.", price: '18.00', station: 'saute_fryer', course: 'main', prep: 480, tags: ["Happy Hour"] },
    { n: 169, cat: 20, name: "Blackened Creole Chicken", desc: "Creole butter, cajun spices, buttered mashed potatoes, seasonal vegetables.", price: '28.00', station: 'saute_fryer', course: 'main', prep: 480, tags: ["Happy Hour", "Spicy"] },
    { n: 170, cat: 20, name: "Steak Frites", desc: "8oz CAB\u00ae sirloin, kale salad, horseradish cream, sea salted fries.", price: '32.00', station: 'grill', course: 'main', prep: 480, tags: ["Happy Hour", "Signature"] },
    { n: 171, cat: 21, name: "Spiked Frapp (1.5oz)", desc: "Smirnoff vodka, cold brew coffee, chocolate, milk, organic cocoa nibs.", price: '10.00', station: 'bar', course: 'drink', prep: 180, tags: ["Happy Hour"] },
    { n: 172, cat: 21, name: "The Bellini (2oz)", desc: "Bacardi Superior, peach schnapps, sparkling wine, peach, sangria.", price: '9.00', station: 'bar', course: 'drink', prep: 180, tags: ["Happy Hour"] },
    { n: 173, cat: 21, name: "Old Fashioned (2oz)", desc: "Bearface triple oak whisky, Scrappy\u2019s orange bitters, Angostura, maple, Amarena cherry.", price: '10.00', station: 'bar', course: 'drink', prep: 180, tags: ["Happy Hour"] },
    { n: 174, cat: 21, name: "Sunset Soda (1.25oz)", desc: "Absolut Mandrin vodka, soda, bellini slush.", price: '5.50', station: 'bar', course: 'drink', prep: 180, tags: ["Happy Hour"] },
    { n: 175, cat: 21, name: "Classic Margarita (2oz)", desc: "Cazadores reposado, triple sec, fresh lime.", price: '10.00', station: 'bar', course: 'drink', prep: 180, tags: ["Happy Hour"] },
    { n: 176, cat: 21, name: "Longboard Lager", desc: "Granville Island Brewing, Vancouver, BC (5%). 14oz.", price: '5.00', station: 'bar', course: 'drink', prep: 180, tags: ["Happy Hour"] },
    { n: 177, cat: 21, name: "Longboard Light Lager", desc: "Four Winds, Delta, BC (3.2%). 14oz.", price: '5.00', station: 'bar', course: 'drink', prep: 180, tags: ["Happy Hour"] },
    { n: 178, cat: 21, name: "33 Acres of Life Amber Lager", desc: "Vancouver, BC (4.8%). 14oz.", price: '6.50', station: 'bar', course: 'drink', prep: 180, tags: ["Happy Hour"] },
    { n: 179, cat: 21, name: "Parallel 49 Stir Crazy Hazy", desc: "Vancouver, BC (4.5%). 14oz.", price: '6.50', station: 'bar', course: 'drink', prep: 180, tags: ["Happy Hour"] },
    { n: 180, cat: 21, name: "Heineken", desc: "Netherlands (5%). 14oz.", price: '8.00', station: 'bar', course: 'drink', prep: 180, tags: ["Happy Hour"] },
    { n: 181, cat: 21, name: "Happy Hour Red Wine (6oz)", desc: "Monvin Cabernet. 6oz.", price: '6.00', station: 'bar', course: 'drink', prep: 180, tags: ["Happy Hour"] },
    { n: 182, cat: 21, name: "Happy Hour White Wine (6oz)", desc: "Monvin Pinot Grigio. 6oz.", price: '6.00', station: 'bar', course: 'drink', prep: 180, tags: ["Happy Hour"] },
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
      course: m.course,
      targetPrepTimeSeconds: m.prep,
      tags: m.tags,
      is86ed: m.is86 ?? false,
      eightySixReason: m.reason ?? null,
    })),
  });

  console.log('→ modifiers');
  const modifierSeed: Array<{
    n: number; name: string; kind: string; selection: 'single' | 'multi';
    required?: boolean; min?: number; max?: number; prompt?: string;
    options: Array<{ name: string; price?: string; default?: boolean }>;
  }> = [
    {
      n: 1, name: 'Temperature', kind: 'doneness', selection: 'single',
      required: true, min: 1, max: 1,
      prompt: 'Non-negotiable — choose a temperature',
      options: [
        { name: 'Blue' }, { name: 'Rare' }, { name: 'Medium Rare', default: true },
        { name: 'Medium' }, { name: 'Medium Well' }, { name: 'Well Done' },
      ],
    },
    {
      n: 2, name: 'Cooking Method', kind: 'cooking', selection: 'single',
      options: [
        { name: 'Grilled', default: true }, { name: 'Pan Seared' }, { name: 'Fried' },
        { name: 'Steamed' }, { name: 'Blackened' }, { name: 'Baked' },
      ],
    },
    {
      n: 3, name: 'Size / Portion', kind: 'size', selection: 'single',
      options: [
        { name: 'Small' }, { name: 'Medium', default: true },
        { name: 'Large', price: '4.00' }, { name: 'Half portion' }, { name: 'Full portion' },
      ],
    },
    {
      n: 4, name: 'Milk / Dairy', kind: 'milk', selection: 'single',
      options: [
        { name: 'Whole', default: true }, { name: '2%' },
        { name: 'Oat', price: '0.75' }, { name: 'Soy', price: '0.75' },
        { name: 'Almond', price: '0.75' }, { name: 'Lactose-free' },
      ],
    },
    {
      n: 5, name: 'Spice Level', kind: 'spice', selection: 'single',
      options: [
        { name: 'No spice' }, { name: 'Mild', default: true }, { name: 'Medium' },
        { name: 'Spicy' }, { name: 'Extra spicy' },
      ],
    },
    {
      n: 6, name: 'Bread / Bun', kind: 'bread', selection: 'single',
      options: [
        { name: 'White', default: true }, { name: 'Whole wheat' }, { name: 'Sourdough' },
        { name: 'Gluten-free bun', price: '2.00' }, { name: 'Tortilla' }, { name: 'Lettuce wrap' },
      ],
    },
    {
      n: 7, name: 'Side Dish', kind: 'side', selection: 'single',
      options: [
        { name: 'Fries', default: true }, { name: 'Salad' }, { name: 'Rice' },
        { name: 'Mashed potatoes' }, { name: 'Coleslaw' }, { name: 'Roasted vegetables' },
        { name: 'Sweet potato fries', price: '2.00' }, { name: 'Truffle fries', price: '3.00' },
      ],
    },
    {
      n: 8, name: 'Sauce / Dressing', kind: 'sauce', selection: 'single',
      options: [
        { name: 'Ketchup' }, { name: 'Mustard' }, { name: 'Mayo' }, { name: 'BBQ' },
        { name: 'Ranch' }, { name: 'Vinaigrette' }, { name: 'Pesto' },
        { name: 'Sauce on the side' },
      ],
    },
    {
      n: 9, name: 'Cheese', kind: 'cheese', selection: 'single',
      options: [
        { name: 'Cheddar', default: true }, { name: 'Mozzarella' }, { name: 'Swiss' },
        { name: 'Provolone' }, { name: 'Blue cheese', price: '1.00' }, { name: 'No cheese' },
      ],
    },
    {
      n: 10, name: 'Toppings', kind: 'topping', selection: 'multi', max: 3,
      prompt: 'Choose up to 3',
      options: [
        { name: 'Pepperoni', price: '2.50' }, { name: 'Mushrooms', price: '1.50' },
        { name: 'Onion', price: '1.00' }, { name: 'Peppers', price: '1.00' },
        { name: 'Olives', price: '1.50' }, { name: 'Tomato', price: '1.00' },
        { name: 'Ham', price: '3.00' }, { name: 'Extra cheese', price: '2.00' },
      ],
    },
    {
      n: 11, name: 'Dietary / Allergy', kind: 'dietary', selection: 'multi',
      options: [
        { name: 'Gluten-free', price: '2.00' }, { name: 'Vegan' },
        { name: 'Nut-free' }, { name: 'Jain (no onion/garlic)' },
      ],
    },
    {
      n: 12, name: 'Drink Size', kind: 'size', selection: 'single',
      options: [
        { name: 'Small' }, { name: 'Medium', default: true }, { name: 'Large', price: '1.50' },
      ],
    },
    {
      n: 13, name: 'Ice', kind: 'drink', selection: 'single',
      options: [{ name: 'With ice', default: true }, { name: 'No ice' }],
    },
    {
      n: 14, name: 'Coffee & Dessert Add-ons', kind: 'addon', selection: 'multi',
      options: [
        { name: 'Extra shot', price: '1.50' }, { name: 'Vanilla', price: '1.00' },
        { name: 'Caramel', price: '1.00' }, { name: 'Hazelnut', price: '1.00' },
        { name: 'Extra whipped cream', price: '1.00' }, { name: 'Extra syrup', price: '0.75' },
      ],
    },
    {
      n: 15, name: 'Steak Add-ons', kind: 'addon', selection: 'multi',
      options: [
        { name: 'Prawn skewer', price: '9.00' }, { name: 'Grilled mushrooms', price: '4.00' },
        { name: 'Red wine mushroom sauce', price: '3.00' },
        { name: 'Peppercorn sauce', price: '3.00' },
        { name: 'Blue cheese butter', price: '3.00' }, { name: 'Extra steak sauce', price: '2.00' },
      ],
    },
    {
      n: 16, name: 'Burger Add-ons', kind: 'addon', selection: 'multi',
      options: [
        { name: 'Extra cheese', price: '1.50' }, { name: 'Bacon', price: '3.00' },
        { name: 'Avocado', price: '3.00' }, { name: 'Second patty', price: '6.00' },
        { name: 'Fried egg', price: '2.00' }, { name: 'Extra sauce', price: '1.00' },
      ],
    },
    {
      n: 17, name: 'Protein Add-ons', kind: 'addon', selection: 'multi',
      options: [
        { name: 'Grilled chicken', price: '7.00' }, { name: 'Prawns', price: '9.00' },
        { name: 'Lobster', price: '14.00' }, { name: 'Tofu', price: '5.00' },
        { name: 'Salmon', price: '10.00' },
      ],
    },
    {
      n: 18, name: 'Removals', kind: 'removal', selection: 'multi',
      prompt: 'No charge',
      options: [
        { name: 'No onions' }, { name: 'No garlic' }, { name: 'No pickles' },
        { name: 'No lettuce' }, { name: 'No tomato' }, { name: 'No salt' },
        { name: 'Less oil' }, { name: 'No sugar' },
      ],
    },
    {
      n: 19, name: 'Substitutions', kind: 'sub', selection: 'single',
      options: [
        { name: 'Sub fries for sweet potato fries', price: '2.00' },
        { name: 'Sub fries for truffle fries', price: '3.00' },
        { name: 'Premium bun', price: '2.00' },
        { name: 'Lettuce wrap instead of bun' },
      ],
    },
    {
      n: 20, name: 'Sushi Add-ons', kind: 'addon', selection: 'multi',
      options: [
        { name: 'Extra ginger' }, { name: 'Extra wasabi' },
        { name: 'Spicy mayo', price: '1.00' }, { name: 'Soy paper', price: '1.00' },
      ],
    },
    {
      n: 21, name: 'Dessert Add-ons', kind: 'addon', selection: 'multi',
      options: [
        { name: 'Scoop of ice cream', price: '3.00' },
        { name: 'Extra whipped cream', price: '1.00' }, { name: 'Berries', price: '2.00' },
      ],
    },
  ];

  for (const group of modifierSeed) {
    await prisma.modifierGroup.create({
      data: {
        id: MODG(group.n),
        restaurantId: RESTAURANT_ID,
        name: group.name,
        kind: group.kind,
        selection: group.selection,
        required: group.required ?? false,
        minSelect: group.min ?? (group.required ? 1 : 0),
        maxSelect: group.max ?? (group.selection === 'single' ? 1 : 10),
        prompt: group.prompt ?? null,
        displayOrder: group.n,
      },
    });
    await prisma.modifierOption.createMany({
      data: group.options.map((option, index) => ({
        id: MODO(group.n * 100 + index + 1),
        groupId: MODG(group.n),
        name: option.name,
        priceDelta: option.price ?? '0',
        isDefault: option.default ?? false,
        displayOrder: index,
      })),
    });
  }

  const groupsByCategory: Record<number, number[]> = {
    1: [12, 13],
    2: [12, 13],
    3: [12, 13],
    4: [12, 13],
    5: [12, 13],
    6: [],
    7: [],
    8: [12, 13],
    9: [7, 8, 17, 11, 18],
    10: [20, 11, 18, 8],
    11: [8, 11, 18, 19],
    12: [17, 5, 11, 18],
    13: [8, 17, 11, 18],
    14: [17, 9, 5, 11, 18],
    15: [6, 9, 7, 16, 11, 18, 19],
    16: [7, 8, 17, 11, 18, 19],
    17: [1, 15, 8, 7, 11, 18],
    18: [1, 15, 8, 7, 11, 18],
    19: [21, 11, 18],
    20: [7, 8, 11, 18, 19],
    21: [12, 13],
  };

  const groupsForItem = (item: { cat: number; name: string }) => {
    const groups = new Set<number>(groupsByCategory[item.cat] ?? [18, 11]);
    const name = item.name.toLowerCase();
    if (/(steak|sirloin|ribeye|striploin|filet|tenderloin)/.test(name)) {
      [1, 15, 7, 8].forEach((group) => groups.add(group));
    }
    if (/(burger|sandwich|brioche|wrap)/.test(name)) {
      [6, 9, 16, 7].forEach((group) => groups.add(group));
    }
    if (/(coffee|espresso|frapp|latte|tiramisu)/.test(name)) {
      groups.add(14);
    }
    return [...groups];
  };

  await prisma.menuItemModifier.createMany({
    data: menuSeed.flatMap((item) =>
      groupsForItem(item).map((group) => ({
        menuItemId: MENU(item.n),
        groupId: MODG(group),
      })),
    ),
    skipDuplicates: true,
  });

  console.log('→ ingredients');
  const ingredientSeed: Array<{
    n: number; name: string; cat: string; stock: string; par: string; unit: string;
    cost: string; supplier: string; reorder: string;
  }> = [
    { n: 1, name: "Certified Angus Beef", cat: 'Proteins', stock: '28.000', par: '45.000', unit: 'kg', cost: '18.50', supplier: "Premium Meats", reorder: '10.000' },
    { n: 2, name: "45-Day Aged Ribeye", cat: 'Proteins', stock: '22.000', par: '35.000', unit: 'kg', cost: '52.00', supplier: "Premium Meats", reorder: '8.000' },
    { n: 3, name: "Chicken Breast", cat: 'Proteins', stock: '24.000', par: '40.000', unit: 'kg', cost: '9.00', supplier: "Poultry Direct", reorder: '12.000' },
    { n: 4, name: "Ocean Wise Ahi Tuna", cat: 'Proteins', stock: '4.000', par: '15.000', unit: 'kg', cost: '34.00', supplier: "Pacific Fisheries", reorder: '5.000' },
    { n: 5, name: "Pacific Cod", cat: 'Proteins', stock: '10.000', par: '20.000', unit: 'kg', cost: '14.00', supplier: "Pacific Fisheries", reorder: '6.000' },
    { n: 6, name: "Scallops", cat: 'Proteins', stock: '5.000', par: '10.000', unit: 'kg', cost: '38.00', supplier: "Pacific Fisheries", reorder: '3.000' },
    { n: 7, name: "Prawns", cat: 'Proteins', stock: '8.000', par: '15.000', unit: 'kg', cost: '24.00', supplier: "Pacific Fisheries", reorder: '5.000' },
    { n: 8, name: "Smoked Bacon", cat: 'Proteins', stock: '6.000', par: '12.000', unit: 'kg', cost: '16.00', supplier: "Premium Meats", reorder: '3.000' },
    { n: 9, name: "Tofu", cat: 'Proteins', stock: '9.000', par: '18.000', unit: 'kg', cost: '5.00', supplier: "Green Valley Produce", reorder: '4.000' },
    { n: 10, name: "Eggs", cat: 'Proteins', stock: '120.000', par: '200.000', unit: 'piece', cost: '0.40', supplier: "Dairyland", reorder: '60.000' },
    { n: 11, name: "Crab Meat", cat: 'Proteins', stock: '3.000', par: '8.000', unit: 'kg', cost: '28.00', supplier: "Pacific Fisheries", reorder: '2.000' },
    { n: 12, name: "Salmon", cat: 'Proteins', stock: '7.000', par: '12.000', unit: 'kg', cost: '26.00', supplier: "Pacific Fisheries", reorder: '4.000' },
    { n: 13, name: "Veggie Patty", cat: 'Proteins', stock: '18.000', par: '30.000', unit: 'piece', cost: '2.20', supplier: "Sysco", reorder: '10.000' },
    { n: 14, name: "Grana Padano", cat: 'Dairy & Cheeses', stock: '5.000', par: '10.000', unit: 'kg', cost: '28.00', supplier: "Latteria Dairy", reorder: '2.000' },
    { n: 15, name: "Aged Cheddar", cat: 'Dairy & Cheeses', stock: '7.000', par: '12.000', unit: 'kg', cost: '15.00', supplier: "Latteria Dairy", reorder: '3.000' },
    { n: 16, name: "Macedonian Feta", cat: 'Dairy & Cheeses', stock: '4.000', par: '8.000', unit: 'kg', cost: '14.00', supplier: "Latteria Dairy", reorder: '2.000' },
    { n: 17, name: "Swiss Cheese", cat: 'Dairy & Cheeses', stock: '3.000', par: '6.000', unit: 'kg', cost: '13.00', supplier: "Latteria Dairy", reorder: '1.500' },
    { n: 18, name: "Butter", cat: 'Dairy & Cheeses', stock: '8.000', par: '15.000', unit: 'kg', cost: '8.00', supplier: "Dairyland", reorder: '3.000' },
    { n: 19, name: "Cream", cat: 'Dairy & Cheeses', stock: '12.000', par: '20.000', unit: 'litre', cost: '4.00', supplier: "Dairyland", reorder: '5.000' },
    { n: 20, name: "Greek Yogurt", cat: 'Dairy & Cheeses', stock: '5.000', par: '10.000', unit: 'kg', cost: '5.00', supplier: "Dairyland", reorder: '3.000' },
    { n: 21, name: "Avocado", cat: 'Produce', stock: '15.000', par: '60.000', unit: 'piece', cost: '1.20', supplier: "Green Valley Produce", reorder: '20.000' },
    { n: 22, name: "Tomatoes", cat: 'Produce', stock: '20.000', par: '30.000', unit: 'kg', cost: '4.00', supplier: "Green Valley Produce", reorder: '8.000' },
    { n: 23, name: "Cucumber", cat: 'Produce', stock: '10.000', par: '20.000', unit: 'kg', cost: '2.50', supplier: "Green Valley Produce", reorder: '6.000' },
    { n: 24, name: "Mango", cat: 'Produce', stock: '20.000', par: '40.000', unit: 'piece', cost: '1.50', supplier: "Green Valley Produce", reorder: '10.000' },
    { n: 25, name: "Pineapple", cat: 'Produce', stock: '12.000', par: '25.000', unit: 'piece', cost: '3.00', supplier: "Green Valley Produce", reorder: '6.000' },
    { n: 26, name: "Kale", cat: 'Produce', stock: '5.000', par: '10.000', unit: 'kg', cost: '4.00', supplier: "Green Valley Produce", reorder: '3.000' },
    { n: 27, name: "Mixed Greens", cat: 'Produce', stock: '6.000', par: '12.000', unit: 'kg', cost: '5.00', supplier: "Green Valley Produce", reorder: '3.000' },
    { n: 28, name: "Cilantro", cat: 'Produce', stock: '2.000', par: '5.000', unit: 'kg', cost: '12.00', supplier: "Green Valley Produce", reorder: '1.500' },
    { n: 29, name: "Thai Basil", cat: 'Produce', stock: '1.500', par: '4.000', unit: 'kg', cost: '14.00', supplier: "Green Valley Produce", reorder: '1.000' },
    { n: 30, name: "Jalapeño", cat: 'Produce', stock: '3.000', par: '6.000', unit: 'kg', cost: '6.00', supplier: "Green Valley Produce", reorder: '2.000' },
    { n: 31, name: "Lime", cat: 'Produce', stock: '60.000', par: '120.000', unit: 'piece', cost: '0.40', supplier: "Green Valley Produce", reorder: '30.000' },
    { n: 32, name: "Lemon", cat: 'Produce', stock: '40.000', par: '80.000', unit: 'piece', cost: '0.40', supplier: "Green Valley Produce", reorder: '20.000' },
    { n: 33, name: "Red Onion", cat: 'Produce', stock: '8.000', par: '15.000', unit: 'kg', cost: '2.00', supplier: "Green Valley Produce", reorder: '4.000' },
    { n: 34, name: "Garlic", cat: 'Produce', stock: '3.000', par: '6.000', unit: 'kg', cost: '8.00', supplier: "Green Valley Produce", reorder: '2.000' },
    { n: 35, name: "Mushrooms", cat: 'Produce', stock: '6.000', par: '12.000', unit: 'kg', cost: '7.00', supplier: "Green Valley Produce", reorder: '3.000' },
    { n: 36, name: "Potatoes", cat: 'Produce', stock: '40.000', par: '60.000', unit: 'kg', cost: '2.20', supplier: "Green Valley Produce", reorder: '15.000' },
    { n: 37, name: "Blueberries", cat: 'Produce', stock: '4.000', par: '8.000', unit: 'kg', cost: '12.00', supplier: "Green Valley Produce", reorder: '2.000' },
    { n: 38, name: "Key Limes", cat: 'Produce', stock: '50.000', par: '100.000', unit: 'piece', cost: '0.35', supplier: "Green Valley Produce", reorder: '25.000' },
    { n: 39, name: "Bok Choy", cat: 'Produce', stock: '5.000', par: '10.000', unit: 'kg', cost: '4.00', supplier: "Green Valley Produce", reorder: '2.000' },
    { n: 40, name: "Edamame", cat: 'Produce', stock: '4.000', par: '8.000', unit: 'kg', cost: '6.00', supplier: "Green Valley Produce", reorder: '2.000' },
    { n: 41, name: "Red Cabbage", cat: 'Produce', stock: '5.000', par: '10.000', unit: 'kg', cost: '3.00', supplier: "Green Valley Produce", reorder: '2.000' },
    { n: 42, name: "Green Papaya", cat: 'Produce', stock: '3.000', par: '6.000', unit: 'kg', cost: '5.00', supplier: "Green Valley Produce", reorder: '1.500' },
    { n: 43, name: "Arugula", cat: 'Produce', stock: '3.000', par: '6.000', unit: 'kg', cost: '9.00', supplier: "Green Valley Produce", reorder: '1.500' },
    { n: 44, name: "Seasonal Vegetables", cat: 'Produce', stock: '8.000', par: '15.000', unit: 'kg', cost: '5.00', supplier: "Green Valley Produce", reorder: '4.000' },
    { n: 45, name: "Ginger", cat: 'Produce', stock: '2.000', par: '5.000', unit: 'kg', cost: '8.00', supplier: "Green Valley Produce", reorder: '1.000' },
    { n: 46, name: "Radish", cat: 'Produce', stock: '2.000', par: '5.000', unit: 'kg', cost: '4.00', supplier: "Green Valley Produce", reorder: '1.000' },
    { n: 47, name: "Jasmine Rice", cat: 'Dry Goods', stock: '25.000', par: '40.000', unit: 'kg', cost: '2.50', supplier: "Sysco", reorder: '10.000' },
    { n: 48, name: "Turmeric Rice", cat: 'Dry Goods', stock: '10.000', par: '20.000', unit: 'kg', cost: '3.50', supplier: "Sysco", reorder: '5.000' },
    { n: 49, name: "Rice Noodles", cat: 'Dry Goods', stock: '8.000', par: '15.000', unit: 'kg', cost: '4.00', supplier: "Sysco", reorder: '3.000' },
    { n: 50, name: "Flour Tortilla", cat: 'Dry Goods', stock: '80.000', par: '150.000', unit: 'piece', cost: '0.50', supplier: "Sysco", reorder: '30.000' },
    { n: 51, name: "Corn Tortilla Chips", cat: 'Dry Goods', stock: '6.000', par: '12.000', unit: 'kg', cost: '6.00', supplier: "Sysco", reorder: '3.000' },
    { n: 52, name: "Brioche Bun", cat: 'Dry Goods', stock: '40.000', par: '100.000', unit: 'piece', cost: '1.20', supplier: "Sysco", reorder: '25.000' },
    { n: 53, name: "Brioche Loaf", cat: 'Dry Goods', stock: '15.000', par: '30.000', unit: 'piece', cost: '4.50', supplier: "Sysco", reorder: '8.000' },
    { n: 54, name: "Panko Breadcrumbs", cat: 'Dry Goods', stock: '5.000', par: '10.000', unit: 'kg', cost: '5.00', supplier: "Sysco", reorder: '2.000' },
    { n: 55, name: "Tempura Batter", cat: 'Dry Goods', stock: '4.000', par: '8.000', unit: 'kg', cost: '5.00', supplier: "Sysco", reorder: '2.000' },
    { n: 56, name: "Soy Sauce", cat: 'Dry Goods', stock: '6.000', par: '12.000', unit: 'litre', cost: '7.00', supplier: "Sysco", reorder: '3.000' },
    { n: 57, name: "Truffle Oil", cat: 'Dry Goods', stock: '1.200', par: '3.000', unit: 'litre', cost: '65.00', supplier: "Tartufi Italia", reorder: '1.500' },
    { n: 58, name: "Honey", cat: 'Dry Goods', stock: '4.000', par: '8.000', unit: 'kg', cost: '9.00', supplier: "Sysco", reorder: '2.000' },
    { n: 59, name: "Graham Cracker Crust", cat: 'Dry Goods', stock: '20.000', par: '40.000', unit: 'piece', cost: '1.50', supplier: "Sysco", reorder: '10.000' },
    { n: 60, name: "Sugar", cat: 'Dry Goods', stock: '15.000', par: '25.000', unit: 'kg', cost: '1.50', supplier: "Sysco", reorder: '8.000' },
    { n: 61, name: "Coconut Milk", cat: 'Dry Goods', stock: '8.000', par: '15.000', unit: 'litre', cost: '4.50', supplier: "Sysco", reorder: '4.000' },
    { n: 62, name: "Red Curry Paste", cat: 'Dry Goods', stock: '3.000', par: '6.000', unit: 'kg', cost: '9.00', supplier: "Sysco", reorder: '2.000' },
    { n: 63, name: "Nori", cat: 'Dry Goods', stock: '50.000', par: '100.000', unit: 'piece', cost: '0.30', supplier: "Sysco", reorder: '20.000' },
    { n: 64, name: "Burger Sauce", cat: 'Dry Goods', stock: '8.000', par: '15.000', unit: 'litre', cost: '4.00', supplier: "Sysco", reorder: '4.000' },
    { n: 65, name: "Spicy Mayo", cat: 'Dry Goods', stock: '4.000', par: '8.000', unit: 'litre', cost: '5.00', supplier: "Sysco", reorder: '2.000' },
    { n: 66, name: "Peanuts", cat: 'Dry Goods', stock: '2.000', par: '5.000', unit: 'kg', cost: '7.00', supplier: "Sysco", reorder: '1.000' },
    { n: 67, name: "Chickpeas", cat: 'Dry Goods', stock: '5.000', par: '10.000', unit: 'kg', cost: '3.00', supplier: "Sysco", reorder: '2.000' },
    { n: 68, name: "Potato Gnocchi", cat: 'Dry Goods', stock: '5.000', par: '10.000', unit: 'kg', cost: '6.00', supplier: "Sysco", reorder: '2.000' },
    { n: 69, name: "Casamigos Blanco", cat: 'Bar & Beverage', stock: '5.000', par: '10.000', unit: 'bottle', cost: '38.00', supplier: "Southern Glazer", reorder: '2.000' },
    { n: 70, name: "Cazadores Reposado", cat: 'Bar & Beverage', stock: '6.000', par: '10.000', unit: 'bottle', cost: '34.00', supplier: "Southern Glazer", reorder: '2.000' },
    { n: 71, name: "Appleton 8 Rum", cat: 'Bar & Beverage', stock: '4.000', par: '8.000', unit: 'bottle', cost: '32.00', supplier: "Southern Glazer", reorder: '2.000' },
    { n: 72, name: "White Rum", cat: 'Bar & Beverage', stock: '5.000', par: '8.000', unit: 'bottle', cost: '22.00', supplier: "Southern Glazer", reorder: '2.000' },
    { n: 73, name: "Absolut Mandrin Vodka", cat: 'Bar & Beverage', stock: '4.000', par: '8.000', unit: 'bottle', cost: '28.00', supplier: "Southern Glazer", reorder: '2.000' },
    { n: 74, name: "Triple Sec", cat: 'Bar & Beverage', stock: '4.000', par: '6.000', unit: 'bottle', cost: '18.00', supplier: "Southern Glazer", reorder: '1.000' },
    { n: 75, name: "Peach Schnapps", cat: 'Bar & Beverage', stock: '3.000', par: '6.000', unit: 'bottle', cost: '16.00', supplier: "Southern Glazer", reorder: '1.000' },
    { n: 76, name: "Sparkling Wine", cat: 'Bar & Beverage', stock: '10.000', par: '15.000', unit: 'bottle', cost: '18.00', supplier: "Southern Glazer", reorder: '4.000' },
    { n: 77, name: "Cava", cat: 'Bar & Beverage', stock: '8.000', par: '12.000', unit: 'bottle', cost: '16.00', supplier: "Southern Glazer", reorder: '3.000' },
    { n: 78, name: "Veuve Clicquot", cat: 'Bar & Beverage', stock: '3.000', par: '6.000', unit: 'bottle', cost: '240.00', supplier: "Southern Glazer", reorder: '1.000' },
    { n: 79, name: "Dom Pérignon", cat: 'Bar & Beverage', stock: '2.000', par: '4.000', unit: 'bottle', cost: '300.00', supplier: "Southern Glazer", reorder: '1.000' },
    { n: 80, name: "Heineken", cat: 'Bar & Beverage', stock: '24.000', par: '48.000', unit: 'bottle', cost: '3.50', supplier: "Southern Glazer", reorder: '12.000' },
    { n: 81, name: "Soda Water", cat: 'Bar & Beverage', stock: '20.000', par: '30.000', unit: 'litre', cost: '1.50', supplier: "Sysco", reorder: '8.000' },
    { n: 82, name: "Pineapple Juice", cat: 'Bar & Beverage', stock: '8.000', par: '15.000', unit: 'litre', cost: '3.00', supplier: "Sysco", reorder: '3.000' },
    { n: 83, name: "Peach Purée", cat: 'Bar & Beverage', stock: '4.000', par: '8.000', unit: 'litre', cost: '5.00', supplier: "Sysco", reorder: '2.000' },
    { n: 84, name: "Blood Orange Juice", cat: 'Bar & Beverage', stock: '5.000', par: '10.000', unit: 'litre', cost: '4.00', supplier: "Sysco", reorder: '2.000' },
    { n: 85, name: "Mango Soju", cat: 'Bar & Beverage', stock: '4.000', par: '8.000', unit: 'bottle', cost: '20.00', supplier: "Southern Glazer", reorder: '2.000' },
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

  await prisma.ingredient.createMany({
    data: [
      { id: ING(86), restaurantId: RESTAURANT_ID, name: "Pork Ribs", category: 'Proteins', currentStock: '8.000', parLevel: '15.000', unit: 'kg', unitCost: '12.00', supplierName: "Premium Meats", reorderTrigger: '4.000' },
      { id: ING(87), restaurantId: RESTAURANT_ID, name: "Calamari", category: 'Proteins', currentStock: '4.000', parLevel: '10.000', unit: 'kg', unitCost: '16.00', supplierName: "Pacific Fisheries", reorderTrigger: '2.000' },
      { id: ING(88), restaurantId: RESTAURANT_ID, name: "Sea Bass", category: 'Proteins', currentStock: '3.000', parLevel: '8.000', unit: 'kg', unitCost: '36.00', supplierName: "Pacific Fisheries", reorderTrigger: '2.000' },
      { id: ING(89), restaurantId: RESTAURANT_ID, name: "Lobster", category: 'Proteins', currentStock: '2.000', parLevel: '6.000', unit: 'kg', unitCost: '48.00', supplierName: "Pacific Fisheries", reorderTrigger: '1.500' },
      { id: ING(90), restaurantId: RESTAURANT_ID, name: "Filet Mignon", category: 'Proteins', currentStock: '5.000', parLevel: '10.000', unit: 'kg', unitCost: '58.00', supplierName: "Premium Meats", reorderTrigger: '2.000' },
      { id: ING(91), restaurantId: RESTAURANT_ID, name: "Striploin", category: 'Proteins', currentStock: '6.000', parLevel: '12.000', unit: 'kg', unitCost: '42.00', supplierName: "Premium Meats", reorderTrigger: '3.000' },
      { id: ING(92), restaurantId: RESTAURANT_ID, name: "Sirloin", category: 'Proteins', currentStock: '7.000', parLevel: '14.000', unit: 'kg', unitCost: '32.00', supplierName: "Premium Meats", reorderTrigger: '3.000' },
      { id: ING(93), restaurantId: RESTAURANT_ID, name: "Spaghetti", category: 'Dry Goods', currentStock: '10.000', parLevel: '20.000', unit: 'kg', unitCost: '3.00', supplierName: "Sysco", reorderTrigger: '4.000' },
      { id: ING(94), restaurantId: RESTAURANT_ID, name: "Ravioli", category: 'Dry Goods', currentStock: '4.000', parLevel: '10.000', unit: 'kg', unitCost: '9.00', supplierName: "Sysco", reorderTrigger: '2.000' },
      { id: ING(95), restaurantId: RESTAURANT_ID, name: "Falafel", category: 'Proteins', currentStock: '20.000', parLevel: '40.000', unit: 'piece', unitCost: '1.50', supplierName: "Sysco", reorderTrigger: '10.000' },
      { id: ING(96), restaurantId: RESTAURANT_ID, name: "Wontons", category: 'Dry Goods', currentStock: '30.000', parLevel: '60.000', unit: 'piece', unitCost: '0.40', supplierName: "Sysco", reorderTrigger: '15.000' },
      { id: ING(97), restaurantId: RESTAURANT_ID, name: "Yams", category: 'Produce', currentStock: '10.000', parLevel: '20.000', unit: 'kg', unitCost: '3.00', supplierName: "Green Valley Produce", reorderTrigger: '4.000' },
      { id: ING(98), restaurantId: RESTAURANT_ID, name: "Chocolate", category: 'Dry Goods', currentStock: '5.000', parLevel: '10.000', unit: 'kg', unitCost: '12.00', supplierName: "Sysco", reorderTrigger: '2.000' },
      { id: ING(99), restaurantId: RESTAURANT_ID, name: "Lettuce", category: 'Produce', currentStock: '4.000', parLevel: '10.000', unit: 'kg', unitCost: '3.00', supplierName: "Green Valley Produce", reorderTrigger: '2.000' },
      { id: ING(100), restaurantId: RESTAURANT_ID, name: "Butternut Squash", category: 'Produce', currentStock: '5.000', parLevel: '10.000', unit: 'kg', unitCost: '4.00', supplierName: "Green Valley Produce", reorderTrigger: '2.000' },
      { id: ING(101), restaurantId: RESTAURANT_ID, name: "Mascarpone", category: 'Dairy & Cheeses', currentStock: '3.000', parLevel: '6.000', unit: 'kg', unitCost: '16.00', supplierName: "Latteria Dairy", reorderTrigger: '1.500' },
      { id: ING(102), restaurantId: RESTAURANT_ID, name: "Cajun Spice", category: 'Dry Goods', currentStock: '2.000', parLevel: '5.000', unit: 'kg', unitCost: '9.00', supplierName: "Sysco", reorderTrigger: '1.000' },
      { id: ING(103), restaurantId: RESTAURANT_ID, name: "Miso Paste", category: 'Dry Goods', currentStock: '2.000', parLevel: '5.000', unit: 'kg', unitCost: '8.00', supplierName: "Sysco", reorderTrigger: '1.000' },
    ],
  });

  console.log('→ recipes');
  const recipeMap: Record<number, Array<[number, string]>> = {
    102: [[1, '0.150'], [43, '0.030'], [53, '0.200']],
    103: [[12, '0.180'], [18, '0.030'], [44, '0.080'], [32, '1']],
    104: [[19, '0.080'], [59, '1'], [37, '0.040']],
    105: [[4, '0.080'], [63, '1'], [47, '0.050'], [23, '0.020'], [56, '0.010']],
    106: [[12, '0.180'], [18, '0.030'], [44, '0.080'], [32, '1']],
    107: [[7, '0.100'], [24, '0.500'], [21, '0.500'], [65, '0.020'], [56, '0.010']],
    108: [[11, '0.080'], [63, '1'], [47, '0.050'], [99, '0.020']],
    109: [[4, '0.100'], [12, '0.100'], [7, '0.080'], [11, '0.060'], [63, '2'], [47, '0.150']],
    110: [[86, '0.350'], [58, '0.030'], [34, '0.010'], [31, '1']],
    111: [[11, '0.120'], [19, '0.080'], [51, '0.050']],
    112: [[53, '0.500'], [58, '0.030'], [57, '0.010'], [18, '0.030']],
    113: [[3, '0.200'], [54, '0.040'], [58, '0.030'], [14, '0.020']],
    114: [[97, '0.250'], [65, '0.020']],
    115: [[36, '0.300'], [57, '0.015'], [14, '0.020']],
    116: [[21, '1'], [22, '0.080'], [16, '0.030'], [51, '0.050']],
    117: [[1, '0.150'], [43, '0.030'], [53, '0.200']],
    118: [[87, '0.180'], [30, '0.010'], [31, '1']],
    119: [[94, '0.180'], [7, '0.100'], [18, '0.030'], [14, '0.020']],
    120: [[3, '0.150'], [54, '0.030'], [17, '0.020'], [52, '2'], [65, '0.020']],
    121: [[3, '0.150'], [99, '0.100'], [66, '0.030'], [96, '4'], [65, '0.020']],
    122: [[48, '0.150'], [95, '2'], [3, '0.100'], [26, '0.050'], [23, '0.050'], [22, '0.050'], [33, '0.020'], [16, '0.040'], [20, '0.040'], [41, '0.040']],
    123: [[4, '0.120'], [47, '0.200'], [24, '0.500'], [23, '0.050'], [21, '0.500'], [40, '0.050'], [45, '0.010'], [55, '0.030'], [46, '0.020']],
    124: [[9, '0.150'], [47, '0.200'], [24, '0.500'], [23, '0.050'], [21, '0.500'], [40, '0.050'], [45, '0.010'], [46, '0.020']],
    125: [[49, '0.150'], [27, '0.080'], [66, '0.030'], [21, '0.500'], [42, '0.050'], [41, '0.040'], [29, '0.010'], [22, '0.050']],
    126: [[27, '0.120'], [21, '1'], [22, '0.080'], [16, '0.040'], [66, '0.030'], [10, '1']],
    127: [[67, '0.080'], [21, '1'], [41, '0.040'], [14, '0.030'], [32, '1'], [27, '0.100']],
    128: [[93, '0.200'], [1, '0.150'], [19, '0.050'], [14, '0.030']],
    129: [[93, '0.200'], [7, '0.120'], [89, '0.080'], [18, '0.030'], [14, '0.020']],
    130: [[94, '0.180'], [7, '0.100'], [18, '0.030'], [14, '0.020']],
    131: [[1, '0.180'], [15, '0.030'], [8, '0.030'], [52, '1'], [64, '0.020']],
    132: [[1, '0.180'], [15, '0.030'], [8, '0.030'], [52, '1'], [64, '0.020']],
    133: [[13, '1'], [15, '0.030'], [52, '1'], [64, '0.020']],
    134: [[3, '0.180'], [54, '0.050'], [36, '0.200'], [58, '0.020']],
    135: [[3, '0.150'], [25, '0.100'], [28, '0.010'], [21, '0.500'], [50, '2']],
    136: [[5, '0.150'], [50, '2'], [41, '0.040'], [21, '0.500'], [22, '0.050'], [55, '0.040']],
    137: [[3, '0.150'], [54, '0.040'], [17, '0.030'], [52, '1'], [65, '0.020']],
    138: [[3, '0.150'], [54, '0.040'], [17, '0.030'], [52, '1'], [65, '0.020']],
    139: [[88, '0.200'], [103, '0.020'], [18, '0.030'], [47, '0.150'], [44, '0.080']],
    140: [[12, '0.180'], [18, '0.030'], [44, '0.080'], [32, '1']],
    141: [[3, '0.200'], [14, '0.040'], [35, '0.060'], [68, '0.150'], [19, '0.100'], [57, '0.015'], [43, '0.030']],
    142: [[3, '0.200'], [102, '0.020'], [18, '0.040'], [36, '0.200'], [44, '0.100']],
    143: [[62, '0.030'], [61, '0.150'], [47, '0.180'], [39, '0.060'], [44, '0.040'], [29, '0.010']],
    144: [[2, '0.350'], [36, '0.200'], [18, '0.040'], [44, '0.100']],
    145: [[91, '0.300'], [35, '0.080'], [18, '0.030'], [36, '0.200'], [44, '0.080']],
    146: [[90, '0.250'], [89, '0.150'], [36, '0.200'], [18, '0.040']],
    147: [[92, '0.250'], [7, '0.100'], [102, '0.020'], [18, '0.030'], [36, '0.200']],
    148: [[92, '0.250'], [36, '0.250'], [27, '0.080'], [18, '0.030']],
    149: [[92, '0.250'], [36, '0.200'], [44, '0.080'], [18, '0.030']],
    150: [[2, '0.400'], [36, '0.200'], [44, '0.080'], [18, '0.030']],
    151: [[90, '0.300'], [36, '0.200'], [44, '0.080'], [18, '0.030']],
    152: [[91, '0.340'], [36, '0.200'], [44, '0.080'], [18, '0.030']],
    153: [[19, '0.100'], [37, '0.050'], [60, '0.020']],
    154: [[98, '0.150'], [19, '0.080'], [60, '0.030']],
    155: [[98, '0.120'], [19, '0.050'], [60, '0.020']],
    156: [[98, '0.100'], [66, '0.020'], [19, '0.050'], [60, '0.020']],
    157: [[38, '2'], [59, '1'], [19, '0.070'], [60, '0.020']],
    158: [[19, '0.080'], [59, '1'], [37, '0.040']],
    160: [[36, '0.300'], [57, '0.015'], [14, '0.020']],
    161: [[21, '1'], [22, '0.080'], [16, '0.030'], [51, '0.050']],
    162: [[4, '0.080'], [63, '1'], [47, '0.050'], [23, '0.020'], [56, '0.010']],
    163: [[67, '0.080'], [21, '1'], [41, '0.040'], [14, '0.030'], [32, '1'], [27, '0.100']],
    164: [[3, '0.200'], [54, '0.040'], [58, '0.030'], [14, '0.020']],
    165: [[7, '0.100'], [24, '0.500'], [21, '0.500'], [65, '0.020'], [56, '0.010']],
    166: [[12, '0.180'], [18, '0.030'], [44, '0.080'], [32, '1']],
    167: [[3, '0.150'], [25, '0.100'], [28, '0.010'], [21, '0.500'], [50, '2']],
    168: [[3, '0.150'], [54, '0.040'], [17, '0.030'], [52, '1'], [65, '0.020']],
    169: [[3, '0.200'], [102, '0.020'], [18, '0.040'], [36, '0.200'], [44, '0.100']],
    170: [[92, '0.250'], [36, '0.250'], [27, '0.080'], [18, '0.030']],
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
    mins: number; items: Array<{ menu: number; qty: number; seat?: string; notes?: string }>;
    allergy?: string; tip?: string;
  };
  const orderSeed: OrderSeed[] = [
    { n: 1, table: 3, server: 5, status: 'preparing', mins: 18, allergy: "Shellfish allergy at seat 3 \u2014 no cross-contact", items: [{ menu: 144, qty: 2, seat: '1' }, { menu: 115, qty: 1, seat: '2' }, { menu: 107, qty: 1, seat: '3', notes: "SHELLFISH ALLERGY \u2014 separate board" }, { menu: 10, qty: 2, seat: 'Bar' }] },
    { n: 2, table: 7, server: 2, status: 'sent_to_kitchen', mins: 22, allergy: "Gluten intolerance \u2014 no bread service", items: [{ menu: 136, qty: 2, seat: '1' }, { menu: 126, qty: 1, seat: '2' }, { menu: 157, qty: 2, seat: '3' }] },
    { n: 3, table: 5, server: 13, status: 'sent_to_kitchen', mins: 11, items: [{ menu: 131, qty: 1, seat: '1' }, { menu: 115, qty: 1, seat: '2' }, { menu: 10, qty: 2, seat: 'Bar' }] },
    { n: 4, table: 12, server: 3, status: 'open', mins: 2, items: [{ menu: 4, qty: 2, seat: '1' }, { menu: 116, qty: 1, seat: '2' }] },
    { n: 5, table: 21, server: 3, status: 'sent_to_kitchen', mins: 8, items: [{ menu: 132, qty: 2, seat: 'Bar' }, { menu: 10, qty: 1, seat: 'Bar' }] },
    { n: 6, table: 1, server: 4, status: 'served', mins: 34, items: [{ menu: 144, qty: 2, seat: '1' }, { menu: 10, qty: 2, seat: '2' }, { menu: 157, qty: 2, seat: '3' }] },
    { n: 7, table: 15, server: 13, status: 'ready_at_pass', mins: 11, items: [{ menu: 144, qty: 1, seat: '1' }, { menu: 141, qty: 1, seat: '2' }, { menu: 7, qty: 2, seat: 'Bar' }] },
    { n: 8, table: 19, server: 3, status: 'paid', mins: 31, tip: '28.00', items: [{ menu: 132, qty: 3, seat: 'Bar' }, { menu: 10, qty: 4, seat: 'Bar' }] },
    { n: 9, table: 13, server: 4, status: 'paid', mins: 54, tip: '32.00', items: [{ menu: 144, qty: 2, seat: '1' }, { menu: 141, qty: 1, seat: '2' }, { menu: 10, qty: 3, seat: '3' }] },
    { n: 10, table: 7, server: 2, status: 'paid', mins: 88, tip: '24.00', items: [{ menu: 137, qty: 2, seat: '1' }, { menu: 131, qty: 1, seat: '2' }, { menu: 7, qty: 2, seat: 'Bar' }] },
    { n: 11, table: 16, server: 3, status: 'paid', mins: 76, tip: '18.00', items: [{ menu: 10, qty: 2, seat: '1' }, { menu: 104, qty: 2, seat: '2' }, { menu: 4, qty: 2, seat: '2' }] },
    { n: 12, table: 23, server: 12, status: 'paid', mins: 110, tip: '20.00', items: [{ menu: 123, qty: 2, seat: '1' }, { menu: 105, qty: 1, seat: '2' }, { menu: 10, qty: 2, seat: 'Bar' }] },
    { n: 13, table: 2, server: 2, status: 'paid', mins: 95, tip: '22.00', items: [{ menu: 10, qty: 2, seat: '1' }, { menu: 116, qty: 2, seat: '2' }, { menu: 157, qty: 2, seat: '2' }] },
    { n: 14, table: 4, server: 12, status: 'paid', mins: 65, tip: '20.00', items: [{ menu: 132, qty: 2, seat: '1' }, { menu: 115, qty: 2, seat: '2' }, { menu: 4, qty: 2, seat: '2' }] },
    { n: 15, table: 8, server: 4, status: 'paid', mins: 120, tip: '28.00', items: [{ menu: 106, qty: 2, seat: '1' }, { menu: 105, qty: 2, seat: '2' }, { menu: 157, qty: 2, seat: '2' }] },
    { n: 16, table: 18, server: 5, status: 'paid', mins: 140, tip: '16.00', items: [{ menu: 137, qty: 2, seat: '1' }, { menu: 115, qty: 2, seat: '2' }, { menu: 81, qty: 2, seat: '2' }] },
    { n: 17, table: 6, server: 2, status: 'paid', mins: 105, tip: '24.00', items: [{ menu: 144, qty: 2, seat: '1' }, { menu: 10, qty: 2, seat: '1' }, { menu: 115, qty: 1, seat: '2' }] },
    { n: 18, table: 10, server: 4, status: 'paid', mins: 97, tip: '22.00', items: [{ menu: 144, qty: 2, seat: '1' }, { menu: 10, qty: 2, seat: '2' }, { menu: 115, qty: 1, seat: '2' }] },
    { n: 19, table: 22, server: 3, status: 'paid', mins: 70, tip: '18.00', items: [{ menu: 141, qty: 2, seat: '1' }, { menu: 10, qty: 2, seat: '1' }, { menu: 157, qty: 1, seat: '2' }] },
    { n: 20, table: 24, server: 12, status: 'paid', mins: 80, tip: '24.00', items: [{ menu: 144, qty: 2, seat: '1' }, { menu: 115, qty: 2, seat: '2' }, { menu: 157, qty: 1, seat: '2' }] },
  ];
  const menuById = new Map(menuSeed.map((m) => [m.n, m]));
  // Deterministic tender mix for paid checks so the end-of-night report is
  // populated (Visa / Mastercard / Amex / cash).
  const paidTenders: Array<{ method: string; brand: string | null }> = [
    { method: 'card', brand: 'visa' },
    { method: 'card', brand: 'visa' },
    { method: 'card', brand: 'mastercard' },
    { method: 'card', brand: 'amex' },
    { method: 'cash', brand: null },
    { method: 'card', brand: 'mastercard' },
  ];
  for (const o of orderSeed) {
    const tender = paidTenders[o.n % paidTenders.length];
    const prepared = o.items.map((it) => ({ it, menu: menuById.get(it.menu)! }));
    const hasStarters = prepared.some((p) => p.menu.course === 'starter');
    const items = prepared.map(({ it, menu }) => {
      const prepStatus =
        o.status === 'paid' || o.status === 'ready_at_pass'
          ? 'bumped'
          : o.status === 'open'
            ? 'firing'
            : menu.course === 'main' && hasStarters
              ? 'held'
              : 'firing';
      return {
        menuItemId: MENU(it.menu),
        quantity: it.qty,
        unitPrice: menu.price,
        prepStatus,
        station: menu.station,
        course: menu.course,
        seat: it.seat ?? null,
        notes: it.notes ?? null,
        modifiers: [],
        createdAt: minutesAgo(o.mins),
        bumpedAt: prepStatus === 'bumped' ? minutesAgo(Math.max(1, o.mins - 15)) : null,
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
        paymentMethod: o.status === 'paid' ? tender.method : null,
        cardBrand: o.status === 'paid' ? tender.brand : null,
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

  // Forward book: confirmed bookings spread across the next 12 months so the
  // week / month / year calendar on /reservations has a realistic diary.
  console.log('→ forward reservation book');
  const forwardGuests: Array<{
    name: string; party: number; vip?: boolean; occasion?: string; notes?: string; source?: string;
  }> = [
    { name: 'Avery Cole', party: 2 },
    { name: 'Nina Mercer', party: 4, occasion: 'Birthday' },
    { name: 'Owen Fitzgerald', party: 3 },
    { name: 'Priya Shah', party: 6, notes: 'Two high chairs' },
    { name: 'The Brennan Party', party: 8, source: 'host', notes: 'Deposit taken' },
    { name: 'Hugo Lindqvist', party: 2, vip: true, notes: 'Regular • bar seat preferred' },
    { name: 'Camille Duval', party: 4 },
    { name: 'Marcus Webb', party: 2, notes: 'Gluten-free — celiac' },
    { name: 'Sofia Marchetti', party: 5, occasion: 'Anniversary' },
    { name: 'Elijah Brooks', party: 3 },
    { name: 'Hana Kobayashi', party: 4, source: 'voice_ai' },
    { name: 'The Delacroix Party', party: 10, source: 'host', notes: 'PDR requested' },
    { name: 'Grace Abara', party: 2 },
    { name: 'Tomás Reyes', party: 6 },
    { name: 'Ines Moreau', party: 3, occasion: 'Graduation' },
    { name: 'Callum Reid', party: 4 },
    { name: 'Yara Haddad', party: 2, vip: true, notes: 'Press — local guide' },
    { name: 'The Whitfield Party', party: 7, notes: 'Patio if possible' },
    { name: 'Leo Nakamura', party: 4 },
    { name: 'Diane Okafor', party: 3 },
    { name: 'Ruth Ellison', party: 2 },
    { name: 'Mateo Silva', party: 5, occasion: 'Birthday' },
    { name: 'Freya Lindgren', party: 4, source: 'voice_ai' },
    { name: 'The Ashford Party', party: 9, notes: 'Deposit taken' },
  ];

  const forwardBook: Array<{
    name: string; party: number; vip: boolean; occasion: string | null;
    notes: string | null; source: string; when: Date;
  }> = [];
  for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
    const month = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let slot = 0; slot < 4; slot++) {
      const day = Math.min(daysInMonth, 2 + slot * 7 + (monthOffset % 3));
      const when = new Date(
        month.getFullYear(),
        month.getMonth(),
        day,
        18 + (slot % 4),
        slot % 2 === 0 ? 0 : 30,
      );
      if (when.getTime() <= now.getTime()) continue;
      const guest = forwardGuests[(monthOffset * 4 + slot) % forwardGuests.length];
      forwardBook.push({
        name: guest.name,
        party: guest.party,
        vip: guest.vip ?? false,
        occasion: guest.occasion ?? null,
        notes: guest.notes ?? null,
        source: guest.source ?? 'host',
        when,
      });
    }
  }

  await prisma.reservation.createMany({
    data: forwardBook.map((r, index) => ({
      id: RES(101 + index),
      restaurantId: RESTAURANT_ID,
      guestName: r.name,
      phone: `+1 555-${String(2000 + index).padStart(4, '0')}`,
      email: `${r.name.toLowerCase().replace(/[^a-z]+/g, '.')}@guest.local`,
      partySize: r.party,
      reservationTime: r.when,
      status: 'confirmed',
      source: r.source,
      notes: r.notes,
      vip: r.vip,
      occasion: r.occasion,
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
      transcript: `Agent: Thank you for calling Chefuffle! How can I help?\nCaller: ${c.summary}\nAgent: I've taken care of that for you.`,
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
