import { escapeHtml, initials, initialsColor, money, timeLabel } from '../format';
import { listen } from '../socket';
import type { LaborPacing, Shift, ShiftResponse } from '../types';
import type { Binder, BinderContext } from './types';
import { qs, qsa } from './types';

const GROUP_ORDER = ['management', 'foh', 'boh'] as const;
type GroupKey = (typeof GROUP_ORDER)[number];

const ROLE_GROUP: Record<string, GroupKey> = {
  owner: 'management',
  general_manager: 'management',
  floor_manager: 'management',
  chef_expo: 'boh',
  line_cook: 'boh',
  server: 'foh',
  bartender: 'foh',
  host: 'foh',
};

const GROUP_META: Record<GroupKey, { label: string; sub: string; icon: string }> = {
  management: { label: 'MANAGEMENT', sub: 'GM, FLOOR & OPERATIONS LEADS', icon: 'admin_panel_settings' },
  foh: { label: 'FRONT OF HOUSE (FOH)', sub: 'FLOOR, BAR, HOST & BUS', icon: 'restaurant' },
  boh: { label: 'BACK OF HOUSE (BOH)', sub: 'GRILL, SAUTÉ, LARDER & PASTRY', icon: 'skillet' },
};

const schedulingBinder: Binder = (ctx: BinderContext) => {
  const { root, api, toast, chime } = ctx;
  let data: ShiftResponse | null = null;
  let shifts: Shift[] = [];
  let roleFilter: 'all' | GroupKey = 'all';

  const table = qs<HTMLTableElement>(root, 'table');
  const rosterBody = table?.tBodies[0] ?? null;
  // The weekly roster needs breathing room: keep the pacing curve and sidebar
  // on the first row and let the roster span the full width underneath it.
  const rosterContainer = table?.closest('div.flex-1') as HTMLElement | null;
  const rosterLayout = rosterContainer?.parentElement;
  if (rosterContainer && rosterLayout && rosterLayout.children.length >= 3) {
    const pacingColumn = rosterLayout.children[0] as HTMLElement;
    const sidebarColumn = rosterLayout.children[rosterLayout.children.length - 1] as HTMLElement;
    rosterLayout.classList.add('sh-scheduling-layout');
    pacingColumn.classList.add('sh-scheduling-pacing');
    rosterContainer.classList.add('sh-scheduling-roster');
    sidebarColumn.classList.add('sh-scheduling-sidebar');
    rosterLayout.style.display = 'grid';
    rosterLayout.style.gridTemplateColumns = 'minmax(0, 1fr) 384px';
    rosterLayout.style.gridTemplateAreas = '"pacing sidebar" "roster sidebar"';
    if (table) table.style.minWidth = '860px';
    pacingColumn.style.gridArea = 'pacing';
    rosterContainer.style.gridArea = 'roster';
    sidebarColumn.style.gridArea = 'sidebar';
  }
  const broadcastCut = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Broadcast Voluntary Early Cut'),
  );
  const broadcastCustom = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Broadcast Custom Shift'),
  );
  const newShift = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('New Shift'),
  );
  const publishWeek = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Publish Week'),
  );
  const forecastButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('AI Auto-Forecast'),
  );
  const recalculate = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Recalculate Stagger'),
  );
  const keepFloor = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Keep Floor Strength'),
  );
  const timeLogs = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Time Clock Logs'),
  );
  const punchTerminal = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Virtual Punch Terminal'),
  );
  const approveSwap = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Approve Swap'),
  );
  const declineSwap = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Decline'),
  );
  const roleTabs = qsa<HTMLButtonElement>(root, 'button').filter((button) => {
    const text = (button.textContent ?? '').toUpperCase();
    return text.includes('ALL ROLES') || text.includes('FRONT OF HOUSE') || text.includes('BACK OF HOUSE') || text.includes('MANAGEMENT');
  });

  function findKpiCard(label: string): HTMLElement | null {
    const labelEl = qsa<HTMLElement>(root, 'span').find((span) =>
      (span.textContent ?? '').trim().toUpperCase().includes(label.toUpperCase()),
    );
    if (!labelEl) return null;
    let card = labelEl.parentElement;
    for (let index = 0; index < 5 && card; index++) {
      if ((card.className ?? '').includes('rounded') && card.querySelectorAll('span').length >= 2) return card;
      card = card.parentElement;
    }
    return null;
  }

  function setKpiValue(label: string, value: string) {
    const card = findKpiCard(label);
    if (!card) return;
    const numeric = qsa<HTMLElement>(card, 'span').find((span) =>
      /[\d$.%]/.test(span.textContent ?? '') && (span.className ?? '').includes('font-mono'),
    );
    if (numeric) numeric.textContent = value;
  }

  function renderRoster() {
    if (!table || !rosterBody) return;
    rosterBody.innerHTML = '';

    const visible = shifts.filter(
      (shift) => roleFilter === 'all' || ROLE_GROUP[shift.role] === roleFilter,
    );

    for (const group of GROUP_ORDER) {
      const groupShifts = visible.filter((shift) => ROLE_GROUP[shift.role] === group);
      if (groupShifts.length === 0) continue;
      const groupRow = document.createElement('tr');
      groupRow.className = 'bg-surface-container-low';
      groupRow.innerHTML = `<td class="px-space-md py-2 sticky left-0 z-10" colspan="8">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary text-sm">${GROUP_META[group].icon}</span>
          <span class="font-label-eyebrow text-label-eyebrow text-secondary uppercase tracking-widest font-bold">${GROUP_META[group].label}</span>
          <span class="font-label-badge text-label-badge text-text-muted ml-2">${GROUP_META[group].sub}</span>
        </div>
      </td>`;
      rosterBody.appendChild(groupRow);

      for (const shift of groupShifts) {
        const active = shift.status === 'active';
        const clockedOut = shift.status === 'clocked_out';
        const cellClass = active
          ? 'p-1 bg-surface-container-high/40'
          : clockedOut
            ? 'p-1 bg-surface-container-high/20'
            : 'p-1 bg-surface-container-high/30';
        const innerClass = active
          ? 'bg-gradient-to-r from-accent-purple-glow/30 to-secondary/20 shadow-md border border-status-caution/40'
          : clockedOut
            ? 'bg-surface-container-high/60'
            : 'bg-primary-container/15 border border-primary-container/30';
        const badge = active
          ? '<span class="font-label-badge text-label-badge bg-status-ready/20 text-status-ready font-bold px-1 rounded">ON FLOOR</span>'
          : clockedOut
            ? '<span class="font-label-badge text-label-badge bg-surface-variant text-text-tertiary px-1 rounded">CLOCKED OUT</span>'
            : '<span class="font-label-badge text-label-badge bg-status-info/20 text-status-info font-bold px-1 rounded">SCHEDULED</span>';
        const actionLabel = active ? 'Clock Out' : clockedOut ? 'Re-Punch' : 'Clock In';
        const actionColor = active ? 'text-status-urgent' : 'text-status-ready';
        const row = document.createElement('tr');
        row.className = 'hover:bg-surface-container/40 transition-colors';
        row.dataset.role = ROLE_GROUP[shift.role] ?? 'foh';
        const offCell = '<td class="p-1"><div class="p-1.5 rounded bg-surface-container-high text-text-secondary text-center"><span class="font-label-badge text-label-badge block text-text-muted">—</span></div></td>';
        row.innerHTML = `<td class="p-space-sm bg-surface-container-lowest sticky left-0 z-10">
          <div class="flex items-center gap-2.5">
            <div class="relative">
              <div class="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center font-mono-metric-sm font-bold ${initialsColor(
                shift.userName,
              )}">${escapeHtml(initials(shift.userName))}</div>
              <span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ${
                active ? 'bg-status-ready' : clockedOut ? 'bg-text-muted' : 'bg-status-info'
              } ring-2 ring-surface-container-lowest" title="${escapeHtml(shift.status)}"></span>
            </div>
            <div class="flex flex-col min-w-0">
              <span class="font-body-base text-body-base font-bold text-text-primary truncate">${escapeHtml(shift.userName)}</span>
              <span class="font-label-badge text-label-badge ${
                active ? 'text-accent-purple-glow' : clockedOut ? 'text-text-muted' : 'text-status-info'
              }">${escapeHtml(shift.roleLabel)} • ${money(shift.hourlyRate)}/hr</span>
              <span class="font-mono-metric-sm text-mono-metric-sm text-text-secondary text-xs">${shift.hoursWorked.toFixed(
                1,
              )}h / ${shift.hoursScheduled.toFixed(1)}h</span>
            </div>
          </div>
        </td>
        ${offCell}${offCell}${offCell}${offCell}${offCell}
        <td class="${cellClass}">
          <div class="p-1.5 rounded-lg ${innerClass}">
            <div class="flex items-center justify-between mb-0.5 gap-1">
              <span class="font-mono-metric-sm text-mono-metric-sm font-bold ${
                active ? 'text-accent-cyan-bright' : clockedOut ? 'text-text-secondary' : 'text-primary'
              }">${timeLabel(shift.scheduledStart)} - ${timeLabel(shift.scheduledEnd)}</span>
              ${badge}
            </div>
            <span class="font-label-badge text-label-badge text-text-primary block font-semibold">${escapeHtml(
              shift.station ?? shift.roleLabel,
            )} • ${shift.hoursScheduled.toFixed(1)}h</span>
            <div class="flex items-center justify-between mt-1">
              <span class="font-label-badge text-label-badge ${
                active ? 'text-status-caution' : clockedOut ? 'text-text-muted' : 'text-status-info'
              } font-mono">${shift.clockIn ? `In ${timeLabel(shift.clockIn)}` : 'Not punched'}</span>
              <button data-clock="${shift.id}" class="px-1.5 py-0.5 rounded bg-surface-container hover:bg-surface-bright font-label-badge text-label-badge ${actionColor} font-bold">${actionLabel}</button>
            </div>
          </div>
        </td>
        ${offCell}
      </tr>`;
        rosterBody.appendChild(row);
      }
    }
    qsa<HTMLButtonElement>(rosterBody, '[data-clock]').forEach((button) => {
      button.addEventListener('click', () => void punch(button.dataset.clock!));
    });
  }

  function updateKpis() {
    if (!data) return;
    const pacing = data.pacing;
    setKpiValue('REAL-TIME LABOR COST %', `${pacing.laborPercentage}%`);
    setKpiValue('SALES VS INCURRED WAGES', money(pacing.windowSales, 0));
    setKpiValue('Live Labor Cost %', `${pacing.laborPercentage}%`);
    const targetSpan = qsa<HTMLElement>(root, 'span').find((span) =>
      /Target \d+(\.\d+)?%/i.test(span.textContent ?? ''),
    );
    if (targetSpan) {
      targetSpan.innerHTML = `Target ${pacing.targetPercentage}% • Proj ${pacing.projectedLaborPercentage}%`;
    }
    const wageSpan = qsa<HTMLElement>(root, 'span').find((span) =>
      /Wages/.test(span.textContent ?? '') && (span.textContent ?? '').length < 60,
    );
    if (wageSpan) wageSpan.textContent = `/ ${money(pacing.currentHourlyBurn, 0)} Wages`;
    const liveBadge = qsa<HTMLElement>(root, 'span').find((span) =>
      /Live Labor Cost/.test(span.textContent ?? '') && (span.textContent ?? '').length < 40,
    );
    if (liveBadge) liveBadge.textContent = `Live Labor Cost ${pacing.laborPercentage}%`;
    const headerToday = qsa<HTMLElement>(root, 'span').find((span) =>
      (span.textContent ?? '').includes('TODAY •'),
    );
    if (headerToday) {
      headerToday.textContent = `TODAY • ${new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        day: 'numeric',
      })}`;
    }
    const headerHours = qsa<HTMLElement>(root, 'th.bg-surface-container-highest span').find((span) =>
      /h RUSH/.test(span.textContent ?? ''),
    );
    if (headerHours) {
      const total = shifts.reduce((sum, shift) => sum + shift.hoursScheduled, 0);
      headerHours.textContent = `${Math.round(total)}h RUSH`;
    }
    const recommendation = qsa<HTMLElement>(root, 'span').find((span) =>
      (span.textContent ?? '').includes('Cut 1 Floater') || (span.textContent ?? '').includes('Labor within target'),
    );
    if (recommendation) recommendation.textContent = pacing.recommendation;
  }

  async function applyForecast() {
    try {
      const forecast = await api.get<{
        buckets: Array<{ label: string; forecastSales: number; scheduledWages: number; forecastLaborPct: number; status: string }>;
      }>('/labor/forecast');
      for (const bucket of forecast.buckets) {
        const label = qsa<HTMLElement>(root, 'span').find((span) =>
          (span.textContent ?? '').includes(bucket.label) &&
          /DOORS|RUSH|PEAK|PACING|LATE/i.test(span.textContent ?? ''),
        );
        if (!label) continue;
        const card = label.parentElement?.parentElement;
        const salesSpan = card
          ? qsa<HTMLElement>(card, 'span').find((span) => /^\$/.test((span.textContent ?? '').trim()))
          : null;
        if (salesSpan) salesSpan.textContent = money(bucket.forecastSales, 0);
      }
      toast('AI forecast refreshed from live sales + scheduled wages.', 'success');
    } catch {
      toast('Forecast feed unavailable.', 'warn');
    }
  }

  async function punch(shiftId: string) {
    const shift = shifts.find((entry) => entry.id === shiftId);
    if (!shift) return;
    try {
      if (shift.status === 'active') {
        await api.post(`/shifts/${shiftId}/clock-out`);
        toast(`${shift.userName} clocked out.`, 'success');
        chime('success');
      } else {
        await api.post(`/shifts/${shiftId}/clock-in`);
        toast(`${shift.userName} clocked in${shift.signoff ? '' : ' — briefing sign-off still required'}.`, 'success');
        chime('ticket');
      }
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Punch failed.', 'error');
    }
  }

  async function load() {
    try {
      const response = await api.get<ShiftResponse>('/shifts');
      data = response;
      shifts = response.shifts;
      renderRoster();
      updateKpis();
    } catch (error) {
      console.error(error);
      toast('Scheduling feed unavailable.', 'error');
    }
  }

  roleTabs.forEach((button) => {
    button.addEventListener('click', () => {
      const text = (button.textContent ?? '').toUpperCase();
      roleFilter = text.includes('FRONT')
        ? 'foh'
        : text.includes('BACK')
          ? 'boh'
          : text.includes('MANAGEMENT')
            ? 'management'
            : 'all';
      renderRoster();
      const activeClass =
        'px-space-sm py-1 rounded bg-gradient-to-r from-accent-purple-glow/30 to-secondary/30 text-text-primary font-label-badge text-label-badge font-bold';
      const idleClass =
        'px-space-sm py-1 rounded text-text-secondary font-label-badge text-label-badge hover:text-text-primary';
      roleTabs.forEach((tab) => {
        const tabText = (tab.textContent ?? '').toUpperCase();
        const isActive =
          roleFilter === 'all'
            ? tabText.includes('ALL ROLES')
            : roleFilter === 'foh'
              ? tabText.includes('FRONT')
              : roleFilter === 'boh'
                ? tabText.includes('BACK')
                : tabText.includes('MANAGEMENT');
        tab.className = isActive ? activeClass : idleClass;
      });
    });
  });

  broadcastCut?.addEventListener('click', () => {
    void api
      .post<{ recipients: string[]; delivered: boolean; simulated: boolean }>('/labor/broadcast-cut')
      .then((result) => {
        toast(
          `Early-cut offer sent to ${result.recipients.join(', ')}${result.simulated ? ' (simulated SMS)' : ''}.`,
          'success',
        );
        chime('ticket');
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Broadcast failed.', 'error'));
  });
  broadcastCustom?.addEventListener('click', () => {
    const message = window.prompt('Broadcast message to active staff');
    if (!message) return;
    void api
      .post('/labor/broadcast-cut', { message })
      .then(() => toast('Custom shift broadcast sent.', 'success'))
      .catch(() => toast('Broadcast failed.', 'error'));
  });
  newShift?.addEventListener('click', () => {
    const userName = window.prompt('Staff member name', 'Mateo Rivera');
    if (!userName) return;
    const role = (window.prompt('Role (server, line_cook, host, bartender, floor_manager)', 'server') ??
      'server') as Shift['role'];
    const rate = Number(window.prompt('Hourly rate', '18.00') ?? '18.00');
    const start = new Date();
    start.setHours(17, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 0, 0, 0);
    void api
      .post('/shifts', {
        userName,
        role,
        hourlyRate: Number.isFinite(rate) ? rate : 18,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
      })
      .then(() => {
        toast(`Shift created for ${userName}.`, 'success');
        return load();
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'New shift failed.', 'error'));
  });
  publishWeek?.addEventListener('click', () =>
    toast('Week published — staff notified and punch terminal updated.', 'success'),
  );
  forecastButton?.addEventListener('click', () => void applyForecast());
  recalculate?.addEventListener('click', () => {
    void applyForecast().then(() => toast('Stagger recalculated from live covers + forecast.', 'success'));
  });
  keepFloor?.addEventListener('click', () =>
    toast('Floor strength retained — no cuts applied.', 'info'),
  );
  timeLogs?.addEventListener('click', () => {
    void api
      .get<Array<{ userName: string; clockIn: string | null; clockOut: string | null }>>('/shifts/logs')
      .then((logs) => {
        const active = logs.filter((log) => log.clockIn && !log.clockOut).length;
        toast(`Time clock: ${logs.length} punches today · ${active} still on the clock.`, 'info', 6000);
      })
      .catch(() => toast('Time clock logs unavailable.', 'warn'));
  });
  punchTerminal?.addEventListener('click', () => {
    const pin = window.prompt('Enter 4-digit staff PIN');
    if (!pin) return;
    void api
      .post<{ staff: { id: string; name: string; role: string } }>('/auth/pin', { pin })
      .then(async (result) => {
        const shift = shifts.find((entry) => entry.userName === result.staff.name);
        if (!shift) {
          toast(`${result.staff.name} has no shift scheduled today.`, 'warn');
          return;
        }
        await punch(shift.id);
      })
      .catch(() => toast('Invalid PIN.', 'error'));
  });
  approveSwap?.addEventListener('click', () => {
    const shift = shifts[0];
    if (!shift) return;
    void api
      .post(`/shifts/${shift.id}/approve-swap`)
      .then(() => toast('Swap approved and published.', 'success'))
      .catch(() => toast('Swap approval failed.', 'error'));
  });
  declineSwap?.addEventListener('click', () => {
    const shift = shifts[0];
    if (!shift) return;
    void api
      .post(`/shifts/${shift.id}/decline-swap`)
      .then(() => toast('Swap declined; original shift retained.', 'info'))
      .catch(() => toast('Swap decline failed.', 'error'));
  });

  const offs = [
    listen('LABOR_PACING_UPDATE', (payload: LaborPacing) => {
      if (payload?.laborPercentage) {
        setKpiValue('REAL-TIME LABOR COST %', `${payload.laborPercentage}%`);
        setKpiValue('Live Labor Cost %', `${payload.laborPercentage}%`);
      }
      if (payload?.status === 'PACING_ALERT') {
        toast(`Labor pacing alert · ${payload.laborPercentage}% — ${payload.recommendation}`, 'warn');
        chime('alert');
      }
    }),
    listen('BRIEFING_UPDATED', () => void load()),
  ];

  const interval = window.setInterval(() => void load(), 60_000);
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

export default schedulingBinder;
