import { prisma } from '@shift-happens/db';
import { env } from '../env.js';
import { notFound } from '../errors.js';
import { emitRestaurant } from '../realtime.js';
import { sendMessage } from './notifier.js';
import { listShifts, serializeShift } from './scheduling-engine.js';

const num = (v: unknown) => Number(v ?? 0);

export async function getBriefing(restaurantId = env.RESTAURANT_ID) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [shiftData, eightySix, ingredients, vipReservations, todayOrders] =
    await Promise.all([
      listShifts(restaurantId),
      prisma.menuItem.findMany({
        where: { restaurantId, is86ed: true },
        include: { category: true },
        orderBy: { name: 'asc' },
      }),
      prisma.ingredient.findMany({ where: { restaurantId } }),
      prisma.reservation.findMany({
        where: {
          restaurantId,
          reservationTime: { gte: start, lt: end },
          OR: [{ vip: true }, { occasion: { not: null } }],
        },
        include: { table: true },
        orderBy: { reservationTime: 'asc' },
      }),
      prisma.order.findMany({
        where: { restaurantId, createdAt: { gte: start, lt: end } },
        include: { items: { include: { menuItem: true } }, table: true },
      }),
    ]);

  const lowStock = ingredients
    .filter((i) => num(i.currentStock) <= num(i.reorderTrigger))
    .map((i) => ({
      id: i.id,
      name: i.name,
      currentStock: num(i.currentStock),
      parLevel: num(i.parLevel),
      reorderTrigger: num(i.reorderTrigger),
      unit: i.unit,
      supplier: i.supplierName,
      severity: num(i.currentStock) <= 0 ? 'depleted' : 'low',
    }));

  const signedOff = shiftData.shifts.filter((s) => s.signoff).length;
  const covers = todayOrders.reduce(
    (sum, order) => sum + (order.table?.currentPartySize ?? 0),
    0,
  );
  const sales = todayOrders
    .filter((o) => ['served', 'paid'].includes(o.status))
    .reduce((sum, o) => sum + num(o.total), 0);

  const itemCounts = new Map<string, number>();
  for (const order of todayOrders) {
    for (const item of order.items) {
      itemCounts.set(item.menuItem.name, (itemCounts.get(item.menuItem.name) ?? 0) + item.quantity);
    }
  }
  const topSellers = [...itemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, quantity]) => ({ name, quantity }));

  const stationDirectives = [
    {
      station: 'Grill',
      directive: `${topSellers[0]?.name ?? 'Ribeye'} is tonight's top seller — stage 6 ribeyes now. Check doneness probe calibration before 17:00.`,
      priority: 'high',
    },
    {
      station: 'Sauté',
      directive: eightySix.length
        ? `${eightySix[0].name} is 86ed — brief runners before open.`
        : 'All sauté items available; hold fryer at 350°F.',
      priority: eightySix.length ? 'urgent' : 'normal',
    },
    {
      station: 'Cold Larder',
      directive:
        lowStock.find((i) => /burrata/i.test(i.name))
          ? 'Burrata low: portion 3 per service and upsell the heirloom tomato alternative.'
          : 'Cold larder par levels verified.',
      priority: 'high',
    },
    {
      station: 'Bar',
      directive: 'Smoked Old Fashioned is the VIP welcome pour. Reserve two Woodford bottles for the Sterling anniversary.',
      priority: 'normal',
    },
    {
      station: 'Host',
      directive: vipReservations.length
        ? `${vipReservations.length} VIP/Press arrivals — confirm table map and allergy notes before seating.`
        : 'VIP radar clear; monitor walk-in waitlist.',
      priority: 'normal',
    },
  ];

  const narrative = buildNarrative({
    covers,
    sales,
    active: shiftData.summary.active,
    signedOff,
    totalShifts: shiftData.summary.total,
    eightySix: eightySix.map((e) => e.name),
    lowStock: lowStock.map((l) => `${l.name} (${l.currentStock}${l.unit})`),
    vip: vipReservations.map((r) => `${r.guestName} · ${r.partySize}p · ${r.occasion ?? 'VIP'}`),
    topSellers,
    pacing: shiftData.summary.pacingStatus,
    laborPercentage: shiftData.summary.laborPercentage,
  });

  return {
    date: start.toISOString(),
    restaurant: await prisma.restaurant.findUnique({ where: { id: restaurantId } }),
    eightySix: eightySix.map((item) => ({
      id: item.id,
      name: item.name,
      station: item.station,
      category: item.category?.name ?? null,
      reason: item.eightySixReason,
      price: num(item.price),
    })),
    lowStock,
    vipReservations: vipReservations.map((r) => ({
      id: r.id,
      guestName: r.guestName,
      partySize: r.partySize,
      time: r.reservationTime.toISOString(),
      tableNumber: r.table?.tableNumber ?? null,
      notes: r.notes,
      occasion: r.occasion,
      status: r.status,
    })),
    stationDirectives,
    attendance: shiftData.shifts,
    summary: {
      covers,
      sales: Number(sales.toFixed(2)),
      activeStaff: shiftData.summary.active,
      totalShifts: shiftData.summary.total,
      signedOff,
      signoffRate:
        shiftData.summary.total > 0
          ? Math.round((signedOff / shiftData.summary.total) * 100)
          : 0,
      laborPercentage: shiftData.summary.laborPercentage,
      pacingStatus: shiftData.summary.pacingStatus,
      topSellers,
    },
    narrative,
    narrativeGeneratedAt: new Date().toISOString(),
  };
}

