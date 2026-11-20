'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Progress,
  SearchInput,
  Stat,
  Tabs,
} from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { titleCase } from '@/lib/format';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import type { Trainee, TrainingResponse } from '@/lib/types';

const ROLE_OPTIONS = [
  { value: 'server', label: 'Server' },
  { value: 'bartender', label: 'Bartender' },
  { value: 'host', label: 'Host' },
  { value: 'line_cook', label: 'Line Cook' },
  { value: 'chef_expo', label: 'Chef / Expo' },
  { value: 'floor_manager', label: 'Floor Manager' },
  { value: 'general_manager', label: 'General Manager' },
  { value: 'owner', label: 'Owner' },
];

type StatusTab = 'all' | 'in_training' | 'certified';

function traineeStatusTone(status: string): 'ready' | 'caution' | 'neutral' {
  if (status === 'certified') return 'ready';
  if (status === 'in_training') return 'caution';
  return 'neutral';
}

function traineeStatusLabel(status: string) {
  if (status === 'certified') return 'Certified';
  if (status === 'in_training') return 'In training';
  return titleCase(status);
}

function progressTone(value: number): 'ready' | 'secondary' | 'caution' {
  if (value >= 100) return 'ready';
  if (value >= 50) return 'secondary';
  return 'caution';
}

const inputClass =
  'h-11 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-sm text-body-sm text-text-primary outline-none transition-colors focus:border-secondary';

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">{label}</span>
      {children}
      {hint && <span className="font-body-sm text-body-sm text-text-subtle">{hint}</span>}
    </label>
  );
}

