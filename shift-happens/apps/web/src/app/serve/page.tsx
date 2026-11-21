'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COURSE_LABELS, courseForCategory, type Course } from '@/lib/course';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import { playChime } from '@/lib/audio';
import { initials, money, timeLabel } from '@/lib/format';
import { useSession } from '@/lib/session';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import type { DiningTable, MenuItem, MenuResponse, Order } from '@/lib/types';

interface StaffMember {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
}

interface CartLine {
  key: string;
  guest: number;
  item: MenuItem;
  quantity: number;
  course: Course;
}

const COURSE_ORDER: Course[] = ['starter', 'main', 'dessert', 'drink'];

type Step = 'map' | 'order' | 'review' | 'sent';

const TAX_RATE = 0.08;
const GRATUITY_RATE = 0.18;

const statusCard: Record<DiningTable['status'], string> = {
  available: 'border-status-ready/40 bg-status-ready/[0.07] hover:bg-status-ready/[0.12]',
  occupied: 'border-status-urgent/35 bg-status-urgent/[0.06] hover:bg-status-urgent/[0.11]',
  reserved: 'border-status-caution/40 bg-status-caution/[0.07] hover:bg-status-caution/[0.12]',
  dirty: 'border-text-muted/30 bg-surface-container/40 hover:bg-surface-container/60',
};

const statusBadge: Record<DiningTable['status'], string> = {
  available: 'bg-status-ready/20 text-status-ready',
  occupied: 'bg-status-urgent/20 text-status-urgent',
  reserved: 'bg-status-caution/20 text-status-caution',
  dirty: 'bg-text-muted/20 text-text-tertiary',
};

const statusLabel: Record<DiningTable['status'], string> = {
  available: 'READY',
  occupied: 'IN SERVICE',
  reserved: 'RESERVED',
  dirty: 'NEEDS BUS',
};

