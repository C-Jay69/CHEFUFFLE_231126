import { isMuted, setMuted } from '../audio';
import { escapeHtml, money, timeLabel } from '../format';
import { joinKdsStation, listen } from '../socket';
import type { KdsTicket, MenuResponse } from '../types';
import type { Binder, BinderContext } from './types';
import { qs, qsa } from './types';

const STATIONS = [
  { key: 'expo', label: 'ALL STATIONS (EXPO)', short: 'EXPO' },
  { key: 'grill', label: 'GRILL STATION 1', short: 'GRILL' },
  { key: 'saute_fryer', label: 'SAUTÉ & FRYER', short: 'SAUTÉ' },
  { key: 'cold_larder', label: 'COLD LARDER', short: 'LARDER' },
  { key: 'pastry_dessert', label: 'PASTRY & DESSERT', short: 'PASTRY' },
  { key: 'bar', label: 'BAR', short: 'BAR' },
] as const;

type StationKey = (typeof STATIONS)[number]['key'];

const STATION_LABEL: Record<string, string> = {
  grill: 'GRILL 1',
  saute_fryer: 'SAUTÉ',
  cold_larder: 'LARDER',
  pastry_dessert: 'PASTRY',
  bar: 'BAR',
  expo: 'EXPO',
};

const kdsBinder: Binder = (ctx: BinderContext) => {
  const { root, api, socket, toast, chime } = ctx;
  let station: StationKey = 'grill';
  let tickets: KdsTicket[] = [];
  let counts: Record<string, number> = {};
  let ticker = 0;

  const board = qsa(root, 'section').find(
    (section) =>
      (section.className ?? '').includes('xl:grid-cols-4') &&
      section.querySelector('article') !== null,
  );
  const expoCard = board
    ? qsa<HTMLElement>(board, 'article').find((article) =>
        (article.textContent ?? '').includes('REAL-TIME CADENCE'),
      )
    : null;
  const expoHtml = expoCard?.outerHTML ?? '';
  const allStationsButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('ALL STATIONS (EXPO)'),
  );
  const tabsHost = allStationsButton?.parentElement ?? null;
  const tickerSpan = qsa(root, 'span').find((span) =>
    /Black Truffle|SOLD OUT|86'D TICKER/i.test(span.textContent ?? '') &&
    (span.textContent ?? '').length < 160,
  );
  const syncBanner = qsa(root, 'p').find((p) => (p.textContent ?? '').includes('KDS SYNC ENGAGED'));
  const avgTicket = qsa(root, 'span').find((span) =>
    /^(11m|10m|\d+m \d+s)$/.test((span.textContent ?? '').trim()),
  );
  const chimeLabel = qsa(root, 'span').find((element) =>
    (element.textContent ?? '').includes('CHIME:'),
  );
  const chimeBadge = chimeLabel?.parentElement ?? null;
  const footerSum = qsa(root, 'div').find((element) =>
    (element.textContent ?? '').includes('ITEM SUM:'),
  );
  const recentButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('RECENT BUMPS'),
  );
  const muteButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('MUTE ALARMS'),
  );

  function setupTabs() {
    if (!tabsHost) return;
    const existing = qsa<HTMLButtonElement>(tabsHost, 'button');
    for (const button of existing) {
      const text = (button.textContent ?? '').toUpperCase();
      const match = STATIONS.find((entry) => text.includes(entry.label.split(' ')[0]));
      if (match) button.dataset.station = match.key;
    }
    if (!qs(tabsHost, '[data-station="bar"]')) {
      const template = existing[1] ?? existing[0];
      if (template) {
        const bar = document.createElement('button');
        bar.className =
          'px-space-md py-space-xs rounded bg-surface-container text-on-surface-variant font-label-eyebrow text-label-eyebrow hover:text-text-primary transition-colors flex items-center gap-1.5 shrink-0';
        bar.dataset.station = 'bar';
        bar.innerHTML = `<span>BAR</span><span class="ml-1 px-1.5 py-0.2 rounded bg-surface-variant text-text-secondary font-mono-metric-sm text-mono-metric-sm">0</span>`;
        tabsHost.appendChild(bar);
      }
    }
    qsa<HTMLButtonElement>(tabsHost, '[data-station]').forEach((button) => {
      button.onclick = () => {
        station = (button.dataset.station as StationKey) ?? 'expo';
        joinKdsStation(station);
        void load();
      };
    });
    styleTabs();
  }

  function styleTabs() {
    if (!tabsHost) return;
    qsa<HTMLButtonElement>(tabsHost, '[data-station]').forEach((button) => {
      const active = button.dataset.station === station;
      const count = counts[button.dataset.station ?? ''] ?? 0;
      if (active) {
        button.className =
          'px-space-md py-space-xs rounded bg-gradient-to-r from-accent-purple-glow/30 to-secondary/30 text-text-primary font-label-eyebrow text-label-eyebrow font-bold shadow-sm flex items-center gap-1.5 shrink-0';
      } else {
        button.className =
          'px-space-md py-space-xs rounded bg-surface-container text-on-surface-variant font-label-eyebrow text-label-eyebrow hover:text-text-primary transition-colors flex items-center gap-1.5 shrink-0';
      }
      const badges = qsa<HTMLElement>(button, 'span').filter((span) => /^\d+$/.test((span.textContent ?? '').trim()));
      const badge = badges[badges.length - 1];
      if (badge) badge.textContent = String(count);
      else {
        const next = document.createElement('span');
        next.className =
          'ml-1 px-1.5 py-0.2 rounded bg-surface-variant text-text-secondary font-mono-metric-sm text-mono-metric-sm';
        next.textContent = String(count);
        button.appendChild(next);
      }
    });
  }

  function cardHtml(ticket: KdsTicket, index: number) {
    const urgent = ticket.priority === 'urgent';
    const caution = ticket.priority === 'hero' || ticket.isOverdue;
    const strip = urgent
      ? 'bg-status-urgent animate-pulse'
      : caution
        ? 'bg-status-caution'
        : ticket.bumpedCount === ticket.itemCount
          ? 'bg-status-ready'
          : 'bg-secondary';
    const timerClass = urgent
      ? 'bg-status-urgent/20 text-status-urgent animate-pulse'
      : caution
        ? 'bg-status-caution/20 text-status-caution'
        : 'bg-status-ready/20 text-status-ready';
    const stageText = ticket.status === 'ready_at_pass' ? 'READY AT PASS' : ticket.isOverdue ? 'OVERDUE — EXPEDITE' : 'FIRING';
    const stationLabel = STATION_LABEL[ticket.stations[0]] ?? 'EXPO';
    const items = ticket.items
      .map((item) => {
        const done = item.prepStatus === 'bumped';
        return `<div class="p-space-sm rounded ${
          done ? 'bg-surface-container-high/40 opacity-60' : 'bg-surface-container'
        } flex flex-col gap-1" data-item-id="${item.id}">
          <div class="flex items-center justify-between gap-2">
            <span class="font-body-base text-body-base font-semibold ${
              done ? 'text-text-tertiary line-through' : 'text-text-primary'
            }">${item.quantity}x ${escapeHtml(item.name)}</span>
            <span class="px-1.5 py-0.5 rounded ${
              done ? 'bg-status-ready/15 text-status-ready' : 'bg-surface-variant text-text-secondary'
            } font-label-badge text-label-badge shrink-0">${
              done ? 'BUMPED' : STATION_LABEL[item.station] ?? 'LINE'
            }</span>
          </div>
          ${
            item.notes
              ? `<span class="font-body-sm text-body-sm ${
                  item.isAllergen ? 'text-status-urgent font-semibold' : 'text-text-tertiary'
                }">• ${escapeHtml(item.notes)}</span>`
              : ''
          }
          ${
            item.modifiers?.length
              ? `<span class="font-body-sm text-body-sm text-text-tertiary">• ${item.modifiers
                  .map((modifier) => escapeHtml(modifier.name))
                  .join(' • ')}</span>`
              : ''
          }
          ${
            item.seat
              ? `<span class="font-label-badge text-label-badge text-text-muted">SEAT ${escapeHtml(item.seat)}</span>`
              : ''
          }
        </div>`;
      })
      .join('');

    return `<article class="${
      index === 0 ? 'xl:col-span-2' : ''
    } bg-surface-container-low rounded-lg shadow-xl flex flex-col justify-between relative overflow-hidden transition-all duration-200" data-ticket-id="${ticket.id}">
      <div class="${strip} h-2 w-full"></div>
      <div class="p-space-md bg-surface-container flex flex-col gap-space-xs">
        <div class="flex items-start justify-between gap-space-sm">
          <div class="flex flex-col">
            <div class="flex items-center gap-space-xs flex-wrap">
              <span class="font-headline-lg text-headline-lg text-text-primary font-bold">TABLE ${escapeHtml(ticket.tableNumber)}</span>
              <span class="px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-mono-metric-sm text-mono-metric-sm font-bold">CHIT #${ticket.orderNumber}</span>
              <span class="px-2 py-0.5 rounded bg-surface-variant font-label-badge text-label-badge text-secondary">${ticket.partySize ?? '—'} GUESTS</span>
            </div>
            <div class="flex items-center gap-space-sm mt-0.5 text-text-secondary font-body-sm text-body-sm">
              <span>Server: <strong class="text-text-primary">${escapeHtml(ticket.serverName)}</strong></span>
              <span>•</span>
              <span class="font-mono-metric-sm text-mono-metric-sm text-text-tertiary">Ordered: ${timeLabel(ticket.createdAt)}</span>
            </div>
          </div>
          <div class="flex flex-col items-end">
            <div class="flex items-center gap-1.5 px-space-sm py-1 rounded ${timerClass}">
              <span class="material-symbols-outlined text-body-base ${caution ? 'animate-spin' : ''}">timelapse</span>
              <span class="font-mono-metric-lg text-mono-metric-lg tracking-wider" data-timer="${ticket.createdAt}">${ticket.elapsedLabel}</span>
            </div>
            <span class="font-label-badge text-label-badge ${urgent ? 'text-status-urgent' : caution ? 'text-status-caution' : 'text-status-ready'} mt-1 uppercase font-bold">${stageText}</span>
          </div>
        </div>
        ${
          ticket.hasAllergy
            ? `<div class="bg-status-urgent/20 px-space-sm py-2 rounded flex items-center gap-space-sm shadow-sm">
                <span class="material-symbols-outlined text-status-urgent text-headline-md shrink-0">emergency</span>
                <div class="flex flex-col">
                  <span class="font-label-eyebrow text-label-eyebrow text-status-urgent uppercase font-bold tracking-wider">CRITICAL ALLERGY PROTOCOL</span>
                  <span class="font-body-base text-body-base text-text-primary font-semibold leading-tight">${escapeHtml(
                    ticket.allergyNotes ?? 'Allergy flag on this ticket — verify before plating.',
                  )}</span>
                </div>
              </div>`
            : ''
        }
        <div class="flex items-center justify-between pt-1">
          <span class="font-label-eyebrow text-label-eyebrow text-secondary uppercase tracking-widest font-bold">COURSE • ${escapeHtml(stationLabel)}</span>
          <span class="font-label-badge text-label-badge ${
            ticket.bumpedCount === ticket.itemCount ? 'text-status-ready' : 'text-text-muted'
          }">${ticket.bumpedCount}/${ticket.items.length} BUMPED</span>
        </div>
      </div>
      <div class="p-space-md flex flex-col gap-space-sm flex-1">
        ${items}
        <div class="flex items-center justify-between text-body-sm font-body-sm text-text-secondary pt-1 border-t border-border-subtle">
          <span class="font-mono-metric-sm">${ticket.itemCount} ITEMS • ${money(
            ticket.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
          )}</span>
          <span class="${ticket.isOverdue ? 'text-status-urgent font-bold' : 'text-text-muted'}">${
            ticket.isOverdue ? `OVERDUE +${Math.round(ticket.overdueBySeconds / 60)}M` : `TARGET ${Math.round(ticket.maxPrepSeconds / 60)}M`
          }</span>
        </div>
      </div>
      <div class="p-space-md bg-surface-container flex flex-col gap-space-xs">
        <button data-bump="${ticket.id}" class="w-full py-space-sm px-space-md rounded-lg ${
          urgent
            ? 'bg-status-urgent text-white'
            : 'bg-gradient-to-r from-secondary to-accent-purple-glow text-bg-chrome'
        } font-headline-md text-headline-md font-bold shadow-lg hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-space-xs">
          <span class="material-symbols-outlined text-headline-lg">done</span>
          <span>${
            station === 'grill'
              ? `BUMP MAINS → ADVANCE TABLE ${escapeHtml(ticket.tableNumber)} TO ENTRÉE`
              : station === 'expo'
                ? 'BUMP ALL ITEMS'
                : `BUMP ${STATION_LABEL[station] ?? 'TICKET'}`
          }</span>
        </button>
        <div class="grid grid-cols-3 gap-space-xs mt-1">
          <button data-hold="${ticket.id}" class="py-space-xs px-space-sm rounded bg-surface-variant text-text-secondary font-label-eyebrow text-label-eyebrow hover:text-text-primary transition-colors flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-body-sm">more_time</span><span>HOLD 2M</span>
          </button>
          <button data-print="${ticket.id}" class="py-space-xs px-space-sm rounded bg-surface-variant text-text-secondary font-label-eyebrow text-label-eyebrow hover:text-text-primary transition-colors flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-body-sm">print</span><span>PRINT CHIT</span>
          </button>
          <button data-recall="${ticket.id}" class="py-space-xs px-space-sm rounded bg-surface-variant text-text-secondary font-label-eyebrow text-label-eyebrow hover:text-text-primary transition-colors flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-body-sm">undo</span><span>RECALL</span>
          </button>
        </div>
      </div>
    </article>`;
  }

  function render() {
    if (!board) return;
    board.innerHTML =
      (tickets.length
        ? tickets.map((ticket, index) => cardHtml(ticket, index)).join('')
        : `<div class="xl:col-span-2 bg-surface-container-low rounded-lg p-8 flex flex-col items-center justify-center text-center gap-2">
            <span class="material-symbols-outlined text-headline-xl text-status-ready">check_circle</span>
            <span class="font-headline-md text-headline-md text-text-primary">Station clear</span>
            <span class="font-body-sm text-body-sm text-text-secondary">No open tickets for ${escapeHtml(
              STATIONS.find((entry) => entry.key === station)?.short ?? station,
            )}.</span>
          </div>`) + expoHtml;
    wireCards();
    updateFooter();
    styleTabs();
    updateAvg();
  }

  function wireCards() {
    qsa<HTMLButtonElement>(board!, '[data-bump]').forEach((button) => {
      button.addEventListener('click', () => void bump(button.dataset.bump!, 'bump'));
    });
    qsa<HTMLButtonElement>(board!, '[data-recall]').forEach((button) => {
      button.addEventListener('click', () => void bump(button.dataset.recall!, 'recall'));
    });
    qsa<HTMLButtonElement>(board!, '[data-hold]').forEach((button) => {
      button.addEventListener('click', () => void bump(button.dataset.hold!, 'hold'));
    });
    qsa<HTMLButtonElement>(board!, '[data-print]').forEach((button) => {
      button.addEventListener('click', () => toast(`Chit for #${button.dataset.print?.slice(0, 8)} sent to expo printer.`, 'info'));
    });
  }

  async function bump(orderId: string, action: 'bump' | 'recall' | 'hold') {
    const card = qs(board!, `[data-ticket-id="${orderId}"]`);
    // Optimistic departure animation; rolled back if the network call fails.
    if (action === 'bump') card?.classList.add('sh-ticket-leaving');
    try {
      const result = await api.post<{
        updatedCount: number;
        tableAdvanced: boolean;
        previousStage: string | null;
        newStage: string | null;
        ticket: KdsTicket | null;
      }>('/kds/bump', {
        orderId,
        station: station === 'expo' ? undefined : station,
        action,
      });
      if (action === 'bump') {
        if (result.tableAdvanced) {
          const tableNumber = result.ticket?.tableNumber ?? 'table';
          toast(`KDS bump → ${tableNumber} advanced to Stage 2: Entrée.`, 'success');
          chime('success');
          if (syncBanner) {
            syncBanner.innerHTML = `<strong class="text-secondary font-semibold">KDS SYNC ENGAGED:</strong> Bumping mains will auto-advance Floor Plan <span class="px-1.5 py-0.5 rounded bg-surface-container font-mono-metric-sm text-mono-metric-sm text-secondary">Table ${escapeHtml(
              tableNumber.replace(/^T-/, ''),
            )}</span> to Stage 2: Entrée.`;
          }
        } else {
          toast(`${result.updatedCount} item(s) bumped.`, 'success');
          chime('ticket');
        }
        if (card) {
          window.setTimeout(() => void load(), 220);
        } else {
          void load();
        }
      } else if (action === 'recall') {
        toast('Ticket recalled to the line.', 'warn');
        void load();
      } else {
        toast('Ticket held for 2 minutes.', 'info');
        void load();
      }
    } catch (error) {
      card?.classList.remove('sh-ticket-leaving');
      toast(error instanceof Error ? error.message : 'Bump failed.', 'error');
      chime('blocked');
    }
  }

  function updateFooter() {
    if (!footerSum) return;
    const totals = new Map<string, number>();
    for (const ticket of tickets) {
      for (const item of ticket.items) {
        totals.set(item.name, (totals.get(item.name) ?? 0) + item.quantity);
      }
    }
    const chips = [...totals.entries()]
      .slice(0, 5)
      .map(
        ([name, quantity], index) =>
          `<div class="flex items-center gap-1.5 px-space-sm py-1 rounded bg-surface-container-high">
            <span class="font-mono-metric-md text-mono-metric-md ${
              index % 2 === 0 ? 'text-accent-cyan-bright' : 'text-secondary'
            } font-bold">${quantity}x</span>
            <span class="font-body-sm text-body-sm text-text-primary font-medium">${escapeHtml(name)}</span>
          </div>`,
      )
      .join('');
    const label = qsa(footerSum, 'span').find((span) =>
      (span.textContent ?? '').includes('ITEM SUM'),
    );
    if (label) {
      label.textContent = `${STATION_LABEL[station] ?? 'STATION'} ITEM SUM:`;
      const container = label.parentElement?.nextElementSibling;
      if (container) container.innerHTML = chips || '<span class="font-body-sm text-text-muted">No items in flight.</span>';
    }
  }

  function updateAvg() {
    if (!avgTicket) return;
    if (tickets.length === 0) {
      avgTicket.textContent = '0m 00s';
      return;
    }
    const average = tickets.reduce((sum, ticket) => sum + ticket.elapsedSeconds, 0) / tickets.length;
    avgTicket.textContent = `${Math.floor(average / 60)}m ${String(Math.round(average % 60)).padStart(2, '0')}s`;
  }

  function updateTicker() {
    void api
      .get<MenuResponse>('/menu')
      .then((menu) => {
        const out = menu.items.filter((item) => item.is86ed);
        const low = menu.items.filter((item) => !item.is86ed && item.stockStatus === 'low');
        if (tickerSpan) {
          tickerSpan.textContent = out.length
            ? `${out[0].name} (SOLD OUT)${low[0] ? ` • Low: ${low[0].name} (${low[0].portionsLeft} left)` : ''}`
            : `No 86s • ${low[0] ? `Low: ${low[0].name} (${low[0].portionsLeft} left)` : 'All par levels healthy'}`;
        }
      })
      .catch(() => undefined);
  }

  async function load() {
    try {
      const response = await api.get<{
        tickets: KdsTicket[];
        counts: Record<string, number>;
      }>(`/kds/tickets?station=${station}`);
      tickets = response.tickets;
      counts = response.counts;
      render();
      const critical = tickets.find((ticket) => ticket.hasAllergy || ticket.isOverdue);
      if (critical && ticker > 0) chime(critical.isOverdue ? 'alert' : 'ticket');
      ticker += 1;
    } catch (error) {
      console.error(error);
      toast('KDS feed unavailable — retrying with REST.', 'error');
    }
  }

  const timerInterval = window.setInterval(() => {
    for (const timer of qsa<HTMLElement>(root, '[data-timer]')) {
      const createdAt = timer.dataset.timer;
      if (!createdAt) continue;
      const seconds = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
      timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
        seconds % 60,
      ).padStart(2, '0')}`;
    }
  }, 1000);

  muteButton?.addEventListener('click', () => {
    const next = !isMuted();
    setMuted(next);
    muteButton.innerHTML = `<span class="material-symbols-outlined text-body-base">${
      next ? 'volume_off' : 'volume_up'
    }</span><span>${next ? 'UNMUTE ALARMS' : 'MUTE ALARMS'}</span>`;
    toast(next ? 'KDS alarms muted.' : 'KDS alarms unmuted.', next ? 'warn' : 'success');
  });

  chimeBadge?.addEventListener('click', () => {
    toast('Chime volume controlled by the device — test tone played.', 'info');
    chime('success');
  });

  recentButton?.addEventListener('click', () => {
    void api
      .get<Array<{ name: string; tableNumber: string; orderNumber: number; bumpedSecondsAgo: number | null }>>(
        '/kds/bumps?limit=6',
      )
      .then((bumps) => {
        if (bumps.length === 0) {
          toast('No recent bumps yet.', 'info');
          return;
        }
        toast(
          `Recent bumps: ${bumps
            .slice(0, 4)
            .map((bump) => `${bump.name} (T${bump.tableNumber.replace(/^T-/, '')})`)
            .join(' · ')}`,
          'info',
          6500,
        );
      })
      .catch(() => toast('Recent bumps unavailable.', 'warn'));
  });

  const offs = [
    listen('KDS_NEW_TICKET', (payload: { ticket?: KdsTicket }) => {
      if (payload?.ticket?.hasAllergy) chime('alert');
      void load();
    }),
    listen('KDS_TICKET_BUMPED', (payload: { tableAdvanced?: boolean; ticket?: KdsTicket }) => {
      if (payload?.tableAdvanced) chime('success');
      void load();
    }),
    listen('KDS_TICKET_UPDATED', () => void load()),
    listen('GLOBAL_86_ITEM_UPDATE', () => {
      updateTicker();
      chime('alert');
    }),
    listen('INVENTORY_UPDATED', () => void updateTicker()),
  ];

  setupTabs();
  joinKdsStation(station);
  void load();
  updateTicker();

  return () => {
    window.clearInterval(timerInterval);
    for (const off of offs) {
      try {
        off();
      } catch {
        /* noop */
      }
    }
  };
};

export default kdsBinder;
