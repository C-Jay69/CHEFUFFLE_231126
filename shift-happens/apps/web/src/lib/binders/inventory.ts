import { escapeHtml, money, relativeMinutes } from '../format';
import { listen } from '../socket';
import type { Ingredient, InventoryResponse, StockTransaction } from '../types';
import type { Binder, BinderContext } from './types';
import { qs, qsa } from './types';

const CATEGORY_ICONS: Record<string, string> = {
  Proteins: '🥩',
  'Dairy & Cheeses': '🧀',
  'Dry Goods': '🌾',
  Produce: '🥬',
  Packaging: '📦',
  'Bar & Beverage': '🍸',
};

const REASON_MAP: Record<string, string> = {
  'Daily Shift Audit Variance': 'inventory_audit',
  'Kitchen Prep Drop / Spoilage': 'waste_spoilage',
  'Direct Line Restock from Walk-In': 'purchase_receipt',
  'Supplier Shortage Discrepancy': 'transfer',
};

const inventoryBinder: Binder = (ctx: BinderContext) => {
  const { root, api, toast, chime } = ctx;
  let data: InventoryResponse | null = null;
  let filter: string = 'all';
  let search = '';
  let editing: Ingredient | null = null;
  let modalReason = 'inventory_audit';

  const tbody = qs<HTMLTableSectionElement>(root, '#inventoryTableBody');
  const categoryHost = qs(root, '#categoryFilterContainer');
  const searchInput = qs<HTMLInputElement>(root, '#inventorySearchInput');
  const modal = qs<HTMLElement>(root, '#quickAdjustModal');
  const modalTitle = qs(root, '#modalItemTitle');
  const modalCurrent = qs(root, '#modalCurrentVal');
  const modalInput = qs<HTMLInputElement>(root, '#modalInputQty');
  const depletionFeed = qs(root, '#depletionFeed');
  const confirmButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Confirm Audit Count'),
  );
  const cancelButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').trim() === 'Cancel',
  );
  const autoPo = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Auto-PO Restock'),
  );
  const scanInvoice = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Scan Invoice'),
  );
  const stockAudit = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Stock Audit'),
  );
  const approvePo = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('One-Tap Approve PO'),
  );

  function statusMeta(item: Ingredient) {
    switch (item.status) {
      case 'depleted':
        return { label: 'OUT OF STOCK', classes: 'bg-status-urgent/20 text-status-urgent', bar: 'bg-status-urgent' };
      case 'low':
        return { label: 'LOW STOCK', classes: 'bg-status-caution/20 text-status-caution', bar: 'bg-status-caution' };
      case 'watch':
        return { label: 'WATCH', classes: 'bg-status-info/20 text-status-info', bar: 'bg-status-info' };
      default:
        return { label: 'IN STOCK', classes: 'bg-status-ready/20 text-status-ready', bar: 'bg-status-ready' };
    }
  }

  function filteredItems(): Ingredient[] {
    if (!data) return [];
    return data.ingredients.filter((item) => {
      const categoryOk =
        filter === 'all' ||
        item.category === filter ||
        (filter === 'Low Stock' && item.status === 'low') ||
        (filter === 'Depleted' && item.status === 'depleted');
      const searchOk =
        !search ||
        item.name.toLowerCase().includes(search) ||
        item.category.toLowerCase().includes(search) ||
        (item.supplierName ?? '').toLowerCase().includes(search) ||
        item.sku.toLowerCase().includes(search);
      return categoryOk && searchOk;
    });
  }

  function renderCategories() {
    if (!categoryHost || !data) return;
    const categories = [
      { key: 'all', label: 'All', count: data.summary.totalItems },
      ...data.summary.categories.map((category) => ({
        key: category.name,
        label: category.name,
        count: category.count,
      })),
      { key: 'Low Stock', label: 'Low Stock', count: data.summary.lowStock },
      { key: 'Depleted', label: 'Depleted', count: data.summary.depleted },
    ];
    categoryHost.innerHTML = categories
      .map(
        (category) => `<button data-filter="${escapeHtml(category.key)}" class="category-pill px-space-md py-space-xs rounded-full ${
          filter === category.key
            ? 'bg-gradient-to-r from-accent-purple-glow/30 to-secondary/30 text-text-primary font-bold'
            : 'bg-surface-container text-text-secondary hover:text-text-primary'
        } font-mono-metric-sm text-mono-metric-sm whitespace-nowrap transition-colors">${escapeHtml(
          category.label,
        )} (${category.count})</button>`,
      )
      .join('');
    qsa<HTMLButtonElement>(categoryHost, '[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        filter = button.dataset.filter ?? 'all';
        renderCategories();
        renderRows();
      });
    });
  }

  function renderRows() {
    if (!tbody || !data) return;
    const rows = filteredItems();
    tbody.innerHTML =
      rows
        .map((item) => {
          const meta = statusMeta(item);
          return `<tr class="hover:bg-surface-container transition-colors group inventory-row" data-category="${escapeHtml(
            item.category,
          )}" data-status="${item.status}" data-ingredient-id="${item.id}">
          <td class="py-space-md px-space-md">
            <div class="flex items-center gap-space-sm">
              <div class="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary shrink-0 font-mono-metric-sm">${
                CATEGORY_ICONS[item.category] ?? '🍽️'
              }</div>
              <div class="flex flex-col">
                <span class="font-body-base text-body-base text-text-primary font-bold">${escapeHtml(item.name)}</span>
                <div class="flex items-center gap-space-xs">
                  <span class="font-mono-metric-sm text-mono-metric-sm text-text-subtle">SKU: ${escapeHtml(item.sku)}</span>
                  <span class="px-1.5 py-0.2 rounded bg-surface-variant text-text-tertiary text-label-badge font-label-badge">${item.linkedMenuItems.length} RECIPE${item.linkedMenuItems.length === 1 ? '' : 'S'}</span>
                </div>
              </div>
            </div>
          </td>
          <td class="py-space-md px-space-md"><span class="px-space-xs py-0.5 rounded bg-surface-container-high text-text-secondary text-body-sm font-semibold">${escapeHtml(
            item.category,
          )}</span></td>
          <td class="py-space-md px-space-md">
            <div class="flex flex-col gap-1 min-w-[130px]">
              <span class="font-mono-metric-md text-mono-metric-md ${
                item.status === 'depleted' || item.status === 'low' ? 'text-status-urgent' : 'text-status-ready'
              } font-bold">${item.currentStock.toFixed(2)} ${escapeHtml(item.unit)}</span>
              <div class="w-full h-1.5 bg-surface-container-lowest rounded-full overflow-hidden">
                <div class="h-full ${meta.bar} rounded-full" style="width:${item.stockPercentage}%"></div>
              </div>
              <span class="font-label-badge text-label-badge text-text-tertiary">Par: ${item.parLevel.toFixed(
                2,
              )} ${escapeHtml(item.unit)}</span>
            </div>
          </td>
          <td class="py-space-md px-space-md"><div class="flex flex-col"><span class="font-mono-metric-sm text-mono-metric-sm text-text-primary font-semibold">${escapeHtml(
            item.unit,
          )}</span><span class="font-label-badge text-label-badge text-text-subtle">Tracking</span></div></td>
          <td class="py-space-md px-space-md"><span class="px-space-xs py-0.5 rounded bg-status-caution/15 text-status-caution font-mono-metric-sm text-mono-metric-sm font-bold">${escapeHtml(
            item.unit,
          )}</span></td>
          <td class="py-space-md px-space-md"><span class="font-mono-metric-sm text-mono-metric-sm text-secondary">1 ${escapeHtml(
            item.unit,
          )} = 1.000 ${escapeHtml(item.unit)}</span></td>
          <td class="py-space-md px-space-md"><div class="flex flex-col"><span class="font-mono-metric-sm text-mono-metric-sm text-secondary font-bold">${money(
            item.unitCost,
          )} / ${escapeHtml(item.unit)}</span><span class="font-body-sm text-body-sm text-text-tertiary">${money(
            item.value,
          )} on hand</span></div></td>
          <td class="py-space-md px-space-md"><span class="px-space-sm py-space-xs rounded ${meta.classes} font-label-badge text-label-badge font-bold uppercase tracking-wider">${meta.label}</span></td>
          <td class="py-space-md px-space-md"><span class="text-text-secondary text-body-sm font-medium">${escapeHtml(
            item.supplierName ?? 'Unassigned',
          )}</span></td>
          <td class="py-space-md px-space-md text-right">
            <div class="inline-flex items-center gap-1">
              <button data-adjust="${item.id}" class="w-8 h-8 rounded bg-surface-container-high hover:bg-secondary/20 hover:text-secondary text-text-secondary flex items-center justify-center transition-colors" title="Adjust Stock"><span class="material-symbols-outlined text-body-base">swap_vert</span></button>
              <button data-po="${item.id}" class="w-8 h-8 rounded bg-surface-container-high hover:bg-status-caution/20 hover:text-status-caution text-text-secondary flex items-center justify-center transition-colors" title="Trigger PO"><span class="material-symbols-outlined text-body-base">shopping_cart_checkout</span></button>
              <button data-edit="${item.id}" class="w-8 h-8 rounded bg-surface-container-high hover:bg-surface-bright text-text-secondary flex items-center justify-center transition-colors" title="Edit Item"><span class="material-symbols-outlined text-body-base">edit</span></button>
            </div>
          </td>
        </tr>`;
        })
        .join('') ||
      `<tr><td colspan="10" class="py-8 text-center text-text-muted font-body-base">No inventory items match this filter.</td></tr>`;

    qsa<HTMLButtonElement>(tbody, '[data-adjust]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = data?.ingredients.find((entry) => entry.id === button.dataset.adjust);
        if (item) openAdjust(item);
      });
    });
    qsa<HTMLButtonElement>(tbody, '[data-po]').forEach((button) => {
      button.addEventListener('click', () => void reorderItem(button.dataset.po!));
    });
    qsa<HTMLButtonElement>(tbody, '[data-edit]').forEach((button) => {
      button.addEventListener('click', () => toast('Item editor is available to managers.', 'info'));
    });

    const showing = qsa<HTMLElement>(root, 'span').find((span) =>
      (span.textContent ?? '').includes('Showing') && (span.textContent ?? '').includes('ingredients'),
    );
    if (showing) {
      showing.textContent = `Showing ${rows.length} of ${data.summary.totalItems} active ingredients • Auto-sync active (${new Date().toLocaleTimeString(
        'en-US',
        { hour: '2-digit', minute: '2-digit' },
      )})`;
    }
  }

  function openAdjust(item: Ingredient) {
    editing = item;
    if (!modal) return;
    if (modalTitle) modalTitle.textContent = `Adjusting: ${item.name} (SKU: ${item.sku})`;
    if (modalCurrent) modalCurrent.textContent = `${item.currentStock.toFixed(2)} ${item.unit}`;
    if (modalInput) {
      modalInput.value = item.currentStock.toFixed(2);
      modalInput.step = item.unit === 'piece' || item.unit === 'bottle' ? '1' : '0.1';
    }
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }

  function closeAdjust() {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
    editing = null;
  }

  async function confirmAdjust() {
    if (!editing || !modalInput) return;
    const value = Number(modalInput.value);
    if (!Number.isFinite(value) || value < 0) {
      toast('Enter a valid stock quantity.', 'warn');
      return;
    }
    try {
      await api.post('/inventory/adjust', {
        ingredientId: editing.id,
        newStock: value,
        reason: modalReason,
        note: 'Quick adjust from inventory telemetry',
      });
      toast(`${editing.name} adjusted to ${value.toFixed(2)} ${editing.unit}.`, 'success');
      chime('success');
      closeAdjust();
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Stock adjustment failed.', 'error');
    }
  }

  async function reorderItem(ingredientId: string) {
    const item = data?.ingredients.find((entry) => entry.id === ingredientId);
    if (!item?.supplierName) {
      toast('This ingredient has no supplier assigned.', 'warn');
      return;
    }
    try {
      await api.post('/inventory/purchase-orders/approve', {
        supplier: item.supplierName,
        ingredientIds: [ingredientId],
      });
      toast(`PO approved — ${item.name} restocked to par from ${item.supplierName}.`, 'success');
      chime('success');
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'PO approval failed.', 'error');
    }
  }

  function updateKpis() {
    if (!data) return;
    const updateCard = (label: string, value: string) => {
      const labelEl = qsa<HTMLElement>(root, 'span').find((span) =>
        (span.textContent ?? '').trim().includes(label),
      );
      if (!labelEl) return;
      let card = labelEl.parentElement;
      for (let index = 0; index < 5 && card; index++) {
        if ((card.className ?? '').includes('rounded') && card.querySelectorAll('span').length >= 2) break;
        card = card.parentElement;
      }
      if (!card) return;
      const valueEl = qsa<HTMLElement>(card, 'div, span').find(
        (element) =>
          /[\d$]/.test(element.textContent ?? '') &&
          (element.className ?? '').includes('font-mono-metric'),
      );
      if (valueEl) valueEl.textContent = value;
    };
    updateCard('Total Asset Value', money(data.summary.totalValue));
    updateCard('Low Stock Warning', `${data.summary.lowStock} Items`);
    updateCard('Depleted / Zero Stock', `${data.summary.depleted} ${data.summary.depleted === 1 ? 'Item' : 'Items'}`);
    updateCard(
      'Healthy Par Level',
      `${Math.max(0, data.summary.totalItems - data.summary.lowStock - data.summary.depleted)} Items`,
    );
    const lowNames = data.ingredients
      .filter((item) => item.status === 'low')
      .slice(0, 3)
      .map((item) => item.name.split(' ')[0])
      .join(', ');
    const depletedNames = data.ingredients
      .filter((item) => item.status === 'depleted')
      .map((item) => item.name)
      .join(', ');
    const lowDetail = qsa<HTMLElement>(root, 'span').find((span) =>
      /Burrata, Broccolini|Items$/i.test((span.textContent ?? '').trim()) &&
      (span.textContent ?? '').length < 60,
    );
    if (lowDetail && lowNames) lowDetail.textContent = lowNames;
    const depletedDetail = qsa<HTMLElement>(root, 'span').find((span) =>
      (span.textContent ?? '').includes('Black Truffle'),
    );
    if (depletedDetail && depletedNames) depletedDetail.textContent = depletedNames;
  }

  async function refreshFeed() {
    if (!depletionFeed) return;
    try {
      const transactions = await api.get<StockTransaction[]>('/inventory/transactions?limit=8');
      depletionFeed.innerHTML = transactions.length
        ? transactions
            .map(
              (transaction) => `<div class="p-space-sm rounded-lg bg-surface-container-high flex items-center justify-between">
                <div class="flex items-center gap-space-xs min-w-0">
                  <span class="${
                    transaction.quantityChange >= 0 ? 'text-status-ready' : 'text-status-urgent'
                  } font-mono-metric-sm font-bold text-mono-metric-sm shrink-0">${
                    transaction.quantityChange >= 0 ? '+' : ''
                  }${transaction.quantityChange.toFixed(2)} ${escapeHtml(transaction.unit)}</span>
                  <span class="text-text-primary text-body-sm font-semibold truncate">${escapeHtml(
                    transaction.ingredientName,
                  )}</span>
                </div>
                <div class="text-right shrink-0">
                  <span class="font-label-badge text-label-badge text-text-tertiary">${escapeHtml(
                    transaction.reason.replace(/_/g, ' '),
                  )}</span>
                  <div class="font-mono-metric-sm text-mono-metric-sm text-secondary">${relativeMinutes(
                    transaction.createdAt,
                  )}</div>
                </div>
              </div>`,
            )
            .join('')
        : '<div class="p-4 text-center text-text-muted font-body-base">No stock movements yet.</div>';
    } catch {
      /* keep the static feed */
    }
  }

  async function refresh() {
    data = await api.get<InventoryResponse>('/inventory');
    renderCategories();
    renderRows();
    updateKpis();
    await refreshFeed();
  }

  searchInput?.addEventListener('input', () => {
    search = searchInput.value.trim().toLowerCase();
    renderRows();
  });

  // Modal close handlers (inline handlers were stripped by the generator).
  qsa<HTMLButtonElement>(modal ?? root, 'button').forEach((button) => {
    const icon = button.querySelector('.material-symbols-outlined')?.textContent;
    if (icon === 'close') button.addEventListener('click', closeAdjust);
  });
  cancelButton?.addEventListener('click', closeAdjust);
  confirmButton?.addEventListener('click', () => void confirmAdjust());
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeAdjust();
  });
  qsa<HTMLButtonElement>(modal ?? root, 'button').forEach((button) => {
    if ((button.textContent ?? '').trim() === '-') {
      button.addEventListener('click', () => {
        if (!modalInput) return;
        modalInput.value = String(Math.max(0, Number(modalInput.value) - Number(modalInput.step || 1)));
      });
    }
    if ((button.textContent ?? '').trim() === '+') {
      button.addEventListener('click', () => {
        if (!modalInput) return;
        modalInput.value = String(Number(modalInput.value) + Number(modalInput.step || 1));
      });
    }
  });
  const reasonSelect = qsa<HTMLSelectElement>(modal ?? root, 'select')[0];
  reasonSelect?.addEventListener('change', () => {
    modalReason = REASON_MAP[reasonSelect.value] ?? 'inventory_audit';
  });

  autoPo?.addEventListener('click', () => {
    void api
      .get<Array<{ supplier: string; lines: unknown[]; total: number }>>('/inventory/purchase-orders')
      .then(async (orders) => {
        if (orders.length === 0) {
          toast('All pars are healthy — no POs needed.', 'success');
          return;
        }
        for (const order of orders) {
          await api.post('/inventory/purchase-orders/approve', { supplier: order.supplier });
        }
        toast(`Auto-PO approved across ${orders.length} supplier(s).`, 'success');
        chime('success');
        await refresh();
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Auto-PO failed.', 'error'));
  });
  approvePo?.addEventListener('click', () => {
    void api
      .get<Array<{ supplier: string }>>('/inventory/purchase-orders')
      .then(async (orders) => {
        if (orders[0]) {
          await api.post('/inventory/purchase-orders/approve', { supplier: orders[0].supplier });
          toast(`Purchase order approved for ${orders[0].supplier}.`, 'success');
          await refresh();
        } else {
          toast('No purchase orders pending.', 'info');
        }
      })
      .catch(() => toast('Could not approve the PO.', 'error'));
  });
  scanInvoice?.addEventListener('click', () =>
    toast('Invoice scanner is ready — point the camera at the supplier invoice.', 'info'),
  );
  stockAudit?.addEventListener('click', () => {
    const item = filteredItems()[0];
    if (item) openAdjust(item);
    else toast('No items available to audit.', 'warn');
  });

  const offs = [
    listen('INVENTORY_UPDATED', () => void refresh()),
    listen('LOW_STOCK_ALERT', (payload: { name?: string }) => {
      toast(`Low stock: ${payload?.name ?? 'ingredient'} crossed its reorder trigger.`, 'warn');
      chime('alert');
      void refresh();
    }),
    listen('GLOBAL_86_ITEM_UPDATE', () => void refresh()),
  ];

  void refresh().catch((error) => {
    console.error(error);
    toast('Inventory feed unavailable.', 'error');
  });

  return () => {
    for (const off of offs) {
      try {
        off();
      } catch {
        /* noop */
      }
    }
  };
};

export default inventoryBinder;
