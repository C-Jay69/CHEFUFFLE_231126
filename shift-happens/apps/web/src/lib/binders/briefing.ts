import { escapeHtml, initials, initialsColor, money, timeLabel } from '../format';
import { listen } from '../socket';
import type { Briefing, Shift } from '../types';
import type { Binder, BinderContext } from './types';
import { qs, qsa } from './types';

const briefingBinder: Binder = (ctx: BinderContext) => {
  const { root, api, toast, chime } = ctx;
  let briefing: Briefing | null = null;

  const narrative = qs(root, '#narrativeBody');
  const regenerate = qs<HTMLButtonElement>(root, '#regeneratePromptBtn');
  const biometric = qs<HTMLButtonElement>(root, '#broadcastBiometricBtn');
  const table = qs<HTMLTableElement>(root, 'table');
  const rosterBody = table?.tBodies[0] ?? null;
  const subtitle = qsa<HTMLElement>(root, 'span, p, div').find((element) => {
    const text = (element.textContent ?? '').trim();
    return (
      element.children.length === 0 &&
      text.length < 180 &&
      (text.startsWith('Saturday Dinner Rush') || text.includes('Dinner Rush • Nov'))
    );
  });

  const cards = qsa<HTMLElement>(root, 'div').filter(
    (element) =>
      (element.className ?? '').includes('rounded-xl') &&
      (element.className ?? '').includes('bg-surface-container-high') &&
      element.querySelector('h2') !== null,
  );
  const eightySixCard = cards.find((card) =>
    (card.querySelector('h2')?.textContent ?? '').includes("86'd"),
  );
  const vipCard = cards.find((card) =>
    (card.querySelector('h2')?.textContent ?? '').includes('VIP & Press'),
  );
  const directivesCard = cards.find((card) =>
    (card.querySelector('h2')?.textContent ?? '').includes('Station Directives'),
  );

  function cardList(card: HTMLElement | undefined): HTMLElement | null {
    return card ? qs<HTMLElement>(card, 'div.flex.flex-col.gap-space-sm') : null;
  }

  function render86() {
    if (!briefing || !eightySixCard) return;
    const list = cardList(eightySixCard);
    if (!list) return;
    const entries = [
      ...briefing.eightySix.map((item) => ({
        name: item.name,
        quantity: 'QTY: 0',
        description:
          item.reason ??
          `Zero stock. Auto-excluded across Voice AI Agent & POS touch terminals.`,
        critical: true,
        meta: `${item.category ?? item.station} • synced live`,
      })),
      ...briefing.lowStock.map((item) => ({
        name: item.name,
        quantity: `${item.currentStock.toFixed(2)} ${item.unit}`,
        description: `Below reorder trigger (${item.reorderTrigger} ${item.unit}). Par ${item.parLevel} ${item.unit}. Supplier: ${
          item.supplier ?? 'unassigned'
        }.`,
        critical: item.severity === 'depleted',
        meta: item.severity === 'depleted' ? 'DEPLETED' : 'LOW PAR',
      })),
    ];
    list.innerHTML =
      entries
        .map(
          (entry) => `<div class="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-1">
            <div class="flex items-center justify-between gap-2">
              <span class="font-body-base text-body-base font-bold text-text-primary">${escapeHtml(
                entry.name,
              )}</span>
              <span class="font-mono-metric-sm text-mono-metric-sm ${
                entry.critical ? 'text-status-urgent bg-status-urgent/10' : 'text-status-caution bg-status-caution/10'
              } px-1.5 py-0.5 rounded font-bold shrink-0">${escapeHtml(entry.quantity)}</span>
            </div>
            <p class="font-body-sm text-body-sm text-text-secondary">${escapeHtml(entry.description)}</p>
            <div class="flex items-center gap-1 mt-1 ${
              entry.critical ? 'text-status-urgent' : 'text-accent-cyan-bright'
            } font-label-badge text-label-badge">
              <span class="material-symbols-outlined text-body-sm">sync_saved_locally</span>
              ${escapeHtml(entry.meta)}
            </div>
          </div>`,
        )
        .join('') ||
      '<div class="p-4 text-center text-text-muted font-body-base">No 86s or critical pars. Kitchen is clear.</div>';
  }

  function renderVip() {
    if (!briefing || !vipCard) return;
    const list = cardList(vipCard);
    if (!list) return;
    list.innerHTML =
      briefing.vipReservations
        .map((reservation) => {
          const allergy = /allerg/i.test(reservation.notes ?? '');
          return `<div class="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-1.5 relative overflow-hidden">
            <div class="absolute left-0 top-0 bottom-0 w-1 ${
              allergy ? 'bg-status-urgent' : 'bg-accent-purple-glow'
            }"></div>
            <div class="flex items-start justify-between gap-2">
              <div>
                <span class="font-body-base text-body-base font-bold text-text-primary">${escapeHtml(
                  reservation.guestName,
                )}</span>
                <span class="font-label-badge text-label-badge text-secondary block">${
                  reservation.tableNumber ?? 'Table pending'
                } • ${timeLabel(reservation.time)} (Party of ${reservation.partySize})</span>
              </div>
              <span class="font-label-badge text-label-badge px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold shrink-0">${
                reservation.occasion ? escapeHtml(reservation.occasion) : 'VIP'
              }</span>
            </div>
            ${
              allergy
                ? `<div class="p-space-xs rounded bg-status-urgent/15 text-status-urgent flex items-center gap-1.5 font-label-badge text-label-badge">
                    <span class="material-symbols-outlined text-body-base shrink-0 animate-bounce">warning</span>
                    <span>${escapeHtml(reservation.notes ?? '')}</span>
                  </div>`
                : ''
            }
            <p class="font-body-sm text-body-sm text-text-secondary">${escapeHtml(
              reservation.notes ?? 'Confirmed guest — greet personally and confirm seating preference.',
            )}</p>
          </div>`;
        })
        .join('') ||
      '<div class="p-4 text-center text-text-muted font-body-base">No VIP or press arrivals flagged for this service.</div>';
  }

  function renderDirectives() {
    if (!briefing || !directivesCard) return;
    const list = cardList(directivesCard);
    if (!list) return;
    list.innerHTML = briefing.stationDirectives
      .map(
        (directive) => `<div class="p-space-sm rounded-lg bg-surface-container-low flex items-start gap-space-sm">
          <span class="material-symbols-outlined ${
            directive.priority === 'urgent'
              ? 'text-status-urgent'
              : directive.priority === 'high'
                ? 'text-status-caution'
                : 'text-secondary'
          } text-body-base mt-0.5 shrink-0">${
            directive.priority === 'urgent' ? 'warning' : directive.priority === 'high' ? 'local_fire_department' : 'check_circle'
          }</span>
          <div class="flex flex-col">
            <span class="font-label-eyebrow text-label-eyebrow text-text-primary uppercase font-bold">${escapeHtml(
              directive.station,
            )}</span>
            <span class="font-body-sm text-body-sm text-text-secondary">${escapeHtml(directive.directive)}</span>
          </div>
        </div>`,
      )
      .join('');
  }

  function renderAttendance() {
    if (!briefing || !rosterBody) return;
    rosterBody.innerHTML = briefing.attendance
      .map((shift: Shift) => {
        const signed = Boolean(shift.signoff);
        const active = shift.status === 'active';
        return `<tr class="hover:bg-surface-container transition-colors">
          <td class="py-space-sm px-space-md">
            <div class="flex items-center gap-space-sm">
              <div class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center ${initialsColor(
                shift.userName,
              )} font-bold font-label-badge text-label-badge">${escapeHtml(initials(shift.userName))}</div>
              <div>
                <span class="font-bold text-text-primary block">${escapeHtml(shift.userName)}</span>
                <span class="font-label-badge text-label-badge text-text-tertiary">${escapeHtml(
                  shift.roleLabel,
                )}</span>
              </div>
            </div>
          </td>
          <td class="py-space-sm px-space-md">
            <span class="text-text-primary font-medium block">${escapeHtml(shift.roleLabel)}</span>
            <span class="font-label-badge text-label-badge text-secondary">${escapeHtml(
              shift.station ?? 'Floor',
            )} • ${money(shift.hourlyRate)}/hr</span>
          </td>
          <td class="py-space-sm px-space-md">
            <span class="font-mono-metric-sm text-mono-metric-sm ${
              active ? 'text-status-ready' : 'text-text-tertiary'
            } flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full ${active ? 'bg-status-ready' : 'bg-text-muted'}"></span>
              ${shift.clockIn ? timeLabel(shift.clockIn) : 'NOT PUNCHED'} ${active ? 'ON-PREM' : shift.status.toUpperCase()}
            </span>
          </td>
          <td class="py-space-sm px-space-md">
            ${
              signed
                ? `<span class="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-status-ready/15 text-status-ready font-label-badge text-label-badge"><span class="material-symbols-outlined text-body-sm">check_circle</span>Signed & Allergen Verified</span>`
                : `<span class="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-status-caution/15 text-status-caution font-label-badge text-label-badge"><span class="material-symbols-outlined text-body-sm">pending</span>Awaiting sign-off</span>`
            }
          </td>
          <td class="py-space-sm px-space-md text-right">
            <button data-signoff="${shift.id}" class="px-space-sm py-1 rounded ${
              signed
                ? 'bg-surface-container-low hover:bg-surface-variant text-text-secondary'
                : 'bg-status-ready/20 hover:bg-status-ready/30 text-status-ready font-bold'
            } text-body-sm">${signed ? 'Audit Log' : 'Sign Off'}</button>
          </td>
        </tr>`;
      })
      .join('') ||
      '<tr><td colspan="5" class="py-6 text-center text-text-muted">No shifts scheduled for this service.</td></tr>';

    qsa<HTMLButtonElement>(rosterBody, '[data-signoff]').forEach((button) => {
      button.addEventListener('click', () => {
        const shift = briefing?.attendance.find((entry) => entry.id === button.dataset.signoff);
        if (shift?.signoff) {
          toast(
            `Audit log · ${shift.userName} signed at ${timeLabel(shift.signoff.signedAt)} (HACCP + allergen).`,
            'info',
          );
          return;
        }
        void api
          .post(`/briefing/signoff/${button.dataset.signoff}`)
          .then(() => {
            toast(`${shift?.userName ?? 'Staff'} briefing sign-off recorded.`, 'success');
            chime('success');
            return load();
          })
          .catch((error) => toast(error instanceof Error ? error.message : 'Sign-off failed.', 'error'));
      });
    });

    const readiness = qsa<HTMLElement>(root, 'span').find((span) =>
      /Roster Readiness/.test(span.textContent ?? ''),
    );
    if (readiness) {
      readiness.textContent = `Roster Readiness: ${briefing.summary.signedOff} / ${briefing.summary.totalShifts} Acknowledged (${briefing.summary.signoffRate}%)`;
    }
  }

  function renderSummary() {
    if (!briefing) return;
    if (subtitle) {
      subtitle.textContent = `${new Date(briefing.date).toLocaleDateString('en-US', {
        weekday: 'long',
      })} Dinner Rush • ${new Date(briefing.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })} • Downtown Flagship`;
    }
    if (narrative) {
      narrative.textContent = briefing.narrative;
    }
    const kpi = (label: string, value: string) => {
      const element = qsa<HTMLElement>(root, 'span, div').find((candidate) =>
        (candidate.textContent ?? '').trim().toLowerCase().includes(label.toLowerCase()),
      );
      if (!element) return;
      const parent = element.parentElement;
      if (!parent) return;
      const numeric = qsa<HTMLElement>(parent, 'span').find((span) =>
        /[\d$.%]/.test(span.textContent ?? '') && (span.className ?? '').includes('font-mono'),
      );
      if (numeric) numeric.textContent = value;
    };
    kpi('Covers', String(briefing.summary.covers));
    kpi('Net Sales', money(briefing.summary.sales, 0));
    kpi('Active Staff', String(briefing.summary.activeStaff));
  }

  async function load() {
    try {
      briefing = await api.get<Briefing>('/briefing');
      render86();
      renderVip();
      renderDirectives();
      renderAttendance();
      renderSummary();
    } catch (error) {
      console.error(error);
      toast('Briefing feed unavailable.', 'error');
    }
  }

  regenerate?.addEventListener('click', () => {
    void api
      .post<{ narrative: string }>('/briefing/narrative')
      .then((result) => {
        if (narrative) narrative.textContent = result.narrative;
        toast('Nightcap narrative re-simulated from live telemetry.', 'success');
        chime('success');
      })
      .catch(() => toast('Could not re-simulate the narrative.', 'error'));
  });
  biometric?.addEventListener('click', () => {
    void api
      .post<{ recipients: string[]; simulated: boolean }>('/briefing/biometric-broadcast')
      .then((result) => {
        toast(
          `Biometric sign-off requirement sent to ${result.recipients.length} staff${
            result.simulated ? ' (simulated)' : ''
          }.`,
          'success',
        );
      })
      .catch(() => toast('Biometric broadcast failed.', 'error'));
  });
  qsa<HTMLButtonElement>(root, 'button').forEach((button) => {
    const text = (button.textContent ?? '').trim();
    if (text === 'Audit Log') {
      button.addEventListener('click', () =>
        toast('Audit log is synced to the HydraForge ledger.', 'info'),
      );
    }
    if (text.includes('Prompt POS')) {
      button.addEventListener('click', () =>
        toast('POS reprompt sent to the terminal.', 'success'),
      );
    }
  });

  const offs = [
    listen('BRIEFING_UPDATED', () => void load()),
    listen('GLOBAL_86_ITEM_UPDATE', () => void load()),
    listen('LOW_STOCK_ALERT', () => void load()),
    listen('RESERVATION_CREATED', () => void load()),
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

export default briefingBinder;