export default function ServePage() {
  const router = useRouter();
  const { can } = useSession();
  const canOrder = can('serve.order');
  const canPay = can('serve.pay');
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [server, setServer] = useState<StaffMember | null>(null);
  const [zone, setZone] = useState('all');
  const [step, setStep] = useState<Step>('map');
  const [coverOpen, setCoverOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null);
  const [covers, setCovers] = useState(2);
  const [partyName, setPartyName] = useState('');
  const [activeGuest, setActiveGuest] = useState(1);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState('');
  const [sentOrder, setSentOrder] = useState<Order | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [busy, setBusy] = useState(false);
  const [existingOpen, setExistingOpen] = useState(false);
  const [existingOrder, setExistingOrder] = useState<Order | null>(null);
  const [loadingCheck, setLoadingCheck] = useState(false);
  const [appendOrderId, setAppendOrderId] = useState<string | null>(null);
  const prefillHandled = useRef(false);
  const categoryInitialized = useRef(false);

  const loadTables = useCallback(async () => {
    const response = await api.get<DiningTable[]>('/tables');
    setTables(response);
    return response;
  }, []);

  const loadMenu = useCallback(async () => {
    const response = await api.get<MenuResponse>('/menu');
    setMenu(response);
    return response;
  }, []);

  const loadStaff = useCallback(async () => {
    const response = await api.get<{ staff: StaffMember[] }>('/auth/staff');
    setStaff(response.staff);
    return response.staff;
  }, []);

  useEffect(() => {
    void Promise.all([loadTables(), loadMenu(), loadStaff()]).catch(() =>
      showToast('Could not reach the operations API. Is it running on :4000?', 'error'),
    );
  }, [loadMenu, loadStaff, loadTables]);

  useEffect(() => {
    if (staff.length === 0) return;
    let stored: { id?: string; name?: string } | null = null;
    try {
      stored = JSON.parse(localStorage.getItem('sh-staff') || 'null');
    } catch {
      stored = null;
    }
    const match =
      (stored?.name && staff.find((member) => member.name === stored?.name)) ||
      staff.find((member) => member.name.includes('Zach')) ||
      staff.find((member) => member.role === 'server') ||
      staff[0];
    setServer(match ?? null);
  }, [staff]);

  useEffect(() => {
    const offs = [
      listen('GLOBAL_86_ITEM_UPDATE', () => void loadMenu()),
      listen('TABLE_UPDATED', () => void loadTables()),
    ];
    return () => offs.forEach((off) => off());
  }, [loadMenu, loadTables]);

  // The full menu is 182 items, so open on the first food section instead of
  // dumping every drink and bottle into the "All" grid.
  const defaultCategoryId = useCallback(() => {
    const list = menu?.categories ?? [];
    const preferred =
      list.find((entry) => entry.name === 'Start & Share') ??
      list.find((entry) => entry.name === 'Features') ??
      list[0];
    return preferred?.id ?? 'all';
  }, [menu]);

  useEffect(() => {
    if (!menu || categoryInitialized.current) return;
    categoryInitialized.current = true;
    setCategory(defaultCategoryId());
  }, [menu, defaultCategoryId]);

  const loadExistingCheck = useCallback(
    async (table: DiningTable, orderId: string) => {
      setLoadingCheck(true);
      try {
        const order = await api.get<Order>(`/orders/${orderId}`);
        setExistingOrder(order);
        const seatMax = order.items.reduce((max, item) => {
          const seat = Number(item.seat);
          return Number.isFinite(seat) ? Math.max(max, seat) : max;
        }, 0);
        const party = table.currentPartySize ?? (seatMax || 2);
        setCovers(Math.max(1, Math.min(40, party)));
        setPartyName(table.currentPartyName ?? order.partyName ?? '');
        setNotes(order.allergyNotes ?? '');
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : 'Could not open this check.',
          'error',
        );
      } finally {
        setLoadingCheck(false);
      }
    },
    [],
  );

  const openTable = useCallback(
    (table: DiningTable) => {
      if (table.status === 'dirty') {
        showToast(`${table.tableNumber} needs to be bussed before a new order.`, 'warn');
        return;
      }
      setSelectedTable(table);
      setAppendOrderId(null);
      if (table.activeOrder) {
        // Never open a second check on a table that already has one.
        setExistingOrder(null);
        setExistingOpen(true);
        void loadExistingCheck(table, table.activeOrder.id);
        return;
      }
      setCovers(Math.max(1, table.currentPartySize ?? Math.min(2, table.capacity)));
      setPartyName(table.currentPartyName ?? '');
      setCoverOpen(true);
    },
    [loadExistingCheck],
  );

  const startAppend = () => {
    if (!existingOrder) return;
    setAppendOrderId(existingOrder.id);
    setExistingOpen(false);
    setStep('order');
    setActiveGuest(1);
    setLines([]);
    setSearch('');
    setCategory(defaultCategoryId());
  };

  // Deep link from the Floor Plan: /serve?table=T-03
  useEffect(() => {
    if (tables.length === 0 || prefillHandled.current) return;
    const param = new URLSearchParams(window.location.search).get('table');
    if (!param) return;
    const match = tables.find(
      (table) =>
        table.id === param || table.tableNumber.toLowerCase() === param.toLowerCase(),
    );
    if (match) {
      prefillHandled.current = true;
      openTable(match);
    }
  }, [openTable, tables]);

  const categories = useMemo(
    () => [{ id: 'all', name: 'All', displayOrder: 0, itemCount: menu?.items.length ?? 0 }, ...(menu?.categories ?? [])],
    [menu],
  );

  const filteredMenu = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (menu?.items ?? []).filter((item) => {
      const categoryOk = category === 'all' || item.categoryId === category;
      const searchOk =
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.description ?? '').toLowerCase().includes(term) ||
        item.tags.some((tag) => tag.toLowerCase().includes(term));
      return categoryOk && searchOk;
    });
  }, [menu, category, search]);

  const guestLines = useCallback(
    (guest: number) => lines.filter((line) => line.guest === guest),
    [lines],
  );
  const guestSubtotal = useCallback(
    (guest: number) =>
      guestLines(guest).reduce((sum, line) => sum + line.item.price * line.quantity, 0),
    [guestLines],
  );
  const guestCount = (guest: number) =>
    guestLines(guest).reduce((sum, line) => sum + line.quantity, 0);

  const subtotal = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const tax = subtotal * TAX_RATE;
  const gratuityApplies = Boolean(
    selectedTable &&
      (selectedTable.zone.includes('Patio') || covers >= 6 || (selectedTable.currentPartySize ?? 0) >= 6),
  );
  const gratuity = gratuityApplies ? subtotal * GRATUITY_RATE : 0;
  const total = subtotal + tax + gratuity;
  const hasStarters = lines.some((line) => line.course === 'starter');
  const hasMains = lines.some((line) => line.course === 'main');
  const mainsWillHold = hasStarters && hasMains;

  const addItem = (item: MenuItem) => {
    if (item.is86ed || item.stockStatus === 'out') {
      showToast(`${item.name} is 86'd and cannot be ordered.`, 'error');
      return;
    }
    setLines((current) => {
      const existing = current.find(
        (line) => line.item.id === item.id && line.guest === activeGuest,
      );
      if (existing) {
        return current.map((line) =>
          line === existing ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          key: `${item.id}-${activeGuest}-${Date.now()}`,
          guest: activeGuest,
          item,
          quantity: 1,
          course: (item.course as Course) || courseForCategory(item.category, item.name),
        },
      ];
    });
  };

  const adjustLine = (key: string, delta: number) => {
    setLines((current) =>
      current
        .map((line) =>
          line.key === key ? { ...line, quantity: line.quantity + delta } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const startOrder = () => {
    if (!selectedTable) return;
    setStep('order');
    setActiveGuest(1);
    setLines([]);
    setNotes('');
    setSearch('');
    setCategory(defaultCategoryId());
    setCoverOpen(false);
  };

  const nextGuest = () => {
    if (activeGuest < covers) {
      setActiveGuest(activeGuest + 1);
      return;
    }
    setStep('review');
  };

  const sendOrder = async () => {
    if (!selectedTable) return;
    if (lines.length === 0) {
      showToast('Add at least one item before firing.', 'warn');
      return;
    }
    setBusy(true);
    try {
      const roundItems = lines.map((line) => ({
        menuItemId: line.item.id,
        quantity: line.quantity,
        modifiers: [],
        course: line.course,
        seat: String(line.guest),
      }));
      const result = appendOrderId
        ? await api.post<{ order: Order; newly86ed: Array<{ name: string }> }>(
            `/orders/${appendOrderId}/items`,
            {
              items: roundItems,
              allergyNotes: notes.trim() || null,
              sendToKitchen: true,
              autoGratuity: gratuityApplies,
            },
          )
        : await api.post<{ order: Order; newly86ed: Array<{ name: string }> }>(
            '/orders',
            {
              tableId: selectedTable.id,
              serverId: server?.id,
              serverName: server?.name,
              partyName: partyName.trim() || selectedTable.currentPartyName || 'Walk-in',
              partySize: covers,
              items: roundItems,
              allergyNotes: notes.trim() || null,
              sendToKitchen: true,
              autoGratuity: gratuityApplies,
            },
          );
      setSentOrder(result.order);
      setStep('sent');
      playChime('success');
      const addedCount = lines.reduce((sum, line) => sum + line.quantity, 0);
      showToast(
        appendOrderId
          ? `${addedCount} item${addedCount === 1 ? '' : 's'} added to check #${result.order.orderNumber}.`
          : `Order #${result.order.orderNumber} fired for ${selectedTable.tableNumber}.`,
        'success',
      );
      if (result.newly86ed.length > 0) {
        showToast(`${result.newly86ed.length} item(s) auto-86'd after this order.`, 'warn');
      }
      await Promise.all([loadTables(), loadMenu()]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not fire the order.', 'error');
      playChime('blocked');
    } finally {
      setBusy(false);
    }
  };

  const resetToMap = async () => {
    setStep('map');
    setSelectedTable(null);
    setSentOrder(null);
    setLines([]);
    setCoverOpen(false);
    setNotes('');
    setActiveGuest(1);
    setAppendOrderId(null);
    setExistingOrder(null);
    setExistingOpen(false);
    await loadTables();
  };

  const zones = useMemo(
    () => ['all', ...Array.from(new Set(tables.map((table) => table.zone)))],
    [tables],
  );
  const visibleTables = useMemo(
    () =>
      tables
        .filter((table) => zone === 'all' || table.zone === zone)
        .sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true })),
    [tables, zone],
  );

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-space-md p-space-md lg:p-space-lg">
        {step === 'map' && (
          <>
            <header className="flex flex-col gap-space-sm rounded-2xl border border-border-subtle bg-surface-container-low p-space-md shadow-lg lg:flex-row lg:items-center lg:justify-between lg:p-space-lg">
              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-accent-cyan-bright">room_service</span>
                  <span className="font-label-eyebrow text-label-eyebrow uppercase tracking-widest text-secondary">
                    Shift Service
                  </span>
                </div>
                <h1 className="mt-1 font-headline-xl text-headline-xl tracking-tight text-text-primary">
                  Select a Table
                </h1>
                <p className="mt-1 font-body-base text-body-base text-text-secondary">
                  Tap a table, set the covers, then order guest by guest — Guest 1 automatically first.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-space-sm">
                <button
                  onClick={() => void Promise.all([loadTables(), loadMenu()])}
                  className="flex h-11 items-center gap-space-xs rounded-lg bg-surface-container px-space-md font-body-sm font-bold text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
                >
                  <span className="material-symbols-outlined text-body-base">refresh</span>
                  Refresh
                </button>
                <a
                  href="/login"
                  className="flex h-11 items-center gap-space-xs rounded-lg bg-surface-container px-space-md transition-colors hover:bg-surface-container-high"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-purple-glow/20 font-label-badge text-label-badge font-bold text-accent-purple-glow">
                    {initials(server?.name)}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-label-eyebrow text-label-eyebrow uppercase text-text-tertiary">Server</span>
                    <span className="font-body-sm text-body-sm font-bold text-text-primary">
                      {server?.name ?? 'Sign in'}
                    </span>
                  </span>
                </a>
              </div>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <div className="flex flex-wrap items-center gap-space-xs">
                {zones.map((entry) => (
                  <button
                    key={entry}
                    onClick={() => setZone(entry)}
                    className={`h-10 rounded-full px-space-md font-body-sm font-bold transition-colors ${
                      zone === entry
                        ? 'bg-gradient-to-r from-accent-purple-glow to-secondary text-bg-canvas shadow-md'
                        : 'bg-surface-container text-text-secondary hover:bg-surface-container-high hover:text-text-primary'
                    }`}
                  >
                    {entry === 'all' ? 'All zones' : entry}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-space-sm font-body-sm text-body-sm text-text-tertiary">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-status-ready" /> Ready
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-status-urgent" /> In service
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-status-caution" /> Reserved
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-space-sm sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleTables.map((table) => (
                <button
                  key={table.id}
                  data-table-number={table.tableNumber}
                  onClick={() => openTable(table)}
                  className={`group flex min-h-[170px] flex-col justify-between rounded-2xl border p-space-md text-left shadow-md transition-all active:scale-[0.98] ${statusCard[table.status]}`}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-text-primary">
                      {table.tableNumber}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-label-badge text-label-badge font-bold ${statusBadge[table.status]}`}>
                      {statusLabel[table.status]}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-body-sm text-body-sm font-semibold text-text-primary">
                      {table.currentPartyName ?? (table.status === 'available' ? 'Open table' : table.zone)}
                    </span>
                    <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                      {table.zone} · {table.capacity} seats
                    </span>
                  </div>
                  <div className="flex w-full items-end justify-between gap-1">
                    <div className="flex flex-col">
                      <span className="font-mono-metric-sm text-mono-metric-sm text-text-secondary">
                        {table.status === 'available'
                          ? 'Tap to seat'
                          : `${table.currentPartySize ?? table.capacity} covers · ${table.stageShort}${
                              table.seatedMinutes !== null ? ` · ${table.seatedMinutes}m` : ''
                            }`}
                      </span>
                      {table.activeOrder && (
                        <span className="font-label-badge text-label-badge text-accent-cyan-bright">
                          Ticket #{table.activeOrder.orderNumber} · {money(table.activeOrder.total)}
                        </span>
                      )}
                    </div>
                    <span className="material-symbols-outlined text-secondary transition-transform group-hover:translate-x-0.5">
                      arrow_forward
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'order' && selectedTable && (
          <>
            <header className="flex flex-col gap-space-sm rounded-2xl border border-border-subtle bg-surface-container-low p-space-md shadow-lg lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-space-sm">
                <button
                  onClick={() => setStep('map')}
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
                  title="Back to table map"
                >
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div className="flex flex-col">
                  <span className="font-headline-lg text-headline-lg font-bold text-text-primary">
                    {selectedTable.tableNumber} · {covers} covers
                  </span>
                  <span className="font-body-sm text-body-sm text-text-secondary">
                    {partyName || 'Walk-in'} · {selectedTable.zone} · Server {server?.name ?? '—'}
                    {appendOrderId && existingOrder
                      ? ` · round on check #${existingOrder.orderNumber}`
                      : ''}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-space-sm">
                <span className="rounded-full bg-accent-cyan-bright/15 px-space-sm py-1 font-label-badge text-label-badge font-bold text-accent-cyan-bright">
                  ADDING TO GUEST {activeGuest}
                </span>
                {appendOrderId && (
                  <span className="rounded-full bg-status-caution/15 px-space-sm py-1 font-label-badge text-label-badge font-bold text-status-caution">
                    NEW ROUND · CHECK #{existingOrder?.orderNumber ?? ''}
                  </span>
                )}
                <button
                  data-action="review"
                  onClick={() => setStep('review')}
                  className="flex h-11 items-center gap-space-xs rounded-lg bg-surface-container px-space-md font-body-sm font-bold text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
                >
                  <span className="material-symbols-outlined text-body-base">receipt_long</span>
                  Review
                </button>
              </div>
            </header>

            <div className="flex gap-space-xs overflow-x-auto pb-1">
              {Array.from({ length: covers }, (_, index) => index + 1).map((guest) => {
                const active = guest === activeGuest;
                return (
                  <button
                    key={guest}
                    data-guest={guest}
                    onClick={() => setActiveGuest(guest)}
                    className={`flex min-h-[64px] min-w-[130px] flex-col items-start justify-center rounded-xl border px-space-md transition-all ${
                      active
                        ? 'border-accent-cyan-bright bg-accent-cyan-bright/15 shadow-md'
                        : 'border-border-subtle bg-surface-container-low hover:bg-surface-container'
                    }`}
                  >
                    <span
                      className={`font-body-base text-body-base font-bold ${
                        active ? 'text-accent-cyan-bright' : 'text-text-primary'
                      }`}
                    >
                      Guest {guest}
                    </span>
                    <span className="font-mono-metric-sm text-mono-metric-sm text-text-tertiary">
                      {guestCount(guest)} item{guestCount(guest) === 1 ? '' : 's'} ·{' '}
                      {money(guestSubtotal(guest))}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-space-md xl:grid-cols-12">
              <section className="flex flex-col gap-space-sm xl:col-span-8">
                <div className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-surface-container-low p-space-sm shadow-md">
                  <label className="flex h-11 items-center gap-space-xs rounded-lg bg-surface-container px-space-sm">
                    <span className="material-symbols-outlined text-secondary">search</span>
                    <input
                      className="w-full bg-transparent font-body-base text-body-base text-text-primary outline-none placeholder:text-text-subtle"
                      placeholder="Search menu or modifiers..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => setCategory(entry.id)}
                        className={`h-8 whitespace-nowrap rounded-full px-3 font-body-sm text-body-sm font-bold transition-colors ${
                          category === entry.id
                            ? 'bg-accent-cyan-bright text-surface-container-lowest'
                            : 'bg-surface-container text-text-secondary hover:bg-surface-container-high hover:text-text-primary'
                        }`}
                      >
                        {entry.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-space-sm md:grid-cols-3">
                  {filteredMenu.map((item) => {
                    const out = item.is86ed || item.stockStatus === 'out';
                    const course = (item.course as Course) || courseForCategory(item.category, item.name);
                    const inGuest = lines.some(
                      (line) => line.item.id === item.id && line.guest === activeGuest,
                    );
                    return (
                      <button
                        key={item.id}
                        data-item-id={item.id}
                        onClick={() => addItem(item)}
                        disabled={out}
                        className={`relative flex min-h-[150px] flex-col justify-between rounded-xl border p-space-sm text-left shadow-sm transition-all ${
                          out
                            ? 'cursor-not-allowed border-status-urgent/30 bg-surface-container-lowest/60 opacity-60'
                            : inGuest
                              ? 'border-accent-cyan-bright/70 bg-accent-cyan-bright/[0.08] hover:bg-accent-cyan-bright/[0.13] active:scale-[0.98]'
                              : 'border-border-subtle bg-surface-container-low hover:border-secondary/40 hover:bg-surface-container active:scale-[0.98]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className={`font-body-base text-body-base font-bold leading-tight ${out ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                            {item.name}
                          </span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono-metric-sm text-mono-metric-sm font-bold ${out ? 'bg-status-urgent/20 text-status-urgent' : 'bg-accent-lime/15 text-accent-lime'}`}>
                            {out ? "86'D" : money(item.price)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 font-body-sm text-body-sm text-text-tertiary">
                          {item.description}
                        </p>
                        <div className="mt-space-sm flex items-center justify-between gap-1 border-t border-border-subtle pt-1.5">
                          <div className="flex items-center gap-1">
                            <span className={`rounded px-1.5 py-0.5 font-label-badge text-label-badge uppercase font-bold ${
                              out
                                ? 'bg-status-urgent/20 text-status-urgent'
                                : item.stockStatus === 'low'
                                  ? 'bg-status-caution/20 text-status-caution'
                                  : 'bg-status-ready/15 text-status-ready'
                            }`}>
                              {out ? 'Unavailable' : item.stockStatus === 'low' ? `Only ${item.portionsLeft} left` : 'In stock'}
                            </span>
                            <span className="rounded bg-surface-container px-1.5 py-0.5 font-label-badge text-label-badge uppercase text-text-subtle">
                              {COURSE_LABELS[course]}
                            </span>
                          </div>
                          <span className={`material-symbols-outlined text-body-base ${out ? 'text-text-subtle' : inGuest ? 'text-accent-cyan-bright' : 'text-secondary'}`}>
                            {out ? 'do_not_disturb_on' : inGuest ? 'add_circle' : 'add_circle_outline'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <aside className="xl:col-span-4">
                <div className="sticky top-20 flex flex-col gap-space-sm rounded-2xl border border-border-subtle bg-surface-container-low p-space-md shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-accent-cyan-bright">person</span>
                      <span className="font-headline-md text-headline-md font-bold text-text-primary">
                        Guest {activeGuest}
                      </span>
                    </div>
                    <span className="font-mono-metric-sm text-mono-metric-sm text-text-tertiary">
                      {guestCount(activeGuest)} items
                    </span>
                  </div>

                  <div className="flex max-h-[42vh] flex-col gap-space-xs overflow-y-auto pr-1">
                    {guestLines(activeGuest).length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-subtle py-8 text-center">
                        <span className="material-symbols-outlined text-headline-xl text-text-subtle">restaurant_menu</span>
                        <span className="font-body-sm text-body-sm text-text-tertiary">
                          Tap a dish to add it for Guest {activeGuest}.
                        </span>
                      </div>
                    ) : (
                      COURSE_ORDER.map((course) => {
                        const courseLines = guestLines(activeGuest)
                          .filter((line) => line.course === course)
                          .sort((a, b) => a.item.name.localeCompare(b.item.name));
                        if (courseLines.length === 0) return null;
                        return (
                          <div key={course} className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 pt-1">
                              <span className="font-label-badge text-label-badge font-bold uppercase tracking-widest text-text-tertiary">
                                {COURSE_LABELS[course]}
                              </span>
                              <span className="h-px flex-1 bg-border-subtle" />
                              <span className="font-mono-metric-sm text-[10px] tracking-widest text-text-subtle">
                                **************
                              </span>
                            </div>
                            {courseLines.map((line) => (
                              <div
                                key={line.key}
                                className="flex items-center gap-space-sm rounded-lg bg-surface-container p-space-sm"
                              >
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span className="truncate font-body-sm text-body-sm font-bold text-text-primary">
                                    {line.item.name}
                                  </span>
                                  <span className="font-mono-metric-sm text-mono-metric-sm text-text-tertiary">
                                    {money(line.item.price)} each
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => adjustLine(line.key, -1)}
                                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-variant font-bold text-text-primary hover:bg-surface-bright"
                                  >
                                    −
                                  </button>
                                  <span className="w-6 text-center font-mono-metric-md text-mono-metric-md font-bold text-text-primary">
                                    {line.quantity}
                                  </span>
                                  <button
                                    onClick={() => adjustLine(line.key, 1)}
                                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-variant font-bold text-text-primary hover:bg-surface-bright"
                                  >
                                    +
                                  </button>
                                </div>
                                <span className="w-16 text-right font-mono-metric-sm text-mono-metric-sm font-bold text-text-primary">
                                  {money(line.item.price * line.quantity)}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="flex flex-col gap-1 border-t border-border-subtle pt-space-sm font-body-sm text-body-sm text-text-secondary">
                    <div className="flex justify-between">
                      <span>Guest subtotal</span>
                      <span className="font-mono-metric-sm text-mono-metric-sm text-text-primary">
                        {money(guestSubtotal(activeGuest))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax (8%)</span>
                      <span className="font-mono-metric-sm text-mono-metric-sm text-text-primary">
                        {money(guestSubtotal(activeGuest) * TAX_RATE)}
                      </span>
                    </div>
                  </div>

                  <button
                    data-action="next-guest"
                    onClick={nextGuest}
                    className="flex min-h-[56px] w-full items-center justify-center gap-space-xs rounded-xl bg-gradient-to-r from-accent-purple-glow to-secondary px-space-md font-headline-md text-body-base font-bold text-bg-canvas shadow-lg transition-all hover:brightness-110 active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined">
                      {activeGuest < covers ? 'arrow_forward' : 'receipt_long'}
                    </span>
                    {activeGuest < covers
                      ? `Done with Guest ${activeGuest} → Guest ${activeGuest + 1}`
                      : 'Review order'}
                  </button>
                  {activeGuest < covers && (
                    <button
                      onClick={() => setStep('review')}
                      className="w-full text-center font-label-badge text-label-badge uppercase tracking-widest text-text-subtle transition-colors hover:text-text-secondary"
                    >
                      Skip to review
                    </button>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}

        {step === 'review' && selectedTable && (
          <>
            <header className="flex flex-col gap-space-sm rounded-2xl border border-border-subtle bg-surface-container-low p-space-md shadow-lg lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-space-sm">
                <button
                  onClick={() => setStep('order')}
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
                >
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div className="flex flex-col">
                  <span className="font-headline-lg text-headline-lg font-bold text-text-primary">
                    Review · {selectedTable.tableNumber}
                  </span>
                  <span className="font-body-sm text-body-sm text-text-secondary">
                    {covers} guests · {partyName || selectedTable.currentPartyName || 'Walk-in'} · Server {server?.name ?? '—'}
                  </span>
                </div>
              </div>
              <span className="rounded-full bg-status-ready/15 px-space-sm py-1 font-label-badge text-label-badge font-bold text-status-ready">
                READY TO FIRE
              </span>
            </header>

            <div className="grid grid-cols-1 gap-space-md xl:grid-cols-12">
              <section className="flex flex-col gap-space-sm xl:col-span-8">
                {Array.from({ length: covers }, (_, index) => index + 1).map((guest) => (
                  <div
                    key={guest}
                    className="rounded-xl border border-border-subtle bg-surface-container-low p-space-md"
                  >
                    <div className="flex items-center justify-between pb-space-xs">
                      <div className="flex items-center gap-space-xs">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-cyan-bright/15 font-label-badge text-label-badge font-bold text-accent-cyan-bright">
                          {guest}
                        </span>
                        <span className="font-headline-md text-headline-md font-bold text-text-primary">
                          Guest {guest}
                        </span>
                      </div>
                      <div className="flex items-center gap-space-sm">
                        <span className="font-mono-metric-sm text-mono-metric-sm text-text-secondary">
                          {guestCount(guest)} items · {money(guestSubtotal(guest))}
                        </span>
                        <button
                          onClick={() => {
                            setActiveGuest(guest);
                            setStep('order');
                          }}
                          className="rounded bg-surface-container px-2 py-1 font-label-badge text-label-badge font-bold text-text-secondary hover:text-text-primary"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {guestLines(guest).length === 0 ? (
                        <span className="py-2 font-body-sm text-body-sm text-text-tertiary">
                          No items for this guest.
                        </span>
                      ) : (
                        COURSE_ORDER.map((course) => {
                          const courseLines = guestLines(guest)
                            .filter((line) => line.course === course)
                            .sort((a, b) => a.item.name.localeCompare(b.item.name));
                          if (courseLines.length === 0) return null;
                          return (
                            <div key={course} className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 pt-1">
                                <span className="font-label-badge text-label-badge font-bold uppercase tracking-widest text-text-tertiary">
                                  {COURSE_LABELS[course]}
                                </span>
                                <span className="h-px flex-1 bg-border-subtle" />
                                <span className="font-mono-metric-sm text-[10px] tracking-widest text-text-subtle">
                                  **************
                                </span>
                              </div>
                              {courseLines.map((line) => (
                                <div
                                  key={line.key}
                                  className="flex items-center justify-between rounded-lg bg-surface-container px-space-sm py-1.5"
                                >
                                  <span className="font-body-sm text-body-sm text-text-primary">
                                    {line.quantity} × {line.item.name}
                                  </span>
                                  <span className="font-mono-metric-sm text-mono-metric-sm text-text-secondary">
                                    {money(line.item.price * line.quantity)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </section>

              <aside className="flex flex-col gap-space-sm xl:col-span-4">
                <div className="sticky top-20 flex flex-col gap-space-sm rounded-2xl border border-border-subtle bg-surface-container-low p-space-md shadow-xl">
                  <span className="font-headline-md text-headline-md font-bold text-text-primary">
                    Check summary
                  </span>
                  <label className="flex flex-col gap-1">
                    <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                      Allergy & kitchen notes
                    </span>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="e.g. Severe peanut allergy at Guest 2 — separate board"
                      className="min-h-[84px] w-full rounded-lg border border-border-subtle bg-surface-container-lowest p-space-sm font-body-sm text-body-sm text-text-primary outline-none focus:border-status-urgent"
                    />
                  </label>
                  <div className="flex flex-col gap-1 border-t border-border-subtle pt-space-sm font-body-sm text-body-sm text-text-secondary">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-mono-metric-sm text-mono-metric-sm text-text-primary">{money(subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax (8%)</span>
                      <span className="font-mono-metric-sm text-mono-metric-sm text-text-primary">{money(tax)}</span>
                    </div>
                    {gratuity > 0 && (
                      <div className="flex justify-between text-secondary">
                        <span>Auto-gratuity (18%)</span>
                        <span className="font-mono-metric-sm text-mono-metric-sm">{money(gratuity)}</span>
                      </div>
                    )}
                    <div className="mt-1 flex items-baseline justify-between border-t border-border-subtle pt-2">
                      <span className="font-headline-md text-headline-md font-bold uppercase text-text-primary">
                        Total
                      </span>
                      <span className="font-mono-metric-lg text-mono-metric-lg font-extrabold text-accent-cyan-bright">
                        {money(total)}
                      </span>
                    </div>
                  </div>
                  {mainsWillHold && (
                    <div className="rounded-xl border border-status-caution/30 bg-status-caution/10 p-3">
                      <span className="font-label-badge text-label-badge font-bold uppercase text-status-caution">
                        Course hold
                      </span>
                      <p className="mt-0.5 font-body-sm text-body-sm text-text-secondary">
                        Starters fire now. Mains are held on the kitchen screen until
                        the chef clears the starters with <strong>Fire mains</strong>.
                      </p>
                    </div>
                  )}
                  <button
                    data-action="send-order"
                    onClick={() => void sendOrder()}
                    disabled={busy || lines.length === 0}
                    className="flex min-h-[56px] w-full items-center justify-center gap-space-xs rounded-xl bg-gradient-to-r from-status-ready to-emerald-400 px-space-md font-headline-md text-body-base font-bold text-bg-canvas shadow-lg transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined">soup_kitchen</span>
                    {busy ? 'Firing…' : 'Send to Kitchen'}
                  </button>
                  <button
                    onClick={() => setStep('order')}
                    className="w-full text-center font-label-badge text-label-badge uppercase tracking-widest text-text-subtle transition-colors hover:text-text-secondary"
                  >
                    Back to menu
                  </button>
                </div>
              </aside>
            </div>
          </>
        )}

        {step === 'sent' && selectedTable && sentOrder && (
          <div className="flex min-h-[70vh] items-center justify-center">
            <div className="flex w-full max-w-xl flex-col items-center gap-space-md rounded-2xl border border-status-ready/30 bg-surface-container-low p-space-lg text-center shadow-2xl">
              <span className="material-symbols-outlined text-[72px] text-status-ready">check_circle</span>
              <div className="flex flex-col">
                <h2 className="font-headline-xl text-headline-xl font-bold text-text-primary">
                  {appendOrderId ? 'Round added to the check' : 'Order fired to the kitchen'}
                </h2>
                <p className="mt-1 font-body-base text-body-base text-text-secondary">
                  {selectedTable.tableNumber} · check #{sentOrder.orderNumber} · {covers} guests
                </p>
              </div>
              <div className="grid w-full grid-cols-3 gap-space-xs">
                <div className="rounded-lg bg-surface-container p-space-sm">
                  <span className="block font-label-badge text-label-badge uppercase text-text-tertiary">Total</span>
                  <span className="font-mono-metric-md text-mono-metric-md text-text-primary">{money(sentOrder.total)}</span>
                </div>
                <div className="rounded-lg bg-surface-container p-space-sm">
                  <span className="block font-label-badge text-label-badge uppercase text-text-tertiary">Guests</span>
                  <span className="font-mono-metric-md text-mono-metric-md text-text-primary">{covers}</span>
                </div>
                <div className="rounded-lg bg-surface-container p-space-sm">
                  <span className="block font-label-badge text-label-badge uppercase text-text-tertiary">Table</span>
                  <span className="font-mono-metric-md text-mono-metric-md text-text-primary">{selectedTable.tableNumber}</span>
                </div>
              </div>
              <div className="flex w-full flex-col gap-space-sm sm:flex-row">
                <button
                  onClick={() => void resetToMap()}
                  className="flex h-12 flex-1 items-center justify-center gap-space-xs rounded-xl bg-gradient-to-r from-accent-purple-glow to-secondary font-body-base font-bold text-bg-canvas"
                >
                  <span className="material-symbols-outlined">table_restaurant</span>
                  Next table
                </button>
                <button
                  onClick={() => router.push(appendOrderId ? '/pos' : '/kds')}
                  className="flex h-12 flex-1 items-center justify-center gap-space-xs rounded-xl bg-surface-container font-body-base font-bold text-text-primary hover:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined">{appendOrderId ? 'receipt_long' : 'skillet'}</span>
                  {appendOrderId ? 'View check' : 'View KDS'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {coverOpen && selectedTable && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-bg-canvas/80 p-space-md backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl border border-border-subtle bg-surface-container-high p-space-lg shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary">table_restaurant</span>
                  <span className="font-headline-lg text-headline-lg font-bold text-text-primary">
                    {selectedTable.tableNumber}
                  </span>
                </div>
                <span className="mt-0.5 font-body-sm text-body-sm text-text-secondary">
                  {selectedTable.zone} · up to {selectedTable.capacity} covers
                </span>
              </div>
              <button
                onClick={() => setCoverOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container text-text-tertiary hover:text-text-primary"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {selectedTable.activeOrder && (
              <div className="mt-space-md rounded-lg border border-status-caution/30 bg-status-caution/10 p-space-sm">
                <span className="font-label-badge text-label-badge uppercase text-status-caution">
                  Existing ticket #{selectedTable.activeOrder.orderNumber}
                </span>
                <p className="font-body-sm text-body-sm text-text-secondary">
                  This table is already in service. Starting here creates an additional round on a new ticket.
                </p>
              </div>
            )}

            <div className="mt-space-md flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <span className="font-headline-md text-headline-md font-bold text-text-primary">
                  How many covers?
                </span>
                <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-accent-cyan-bright">
                  {covers}
                </span>
              </div>
              <div className="flex items-center gap-space-sm">
                <button
                  onClick={() => setCovers(Math.max(1, covers - 1))}
                  className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-container text-headline-md font-bold text-text-primary hover:bg-surface-bright"
                >
                  −
                </button>
                <div className="grid flex-1 grid-cols-6 gap-1">
                  {Array.from({ length: selectedTable.capacity }, (_, index) => index + 1).map(
                    (count) => (
                      <button
                        key={count}
                        data-cover={count}
                        onClick={() => setCovers(count)}
                        className={`flex h-12 items-center justify-center rounded-lg font-mono-metric-md text-mono-metric-md font-bold transition-colors ${
                          covers === count
                            ? 'bg-accent-cyan-bright text-bg-canvas'
                            : 'bg-surface-container text-text-secondary hover:bg-surface-container-high hover:text-text-primary'
                        }`}
                      >
                        {count}
                      </button>
                    ),
                  )}
                </div>
                <button
                  onClick={() => setCovers(Math.min(selectedTable.capacity, covers + 1))}
                  className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-container text-headline-md font-bold text-text-primary hover:bg-surface-bright"
                >
                  +
                </button>
              </div>
              <label className="flex flex-col gap-1">
                <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                  Party name (optional)
                </span>
                <input
                  value={partyName}
                  onChange={(event) => setPartyName(event.target.value)}
                  placeholder={selectedTable.currentPartyName ?? 'Walk-in'}
                  className="h-12 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-space-md font-body-base text-body-base text-text-primary outline-none focus:border-secondary"
                />
              </label>
            </div>

            <div className="mt-space-md flex gap-space-sm">
              <button
                onClick={() => setCoverOpen(false)}
                className="h-12 flex-1 rounded-lg bg-surface-container font-body-base font-bold text-text-secondary hover:bg-surface-container-high"
              >
                Cancel
              </button>
              <button
                data-action="start-order"
                onClick={startOrder}
                className="flex h-12 flex-[2] items-center justify-center gap-space-xs rounded-lg bg-gradient-to-r from-accent-purple-glow to-secondary font-body-base font-bold text-bg-canvas shadow-lg hover:brightness-110 active:scale-[0.98]"
              >
                <span className="material-symbols-outlined">arrow_forward</span>
                Start Order · Guest 1
              </button>
            </div>
          </div>
        </div>
      )}

      {existingOpen && selectedTable && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-bg-canvas/80 p-space-md backdrop-blur-md">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-space-md overflow-y-auto rounded-2xl border border-border-subtle bg-surface-container-high p-space-lg shadow-2xl">
            <div className="flex items-start justify-between gap-space-sm">
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-status-caution">receipt_long</span>
                  <span className="font-headline-lg text-headline-lg font-bold text-text-primary">
                    {selectedTable.tableNumber} has an open check
                  </span>
                </div>
                <span className="mt-0.5 font-body-sm text-body-sm text-text-secondary">
                  {selectedTable.zone} · {selectedTable.currentPartyName ?? 'Open table'} ·{' '}
                  {selectedTable.currentPartySize ?? 0} covers
                </span>
              </div>
              <button
                onClick={() => setExistingOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container text-text-tertiary hover:text-text-primary"
                aria-label="Close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {loadingCheck ? (
              <div className="flex items-center justify-center gap-2 py-8 font-body-sm text-body-sm text-text-tertiary">
                <span className="material-symbols-outlined animate-spin text-body-base">
                  progress_activity
                </span>
                Loading check…
              </div>
            ) : existingOrder ? (
              <>
                <div className="flex items-center justify-between gap-space-sm rounded-xl border border-status-caution/30 bg-status-caution/10 p-space-sm">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-label-badge text-label-badge uppercase text-status-caution">
                      Check #{existingOrder.orderNumber}
                    </span>
                    <span className="font-body-sm text-body-sm text-text-secondary">
                      {existingOrder.serverName ?? 'Unassigned'} ·{' '}
                      {existingOrder.items.reduce((sum, item) => sum + item.quantity, 0)} items ·
                      opened {timeLabel(existingOrder.createdAt)}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono-metric-lg text-mono-metric-lg font-bold text-text-primary">
                    {money(existingOrder.total)}
                  </span>
                </div>

                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl bg-surface-container-low p-2">
                  {existingOrder.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 px-1 py-0.5 font-body-sm text-body-sm"
                    >
                      <span className="min-w-0 truncate text-text-secondary">
                        {item.quantity}× {item.name}
                        {item.seat ? (
                          <span className="text-text-subtle"> · Guest {item.seat}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-mono-metric-sm text-mono-metric-sm text-text-tertiary">
                        {money(item.unitPrice * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>

                {existingOrder.allergyNotes && (
                  <p className="rounded-lg border border-status-urgent/30 bg-status-urgent/10 px-3 py-2 font-body-sm text-body-sm text-text-primary">
                    <span className="font-bold text-status-urgent">Allergy: </span>
                    {existingOrder.allergyNotes}
                  </p>
                )}

                <p className="font-body-sm text-body-sm text-text-subtle">
                  Add another round to this check — the table keeps one ticket, and the kitchen
                  receives only the new items.
                </p>
              </>
            ) : (
              <p className="py-4 font-body-sm text-body-sm text-text-secondary">
                Could not load this check. Close and tap the table again.
              </p>
            )}

            <div className="flex flex-col gap-space-sm sm:flex-row">
              <button
                onClick={() => setExistingOpen(false)}
                className="h-12 flex-1 rounded-lg bg-surface-container font-body-base font-bold text-text-secondary hover:bg-surface-container-high"
              >
                Cancel
              </button>
              {canPay && existingOrder && (
                <button
                  onClick={() => router.push(`/pay/${existingOrder.id}`)}
                  className="flex h-12 flex-1 items-center justify-center gap-space-xs whitespace-nowrap rounded-lg bg-gradient-to-r from-accent-purple-glow to-secondary font-body-base font-bold text-bg-canvas shadow-lg transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined">payments</span>
                  Pay check
                </button>
              )}
              {canOrder && (
                <button
                  onClick={startAppend}
                  disabled={!existingOrder || loadingCheck}
                  className="flex h-12 flex-[1.4] items-center justify-center gap-space-xs whitespace-nowrap rounded-lg bg-surface-container font-body-base font-bold text-text-primary transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="material-symbols-outlined">add</span>
                  Add items
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
