import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@shift-happens/db';
import {
  isServeOnlyRole,
  permissionsForRole,
  roleHasPermission,
} from '@shift-happens/shared';
import {
  addOrderPayment,
  appendOrderItems,
  createOrder,
  getOrderByNumber,
  payOrder,
  reopenOrder,
} from '../src/services/pos-engine';
import { getEndOfNight } from '../src/services/end-of-night-engine';
import { getTables } from '../src/services/stage-engine';
import { bumpTicket, getTickets } from '../src/services/kds-engine';

/**
 * End-to-end domain flow:
 *   POS order ➔ recipe depletion ➔ stock transaction ➔ KDS ticket
 *   KDS mains bump ➔ table auto-advance to Stage 2: Entrée
 *   Depleted ingredient ➔ automatic 86 broadcast
 *
 * Runs against a disposable tenant so the seeded demo data is untouched.
 */
async function cleanupTenant(id: string) {
  await prisma.order.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
  const recipes = await prisma.recipe.findMany({
    where: { menuItem: { restaurantId: id } },
    select: { id: true },
  });
  const recipeIds = recipes.map((recipe) => recipe.id);
  await prisma.recipeIngredient
    .deleteMany({ where: { recipeId: { in: recipeIds } } })
    .catch(() => undefined);
  await prisma.recipe.deleteMany({ where: { id: { in: recipeIds } } }).catch(() => undefined);
  await prisma.menuItem.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
  await prisma.ingredient.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
  await prisma.restaurant.delete({ where: { id } }).catch(() => undefined);
}

