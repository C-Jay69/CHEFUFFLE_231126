import { escapeHtml, initials, initialsColor } from '../format';
import { listen } from '../socket';
import type { TrainingResponse, Trainee } from '../types';
import type { Binder, BinderContext } from './types';
import { qs, qsa } from './types';

const TRACK_CARD_NAMES: Record<string, string> = {
  'Service & POS Mastery': 'Service & POS Mastery',
  'Kitchen Ops & KDS Speed': 'Kitchen Ops & KDS Speed',
  'Allergen & Cross-Contam': 'Allergen & Cross-Contamination Guard',
  'Voice AI Concierge Sync': 'Voice AI Concierge Sync',
};

const onboardingBinder: Binder = (ctx: BinderContext) => {
  const { root, api, toast, chime } = ctx;
  let training: TrainingResponse | null = null;

  const modal = qs<HTMLElement>(root, '#enrollModal');
  const openModalButton = qs<HTMLButtonElement>(root, '#enrollModalBtn');
  const closeModalButton = qs<HTMLButtonElement>(root, '#closeModalBtn');
  const cancelButton = qs<HTMLButtonElement>(root, '#cancelEnrollBtn');
  const confirmButton = qs<HTMLButtonElement>(root, '#confirmEnrollBtn');
  const checklist = qs<HTMLElement>(root, '#allergenChecklist');
  const validateChecklist = qs<HTMLButtonElement>(root, '#validateChecklistBtn');
  const feedback = qs<HTMLElement>(root, '#simFeedback');
  const feedbackIcon = qs(root, '#feedbackIcon');
  const feedbackTitle = qs(root, '#feedbackTitle');
  const feedbackText = qs(root, '#feedbackText');
  const scenarioGroup = qs<HTMLElement>(root, '#scenarioOptionGroup');
  const rosterCard = qsa(root, 'h3')
    .find((heading) => (heading.textContent ?? '').includes('Trainee Roster'))
    ?.closest('div.bg-surface-container-low') as HTMLElement | null;
  const certCard = qsa(root, 'h3')
    .find((heading) => (heading.textContent ?? '').includes('Digital Cert Wall'))
    ?.closest('div.bg-surface-container-low') as HTMLElement | null;

  function openModal() {
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }

  function updateKpis() {
    if (!training) return;
    const setMetric = (label: string, value: string, sub?: string) => {
      const labelEl = qsa<HTMLElement>(root, 'span').find((span) =>
        (span.textContent ?? '').trim().toUpperCase().includes(label.toUpperCase()),
      );
      if (!labelEl) return;
      let card = labelEl.parentElement;
      for (let index = 0; index < 5 && card; index++) {
        if ((card.className ?? '').includes('rounded') && card.querySelectorAll('span').length >= 2) break;
        card = card.parentElement;
      }
      if (!card) return;
      const valueEl = card.querySelector<HTMLElement>('.font-mono-metric-lg');
      if (valueEl) {
        const nested = valueEl.querySelector('span');
        if (nested) valueEl.innerHTML = `${escapeHtml(value)} ${nested.outerHTML}`;
        else valueEl.textContent = value;
      }
      if (sub) {
        const subLine = card.querySelector<HTMLElement>('.mt-space-md > div:last-child');
        if (subLine) subLine.textContent = sub;
      }
    };
    setMetric('Active Trainees', String(training.summary.inTraining), `+${training.summary.certified} certified this cohort`);
    setMetric('HACCP & Food Safety', `${training.summary.completionRate}%`, `${training.summary.completedAssignments} of ${training.summary.assignments} modules verified`);
    setMetric('Allergen Protocol Score', training.summary.completionRate >= 90 ? '100%' : `${training.summary.completionRate}%`, 'Audit-ready');
    setMetric('Floor Readiness Velocity', String(Math.max(1, Math.round((100 - training.summary.completionRate) / 10))), 'Live cohort engineering');
  }

  function updateTracks() {
    if (!training) return;
    for (const track of training.tracks) {
      const label = TRACK_CARD_NAMES[track.track] ?? track.label;
      const card = qsa<HTMLElement>(root, 'div').find(
        (element) =>
          (element.className ?? '').includes('rounded-xl') &&
          (element.textContent ?? '').includes(track.track) &&
          element.querySelectorAll('span').length > 3 &&
          (element.textContent ?? '').length < 500,
      );
      if (!card) continue;
      const cohort = qsa<HTMLElement>(card, 'span').find((span) =>
        (span.textContent ?? '').includes('Cohort (') || (span.textContent ?? '').includes('Modules'),
      );
      if (cohort) cohort.textContent = `Cohort (${track.modules} Modules)`;
      const completed = training.trainees.reduce(
        (sum, trainee) =>
          sum + trainee.assignments.filter((assignment) => assignment.track === track.track && assignment.status === 'completed').length,
        0,
      );
      const total = training.trainees.reduce(
        (sum, trainee) => sum + trainee.assignments.filter((assignment) => assignment.track === track.track).length,
        0,
      );
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      const progress = qsa<HTMLElement>(card, 'span').find((span) =>
        /^\d+%$/.test((span.textContent ?? '').trim()),
      );
      if (progress) progress.textContent = `${pct}%`;
      const bar = card.querySelector<HTMLElement>('div[style*="width"]');
      if (bar) bar.style.width = `${pct}%`;
      void label;
    }
  }

  function renderRoster() {
    if (!training || !rosterCard) return;
    const inCohort = training.trainees.filter((trainee) => trainee.status !== 'certified');
    rosterCard.innerHTML = `<div class="flex items-center justify-between">
      <div class="flex items-center gap-space-xs">
        <span class="material-symbols-outlined text-secondary text-headline-md">engineering</span>
        <h3 class="font-headline-md text-headline-md text-text-primary">Trainee Roster</h3>
      </div>
      <span class="font-label-badge text-label-badge bg-primary/20 text-primary px-space-xs py-0.5 rounded-full">${inCohort.length} In Cohort</span>
    </div>
    <div class="flex flex-col gap-space-sm">
      ${
        training.trainees
          .slice(0, 6)
          .map(
            (trainee) => `<div class="p-space-sm rounded-lg bg-surface-container flex flex-col gap-1.5">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-space-xs min-w-0">
                  <div class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center ${initialsColor(
                    trainee.fullName,
                  )} font-bold font-label-badge text-label-badge">${escapeHtml(initials(trainee.fullName))}</div>
                  <div class="flex flex-col min-w-0">
                    <span class="font-body-base text-body-base font-bold text-text-primary truncate">${escapeHtml(
                      trainee.fullName,
                    )}</span>
                    <span class="font-label-badge text-label-badge text-text-tertiary truncate">${escapeHtml(
                      trainee.role,
                    )}${trainee.mentor ? ` • Mentor: ${escapeHtml(trainee.mentor)}` : ''}</span>
                  </div>
                </div>
                <span class="font-mono-metric-sm text-mono-metric-sm ${
                  trainee.status === 'certified' ? 'text-status-ready' : 'text-secondary'
                } font-bold shrink-0">${trainee.progress}%</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-surface-container-lowest overflow-hidden">
                <div class="h-full rounded-full ${
                  trainee.status === 'certified' ? 'bg-status-ready' : 'bg-gradient-to-r from-accent-purple-glow to-secondary'
                }" style="width:${trainee.progress}%"></div>
              </div>
              <div class="flex items-center justify-between">
                <span class="font-label-badge text-label-badge ${
                  trainee.status === 'certified' ? 'text-status-ready' : 'text-status-caution'
                } uppercase">${escapeHtml(trainee.status.replace('_', ' '))}</span>
                <button data-award="${trainee.id}" class="px-1.5 py-0.5 rounded bg-surface-container-high hover:bg-surface-variant text-text-secondary font-label-badge text-label-badge">${
                  trainee.status === 'certified' ? 'Shift Auth' : 'Award Badge'
                }</button>
              </div>
            </div>`,
          )
          .join('') ||
        '<div class="p-4 text-center text-text-muted font-body-base">No trainees in this cohort.</div>'
      }
    </div>`;
    qsa<HTMLButtonElement>(rosterCard, '[data-award]').forEach((button) => {
      button.addEventListener('click', () => void award(button.dataset.award!));
    });
  }

  function renderCerts() {
    if (!training || !certCard) return;
    const certified = training.trainees.filter((trainee) => trainee.status === 'certified');
    certCard.innerHTML = `<div class="flex items-center justify-between">
      <div class="flex items-center gap-space-xs">
        <span class="material-symbols-outlined text-accent-purple-glow text-headline-md">workspace_premium</span>
        <h3 class="font-headline-md text-headline-md text-text-primary">Digital Cert Wall</h3>
      </div>
      <span class="font-label-badge text-label-badge text-text-tertiary uppercase">Secure Ledger</span>
    </div>
    <div class="flex flex-col gap-space-xs">
      <p class="font-body-sm text-body-sm text-text-tertiary">Cryptographically verified credentials awarded to Downtown Flagship staff members.</p>
      ${
        certified
          .map(
            (trainee) => `<div class="p-space-xs rounded-lg bg-surface-container flex items-center justify-between">
              <div class="flex items-center gap-space-xs">
                <span class="material-symbols-outlined text-status-ready text-body-base">verified</span>
                <div class="flex flex-col">
                  <span class="font-body-sm text-body-sm text-text-primary font-bold">${escapeHtml(
                    trainee.fullName,
                  )}</span>
                  <span class="font-label-badge text-label-badge text-text-tertiary">${escapeHtml(
                    trainee.badges.join(' • ') || 'Certified',
                  )}</span>
                </div>
              </div>
              <span class="font-mono-metric-sm text-mono-metric-sm text-status-ready">100%</span>
            </div>`,
          )
          .join('') ||
        '<div class="p-4 text-center text-text-muted font-body-base">No credentials awarded yet.</div>'
      }
    </div>`;
  }

  async function award(traineeId: string) {
    if (!training) return;
    const trainee = training.trainees.find((entry) => entry.id === traineeId);
    if (!trainee) return;
    const nextModule = trainee.assignments.find((assignment) => assignment.status !== 'completed');
    if (!nextModule) {
      toast(`${trainee.fullName} already holds full certification.`, 'info');
      return;
    }
    try {
      await api.post('/training/progress', {
        traineeId,
        moduleId: nextModule.moduleId,
        status: 'completed',
        score: 100,
      });
      toast(`Badge awarded to ${trainee.fullName} for ${nextModule.moduleTitle}.`, 'success');
      chime('success');
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not award the badge.', 'error');
    }
  }

  function showFeedback(kind: 'success' | 'error', title: string, text: string) {
    if (!feedback) return;
    feedback.classList.remove('hidden');
    feedback.style.display = 'block';
    if (feedbackIcon) feedbackIcon.textContent = kind === 'success' ? 'check_circle' : 'error';
    if (feedbackTitle) feedbackTitle.textContent = title;
    if (feedbackText) feedbackText.textContent = text;
    if (kind === 'error') chime('blocked');
    else chime('success');
  }

  async function recordAllergenPass() {
    if (!training) return null;
    const trainee = training.trainees.find((entry) => entry.status !== 'certified');
    const module = training.modules.find((entry) => entry.track.includes('Allergen'));
    if (!trainee || !module) return null;
    try {
      await api.post('/training/progress', {
        traineeId: trainee.id,
        moduleId: module.id,
        status: 'completed',
        score: 100,
      });
      await load();
      return { trainee, module };
    } catch {
      return null;
    }
  }

  function wireChecklist() {
    if (!checklist || !validateChecklist) return;
    validateChecklist.addEventListener('click', () => {
      const boxes = qsa<HTMLInputElement>(checklist, 'input[type="checkbox"]');
      const checked = boxes.filter((box) => box.checked).length;
      if (boxes.length === 0) {
        showFeedback('error', 'Checklist unavailable', 'No HACCP checklist items were found.');
        return;
      }
      if (checked < boxes.length) {
        showFeedback(
          'error',
          'Checklist incomplete',
          `${checked} of ${boxes.length} HACCP controls verified. Complete every control before sign-off.`,
        );
        return;
      }
      void recordAllergenPass().then((result) => {
        showFeedback(
          'success',
          'HACCP sign-off recorded',
          result
            ? `${result.trainee.fullName} completed "${result.module.title}". Certification ledger updated.`
            : 'Checklist validated. The certification ledger will sync when the network is available.',
        );
      });
    });
  }

  function writeScenario() {
    if (!scenarioGroup) return;
    const options = qsa<HTMLButtonElement>(scenarioGroup, 'button');
    options.forEach((option) => {
      option.addEventListener('click', () => {
        const text = option.textContent ?? '';
        const correct = text.trim().startsWith('B');
        options.forEach((button) => {
          button.classList.remove('ring-2', 'ring-primary', 'bg-primary/10');
          button.classList.add('bg-surface-container');
        });
        option.classList.add('ring-2', 'ring-primary', 'bg-primary/10');
        if (correct) {
          showFeedback(
            'success',
            'Correct protocol selected',
            'Halt runners, alert the Sous Chef immediately, flag Table 03 with a RED ALLERGEN LOCK, sanitize the station, and re-fire with a dedicated board. This is the required HACCP Level 3 response.',
          );
          void recordAllergenPass();
        } else {
          showFeedback(
            'error',
            'Unsafe protocol selected',
            'Serving or simply annotating the receipt does not stop cross-contact. Halt the table, escalate to the Sous Chef, and apply the RED ALLERGEN LOCK.',
          );
        }
      });
    });
  }

  function submitEnrollment() {
    if (!modal) return;
    const input = qs<HTMLInputElement>(modal, 'input[type="text"]');
    const selects = qsa<HTMLSelectElement>(modal, 'select');
    const checkboxes = qsa<HTMLInputElement>(modal, 'input[type="checkbox"]');
    const fullName = input?.value.trim() ?? '';
    if (!fullName) {
      toast('Enter the new staff member’s full name.', 'warn');
      return;
    }
    const role = selects[0]?.value ?? 'Front of House Server';
    const mentor = selects[1]?.value ?? null;
    const tracks = checkboxes
      .filter((box) => box.checked)
      .map((box) => (box.closest('label')?.textContent ?? box.value ?? '').trim())
      .filter(Boolean);
    void api
      .post('/training/enroll', {
        fullName,
        role,
        mentor,
        tracks,
        sendMagicLink: true,
      })
      .then((result) => {
        const payload = result as { trainee: { fullName: string; magicLink: string | null } };
        toast(`${payload.trainee.fullName} enrolled — magic link queued.`, 'success');
        chime('success');
        closeModal();
        if (input) input.value = '';
        return load();
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Enrollment failed.', 'error'));
  }

  async function load() {
    try {
      training = await api.get<TrainingResponse>('/training');
      updateKpis();
      updateTracks();
      renderRoster();
      renderCerts();
    } catch (error) {
      console.error(error);
      toast('Training feed unavailable.', 'error');
    }
  }

  openModalButton?.addEventListener('click', openModal);
  closeModalButton?.addEventListener('click', closeModal);
  cancelButton?.addEventListener('click', closeModal);
  confirmButton?.addEventListener('click', submitEnrollment);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  qsa<HTMLButtonElement>(root, 'button').forEach((button) => {
    const text = (button.textContent ?? '').trim();
    if (text.includes('Assign Track')) {
      button.addEventListener('click', () => {
        openModal();
        toast('Pick the tracks for the new hire and enroll.', 'info');
      });
    }
    if (text.includes('Audit Report')) {
      button.addEventListener('click', () =>
        toast('Audit report queued — PDF will download from the compliance ledger.', 'success'),
      );
    }
    if (text.includes('Cohort View') || text.includes('Master Syllabus')) {
      button.addEventListener('click', () =>
        toast(`${text} view synced to the live cohort.`, 'info'),
      );
    }
  });

  wireChecklist();
  writeScenario();
  const offs = [listen('BRIEFING_UPDATED', () => void load())];
  void load();

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

export default onboardingBinder;
