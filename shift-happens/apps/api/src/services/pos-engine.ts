import { prisma } from '@shift-happens/db';
import {
  AUTO_GRATUITY_RATE,
  TAX_RATE,
  courseForCategory,
  type CreateOrderInput,
} from '@shift-happens/shared';
import { env } from '../env.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { emitRestaurant, emitStation } from '../realtime.js';
import { getTickets, toTicket } from './kds-engine.js';
import { calculateLaborPacing } from './labor-engine.js';

const num = (v: unknown) => Number(v ?? 0);
const round = (v: number, places = 2) => Number(v.toFixed(places));

const orderInclude = {
  items: { include: { menuItem: true }, orderBy: { createdAt: 'asc' as const } },
  table: true,
  server: true,
};

function serializeOrder(order: any) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    tableId: order.tableId,
    tableNumber: order.table?.tableNumber ?? null,
    zone: order.table?.zone ?? null,
    partyName: order.table?.currentPartyName ?? null,
    serverId: order.serverId,
    serverName: order.server?.name ?? null,
    status: order.status,
    subtotal: num(order.subtotal),
    tax: num(order.tax),
    tip: num(order.tip),
    total: num(order.total),
    allergyNotes: order.allergyNotes,
    createdAt: order.createdAt.toISOString(),
    closedAt: order.closedAt?.toISOString() ?? null,
    items: order.items.map((item: any) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      name: item.menuItem.name,
      quantity: item.quantity,
      unitPrice: num(item.unitPrice),
      modifiers: item.modifiers,
      prepStatus: item.prepStatus,
      station: item.station,
      course: item.course ?? 'main',
      seat: item.seat,
      notes: item.notes,
      createdAt: item.createdAt.toISOString(),
      bumpedAt: item.bumpedAt?.toISOString() ?? null,
    })),
  };
}

