import { prisma } from '@shift-happens/db';
import type { StockReason } from '@shift-happens/shared';
import { env } from '../env.js';
import { badRequest, notFound } from '../errors.js';
import { emitRestaurant } from '../realtime.js';

const num = (v: unknown) => Number(v ?? 0);
const round = (v: number, places = 3) => Number(v.toFixed(places));

export type StockStatus = 'ok' | 'watch' | 'low' | 'depleted';

export interface IngredientDto {
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
  status: StockStatus;
  stockPercentage: number;
  value: number;
  linkedMenuItems: string[];
  sku: string;
}

export function toIngredientDto(ingredient: any): IngredientDto {
  const current = num(ingredient.currentStock);
  const par = num(ingredient.parLevel);
  const reorder = num(ingredient.reorderTrigger);
  const status: StockStatus =
    current <= 0 ? 'depleted' : current <= reorder ? 'low' : current <= par * 1.1 ? 'watch' : 'ok';
  const linked = (ingredient.recipeIngredients ?? [])
    .map((ri: any) => ri.recipe?.menuItem?.name)
    .filter(Boolean);
  return {
    id: ingredient.id,
    name: ingredient.name,
    category: ingredient.category,
    currentStock: current,
    parLevel: par,
    unit: ingredient.unit,
    unitCost: num(ingredient.unitCost),
    supplierName: ingredient.supplierName,
    reorderTrigger: reorder,
    lastUpdated: ingredient.lastUpdated.toISOString(),
    status,
    stockPercentage: par > 0 ? Math.min(100, Math.round((current / par) * 100)) : 0,
    value: round(current * num(ingredient.unitCost), 2),
    linkedMenuItems: linked,
    sku: `SKU-${ingredient.id.slice(0, 4).toUpperCase()}-${ingredient.name.slice(0, 3).toUpperCase()}`,
  };
}

const ingredientInclude = {
  recipeIngredients: {
    include: {
      recipe: { include: { menuItem: { select: { id: true, name: true } } } },
    },
  },
};

