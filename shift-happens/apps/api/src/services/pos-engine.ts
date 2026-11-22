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
  payments: { orderBy: { createdAt: 'asc' as const } },
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
    paymentMethod: order.paymentMethod ?? null,
    cardBrand: order.cardBrand ?? null,
    allergyNotes: order.allergyNotes,
    payments: (order.payments ?? []).map((payment: any) => ({
      id: payment.id,
      amount: num(payment.amount),
      method: payment.method,
      cardBrand: payment.cardBrand,
      label: payment.label,
      createdAt: payment.createdAt.toISOString(),
    })),
    paidAmount:
      order.status === 'paid' && (order.payments ?? []).length === 0
        ? num(order.total)
        : round(
            (order.payments ?? []).reduce(
              (sum: number, payment: any) => sum + num(payment.amount),
              0,
            ),
          ),
    balance:
      order.status === 'paid'
        ? 0
        : round(
            num(order.total) -
              (order.payments ?? []).reduce(
                (sum: number, payment: any) => sum + num(payment.amount),
                0,
              ),
          ),
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

async function prepareRound(
  items: CreateOrderInput['items'],
  restaurantId: string,
) {
  const menuIds = [...new Set(items.map((item) => item.menuItemId))];
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

  let subtotal = 0;
  const preparedRows = items.map((item) => {
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

  return { menuMap, preparedRows, subtotal: round(subtotal) };
}

/**
 * If the round contains starters, hold the food mains until the kitchen clears
 * the starters. A mains-only round fires immediately.
 */
function withPrepStatus(
  preparedRows: Array<Record<string, unknown> & { course: string }>,
  sendToKitchen: boolean,
) {
  const hasStarters = preparedRows.some((row) => row.course === 'starter');
  return preparedRows.map((row) => ({
    ...row,
    prepStatus:
      sendToKitchen && row.course === 'main' && hasStarters ? 'held' : 'firing',
  }));
}

async function depleteStock(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  params: {
    restaurantId: string;
    orderId: string;
    items: CreateOrderInput['items'];
    menuMap: Map<string, any>;
  },
) {
  const { restaurantId, orderId, items, menuMap } = params;
  const initialStock = new Map<string, number>();
  const lowStockAlerts: Array<Record<string, unknown>> = [];
  const eightySixed: Array<{ id: string; name: string }> = [];
  const seenEightySix = new Set<string>();

  for (let index = 0; index < items.length; index++) {
    const inputItem = items[index];
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
          referenceOrderId: orderId,
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
          const itemDate = link.recipe.menuItem;
          if (!itemDate.is86ed) {
            await tx.menuItem.update({
              where: { id: itemDate.id },
              data: {
                is86ed: true,
                eightySixReason: `${ingredient.name} out of stock`,
              },
            });
            if (!seenEightySix.has(itemDate.id)) {
              seenEightySix.add(itemDate.id);
              eightySixed.push({ id: itemDate.id, name: itemDate.name });
            }
          }
        }
      }
    }
  }

  return { lowStockAlerts, eightySixed };
}

/** The first fired round moves an open table into Starters. */
async function advanceTableForRound(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  params: {
    tableId?: string | null;
    sendToKitchen?: boolean;
    partyName?: string;
    partySize?: number;
    serverId?: string;
  },
) {
  if (!params.tableId || !params.sendToKitchen) return;
  const table = await tx.diningTable.findUnique({ where: { id: params.tableId } });
  if (table && ['ready', 'seated'].includes(table.currentStage)) {
    await tx.diningTable.update({
      where: { id: table.id },
      data: {
        currentStage: 'starters',
        seatedAt: table.seatedAt ?? new Date(),
        stageUpdatedAt: new Date(),
        currentPartyName: params.partyName ?? table.currentPartyName,
        currentPartySize: params.partySize ?? table.currentPartySize,
        serverId: table.serverId ?? params.serverId ?? null,
      },
    });
  }
}

async function fanOutOrder(
  restaurantId: string,
  order: any,
  serialized: any,
  options: {
    sendToKitchen: boolean;
    lowStockAlerts: Array<Record<string, unknown>>;
    eightySixed: Array<{ id: string; name: string }>;
  },
) {
  emitRestaurant('ORDER_CREATED', {
    event: 'ORDER_CREATED',
    order: serialized,
    timestamp: new Date().toISOString(),
  }, restaurantId);

  if (options.sendToKitchen) {
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

  for (const alert of options.lowStockAlerts) {
    emitRestaurant('LOW_STOCK_ALERT', alert, restaurantId);
  }
  for (const item of options.eightySixed) {
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
    lowStockCount: options.lowStockAlerts.length,
    newly86ed: options.eightySixed.length,
    timestamp: new Date().toISOString(),
  }, restaurantId);

  void calculateLaborPacing(restaurantId).catch((error) =>
    console.warn('labor pacing after sale failed', error),
  );
}

