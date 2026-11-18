import { escapeHtml, initials, initialsColor, localInputValue, money, timeLabel } from '../format';
import { listen } from '../socket';
import type { Reservation, ReservationResponse, VoiceResponse } from '../types';
import type { Binder, BinderContext } from './types';
import { qs, qsa } from './types';

const reservationsBinder: Binder = (ctx: BinderContext) => {
  const { root, api, toast, chime } = ctx;
  let data: ReservationResponse | null = null;
  let filter = 'all';
  let search = '';

  const dateLabel = qsa<HTMLElement>(root, 'span').find((span) =>
    /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, \d{4}$/.test((span.textContent ?? '').trim()),
  );
  const searchInput = qsa<HTMLInputElement>(root, 'input').find((input) =>
    (input.placeholder ?? '').includes('Search party'),
  );
  const firstFilterButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').trim().startsWith('All ('),
  );
  const filterHost = firstFilterButton?.parentElement ?? null;
  const peakBucketLabel = qsa(root, 'span').find((span) =>
    (span.textContent ?? '').includes('PEAK ARRIVALS'),
  );
  const listHost =
    (peakBucketLabel?.closest('div.flex.flex-col.gap-space-sm') as HTMLElement | null) ?? null;
  const waitlistTitle = qsa(root, 'span, h3').find((element) =>
    (element.textContent ?? '').trim() === 'Live Walk-In Waitlist',
  );
  const waitlistHost =
    (waitlistTitle?.closest('div.rounded-xl') as HTMLElement | null) ?? null;
  const vipTitle = qsa(root, 'span').find((span) =>
    (span.textContent ?? '').includes('Loyalty Bank'),
  );
  const vipCard =
    (vipTitle?.closest('div.shadow-xl') as HTMLElement | null) ??
    (vipTitle?.closest('div.rounded-xl') as HTMLElement | null) ??
    null;
  const voiceTitle = qsa(root, 'span, h3').find((span) =>
    (span.textContent ?? '').trim() === 'Voice AI Transcripts',
  );
  const voiceCard = (voiceTitle?.closest('div.rounded-xl') as HTMLElement | null) ?? null;
  const addWaitlistButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Add Waitlist'),
  );
  const newReservationButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('New Reservation'),
  );
  const nextDay = qsa<HTMLButtonElement>(root, 'button').find((button) => {
    const icon = button.querySelector('.material-symbols-outlined')?.textContent;
    return icon === 'chevron_right';
  });
  const prevDay = qsa<HTMLButtonElement>(root, 'button').find((button) => {
    const icon = button.querySelector('.material-symbols-outlined')?.textContent;
    return icon === 'chevron_left';
  });

  function findKpi(label: string): HTMLElement | null {
    const labelEl = qsa<HTMLElement>(root, 'span').find((span) =>
      (span.textContent ?? '').trim().toLowerCase().includes(label.toLowerCase()),
    );
    if (!labelEl) return null;
    let card = labelEl.parentElement;
    for (let index = 0; index < 5 && card; index++) {
      if ((card.className ?? '').includes('rounded') && card.querySelectorAll('span').length >= 2) return card;
      card = card.parentElement;
    }
    return null;
  }
  function setKpi(label: string, value: string) {
    const card = findKpi(label);
    if (!card) return;
    const numeric = qsa<HTMLElement>(card, 'span').find((span) =>
      /^[\d,.$%]+/.test((span.textContent ?? '').trim()) && (span.className ?? '').includes('font-mono'),
    );
    if (numeric) numeric.textContent = value;
  }

  function statusMeta(status: string) {
    switch (status) {
      case 'seated':
        return { label: 'SEATED', classes: 'bg-status-ready/20 text-status-ready' };
      case 'waitlist':
        return { label: 'WAITLIST', classes: 'bg-status-caution/20 text-status-caution' };
      case 'completed':
        return { label: 'COMPLETED', classes: 'bg-surface-variant text-text-tertiary' };
      case 'cancelled':
        return { label: 'CANCELLED', classes: 'bg-status-urgent/20 text-status-urgent' };
      case 'no_show':
        return { label: 'NO SHOW', classes: 'bg-status-urgent/20 text-status-urgent' };
      default:
        return { label: 'CONFIRMED', classes: 'bg-secondary/20 text-secondary' };
    }
  }

  function visibleReservations(): Reservation[] {
    if (!data) return [];
    return data.reservations.filter((reservation) => {
      const filterOk =
        filter === 'all' ||
        reservation.status === filter ||
        (filter === 'vip' && reservation.vip) ||
        (filter === 'voice_ai' && reservation.source === 'voice_ai');
      const searchOk =
        !search ||
        reservation.guestName.toLowerCase().includes(search) ||
        reservation.phone.toLowerCase().includes(search) ||
        (reservation.notes ?? '').toLowerCase().includes(search) ||
        (reservation.occasion ?? '').toLowerCase().includes(search);
      return filterOk && searchOk;
    });
  }

  function renderFilters() {
    if (!filterHost || !data) return;
    const entries = [
      { key: 'all', label: `All (${data.stats.total})` },
      { key: 'seated', label: `Seated (${data.stats.seated})` },
      { key: 'confirmed', label: `Confirmed (${data.stats.confirmed})` },
      { key: 'waitlist', label: `Waitlist (${data.stats.waitlist})` },
      { key: 'vip', label: `VIP / Special (${data.stats.vip})` },
      { key: 'voice_ai', label: `AI Booked (${data.stats.voiceAi})` },
    ];
    filterHost.innerHTML = entries
      .map(
        (entry) => `<button data-filter="${entry.key}" class="px-space-md py-1.5 rounded-lg ${
          filter === entry.key
            ? 'bg-surface-container-highest text-text-primary font-bold shadow-sm'
            : 'text-text-secondary hover:text-text-primary'
        } font-body-sm text-body-sm whitespace-nowrap transition-colors">${entry.label}</button>`,
      )
      .join('');
    qsa<HTMLButtonElement>(filterHost, '[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        filter = button.dataset.filter ?? 'all';
        renderFilters();
        renderList();
      });
    });
  }

  function bucketLabel(time: string) {
    return new Date(time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function renderList() {
    if (!listHost || !data) return;
    const reservations = visibleReservations();
    const buckets = new Map<string, Reservation[]>();
    for (const reservation of reservations) {
      const key = bucketLabel(reservation.reservationTime);
      buckets.set(key, [...(buckets.get(key) ?? []), reservation]);
    }
    listHost.innerHTML = [...buckets.entries()]
      .map(
        ([bucket, entries]) => `<div class="flex items-center gap-space-sm mt-space-xs">
          <span class="font-mono-metric-md text-mono-metric-md text-secondary">${bucket}</span>
          <span class="font-label-eyebrow text-label-eyebrow text-text-muted">${entries.reduce(
            (sum, entry) => sum + entry.partySize,
            0,
          )} COVERS • ${entries.length} PART${entries.length === 1 ? 'Y' : 'IES'}</span>
          <div class="flex-1 h-px bg-surface-container-high"></div>
        </div>
        ${entries.map(renderCard).join('')}`,
      )
      .join('') ||
      `<div class="p-8 text-center text-text-muted font-body-base">No reservations match this view.</div>`;
    qsa<HTMLButtonElement>(listHost, '[data-seat]').forEach((button) => {
      button.addEventListener('click', () => void seat(button.dataset.seat!));
    });
    qsa<HTMLButtonElement>(listHost, '[data-notify]').forEach((button) => {
      button.addEventListener('click', () => {
        toast(`Table notification sent to ${button.dataset.notify}.`, 'success');
        chime('ticket');
      });
    });
  }

  function renderCard(reservation: Reservation) {
    const meta = statusMeta(reservation.status);
    const sourceLabel =
      reservation.source === 'voice_ai'
        ? 'Voice AI Booked'
        : reservation.source === 'walk_in'
          ? 'Walk-in'
          : reservation.source === 'web'
            ? 'Web'
            : 'Host';
    const tableLabel = reservation.tableNumber
      ? `${reservation.tableNumber}${reservation.zone ? ` (${reservation.zone.split(' ')[0]})` : ''}`
      : reservation.status === 'waitlist'
        ? 'Waitlist'
        : 'Table pending';
    const allergies = /allerg/i.test(reservation.notes ?? '');
    return `<div class="group relative bg-surface-container-low hover:bg-surface-container p-space-md rounded-xl shadow-md transition-all ${
      reservation.vip ? 'bg-gradient-to-r from-accent-purple-glow/10 via-transparent to-transparent' : ''
    }">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
        <div class="flex items-start gap-space-md min-w-0">
          <div class="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center ${
            reservation.vip ? 'text-accent-purple-glow' : initialsColor(reservation.guestName)
          } font-bold font-mono-metric-md shrink-0">${escapeHtml(initials(reservation.guestName))}</div>
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-space-xs flex-wrap">
              <span class="font-headline-md text-headline-md text-text-primary ${reservation.vip ? 'font-bold' : ''}">${escapeHtml(
                reservation.guestName,
              )}</span>
              ${
                reservation.vip
                  ? '<span class="px-space-xs py-0.5 rounded bg-accent-lime/20 text-accent-lime font-label-badge text-label-badge font-bold flex items-center gap-0.5"><span class="material-symbols-outlined text-label-badge">verified</span>VIP</span>'
                  : ''
              }
              <span class="px-space-xs py-0.5 rounded bg-surface-container-highest text-secondary font-label-badge text-label-badge">${escapeHtml(
                tableLabel,
              )}</span>
              <span class="${meta.classes} px-space-xs py-0.5 rounded font-label-badge text-label-badge font-bold">${meta.label}</span>
            </div>
            <div class="flex items-center gap-space-md mt-1 text-text-secondary font-body-sm text-body-sm flex-wrap">
              <span class="flex items-center gap-1 text-text-primary"><span class="material-symbols-outlined text-body-sm text-secondary">group</span>Party of ${reservation.partySize}</span>
              <span>•</span>
              <span class="text-text-muted">Arrival ${timeLabel(reservation.reservationTime)}</span>
              ${
                reservation.occasion
                  ? `<span>•</span><span class="text-accent-purple-glow">${escapeHtml(reservation.occasion)}</span>`
                  : ''
              }
              <span>•</span>
              <span class="${reservation.source === 'voice_ai' ? 'text-accent-purple-glow' : 'text-text-muted'} flex items-center gap-1"><span class="material-symbols-outlined text-body-sm">${
                reservation.source === 'voice_ai' ? 'neurology' : 'person'
              }</span>${sourceLabel}</span>
            </div>
            ${
              reservation.notes
                ? `<span class="font-body-sm text-body-sm ${allergies ? 'text-status-urgent font-semibold' : 'text-text-tertiary'} mt-1">${escapeHtml(
                    reservation.notes,
                  )}</span>`
                : ''
            }
          </div>
        </div>
        <div class="flex items-center gap-space-sm justify-between md:justify-end shrink-0">
          <div class="flex flex-col items-end gap-1">
            <span class="font-mono-metric-sm text-mono-metric-sm text-text-secondary">${escapeHtml(
              reservation.phone,
            )}</span>
            <span class="font-label-eyebrow text-label-eyebrow text-text-muted">${reservation.serverName ? `Server ${escapeHtml(reservation.serverName)}` : 'Unassigned'}</span>
          </div>
          <div class="flex flex-col gap-1">
            ${
              reservation.status === 'seated'
                ? `<button data-notify="${escapeHtml(reservation.guestName)}" class="px-space-md py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-text-primary font-body-sm text-body-sm font-bold transition-all whitespace-nowrap">Notify Table</button>`
                : `<button data-seat="${reservation.id}" class="px-space-md py-2 rounded-lg bg-status-ready hover:bg-emerald-600 text-text-primary font-body-sm text-body-sm font-bold shadow-md transition-all whitespace-nowrap">${
                    reservation.tableNumber ? `Seat ${reservation.tableNumber}` : 'Seat Now'
                  }</button>`
            }
            <button data-notify="${escapeHtml(reservation.guestName)}" class="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-secondary font-label-badge text-label-badge transition-all">SEND SMS</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderWaitlist() {
    if (!waitlistHost || !data) return;
    const card = waitlistHost;
    const waiting = data.reservations.filter((reservation) => reservation.status === 'waitlist');
    card.innerHTML = `<div class="flex items-center justify-between">
      <div class="flex items-center gap-space-xs">
        <span class="material-symbols-outlined text-status-caution">hourglass_empty</span>
        <span class="font-headline-md text-headline-md text-text-primary">Live Walk-In Waitlist</span>
      </div>
      <span class="font-mono-metric-md text-mono-metric-md text-status-caution">${waiting.length}</span>
    </div>
    <div class="flex items-center justify-between font-label-badge text-label-badge text-text-tertiary uppercase mt-space-sm">
      <span>${waiting.length} Parties</span><span>Auto-sort by Quoted Time</span>
    </div>
    <div class="flex flex-col gap-space-sm mt-space-sm">
      ${
        waiting
          .map(
            (reservation, index) => `<div class="flex items-center justify-between p-space-sm rounded-lg bg-surface-container-high">
              <div class="flex items-center gap-space-xs min-w-0">
                <span class="w-6 h-6 rounded-full bg-surface-variant flex items-center justify-center font-mono-metric-sm text-mono-metric-sm text-text-primary">${index + 1}</span>
                <div class="flex flex-col min-w-0">
                  <span class="font-body-base text-body-sm font-bold text-text-primary truncate">${escapeHtml(
                    reservation.guestName,
                  )} (${reservation.partySize}p)</span>
                  <span class="font-mono-metric-sm text-mono-metric-sm ${
                    index === 0 ? 'text-status-urgent' : index === 1 ? 'text-status-caution' : 'text-text-secondary'
                  }">Quoted ${timeLabel(reservation.reservationTime)}</span>
                </div>
              </div>
              <button data-seat="${reservation.id}" class="px-space-sm py-1 rounded bg-status-ready/20 text-status-ready font-label-badge text-label-badge font-bold hover:bg-status-ready/30 transition-colors">SEAT NOW</button>
            </div>`,
          )
          .join('') ||
        '<div class="p-4 text-center text-text-muted font-body-base">Waitlist is clear.</div>'
      }
    </div>`;
    qsa<HTMLButtonElement>(card, '[data-seat]').forEach((button) => {
      button.addEventListener('click', () => void seat(button.dataset.seat!));
    });
  }

  async function renderVipAndVoice() {
    if (!data) return;
    const vip = data.reservations.find((reservation) => reservation.vip) ?? data.reservations[0];
    if (vipCard && vip) {
      vipCard.innerHTML = `<div class="p-space-md bg-gradient-to-r from-accent-purple-glow/20 to-secondary/10 border-b border-border-subtle flex items-start justify-between">
        <div class="flex items-center gap-space-sm">
          <div class="w-12 h-12 rounded-xl bg-accent-purple-glow/20 text-accent-purple-glow flex items-center justify-center font-bold font-mono-metric-md">${escapeHtml(
            initials(vip.guestName),
          )}</div>
          <div class="flex flex-col">
            <span class="font-headline-md text-headline-md text-text-primary font-bold">${escapeHtml(
              vip.guestName,
            )}</span>
            <span class="font-label-badge text-label-badge text-accent-lime uppercase">VIP • ${escapeHtml(
              vip.occasion ?? 'Repeat Guest',
            )}</span>
            <span class="font-mono-metric-sm text-mono-metric-sm text-text-secondary mt-0.5">${escapeHtml(
              vip.phone,
            )}</span>
          </div>
        </div>
        <button class="material-symbols-outlined text-text-tertiary hover:text-text-primary" data-vip-edit>edit</button>
      </div>
      <div class="p-space-md grid grid-cols-2 gap-space-sm">
        <div class="p-space-sm rounded-lg bg-surface-container flex flex-col">
          <span class="font-label-badge text-label-badge text-text-tertiary uppercase">Party</span>
          <span class="font-mono-metric-md text-mono-metric-md text-text-primary">${vip.partySize} guests</span>
        </div>
        <div class="p-space-sm rounded-lg bg-surface-container flex flex-col">
          <span class="font-label-badge text-label-badge text-text-tertiary uppercase">Table</span>
          <span class="font-mono-metric-md text-mono-metric-md text-secondary">${escapeHtml(
            vip.tableNumber ?? 'Pending',
          )}</span>
        </div>
        <div class="p-space-sm rounded-lg bg-surface-container flex flex-col col-span-2">
          <span class="font-label-badge text-label-badge text-text-tertiary uppercase">Arrival</span>
          <span class="font-mono-metric-md text-mono-metric-md text-text-primary">${timeLabel(
            vip.reservationTime,
          )} · ${escapeHtml(vip.status)} · ${escapeHtml(vip.source)}</span>
        </div>
        ${
          vip.notes
            ? `<div class="p-space-sm rounded-lg bg-status-urgent/10 border border-status-urgent/30 col-span-2"><span class="font-label-badge text-label-badge text-status-urgent uppercase">Alert</span><div class="font-body-sm text-body-sm text-text-primary">${escapeHtml(
                vip.notes,
              )}</div></div>`
            : ''
        }
        <button class="col-span-2 px-space-md py-2 rounded-lg bg-gradient-to-r from-accent-purple-glow to-secondary text-bg-canvas font-body-sm font-bold" data-vip-seat>Seat ${escapeHtml(
          vip.tableNumber ?? 'guest',
        )}</button>
      </div>`;
      vipCard.querySelector('[data-vip-seat]')?.addEventListener('click', () => void seat(vip.id));
    }
    if (voiceCard) {
      try {
        const voice = await api.get<VoiceResponse>('/voice/calls?limit=4');
        voiceCard.innerHTML = `<div class="p-space-md border-b border-border-subtle flex items-center justify-between">
          <div class="flex items-center gap-space-xs">
            <span class="material-symbols-outlined text-accent-purple-glow">graphic_eq</span>
            <span class="font-headline-md text-headline-md text-text-primary">Voice AI Transcripts</span>
          </div>
          <span class="px-space-xs py-0.5 rounded bg-status-ready/20 text-status-ready font-label-badge text-label-badge font-bold">LIVE</span>
        </div>
        <div class="p-space-md flex flex-col gap-space-sm">
          ${voice.calls
            .map(
              (call) => `<div class="p-space-sm rounded-lg bg-surface-container">
                <div class="flex items-center justify-between">
                  <span class="font-mono-metric-sm text-mono-metric-sm text-secondary">${escapeHtml(
                    call.callerPhone,
                  )}</span>
                  <span class="font-label-badge text-label-badge ${
                    call.outcome === 'reservation_booked' ? 'text-status-ready' : 'text-text-tertiary'
                  } uppercase">${escapeHtml(call.outcome.replace(/_/g, ' '))}</span>
                </div>
                <p class="font-body-sm text-body-sm text-text-secondary mt-1 line-clamp-2">${escapeHtml(
                  call.summary ?? call.transcript ?? '',
                )}</p>
                <div class="flex items-center justify-between mt-1 font-mono-metric-sm text-mono-metric-sm text-text-muted">
                  <span>${call.durationSeconds}s</span>
                  <span>${timeLabel(call.createdAt)}</span>
                </div>
              </div>`,
            )
            .join('')}
          <div class="grid grid-cols-2 gap-space-xs">
            <div class="p-space-xs rounded bg-surface-container-high text-center"><span class="font-mono-metric-md text-mono-metric-md text-text-primary block">${voice.stats.bookingRate}%</span><span class="font-label-badge text-label-badge text-text-tertiary">BOOKING RATE</span></div>
            <div class="p-space-xs rounded bg-surface-container-high text-center"><span class="font-mono-metric-md text-mono-metric-md text-status-ready block">${voice.stats.booked}</span><span class="font-label-badge text-label-badge text-text-tertiary">AI BOOKINGS</span></div>
          </div>
        </div>`;
      } catch {
        /* static card fallback */
      }
    }
  }

  function updateKpis() {
    if (!data) return;
    setKpi("Today's Covers", String(data.stats.covers));
    setKpi('Autonomous Bookings', String(data.stats.voiceAi));
    setKpi('Active Waitlist', String(data.stats.waitlist));
    setKpi('VIP Arrivals', String(data.stats.vip));
    const target = qsa<HTMLElement>(root, 'span').find((span) =>
      (span.textContent ?? '').trim().startsWith('/ ') && (span.textContent ?? '').includes('Target'),
    );
    if (target) target.textContent = `/ ${Math.max(210, data.stats.covers + 26)} Target`;
    const peakLabel = qsa<HTMLElement>(root, 'span').find((span) =>
      (span.textContent ?? '').trim() === 'Peak Saturation',
    );
    const peakCard = peakLabel?.parentElement?.parentElement;
    const peak = peakCard
      ? qsa<HTMLElement>(peakCard, 'div, span').find(
          (element) =>
            (element.className ?? '').includes('font-mono-metric') &&
            /%$/.test((element.textContent ?? '').trim()),
        )
      : null;
    if (peak) peak.textContent = `${Math.min(100, Math.round((data.stats.covers / 210) * 100))}%`;
    if (dateLabel) {
      dateLabel.textContent = new Date(data.date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }

  async function seat(id: string) {
    try {
      const reservation = await api.post<Reservation>(`/reservations/${id}/seat`);
      toast(`${reservation.guestName} seated at ${reservation.tableNumber ?? 'the next table'}.`, 'success');
      chime('success');
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not seat the party.', 'error');
    }
  }

  async function load() {
    try {
      data = await api.get<ReservationResponse>('/reservations');
      renderFilters();
      renderList();
      renderWaitlist();
      updateKpis();
      await renderVipAndVoice();
    } catch (error) {
      console.error(error);
      toast('Reservations feed unavailable.', 'error');
    }
  }

  function openReservationForm(status: 'confirmed' | 'waitlist' = 'confirmed') {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-bg-canvas/80 backdrop-blur-md p-space-md';
    const defaultTime = new Date();
    defaultTime.setHours(status === 'waitlist' ? 21 : 19, 30, 0, 0);
    overlay.innerHTML = `<div class="bg-surface-container-high rounded-xl max-w-lg w-full p-space-lg shadow-2xl flex flex-col gap-space-md">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-space-xs">
          <span class="material-symbols-outlined text-secondary text-headline-md">book_online</span>
          <span class="font-headline-md text-headline-md text-text-primary">${status === 'waitlist' ? 'Add Walk-In Waitlist' : 'New Reservation'}</span>
        </div>
        <button data-close class="p-space-xs rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-variant transition-colors"><span class="material-symbols-outlined text-body-base">close</span></button>
      </div>
      <div class="grid grid-cols-2 gap-space-sm">
        <label class="flex flex-col gap-1 col-span-2"><span class="font-label-badge text-label-badge text-text-tertiary uppercase">Guest name</span><input data-field="guestName" class="sh-input" placeholder="e.g. Marcus Sterling" /></label>
        <label class="flex flex-col gap-1"><span class="font-label-badge text-label-badge text-text-tertiary uppercase">Phone</span><input data-field="phone" class="sh-input" placeholder="+1 555-0100" /></label>
        <label class="flex flex-col gap-1"><span class="font-label-badge text-label-badge text-text-tertiary uppercase">Party size</span><input data-field="partySize" type="number" min="1" max="40" value="${status === 'waitlist' ? 2 : 4}" class="sh-input" /></label>
        <label class="flex flex-col gap-1 col-span-2"><span class="font-label-badge text-label-badge text-text-tertiary uppercase">${status === 'waitlist' ? 'Quoted time' : 'Reservation time'}</span><input data-field="time" type="datetime-local" value="${localInputValue(
          defaultTime,
        )}" class="sh-input" /></label>
        <label class="flex flex-col gap-1 col-span-2"><span class="font-label-badge text-label-badge text-text-tertiary uppercase">Notes / allergies</span><input data-field="notes" class="sh-input" placeholder="Allergies, occasion, seating preference..." /></label>
        <label class="flex items-center gap-2 col-span-2"><input data-field="vip" type="checkbox" class="w-5 h-5 rounded bg-surface-container" /><span class="font-body-sm text-body-sm text-text-secondary">VIP / special guest</span></label>
      </div>
      <div class="flex justify-end gap-space-sm">
        <button data-close class="px-space-md py-2 rounded-lg bg-surface-container text-text-secondary font-body-sm font-bold">Cancel</button>
        <button data-submit class="px-space-md py-2 rounded-lg bg-gradient-to-r from-accent-purple-glow to-secondary text-bg-canvas font-body-sm font-bold">${status === 'waitlist' ? 'Add to Waitlist' : 'Create Reservation'}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    qsa<HTMLElement>(overlay, '[data-close]').forEach((button) => button.addEventListener('click', close));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    qsa<HTMLButtonElement>(overlay, '[data-submit]')[0]?.addEventListener('click', () => {
      const field = (name: string) =>
        qs<HTMLInputElement>(overlay, `[data-field="${name}"]`)?.value ?? '';
      const guestName = field('guestName').trim();
      const phone = field('phone').trim();
      const partySize = Number(field('partySize'));
      const time = field('time');
      if (!guestName || !phone || !partySize || !time) {
        toast('Name, phone, party size and time are required.', 'warn');
        return;
      }
      void api
        .post('/reservations', {
          guestName,
          phone,
          partySize,
          reservationTime: new Date(time).toISOString(),
          status,
          source: status === 'waitlist' ? 'walk_in' : 'host',
          notes: field('notes') || null,
          vip: qs<HTMLInputElement>(overlay, '[data-field="vip"]')?.checked ?? false,
        })
        .then(() => {
          toast(`${guestName} ${status === 'waitlist' ? 'added to the waitlist' : 'reservation created'}.`, 'success');
          chime('success');
          close();
          return load();
        })
        .catch((error) => toast(error instanceof Error ? error.message : 'Could not create the reservation.', 'error'));
    });
  }

  searchInput?.addEventListener('input', () => {
    search = searchInput.value.trim().toLowerCase();
    renderList();
  });
  newReservationButton?.addEventListener('click', () => openReservationForm('confirmed'));
  addWaitlistButton?.addEventListener('click', () => openReservationForm('waitlist'));
  nextDay?.addEventListener('click', () => toast('Use the calendar to jump to another service date.', 'info'));
  prevDay?.addEventListener('click', () => toast('Use the calendar to jump to another service date.', 'info'));

  const offs = [
    listen('RESERVATION_CREATED', () => void load()),
    listen('RESERVATION_UPDATED', () => void load()),
    listen('VOICE_CALL_COMPLETED', () => void load()),
    listen('TABLE_STAGE_ADVANCED', () => void load()),
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

export default reservationsBinder;
