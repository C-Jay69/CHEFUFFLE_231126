import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@shift-happens/db';
import {
  addOrderPayment,
  createOrder,
  getOrder,
  payOrder,
  refundOrder,
  voidOrder,
} from '../src/services/pos-engine';
import { getEndOfNight } from '../src/services/end-of-night-engine';

/**
 * Payments & money integrity.
 *
 * Runs against a disposable tenant in the dedicated test schema, so the
 * seeded demo data is untouched. The tenant charges 10% tax (deliberately not
 * the old hard-coded 8%) to prove the restaurant row drives the arithmetic.
 */
async function cleanupTenant(id: string) {
  await prisma.order.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
  await prisma.menuItem.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
  await prisma.menuCategory.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
  await prisma.diningTable.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
  await prisma.staff.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
  await prisma.restaurant.delete({ where: { id } }).catch(() => undefined);
}

describe('payments and money integrity', () => {
  const restaurantId = randomUUID();
  const staffId = randomUUID();
  const tableId = randomUUID();
  const categoryId = randomUUID();
  const menuItemId = randomUUID();

  async function createCheck() {
    return createOrder(
      {
        tableId,
        serverId: staffId,
        items: [{ menuItemId, quantity: 1, modifiers: [] }],
        sendToKitchen: false,
        autoGratuity: false,
      },
      restaurantId,
    );
  }

  beforeAll(async () => {
    // Clean any tenant left behind by an interrupted previous run.
    const stale = await prisma.restaurant.findMany({
      where: { name: 'Vitest Payments Tenant' },
      select: { id: true },
    });
    for (const tenant of stale) await cleanupTenant(tenant.id);

    await prisma.restaurant.create({
      data: {
        id: restaurantId,
        name: 'Vitest Payments Tenant',
        address: 'Test Kitchen',
        phone: '+1 555-0001',
        taxRate: '10.00',
      },
    });
    await prisma.staff.create({
      data: {
        id: staffId,
        restaurantId,
        name: 'Payments Server',
        role: 'server',
        hourlyRate: 18,
      },
    });
    await prisma.diningTable.create({
      data: {
        id: tableId,
        restaurantId,
        tableNumber: 'PAY-01',
        zone: 'Main Dining Room',
        capacity: 4,
        currentStage: 'ready',
      },
    });
    await prisma.menuCategory.create({
      data: { id: categoryId, restaurantId, name: 'Test Mains' },
    });
    await prisma.menuItem.create({
      data: {
        id: menuItemId,
        restaurantId,
        categoryId,
        name: 'Payment Test Plate',
        price: '100.00',
        station: 'grill',
        targetPrepTimeSeconds: 600,
      },
    });
  });

  afterAll(async () => {
    await cleanupTenant(restaurantId);
    await prisma.$disconnect();
  });

  it('charges only the remainder after a partial payment', async () => {
    const created = await createCheck();
    expect(created.order.subtotal).toBe(100);
    expect(created.order.tax).toBe(10);
    expect(created.order.total).toBe(110);

    const partial = await addOrderPayment(
      created.order.id,
      { amount: 40, method: 'card', cardBrand: 'visa', tip: 0 },
      restaurantId,
      { actorStaffId: staffId },
    );
    expect(partial.status).not.toBe('paid');
    expect(partial.paidAmount).toBe(40);
    expect(partial.balance).toBe(70);

    const settled = await payOrder(
      created.order.id,
      { tip: 0, method: 'cash' },
      restaurantId,
      { actorStaffId: staffId },
    );
    expect(settled.status).toBe('paid');
    expect(settled.paidAmount).toBe(110);
    expect(settled.balance).toBe(0);

    const rows = await prisma.payment.findMany({
      where: { orderId: created.order.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((row) => Number(row.amount))).toEqual([40, 70]);
    expect(rows.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(110);
  });

  it('rejects overpayment instead of charging the full total twice', async () => {
    const created = await createCheck();

    await expect(
      addOrderPayment(
        created.order.id,
        { amount: 200, method: 'card', cardBrand: 'visa', tip: 0 },
        restaurantId,
      ),
    ).rejects.toThrow(/more than the remaining balance/i);

    await expect(
      payOrder(
        created.order.id,
        { amount: 200, method: 'card', cardBrand: 'visa' },
        restaurantId,
      ),
    ).rejects.toThrow(/more than the remaining balance/i);

    expect(
      await prisma.payment.count({ where: { orderId: created.order.id } }),
    ).toBe(0);
  });

  it('does not double-charge when an idempotency key is replayed', async () => {
    const created = await createCheck();
    const key = `pay-dup-${randomUUID()}`;

    const first = await payOrder(
      created.order.id,
      { tip: 0, method: 'card', cardBrand: 'amex', idempotencyKey: key },
      restaurantId,
      { actorStaffId: staffId },
    );
    const replay = await payOrder(
      created.order.id,
      { tip: 0, method: 'card', cardBrand: 'amex', idempotencyKey: key },
      restaurantId,
      { actorStaffId: staffId },
    );

    expect(replay.id).toBe(first.id);
    expect(replay.status).toBe('paid');
    expect(replay.paidAmount).toBe(110);
    expect(
      await prisma.payment.count({
        where: { orderId: created.order.id, kind: 'payment' },
      }),
    ).toBe(1);

    // The same guarantee applies to partial payments.
    const partial = await createCheck();
    const partialKey = `partial-dup-${randomUUID()}`;
    await addOrderPayment(
      partial.order.id,
      { amount: 30, method: 'card', cardBrand: 'visa', tip: 0, idempotencyKey: partialKey },
      restaurantId,
    );
    const partialReplay = await addOrderPayment(
      partial.order.id,
      { amount: 30, method: 'card', cardBrand: 'visa', tip: 0, idempotencyKey: partialKey },
      restaurantId,
    );
    expect(partialReplay.paidAmount).toBe(30);
    expect(
      await prisma.payment.count({ where: { orderId: partial.order.id } }),
    ).toBe(1);
  });

  it('records refunds as negative ledger rows and cannot exceed captured money', async () => {
    const created = await createCheck();
    await payOrder(
      created.order.id,
      { tip: 0, method: 'card', cardBrand: 'visa' },
      restaurantId,
    );

    const refunded = await refundOrder(
      created.order.id,
      { amount: 30, reason: 'Guest complaint' },
      restaurantId,
      { actorStaffId: staffId },
    );
    expect(refunded.paidAmount).toBe(80);
    expect(refunded.balance).toBe(30);
    const refundRow = refunded.payments?.find(
      (payment: { kind: string; amount: number }) => payment.kind === 'refund',
    );
    expect(refundRow?.amount).toBe(-30);

    await expect(
      refundOrder(
        created.order.id,
        { amount: 100, reason: 'Too much' },
        restaurantId,
      ),
    ).rejects.toThrow(/cannot exceed the captured balance/i);

    const fullyRefunded = await refundOrder(
      created.order.id,
      { amount: 80, reason: 'Full reversal' },
      restaurantId,
      { actorStaffId: staffId },
    );
    expect(fullyRefunded.paidAmount).toBe(0);
    expect(fullyRefunded.balance).toBe(110);

    await expect(
      refundOrder(
        created.order.id,
        { amount: 1, reason: 'Nothing left' },
        restaurantId,
      ),
    ).rejects.toThrow(/no captured payment/i);
  });

  it('refuses to silently void a paid check and refunds when asked', async () => {
    const created = await createCheck();
    await payOrder(
      created.order.id,
      { tip: 0, method: 'card', cardBrand: 'mastercard' },
      restaurantId,
    );

    await expect(
      voidOrder(created.order.id, 'Duplicate check', restaurantId),
    ).rejects.toThrow(/captured payments/i);

    const voided = await voidOrder(
      created.order.id,
      'Duplicate check',
      restaurantId,
      { actorStaffId: staffId, refund: true },
    );
    expect(voided.status).toBe('void');
    expect(voided.voidReason).toBe('Duplicate check');
    expect(voided.voidedBy).toBe(staffId);
    expect(voided.paidAmount).toBe(0);
    expect(
      voided.payments?.some(
        (payment: { kind: string; amount: number }) =>
          payment.kind === 'refund' && payment.amount === -110,
      ),
    ).toBe(true);

    const audits = await prisma.auditLog.findMany({
      where: { restaurantId, entityId: created.order.id },
    });
    expect(audits.map((audit) => audit.action)).toEqual(
      expect.arrayContaining(['payment.capture', 'payment.refund', 'order.void']),
    );
  });

  it('treats a legacy paid order with no payment rows as captured when voiding', async () => {
    const legacy = await prisma.order.create({
      data: {
        restaurantId,
        tableId,
        serverId: staffId,
        status: 'paid',
        subtotal: '100.00',
        tax: '10.00',
        tip: '0.00',
        total: '110.00',
        paymentMethod: null,
        closedAt: new Date(),
        paidAt: new Date(),
      },
    });

    await expect(
      voidOrder(legacy.id, 'Legacy void', restaurantId),
    ).rejects.toThrow(/captured payments/i);

    const voided = await voidOrder(legacy.id, 'Legacy void', restaurantId, {
      actorStaffId: staffId,
      refund: true,
    });
    expect(voided.status).toBe('void');
    const refund = await prisma.payment.findFirstOrThrow({
      where: { orderId: legacy.id, kind: 'refund' },
    });
    expect(Number(refund.amount)).toBe(-110);
  });

  it('follows the restaurant tax rate and tax-inclusive setting', async () => {
    const first = await createCheck();
    expect(first.order.subtotal).toBe(100);
    expect(first.order.tax).toBe(10);
    expect(first.order.total).toBe(110);

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { taxRate: '12.50' },
    });
    const second = await createCheck();
    expect(second.order.tax).toBe(12.5);
    expect(second.order.total).toBe(112.5);

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { taxRate: '10.00', taxInclusive: true },
    });
    const inclusive = await createCheck();
    // The $100 menu price already contains 10% tax.
    expect(inclusive.order.subtotal).toBe(90.91);
    expect(inclusive.order.tax).toBe(9.09);
    expect(inclusive.order.total).toBe(100);

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { taxRate: '10.00', taxInclusive: false },
    });
  });

  it('uses payment kinds for end-of-night tenders and keeps unallocated out of cash due', async () => {
    const date = new Date().toISOString();
    const before = await getEndOfNight(restaurantId, date);

    // A legacy paid order has no payment rows and no tender method. It must
    // appear in the report but must not be treated as expected cash.
    await prisma.order.create({
      data: {
        restaurantId,
        tableId,
        serverId: staffId,
        status: 'paid',
        subtotal: '100.00',
        tax: '10.00',
        tip: '0.00',
        total: '110.00',
        paymentMethod: null,
        closedAt: new Date(),
        paidAt: new Date(),
      },
    });

    const after = await getEndOfNight(restaurantId, date);
    expect(after.totals.gross).toBeCloseTo(before.totals.gross + 110, 2);
    expect(after.totals.cashDue).toBeCloseTo(before.totals.cashDue, 2);
    expect(after.unallocatedChecks).toBe(
      before.unallocatedChecks + 1,
    );
  });

  it('reduces the end-of-night tender mix by refunds', async () => {
    const date = new Date().toISOString();
    const created = await createCheck();
    await payOrder(
      created.order.id,
      { tip: 0, method: 'card', cardBrand: 'visa' },
      restaurantId,
    );

    const before = await getEndOfNight(restaurantId, date);
    await refundOrder(
      created.order.id,
      { amount: 20, reason: 'Service recovery' },
      restaurantId,
    );
    const after = await getEndOfNight(restaurantId, date);

    expect(after.totals.gross).toBeCloseTo(before.totals.gross - 20, 2);
    expect(after.tenders.visa.amount).toBeCloseTo(
      before.tenders.visa.amount - 20,
      2,
    );
  });

  it('does not duplicate a refund when its idempotency key is replayed', async () => {
    const created = await createCheck();
    await payOrder(
      created.order.id,
      { tip: 0, method: 'card', cardBrand: 'visa' },
      restaurantId,
    );
    const key = `refund-dup-${randomUUID()}`;

    const first = await refundOrder(
      created.order.id,
      { amount: 20, reason: 'Duplicate refund guard', idempotencyKey: key },
      restaurantId,
      { actorStaffId: staffId },
    );
    const replay = await refundOrder(
      created.order.id,
      { amount: 20, reason: 'Duplicate refund guard', idempotencyKey: key },
      restaurantId,
      { actorStaffId: staffId },
    );

    expect(replay.id).toBe(first.id);
    expect(replay.paidAmount).toBe(90);
    expect(
      await prisma.payment.count({
        where: { orderId: created.order.id, kind: 'refund' },
      }),
    ).toBe(1);
  });

  it('records payment and refund audit entries with the actor and reason', async () => {
    const created = await createCheck();
    await addOrderPayment(
      created.order.id,
      { amount: 50, method: 'cash', tip: 0 },
      restaurantId,
      { actorStaffId: staffId },
    );
    await refundOrder(
      created.order.id,
      { amount: 10, reason: 'Wrong tender' },
      restaurantId,
      { actorStaffId: staffId },
    );

    const capture = await prisma.auditLog.findFirst({
      where: {
        restaurantId,
        entityId: created.order.id,
        action: 'payment.capture',
      },
    });
    expect(capture?.actorStaffId).toBe(staffId);

    const refund = await prisma.auditLog.findFirst({
      where: {
        restaurantId,
        entityId: created.order.id,
        action: 'payment.refund',
      },
    });
    expect(refund?.actorStaffId).toBe(staffId);
    expect(refund?.reason).toBe('Wrong tender');

    const current = await getOrder(created.order.id, restaurantId);
    expect(current.paidAmount).toBe(40);
  });
});
