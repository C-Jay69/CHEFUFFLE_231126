import { prisma, Prisma } from '@shift-happens/db';
import {
  AUTO_GRATUITY_PERCENT,
  DEFAULT_TAX_RATE_PERCENT,
  courseForCategory,
  type CreateOrderInput,
} from '@shift-happens/shared';
import { env } from '../env.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { recordAudit } from '../lib/audit.js';
import {
  applyTax,
  formatMinor,
  fromMinor,
  minorToNumber,
  percentOfMinor,
  toMinor,
} from '../lib/money.js';
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

type PaymentLike = {
  amount: unknown;
  kind?: string | null;
  status?: string | null;
};

function isCaptured(payment: PaymentLike) {
  return (payment.status ?? 'captured') === 'captured';
}

/**
 * The payment ledger: captured `payment` rows minus `refund` rows.
 * Refund rows are stored with a negative amount, but legacy/test rows may be
 * positive, so the kind decides the sign.
 */
export function paymentNetMinor(payments: readonly PaymentLike[]): number {
  let net = 0;
  for (const payment of payments) {
    if (!isCaptured(payment)) continue;
    const amount = toMinor(payment.amount);
    if ((payment.kind ?? 'payment') === 'refund') net -= Math.abs(amount);
    else net += amount;
  }
  return net;
}

function uniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

interface RestaurantMoneyConfig {
  taxRatePercent: unknown;
  taxInclusive: boolean;
  currency: string;
}

async function restaurantMoneyConfig(
  restaurantId: string,
): Promise<RestaurantMoneyConfig> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { taxRate: true, taxInclusive: true, currency: true },
  });
  if (!restaurant) throw notFound('Restaurant not found');
  return {
    taxRatePercent: restaurant.taxRate ?? DEFAULT_TAX_RATE_PERCENT,
    taxInclusive: restaurant.taxInclusive,
    currency: restaurant.currency,
  };
}

/** Serialised restaurant tax config for POS clients (percent, not fraction). */
export async function getRestaurantConfig(restaurantId = env.RESTAURANT_ID) {
  const config = await restaurantMoneyConfig(restaurantId);
  return {
    taxRate: minorToNumber(toMinor(config.taxRatePercent)),
    taxInclusive: config.taxInclusive,
    currency: config.currency,
  };
}

