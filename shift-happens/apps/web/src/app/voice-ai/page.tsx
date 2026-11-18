'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import { escapeHtml, timeLabel } from '@/lib/format';
import type { VoiceResponse } from '@/lib/types';

interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  hasEmbedding: boolean;
  updatedAt: string;
}

interface SimulationResult {
  callId: string;
  reply: string;
  intent: string;
  outcome: string;
  usedGemini: boolean;
  durationSeconds: number;
  eightySix: string[];
  sources: Array<{ title: string; score: number }>;
  reservation: { guestName: string; partySize: number; tableNumber: string | null; reservationTime: string } | null;
}

export default function VoiceAiPage() {
  const [calls, setCalls] = useState<VoiceResponse | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [twilio, setTwilio] = useState<{ configured: boolean; geminiConfigured: boolean; webhookPath: string } | null>(null);
  const [utterance, setUtterance] = useState('Are the dry-aged steaks gluten-free?');
  const [callerPhone, setCallerPhone] = useState('+1 555-0142');
  const [partySize, setPartySize] = useState(4);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [kbSearch, setKbSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const [callData, kbData, statusData] = await Promise.all([
        api.get<VoiceResponse>('/voice/calls?limit=25'),
        api.get<{ entries: KnowledgeEntry[] }>('/voice/knowledge'),
        api.get<{ configured: boolean; geminiConfigured: boolean; webhookPath: string }>('/voice/twilio-status'),
      ]);
      setCalls(callData);
      setKnowledge(kbData.entries);
      setTwilio(statusData);
    } catch (error) {
      showToast('Voice AI control plane is unreachable. Is the API on :4000?', 'error');
    }
  }, []);

  useEffect(() => {
    void load();
    const offs = [
      listen('VOICE_CALL_COMPLETED', () => void load()),
      listen('RESERVATION_CREATED', () => void load()),
    ];
    return () => offs.forEach((off) => off());
  }, [load]);

  const simulate = async () => {
    if (!utterance.trim()) {
      showToast('Type what the caller says first.', 'warn');
      return;
    }
    setBusy(true);
    try {
      const response = await api.post<SimulationResult>('/voice/simulate', {
        callerPhone,
        utterance,
        partySize,
      });
      setResult(response);
      showToast(
        response.reservation
          ? `Call booked: ${response.reservation.guestName} · ${response.reservation.partySize}p`
          : `Call resolved: ${response.intent.replace(/_/g, ' ')}`,
        'success',
      );
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Simulation failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const filteredKnowledge = knowledge.filter(
    (entry) =>
      !kbSearch ||
      entry.title.toLowerCase().includes(kbSearch.toLowerCase()) ||
      entry.content.toLowerCase().includes(kbSearch.toLowerCase()) ||
      entry.category.toLowerCase().includes(kbSearch.toLowerCase()),
  );

  const stats = calls?.stats;

  return (
    <AppShell
      title="Voice AI Command Center"
      subtitle="Twilio Media Streams → Gemini reasoning → pgvector RAG. Live table inventory, 86-aware answers, automatic bookings and allergy escalation."
    >
      <div className="flex flex-col gap-space-md p-space-md lg:p-space-lg">
        <section className="grid grid-cols-2 gap-space-sm md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Total Calls" value={String(stats?.totalCalls ?? '—')} icon="call" tone="text-secondary" />
          <Kpi label="Booking Rate" value={stats ? `${stats.bookingRate}%` : '—'} icon="event_available" tone="text-status-ready" />
          <Kpi label="AI Bookings" value={String(stats?.booked ?? '—')} icon="auto_awesome" tone="text-accent-purple-glow" />
          <Kpi label="Avg Duration" value={stats ? `${stats.avgDurationSeconds}s` : '—'} icon="timer" tone="text-text-primary" />
          <Kpi label="Avg Sentiment" value={stats ? String(stats.avgSentiment) : '—'} icon="sentiment_satisfied" tone="text-accent-lime" />
          <Kpi label="Live 86s" value={String(stats?.live86 ?? '—')} icon="block" tone="text-status-urgent" />
        </section>

        <div className="grid grid-cols-1 gap-space-md xl:grid-cols-12">
          <section className="flex flex-col gap-space-md xl:col-span-7">
            <div className="rounded-xl border border-border-subtle bg-surface-container-low p-space-md shadow-md">
              <div className="flex items-center justify-between pb-space-sm">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-accent-purple-glow">neurology</span>
                  <h2 className="font-headline-md text-headline-md text-text-primary">Live Inbound Call Simulator</h2>
                </div>
                <span className="rounded-full bg-status-ready/15 px-space-xs py-0.5 font-label-badge text-label-badge font-bold text-status-ready">
                  {twilio?.geminiConfigured ? 'GEMINI LIVE' : 'LOCAL RAG FALLBACK'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-3">
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Caller phone</span>
                  <input className="sh-input" value={callerPhone} onChange={(event) => setCallerPhone(event.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Party size</span>
                  <input
                    className="sh-input"
                    type="number"
                    min={1}
                    max={40}
                    value={partySize}
                    onChange={(event) => setPartySize(Number(event.target.value) || 2)}
                  />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-3">
                  <span className="font-label-badge text-label-badge uppercase text-text-tertiary">What the caller says</span>
                  <textarea
                    className="sh-input min-h-[92px] py-2"
                    value={utterance}
                    onChange={(event) => setUtterance(event.target.value)}
                  />
                </label>
              </div>
              <div className="mt-space-sm flex flex-wrap items-center gap-space-sm">
                <button
                  onClick={() => void simulate()}
                  disabled={busy}
                  className="flex h-12 items-center gap-space-xs rounded-lg bg-gradient-to-r from-accent-purple-glow to-secondary px-space-lg font-headline-md text-body-base font-bold text-bg-canvas shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-60"
                >
                  <span className="material-symbols-outlined">call</span>
                  {busy ? 'Connecting…' : 'Simulate Inbound Call'}
                </button>
                <span className="font-body-sm text-body-sm text-text-tertiary">
                  Webhook: <code className="text-secondary">{twilio?.webhookPath ?? '/api/voice/inbound'}</code>
                </span>
              </div>
              <div className="mt-space-sm flex flex-wrap gap-space-xs">
                {[
                  'Do you have a table for 4 at 7:30?',
                  'Are the dry-aged steaks gluten-free?',
                  'Is the burrata available tonight?',
                  'What time do you close?',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setUtterance(prompt)}
                    className="rounded-full bg-surface-container px-space-sm py-1 font-body-sm text-body-sm text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-surface-container-low p-space-md shadow-md">
              <div className="flex items-center justify-between pb-space-sm">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary">graphic_eq</span>
                  <h2 className="font-headline-md text-headline-md text-text-primary">Call Result</h2>
                </div>
                {result && (
                  <span className="font-mono-metric-sm text-mono-metric-sm text-text-tertiary">
                    {result.durationSeconds}s · {result.usedGemini ? 'Gemini 2.0' : 'Local RAG'}
                  </span>
                )}
              </div>
              {result ? (
                <div className="flex flex-col gap-space-sm">
                  <div className="rounded-lg bg-surface-container p-space-sm">
                    <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Agent reply</span>
                    <p className="mt-1 font-body-base text-body-base leading-relaxed text-text-primary">{result.reply}</p>
                  </div>
                  {result.reservation && (
                    <div className="rounded-lg border border-status-ready/40 bg-status-ready/10 p-space-sm">
                      <span className="font-label-badge text-label-badge uppercase text-status-ready">Reservation booked</span>
                      <p className="mt-1 font-body-base text-body-base text-text-primary">
                        {result.reservation.guestName} · {result.reservation.partySize} guests ·{' '}
                        {timeLabel(result.reservation.reservationTime)} ·{' '}
                        {result.reservation.tableNumber ?? 'table pending'}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-space-xs sm:grid-cols-2">
                    <div className="rounded-lg bg-surface-container p-space-sm">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Intent</span>
                      <p className="font-mono-metric-sm text-mono-metric-sm text-secondary">{result.intent}</p>
                    </div>
                    <div className="rounded-lg bg-surface-container p-space-sm">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Outcome</span>
                      <p className="font-mono-metric-sm text-mono-metric-sm text-status-ready">
                        {result.outcome.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                  {result.sources.length > 0 && (
                    <div className="rounded-lg bg-surface-container p-space-sm">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                        p gvector / RAG sources
                      </span>
                      <ul className="mt-1 flex flex-col gap-1">
                        {result.sources.map((source) => (
                          <li key={source.title} className="flex items-center justify-between font-body-sm text-body-sm text-text-secondary">
                            <span>{source.title}</span>
                            <span className="font-mono-metric-sm text-mono-metric-sm text-secondary">{source.score}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.eightySix.length > 0 && (
                    <div className="rounded-lg border border-status-urgent/30 bg-status-urgent/10 p-space-sm">
                      <span className="font-label-badge text-label-badge uppercase text-status-urgent">Live 86 injection</span>
                      <p className="font-body-sm text-body-sm text-text-primary">{result.eightySix.join(' · ')}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1 py-10 text-center text-text-muted">
                  <span className="material-symbols-outlined text-headline-xl text-text-subtle">support_agent</span>
                  <span className="font-body-base">Simulate a call to see the RAG-grounded reply.</span>
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-space-md xl:col-span-5">
            <div className="rounded-xl border border-border-subtle bg-surface-container-low p-space-md shadow-md">
              <div className="flex items-center justify-between pb-space-sm">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary">history</span>
                  <h2 className="font-headline-md text-headline-md text-text-primary">Call Logs</h2>
                </div>
                <span className="font-label-badge text-label-badge text-text-tertiary">{calls?.calls.length ?? 0} RECENT</span>
              </div>
              <div className="flex max-h-[420px] flex-col gap-space-xs overflow-y-auto pr-1">
                {calls?.calls.map((call) => (
                  <div key={call.id} className="rounded-lg bg-surface-container p-space-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono-metric-sm text-mono-metric-sm text-secondary">{call.callerPhone}</span>
                      <span
                        className={`font-label-badge text-label-badge uppercase ${
                          call.outcome === 'reservation_booked' ? 'text-status-ready' : 'text-text-tertiary'
                        }`}
                      >
                        {call.outcome.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 font-body-sm text-body-sm text-text-secondary">
                      {call.summary ?? call.transcript}
                    </p>
                    <div className="mt-1 flex items-center justify-between font-mono-metric-sm text-mono-metric-sm text-text-muted">
                      <span>{call.durationSeconds}s</span>
                      <span>{timeLabel(call.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-surface-container-low p-space-md shadow-md">
              <div className="flex items-center justify-between pb-space-sm">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-accent-purple-glow">menu_book</span>
                  <h2 className="font-headline-md text-headline-md text-text-primary">Knowledge Base</h2>
                </div>
                <span className="rounded-full bg-secondary/15 px-space-xs py-0.5 font-label-badge text-label-badge text-secondary">
                  {knowledge.filter((entry) => entry.hasEmbedding).length} EMBEDDED
                </span>
              </div>
              <input
                className="sh-input mb-space-sm"
                placeholder="Search allergens, hours, dress code, parking..."
                value={kbSearch}
                onChange={(event) => setKbSearch(event.target.value)}
              />
              <div className="flex max-h-[360px] flex-col gap-space-xs overflow-y-auto pr-1">
                {filteredKnowledge.map((entry) => (
                  <details key={entry.id} className="group rounded-lg bg-surface-container p-space-sm">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                      <span className="flex items-center gap-1 font-body-sm text-body-sm font-bold text-text-primary">
                        <span className="material-symbols-outlined text-body-base text-secondary">chevron_right</span>
                        {entry.title}
                      </span>
                      <span className="rounded bg-surface-variant px-1.5 py-0.5 font-label-badge text-label-badge text-text-tertiary">
                        {entry.category}
                      </span>
                    </summary>
                    <p className="mt-1 font-body-sm text-body-sm text-text-secondary">{entry.content}</p>
                  </details>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-surface-container-low p-space-md shadow-md">
              <div className="flex items-center gap-space-xs pb-space-sm">
                <span className="material-symbols-outlined text-secondary">settings_phone</span>
                <h2 className="font-headline-md text-headline-md text-text-primary">Telephony</h2>
              </div>
              <div className="grid grid-cols-2 gap-space-xs">
                <StatusRow label="Twilio Voice" ok={Boolean(twilio?.configured)} />
                <StatusRow label="Gemini 2.0" ok={Boolean(twilio?.geminiConfigured)} />
                <StatusRow label="RAG fallback" ok />
                <StatusRow label="Live 86 cache" ok />
              </div>
              <p className="mt-2 font-body-sm text-body-sm text-text-tertiary">
                {twilio?.configured
                  ? 'Twilio credentials detected — inbound webhook is live.'
                  : 'Twilio keys are not set. The webhook still returns valid TwiML and the simulator exercises the full RAG pipeline without external calls.'}
              </p>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon: string; tone: string }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-border-subtle bg-surface-container-low p-space-md shadow-md">
      <div className="flex items-center justify-between">
        <span className="font-label-badge text-label-badge uppercase text-text-tertiary">{label}</span>
        <span className={`material-symbols-outlined text-body-base ${tone}`}>{icon}</span>
      </div>
      <span className={`mt-space-xs font-mono-metric-lg text-mono-metric-lg ${tone}`}>{value}</span>
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded bg-surface-container px-space-xs py-1">
      <span className="font-body-sm text-body-sm text-text-secondary">{label}</span>
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-status-ready' : 'bg-status-caution'}`} />
    </div>
  );
}
