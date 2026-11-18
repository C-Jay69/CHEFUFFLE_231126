import type {
  DiningTable,
  MenuItem,
  MenuResponse,
  Order,
  ReservationResponse,
} from '../types';
import { escapeHtml, money } from '../format';
import { listen } from '../socket';
import type { Binder, BinderContext } from './types';
import { qs, qsa } from './types';

const TAX_RATE = 0.08;
const GRATUITY_RATE = 0.18;

interface CartModifier {
  name: string;
  priceDelta: number;
}

interface CartLine {
  key: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: CartModifier[];
  seat: string | null;
  notes: string | null;
  station: string;
}

interface SelectedModifier extends CartModifier {
  id: string;
}

const posBinder: Binder = (ctx: BinderContext) => {
  const { root, api, socket, toast, chime } = ctx;
  let menu: MenuResponse | null = null;
  let categories = [] as MenuResponse['categories'];
  let activeCategory = 'all';
  let searchTerm = '';
  let cart: CartLine[] = [];
  let activeOrder: Order | null = null;
  let table: DiningTable | null = null;
  let server = { id: '', name: 'Zach Arroyo' };
  let selectedItem: MenuItem | null = null;
  let selectedModifiers: SelectedModifier[] = [];
  let directNotes: string[] = [];
  let held = false;
  let guestIsVip = false;

  const ticketScroll = qs(root, '#ticket-items-scroll');
  const menuGrid = qsa(root, 'div').find(
    (element) =>
      element.className.includes('md:grid-cols-3') && element.children.length >= 3,
  );
  const categoryButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Chef Favorites'),
  );
  const categoryContainer = categoryButton?.parentElement ?? null;
  const searchInput = qsa<HTMLInputElement>(root, 'input').find((input) =>
    (input.placeholder ?? '').includes('Search menu'),
  );
  const customizingSpan = qsa(root, 'span').find((element) =>
    (element.textContent ?? '').startsWith('Customizing:'),
  );
  const modifierDrawer =
    customizingSpan?.closest('div.bg-surface-container-lowest') ??
    customizingSpan?.parentElement?.parentElement ??
    null;
  const addToTicket = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Add to Ticket'),
  );
  const sendKitchen = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Send Kitchen'),
  );
  const paySplit = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Pay / Split'),
  );
  const holdFire = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Hold / Fire'),
  );
  const voidButton = qs<HTMLButtonElement>(root, 'button[title="Void Ticket"]');
  const scanButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').trim() === 'Scan',
  );
  const quickBar = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Quick Bar Tab'),
  );

  const subtotalLabel = qsa(root, 'span').find((element) =>
    (element.textContent ?? '').trim().startsWith('Subtotal ('),
  );
  const subtotalRow = subtotalLabel?.parentElement ?? null;
  const taxLabel = qsa(root, 'span').find((element) =>
    (element.textContent ?? '').trim().startsWith('Sales Tax'),
  );
  const taxRow = taxLabel?.parentElement ?? null;
  const gratuityLabel = qsa(root, 'span').find((element) =>
    (element.textContent ?? '').includes('Auto-Gratuity'),
  );
  const gratuityRow = gratuityLabel?.parentElement ?? null;
  const totalLabel = qsa(root, 'span').find((element) =>
    (element.textContent ?? '').trim() === 'Total Due',
  );
  const totalBlock = totalLabel?.parentElement ?? null;
  const totalValue = totalBlock?.querySelector<HTMLElement>('.font-mono-metric-lg');

  const ticketHeaderNumber = qsa(root, 'span').find((span) =>
    /^#\d+$/.test((span.textContent ?? '').trim()),
  );
  const bannerLabel = qsa(root, 'span').find((element) =>
    (element.textContent ?? '').includes("86'D LIVE:"),
  );
  const banner = bannerLabel?.closest('div.fixed') ?? null;
  const occupancy = qsa(root, 'span').find((span) =>
    (span.textContent ?? '').includes('Occupancy'),
  );

  const lineTotal = (line: CartLine) =>
    (line.unitPrice + line.modifiers.reduce((sum, modifier) => sum + modifier.priceDelta, 0)) *
    line.quantity;
  const subtotal = () => cart.reduce((sum, line) => sum + lineTotal(line), 0);
  const gratuityApplies = () =>
    Boolean(table && (table.zone.includes('Patio') || (table.currentPartySize ?? 0) >= 6));

  function renderMenu() {
    if (!menu || !menuGrid) return;
    const filtered = menu.items.filter((item) => {
      const categoryOk = activeCategory === 'all' || item.categoryId === activeCategory;
      const searchOk =
        !searchTerm ||
        item.name.toLowerCase().includes(searchTerm) ||
        (item.description ?? '').toLowerCase().includes(searchTerm) ||
        item.tags.some((tag) => tag.toLowerCase().includes(searchTerm));
      return categoryOk && searchOk;
    });
    menuGrid.innerHTML = filtered.map(renderTile).join('') ||
      `<div class="col-span-full p-6 text-center text-text-muted font-body-base">No menu items match this filter.</div>`;
    qsa<HTMLElement>(menuGrid, '[data-menu-id]').forEach((tile) => {
      tile.addEventListener('click', () => {
        const item = menu?.items.find((entry) => entry.id === tile.dataset.menuId);
        if (item) void addItem(item);
      });
    });
  }

  function renderTile(item: MenuItem) {
    const out = item.is86ed || item.stockStatus === 'out';
    const low = !out && item.stockStatus === 'low';
    const statusLabel = out
      ? "86'D"
      : low
        ? `Only ${item.portionsLeft} Left`
        : item.tags[0] ?? 'In Stock';
    const statusClass = out
      ? 'bg-status-urgent/20 text-status-urgent'
      : low
        ? 'bg-status-caution/20 text-status-caution'
        : 'bg-status-ready/20 text-status-ready';
    return `<div data-menu-id="${item.id}" class="relative flex flex-col justify-between p-space-sm rounded-xl ${
      out
        ? 'bg-surface-container-lowest/60 border border-status-urgent/30 opacity-75 cursor-not-allowed'
        : 'bg-surface-container-low hover:bg-surface-container cursor-pointer'
    } shadow-md transition-all active:scale-[0.98] group overflow-hidden">
      ${
        out
          ? ''
          : '<div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent-purple-glow to-secondary"></div>'
      }
      <div class="flex justify-between items-start gap-1">
        <span class="font-headline-md text-headline-md font-bold ${
          out ? 'text-text-muted line-through' : 'text-text-primary group-hover:text-secondary'
        } transition-colors leading-tight">${escapeHtml(item.name)}</span>
        <span class="px-1.5 py-0.5 rounded ${
          out ? 'bg-status-urgent/20 text-status-urgent' : 'bg-accent-lime/20 text-accent-lime'
        } font-mono-metric-sm text-mono-metric-sm font-bold">${out ? "86'D" : money(item.price)}</span>
      </div>
      <p class="text-body-sm font-body-sm ${
        out ? 'text-text-subtle' : 'text-text-secondary'
      } line-clamp-2 mt-1">${escapeHtml(item.description ?? '')}</p>
      <div class="flex items-center justify-between mt-space-sm pt-2 border-t border-border-subtle">
        <span class="px-1.5 py-0.5 rounded ${statusClass} font-label-badge text-label-badge uppercase font-bold">${escapeHtml(statusLabel)}</span>
        <span class="material-symbols-outlined ${
          out ? 'text-text-subtle' : 'text-secondary'
        } text-body-base group-hover:translate-x-0.5 transition-transform">${
          out ? 'do_not_disturb_on' : 'add_circle'
        }</span>
      </div>
    </div>`;
  }

  function renderCategories() {
    if (!categoryContainer) return;
    const allItems = menu?.items ?? [];
    const entries = [
      { id: 'all', name: 'Chef Favorites', itemCount: allItems.length },
      ...categories,
    ];
    categoryContainer.innerHTML = entries
      .map((category) => {
        const active = activeCategory === category.id;
        return `<button data-category-id="${category.id}" class="flex items-center gap-space-xs px-space-sm py-3.5 rounded-lg ${
          active
            ? 'bg-gradient-to-r from-accent-purple-glow/30 to-secondary/30 text-text-primary shadow-[inset_3px_0_0_0_#4cd7f6]'
            : 'bg-surface-container-low hover:bg-surface-container text-text-secondary hover:text-text-primary'
        } transition-all text-left">
          <span class="material-symbols-outlined ${
            active ? 'text-secondary' : 'text-text-muted'
          } text-body-base">${active ? 'star' : 'restaurant_menu'}</span>
          <div class="flex flex-col min-w-0">
            <span class="font-body-base text-body-base ${active ? 'font-bold' : 'font-semibold'} truncate">${escapeHtml(
              category.name,
            )}</span>
            <span class="font-label-badge text-label-badge ${
              active ? 'text-secondary' : 'text-text-subtle'
            } font-mono-metric-sm">${category.itemCount} Items</span>
          </div>
        </button>`;
      })
      .join('');
    qsa<HTMLElement>(categoryContainer, '[data-category-id]').forEach((button) => {
      button.addEventListener('click', () => {
        activeCategory = button.dataset.categoryId ?? 'all';
        renderCategories();
        renderMenu();
      });
    });
  }

  function renderCart() {
    if (!ticketScroll) return;
    if (cart.length === 0) {
      ticketScroll.innerHTML = `<div class="flex flex-col items-center justify-center gap-2 py-10 text-center text-text-muted">
        <span class="material-symbols-outlined text-headline-xl text-text-subtle">receipt_long</span>
        <span class="font-body-base">No items on this ticket yet.</span>
        <span class="font-body-sm text-text-subtle">Tap a menu tile to start the order.</span>
      </div>`;
    } else {
      ticketScroll.innerHTML = cart.map(renderCartLine).join('');
    }
    qsa<HTMLButtonElement>(ticketScroll, '[data-cart-inc]').forEach((button) => {
      button.addEventListener('click', () => adjustLine(button.dataset.cartInc!, 1));
    });
    qsa<HTMLButtonElement>(ticketScroll, '[data-cart-dec]').forEach((button) => {
      button.addEventListener('click', () => adjustLine(button.dataset.cartDec!, -1));
    });
    renderTotals();
  }

  function renderCartLine(line: CartLine) {
    const modifiers = line.modifiers
      .map(
        (modifier) =>
          `<span class="text-body-sm font-body-sm ${
            modifier.priceDelta > 0 ? 'text-secondary' : 'text-text-muted'
          } font-mono-metric-sm">+ ${escapeHtml(modifier.name)}${
            modifier.priceDelta > 0 ? ` (${money(modifier.priceDelta)})` : ''
          }</span>`,
      )
      .join('');
    const notes = line.notes
      ? `<span class="text-body-sm font-body-sm text-status-urgent font-medium">${escapeHtml(line.notes)}</span>`
      : '';
    return `<div class="p-space-xs rounded-lg bg-surface-container-low hover:bg-surface-container transition-all group">
      <div class="grid grid-cols-12 items-center">
        <div class="col-span-6 flex flex-col">
          <span class="font-body-base text-body-base font-bold text-text-primary group-hover:text-secondary transition-colors">${escapeHtml(
            line.name,
          )}</span>
          ${modifiers}${notes}
        </div>
        <div class="col-span-3 flex items-center justify-center gap-1">
          <button data-cart-dec="${line.key}" class="w-6 h-6 rounded bg-surface-variant hover:bg-surface-bright text-text-primary flex items-center justify-center font-bold text-body-base">-</button>
          <span class="font-mono-metric-md text-mono-metric-md text-text-primary w-5 text-center">${line.quantity}</span>
          <button data-cart-inc="${line.key}" class="w-6 h-6 rounded bg-surface-variant hover:bg-surface-bright text-text-primary flex items-center justify-center font-bold text-body-base">+</button>
        </div>
        <div class="col-span-3 text-right font-mono-metric-md text-mono-metric-md text-text-primary font-bold">${money(
          lineTotal(line),
        )}</div>
      </div>
      <div class="flex items-center gap-2 mt-1 pl-1">
        <span class="px-1.5 py-0.5 rounded bg-surface-variant text-text-secondary font-label-badge text-label-badge uppercase">${
          line.seat ? `Seat ${escapeHtml(line.seat)}` : escapeHtml(line.station.replace('_', ' '))
        }</span>
        <span class="px-1.5 py-0.5 rounded bg-secondary/10 text-secondary font-label-badge text-label-badge">${held ? 'ON HOLD' : 'READY TO FIRE'}</span>
      </div>
    </div>`;
  }

  function renderTotals() {
    const subtotalValue = subtotal();
    const taxValue = subtotalValue * TAX_RATE;
    const gratuityValue = gratuityApplies() ? subtotalValue * GRATUITY_RATE : 0;
    const totalValueAmount = subtotalValue + taxValue + gratuityValue;
    const count = cart.reduce((sum, line) => sum + line.quantity, 0);

    if (subtotalRow) {
      const spans = qsa<HTMLElement>(subtotalRow, 'span');
      if (spans[0]) spans[0].textContent = `Subtotal (${count} item${count === 1 ? '' : 's'})`;
      if (spans[1]) spans[1].textContent = money(subtotalValue);
    }
    if (taxRow) {
      const spans = qsa<HTMLElement>(taxRow, 'span');
      if (spans[1]) spans[1].textContent = money(taxValue);
    }
    if (gratuityRow) {
      const spans = qsa<HTMLElement>(gratuityRow, 'span');
      if (spans[1]) spans[1].textContent = money(gratuityValue);
      gratuityRow.style.display = gratuityValue > 0 ? '' : 'none';
    }
    if (totalValue) totalValue.textContent = money(totalValueAmount);
    if (ticketHeaderNumber) {
      ticketHeaderNumber.textContent = activeOrder ? `#${activeOrder.orderNumber}` : '#NEW';
    }
  }

  function adjustLine(key: string, delta: number) {
    const line = cart.find((entry) => entry.key === key);
    if (!line) return;
    line.quantity += delta;
    if (line.quantity <= 0) cart = cart.filter((entry) => entry.key !== key);
    renderCart();
  }

  async function addItem(item: MenuItem) {
    if (item.is86ed || item.stockStatus === 'out') {
      toast(`${item.name} is 86'd and cannot be ordered.`, 'error');
      chime('blocked');
      return;
    }
    selectedItem = item;
    renderModifierDrawer();
    const existing = cart.find(
      (line) => line.menuItemId === item.id && line.modifiers.length === 0 && !line.notes,
    );
    if (existing) existing.quantity += 1;
    else {
      cart.push({
        key: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        menuItemId: item.id,
        name: item.name,
        quantity: 1,
        unitPrice: item.price,
        modifiers: [],
        seat: null,
        notes: null,
        station: item.station,
      });
    }
    renderCart();
  }

  function renderModifierDrawer() {
    if (!modifierDrawer) return;
    const title = qsa(modifierDrawer, 'span').find((span) =>
      (span.textContent ?? '').startsWith('Customizing:'),
    );
    const base = qsa(modifierDrawer, 'span').find((span) =>
      (span.textContent ?? '').startsWith('Base:'),
    );
    if (title) title.textContent = `Customizing: ${selectedItem?.name ?? 'Select a dish'}`;
    if (base) base.textContent = `Base: ${money(selectedItem?.price ?? 0)}`;
    if (addToTicket) {
      const total =
        (selectedItem?.price ?? 0) +
        selectedModifiers.reduce((sum, modifier) => sum + modifier.priceDelta, 0);
      addToTicket.innerHTML = `<span class="material-symbols-outlined text-body-base font-bold">check</span><span>Add to Ticket (${money(
        total,
      )})</span>`;
    }
    qsa<HTMLButtonElement>(modifierDrawer, 'button').forEach((button) => {
      const text = (button.textContent ?? '').trim();
      if (text.startsWith('Add to Ticket')) return;
      const deltaMatch = text.match(/\+\$(\d+(?:\.\d+)?)/);
      const priceDelta = deltaMatch ? Number(deltaMatch[1]) : 0;
      const isToggle = /Personal|Large|Gluten-Free|Burrata|Prosciutto|Hot Honey|Arugula|Well Done|Cut in 8/.test(
        text,
      );
      if (!isToggle) return;
      const label = text.split('(')[0].replace(/\+\$[\d.]+/g, '').trim();
      button.onclick = () => {
        if (/Well Done|Cut in 8/.test(label)) {
          if (directNotes.includes(label)) directNotes = directNotes.filter((note) => note !== label);
          else directNotes = [...directNotes, label];
          button.classList.toggle('bg-primary/20');
          button.classList.toggle('text-primary');
          return;
        }
        const existingIndex = selectedModifiers.findIndex((modifier) => modifier.name === label);
        if (existingIndex >= 0) {
          selectedModifiers.splice(existingIndex, 1);
          button.classList.remove('bg-primary/20', 'text-primary');
          button.classList.add('bg-surface-container', 'text-text-secondary');
        } else {
          selectedModifiers.push({ id: `${label}-${Date.now()}`, name: label, priceDelta });
          button.classList.add('bg-primary/20', 'text-primary');
          button.classList.remove('bg-surface-container', 'text-text-secondary');
        }
        renderModifierDrawer();
      };
    });
  }

  function addSelectedWithModifiers() {
    if (!selectedItem) {
      toast('Select a dish from the menu first.', 'warn');
      return;
    }
    if (selectedItem.is86ed || selectedItem.stockStatus === 'out') {
      toast(`${selectedItem.name} is 86'd.`, 'error');
      return;
    }
    cart.push({
      key: `${selectedItem.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      menuItemId: selectedItem.id,
      name: selectedItem.name,
      quantity: 1,
      unitPrice: selectedItem.price,
      modifiers: selectedModifiers.map(({ name, priceDelta }) => ({ name, priceDelta })),
      seat: null,
      notes: directNotes.length ? directNotes.join(' • ') : null,
      station: selectedItem.station,
    });
    selectedModifiers = [];
    directNotes = [];
    renderCart();
    renderModifierDrawer();
    toast(`${selectedItem.name} added with modifiers.`, 'success');
    chime('success');
  }

  async function fireToKitchen() {
    if (cart.length === 0) {
      toast('Add at least one item before firing.', 'warn');
      return;
    }
    const tableId = table?.id;
    try {
      sendKitchen?.setAttribute('disabled', 'true');
      const result = await api.post<{ order: Order; newly86ed: unknown[] }>('/orders', {
        tableId: tableId ?? null,
        serverId: server.id || undefined,
        serverName: server.name,
        partyName: table?.currentPartyName ?? 'Walk-in',
        partySize: table?.currentPartySize ?? Math.max(1, cart.length),
        items: cart.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          modifiers: line.modifiers,
          seat: line.seat ?? undefined,
          notes: line.notes ?? undefined,
        })),
        sendToKitchen: true,
        autoGratuity: gratuityApplies(),
      });
      activeOrder = result.order;
      cart = [];
      held = false;
      renderCart();
      renderTotals();
      toast(
        `Order #${result.order.orderNumber} fired to the kitchen${table ? ` · ${table.tableNumber}` : ''}.`,
        'success',
      );
      chime('ticket');
      if (result.newly86ed.length > 0) {
        toast(`${result.newly86ed.length} item(s) auto-86'd from stock depletion.`, 'warn');
      }
      await refreshMenu();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not fire the order.', 'error');
      chime('blocked');
    } finally {
      sendKitchen?.removeAttribute('disabled');
    }
  }

  async function payOrder() {
    if (!activeOrder) {
      if (cart.length === 0) {
        toast('No active check to settle.', 'warn');
        return;
      }
      await fireToKitchen();
      if (!activeOrder) return;
    }
    try {
      const subtotalValue = activeOrder.subtotal;
      const tip = Number((subtotalValue * 0.2).toFixed(2));
      const paid = await api.post<Order>(`/orders/${activeOrder.id}/pay`, {
        tip,
        method: 'card',
      });
      toast(`Check #${paid.orderNumber} settled · ${money(paid.total)}`, 'success');
      chime('success');
      activeOrder = null;
      table = null;
      cart = [];
      renderCart();
      renderTotals();
      setTicketContext();
      await loadContext();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Payment failed.', 'error');
    }
  }

  async function voidOrder() {
    if (!activeOrder) {
      if (cart.length === 0) {
        toast('Nothing to void.', 'warn');
        return;
      }
      cart = [];
      renderCart();
      toast('Ticket cleared before firing.', 'info');
      return;
    }
    if (!window.confirm(`Void order #${activeOrder.orderNumber}? This cannot be undone.`)) return;
    try {
      await api.post(`/orders/${activeOrder.id}/void`, { reason: 'Voided from POS terminal' });
      toast(`Order #${activeOrder.orderNumber} voided.`, 'warn');
      activeOrder = null;
      cart = [];
      renderCart();
      await loadContext();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Void failed.', 'error');
    }
  }

  function setTicketContext() {
    if (!ticketScroll) return;
    const leftColumn = ticketScroll.closest('div.col-span-12') as HTMLElement | null;
    const scope = leftColumn ?? root;
    const iconWith = (name: string) =>
      qsa<HTMLElement>(scope, 'span.material-symbols-outlined').find(
        (span) => (span.textContent ?? '').trim() === name,
      );

    const badgeIcon = iconWith('badge');
    const serverSpan =
      badgeIcon?.parentElement?.querySelector<HTMLElement>('span.text-text-primary') ??
      qsa<HTMLElement>(scope, 'span').find((span) =>
        (span.textContent ?? '').trim() === 'Zach Arroyo',
      );
    if (serverSpan) serverSpan.textContent = server.name;

    const tableIcon = iconWith('table_bar');
    if (tableIcon?.parentElement && table) {
      tableIcon.parentElement.innerHTML = `<span class="material-symbols-outlined text-body-base">table_bar</span> ${escapeHtml(
        table.tableNumber,
      )} ${escapeHtml(table.zone.replace(' & ', ' ').split(' ')[0])}`;
    }

    const groupIcon = iconWith('group');
    if (groupIcon?.parentElement) {
      groupIcon.parentElement.innerHTML = `<span class="material-symbols-outlined text-body-base">group</span> ${
        table?.currentPartySize ?? 1
      }`;
    }

    const guestIcon = iconWith('account_circle');
    const guestRow = guestIcon?.parentElement;
    const guestSpan =
      guestRow?.querySelector<HTMLElement>('span.font-body-sm') ??
      qsa<HTMLElement>(scope, 'span').find((span) =>
        (span.textContent ?? '').includes('Marcus Sterling'),
      );
    if (guestSpan) guestSpan.textContent = table?.currentPartyName ?? 'Walk-in Guest';
    const vipBadge = guestRow
      ? qsa<HTMLElement>(guestRow, 'span').find((span) =>
          (span.textContent ?? '').includes('VIP'),
        )
      : null;
    if (vipBadge) vipBadge.style.display = guestIsVip ? '' : 'none';
    renderTotals();
  }

  function renderBanner() {
    if (!banner || !menu) return;
    const out = menu.items.filter((item) => item.is86ed);
    const low = menu.items.filter((item) => !item.is86ed && item.stockStatus === 'low');
    const message = qsa<HTMLElement>(banner, 'span').find((span) =>
      /is OUT|Disabled|low stock/i.test(span.textContent ?? ''),
    );
    if (message) {
      message.textContent = out.length
        ? `${out[0].name} is OUT (Disabled across menu & Voice AI)${low[0] ? ` • ${low[0].name} low stock (${low[0].portionsLeft} portions left)` : ''}`
        : `All menu items available${low[0] ? ` • ${low[0].name} low stock (${low[0].portionsLeft} portions left)` : ''}`;
    }
  }

  async function refreshMenu() {
    menu = await api.get<MenuResponse>('/menu');
    categories = menu.categories;
    renderCategories();
    renderMenu();
    renderBanner();
  }

  async function loadContext() {
    try {
      const [staffList, tables, openOrders, reservations] = await Promise.all([
        api.get<{ staff: Array<{ id: string; name: string; role: string }> }>('/auth/staff'),
        api.get<DiningTable[]>('/tables'),
        api.get<Order[]>('/orders?status=open&limit=20'),
        api.get<ReservationResponse>('/reservations'),
      ]);
      const zach = staffList.staff.find((member) => member.name.includes('Zach')) ?? staffList.staff[0];
      if (zach) server = { id: zach.id, name: zach.name };
      table =
        tables.find((entry) => entry.tableNumber === 'T-14') ??
        tables.find((entry) => entry.status === 'occupied') ??
        tables.find((entry) => entry.status === 'available') ??
        null;
      activeOrder = openOrders[0] ?? null;
      if (activeOrder) {
        table = tables.find((entry) => entry.id === activeOrder?.tableId) ?? table;
        if (activeOrder.serverName) {
          server = {
            id: activeOrder.serverId,
            name: activeOrder.serverName,
          };
        }
        cart = activeOrder.items.map((item) => ({
          key: `${item.id}-${Math.random().toString(36).slice(2, 6)}`,
          menuItemId: item.menuItemId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          modifiers: item.modifiers ?? [],
          seat: item.seat,
          notes: item.notes,
          station: item.station,
        }));
      }
      guestIsVip = reservations.reservations.some(
        (reservation) =>
          reservation.vip &&
          table?.currentPartyName &&
          reservation.guestName === table.currentPartyName,
      );
      if (occupancy) {
        const summary = await api.get<{ tables: { occupancy: number } }>('/dashboard/summary');
        occupancy.textContent = `Dinner Rush • ${summary.tables.occupancy}% Occupancy • Online`;
      }
      setTicketContext();
      renderCart();
    } catch (error) {
      console.warn('POS context load failed', error);
    }
  }

  // -------------------- wiring --------------------
  searchInput?.addEventListener('input', () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    renderMenu();
  });
  scanButton?.addEventListener('click', () => searchInput?.focus());
  addToTicket?.addEventListener('click', addSelectedWithModifiers);
  sendKitchen?.addEventListener('click', () => void fireToKitchen());
  paySplit?.addEventListener('click', () => void payOrder());
  holdFire?.addEventListener('click', () => {
    held = !held;
    holdFire.classList.toggle('text-status-caution');
    holdFire.classList.toggle('text-status-ready');
    toast(held ? 'Ticket placed on hold.' : 'Ticket released to fire.', held ? 'warn' : 'success');
  });
  voidButton?.addEventListener('click', () => void voidOrder());
  quickBar?.addEventListener('click', () => {
    toast('Quick Bar Tab opened — attach a bar seat from the Floor Plan.', 'info');
  });
  qsa<HTMLButtonElement>(root, 'button').forEach((button) => {
    const text = (button.textContent ?? '').trim();
    if (text.includes('Manager Discount')) {
      button.addEventListener('click', () => toast('Manager discount requires PIN approval at the terminal.', 'warn'));
    }
    if (text.includes('Open Custom Item')) {
      button.addEventListener('click', () => toast('Custom item is available to managers via the keypad.', 'info'));
    }
    if (text.includes('Edit')) {
      button.addEventListener('click', () => toast('Guest profile editor opens in Reservations & CRM.', 'info'));
    }
  });

  const offs = [
    listen('GLOBAL_86_ITEM_UPDATE', () => {
      void refreshMenu();
      chime('alert');
    }),
    listen('INVENTORY_UPDATED', () => void refreshMenu()),
    listen('TABLE_UPDATED', () => {
      void api
        .get<DiningTable[]>('/tables')
        .then((tables) => {
          const current = tables.find((entry) => entry.id === table?.id);
          if (current) {
            table = current;
            setTicketContext();
          }
        })
        .catch(() => undefined);
    }),
  ];

  void (async () => {
    try {
      await refreshMenu();
      await loadContext();
      renderModifierDrawer();
      renderCart();
    } catch (error) {
      console.error(error);
      toast('Could not reach the operations API. Check that :4000 is running.', 'error');
    }
  })();

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

export default posBinder;