describe('POS → KDS → Floor Plan → Inventory integration', () => {
  const restaurantId = randomUUID();
  const staffId = randomUUID();
  const tableId = randomUUID();
  const categoryId = randomUUID();
  const menuItemId = randomUUID();
  const recipeId = randomUUID();
  const ingredientId = randomUUID();
  const depletedIngredientId = randomUUID();
  const depletedMenuItemId = randomUUID();
  const depletedRecipeId = randomUUID();

  beforeAll(async () => {
    // Clean any tenant left behind by an interrupted previous run.
    const stale = await prisma.restaurant.findMany({
      where: { name: 'Vitest Ops Tenant' },
      select: { id: true },
    });
    for (const tenant of stale) await cleanupTenant(tenant.id);

    await prisma.restaurant.create({
      data: {
        id: restaurantId,
        name: 'Vitest Ops Tenant',
        address: 'Test Kitchen',
        phone: '+1 555-0000',
      },
    });
    await prisma.staff.create({
      data: {
        id: staffId,
        restaurantId,
        name: 'Test Server',
        role: 'server',
        hourlyRate: 18,
      },
    });
    await prisma.diningTable.create({
      data: {
        id: tableId,
        restaurantId,
        tableNumber: 'X-01',
        zone: 'Main Dining Room',
        capacity: 4,
        currentStage: 'ready',
      },
    });
    await prisma.menuCategory.create({
      data: { id: categoryId, restaurantId, name: 'Burgers & Mains' },
    });
    await prisma.ingredient.create({
      data: {
        id: ingredientId,
        restaurantId,
        name: 'Test Ribeye',
        category: 'Proteins',
        currentStock: 10,
        parLevel: 20,
        unit: 'kg',
        unitCost: 20,
        reorderTrigger: 2,
      },
    });
    await prisma.menuItem.create({
      data: {
        id: menuItemId,
        restaurantId,
        categoryId,
        name: 'Integration Ribeye',
        price: 55,
        station: 'grill',
        targetPrepTimeSeconds: 600,
      },
    });
    await prisma.recipe.create({ data: { id: recipeId, menuItemId } });
    await prisma.recipeIngredient.create({
      data: { recipeId, ingredientId, quantityRequired: 0.5 },
    });

    await prisma.ingredient.create({
      data: {
        id: depletedIngredientId,
        restaurantId,
        name: 'Depleting Truffle',
        category: 'Produce',
        currentStock: 1,
        parLevel: 5,
        unit: 'kg',
        unitCost: 100,
        reorderTrigger: 0.5,
      },
    });
    await prisma.menuItem.create({
      data: {
        id: depletedMenuItemId,
        restaurantId,
        categoryId,
        name: 'Depleting Truffle Pasta',
        price: 30,
        station: 'saute_fryer',
        targetPrepTimeSeconds: 600,
      },
    });
    await prisma.recipe.create({ data: { id: depletedRecipeId, menuItemId: depletedMenuItemId } });
    await prisma.recipeIngredient.create({
      data: {
        recipeId: depletedRecipeId,
        ingredientId: depletedIngredientId,
        quantityRequired: 1,
      },
    });
  });

  afterAll(async () => {
    await cleanupTenant(restaurantId);
    await prisma.$disconnect();
  });

  it('depletes stock atomically and emits a KDS ticket', async () => {
    const before = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });

    const result = await createOrder(
      {
        tableId,
        serverId: staffId,
        items: [{ menuItemId, quantity: 2, modifiers: [] }],
        sendToKitchen: true,
        autoGratuity: false,
      },
      restaurantId,
    );

    expect(result.order.status).toBe('sent_to_kitchen');
    expect(result.order.subtotal).toBe(110);
    expect(result.order.tax).toBe(8.8);
    expect(result.order.total).toBe(118.8);

    const after = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
    expect(Number(after.currentStock)).toBe(Number(before.currentStock) - 1);

    const transactions = await prisma.stockTransaction.findMany({
      where: { referenceOrderId: result.order.id },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].reason).toBe('sale_deduction');
    expect(Number(transactions[0].quantityChange)).toBe(-1);

    const tickets = await getTickets('grill', restaurantId);
    const ticket = tickets.find((entry) => entry.id === result.order.id);
    expect(ticket).toBeTruthy();
    expect(ticket?.items[0].name).toBe('Integration Ribeye');

    const tableAfterOrder = await prisma.diningTable.findUniqueOrThrow({ where: { id: tableId } });
    expect(tableAfterOrder.currentStage).toBe('starters');
  });

  it('bumps mains and auto-advances the table to Stage 2: Entrée', async () => {
    const order = await prisma.order.findFirstOrThrow({
      where: { restaurantId, status: 'sent_to_kitchen' },
      orderBy: { createdAt: 'desc' },
    });

    const result = await bumpTicket(
      { orderId: order.id, station: 'grill', action: 'bump' },
      restaurantId,
    );

    expect(result.updatedCount).toBe(1);
    expect(result.tableAdvanced).toBe(true);
    expect(result.newStage).toBe('entree');

    const table = await prisma.diningTable.findUniqueOrThrow({ where: { id: tableId } });
    expect(table.currentStage).toBe('entree');

    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(item.prepStatus).toBe('bumped');
    expect(item.bumpedAt).not.toBeNull();
  });

  it('auto-86s a menu item when its ingredient reaches zero', async () => {
    const result = await createOrder(
      {
        tableId,
        serverId: staffId,
        items: [{ menuItemId: depletedMenuItemId, quantity: 2, modifiers: [] }],
        sendToKitchen: true,
        autoGratuity: false,
      },
      restaurantId,
    );

    expect(result.newly86ed.map((item) => item.id)).toContain(depletedMenuItemId);

    const ingredient = await prisma.ingredient.findUniqueOrThrow({
      where: { id: depletedIngredientId },
    });
    expect(Number(ingredient.currentStock)).toBe(0);

    const menuItem = await prisma.menuItem.findUniqueOrThrow({
      where: { id: depletedMenuItemId },
    });
    expect(menuItem.is86ed).toBe(true);
    expect(menuItem.eightySixReason).toContain('Depleting Truffle');
  });
  it('appends a round to the same check instead of opening a second one', async () => {
    const created = await createOrder(
      {
        tableId,
        serverId: staffId,
        partyName: 'Round Test',
        partySize: 2,
        items: [{ menuItemId, quantity: 1, modifiers: [] }],
        sendToKitchen: true,
        autoGratuity: false,
      },
      restaurantId,
    );

    const before = await prisma.order.count({ where: { restaurantId, tableId } });

    const appended = await appendOrderItems(
      created.order.id,
      {
        items: [{ menuItemId, quantity: 1, modifiers: [], seat: '2' }],
        sendToKitchen: true,
        autoGratuity: false,
      },
      restaurantId,
    );

    const after = await prisma.order.count({ where: { restaurantId, tableId } });

    expect(after).toBe(before);
    expect(appended.order.id).toBe(created.order.id);
    expect(appended.order.items).toHaveLength(2);
    expect(appended.order.subtotal).toBe(110);
    expect(appended.order.status).toBe('sent_to_kitchen');
  });
  it('reports the tender mix, slip counts and cash due per server', async () => {
    const created = await createOrder(
      {
        tableId,
        serverId: staffId,
        items: [{ menuItemId, quantity: 1, modifiers: [] }],
        sendToKitchen: true,
        autoGratuity: false,
      },
      restaurantId,
    );
    await payOrder(
      created.order.id,
      { tip: 0, method: 'card', cardBrand: 'visa' },
      restaurantId,
    );

    const report = await getEndOfNight(restaurantId, new Date().toISOString());

    expect(report.totals.checks).toBeGreaterThanOrEqual(1);
    expect(report.tenders.visa.count).toBeGreaterThanOrEqual(1);
    expect(report.totals.gross).toBeGreaterThan(0);

    const server = report.servers.find((entry) => entry.serverId === staffId);
    expect(server).toBeTruthy();
    expect(server?.slipCount).toBeGreaterThanOrEqual(1);
    expect(server?.cashDue).toBe(0);
    expect(server?.cardTotal).toBeGreaterThan(0);
    expect(server?.checkList.length).toBeGreaterThanOrEqual(1);
    expect(server?.checkList[0].orderNumber).toBeGreaterThan(0);
  });

  it('shows servers only their own tables and ready tables', async () => {
    const otherServerId = randomUUID();
    const ownTableId = randomUUID();
    const otherTableId = randomUUID();
    const readyTableId = randomUUID();

    await prisma.staff.create({
      data: {
        id: otherServerId,
        restaurantId,
        name: 'Other Server',
        role: 'server',
        hourlyRate: 18,
      },
    });
    await prisma.diningTable.createMany({
      data: [
        {
          id: ownTableId,
          restaurantId,
          tableNumber: 'S-OWN',
          zone: 'Main Dining Room',
          capacity: 4,
          currentStage: 'starters',
          currentPartyName: 'Own Party',
          currentPartySize: 2,
          serverId: staffId,
        },
        {
          id: otherTableId,
          restaurantId,
          tableNumber: 'S-OTH',
          zone: 'Main Dining Room',
          capacity: 4,
          currentStage: 'starters',
          currentPartyName: 'Other Party',
          currentPartySize: 2,
          serverId: otherServerId,
        },
        {
          id: readyTableId,
          restaurantId,
          tableNumber: 'S-RDY',
          zone: 'Main Dining Room',
          capacity: 4,
          currentStage: 'ready',
        },
      ],
    });

    const visible = await getTables(restaurantId, {
      staffId,
      viewAll: false,
    });
    const numbers = visible.map((table) => table.tableNumber);
    expect(numbers).toContain('S-OWN');
    expect(numbers).toContain('S-RDY');
    expect(numbers).not.toContain('S-OTH');

    const all = await getTables(restaurantId, { viewAll: true });
    expect(all.map((table) => table.tableNumber)).toContain('S-OTH');
  });

  it('records partial payments and closes the check once covered', async () => {
    const created = await createOrder(
      {
        tableId,
        serverId: staffId,
        items: [{ menuItemId, quantity: 1, modifiers: [] }],
        sendToKitchen: true,
        autoGratuity: false,
      },
      restaurantId,
    );

    const afterCard = await addOrderPayment(
      created.order.id,
      { amount: 20, method: 'card', cardBrand: 'visa', tip: 0, label: 'Guest 1' },
      restaurantId,
    );
    expect(afterCard.status).not.toBe('paid');
    expect(afterCard.paidAmount).toBe(20);
    expect(afterCard.balance).toBeGreaterThan(0);

    const afterCash = await addOrderPayment(
      created.order.id,
      {
        amount: afterCard.balance ?? 0,
        method: 'cash',
        tip: 0,
        label: 'Guest 2',
      },
      restaurantId,
    );
    expect(afterCash.status).toBe('paid');
    expect(afterCash.payments).toHaveLength(2);
    expect(
      afterCash.payments?.map((payment: { method: string }) => payment.method),
    ).toEqual(['card', 'cash']);
    expect(afterCash.paidAmount).toBeCloseTo(created.order.total, 2);
    expect(afterCash.balance).toBe(0);
  });

  it('recalls a check by number and re-opens a paid check for amendment', async () => {
    const created = await createOrder(
      {
        tableId,
        serverId: staffId,
        items: [{ menuItemId, quantity: 1, modifiers: [] }],
        sendToKitchen: true,
        autoGratuity: false,
      },
      restaurantId,
    );
    await payOrder(
      created.order.id,
      { tip: 0, method: 'card', cardBrand: 'amex' },
      restaurantId,
    );

    const recalled = await getOrderByNumber(
      created.order.orderNumber,
      restaurantId,
    );
    expect(recalled.id).toBe(created.order.id);
    expect(recalled.status).toBe('paid');
    expect(recalled.balance).toBe(0);

    const reopened = await reopenOrder(created.order.id, restaurantId);
    expect(reopened.status).not.toBe('paid');
    expect(reopened.closedAt).toBeNull();
    expect(reopened.payments).toHaveLength(1);
  });

});

