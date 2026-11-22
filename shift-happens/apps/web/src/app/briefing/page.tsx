'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Progress,
  type BadgeTone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, relativeMinutes, timeLabel, titleCase } from '@/lib/format';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import type { Briefing, Shift } from '@/lib/types';

interface NarrativeResponse {
  narrative: string;
  generatedAt: string;
  summary: Briefing['summary'];
}

interface BiometricResponse {
  recipients: string[];
  delivered: number;
  simulated?: boolean;
}

function priorityTone(priority: string): BadgeTone {
  if (priority === 'urgent') return 'urgent';
  if (priority === 'high') return 'caution';
  return 'neutral';
}

export default function BriefingPage() {
  const [data, setData] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);

  const load = useCallback(async () => {
    const response = await api.get<Briefing>('/briefing');
    setData(response);
    setError(null);
    return response;
  }, []);

  useEffect(() => {
    load()
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : 'Could not reach the briefing API.');
        showToast('Could not load the briefing.', 'error');
      })
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const events = [
      'BRIEFING_UPDATED',
      'GLOBAL_86_ITEM_UPDATE',
      'LOW_STOCK_ALERT',
      'RESERVATION_CREATED',
    ];
    const offs = events.map((event) => listen(event, () => void load().catch(() => undefined)));
    return () => offs.forEach((off) => off());
  }, [load]);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const response = await api.post<NarrativeResponse>('/briefing/narrative');
      setData((current) =>
        current
          ? {
              ...current,
              narrative: response.narrative,
              narrativeGeneratedAt: response.generatedAt,
            }
          : current,
      );
      showToast('Service narrative regenerated.', 'success');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not regenerate the narrative.', 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const signOff = async (shift: Shift) => {
    setSigningId(shift.id);
    try {
      await api.post(`/briefing/signoff/${shift.id}`);
      showToast(`${shift.userName ?? 'Team member'} signed off.`, 'success');
      await load();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not record the sign-off.', 'error');
    } finally {
      setSigningId(null);
    }
  };

  const broadcastBiometric = async () => {
    setBroadcasting(true);
    try {
      const response = await api.post<BiometricResponse>('/briefing/biometric-broadcast');
      showToast(
        `Biometric sign-off requirement sent to ${response.delivered} staff member${
          response.delivered === 1 ? '' : 's'
        }.`,
        response.delivered > 0 ? 'success' : 'warn',
      );
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not broadcast the requirement.', 'error');
    } finally {
      setBroadcasting(false);
    }
  };

  const reload = () => {
    setLoading(true);
    load()
      .catch(() => showToast('Could not load the briefing.', 'error'))
      .finally(() => setLoading(false));
  };

  const description = data
    ? `${dateLabel(data.date)} · ${data.summary.signedOff} of ${data.summary.totalShifts} signed off (${data.summary.signoffRate}%) · ${data.summary.covers} covers`
    : 'Loading today’s lineup…';

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow="Lineup"
          icon="campaign"
          title="Briefing"
          description={description}
          actions={
            <>
              <Button
                variant="secondary"
                size="md"
                icon="fingerprint"
                loading={broadcasting}
                disabled={!data}
                title="Broadcast the biometric sign-off requirement to scheduled staff"
                onClick={() => void broadcastBiometric()}
              >
                Require biometric sign-off
              </Button>
              <Button
                variant="primary"
                size="md"
                icon="auto_awesome"
                loading={regenerating}
                disabled={!data}
                onClick={() => void regenerate()}
              >
                Regenerate narrative
              </Button>
            </>
          }
        />

        {loading && !data ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="h-[280px] animate-pulse rounded-2xl border border-border-subtle bg-surface-container-low xl:order-2" />
            <div className="flex flex-col gap-4 xl:order-1 xl:col-span-2">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="h-[220px] animate-pulse rounded-2xl border border-border-subtle bg-surface-container-low"
                />
              ))}
            </div>
          </div>
        ) : !data ? (
          <EmptyState
            icon="cloud_off"
            title="Could not load the briefing"
            description={error ?? 'Check the operations API and try again.'}
            action={
              <Button variant="primary" icon="refresh" onClick={reload}>
                Retry
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="flex flex-col gap-4 xl:order-2">
              <Card
                title="Service narrative"
                icon="auto_awesome"
                subtitle={`Updated ${relativeMinutes(data.narrativeGeneratedAt)}`}
              >
                <p className="whitespace-pre-line font-body-sm text-body-sm leading-relaxed text-text-secondary">
                  {data.narrative}
                </p>
              </Card>

              <Card
                title="VIP arrivals"
                icon="star"
                actions={<Badge tone="violet">{data.vipReservations.length}</Badge>}
              >
                {data.vipReservations.length === 0 ? (
                  <EmptyState
                    icon="star_border"
                    title="No VIP arrivals flagged"
                    description="Flag a reservation as VIP and it will surface here."
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.vipReservations.map((reservation) => (
                      <div
                        key={reservation.id}
                        className="flex items-start gap-3 rounded-xl bg-surface-container p-3"
                      >
                        <Avatar name={reservation.guestName} size="sm" />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-body-sm text-body-sm font-bold text-text-primary">
                              {reservation.guestName}
                            </span>
                            {reservation.occasion && (
                              <Badge tone="violet">{reservation.occasion}</Badge>
                            )}
                          </div>
                          <span className="font-body-sm text-body-sm text-text-tertiary">
                            {timeLabel(reservation.time)} · {reservation.partySize} guests ·{' '}
                            {reservation.tableNumber ?? 'Table TBD'}
                          </span>
                          {reservation.notes && (
                            <p className="line-clamp-2 font-body-sm text-body-sm text-text-secondary">
                              {reservation.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="flex flex-col gap-4 xl:order-1 xl:col-span-2">
              <AttendanceCard
                attendance={data.attendance}
                signedOff={data.summary.signedOff}
                totalShifts={data.summary.totalShifts}
                signoffRate={data.summary.signoffRate}
                signingId={signingId}
                onSignOff={(shift) => void signOff(shift)}
              />

              <Card
                title="Station directives"
                icon="campaign"
                subtitle="What each station owns tonight"
              >
                {data.stationDirectives.length === 0 ? (
                  <EmptyState
                    icon="campaign"
                    title="No directives posted"
                    description="Directives will appear once the lineup is generated."
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.stationDirectives.map((directive, index) => (
                      <div
                        key={`${directive.station}-${index}`}
                        className="flex items-start gap-3 rounded-xl bg-surface-container p-3"
                      >
                        <span className="material-symbols-outlined mt-0.5 text-body-base text-secondary">
                          campaign
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-body-sm text-body-sm font-bold text-text-primary">
                              {directive.station}
                            </span>
                            <Badge tone={priorityTone(directive.priority)}>
                              {titleCase(directive.priority)}
                            </Badge>
                          </div>
                          <p className="font-body-sm text-body-sm text-text-secondary">
                            {directive.directive}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card
                title="86 board & low stock"
                icon="report"
                subtitle="Menu outages and par-level watchlist"
                actions={
                  <Badge tone={data.eightySix.length + data.lowStock.length > 0 ? 'urgent' : 'ready'}>
                    {data.eightySix.length + data.lowStock.length} flagged
                  </Badge>
                }
              >
                {data.eightySix.length + data.lowStock.length === 0 ? (
                  <EmptyState
                    icon="check_circle"
                    title="Menu fully stocked"
                    description="No items are 86ed and every par level is above trigger."
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.eightySix.map((item) => (
                      <div
                        key={`86-${item.id}`}
                        className="flex items-center gap-3 rounded-xl bg-surface-container p-3"
                      >
                        <Badge tone="urgent">86</Badge>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-body-sm text-body-sm font-bold text-text-primary">
                            {item.name}
                          </span>
                          <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                            {titleCase(item.station)}
                            {item.category ? ` · ${item.category}` : ''}
                          </span>
                        </div>
                        <span className="max-w-[45%] text-right font-body-sm text-body-sm text-text-tertiary">
                          {item.reason ?? 'Unavailable'}
                        </span>
                      </div>
                    ))}

                    {data.lowStock.map((item) => (
                      <div
                        key={`low-${item.id}`}
                        className="flex items-center gap-3 rounded-xl bg-surface-container p-3"
                      >
                        <Badge tone={item.severity === 'depleted' ? 'urgent' : 'caution'}>
                          {item.severity === 'depleted' ? 'Out' : 'Low'}
                        </Badge>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-body-sm text-body-sm font-bold text-text-primary">
                            {item.name}
                          </span>
                          <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                            {item.supplier ?? 'No supplier'}
                          </span>
                        </div>
                        <span className="font-mono-metric-sm text-mono-metric-sm text-text-secondary">
                          {item.currentStock} / {item.parLevel} {item.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function AttendanceCard({
  attendance,
  signedOff,
  totalShifts,
  signoffRate,
  signingId,
  onSignOff,
}: {
  attendance: Shift[];
  signedOff: number;
  totalShifts: number;
  signoffRate: number;
  signingId: string | null;
  onSignOff: (shift: Shift) => void;
}) {
  const allSigned = totalShifts > 0 && signedOff >= totalShifts;
  return (
    <Card
      title="Attendance & sign-off"
      icon="how_to_reg"
      subtitle={`${signedOff} of ${totalShifts} staff signed off`}
      actions={<Badge tone={allSigned ? 'ready' : 'caution'}>{signoffRate}%</Badge>}
    >
      <Progress
        value={signoffRate}
        tone={allSigned ? 'ready' : 'caution'}
        className="mb-3"
      />
      {attendance.length === 0 ? (
        <EmptyState
          icon="groups"
          title="No shifts scheduled"
          description="Today’s lineup will appear here once shifts are posted."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {attendance.map((shift) => {
            const signed = Boolean(shift.signoff);
            return (
              <div
                key={shift.id}
                className="flex flex-col gap-3 rounded-xl bg-surface-container p-3 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={shift.userName} size="sm" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-body-sm text-body-sm font-bold text-text-primary">
                      {shift.userName}
                    </span>
                    <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                      {shift.roleLabel}
                      {shift.station ? ` · ${titleCase(shift.station)}` : ''}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <div className="flex min-w-[76px] flex-col">
                    <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                      Clock-in
                    </span>
                    <span className="font-mono-metric-sm text-mono-metric-sm text-text-secondary">
                      {shift.clockIn ? timeLabel(shift.clockIn) : '—'}
                    </span>
                  </div>
                  <Badge tone={signed ? 'ready' : 'caution'}>
                    {signed ? 'Signed' : 'Pending'}
                  </Badge>
                  <Button
                    variant={signed ? 'ghost' : 'success'}
                    size="md"
                    icon={signed ? 'check' : 'draw'}
                    disabled={signed}
                    loading={signingId === shift.id}
                    className="flex-1 sm:flex-none"
                    onClick={() => onSignOff(shift)}
                  >
                    {signed ? 'Signed off' : 'Sign Off'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
