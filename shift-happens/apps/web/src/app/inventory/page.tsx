'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Progress,
  SearchInput,
  Stat,
  Tabs,
  type BadgeTone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { money, number } from '@/lib/format';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import type { Ingredient, InventoryResponse } from '@/lib/types';

interface PurchaseOrderLine {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  lineTotal: number;
}

interface PurchaseOrder {
  id: string;
  supplier: string;
  status: string;
  lines: PurchaseOrderLine[];
  total: number;
  createdAt: string;
}

interface AdjustResponse {
  ingredient: Ingredient;
  quantityChange: number;
}

interface ApproveResponse {
  supplier: string;
  restocked: number;
}

type AdjustReason = 'inventory_audit' | 'waste_spoilage' | 'purchase_receipt' | 'transfer';

const REASONS: Array<{ value: AdjustReason; label: string }> = [
  { value: 'inventory_audit', label: 'Daily audit' },
  { value: 'waste_spoilage', label: 'Spoilage' },
  { value: 'purchase_receipt', label: 'Restock' },
  { value: 'transfer', label: 'Shortage' },
];

const STATUS_TONE: Record<Ingredient['status'], BadgeTone> = {
  ok: 'ready',
  watch: 'info',
  low: 'caution',
  depleted: 'urgent',
};

const STATUS_LABEL: Record<Ingredient['status'], string> = {
  ok: 'In stock',
  watch: 'Watch',
  low: 'Low',
  depleted: 'Depleted',
};

const PROGRESS_TONE: Record<Ingredient['status'], 'ready' | 'caution' | 'urgent' | 'secondary'> = {
  ok: 'ready',
  watch: 'secondary',
  low: 'caution',
  depleted: 'urgent',
};