function serializeOrder(order: any) {
  const payments = order.payments ?? [];
  const hasLedger = payments.length > 0;
  const paidAmountMinor = hasLedger
    ? paymentNetMinor(payments)
    : order.status === 'paid'
      ? toMinor(order.total)
      : 0;
  const totalMinor = toMinor(order.total);

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
    subtotal: minorToNumber(toMinor(order.subtotal)),
    tax: minorToNumber(toMinor(order.tax)),
    tip: minorToNumber(toMinor(order.tip)),
    total: minorToNumber(totalMinor),
    paymentMethod: order.paymentMethod ?? null,
    cardBrand: order.cardBrand ?? null,
    voidReason: order.voidReason ?? null,
    voidedBy: order.voidedBy ?? null,
    allergyNotes: order.allergyNotes,
    payments: payments.map((payment: any) => ({
      id: payment.id,
      amount: minorToNumber(toMinor(payment.amount)),
      method: payment.method,
      cardBrand: payment.cardBrand,
      label: payment.label,
      kind: payment.kind ?? 'payment',
      status: payment.status ?? 'captured',
      refundOfId: payment.refundOfId ?? null,
      createdAt: payment.createdAt.toISOString(),
    })),
    paidAmount: minorToNumber(paidAmountMinor),
    balance: minorToNumber(Math.max(0, totalMinor - paidAmountMinor)),
    createdAt: order.createdAt.toISOString(),
    closedAt: order.closedAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    items: order.items.map((item: any) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      name: item.menuItem.name,
      quantity: item.quantity,
      unitPrice: minorToNumber(toMinor(item.unitPrice)),
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

  let subtotalMinor = 0;
  const preparedRows = items.map((item) => {
    const menu = menuMap.get(item.menuItemId)!;
    const modifiersTotalMinor = item.modifiers.reduce(
      (sum, modifier) => sum + toMinor(modifier.priceDelta),
      0,
    );
    const unitPriceMinor = toMinor(menu.price) + modifiersTotalMinor;
    subtotalMinor += unitPriceMinor * item.quantity;
    const course =
      item.course ??
      menu.course ??
      courseForCategory(menu.category?.name ?? '', menu.name);
    return {
      menuItemId: menu.id,
      quantity: item.quantity,
      unitPrice: fromMinor(unitPriceMinor),
      modifiers: item.modifiers,
      course,
      station: menu.station,
      seat: item.seat !== undefined ? String(item.seat) : null,
      notes: item.notes ?? null,
    };
  });

  return { menuMap, preparedRows, subtotalMinor };
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
  const { menuMap, preparedRows, subtotalMinor } = await prepareRound(
    input.items,
    restaurantId,
  );
  const moneyConfig = await restaurantMoneyConfig(restaurantId);

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
  const { subtotalMinor: netSubtotalMinor, taxMinor } = applyTax(
    subtotalMinor,
    moneyConfig.taxRatePercent,
    moneyConfig.taxInclusive,
  );
  const tipMinor = input.autoGratuity
    ? percentOfMinor(netSubtotalMinor, AUTO_GRATUITY_PERCENT)
    : 0;
  const totalMinor = netSubtotalMinor + taxMinor + tipMinor;
  const status = input.sendToKitchen ? 'sent_to_kitchen' : 'open';

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        restaurantId,
        tableId: input.tableId ?? null,
        serverId: serverId!,
        status,
        subtotal: fromMinor(netSubtotalMinor),
        tax: fromMinor(taxMinor),
        tip: fromMinor(tipMinor),
        total: fromMinor(totalMinor),
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
    totals: {
      subtotal: minorToNumber(netSubtotalMinor),
      tax: minorToNumber(taxMinor),
      tip: minorToNumber(tipMinor),
      total: minorToNumber(totalMinor),
    },
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
  const { menuMap, preparedRows, subtotalMinor: roundSubtotalMinor } = await prepareRound(
    input.items,
    restaurantId,
  );
  const moneyConfig = await restaurantMoneyConfig(restaurantId);
  const rows = withPrepStatus(preparedRows, sendToKitchen);

  // Recompute from the new gross menu subtotal so an inclusive restaurant
  // does not double-count the tax it already embedded in the previous items.
  // `order.subtotal` is net of tax, so for exclusive tax it already is the
  // previous menu gross; for inclusive tax the gross is subtotal + tax.
  const previousGrossMinor = moneyConfig.taxInclusive
    ? toMinor(existing.subtotal) + toMinor(existing.tax)
    : toMinor(existing.subtotal);
  const grossSubtotalMinor = previousGrossMinor + roundSubtotalMinor;
  const { subtotalMinor, taxMinor } = applyTax(
    grossSubtotalMinor,
    moneyConfig.taxRatePercent,
    moneyConfig.taxInclusive,
  );
  // Auto-gratuity is stored once on the order; appending a round recalculates
  // it from the new subtotal rather than layering a second gratuity on top.
  const tipMinor = input.autoGratuity
    ? percentOfMinor(subtotalMinor, AUTO_GRATUITY_PERCENT)
    : toMinor(existing.tip);
  const totalMinor = subtotalMinor + taxMinor + tipMinor;
  const status = sendToKitchen ? 'sent_to_kitchen' : existing.status;

  const result = await prisma.$transaction(async (tx) => {
    await tx.orderItem.createMany({
      data: rows.map((row) => ({ ...row, orderId })) as never,
    });
    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal: fromMinor(subtotalMinor),
        tax: fromMinor(taxMinor),
        tip: fromMinor(tipMinor),
        total: fromMinor(totalMinor),
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
    totals: {
      subtotal: minorToNumber(subtotalMinor),
      tax: minorToNumber(taxMinor),
      tip: minorToNumber(tipMinor),
      total: minorToNumber(totalMinor),
    },
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
  options: { actorStaffId?: string | null } = {},
) {
  const reopened = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM orders
      WHERE id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid
      FOR UPDATE`;
    if (locked.length === 0) throw notFound('Order not found');

    const order = await tx.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order) throw notFound('Order not found');
    if (order.status !== 'paid') {
      throw conflict('Only a paid check can be re-opened.');
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: 'sent_to_kitchen', closedAt: null, paidAt: null },
      include: orderInclude,
    });

    await recordAudit(
      {
        restaurantId,
        actorStaffId: options.actorStaffId ?? null,
        action: 'order.reopen',
        entity: 'order',
        entityId: orderId,
        before: { status: order.status, closedAt: order.closedAt },
        after: { status: updated.status, closedAt: null },
        reason: 'Manager reopened a paid check',
      },
      tx,
    );

    return serializeOrder(updated);
  });

  emitRestaurant('ORDER_CREATED', {
    event: 'ORDER_CREATED',
    order: reopened,
    reopened: true,
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return reopened;
}

/**
 * Settle the outstanding balance of a check. The remaining amount is always
 * recomputed from the payment ledger inside a row-locked transaction, so a
 * concurrent or repeated call can never charge the full total twice.
 *
 * Pass `amount` to take a partial payment; omit it to settle exactly the
 * remainder. An amount above the remainder is rejected.
 */
export async function payOrder(
  orderId: string,
  input: {
    amount?: number;
    tip?: number;
    method?: string;
    cardBrand?: string;
    idempotencyKey?: string;
  } = {},
  restaurantId = env.RESTAURANT_ID,
  options: { actorStaffId?: string | null } = {},
) {
  const method = input.method ?? 'card';
  const cardBrand = method === 'cash' ? null : (input.cardBrand ?? 'other');
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialise every settlement for this order.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM orders
        WHERE id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid
        FOR UPDATE`;
      if (locked.length === 0) throw notFound('Order not found');

      const order = await tx.order.findFirst({
        where: { id: orderId, restaurantId },
        include: { payments: { orderBy: { createdAt: 'asc' } } },
      });
      if (!order) throw notFound('Order not found');

      // A replay with the same idempotency key returns the committed result
      // even when the first call already closed the check.
      if (idempotencyKey) {
        const existing = await tx.payment.findFirst({
          where: { orderId, idempotencyKey },
        });
        if (existing) {
          const current = await tx.order.findFirstOrThrow({
            where: { id: orderId },
            include: orderInclude,
          });
          return { order: serializeOrder(current), payment: existing, reused: true };
        }
      }

      if (order.status === 'void') throw conflict('Cannot pay a voided order');
      if (order.status === 'paid') throw conflict('This check is already paid');

      const subtotalMinor = toMinor(order.subtotal);
      const taxMinor = toMinor(order.tax);
      const tipMinor =
        input.tip !== undefined ? Math.max(0, toMinor(input.tip)) : toMinor(order.tip);
      const totalMinor = subtotalMinor + taxMinor + tipMinor;
      const paidBeforeMinor = paymentNetMinor(order.payments);
      const remainingMinor = totalMinor - paidBeforeMinor;

      if (remainingMinor <= 0) {
        throw conflict('This check is already settled.');
      }

      const requestedMinor =
        input.amount !== undefined ? toMinor(input.amount) : remainingMinor;
      if (requestedMinor <= 0) {
        throw badRequest('Enter a payment amount above zero');
      }
      if (requestedMinor > remainingMinor) {
        throw badRequest(
          `That is more than the remaining balance of ${formatMinor(remainingMinor)}.`,
        );
      }

      const fullyPaid = requestedMinor === remainingMinor;
      const hadPayment = order.payments.some(
        (payment) => (payment.kind ?? 'payment') === 'payment' && isCaptured(payment),
      );

      const payment = await tx.payment.create({
        data: {
          orderId,
          amount: fromMinor(requestedMinor),
          method,
          cardBrand,
          label: fullyPaid
            ? hadPayment
              ? 'Balance payment'
              : 'Full payment'
            : 'Partial payment',
          kind: 'payment',
          status: 'captured',
          idempotencyKey,
          createdBy: options.actorStaffId ?? null,
        },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          tip: fromMinor(tipMinor),
          total: fromMinor(totalMinor),
          ...(fullyPaid
            ? {
                status: 'paid',
                closedAt: new Date(),
                paidAt: new Date(),
                paymentMethod: hadPayment ? 'split' : method,
                cardBrand,
              }
            : {}),
        },
        include: orderInclude,
      });

      await recordAudit(
        {
          restaurantId,
          actorStaffId: options.actorStaffId ?? null,
          action: 'payment.capture',
          entity: 'order',
          entityId: orderId,
          after: {
            paymentId: payment.id,
            amount: minorToNumber(requestedMinor),
            method,
            cardBrand,
            kind: 'payment',
            balanceAfter: minorToNumber(remainingMinor - requestedMinor),
          },
        },
        tx,
      );

      return { order: serializeOrder(updated), payment, reused: false };
    });

    if (!result.reused) {
      emitRestaurant('ORDER_CREATED', {
        event: 'ORDER_CREATED',
        order: result.order,
        payment: {
          id: result.payment.id,
          method,
          cardBrand,
          amount: minorToNumber(toMinor(result.payment.amount)),
        },
        timestamp: new Date().toISOString(),
      }, restaurantId);
      if (result.order.status === 'paid') {
        void calculateLaborPacing(restaurantId).catch(() => undefined);
      }
    }
    return result.order;
  } catch (error) {
    if (idempotencyKey && uniqueViolation(error)) {
      const existing = await prisma.payment.findFirst({
        where: { orderId, idempotencyKey },
      });
      if (existing) return getOrder(orderId, restaurantId);
    }
    throw error;
  }
}