describe('role permissions', () => {
  it('lets a server order, take payment and seat tables — and nothing else', () => {
    expect(permissionsForRole('server').sort()).toEqual(
      ['floor.seat', 'serve.order', 'serve.pay'].sort(),
    );
    expect(roleHasPermission('server', 'orders.void')).toBe(false);
    expect(roleHasPermission('server', 'inventory.manage')).toBe(false);
    expect(roleHasPermission('server', 'staff.manage')).toBe(false);
  });

  it('gives managers voids, floor design, table close-out and employee records', () => {
    expect(roleHasPermission('general_manager', 'orders.void')).toBe(true);
    expect(roleHasPermission('floor_manager', 'floor.manage')).toBe(true);
    expect(roleHasPermission('floor_manager', 'floor.close')).toBe(true);
    expect(roleHasPermission('server', 'floor.close')).toBe(false);
    expect(roleHasPermission('floor_manager', 'tables.viewAll')).toBe(true);
    expect(roleHasPermission('general_manager', 'tables.viewAll')).toBe(true);
    expect(roleHasPermission('server', 'tables.viewAll')).toBe(false);
    expect(roleHasPermission('bartender', 'tables.viewAll')).toBe(false);
    expect(roleHasPermission('general_manager', 'staff.manage')).toBe(true);
    expect(roleHasPermission('host', 'orders.void')).toBe(false);
  });

  it('restricts only servers and bartenders to the table plan on shift', () => {
    expect(isServeOnlyRole('server')).toBe(true);
    expect(isServeOnlyRole('bartender')).toBe(true);
    expect(isServeOnlyRole('host')).toBe(false);
    expect(isServeOnlyRole('general_manager')).toBe(false);
  });
});