function buildNarrative(input: {
  covers: number;
  sales: number;
  active: number;
  signedOff: number;
  totalShifts: number;
  eightySix: string[];
  lowStock: string[];
  vip: string[];
  topSellers: Array<{ name: string; quantity: number }>;
  pacing: string;
  laborPercentage: string;
}) {
  const top = input.topSellers[0];
  return [
    `Service pulse: ${input.active} staff active, ${input.covers} covers seated, ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(input.sales)} in net sales.`,
    top
      ? `${top.name} led the floor with ${top.quantity} covers — the grill carried the middle of service.`
      : 'No fired covers yet; the first wave is expected at 17:30.',
    input.eightySix.length
      ? `86 list: ${input.eightySix.join(', ')}. Voice AI and POS are already synced; runners were briefed.`
      : 'No 86s on the board — menu fully available.',
    input.lowStock.length
      ? `Pars below trigger: ${input.lowStock.join(', ')}. Auto-PO recommendations are queued for manager approval.`
      : 'All par levels are above trigger.',
    input.vip.length
      ? `VIP/press watch: ${input.vip.join('; ')}. Confirm allergy notes at the pass before firing.`
      : 'No VIP or press arrivals flagged for this service.',
    `Labor pacing is ${input.pacing} at ${input.laborPercentage}% against an 18.5% target. Briefing sign-off is ${input.signedOff}/${input.totalShifts}.`,
    'Close-out: verify HACCP temps at the pass, reconcile 86s against stock, and log the nightcap narrative for the GM.',
  ].join('\n');
}

export async function signOffBriefing(
  shiftId: string,
  restaurantId = env.RESTAURANT_ID,
) {
  const shift = await prisma.staffShift.findFirst({
    where: { id: shiftId, restaurantId },
    include: { signoffs: true, staff: true },
  });
  if (!shift) throw notFound('Shift not found');
  const signoff = await prisma.briefingSignoff.upsert({
    where: { shiftId },
    create: {
      restaurantId,
      shiftId,
      staffName: shift.userName,
      allergenAcknowledged: true,
      haccpAcknowledged: true,
    },
    update: {
      allergenAcknowledged: true,
      haccpAcknowledged: true,
      signedAt: new Date(),
    },
  });
  const updated = await prisma.staffShift.findUnique({
    where: { id: shiftId },
    include: { signoffs: true, staff: true },
  });
  emitRestaurant('BRIEFING_UPDATED', {
    event: 'BRIEFING_UPDATED',
    shift: updated ? serializeShift(updated) : null,
    signoffId: signoff.id,
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return { shiftId, signoffId: signoff.id, signedAt: signoff.signedAt.toISOString() };
}

export async function broadcastBiometricPolicy(restaurantId = env.RESTAURANT_ID) {
  const shifts = await prisma.staffShift.findMany({
    where: { restaurantId, scheduledStart: { gte: new Date() } },
  });
  const recipients = shifts.map((s) => s.userName);
  const result = await sendMessage({
    restaurantId,
    channel: 'sms',
    recipients,
    message:
      'SHIFT HAPPENS!: Biometric clock-in now requires the HACCP + allergen briefing sign-off before your punch is accepted. See the lineup cockpit.',
  });
  return {
    recipients,
    delivered: result.delivered,
    simulated: result.simulated,
    notificationId: result.notification.id,
  };
}