/**
 * Records a (possibly partial) payment against an open check. The guest can
 * pay part card, part cash, part gift card; the check closes automatically
 * when the ledger covers the total.
 */
export async function addOrderPayment(
  orderId: string,
  input: {
    amount: number;
    method: string;
    cardBrand?: string;
    tip?: number;
    label?: string | null;
    idempotencyKey?: string;
  },
  restaurantId = env.RESTAURANT_ID,
  options: { actorStaffId?: string | null } = {},
) {
  const method = input.method;
  const cardBrand = method === 'cash' ? null : (input.cardBrand ?? 'other');
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM orders
        WHERE id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid
        FOR UPDATE`;
      if (locked.length === 0) throw notFound('Order not found');

      const order = await tx.order.findFirst({
        where: { id: orderId, restaurantId },
        include: { payments: { orderBy: { createdAt: 'asc' } } },
      });
      if (!order) throw notFound('Order not found');

      if (idempotencyKey) {
        const existing = await tx.payment.findFirst({
          where: { orderId, idempotencyKey },
        });
        if (existing) {
          const current = await tx.order.findFirstOrThrow({
            where: { id: orderId },
            include: orderInclude,
          });
          return {
            order: serializeOrder(current),
            payment: existing,
            fullyPaid: false,
            reused: true,
          };
        }
      }

      if (order.status === 'void') throw conflict('Cannot pay a voided check');
      if (order.status === 'paid') throw conflict('This check is already paid');

      const subtotalMinor = toMinor(order.subtotal);
      const taxMinor = toMinor(order.tax);
      const tipMinor =
        input.tip !== undefined ? Math.max(0, toMinor(input.tip)) : toMinor(order.tip);
      const totalMinor = subtotalMinor + taxMinor + tipMinor;
      const paidBeforeMinor = paymentNetMinor(order.payments);
      const remainingMinor = totalMinor - paidBeforeMinor;

      if (remainingMinor < 0) {
        throw badRequest(
          'The tip is lower than the amount already paid. Raise the tip or refund a payment first.',
        );
      }

      const amountMinor = toMinor(input.amount);
      if (amountMinor <= 0) throw badRequest('Enter a payment amount above zero');
      if (amountMinor > remainingMinor) {
        throw badRequest(
          `That is more than the remaining balance of ${formatMinor(remainingMinor)}.`,
        );
      }

      const fullyPaid = amountMinor === remainingMinor;
      const isFirstPayment = !order.payments.some(
        (payment) => (payment.kind ?? 'payment') === 'payment' && isCaptured(payment),
      );

      const payment = await tx.payment.create({
        data: {
          orderId,
          amount: fromMinor(amountMinor),
          method,
          cardBrand,
          label: input.label ?? null,
          kind: 'payment',
          status: 'captured',
          idempotencyKey,
          createdBy: options.actorStaffId ?? null,
        },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          tip: fromMinor(tipMinor),
          total: fromMinor(totalMinor),
          ...(fullyPaid
            ? {
                status: 'paid',
                closedAt: new Date(),
                paidAt: new Date(),
                paymentMethod: isFirstPayment ? method : 'split',
                cardBrand,
              }
            : {}),
        },
        include: orderInclude,
      });

      await recordAudit(
        {
          restaurantId,
          actorStaffId: options.actorStaffId ?? null,
          action: 'payment.capture',
          entity: 'order',
          entityId: orderId,
          after: {
            paymentId: payment.id,
            amount: minorToNumber(amountMinor),
            method,
            cardBrand,
            kind: 'payment',
            label: input.label ?? null,
            balanceAfter: minorToNumber(remainingMinor - amountMinor),
          },
        },
        tx,
      );

      return {
        order: serializeOrder(updated),
        payment,
        fullyPaid,
        reused: false,
      };
    });

    if (!result.reused) {
      emitRestaurant('ORDER_CREATED', {
        event: 'ORDER_CREATED',
        order: result.order,
        payment: {
          id: result.payment.id,
          method,
          cardBrand,
          amount: minorToNumber(toMinor(result.payment.amount)),
        },
        timestamp: new Date().toISOString(),
      }, restaurantId);
      if (result.fullyPaid) {
        void calculateLaborPacing(restaurantId).catch(() => undefined);
      }
    }
    return result.order;
  } catch (error) {
    if (idempotencyKey && uniqueViolation(error)) {
      const existing = await prisma.payment.findFirst({
        where: { orderId, idempotencyKey },
      });
      if (existing) return getOrder(orderId, restaurantId);
    }
    throw error;
  }
}

/**
 * Refund captured money. The refund is stored as a negative `kind='refund'`
 * payment row; the ledger (payments minus refunds) can never go below zero.
 */
export async function refundOrder(
  orderId: string,
  input: {
    amount?: number;
    reason: string;
    method?: string;
    cardBrand?: string;
    idempotencyKey?: string;
  },
  restaurantId = env.RESTAURANT_ID,
  options: { actorStaffId?: string | null } = {},
) {
  const reason = input.reason?.trim();
  if (!reason) throw badRequest('A refund reason is required.');
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM orders
        WHERE id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid
        FOR UPDATE`;
      if (locked.length === 0) throw notFound('Order not found');

      const order = await tx.order.findFirst({
        where: { id: orderId, restaurantId },
        include: { payments: { orderBy: { createdAt: 'asc' } } },
      });
      if (!order) throw notFound('Order not found');

      if (idempotencyKey) {
        const existing = await tx.payment.findFirst({
          where: { orderId, idempotencyKey },
        });
        if (existing) {
          const current = await tx.order.findFirstOrThrow({
            where: { id: orderId },
            include: orderInclude,
          });
          return { order: serializeOrder(current), payment: existing, reused: true };
        }
      }

      if (order.status === 'void') {
        throw conflict('Cannot refund a voided check.');
      }

      const capturedMinor = paymentNetMinor(order.payments);
      if (capturedMinor <= 0) {
        throw badRequest('This check has no captured payment to refund.');
      }

      const requestedMinor =
        input.amount !== undefined ? toMinor(input.amount) : capturedMinor;
      if (requestedMinor <= 0) {
        throw badRequest('Enter a refund amount above zero');
      }
      if (requestedMinor > capturedMinor) {
        throw badRequest(
          `Refund cannot exceed the captured balance of ${formatMinor(capturedMinor)}.`,
        );
      }

      const original = [...order.payments]
        .reverse()
        .find(
          (payment) =>
            (payment.kind ?? 'payment') === 'payment' && isCaptured(payment),
        );
      const refundMethod = input.method ?? original?.method ?? 'card';
      const refundBrand =
        refundMethod === 'cash'
          ? null
          : (input.cardBrand ?? original?.cardBrand ?? 'other');

      const payment = await tx.payment.create({
        data: {
          orderId,
          amount: fromMinor(-requestedMinor),
          method: refundMethod,
          cardBrand: refundBrand,
          label: reason.slice(0, 60),
          kind: 'refund',
          status: 'captured',
          idempotencyKey,
          refundOfId: original?.id ?? null,
          createdBy: options.actorStaffId ?? null,
        },
      });

      const updated = await tx.order.findFirstOrThrow({
        where: { id: orderId },
        include: orderInclude,
      });

      await recordAudit(
        {
          restaurantId,
          actorStaffId: options.actorStaffId ?? null,
          action: 'payment.refund',
          entity: 'order',
          entityId: orderId,
          after: {
            paymentId: payment.id,
            amount: minorToNumber(requestedMinor),
            storedAmount: minorToNumber(-requestedMinor),
            method: refundMethod,
            cardBrand: refundBrand,
            refundOfId: original?.id ?? null,
            capturedBefore: minorToNumber(capturedMinor),
            capturedAfter: minorToNumber(capturedMinor - requestedMinor),
          },
          reason,
        },
        tx,
      );

      return { order: serializeOrder(updated), payment, reused: false };
    });

    if (!result.reused) {
      emitRestaurant('ORDER_CREATED', {
        event: 'ORDER_CREATED',
        order: result.order,
        refund: {
          id: result.payment.id,
          amount: minorToNumber(toMinor(result.payment.amount)),
        },
        timestamp: new Date().toISOString(),
      }, restaurantId);
    }
    return result.order;
  } catch (error) {
    if (idempotencyKey && uniqueViolation(error)) {
      const existing = await prisma.payment.findFirst({
        where: { orderId, idempotencyKey },
      });
      if (existing) return getOrder(orderId, restaurantId);
    }
    throw error;
  }
}