export default function InventoryPage() {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [autoBusy, setAutoBusy] = useState(false);
  const [approvingSupplier, setApprovingSupplier] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<Ingredient | null>(null);
  const [newStock, setNewStock] = useState('');
  const [reason, setReason] = useState<AdjustReason>('inventory_audit');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [inventory, orders] = await Promise.all([
        api.get<InventoryResponse>('/inventory'),
        api.get<PurchaseOrder[]>('/inventory/purchase-orders'),
      ]);
      setData(inventory);
      setPurchaseOrders(orders);
      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load inventory.';
      setError(message);
      showToast(message, 'error');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      void load(false);
    }, 400);
  }, [load]);

  useEffect(() => {
    const offs = [
      listen('INVENTORY_UPDATED', scheduleReload),
      listen('LOW_STOCK_ALERT', scheduleReload),
      listen('GLOBAL_86_ITEM_UPDATE', scheduleReload),
    ];
    return () => {
      offs.forEach((off) => off());
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, [scheduleReload]);

  const summary = data?.summary;
  const ingredients = useMemo(() => data?.ingredients ?? [], [data]);

  const categoryTabs = useMemo(
    () => [
      { id: 'all', label: 'All', count: summary?.totalItems ?? 0 },
      ...(summary?.categories ?? []).map((entry) => ({
        id: entry.name,
        label: entry.name,
        count: entry.count,
      })),
    ],
    [summary],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ingredients.filter((ingredient) => {
      const categoryOk = category === 'all' || ingredient.category === category;
      const searchOk =
        !term ||
        [ingredient.name, ingredient.sku, ingredient.category, ingredient.supplierName ?? ''].some(
          (value) => value.toLowerCase().includes(term),
        );
      return categoryOk && searchOk;
    });
  }, [category, ingredients, search]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load(false);
    } finally {
      setRefreshing(false);
    }
  };

  const openAdjust = (ingredient: Ingredient) => {
    setAdjusting(ingredient);
    setNewStock(String(ingredient.currentStock));
    setReason('inventory_audit');
    setNote('');
  };

  const closeAdjust = () => {
    if (saving) return;
    setAdjusting(null);
  };

  const parsedNewStock = Number(newStock);
  const validNewStock =
    newStock.trim() !== '' && Number.isFinite(parsedNewStock) && parsedNewStock >= 0;
  const delta =
    adjusting && validNewStock ? parsedNewStock - adjusting.currentStock : null;

  const submitAdjust = async () => {
    if (!adjusting) return;
    if (!validNewStock) {
      showToast('Enter a valid stock number (0 or more).', 'warn');
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<AdjustResponse>('/inventory/adjust', {
        ingredientId: adjusting.id,
        newStock: parsedNewStock,
        reason,
        note: note.trim() || undefined,
      });
      const change = result.quantityChange >= 0 ? `+${number(result.quantityChange)}` : number(result.quantityChange);
      showToast(`${adjusting.name} adjusted (${change} ${adjusting.unit}).`, 'success');
      setAdjusting(null);
      await load(false);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not adjust stock.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const approveOne = async (supplier: string) => {
    setApprovingSupplier(supplier);
    try {
      const result = await api.post<ApproveResponse>('/inventory/purchase-orders/approve', {
        supplier,
      });
      showToast(`${supplier}: ${result.restocked} item(s) restocked.`, 'success');
      await load(false);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not approve the order.', 'error');
    } finally {
      setApprovingSupplier(null);
    }
  };

  const autoPo = async () => {
    if (purchaseOrders.length === 0) return;
    setAutoBusy(true);
    try {
      let restocked = 0;
      for (const order of purchaseOrders) {
        const result = await api.post<ApproveResponse>('/inventory/purchase-orders/approve', {
          supplier: order.supplier,
        });
        restocked += result.restocked;
      }
      showToast(
        `Auto-PO approved ${purchaseOrders.length} order(s) — ${restocked} item(s) restocked.`,
        'success',
      );
      await load(false);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not run Auto-PO.', 'error');
    } finally {
      setAutoBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow="Stock control"
          title="Inventory"
          description="Track what is on hand, fix counts in a tap, and approve reorders before service runs dry."
          icon="inventory_2"
          actions={
            <>
              <Button
                variant="primary"
                icon="shopping_cart_checkout"
                loading={autoBusy}
                disabled={loading || autoBusy || purchaseOrders.length === 0}
                onClick={() => void autoPo()}
              >
                Auto-PO
              </Button>
              <Button
                variant="secondary"
                icon="refresh"
                loading={refreshing}
                onClick={() => void refresh()}
              >
                Refresh
              </Button>
            </>
          }
        />

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-subtle bg-surface-container-low py-20">
            <span className="material-symbols-outlined animate-spin text-headline-xl text-secondary">
              progress_activity
            </span>
            <p className="font-body-sm text-body-sm text-text-tertiary">Loading inventory…</p>
          </div>
        ) : !data ? (
          <Card>
            <EmptyState
              icon="cloud_off"
              title="Could not load inventory"
              description={error ?? 'The inventory API did not respond.'}
              action={
                <Button variant="primary" icon="refresh" onClick={() => void load(true)}>
                  Try again
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label="Total value"
                value={money(summary?.totalValue ?? 0)}
                icon="payments"
                tone="lime"
                hint={`${summary?.totalItems ?? 0} tracked ingredients`}
              />
              <Stat
                label="Low stock"
                value={summary?.lowStock ?? 0}
                icon="warning"
                tone="caution"
                hint="At or below reorder point"
              />
              <Stat
                label="Depleted"
                value={summary?.depleted ?? 0}
                icon="production_quantity_limits"
                tone="urgent"
                hint="Need a restock now"
              />
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-container-low p-3 sm:flex-row sm:items-center">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search ingredients, SKUs, suppliers…"
                className="sm:max-w-sm"
              />
              <Tabs
                items={categoryTabs}
                value={category}
                onChange={setCategory}
                className="[&>button]:h-11"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="xl:col-span-8">
                <Card
                  title="Ingredients"
                  icon="inventory_2"
                  actions={<Badge tone="neutral">{filtered.length} shown</Badge>}
                >
                  {filtered.length === 0 ? (
                    <EmptyState
                      icon="search_off"
                      title="No ingredients match"
                      description="Try a different search or category filter."
                      action={
                        <Button
                          variant="secondary"
                          icon="filter_alt_off"
                          onClick={() => {
                            setSearch('');
                            setCategory('all');
                          }}
                        >
                          Clear filters
                        </Button>
                      }
                    />
                  ) : (
                    <div className="flex flex-col gap-2">
                      {filtered.map((ingredient) => (
                        <div
                          key={ingredient.id}
                          className="rounded-xl border border-border-subtle bg-surface-container p-3"
                        >
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-center">
                            <div className="sm:col-span-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-body-base text-body-base font-bold text-text-primary">
                                  {ingredient.name}
                                </span>
                                <Badge tone={STATUS_TONE[ingredient.status]}>
                                  {STATUS_LABEL[ingredient.status]}
                                </Badge>
                              </div>
                              <p className="font-label-badge text-label-badge uppercase text-text-tertiary">
                                {ingredient.category} · {ingredient.sku}
                              </p>
                            </div>

                            <div className="sm:col-span-3">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="font-mono-metric-sm text-mono-metric-sm font-bold text-text-primary">
                                  {number(ingredient.currentStock)} / {number(ingredient.parLevel)}{' '}
                                  <span className="text-text-tertiary">{ingredient.unit}</span>
                                </span>
                                <span className="font-mono-metric-sm text-mono-metric-sm text-text-tertiary">
                                  {ingredient.stockPercentage}%
                                </span>
                              </div>
                              <Progress
                                className="mt-1.5"
                                value={ingredient.stockPercentage}
                                tone={PROGRESS_TONE[ingredient.status]}
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <p className="font-label-badge text-label-badge uppercase text-text-tertiary sm:hidden">
                                Supplier
                              </p>
                              <p className="truncate font-body-sm text-body-sm text-text-secondary">
                                {ingredient.supplierName ?? 'Unassigned'}
                              </p>
                            </div>

                            <div className="sm:col-span-3 sm:justify-self-end">
                              <Button
                                variant="secondary"
                                icon="tune"
                                className="w-full sm:w-auto"
                                onClick={() => openAdjust(ingredient)}
                              >
                                Adjust
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <aside className="xl:col-span-4">
                <div className="xl:sticky xl:top-20">
                  <Card
                    title="Reorder suggestions"
                    icon="local_shipping"
                    subtitle="Approving restocks each line to par."
                    actions={
                      purchaseOrders.length > 0 ? (
                        <Badge tone="caution">{purchaseOrders.length} orders</Badge>
                      ) : undefined
                    }
                  >
                    {purchaseOrders.length === 0 ? (
                      <EmptyState
                        icon="check_circle"
                        title="Nothing to reorder"
                        description="Every ingredient is above its reorder point."
                      />
                    ) : (
                      <div className="flex flex-col gap-2">
                        {purchaseOrders.map((order) => (
                          <div
                            key={order.id}
                            className="rounded-xl border border-border-subtle bg-surface-container p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-body-base text-body-base font-bold text-text-primary">
                                  {order.supplier}
                                </p>
                                <p className="font-body-sm text-body-sm text-text-tertiary">
                                  {order.lines.length} line{order.lines.length === 1 ? '' : 's'} ·{' '}
                                  {order.id}
                                </p>
                              </div>
                              <span className="shrink-0 font-mono-metric-md text-mono-metric-md font-bold text-accent-lime">
                                {money(order.total)}
                              </span>
                            </div>
                            <Button
                              variant="secondary"
                              icon="check"
                              className="mt-3 w-full"
                              loading={approvingSupplier === order.supplier}
                              disabled={autoBusy}
                              onClick={() => void approveOne(order.supplier)}
                            >
                              Approve order
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>

      <Modal
        open={Boolean(adjusting)}
        onClose={closeAdjust}
        title={adjusting ? `Adjust ${adjusting.name}` : 'Adjust stock'}
        description={
          adjusting
            ? `${number(adjusting.currentStock)} ${adjusting.unit} on hand · par ${number(
                adjusting.parLevel,
              )} ${adjusting.unit}`
            : undefined
        }
        icon="tune"
        footer={
          <>
            <Button variant="secondary" onClick={closeAdjust} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" icon="save" loading={saving} onClick={() => void submitAdjust()}>
              Save adjustment
            </Button>
          </>
        }
      >
        {adjusting && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                New stock ({adjusting.unit})
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={newStock}
                onChange={(event) => setNewStock(event.target.value)}
                className="h-12 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-mono-metric-md text-mono-metric-md text-text-primary outline-none focus:border-secondary"
              />
            </label>

            {delta !== null && (
              <div className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2">
                <span className="font-body-sm text-body-sm text-text-secondary">Change</span>
                <span
                  className={`font-mono-metric-sm text-mono-metric-sm font-bold ${
                    delta < 0 ? 'text-status-urgent' : 'text-status-ready'
                  }`}
                >
                  {delta >= 0 ? '+' : ''}
                  {number(delta)} {adjusting.unit}
                </span>
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                Reason
              </span>
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value as AdjustReason)}
                className="h-12 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-base text-body-base text-text-primary outline-none focus:border-secondary"
              >
                {REASONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                Note (optional)
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Counted during closing audit"
                className="min-h-[84px] w-full rounded-lg border border-border-subtle bg-surface-container-lowest p-3 font-body-sm text-body-sm text-text-primary outline-none focus:border-secondary"
              />
            </label>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
