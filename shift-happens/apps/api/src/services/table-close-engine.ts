import { prisma } from '@shift-happens/db';
import { env } from '../env.js';
import { badRequest, notFound } from '../errors.js';
import { payOrder, voidOrder } from './pos-engine.js';
import { getTable, setTableStage } from './stage-engine.js';

export type CloseTableAction = 'settle' | 'void' | 'clear';

/**
 * Manager close-out for a table:
 *  - settle: pay every open check, then clear the table
 *  - void:   void every open check, then clear the table
 *  - clear:  just reset the table (refused while a check is still open)
 *
 * Resetting clears the party, covers, seated time and server via the stage
 * engine, so stale tables can always be brought back to "ready".
 */
export async function closeTable(
  tableId: string,
  input: {
    action: CloseTableAction;
    method?: string;
    reason?: string;
  },
  restaurantId = env.RESTAURANT_ID,
) {
  const table = await prisma.diningTable.findFirst({
    where: { id: tableId, restaurantId },
  });
  if (!table) throw notFound('Table not found');

  const openOrders = await prisma.order.findMany({
    where: {
      restaurantId,
      tableId,
      status: { notIn: ['paid', 'void'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, orderNumber: true },
  });

  if (input.action === 'clear' && openOrders.length > 0) {
    throw badRequest(
      `${table.tableNumber} still has ${openOrders.length} open check${
        openOrders.length === 1 ? '' : 's'
      }. Settle or void before clearing the table.`,
    );
  }

  const closedOrders: Array<{ id: string; orderNumber: number; status: string }> = [];

  if (input.action === 'settle') {
    for (const order of openOrders) {
      const paid = await payOrder(
        order.id,
        { method: input.method ?? 'card' },
        restaurantId,
      );
      closedOrders.push({
        id: paid.id,
        orderNumber: paid.orderNumber,
        status: 'paid',
      });
    }
  } else if (input.action === 'void') {
    for (const order of openOrders) {
      const voided = await voidOrder(
        order.id,
        input.reason ?? 'Manager close-out',
        restaurantId,
      );
      closedOrders.push({
        id: voided.id,
        orderNumber: voided.orderNumber,
        status: 'void',
      });
    }
  }

  await setTableStage(tableId, 'ready', { triggeredBy: 'MANAGER_CLOSE' });
  const dto = await getTable(tableId);

  return {
    table: dto,
    action: input.action,
    closedOrders,
    clearedChecks: closedOrders.length,
  };
}