export async function createOrder(
  input: CreateOrderInput,
  restaurantId = env.RESTAURANT_ID,
) {
  const { menuMap, preparedRows, subtotal } = await prepareRound(
    input.items,
    restaurantId,
  );

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

  const rows = withPrepStatus(preparedRows, input.sendToKitchen);
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
        items: { create: rows as never },
      },
      include: orderInclude,
    });

    const { lowStockAlerts, eightySixed } = await depleteStock(tx, {
      restaurantId,
      orderId: order.id,
      items: input.items,
      menuMap,
    });

    await advanceTableForRound(tx, {
      tableId: input.tableId,
      sendToKitchen: input.sendToKitchen,
      partyName: input.partyName,
      partySize: input.partySize,
      serverId: serverId!,
    });

    return { order, lowStockAlerts, eightySixed };
  });

  const order = result.order;
  const serialized = serializeOrder(order);

  await fanOutOrder(restaurantId, order, serialized, {
    sendToKitchen: input.sendToKitchen,
    lowStockAlerts: result.lowStockAlerts,
    eightySixed: result.eightySixed,
  });

  return {
    order: serialized,
    lowStockAlerts: result.lowStockAlerts,
    newly86ed: result.eightySixed,
    totals: { subtotal, tax, tip, total },
  };
}

/**
 * Adds another round to an existing open check instead of opening a second
 * check on the same table.
 */
export async function appendOrderItems(
  orderId: string,
  input: {
    items: CreateOrderInput['items'];
    allergyNotes?: string | null;
    sendToKitchen?: boolean;
    autoGratuity?: boolean;
  },
  restaurantId = env.RESTAURANT_ID,
) {
  const existing = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
  });
  if (!existing) throw notFound('Check not found');
  if (existing.status === 'paid' || existing.status === 'void') {
    throw conflict('This check is closed — start a new order for this table.');
  }

  const sendToKitchen = input.sendToKitchen ?? true;
  const { menuMap, preparedRows, subtotal: roundSubtotal } = await prepareRound(
    input.items,
    restaurantId,
  );
  const rows = withPrepStatus(preparedRows, sendToKitchen);

  const subtotal = round(num(existing.subtotal) + roundSubtotal);
  const tax = round(subtotal * TAX_RATE);
  const tip = input.autoGratuity
    ? round(subtotal * AUTO_GRATUITY_RATE)
    : num(existing.tip);
  const total = round(subtotal + tax + tip);
  const status = sendToKitchen ? 'sent_to_kitchen' : existing.status;

  const result = await prisma.$transaction(async (tx) => {
    await tx.orderItem.createMany({
      data: rows.map((row) => ({ ...row, orderId })) as never,
    });
    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal,
        tax,
        tip,
        total,
        status,
        ...(input.allergyNotes !== undefined
          ? { allergyNotes: input.allergyNotes }
          : {}),
      },
    });

    const { lowStockAlerts, eightySixed } = await depleteStock(tx, {
      restaurantId,
      orderId,
      items: input.items,
      menuMap,
    });

    await advanceTableForRound(tx, {
      tableId: existing.tableId,
      sendToKitchen,
      serverId: existing.serverId,
    });

    return { lowStockAlerts, eightySixed };
  });

  const order = await getOrder(orderId, restaurantId);
  await fanOutOrder(
    restaurantId,
    { id: orderId },
    order,
    {
      sendToKitchen,
      lowStockAlerts: result.lowStockAlerts,
      eightySixed: result.eightySixed,
    },
  );

  return {
    order,
    lowStockAlerts: result.lowStockAlerts,
    newly86ed: result.eightySixed,
    totals: { subtotal, tax, tip, total },
  };
}

export async function listOrders(
  restaurantId = env.RESTAURANT_ID,
  options: { status?: string; limit?: number; serverId?: string } = {},
) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      ...(options.status ? { status: options.status as never } : {}),
      ...(options.serverId ? { serverId: options.serverId } : {}),
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

export async function getOrderByNumber(
  orderNumber: number,
  restaurantId = env.RESTAURANT_ID,
) {
  const order = await prisma.order.findFirst({
    where: { restaurantId, orderNumber },
    include: orderInclude,
  });
  if (!order) throw notFound(`Check #${orderNumber} not found`);
  return serializeOrder(order);
}