export async function createOrder(
  input: CreateOrderInput,
  restaurantId = env.RESTAURANT_ID,
) {
  const menuIds = [...new Set(input.items.map((item) => item.menuItemId))];
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuIds }, restaurantId },
    include: {
      category: true,
      recipe: {
        include: {
          recipeIngredients: { include: { ingredient: true } },
        },
      },
    },
  });
  if (menuItems.length !== menuIds.length) {
    throw badRequest('One or more menu items do not exist for this restaurant');
  }
  const menuMap = new Map(menuItems.map((item) => [item.id, item]));
  const blocked = menuItems.filter((item) => item.is86ed);
  if (blocked.length > 0) {
    throw conflict(
      `86'd items cannot be ordered: ${blocked.map((item) => item.name).join(', ')}`,
      { blocked: blocked.map((item) => ({ id: item.id, name: item.name })) },
    );
  }

  let serverId = input.serverId;
  if (serverId) {
    const staff = await prisma.staff.findFirst({ where: { id: serverId, restaurantId } });
    if (!staff) throw notFound('Server not found');
  } else {
    const fallback =
      (input.serverName
        ? await prisma.staff.findFirst({
            where: { restaurantId, name: { contains: input.serverName, mode: 'insensitive' } },
          })
        : null) ??
      (await prisma.staff.findFirst({
        where: { restaurantId, role: { in: ['server', 'bartender'] } },
        orderBy: { createdAt: 'asc' },
      }));
    if (!fallback) throw badRequest('No server available to attach the order to');
    serverId = fallback.id;
  }

  if (input.tableId) {
    const table = await prisma.diningTable.findFirst({
      where: { id: input.tableId, restaurantId },
    });
    if (!table) throw notFound('Table not found');
  }

  let subtotal = 0;
  const preparedRows = input.items.map((item) => {
    const menu = menuMap.get(item.menuItemId)!;
    const modifiersTotal = item.modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
    const unitPrice = num(menu.price) + modifiersTotal;
    subtotal += unitPrice * item.quantity;
    const course =
      item.course ??
      menu.course ??
      courseForCategory(menu.category?.name ?? '', menu.name);
    return {
      menuItemId: menu.id,
      quantity: item.quantity,
      unitPrice: round(unitPrice),
      modifiers: item.modifiers,
      course,
      station: menu.station,
      seat: item.seat !== undefined ? String(item.seat) : null,
      notes: item.notes ?? null,
    };
  });
  subtotal = round(subtotal);

  // If the round contains starters, hold the food mains until the kitchen
  // clears the starters. A mains-only round fires immediately.
  const hasStarters = preparedRows.some((row) => row.course === 'starter');
  const rows = preparedRows.map((row) => ({
    ...row,
    prepStatus:
      input.sendToKitchen && row.course === 'main' && hasStarters ? 'held' : 'firing',
  }));
  const tax = round(subtotal * TAX_RATE);
  const tip = input.autoGratuity ? round(subtotal * AUTO_GRATUITY_RATE) : 0;
  const total = round(subtotal + tax + tip);
  const status = input.sendToKitchen ? 'sent_to_kitchen' : 'open';

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        restaurantId,
        tableId: input.tableId ?? null,
        serverId: serverId!,
        status,
        subtotal,
        tax,
        tip,
        total,
        allergyNotes: input.allergyNotes ?? null,
        items: { create: rows },
      },
      include: orderInclude,
    });

    // --- Atomic ingredient depletion (orders ➔ recipes ➔ stock_transactions) ---
    const initialStock = new Map<string, number>();
    const lowStockAlerts: Array<Record<string, unknown>> = [];
    const eightySixed: Array<{ id: string; name: string }> = [];
    const seenEightySix = new Set<string>();

    for (let index = 0; index < input.items.length; index++) {
      const inputItem = input.items[index];
      const menu = menuMap.get(inputItem.menuItemId)!;
      const recipeIngredients = menu.recipe?.recipeIngredients ?? [];
      for (const ri of recipeIngredients) {
        const ingredient = ri.ingredient;
        const ingredientId = ingredient.id;
        const previous =
          initialStock.get(ingredientId) ?? num(ingredient.currentStock);
        const decrement = inputItem.quantity * num(ri.quantityRequired);
        const next = Math.max(0, round(previous - decrement, 3));
        initialStock.set(ingredientId, next);

        await tx.ingredient.update({
          where: { id: ingredientId },
          data: { currentStock: next, lastUpdated: new Date() },
        });
        await tx.stockTransaction.create({
          data: {
            restaurantId,
            ingredientId,
            quantityChange: round(next - previous, 3),
            reason: 'sale_deduction',
            referenceOrderId: order.id,
            note: `${menu.name} × ${inputItem.quantity}`,
          },
        });

        if (next <= num(ingredient.reorderTrigger)) {
          lowStockAlerts.push({
            event: 'LOW_STOCK_ALERT',
            ingredientId,
            name: ingredient.name,
            currentStock: next,
            parLevel: num(ingredient.parLevel),
            reorderTrigger: num(ingredient.reorderTrigger),
            unit: ingredient.unit,
            severity: next <= 0 ? 'depleted' : 'low',
            timestamp: new Date().toISOString(),
          });
        }

        if (next <= 0) {
          const linked = await tx.recipeIngredient.findMany({
            where: { ingredientId },
            include: { recipe: { include: { menuItem: true } } },
          });
          for (const link of linked) {
            const item = link.recipe.menuItem;
            if (!item.is86ed) {
              await tx.menuItem.update({
                where: { id: item.id },
                data: {
                  is86ed: true,
                  eightySixReason: `${ingredient.name} out of stock`,
                },
              });
              if (!seenEightySix.has(item.id)) {
                seenEightySix.add(item.id);
                eightySixed.push({ id: item.id, name: item.name });
              }
            }
          }
        }
      }
    }

    // Seating + stage: the first fired order moves an open table into Starters.
    if (input.tableId && input.sendToKitchen) {
      const table = await tx.diningTable.findUnique({ where: { id: input.tableId } });
      if (table && ['ready', 'seated'].includes(table.currentStage)) {
        await tx.diningTable.update({
          where: { id: table.id },
          data: {
            currentStage: 'starters',
            seatedAt: table.seatedAt ?? new Date(),
            stageUpdatedAt: new Date(),
            currentPartyName: input.partyName ?? table.currentPartyName,
            currentPartySize: input.partySize ?? table.currentPartySize,
          },
        });
      }
    }

    return { order, lowStockAlerts, eightySixed };
  });

  const order = result.order;
  const serialized = serializeOrder(order);

  // Realtime fan-out after commit.
  emitRestaurant('ORDER_CREATED', {
    event: 'ORDER_CREATED',
    order: serialized,
    timestamp: new Date().toISOString(),
  }, restaurantId);

  if (input.sendToKitchen) {
    const tickets = await getTickets(undefined, restaurantId);
    const ticket = tickets.find((t) => t.id === order.id);
    if (ticket) {
      for (const station of ticket.stations) {
        emitStation(station, 'KDS_NEW_TICKET', {
          event: 'KDS_NEW_TICKET',
          station,
          ticket: { ...ticket, items: ticket.items.filter((i) => i.station === station) },
          timestamp: new Date().toISOString(),
        });
      }
      emitRestaurant('KDS_NEW_TICKET', {
        event: 'KDS_NEW_TICKET',
        station: 'expo',
        ticket,
        timestamp: new Date().toISOString(),
      }, restaurantId);
    }
  }

  for (const alert of result.lowStockAlerts) {
    emitRestaurant('LOW_STOCK_ALERT', alert, restaurantId);
  }
  for (const item of result.eightySixed) {
    emitRestaurant('GLOBAL_86_ITEM_UPDATE', {
      event: 'GLOBAL_86_ITEM_UPDATE',
      menuItemId: item.id,
      name: item.name,
      is86ed: true,
      reason: 'Ingredient depleted by sale',
      source: 'stock',
      timestamp: new Date().toISOString(),
    }, restaurantId);
  }
  emitRestaurant('INVENTORY_UPDATED', {
    event: 'INVENTORY_UPDATED',
    orderId: order.id,
    lowStockCount: result.lowStockAlerts.length,
    newly86ed: result.eightySixed.length,
    timestamp: new Date().toISOString(),
  }, restaurantId);

  void calculateLaborPacing(restaurantId).catch((error) =>
    console.warn('labor pacing after sale failed', error),
  );

  return {
    order: serialized,
    lowStockAlerts: result.lowStockAlerts,
    newly86ed: result.eightySixed,
    totals: { subtotal, tax, tip, total },
  };
}

