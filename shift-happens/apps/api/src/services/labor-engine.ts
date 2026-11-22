import { prisma } from '@shift-happens/db';
import { env } from '../env.js';
import { emitRestaurant } from '../realtime.js';

const startOfHour = (date: Date) => {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
};
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);
const money = (value: unknown) => Number(value ?? 0);

export interface LaborPacing {
  restaurantId: string;
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

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  general_manager: 'General Manager',
  floor_manager: 'Floor Manager',
  chef_expo: 'Chef / Expo',
  line_cook: 'Line Cook',
  server: 'Server',
  bartender: 'Bartender',
  host: 'Host',
};

export async function calculateLaborPacing(
  restaurantId = env.RESTAURANT_ID,
  options: { emit?: boolean } = {},
): Promise<LaborPacing> {
  const [restaurant, activeStaff] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId } }),
    prisma.staffShift.findMany({
      where: { restaurantId, clockIn: { not: null }, clockOut: null },
      orderBy: { clockIn: 'asc' },
    }),
  ]);

  const currentHourlyBurn = activeStaff.reduce((sum, s) => sum + money(s.hourlyRate), 0);
  const now = new Date();
  const currentHourStart = startOfHour(now);
  const currentHourEnd = new Date(currentHourStart.getTime() + 3_600_000);

  const aggregateSales = async (from: Date) => {
    const result = await prisma.order.aggregate({
      _sum: { total: true },
      _count: true,
      where: {
        restaurantId,
        status: { in: ['served', 'paid'] },
        createdAt: { gte: from, lte: now },
      },
    });
    return {
      total: money(result._sum.total),
      count: typeof result._count === 'number' ? result._count : 0,
    };
  };

  // Labor is measured against the current trading window: the rolling service
  // block. We still expose the current-hour number separately for telemetry.
  const currentHour = await aggregateSales(currentHourStart);
  const windowStart = hoursAgo(4);
  const sales = await aggregateSales(windowStart);
  const fallback = currentHour.total === 0;

  const target = money(restaurant?.targetLaborPercentage ?? 18.5);
  const ratio = sales.total > 0 ? (currentHourlyBurn / sales.total) * 100 : 100;
  const isOverBudget = ratio > target;

  const nextHour = new Date(now.getTime() + 3_600_000);
  const cutAt = `${String(nextHour.getHours()).padStart(2, '0')}:00`;
  const afterCutBurn = Math.max(0, currentHourlyBurn - 17.5);
  const afterCutRatio = sales.total > 0 ? (afterCutBurn / sales.total) * 100 : 0;

  const projectionHours = Math.max(1, Math.ceil((new Date(now).getHours() - 17) / 2));
  const projectedSalesAtClose = sales.total * (1 + 0.4 * projectionHours);
  const projectedLabor =
    projectedSalesAtClose > 0 ? (currentHourlyBurn / projectedSalesAtClose) * 100 : ratio;

  const pacing: LaborPacing = {
    restaurantId,
    activeStaffCount: activeStaff.length,
    activeStaff: activeStaff.map((s) => ({
      shiftId: s.id,
      name: s.userName,
      role: s.role,
      roleLabel: ROLE_LABELS[s.role] ?? s.role,
      station: s.station,
      hourlyRate: money(s.hourlyRate),
      clockIn: s.clockIn?.toISOString() ?? null,
      scheduledEnd: s.scheduledEnd.toISOString(),
      hoursWorked: s.clockIn
        ? Number(((now.getTime() - s.clockIn.getTime()) / 3_600_000).toFixed(2))
        : 0,
    })),
    currentHourlyBurn: Number(currentHourlyBurn.toFixed(2)),
    currentHourSales: Number(currentHour.total.toFixed(2)),
    windowSales: Number(sales.total.toFixed(2)),
    laborPercentage: ratio.toFixed(1),
    laborRatio: Number(ratio.toFixed(2)),
    targetPercentage: target,
    status: isOverBudget ? 'PACING_ALERT' : 'OPTIMAL',
    recommendation: isOverBudget
      ? `Cut 1 Floater/Prep shift by ${cutAt} to rebalance to ${afterCutRatio.toFixed(1)}%`
      : 'Labor within target boundaries — hold current floor strength.',
    cutRecommendation: isOverBudget
      ? `Voluntary early cut for ${activeStaff.at(-1)?.userName ?? 'one floater'} · save $${afterCutBurn.toFixed(0)}/hr`
      : 'No cut recommended',
    window: {
      start: windowStart.toISOString(),
      end: currentHourEnd.toISOString(),
      label: fallback ? 'Rolling 4-hour trading window (pre-rush)' : 'Rolling 4-hour trading window',
      fallback,
    },
    projectedSalesAtClose: Number(projectedSalesAtClose.toFixed(2)),
    projectedLaborPercentage: projectedLabor.toFixed(1),
    timestamp: now.toISOString(),
  };

  if (options.emit !== false) {
    emitRestaurant(
      'LABOR_PACING_UPDATE',
      {
        event: 'LABOR_PACING_UPDATE',
        activeStaffCount: pacing.activeStaffCount,
        currentHourlyBurn: pacing.currentHourlyBurn,
        currentHourSales: pacing.currentHourSales,
        laborPercentage: pacing.laborPercentage,
        status: pacing.status,
        recommendation: pacing.recommendation,
        targetPercentage: pacing.targetPercentage,
        timestamp: pacing.timestamp,
      },
      restaurantId,
    );
  }
  return pacing;
}

export interface LaborForecastBucket {
  hour: string;
  label: string;
  forecastSales: number;
  scheduledWages: number;
  forecastLaborPct: number;
  scheduledStaff: number;
  status: 'OPTIMAL' | 'PACING_ALERT';
}

export async function getLaborForecast(
  restaurantId = env.RESTAURANT_ID,
  date = new Date(),
): Promise<{ buckets: LaborForecastBucket[]; targetPercentage: number }> {
  const [restaurant, shifts] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId } }),
    prisma.staffShift.findMany({
      where: {
        restaurantId,
        scheduledStart: { gte: new Date(new Date(date).setHours(0, 0, 0, 0)) },
        scheduledEnd: { lte: new Date(new Date(date).setHours(23, 59, 59, 999)) },
      },
    }),
  ]);
  const target = money(restaurant?.targetLaborPercentage ?? 18.5);
  const day = new Date(date).getDay();
  const weekend = day === 5 || day === 6;
  const shape: Record<number, number> = {
    16: 0.55, 17: 0.78, 18: 0.95, 19: 1.25, 20: 1.4, 21: 1.05, 22: 0.62, 23: 0.3,
  };

  const buckets: LaborForecastBucket[] = [];
  for (let hour = 16; hour <= 23; hour++) {
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + 3_600_000);
    const overlapping = shifts.filter(
      (s) => s.scheduledStart < end && s.scheduledEnd > start,
    );
    const wages = overlapping.reduce((sum, s) => sum + money(s.hourlyRate), 0);
    const forecastSales = Math.round(620 * (shape[hour] ?? 0.4) * (weekend ? 1.35 : 1));
    const pct = forecastSales > 0 ? (wages / forecastSales) * 100 : 0;
    buckets.push({
      hour: start.toISOString(),
      label: `${String(hour).padStart(2, '0')}:00`,
      forecastSales,
      scheduledWages: Number(wages.toFixed(2)),
      forecastLaborPct: Number(pct.toFixed(1)),
      scheduledStaff: overlapping.length,
      status: pct > target ? 'PACING_ALERT' : 'OPTIMAL',
    });
  }
  return { buckets, targetPercentage: target };
}