export async function listIngredients(
  restaurantId = env.RESTAURANT_ID,
  filters: { category?: string; search?: string } = {},
) {
  const ingredients = await prisma.ingredient.findMany({
    where: {
      restaurantId,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { supplierName: { contains: filters.search, mode: 'insensitive' } },
              { category: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: ingredientInclude,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  const rows = ingredients.map(toIngredientDto);
  const all = await prisma.ingredient.findMany({ where: { restaurantId } });
  const categories = await prisma.ingredient.groupBy({
    by: ['category'],
    where: { restaurantId },
    _count: { _all: true },
  });
  return {
    ingredients: rows,
    summary: {
      totalItems: all.length,
      lowStock: all.filter((i) => num(i.currentStock) <= num(i.reorderTrigger) && num(i.currentStock) > 0).length,
      depleted: all.filter((i) => num(i.currentStock) <= 0).length,
      totalValue: round(
        all.reduce((sum, i) => sum + num(i.currentStock) * num(i.unitCost), 0),
        2,
      ),
      categories: categories.map((c) => ({ name: c.category, count: c._count._all })),
    },
  };
}

export async function listStockTransactions(
  restaurantId = env.RESTAURANT_ID,
  limit = 40,
) {
  const transactions = await prisma.stockTransaction.findMany({
    where: { restaurantId },
    include: { ingredient: { select: { name: true, unit: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return transactions.map((t) => ({
    id: t.id,
    ingredientId: t.ingredientId,
    ingredientName: t.ingredient.name,
    unit: t.ingredient.unit,
    quantityChange: num(t.quantityChange),
    reason: t.reason,
    referenceOrderId: t.referenceOrderId,
    note: t.note,
    createdAt: t.createdAt.toISOString(),
    direction: num(t.quantityChange) >= 0 ? 'up' : 'down',
  }));
}

async function linkedMenuItems(tx: any, ingredientId: string) {
  const rows = await tx.recipeIngredient.findMany({
    where: { ingredientId },
    include: { recipe: { include: { menuItem: true } } },
  });
  return rows.map((r: any) => r.recipe.menuItem);
}

async function recalcAvailabilityForIngredient(
  tx: any,
  ingredient: any,
  newStock: number,
  previousStock: number,
) {
  const menuItems = await linkedMenuItems(tx, ingredient.id);
  const changed: Array<{ id: string; name: string; is86ed: boolean }> = [];
  if (newStock <= 0) {
    for (const item of menuItems) {
      if (!item.is86ed) {
        await tx.menuItem.update({
          where: { id: item.id },
          data: {
            is86ed: true,
            eightySixReason: `${ingredient.name} out of stock`,
          },
        });
        changed.push({ id: item.id, name: item.name, is86ed: true });
      }
    }
  } else if (previousStock <= 0 && newStock > 0) {
    for (const item of menuItems) {
      if (item.is86ed && (item.eightySixReason ?? '').includes(ingredient.name)) {
        await tx.menuItem.update({
          where: { id: item.id },
          data: { is86ed: false, eightySixReason: null },
        });
        changed.push({ id: item.id, name: item.name, is86ed: false });
      }
    }
  }
  return changed;
}

export async function adjustStock(
  input: {
    ingredientId: string;
    newStock?: number;
    quantityChange?: number;
    reason: StockReason;
    note?: string;
  },
  restaurantId = env.RESTAURANT_ID,
) {
  const ingredient = await prisma.ingredient.findUnique({
    where: { id: input.ingredientId },
  });
  if (!ingredient || ingredient.restaurantId !== restaurantId) {
    throw notFound('Ingredient not found');
  }
  if (input.newStock === undefined && input.quantityChange === undefined) {
    throw badRequest('Provide newStock or quantityChange');
  }

  const previous = num(ingredient.currentStock);
  const target = Math.max(
    0,
    input.newStock !== undefined ? input.newStock : previous + (input.quantityChange ?? 0),
  );
  const delta = round(target - previous);

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.ingredient.update({
      where: { id: ingredient.id },
      data: { currentStock: target, lastUpdated: new Date() },
    });
    const transaction = await tx.stockTransaction.create({
      data: {
        restaurantId,
        ingredientId: ingredient.id,
        quantityChange: delta,
        reason: input.reason,
        note: input.note,
      },
    });
    const changed = await recalcAvailabilityForIngredient(tx, updated, target, previous);
    return { updated, transaction, changed };
  });

  const dto = toIngredientDto({ ...result.updated, recipeIngredients: [] });
  if (target <= num(ingredient.reorderTrigger)) {
    emitRestaurant('LOW_STOCK_ALERT', {
      event: 'LOW_STOCK_ALERT',
      ingredientId: ingredient.id,
      name: ingredient.name,
      currentStock: target,
      parLevel: num(ingredient.parLevel),
      reorderTrigger: num(ingredient.reorderTrigger),
      unit: ingredient.unit,
      severity: target <= 0 ? 'depleted' : 'low',
      timestamp: new Date().toISOString(),
    }, restaurantId);
  }
  for (const item of result.changed) {
    emitRestaurant('GLOBAL_86_ITEM_UPDATE', {
      event: 'GLOBAL_86_ITEM_UPDATE',
      menuItemId: item.id,
      name: item.name,
      is86ed: item.is86ed,
      reason: item.is86ed ? `${ingredient.name} out of stock` : 'Restocked',
      source: 'stock',
      timestamp: new Date().toISOString(),
    }, restaurantId);
  }
  emitRestaurant('INVENTORY_UPDATED', {
    event: 'INVENTORY_UPDATED',
    ingredient: dto,
    quantityChange: delta,
    reason: input.reason,
    timestamp: new Date().toISOString(),
  }, restaurantId);

  return {
    ingredient: dto,
    quantityChange: delta,
    previousStock: previous,
    transaction: {
      id: result.transaction.id,
      reason: result.transaction.reason,
      createdAt: result.transaction.createdAt.toISOString(),
    },
    menuItemsChanged: result.changed,
  };
}

export async function toggleMenuItem86(
  menuItemId: string,
  is86ed: boolean,
  reason?: string,
  restaurantId = env.RESTAURANT_ID,
) {
  const item = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
  if (!item || item.restaurantId !== restaurantId) throw notFound('Menu item not found');
  const updated = await prisma.menuItem.update({
    where: { id: menuItemId },
    data: { is86ed, eightySixReason: is86ed ? reason ?? 'Manually 86ed by manager' : null },
  });
  emitRestaurant('GLOBAL_86_ITEM_UPDATE', {
    event: 'GLOBAL_86_ITEM_UPDATE',
    menuItemId: updated.id,
    name: updated.name,
    is86ed: updated.is86ed,
    reason: updated.eightySixReason ?? undefined,
    source: 'manual',
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return updated;
}

export async function get86List(restaurantId = env.RESTAURANT_ID) {
  return prisma.menuItem.findMany({
    where: { restaurantId, is86ed: true },
    select: {
      id: true,
      name: true,
      station: true,
      price: true,
      eightySixReason: true,
      category: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export async function getPurchaseOrders(restaurantId = env.RESTAURANT_ID) {
  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId },
    orderBy: { supplierName: 'asc' },
  });
  const low = ingredients.filter((i) => num(i.currentStock) <= num(i.reorderTrigger));
  const bySupplier = new Map<string, typeof low>();
  for (const item of low) {
    const supplier = item.supplierName ?? 'Unassigned Supplier';
    bySupplier.set(supplier, [...(bySupplier.get(supplier) ?? []), item]);
  }
  return [...bySupplier.entries()].map(([supplier, items], index) => {
    const lines = items.map((i) => {
      const qty = Math.max(0, round(num(i.parLevel) - num(i.currentStock)));
      return {
        ingredientId: i.id,
        name: i.name,
        quantity: qty,
        unit: i.unit,
        unitCost: num(i.unitCost),
        lineTotal: round(qty * num(i.unitCost), 2),
      };
    });
    return {
      id: `PO-${String(index + 1).padStart(3, '0')}`,
      supplier,
      status: 'recommended',
      lines,
      total: round(lines.reduce((s, l) => s + l.lineTotal, 0), 2),
      createdAt: new Date().toISOString(),
    };
  });
}

export async function approvePurchaseOrder(
  supplier: string,
  ingredientIds: string[] | undefined,
  restaurantId = env.RESTAURANT_ID,
) {
  const ingredients = await prisma.ingredient.findMany({
    where: {
      restaurantId,
      supplierName: supplier,
      ...(ingredientIds?.length ? { id: { in: ingredientIds } } : {}),
    },
  });
  if (ingredients.length === 0) throw notFound('No ingredients for this supplier');

  const results = [];
  for (const ingredient of ingredients) {
    const toPar = Math.max(0, round(num(ingredient.parLevel) - num(ingredient.currentStock)));
    if (toPar <= 0) continue;
    results.push(
      await adjustStock(
        {
          ingredientId: ingredient.id,
          quantityChange: toPar,
          reason: 'purchase_receipt',
          note: `Auto-PO approval — ${supplier}`,
        },
        restaurantId,
      ),
    );
  }
  emitRestaurant('INVENTORY_UPDATED', {
    event: 'INVENTORY_UPDATED',
    purchaseOrder: { supplier, lines: results.length },
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return { supplier, restocked: results.length, results };
}
