import { STAGE_SEQUENCE } from '@shift-happens/shared';
import { escapeHtml, money } from '../format';
import { listen } from '../socket';
import type { DiningTable, ReservationResponse } from '../types';
import type { Binder, BinderContext } from './types';
import { qs, qsa } from './types';

const ZONES = ['Main Dining Room', 'Patio & Garden', 'Bar & Lounge', 'Private Dining (PDR)'] as const;
type Zone = (typeof ZONES)[number] | 'all';

const STAGE_INDEX: Record<string, number> = {
  seated: 1,
  starters: 1,
  mains_firing: 2,
  entree: 2,
  dessert: 3,
  check_dropped: 4,
  dirty_bussing: 5,
  ready: 6,
};

const floorPlanBinder: Binder = (ctx: BinderContext) => {
  const { root, api, socket, toast, chime } = ctx;
  let tables: DiningTable[] = [];
  let selected: DiningTable | null = null;
  let zone: Zone = 'Main Dining Room';
  let lastAdvanced: { tableNumber: string; previous: string; next: string; ticket?: string } | null = null;

  const floorArea = qsa(root, 'div').find(
    (element) =>
      (element.className ?? '').includes('select-none') &&
      (element.className ?? '').includes('bg-surface-container-lowest'),
  );
  const zoneButtons = qsa<HTMLButtonElement>(root, 'button').filter((button) =>
    ZONES.some((candidate) => (button.textContent ?? '').includes(candidate)),
  );
  const inspector = qs(root, '#inspector-table-name')?.closest('div.lg\\:col-span-3') as HTMLElement | null;
  const inspectorScope = inspector ?? root;
  const actions = {
    advance: qsa<HTMLButtonElement>(root, 'button').find((button) =>
      (button.textContent ?? '').includes('Advance to Next Stage'),
    ),
    print: qsa<HTMLButtonElement>(root, 'button').find((button) =>
      (button.textContent ?? '').includes('Print & Drop Check'),
    ),
    bus: qsa<HTMLButtonElement>(root, 'button').find((button) =>
      (button.textContent ?? '').includes('Mark Bussed'),
    ),
    complete: qsa<HTMLButtonElement>(root, 'button').find((button) =>
      (button.textContent ?? '').includes('Complete & Close Check'),
    ),
    seat: qsa<HTMLButtonElement>(root, 'button').find((button) =>
      (button.textContent ?? '').includes('Seat Walk-in'),
    ),
    simulate: qsa<HTMLButtonElement>(root, 'button').find((button) =>
      (button.textContent ?? '').includes('Simulate KDS Mains Bump'),
    ),
  };
  const kpiValue = (label: string): HTMLElement | null => {
    const labelEl = qsa<HTMLElement>(root, 'span').find(
      (span) => (span.textContent ?? '').trim() === label,
    );
    return (
      (labelEl?.parentElement?.querySelector('.font-mono-metric-md') as HTMLElement | null) ??
      null
    );
  };
  const activeCapacityValue = kpiValue('Active Capacity');
  const seatedGuestsValue = kpiValue('Seated Guests');
  const waitlistValue = kpiValue('Waitlist');
  const avgTurnValue = kpiValue('Avg Turn');
  const queueTitle = qsa<HTMLElement>(root, 'span').find((span) =>
    (span.textContent ?? '').trim() === 'Floor Queue',
  );
  const queueCard = queueTitle?.closest('div.rounded-xl') as HTMLElement | null;
  let queueFilter: 'all' | 'seated' | 'arrived' | 'overstay' | 'reset' = 'all';
  const stageCounter = qsa<HTMLElement>(root, 'span').find((span) =>
    /Stage \d of 6/.test((span.textContent ?? '').trim()),
  );
  const stageProgression = stageCounter?.closest('div')?.parentElement ?? null;
  const stageButtonsHost = stageProgression?.querySelector('div.grid.grid-cols-6') ?? stageProgression;

  function statusStyles(status: DiningTable['status']) {
    switch (status) {
      case 'available':
        return 'bg-status-ready/12 border-status-ready/60 text-status-ready hover:bg-status-ready/20';
      case 'reserved':
        return 'bg-status-caution/15 border-status-caution/60 text-status-caution hover:bg-status-caution/25';
      case 'dirty':
        return 'bg-text-muted/15 border-text-muted/50 text-text-tertiary hover:bg-text-muted/25';
      default:
        return 'bg-status-urgent/18 border-status-urgent/60 text-white hover:bg-status-urgent/28';
    }
  }

  function positionStyle(table: DiningTable) {
    const left = Math.min(92, Math.max(2, (table.posX / 980) * 100));
    const top = Math.min(90, Math.max(2, (table.posY / 1000) * 100));
    const rotation = table.rotation ? `rotate(${table.rotation}deg)` : '';
    const shape =
      table.shape === 'circle'
        ? 'w-[72px] h-[72px] rounded-full'
        : table.shape === 'rectangle'
          ? 'w-[104px] h-[58px] rounded-xl'
          : table.shape === 'booth'
            ? 'w-[92px] h-[64px] rounded-2xl'
            : 'w-[78px] h-[66px] rounded-xl';
    return `left:${left}%;top:${top}%;transform:${rotation};${''}${shape ? '' : ''}`;
  }

  function render() {
    if (!floorArea) return;
    floorArea.classList.add('sh-floor-grid');
    floorArea.style.position = 'relative';
    floorArea.style.minHeight = '760px';
    floorArea.style.overflow = 'hidden';
    const visible = tables.filter((table) => zone === 'all' || table.zone === zone);
    const nodes = visible
      .map((table) => {
        const size =
          table.shape === 'circle'
            ? 'w-[72px] h-[72px] rounded-full'
            : table.shape === 'rectangle'
              ? 'w-[104px] h-[58px] rounded-xl'
              : table.shape === 'booth'
                ? 'w-[92px] h-[64px] rounded-2xl'
                : 'w-[78px] h-[66px] rounded-xl';
        const state = table.isActive ? table.status : 'dirty';
        const left = Math.min(92, Math.max(2, (table.posX / 980) * 100)).toFixed(2);
        const top = Math.min(90, Math.max(2, (table.posY / 1000) * 100)).toFixed(2);
        return `<button data-table-id="${table.id}" class="sh-floor-node ${size} border ${statusStyles(
          state,
        )} p-1 flex flex-col items-center justify-center gap-0.5 shadow-md ${
          selected?.id === table.id ? 'sh-floor-node--selected' : ''
        }" style="left:${left}%;top:${top}%;transform:rotate(${table.rotation}deg)">
          <div class="flex items-center justify-between w-full px-1 gap-1">
            <span class="font-mono-metric-sm text-[10px] font-bold">${escapeHtml(table.tableNumber)}</span>
            <span class="font-mono-metric-sm text-[9px] opacity-80">${table.currentPartySize ?? table.capacity}p</span>
          </div>
          <span class="font-label-badge text-[8px] uppercase tracking-wide font-bold text-center leading-tight line-clamp-2">${
            state === 'available'
              ? 'Ready'
              : state === 'dirty'
                ? 'Bus'
                : escapeHtml(table.stageShort)
          }</span>
          ${
            table.seatedMinutes !== null && state === 'occupied'
              ? `<span class="font-mono-metric-sm text-[8px] opacity-90">${table.seatedMinutes}m</span>`
              : ''
          }
        </button>`;
      })
      .join('');

    floorArea.innerHTML = `
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute left-[4%] top-[3%] flex items-center gap-2 text-text-muted">
          <span class="material-symbols-outlined text-body-base">wc</span>
          <span class="font-label-badge text-label-badge uppercase">Restrooms</span>
        </div>
        <div class="absolute right-[5%] top-[3%] flex items-center gap-2 text-text-muted">
          <span class="material-symbols-outlined text-body-base">wine_bar</span>
          <span class="font-label-badge text-label-badge uppercase">Wine Reserve · 18.5°C</span>
        </div>
        <div class="absolute left-[42%] bottom-[3%] flex items-center gap-2 text-secondary">
          <span class="material-symbols-outlined text-body-base">local_bar</span>
          <span class="font-label-badge text-label-badge uppercase">${escapeHtml(zone === 'all' ? 'Full Floor' : zone)} · Live</span>
        </div>
        <div class="absolute right-[5%] bottom-[3%] flex items-center gap-2 text-text-muted">
          <span class="material-symbols-outlined text-body-base">computer</span>
          <span class="font-label-badge text-label-badge uppercase">POS & Pantry</span>
        </div>
      </div>
      ${nodes || `<div class="absolute inset-0 flex items-center justify-center text-text-muted font-body-base">No tables in this zone.</div>`}
    `;

    qsa<HTMLButtonElement>(floorArea, '[data-table-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const table = tables.find((entry) => entry.id === button.dataset.tableId);
        if (table) selectTable(table);
      });
    });
    styleZoneButtons();
    updateMetrics();
    renderQueue();
  }

  function renderQueue() {
    if (!queueCard) return;
    const active = tables.filter((table) => table.status !== 'available');
    const counts = {
      all: active.length,
      seated: active.filter((table) => table.status === 'occupied' || table.currentStage === 'seated').length,
      arrived: active.filter((table) => ['seated', 'starters'].includes(table.currentStage)).length,
      overstay: active.filter(
        (table) => table.currentStage === 'check_dropped' && (table.seatedMinutes ?? 0) > 45,
      ).length,
      reset: active.filter((table) => table.status === 'dirty').length,
    };
    const visible = active.filter((table) => {
      if (queueFilter === 'seated') return table.status === 'occupied' || table.currentStage === 'seated';
      if (queueFilter === 'arrived') return ['seated', 'starters'].includes(table.currentStage);
      if (queueFilter === 'overstay')
        return table.currentStage === 'check_dropped' && (table.seatedMinutes ?? 0) > 45;
      if (queueFilter === 'reset') return table.status === 'dirty';
      return true;
    });
    const filters: Array<{ key: typeof queueFilter; label: string; tone: string }> = [
      { key: 'all', label: 'All', tone: 'text-text-secondary' },
      { key: 'seated', label: 'Seated', tone: 'text-status-ready' },
      { key: 'arrived', label: 'Arrived', tone: 'text-secondary' },
      { key: 'overstay', label: 'Overstay', tone: 'text-status-urgent' },
      { key: 'reset', label: 'Reset', tone: 'text-text-tertiary' },
    ];
    queueCard.innerHTML = `<div class="flex items-center justify-between">
      <div class="flex items-center gap-space-xs">
        <span class="material-symbols-outlined text-secondary">groups_3</span>
        <span class="font-headline-md text-headline-md text-text-primary">Floor Queue</span>
      </div>
      <span class="font-label-badge text-label-badge bg-primary/20 text-primary px-space-xs py-0.5 rounded-full">${active.length} ACTIVE</span>
    </div>
    <div class="flex flex-wrap gap-1 mt-space-xs">
      ${filters
        .map(
          (filter) => `<button data-queue-filter="${filter.key}" class="px-2 py-1 rounded font-label-badge text-label-badge ${
            queueFilter === filter.key
              ? 'bg-surface-container-highest text-text-primary font-bold'
              : `${filter.tone} hover:text-text-primary`
          }">${filter.label} (${counts[filter.key]})</button>`,
        )
        .join('')}
    </div>
    <div class="flex flex-col gap-space-xs mt-space-xs max-h-[680px] overflow-y-auto pr-1">
      ${
        visible
          .sort((a, b) => (b.seatedMinutes ?? 0) - (a.seatedMinutes ?? 0))
          .map((table) => {
            const badge =
              table.status === 'dirty'
                ? 'bg-text-muted/20 text-text-tertiary'
                : table.currentStage === 'check_dropped'
                  ? 'bg-status-caution/20 text-status-caution'
                  : table.status === 'occupied'
                    ? 'bg-status-ready/20 text-status-ready'
                    : 'bg-secondary/20 text-secondary';
            return `<div data-queue-table="${table.id}" class="p-space-sm rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer flex flex-col gap-1">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1 min-w-0">
                  <span class="font-body-base text-body-base font-bold text-text-primary truncate">${escapeHtml(
                    table.currentPartyName ?? table.tableNumber,
                  )}</span>
                  ${table.isActive ? '' : '<span class="material-symbols-outlined text-status-urgent text-body-sm">warning</span>'}
                </div>
                <span class="font-label-badge text-label-badge ${badge} px-1.5 py-0.5 rounded uppercase shrink-0">${escapeHtml(
                  table.stageShort,
                )}${table.seatedMinutes !== null ? ` (${table.seatedMinutes}m)` : ''}</span>
              </div>
              <div class="flex items-center justify-between font-label-badge text-label-badge text-text-tertiary">
                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-body-sm text-secondary">table_restaurant</span>${escapeHtml(
                  table.tableNumber,
                )} · ${escapeHtml(table.zone.split(' & ')[0])} · ${table.currentPartySize ?? table.capacity}p</span>
                <span>${escapeHtml(table.serverName ?? 'Unassigned')}</span>
              </div>
              ${
                table.activeOrder
                  ? `<div class="flex items-center justify-between font-mono-metric-sm text-mono-metric-sm text-text-muted">
                      <span>POS #${table.activeOrder.orderNumber} · ${table.activeOrder.itemCount} items</span>
                      <span class="text-text-secondary">${money(table.activeOrder.total)}</span>
                    </div>`
                  : ''
              }
            </div>`;
          })
          .join('') ||
        '<div class="p-4 text-center text-text-muted font-body-base">Queue is clear.</div>'
      }
    </div>`;
    qsa<HTMLButtonElement>(queueCard, '[data-queue-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        queueFilter = (button.dataset.queueFilter as typeof queueFilter) ?? 'all';
        renderQueue();
      });
    });
    qsa<HTMLElement>(queueCard, '[data-queue-table]').forEach((element) => {
      element.addEventListener('click', () => {
        const table = tables.find((entry) => entry.id === element.dataset.queueTable);
        if (table) selectTable(table);
      });
    });
  }

  function styleZoneButtons() {
    const activeClass =
      'px-space-md py-space-xs rounded-lg bg-gradient-to-r from-primary-container to-secondary-container text-text-primary font-headline-md text-body-sm shadow-sm flex items-center gap-space-xs';
    const idleClass =
      'px-space-md py-space-xs rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-container transition-colors font-body-base text-body-sm flex items-center gap-space-xs';
    for (const button of zoneButtons) {
      const text = button.textContent ?? '';
      const match = ZONES.find((candidate) => text.includes(candidate));
      if (!match) continue;
      button.dataset.zone = match;
      button.className = zone === match ? activeClass : idleClass;
      const count = tables.filter((table) => table.zone === match).length;
      const spans = qsa<HTMLElement>(button, 'span');
      const badge = spans[spans.length - 1];
      if (badge && /^\d+$/.test((badge.textContent ?? '').trim())) badge.textContent = String(count);
    }
  }

  function selectTable(table: DiningTable) {
    selected = table;
    render();
    updateInspector();
  }

  function updateInspector() {
    if (!selected) return;
    const set = (id: string, value: string) => {
      const element = qs(root, `#${id}`);
      if (element) element.textContent = value;
    };
    set('inspector-table-name', `${selected.tableNumber} · ${selected.zone.replace(' & ', ' ')}`);
    set('inspector-stage-tag', selected.stageLabel.toUpperCase());
    set(
      'inspector-stage-timer',
      `${selected.stageShort} active ${selected.seatedMinutes ?? 0}m ago`,
    );
    set('inspector-guest-name', selected.currentPartyName ?? 'Open table');
    set('inspector-party-size', `${selected.currentPartySize ?? selected.capacity} Guests`);
    set('inspector-server-name', selected.serverName ?? 'Unassigned');
    set('inspector-check-val', money(selected.activeOrder?.total ?? 0));
    if (actions.advance) {
      const index = STAGE_INDEX[selected.currentStage] ?? 1;
      const next = STAGE_SEQUENCE[Math.min(STAGE_SEQUENCE.length - 1, STAGE_SEQUENCE.indexOf(selected.currentStage as never) + 1)];
      const nextLabel =
        next === 'entree'
          ? 'Entrée'
          : next === 'mains_firing'
            ? 'Mains'
            : next === 'check_dropped'
              ? 'Billed'
              : next === 'dirty_bussing'
                ? 'Bus'
                : next.charAt(0).toUpperCase() + next.slice(1);
      actions.advance.innerHTML = `<span class="material-symbols-outlined text-headline-md">skip_next</span><span>Advance to Next Stage: ${escapeHtml(
        nextLabel,
      )}</span>`;
      void index;
    }
    if (stageProgression) {
      const index = STAGE_INDEX[selected.currentStage] ?? 1;
      const label = qsa(stageProgression, 'span').find((span) =>
        (span.textContent ?? '').includes('Stage'),
      );
      if (label) label.textContent = `Stage ${index} of 6`;
      const buttons = qsa<HTMLButtonElement>(stageButtonsHost ?? stageProgression, 'button').slice(0, 6);
      buttons.forEach((button, buttonIndex) => {
        const active = buttonIndex === index - 1;
        button.className = active
          ? 'py-1.5 px-0.5 rounded-lg bg-secondary text-bg-canvas font-label-badge text-[9px] font-bold flex flex-col items-center justify-center gap-0.5 transition-all'
          : 'py-1.5 px-0.5 rounded-lg bg-surface-container text-text-secondary hover:text-text-primary hover:bg-surface-container-high font-label-badge text-[9px] font-bold flex flex-col items-center justify-center gap-0.5 transition-all';
      });
    }
  }

  function updateMetrics() {
    const occupied = tables.filter((table) => table.status === 'occupied');
    const seatedCapacity = occupied.reduce((sum, table) => sum + table.capacity, 0);
    const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);
    if (activeCapacityValue) activeCapacityValue.textContent = String(seatedCapacity);
    const capacityTarget = activeCapacityValue?.nextElementSibling;
    if (capacityTarget) capacityTarget.textContent = `/ ${totalCapacity}`;
    if (seatedGuestsValue) {
      seatedGuestsValue.textContent = String(
        occupied.reduce((sum, table) => sum + (table.currentPartySize ?? 0), 0),
      );
    }
    if (avgTurnValue) {
      const avg = occupied.length
        ? Math.round(
            occupied.reduce((sum, table) => sum + (table.seatedMinutes ?? 0), 0) /
              occupied.length,
          )
        : 0;
      avgTurnValue.innerHTML = `${avg}<span class="text-body-sm font-normal text-text-secondary">m</span>`;
    }
    void api
      .get<ReservationResponse>('/reservations')
      .then((response) => {
        if (waitlistValue) waitlistValue.textContent = String(response.stats.waitlist);
      })
      .catch(() => undefined);
  }

  async function load(selectId?: string) {
    try {
      tables = await api.get<DiningTable[]>('/tables');
      if (selectId) selected = tables.find((table) => table.id === selectId) ?? selected;
      if (!selected) {
        selected =
          tables.find((table) => table.tableNumber === 'T-03') ??
          tables.find((table) => table.status === 'occupied') ??
          tables[0] ??
          null;
      } else {
        selected = tables.find((table) => table.id === selected?.id) ?? selected;
      }
      render();
      updateInspector();
    } catch (error) {
      console.error(error);
      toast('Floor plan feed unavailable.', 'error');
    }
  }

  async function setStage(tableId: string, stage: string, reason: string) {
    try {
      await api.patch(`/tables/${tableId}/stage`, { stage, reason });
      toast(`${selected?.tableNumber ?? 'Table'} → ${stage.replace('_', ' ')}.`, 'success');
      chime('success');
      await load(tableId);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Stage update failed.', 'error');
    }
  }

  zoneButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const text = button.textContent ?? '';
      const match = ZONES.find((candidate) => text.includes(candidate));
      if (!match) return;
      zone = match;
      render();
    });
  });

  actions.advance?.addEventListener('click', () => {
    if (!selected) return;
    void api
      .post<{ stage: string }>(`/tables/${selected.id}/advance`)
      .then((result) => {
        toast(`${selected?.tableNumber ?? 'Table'} advanced to ${result.stage.replace('_', ' ')}.`, 'success');
        chime('success');
        return load(selected?.id);
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Advance failed.', 'error'));
  });
  actions.print?.addEventListener('click', () => {
    if (!selected) return;
    void setStage(selected.id, 'check_dropped', 'CHECK_DROPPED');
  });
  actions.bus?.addEventListener('click', () => {
    if (!selected) return;
    void api
      .post(`/tables/${selected.id}/reset`)
      .then(() => {
        toast(`${selected?.tableNumber ?? 'Table'} bussed and reset to ready.`, 'success');
        return load(selected?.id);
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Reset failed.', 'error'));
  });
  actions.complete?.addEventListener('click', () => {
    if (!selected) return;
    void api
      .post(`/tables/${selected.id}/reset`)
      .then(() => {
        toast(`Check closed · ${selected?.tableNumber ?? 'Table'} released.`, 'success');
        chime('success');
        return load(selected?.id);
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Close failed.', 'error'));
  });
  actions.seat?.addEventListener('click', () => {
    const available = selected?.status === 'available' ? selected : tables.find((table) => table.status === 'available');
    if (!available) {
      toast('No open tables available for a walk-in.', 'warn');
      return;
    }
    const partyName = window.prompt('Walk-in party name', 'Walk-in Guest');
    if (!partyName) return;
    const partySize = Number(window.prompt('Party size', '2') ?? '2');
    void api
      .post(`/tables/${available.id}/seat`, {
        partyName,
        partySize: Number.isFinite(partySize) ? Math.max(1, partySize) : 2,
        stage: 'seated',
      })
      .then(() => {
        toast(`${partyName} seated at ${available.tableNumber}.`, 'success');
        return load(available.id);
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Could not seat the party.', 'error'));
  });
  actions.simulate?.addEventListener('click', () => {
    if (!selected) {
      toast('Select a table first.', 'warn');
      return;
    }
    void api
      .post(`/kds/simulate/${selected.id}`)
      .then((result) => {
        const response = result as { tableAdvanced?: boolean; nextStage?: string };
        if (response.tableAdvanced) {
          toast(`Simulated mains bump → ${selected?.tableNumber ?? 'table'} advanced to Entrée.`, 'success');
          chime('success');
        } else {
          toast('Mains bump simulated. Table did not advance (check stage).', 'info');
        }
        return load(selected?.id);
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Simulation failed.', 'error'));
  });

  const offs = [
    listen('TABLE_STAGE_ADVANCED', (payload: { table_number: string; previous_stage: string; new_stage: string; triggered_by: string; ticket_id?: string }) => {
      lastAdvanced = {
        tableNumber: payload.table_number,
        previous: payload.previous_stage,
        next: payload.new_stage,
        ticket: payload.ticket_id,
      };
      const trigger = payload.triggered_by?.includes('KDS') ? 'KDS mains bump' : payload.triggered_by;
      toast(
        `${payload.table_number} · ${payload.previous_stage.replace('_', ' ')} → ${payload.new_stage.replace('_', ' ')} (${trigger}).`,
        'success',
      );
      if (payload.triggered_by?.includes('KDS')) chime('success');
      void load();
    }),
    listen('TABLE_UPDATED', () => void load()),
    listen('RESERVATION_CREATED', () => void load()),
  ];

  const interval = window.setInterval(() => void load(), 45_000);
  void load();

  return () => {
    window.clearInterval(interval);
    for (const off of offs) {
      try {
        off();
      } catch {
        /* noop */
      }
    }
  };
};

export default floorPlanBinder;