/**
 * Void a check. A reason is mandatory. A check with captured money cannot be
 * silently voided: pass `refund: true` to reverse the captured ledger first.
 */
export async function voidOrder(
  orderId: string,
  reason: string | undefined,
  restaurantId = env.RESTAURANT_ID,
  options: { actorStaffId?: string | null; refund?: boolean } = {},
) {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest('A void reason is required.');

  const voided = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM orders
      WHERE id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid
      FOR UPDATE`;
    if (locked.length === 0) throw notFound('Order not found');

    const order = await tx.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { payments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order) throw notFound('Order not found');
    if (order.status === 'void') {
      throw conflict('This check is already voided.');
    }

    // Legacy paid orders predate the payment ledger; treat the stored total as
    // captured so they cannot be silently voided either.
    const capturedMinor =
      order.payments.length > 0
        ? paymentNetMinor(order.payments)
        : order.status === 'paid'
          ? toMinor(order.total)
          : 0;

    if (capturedMinor > 0 && !options.refund) {
      throw conflict(
        'This check has captured payments. Void it with refund: true to reverse them.',
      );
    }

    if (capturedMinor > 0) {
      const original = [...order.payments]
        .reverse()
        .find(
          (payment) =>
            (payment.kind ?? 'payment') === 'payment' && isCaptured(payment),
        );
      const refund = await tx.payment.create({
        data: {
          orderId,
          amount: fromMinor(-capturedMinor),
          method: original?.method ?? order.paymentMethod ?? 'card',
          cardBrand: original?.cardBrand ?? order.cardBrand ?? null,
          label: `Void: ${trimmedReason}`.slice(0, 60),
          kind: 'refund',
          status: 'captured',
          refundOfId: original?.id ?? null,
          createdBy: options.actorStaffId ?? null,
        },
      });

      await recordAudit(
        {
          restaurantId,
          actorStaffId: options.actorStaffId ?? null,
          action: 'payment.refund',
          entity: 'order',
          entityId: orderId,
          after: {
            paymentId: refund.id,
            amount: minorToNumber(capturedMinor),
            storedAmount: minorToNumber(-capturedMinor),
            method: original?.method ?? order.paymentMethod ?? 'card',
            reason: 'void',
          },
          reason: trimmedReason,
        },
        tx,
      );
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'void',
        closedAt: new Date(),
        voidReason: trimmedReason,
        voidedBy: options.actorStaffId ?? null,
      },
      include: orderInclude,
    });

    await recordAudit(
      {
        restaurantId,
        actorStaffId: options.actorStaffId ?? null,
        action: 'order.void',
        entity: 'order',
        entityId: orderId,
        before: { status: order.status, total: minorToNumber(toMinor(order.total)) },
        after: {
          status: 'void',
          refunded: minorToNumber(capturedMinor > 0 ? capturedMinor : 0),
        },
        reason: trimmedReason,
      },
      tx,
    );

    return {
      order: serializeOrder(updated),
      orderNumber: order.orderNumber,
      refundedMinor: capturedMinor > 0 ? capturedMinor : 0,
    };
  });

  emitRestaurant('ORDER_VOIDED', {
    event: 'ORDER_VOIDED',
    orderId,
    orderNumber: voided.orderNumber,
    reason: trimmedReason,
    refunded: minorToNumber(voided.refundedMinor),
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return voided.order;
}
