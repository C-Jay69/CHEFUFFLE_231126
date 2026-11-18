import { escapeHtml, money } from '../format';
import { listen } from '../socket';
import type {
  KdsTicket,
  LaborPacing,
  MenuItem,
  MenuResponse,
  ReservationResponse,
} from '../types';
import type { Binder, BinderContext } from './types';
import { qs, qsa } from './types';

const mobileBinder: Binder = (ctx: BinderContext) => {
  const { root, api, toast, chime } = ctx;
  let menu: MenuResponse | null = null;
  let feedbackTimer: number | undefined;

  const tabs = {
    floor: qs<HTMLButtonElement>(root, '#tab-floor'),
    labor: qs<HTMLButtonElement>(root, '#tab-labor'),
    vip: qs<HTMLButtonElement>(root, '#tab-vip'),
  };
  const laborCard = qs<HTMLElement>(root, '#labor-cut-card');
  const statusToast = qs<HTMLElement>(root, '#status-toast');
  const toastIcon = qs(root, '#toast-icon');
  const toastMessage = qs(root, '#toast-message');
  const auditButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Audit 86s'),
  );
  const ticker = auditButton?.parentElement ?? null;
  const bottleneckTitle = qsa(root, 'span').find((span) =>
    (span.textContent ?? '').trim() === 'KDS Bottleneck Pulse',
  );
  const bottleneckCard =
    (bottleneckTitle?.closest('div.rounded-xl') as HTMLElement | null) ?? null;
  const vipTitle = qsa(root, 'span').find((span) =>
    (span.textContent ?? '').trim() === 'GEOFENCE RADAR ALERT',
  );
  const vipCard = (vipTitle?.closest('div.rounded-xl') as HTMLElement | null) ?? null;
  const shelfTitle = qsa(root, 'span').find((span) =>
    (span.textContent ?? '').trim() === 'Fast 86 Multi-System Shelf',
  );
  const shelf =
    (shelfTitle?.closest('div.flex.flex-col') as HTMLElement | null) ??
    qsa(root, 'div').find((element) =>
      (element.textContent ?? '').includes('Fast 86 Multi-System Shelf'),
    );
  const broadcastButton = qs<HTMLButtonElement>(root, '#broadcast-early-cut-btn');
  const alertHostButton = qs<HTMLButtonElement>(root, '#alert-host-btn');

  const toggleButtons: Record<string, HTMLButtonElement | null> = {
    burrata: qs<HTMLButtonElement>(root, '#toggle-burrata'),
    seabass: qs<HTMLButtonElement>(root, '#toggle-seabass'),
    wagyu: qs<HTMLButtonElement>(root, '#toggle-wagyu'),
  };

  function showStatus(message: string, kind: 'success' | 'error' | 'warn' = 'success') {
    if (!statusToast) return;
    statusToast.classList.remove('translate-y-24', 'opacity-0');
    statusToast.classList.add('translate-y-0', 'opacity-100');
    if (toastMessage) toastMessage.textContent = message;
    if (toastIcon) {
      toastIcon.textContent = kind === 'success' ? 'check_circle' : kind === 'error' ? 'error' : 'warning';
      toastIcon.className = `material-symbols-outlined ${
        kind === 'success' ? 'text-accent-cyan-bright' : kind === 'error' ? 'text-status-urgent' : 'text-status-caution'
      }`;
    }
    if (feedbackTimer) window.clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => {
      statusToast.classList.add('translate-y-24', 'opacity-0');
      statusToast.classList.remove('translate-y-0', 'opacity-100');
    }, 3600);
  }

  function setTab(view: 'floor' | 'labor' | 'vip') {
    const activeClass =
      'py-space-xs text-center font-label-badge text-label-badge rounded font-bold transition-all bg-gradient-to-r from-accent-purple-glow to-secondary text-bg-canvas shadow';
    const idleClass =
      'py-space-xs text-center font-label-badge text-label-badge rounded font-bold transition-all text-text-tertiary hover:text-text-primary';
    for (const [key, button] of Object.entries(tabs)) {
      if (!button) continue;
      button.className = key === view ? activeClass : idleClass;
      if (key === 'vip' && key !== view) {
        button.classList.add('flex', 'items-center', 'justify-center', 'gap-1');
      }
    }
    const target =
      view === 'labor' ? laborCard : view === 'vip' ? vipCard : bottleneckCard;
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function updateLabor() {
    void api
      .get<LaborPacing>('/labor/pacing')
      .then((pacing) => {
        if (tabs.labor) tabs.labor.textContent = `LABOR (${pacing.laborPercentage}%)`;
        if (laborCard) {
          const heading = qsa<HTMLElement>(laborCard, 'span, div, h2, h3').find((span) =>
            (span.textContent ?? '').trim().startsWith('Labor Cost'),
          );
          if (heading) heading.textContent = `Labor Cost ${pacing.laborPercentage}%`;
          const variance = qsa<HTMLElement>(laborCard, 'span').find((span) =>
            (span.textContent ?? '').includes('Lag vs Par'),
          );
          if (variance) {
            const diff = Number(pacing.laborPercentage) - pacing.targetPercentage;
            variance.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% Lag vs Par`;
          }
          const target = qsa<HTMLElement>(laborCard, 'span').find((span) =>
            (span.textContent ?? '').includes('TARGET'),
          );
          if (target) target.textContent = `RECOVERS ${pacing.targetPercentage}% TARGET`;
          const recommendation = qsa<HTMLElement>(laborCard, 'p').find((p) =>
            (p.textContent ?? '').length > 40,
          );
          if (recommendation) recommendation.textContent = pacing.recommendation;
          const savings = qsa<HTMLElement>(laborCard, 'span').find((span) =>
            (span.textContent ?? '').includes('Projected Savings'),
          );
          if (savings) {
            savings.textContent = `Projected Savings: +${money(
              Math.round(pacing.currentHourlyBurn * 0.6),
              0,
            )} / Shift`;
          }
          const staffGrid = qsa<HTMLElement>(laborCard, 'div.grid.grid-cols-2')[0];
          if (staffGrid) {
            staffGrid.innerHTML = pacing.activeStaff
              .slice(-2)
              .map(
                (member) => `<div class="p-space-xs rounded bg-surface-container-high flex flex-col">
                  <span class="font-body-sm text-body-sm text-text-primary font-bold truncate">${escapeHtml(
                    member.name,
                  )}</span>
                  <span class="font-label-badge text-label-badge text-text-tertiary truncate">${escapeHtml(
                    member.roleLabel,
                  )} • ${member.hoursWorked.toFixed(1)}h</span>
                </div>`,
              )
              .join('');
          }
        }
        if (broadcastButton) {
          const count = Math.min(2, pacing.activeStaff.length);
          broadcastButton.textContent = `Broadcast Voluntary Early Cut (SMS to ${count} Staff)`;
          broadcastButton.innerHTML = `<span class="material-symbols-outlined text-body-base">send</span><span>Broadcast Voluntary Early Cut (SMS to ${count} Staff)</span>`;
        }
      })
      .catch(() => undefined);
  }

  function statusFor(item: MenuItem) {
    if (item.is86ed) return { text: "86'd — Restore", classes: 'bg-status-urgent hover:bg-status-urgent/80 text-text-primary', label: 'block' };
    if (item.stockStatus === 'low') return { text: '86 It Now', classes: 'bg-status-urgent hover:bg-status-urgent/80 text-text-primary', label: 'block' };
    return { text: '86 Item', classes: 'bg-surface-variant hover:bg-status-urgent text-text-secondary hover:text-text-primary', label: 'block' };
  }

  function paintToggle(button: HTMLButtonElement | null, item: MenuItem | undefined) {
    if (!button || !item) return;
    const meta = statusFor(item);
    button.className = `${meta.classes} px-space-md py-space-xs rounded-lg font-label-badge text-label-badge font-bold uppercase active:scale-95 transition-all flex items-center gap-1`;
    button.innerHTML = `<span class="material-symbols-outlined text-body-sm">${meta.label}</span><span>${meta.text}</span>`;
    button.dataset.itemId = item.id;
    button.dataset.is86 = String(item.is86ed);
  }

  function matchMenu(term: string) {
    return menu?.items.find((item) => item.name.toLowerCase().includes(term.toLowerCase()));
  }

  function updateMenuUi() {
    void api
      .get<MenuResponse>('/menu')
      .then((response) => {
        menu = response;
        paintToggle(toggleButtons.burrata, matchMenu('burrata'));
        paintToggle(toggleButtons.seabass, matchMenu('seabass'));
        paintToggle(toggleButtons.wagyu, matchMenu('wagyu'));
        if (ticker) {
          const out = response.items.filter((item) => item.is86ed);
          const low = response.items.filter((item) => !item.is86ed && item.stockStatus === 'low');
          const text = ticker.querySelector('div.flex-1');
          if (text) {
            text.textContent = out.length
              ? `86'D: ${out[0].name} (Voice AI Synced)${low[0] ? ` | ${low[0].name} (${low[0].portionsLeft} Left Par)` : ''}`
              : `All items live${low[0] ? ` | ${low[0].name} (${low[0].portionsLeft} Left Par)` : ''}`;
          }
        }
        if (shelf) {
          const rows = qsa<HTMLElement>(shelf, 'div.bg-surface-container-high');
          const labels = [
            { el: rows[0], item: matchMenu('seabass') },
            { el: rows[1], item: matchMenu('burrata') },
            { el: rows[2], item: matchMenu('wagyu') },
          ];
          for (const row of labels) {
            if (!row.el || !row.item) continue;
            const name = row.el.querySelector('span.font-body-base, span.font-body-sm, span.font-body-base.font-bold');
            if (name) name.textContent = row.item.name;
            const status = row.el.querySelector('span.font-label-badge, span.text-label-badge');
            if (status) {
              status.textContent = row.item.is86ed
                ? "86'd"
                : row.item.stockStatus === 'low'
                  ? `${row.item.portionsLeft} Portions Left (Par Warning)`
                  : `${row.item.portionsLeft} Portions in stock`;
            }
          }
        }
      })
      .catch(() => undefined);
  }

  function intakeToggle(button: HTMLButtonElement | null, nameHint: string) {
    if (!button) return;
    button.addEventListener('click', () => {
      const item = button.dataset.itemId
        ? menu?.items.find((entry) => entry.id === button.dataset.itemId)
        : matchMenu(nameHint);
      if (!item) {
        showStatus(`${nameHint} is not on the menu.`, 'warn');
        return;
      }
      const next = !item.is86ed;
      void api
        .patch(`/menu/${item.id}/availability`, {
          is86ed: next,
          reason: next ? 'Fast 86 from Mobile Floor Manager' : undefined,
        })
        .then(() => {
          showStatus(`${item.name} ${next ? "86'd" : 'restored'} across POS & Voice AI.`, 'success');
          chime(next ? 'alert' : 'success');
          return updateMenuUi();
        })
        .catch((error) => showStatus(error instanceof Error ? error.message : '86 update failed.', 'error'));
    });
  }

  function updateBottleneck() {
    void api
      .get<{ tickets: KdsTicket[] }>('/kds/tickets?station=expo')
      .then((response) => {
        const overdue = response.tickets
          .filter((ticket) => ticket.isOverdue)
          .sort((a, b) => b.elapsedSeconds - a.elapsedSeconds)[0];
        if (!bottleneckCard) return;
        if (!overdue) {
          const badge = qsa<HTMLElement>(bottleneckCard, 'span').find((span) =>
            /Overdue/i.test(span.textContent ?? ''),
          );
          if (badge) badge.textContent = '0 Overdue';
          return;
        }
        const badge = qsa<HTMLElement>(bottleneckCard, 'span').find((span) =>
          /Overdue/i.test(span.textContent ?? ''),
        );
        if (badge) badge.textContent = `${response.tickets.filter((ticket) => ticket.isOverdue).length} Overdue`;
        const table = qsa<HTMLElement>(bottleneckCard, 'span').find((span) =>
          /^TBL\s*\d+/i.test((span.textContent ?? '').trim()) || (span.textContent ?? '').includes('TBL'),
        );
        if (table) table.textContent = `TBL ${overdue.tableNumber.replace(/^T-/, '')}`;
        const item = qsa<HTMLElement>(bottleneckCard, 'span').find((span) =>
          (span.textContent ?? '').includes('Prime Dry-Aged Ribeye'),
        );
        if (item) item.textContent = overdue.items[0]?.name ?? 'Expo ticket';
        const timer = qsa<HTMLElement>(bottleneckCard, 'span').find((span) =>
          /^\d+m \d+s$/.test((span.textContent ?? '').trim()),
        );
        if (timer) {
          timer.textContent = `${Math.floor(overdue.elapsedSeconds / 60)}m ${String(
            overdue.elapsedSeconds % 60,
          ).padStart(2, '0')}s`;
        }
        const station = qsa<HTMLElement>(bottleneckCard, 'span').find((span) =>
          /Expediting|Grill Pass/.test(span.textContent ?? ''),
        );
        if (station) station.textContent = `${overdue.serverName} • ${overdue.zone}`;
      })
      .catch(() => undefined);
  }

  function updateVip() {
    void api
      .get<ReservationResponse>('/reservations')
      .then((response) => {
        const vip = response.reservations.find((reservation) => reservation.vip);
        if (!vip || !vipCard) return;
        const name = qsa<HTMLElement>(vipCard, 'span').find((span) =>
          (span.textContent ?? '').includes('Marcus Sterling') &&
          (span.className ?? '').includes('font'),
        );
        if (name) name.textContent = vip.guestName;
        const table = qsa<HTMLElement>(vipCard, 'span').find((span) =>
          (span.textContent ?? '').includes('Table 03'),
        );
        if (table) {
          table.textContent = `${vip.tableNumber ?? 'Table pending'} • ${new Date(
            vip.reservationTime,
          ).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
        }
        const alert = qsa<HTMLElement>(vipCard, 'span').find((span) =>
          /ALLERGY/i.test(span.textContent ?? ''),
        );
        if (alert && vip.notes) alert.textContent = vip.notes.toUpperCase();
        const preference = qsa<HTMLElement>(vipCard, 'span').find((span) =>
          (span.textContent ?? '').includes('Preference'),
        );
        if (preference) preference.textContent = `Preference: ${vip.occasion ?? 'VIP service'} • ${vip.partySize} guests`;
        if (alertHostButton) {
          alertHostButton.innerHTML = `<span class="material-symbols-outlined text-accent-purple-glow text-body-base">notifications_active</span><span>Alert Hostess & Lead Server (${escapeHtml(
            vip.tableNumber ?? vip.guestName,
          )})</span>`;
        }
      })
      .catch(() => undefined);
  }

  tabs.floor?.addEventListener('click', () => setTab('floor'));
  tabs.labor?.addEventListener('click', () => setTab('labor'));
  tabs.vip?.addEventListener('click', () => setTab('vip'));
  intakeToggle(toggleButtons.burrata, 'burrata');
  intakeToggle(toggleButtons.seabass, 'seabass');
  intakeToggle(toggleButtons.wagyu, 'wagyu');

  broadcastButton?.addEventListener('click', () => {
    void api
      .post<{ recipients: string[]; simulated: boolean }>('/labor/broadcast-cut')
      .then((result) => {
        showStatus(
          `Early-cut offer sent to ${result.recipients.join(', ')}${
            result.simulated ? ' (simulated SMS)' : ''
          }.`,
          'success',
        );
        chime('ticket');
      })
      .catch((error) => showStatus(error instanceof Error ? error.message : 'Broadcast failed.', 'error'));
  });
  alertHostButton?.addEventListener('click', () => {
    showStatus('Hostess and lead server paged for the VIP arrival.', 'success');
    chime('alert');
  });
  auditButton?.addEventListener('click', () => {
    updateMenuUi();
    showStatus('86 audit pushed to POS, KDS and Voice AI.', 'success');
  });
  qsa<HTMLButtonElement>(root, 'button').forEach((button) => {
    if ((button.textContent ?? '').includes('Page Lead')) {
      button.addEventListener('click', () => {
        showStatus('Expo lead paged for the overdue grill ticket.', 'warn');
        chime('alert');
      });
    }
  });

  const offs = [
    listen('LABOR_PACING_UPDATE', () => updateLabor()),
    listen('GLOBAL_86_ITEM_UPDATE', () => updateMenuUi()),
    listen('RESERVATION_CREATED', () => updateVip()),
    listen('KDS_NEW_TICKET', () => updateBottleneck()),
    listen('KDS_TICKET_BUMPED', () => updateBottleneck()),
    listen('TABLE_STAGE_ADVANCED', () => {
      updateBottleneck();
      updateVip();
    }),
  ];

  const interval = window.setInterval(() => {
    updateLabor();
    updateBottleneck();
  }, 45_000);

  setTab('floor');
  updateLabor();
  updateMenuUi();
  updateBottleneck();
  updateVip();

  return () => {
    window.clearInterval(interval);
    if (feedbackTimer) window.clearTimeout(feedbackTimer);
    for (const off of offs) {
      try {
        off();
      } catch {
        /* noop */
      }
    }
  };
};

export default mobileBinder;