/** Manager amendment: re-opens a paid check so items/tip can be corrected. */
export async function reopenOrder(
  orderId: string,
  restaurantId = env.RESTAURANT_ID,
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
  });
  if (!order) throw notFound('Order not found');
  if (order.status !== 'paid') {
    throw conflict('Only a paid check can be re-opened.');
  }
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'sent_to_kitchen', closedAt: null },
    include: orderInclude,
  });
  const serialized = serializeOrder(updated);
  emitRestaurant('ORDER_CREATED', {
    event: 'ORDER_CREATED',
    order: serialized,
    reopened: true,
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return serialized;
}

export async function payOrder(
  orderId: string,
  input: { tip?: number; method?: string; cardBrand?: string } = {},
  restaurantId = env.RESTAURANT_ID,
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
  });
  if (!order) throw notFound('Order not found');
  if (order.status === 'void') throw conflict('Cannot pay a voided order');
  if (order.status === 'paid') throw conflict('This check is already paid');

  const tip = input.tip !== undefined ? round(input.tip) : num(order.tip);
  const total = round(num(order.subtotal) + num(order.tax) + tip);
  const method = input.method ?? 'card';
  const cardBrand = method === 'cash' ? null : (input.cardBrand ?? 'other');
  const updated = await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: { orderId, amount: total, method, cardBrand, label: 'Full payment' },
    });
    return tx.order.update({
      where: { id: orderId },
      data: {
        status: 'paid',
        tip,
        total,
        closedAt: new Date(),
        paymentMethod: method,
        cardBrand,
      },
      include: orderInclude,
    });
  });
  const serialized = serializeOrder(updated);
  emitRestaurant('ORDER_CREATED', {
    event: 'ORDER_CREATED',
    order: serialized,
    payment: {
      method: input.method ?? 'card',
      cardBrand: input.cardBrand ?? null,
    },
    timestamp: new Date().toISOString(),
  }, restaurantId);
  void calculateLaborPacing(restaurantId).catch(() => undefined);
  return serialized;
}

/**
 * Records a (possibly partial) payment against an open check. The guest can
 * pay part card, part cash, part gift card; the check closes automatically
 * when the payments cover the total.
 */
export async function addOrderPayment(
  orderId: string,
  input: {
    amount: number;
    method: string;
    cardBrand?: string;
    tip?: number;
    label?: string | null;
  },
  restaurantId = env.RESTAURANT_ID,
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { payments: true },
  });
  if (!order) throw notFound('Order not found');
  if (order.status === 'void') throw conflict('Cannot pay a voided check');
  if (order.status === 'paid') throw conflict('This check is already paid');

  const subtotal = num(order.subtotal);
  const tax = num(order.tax);
  const tip =
    input.tip !== undefined ? Math.max(0, round(input.tip)) : num(order.tip);
  const total = round(subtotal + tax + tip);
  const paidBefore = round(
    order.payments.reduce((sum, payment) => sum + num(payment.amount), 0),
  );
  const amount = round(input.amount);
  const remaining = round(total - paidBefore);

  if (remaining < -0.005) {
    throw badRequest(
      'The tip is lower than the amount already paid. Raise the tip or refund a payment first.',
    );
  }
  if (!(amount > 0)) throw badRequest('Enter a payment amount above zero');
  if (amount > remaining + 0.005) {
    throw badRequest(
      `That is more than the remaining balance of $${remaining.toFixed(2)}.`,
    );
  }

  const fullyPaid = round(paidBefore + amount) >= total - 0.005;
  const method = input.method;
  const cardBrand = method === 'cash' ? null : (input.cardBrand ?? 'other');
  const isFirstPayment = order.payments.length === 0;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        orderId,
        amount,
        method,
        cardBrand,
        label: input.label ?? null,
      },
    });
    return tx.order.update({
      where: { id: orderId },
      data: {
        tip,
        total,
        ...(fullyPaid
          ? {
              status: 'paid',
              closedAt: new Date(),
              paymentMethod: isFirstPayment ? method : 'split',
              cardBrand,
            }
          : {}),
      },
      include: orderInclude,
    });
  });

  const serialized = serializeOrder(updated);
  emitRestaurant('ORDER_CREATED', {
    event: 'ORDER_CREATED',
    order: serialized,
    payment: { method, cardBrand, amount },
    timestamp: new Date().toISOString(),
  }, restaurantId);
  if (fullyPaid) {
    void calculateLaborPacing(restaurantId).catch(() => undefined);
  }
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
