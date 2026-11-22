import { prisma } from '@shift-happens/db';
import { env } from '../env.js';
import { getTickets, getStationCounts } from './kds-engine.js';
import { calculateLaborPacing } from './labor-engine.js';
import { getTables } from './stage-engine.js';

const num = (v: unknown) => Number(v ?? 0);

export async function getDashboardSummary(restaurantId = env.RESTAURANT_ID) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [restaurant, tables, tickets, stationCounts, pacing, ingredients, reservations, calls, sales] =
    await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId } }),
      getTables(restaurantId),
      getTickets(undefined, restaurantId),
      getStationCounts(restaurantId),
      calculateLaborPacing(restaurantId, { emit: false }),
      prisma.ingredient.findMany({ where: { restaurantId } }),
      prisma.reservation.findMany({
        where: { restaurantId, reservationTime: { gte: start, lt: end } },
      }),
      prisma.callLog.count({ where: { restaurantId, createdAt: { gte: start } } }),
      prisma.order.findMany({
        where: { restaurantId, createdAt: { gte: start, lt: end }, status: { in: ['served', 'paid'] } },
        select: { total: true },
      }),
    ]);

  const eightySix = await prisma.menuItem.findMany({
    where: { restaurantId, is86ed: true },
    select: { id: true, name: true, eightySixReason: true },
  });

  return {
    restaurant: restaurant
      ? {
          id: restaurant.id,
          name: restaurant.name,
          address: restaurant.address,
          phone: restaurant.phone,
          targetLaborPercentage: num(restaurant.targetLaborPercentage),
        }
      : null,
    tables: {
      total: tables.length,
      occupied: tables.filter((t) => t.status === 'occupied').length,
      available: tables.filter((t) => t.status === 'available').length,
      reserved: tables.filter((t) => t.status === 'reserved').length,
      dirty: tables.filter((t) => t.status === 'dirty').length,
      occupancy: tables.length
        ? Math.round((tables.filter((t) => t.status === 'occupied').length / tables.length) * 100)
        : 0,
    },
    kds: {
      openTickets: tickets.length,
      overdue: tickets.filter((t) => t.isOverdue).length,
      allergies: tickets.filter((t) => t.hasAllergy).length,
      stationCounts,
    },
    labor: {
      percentage: pacing.laborPercentage,
      target: pacing.targetPercentage,
      status: pacing.status,
      activeStaff: pacing.activeStaffCount,
      recommendation: pacing.recommendation,
    },
    inventory: {
      lowStock: ingredients.filter(
        (i) => num(i.currentStock) <= num(i.reorderTrigger) && num(i.currentStock) > 0,
      ).length,
      depleted: ingredients.filter((i) => num(i.currentStock) <= 0).length,
      totalItems: ingredients.length,
      totalValue: Number(
        ingredients
          .reduce((sum, i) => sum + num(i.currentStock) * num(i.unitCost), 0)
          .toFixed(2),
      ),
    },
    eightySix: eightySix.map((item) => ({
      id: item.id,
      name: item.name,
      reason: item.eightySixReason,
    })),
    reservations: {
      today: reservations.length,
      covers: reservations.reduce((sum, r) => sum + r.partySize, 0),
      vip: reservations.filter((r) => r.vip).length,
      waitlist: reservations.filter((r) => r.status === 'waitlist').length,
    },
    voice: { callsToday: calls },
    sales: { today: Number(sales.reduce((sum, o) => sum + num(o.total), 0).toFixed(2)) },
    timestamp: new Date().toISOString(),
  };
}