export default function OnboardingPage() {
  const [data, setData] = useState<TrainingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<StatusTab>('all');
  const [query, setQuery] = useState('');
  const [awarding, setAwarding] = useState<string | null>(null);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fullName: '', role: 'server', mentor: '' });
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const response = await api.get<TrainingResponse>('/training');
      setData(response);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not load training.',
        'error',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const off = listen('BRIEFING_UPDATED', () => void load());
    return () => off();
  }, [load]);

  const summary = data?.summary;
  const tracks = data?.tracks ?? [];
  const trainees = data?.trainees ?? [];
  const modules = data?.modules ?? [];

  const trackProgress = useMemo(() => {
    const map: Record<string, { completed: number; total: number }> = {};
    for (const trainee of trainees) {
      for (const assignment of trainee.assignments) {
        const entry = map[assignment.track] ?? { completed: 0, total: 0 };
        entry.total += 1;
        if (assignment.status === 'completed') entry.completed += 1;
        map[assignment.track] = entry;
      }
    }
    return map;
  }, [trainees]);

  const percentForTrack = (track: string) => {
    const entry = trackProgress[track];
    if (!entry || entry.total === 0) return 0;
    return Math.round((entry.completed / entry.total) * 100);
  };

  const filteredTrainees = useMemo(() => {
    const term = query.trim().toLowerCase();
    return trainees.filter((trainee) => {
      if (tab === 'certified' && trainee.status !== 'certified') return false;
      if (tab === 'in_training' && trainee.status === 'certified') return false;
      if (!term) return true;
      return (
        trainee.fullName.toLowerCase().includes(term) ||
        trainee.role.toLowerCase().includes(term) ||
        (trainee.mentor ?? '').toLowerCase().includes(term)
      );
    });
  }, [trainees, tab, query]);

  const counts = useMemo(
    () => ({
      all: trainees.length,
      in_training: trainees.filter((trainee) => trainee.status !== 'certified').length,
      certified: trainees.filter((trainee) => trainee.status === 'certified').length,
    }),
    [trainees],
  );

  const nextIncomplete = (trainee: Trainee) => {
    const order = new Map(modules.map((module) => [module.id, module.displayOrder]));
    return (
      [...trainee.assignments]
        .filter((assignment) => assignment.status !== 'completed')
        .sort(
          (a, b) =>
            (order.get(a.moduleId) ?? 0) - (order.get(b.moduleId) ?? 0) ||
            a.moduleTitle.localeCompare(b.moduleTitle),
        )[0] ?? null
    );
  };

  const awardBadge = async (trainee: Trainee) => {
    const next = nextIncomplete(trainee);
    if (!next) {
      showToast(`${trainee.fullName} has completed every assignment.`, 'info');
      return;
    }
    setAwarding(trainee.id);
    try {
      await api.post('/training/progress', {
        traineeId: trainee.id,
        moduleId: next.moduleId,
        status: 'completed',
        score: 100,
      });
      showToast(`Badge awarded to ${trainee.fullName} for ${next.moduleTitle}.`, 'success');
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not award the badge.',
        'error',
      );
    } finally {
      setAwarding(null);
    }
  };

  const openEnroll = () => {
    setForm({ fullName: '', role: 'server', mentor: '' });
    setSelectedTracks([]);
    setEnrollOpen(true);
  };

  const toggleTrack = (track: string) => {
    setSelectedTracks((current) =>
      current.includes(track)
        ? current.filter((entry) => entry !== track)
        : [...current, track],
    );
  };

  const enroll = async () => {
    const fullName = form.fullName.trim();
    if (!fullName) {
      showToast('Enter the trainee’s full name.', 'warn');
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{ trainee?: { magicLink?: string } }>(
        '/training/enroll',
        {
          fullName,
          role: form.role,
          mentor: form.mentor.trim() || null,
          tracks: selectedTracks,
          sendMagicLink: true,
        },
      );
      showToast(
        `${fullName} enrolled${result?.trainee?.magicLink ? ' — magic link sent' : ''}.`,
        'success',
      );
      setEnrollOpen(false);
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not enroll the trainee.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow="People ops"
          icon="school"
          title="Training"
          description="Enroll new hires, track their progress through each station track, and award badges as modules complete."
          actions={
            <>
              <Button
                variant="ghost"
                icon="refresh"
                loading={refreshing}
                onClick={() => void load(true)}
              >
                Refresh
              </Button>
              <Button variant="primary" icon="person_add" onClick={openEnroll}>
                Enroll
              </Button>
            </>
          }
        />

        {loading && !data ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-headline-xl text-secondary">
              progress_activity
            </span>
          </div>
        ) : !data || !summary ? (
          <EmptyState
            icon="cloud_off"
            title="Training unavailable"
            description="The training API did not respond. Check the operations service and try again."
            action={
              <Button variant="primary" icon="refresh" onClick={() => void load(true)}>
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label="Active trainees"
                value={summary.inTraining}
                icon="groups"
                tone="caution"
                hint={`${summary.trainees} on the roster`}
              />
              <Stat
                label="Certified"
                value={summary.certified}
                icon="verified"
                tone="ready"
                hint="All modules complete"
              />
              <Stat
                label="Completion"
                value={`${summary.completionRate}%`}
                icon="donut_large"
                tone="secondary"
                hint={`${summary.completedAssignments}/${summary.assignments} assignments`}
              />
            </div>

            <Card
              title="Training tracks"
              icon="route"
              subtitle="Completion across every assigned trainee"
              actions={<Badge tone="violet">{tracks.length} tracks</Badge>}
            >
              {tracks.length === 0 ? (
                <EmptyState
                  icon="route"
                  title="No tracks configured"
                  description="Seed the training modules to build the four station tracks."
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {tracks.map((track) => {
                    const percent = percentForTrack(track.track);
                    return (
                      <div
                        key={track.track}
                        className="flex min-h-[116px] flex-col gap-2 rounded-xl border border-border-subtle bg-surface-container p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-body-sm text-body-sm font-bold text-text-primary">
                            {track.label}
                          </span>
                          <span className="shrink-0 font-mono-metric-sm text-mono-metric-sm font-bold text-text-secondary">
                            {percent}%
                          </span>
                        </div>
                        <span className="font-body-sm text-body-sm text-text-tertiary">
                          {track.modules} modules · {track.minutes} min
                        </span>
                        <Progress
                          value={percent}
                          tone={progressTone(percent)}
                          className="mt-auto"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card
              title="Trainees"
              icon="groups"
              actions={<Badge tone="neutral">{summary.trainees} people</Badge>}
            >
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Tabs
                  value={tab}
                  onChange={(id) => setTab(id as StatusTab)}
                  items={[
                    { id: 'all', label: 'All', count: counts.all },
                    { id: 'in_training', label: 'In training', count: counts.in_training },
                    { id: 'certified', label: 'Certified', count: counts.certified },
                  ]}
                />
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Search name, role, or mentor…"
                  className="sm:ml-auto sm:max-w-[260px]"
                />
              </div>

              {filteredTrainees.length === 0 ? (
                <EmptyState
                  icon="school"
                  title={trainees.length === 0 ? 'No trainees yet' : 'No trainees match'}
                  description={
                    trainees.length === 0
                      ? 'Enroll the first hire to start their onboarding track.'
                      : 'Try another status filter or clear the search.'
                  }
                  action={
                    trainees.length === 0 ? (
                      <Button variant="primary" icon="person_add" onClick={openEnroll}>
                        Enroll
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        icon="filter_alt_off"
                        onClick={() => {
                          setTab('all');
                          setQuery('');
                        }}
                      >
                        Clear filters
                      </Button>
                    )
                  }
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredTrainees.map((trainee) => {
                    const next = nextIncomplete(trainee);
                    return (
                      <div
                        key={trainee.id}
                        className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-container p-3 lg:flex-row lg:items-center"
                      >
                        <Avatar name={trainee.fullName} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-body-base text-body-base font-bold text-text-primary">
                              {trainee.fullName}
                            </span>
                            <Badge tone={traineeStatusTone(trainee.status)}>
                              {traineeStatusLabel(trainee.status)}
                            </Badge>
                            {trainee.badges.length > 0 && (
                              <Badge tone="violet">
                                {trainee.badges.length} badge
                                {trainee.badges.length === 1 ? '' : 's'}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-body-sm text-body-sm text-text-tertiary">
                            <span>{titleCase(trainee.role)}</span>
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">
                                supervisor_account
                              </span>
                              {trainee.mentor || 'No mentor'}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Progress
                              value={trainee.progress}
                              tone={progressTone(trainee.progress)}
                              className="flex-1"
                            />
                            <span className="w-10 text-right font-mono-metric-sm text-mono-metric-sm font-bold text-text-secondary">
                              {trainee.progress}%
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center">
                          <Button
                            variant="secondary"
                            icon="workspace_premium"
                            loading={awarding === trainee.id}
                            disabled={!next}
                            onClick={() => void awardBadge(trainee)}
                            className="min-w-[150px]"
                          >
                            Award badge
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      <Modal
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        title="Enroll trainee"
        description="Create the onboarding record and send a magic link."
        icon="person_add"
        maxWidth="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEnrollOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="send"
              loading={saving}
              onClick={() => void enroll()}
            >
              Enroll trainee
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Full name">
            <input
              className={inputClass}
              value={form.fullName}
              onChange={(event) =>
                setForm((current) => ({ ...current, fullName: event.target.value }))
              }
              placeholder="e.g. Jordan Ellis"
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Role">
              <select
                className={inputClass}
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({ ...current, role: event.target.value }))
                }
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mentor">
              <input
                className={inputClass}
                value={form.mentor}
                onChange={(event) =>
                  setForm((current) => ({ ...current, mentor: event.target.value }))
                }
                placeholder="e.g. Maya Chen"
              />
            </Field>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
              Tracks
            </span>
            <div className="grid grid-cols-1 gap-2">
              {tracks.map((track) => {
                const checked = selectedTracks.includes(track.track);
                return (
                  <label
                    key={track.track}
                    className={cn(
                      'flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
                      checked
                        ? 'border-secondary bg-secondary/10'
                        : 'border-border-subtle bg-surface-container hover:bg-surface-container-high',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-[#4cd7f6]"
                      checked={checked}
                      onChange={() => toggleTrack(track.track)}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-body-sm text-body-sm font-bold text-text-primary">
                        {track.label}
                      </span>
                      <span className="font-body-sm text-body-sm text-text-tertiary">
                        {track.modules} modules · {track.minutes} min
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1 font-body-sm text-body-sm text-text-subtle">
              Leave every track unchecked to assign the full curriculum.
            </p>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