export async function listOrders(
  restaurantId = env.RESTAURANT_ID,
  options: { status?: string; limit?: number } = {},
) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      ...(options.status ? { status: options.status as never } : {}),
    },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 50,
  });
  return orders.map(serializeOrder);
}

export async function getOrder(orderId: string, restaurantId = env.RESTAURANT_ID) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: orderInclude,
  });
  if (!order) throw notFound('Order not found');
  return serializeOrder(order);
}

export async function payOrder(
  orderId: string,
  input: { tip?: number; method?: string } = {},
  restaurantId = env.RESTAURANT_ID,
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
  });
  if (!order) throw notFound('Order not found');
  if (order.status === 'void') throw conflict('Cannot pay a voided order');

  const tip = input.tip !== undefined ? round(input.tip) : num(order.tip);
  const total = round(num(order.subtotal) + num(order.tax) + tip);
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: 'paid',
      tip,
      total,
      closedAt: new Date(),
    },
    include: orderInclude,
  });
  const serialized = serializeOrder(updated);
  emitRestaurant('ORDER_CREATED', {
    event: 'ORDER_CREATED',
    order: serialized,
    payment: { method: input.method ?? 'card' },
    timestamp: new Date().toISOString(),
  }, restaurantId);
  void calculateLaborPacing(restaurantId).catch(() => undefined);
  return serialized;
}

export async function voidOrder(
  orderId: string,
  reason?: string,
  restaurantId = env.RESTAURANT_ID,
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
  });
  if (!order) throw notFound('Order not found');
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'void', closedAt: new Date() },
    include: orderInclude,
  });
  emitRestaurant('ORDER_VOIDED', {
    event: 'ORDER_VOIDED',
    orderId,
    orderNumber: order.orderNumber,
    reason: reason ?? 'Manager void',
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return serializeOrder(updated);
}
