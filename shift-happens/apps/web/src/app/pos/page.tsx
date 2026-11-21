'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Stat,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import type { Order } from '@/lib/types';

const OPEN_STATUSES = new Set(['open', 'sent_to_kitchen', 'preparing', 'ready_at_pass']);

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  open: { label: 'Open', tone: 'info' },
  sent_to_kitchen: { label: 'In kitchen', tone: 'caution' },
  preparing: { label: 'Preparing', tone: 'violet' },
  ready_at_pass: { label: 'Ready', tone: 'ready' },
};

type Confirm = { kind: 'pay' | 'void'; order: Order };

const tipFor = (order: Order) => Math.round(order.subtotal * 0.2 * 100) / 100;

export default function OpenChecksPage() {
  const router = useRouter();
  const { can } = useSession();
  const canVoid = can('orders.void');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [voidReason, setVoidReason] = useState('Manager void');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const loadOrders = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const data = await api.get<Order[]>('/orders?limit=50');
      setOrders(data);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Could not load open checks. Is the API running on :4000?',
        'error',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders('initial');
  }, [loadOrders]);

  useEffect(() => {
    const offs = [
      listen('ORDER_CREATED', () => void loadOrders('silent')),
      listen('ORDER_VOIDED', () => void loadOrders('silent')),
      listen('TABLE_UPDATED', () => void loadOrders('silent')),
    ];
    return () => offs.forEach((off) => off());
  }, [loadOrders]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const openChecks = useMemo(
    () =>
      orders
        .filter((order) => OPEN_STATUSES.has(order.status))
        .sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [orders],
  );

  const ageMinutes = useCallback(
    (order: Order) =>
      Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60_000)),
    [now],
  );

  const openValue = openChecks.reduce((sum, order) => sum + order.total, 0);
  const oldestCheck = openChecks.reduce((max, order) => Math.max(max, ageMinutes(order)), 0);
  const oldestOrder = openChecks.find((order) => ageMinutes(order) === oldestCheck);

  const requestAction = (kind: Confirm['kind'], order: Order) => {
    setVoidReason('Manager void');
    setConfirm({ kind, order });
  };

  const runAction = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'pay') {
        const paid = await api.post<Order>(`/orders/${confirm.order.id}/pay`, {
          tip: tipFor(confirm.order),
          method: 'card',
        });
        showToast(`Check #${paid.orderNumber} paid · ${money(paid.total)}.`, 'success');
      } else {
        const reason = voidReason.trim() || 'Manager void';
        await api.post(`/orders/${confirm.order.id}/void`, { reason });
        showToast(`Check #${confirm.order.orderNumber} voided.`, 'warn');
      }
      setConfirm(null);
      await loadOrders('silent');
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : confirm.kind === 'pay'
            ? 'Could not settle the check.'
            : 'Could not void the check.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const itemCount = (order: Order) =>
    order.items.reduce((sum, item) => sum + item.quantity, 0);

  const itemPreview = (order: Order) => {
    if (order.items.length === 0) return 'No items';
    return order.items
      .slice(0, 2)
      .map((item) => `${item.quantity}× ${item.name}`)
      .join(', ')
      .concat(order.items.length > 2 ? ` +${order.items.length - 2} more` : '');
  };

  const payTip = confirm ? tipFor(confirm.order) : 0;
  const payTotal = confirm ? confirm.order.subtotal + confirm.order.tax + payTip : 0;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow="Service floor"
          icon="receipt_long"
          title="Open Checks"
          description="Every check still on the floor. Add items in Serve, then settle or void it here."
          actions={
            <>
              <Button
                variant="secondary"
                icon="refresh"
                loading={refreshing}
                onClick={() => void loadOrders('refresh')}
              >
                Refresh
              </Button>
              <Button variant="primary" icon="add" onClick={() => router.push('/serve')}>
                New Order
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="Open checks"
            value={openChecks.length}
            icon="receipt_long"
            tone="violet"
            hint="on the floor"
          />
          <Stat
            label="Open value"
            value={money(openValue)}
            icon="payments"
            tone="lime"
            hint="unsettled"
          />
          <Stat
            label="Oldest check"
            value={`${oldestCheck}m`}
            icon="timer"
            tone={oldestCheck >= 60 ? 'urgent' : 'caution'}
            hint={oldestOrder?.tableNumber ? `${oldestOrder.tableNumber} · #${oldestOrder.orderNumber}` : 'minutes'}
          />
        </div>

        <Card
          title="Checks"
          icon="list_alt"
          actions={<Badge tone="neutral">{openChecks.length} open</Badge>}
          bodyClassName="flex flex-col gap-2"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 font-body-sm text-body-sm text-text-tertiary">
              <span className="material-symbols-outlined animate-spin text-body-base">progress_activity</span>
              Loading open checks…
            </div>
          ) : openChecks.length === 0 ? (
            <EmptyState
              icon="receipt_long"
              title="No open checks"
              description="Start a new order in Serve and it will appear here until it is paid."
              action={
                <Button variant="primary" icon="add" onClick={() => router.push('/serve')}>
                  New Order
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {openChecks.map((order) => {
                const meta = STATUS_META[order.status] ?? { label: order.status, tone: 'neutral' as BadgeTone };
                const age = ageMinutes(order);
                return (
                  <li
                    key={order.id}
                    className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-container p-3 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Avatar name={order.serverName} size="sm" />
                      <div className="flex min-w-0 flex-col">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-mono-metric-md text-mono-metric-md font-bold text-text-primary">
                            #{order.orderNumber}
                          </span>
                          <span className="font-body-sm text-body-sm font-bold text-text-secondary">
                            {order.tableNumber ?? 'Takeout'}
                          </span>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-body-sm text-body-sm text-text-tertiary">
                          <span className="truncate">{order.serverName ?? 'Unassigned'}</span>
                          <span>{itemCount(order)} items</span>
                          <span className="min-w-0 truncate">{itemPreview(order)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
                      <div className="flex flex-col lg:min-w-24 lg:items-end">
                        <span className="font-mono-metric-md text-mono-metric-md font-bold text-text-primary">
                          {money(order.total)}
                        </span>
                        <span
                          className={
                            age >= 60
                              ? 'font-body-sm text-body-sm text-status-urgent'
                              : 'font-body-sm text-body-sm text-text-tertiary'
                          }
                        >
                          {age}m old
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {order.tableNumber && (
                          <Button
                            variant="secondary"
                            icon="add"
                            onClick={() =>
                              router.push(`/serve?table=${encodeURIComponent(order.tableNumber as string)}`)
                            }
                          >
                            Add items
                          </Button>
                        )}
                        <Button
                          variant="success"
                          icon="payments"
                          onClick={() => requestAction('pay', order)}
                        >
                          Pay
                        </Button>
                        {canVoid ? (
                          <Button
                            variant="danger"
                            icon="block"
                            onClick={() => requestAction('void', order)}
                          >
                            Void
                          </Button>
                        ) : (
                          <span className="flex h-11 items-center gap-1 rounded-xl border border-border-subtle px-3 font-body-sm text-body-sm text-text-subtle">
                            <span className="material-symbols-outlined text-[16px]">lock</span>
                            Void needs a manager
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {confirm && (
        <Modal
          open
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
          icon={confirm.kind === 'pay' ? 'payments' : 'block'}
          title={confirm.kind === 'pay' ? `Pay check #${confirm.order.orderNumber}?` : `Void check #${confirm.order.orderNumber}?`}
          description={
            confirm.kind === 'pay'
              ? `${confirm.order.tableNumber ?? 'Takeout'} · card payment with a 20% tip.`
              : `${confirm.order.tableNumber ?? 'Takeout'} · this cannot be undone.`
          }
          footer={
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant={confirm.kind === 'pay' ? 'success' : 'danger'}
                icon={confirm.kind === 'pay' ? 'payments' : 'block'}
                loading={busy}
                onClick={() => void runAction()}
              >
                {confirm.kind === 'pay' ? `Pay ${money(payTotal)}` : 'Void check'}
              </Button>
            </>
          }
        >
          {confirm.kind === 'pay' ? (
            <div className="flex flex-col gap-2 rounded-xl bg-surface-container p-3 font-body-sm text-body-sm text-text-secondary">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono-metric-sm text-mono-metric-sm text-text-primary">
                  {money(confirm.order.subtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span className="font-mono-metric-sm text-mono-metric-sm text-text-primary">
                  {money(confirm.order.tax)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tip (20%)</span>
                <span className="font-mono-metric-sm text-mono-metric-sm text-text-primary">
                  {money(payTip)}
                </span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border-subtle pt-2">
                <span className="font-body-base font-bold text-text-primary">Total</span>
                <span className="font-mono-metric-md text-mono-metric-md font-bold text-accent-cyan-bright">
                  {money(payTotal)}
                </span>
              </div>
            </div>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                Reason
              </span>
              <input
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                placeholder="Manager void"
                className="h-11 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-base text-body-base text-text-primary outline-none focus:border-status-urgent"
              />
            </label>
          )}
        </Modal>
      )}
    </AppShell>
  );
}
