'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  SearchInput,
  Stat,
} from '@/components/ui';
import { api } from '@/lib/api';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import { dateLabel, timeLabel } from '@/lib/format';
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
  reservation: {
    guestName: string;
    partySize: number;
    tableNumber: string | null;
    reservationTime: string;
  } | null;
}

type Telephony = { configured: boolean; geminiConfigured: boolean; webhookPath: string };

const KB_CATEGORIES = [
  'Allergens',
  'Hours',
  'Dress Code',
  'Reservations',
  'Parking',
  'Private Dining',
  'Menu',
  'Voice AI',
  'Local',
  'Events',
];

const PROMPTS = [
  'Do you have a table for 4 at 7:30?',
  'Are the dry-aged steaks gluten-free?',
  'Is the burrata available tonight?',
  'What time do you close?',
];

export default function VoiceAiPage() {
  const [calls, setCalls] = useState<VoiceResponse | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [telephony, setTelephony] = useState<Telephony | null>(null);
  const [utterance, setUtterance] = useState(PROMPTS[1]);
  const [callerPhone, setCallerPhone] = useState('+1 555-0142');
  const [partySize, setPartySize] = useState(4);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [kbSearch, setKbSearch] = useState('');
  const [kbEditorOpen, setKbEditorOpen] = useState(false);
  const [kbEditing, setKbEditing] = useState<KnowledgeEntry | null>(null);
  const [kbForm, setKbForm] = useState({ category: 'Hours', title: '', content: '' });
  const [kbSaving, setKbSaving] = useState(false);
  const [kbDelete, setKbDelete] = useState<KnowledgeEntry | null>(null);
  const [kbDeleting, setKbDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [callData, kbData, statusData] = await Promise.all([
        api.get<VoiceResponse>('/voice/calls?limit=25'),
        api.get<{ entries: KnowledgeEntry[] }>('/voice/knowledge'),
        api.get<Telephony>('/voice/twilio-status'),
      ]);
      setCalls(callData);
      setKnowledge(kbData.entries);
      setTelephony(statusData);
    } catch {
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

  const filteredKnowledge = useMemo(() => {
    const term = kbSearch.trim().toLowerCase();
    if (!term) return knowledge.slice(0, 8);
    return knowledge.filter(
      (entry) =>
        entry.title.toLowerCase().includes(term) ||
        entry.content.toLowerCase().includes(term) ||
        entry.category.toLowerCase().includes(term),
    );
  }, [knowledge, kbSearch]);

  const stats = calls?.stats;

  const openCreateEntry = () => {
    setKbEditing(null);
    setKbForm({ category: 'Hours', title: '', content: '' });
    setKbEditorOpen(true);
  };

  const openEditEntry = (entry: KnowledgeEntry) => {
    setKbEditing(entry);
    setKbForm({
      category: entry.category,
      title: entry.title,
      content: entry.content,
    });
    setKbEditorOpen(true);
  };

  const saveKnowledge = async () => {
    const category = kbForm.category.trim();
    const title = kbForm.title.trim();
    const content = kbForm.content.trim();
    if (!category || !title || !content) {
      showToast('Category, title and content are required.', 'warn');
      return;
    }
    setKbSaving(true);
    try {
      if (kbEditing) {
        await api.patch(`/voice/knowledge/${kbEditing.id}`, { category, title, content });
        showToast('Knowledge entry updated.', 'success');
      } else {
        await api.post('/voice/knowledge', { category, title, content });
        showToast('Knowledge entry added to the voice agent.', 'success');
      }
      setKbEditorOpen(false);
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not save this entry.',
        'error',
      );
    } finally {
      setKbSaving(false);
    }
  };

  const deleteKnowledge = async () => {
    if (!kbDelete) return;
    setKbDeleting(true);
    try {
      await api.del(`/voice/knowledge/${kbDelete.id}`);
      showToast(`“${kbDelete.title}” removed from the knowledge base.`, 'success');
      setKbDelete(null);
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not delete this entry.',
        'error',
      );
    } finally {
      setKbDeleting(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow="Voice concierge"
          icon="neurology"
          title="Voice AI"
          description="Test the phone agent, review recent calls, and keep its knowledge base in sync with the live menu and 86 list."
          actions={
            <>
              <Badge tone={telephony?.configured ? 'ready' : 'neutral'}>
                {telephony?.configured ? 'Twilio live' : 'Twilio offline'}
              </Badge>
              <Badge tone={telephony?.geminiConfigured ? 'violet' : 'neutral'}>
                {telephony?.geminiConfigured ? 'Gemini 2.0' : 'Local RAG'}
              </Badge>
              <Button icon="refresh" onClick={() => void load()}>
                Refresh
              </Button>
            </>
          }
        />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total calls" value={stats?.totalCalls ?? '—'} icon="call" />
          <Stat
            label="Booking rate"
            value={stats ? `${stats.bookingRate}%` : '—'}
            icon="event_available"
            tone="ready"
          />
          <Stat
            label="AI bookings"
            value={stats?.booked ?? '—'}
            icon="auto_awesome"
            tone="violet"
          />
          <Stat
            label="Sentiment"
            value={stats ? String(stats.avgSentiment) : '—'}
            icon="sentiment_satisfied"
            tone="lime"
            hint={stats ? `${stats.avgDurationSeconds}s avg call` : undefined}
          />
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="flex flex-col gap-4 xl:col-span-7">
            <Card
              title="Test an inbound call"
              icon="support_agent"
              subtitle="Runs the same RAG pipeline as the Twilio webhook."
              actions={
                <Badge tone={telephony?.geminiConfigured ? 'violet' : 'info'}>
                  {telephony?.geminiConfigured ? 'Gemini' : 'Local matches'}
                </Badge>
              }
            >
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                      Caller phone
                    </span>
                    <input
                      className="sh-input"
                      value={callerPhone}
                      onChange={(event) => setCallerPhone(event.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                      Party size
                    </span>
                    <input
                      className="sh-input"
                      type="number"
                      min={1}
                      max={40}
                      value={partySize}
                      onChange={(event) => setPartySize(Number(event.target.value) || 2)}
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                    What the caller says
                  </span>
                  <textarea
                    className="sh-input min-h-[88px] py-2"
                    value={utterance}
                    onChange={(event) => setUtterance(event.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => setUtterance(prompt)}
                      className="rounded-full bg-surface-container px-3 py-1.5 font-body-sm text-body-sm text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  icon="call"
                  loading={busy}
                  onClick={() => void simulate()}
                  className="self-start"
                >
                  {busy ? 'Connecting…' : 'Simulate call'}
                </Button>
                <span className="font-body-sm text-body-sm text-text-tertiary">
                  Webhook: <code className="text-secondary">{telephony?.webhookPath ?? '/api/voice/inbound'}</code>
                </span>
              </div>
            </Card>

            <Card
              title="Call result"
              icon="graphic_eq"
              subtitle={result ? `${result.durationSeconds}s · ${result.usedGemini ? 'Gemini' : 'Local RAG'}` : undefined}
            >
              {result ? (
                <div className="flex flex-col gap-3">
                  <div className="rounded-xl bg-surface-container p-3">
                    <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                      Agent reply
                    </span>
                    <p className="mt-1 font-body-base leading-relaxed text-text-primary">{result.reply}</p>
                  </div>
                  {result.reservation && (
                    <div className="rounded-xl border border-status-ready/30 bg-status-ready/10 p-3">
                      <span className="font-label-badge text-label-badge uppercase text-status-ready">
                        Reservation booked
                      </span>
                      <p className="mt-1 font-body-base text-text-primary">
                        {result.reservation.guestName} · {result.reservation.partySize} guests ·{' '}
                        {timeLabel(result.reservation.reservationTime)} ·{' '}
                        {result.reservation.tableNumber ?? 'table pending'}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-surface-container p-3">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Intent</span>
                      <p className="mt-0.5 font-body-sm font-bold text-secondary">{result.intent}</p>
                    </div>
                    <div className="rounded-lg bg-surface-container p-3">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Outcome</span>
                      <p className="mt-0.5 font-body-sm font-bold text-status-ready">
                        {result.outcome.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                  {result.sources.length > 0 && (
                    <div className="rounded-lg bg-surface-container p-3">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                        Knowledge sources
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
                    <div className="rounded-lg border border-status-urgent/30 bg-status-urgent/10 p-3">
                      <span className="font-label-badge text-label-badge uppercase text-status-urgent">Live 86s</span>
                      <p className="font-body-sm text-body-sm text-text-primary">{result.eightySix.join(' · ')}</p>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon="support_agent"
                  title="No call simulated yet"
                  description="Run a test call to see the grounded reply, intent, sources, and any reservation."
                />
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-4 xl:col-span-5">
            <Card
              title="Recent calls"
              icon="history"
              subtitle={`${calls?.calls.length ?? 0} logged`}
              bodyClassName="flex max-h-[520px] flex-col gap-2 overflow-y-auto pr-1"
            >
              {calls && calls.calls.length > 0 ? (
                calls.calls.map((call) => (
                  <div key={call.id} className="rounded-xl bg-surface-container p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-metric-sm text-mono-metric-sm text-secondary">{call.callerPhone}</span>
                      <Badge tone={call.outcome === 'reservation_booked' ? 'ready' : 'neutral'}>
                        {call.outcome.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 font-body-sm text-body-sm text-text-secondary">
                      {call.summary ?? call.transcript}
                    </p>
                    <div className="mt-1 flex items-center justify-between font-mono-metric-sm text-mono-metric-sm text-text-subtle">
                      <span>{call.durationSeconds}s</span>
                      <span>{timeLabel(call.createdAt)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState icon="call" title="No calls yet" />
              )}
            </Card>

            <Card
              title="Knowledge base"
              icon="menu_book"
              subtitle={`${knowledge.length} entries · ${knowledge.filter((entry) => entry.hasEmbedding).length} embedded`}
              actions={
                <Button variant="primary" size="sm" icon="add" onClick={openCreateEntry}>
                  Add entry
                </Button>
              }
            >
              <SearchInput
                value={kbSearch}
                onChange={setKbSearch}
                placeholder="Search allergens, hours, dress code…"
                className="mb-3"
              />
              <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
                {filteredKnowledge.map((entry) => (
                  <details key={entry.id} className="rounded-lg bg-surface-container p-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                      <span className="font-body-sm font-bold text-text-primary">{entry.title}</span>
                      <Badge tone="neutral">{entry.category}</Badge>
                    </summary>
                    <p className="mt-1.5 font-body-sm text-body-sm text-text-secondary">{entry.content}</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2">
                      <span className="font-body-sm text-[11px] text-text-subtle">
                        Updated {dateLabel(entry.updatedAt)}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="edit"
                          onClick={() => openEditEntry(entry)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          icon="delete"
                          onClick={() => setKbDelete(entry)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </details>
                ))}
                {filteredKnowledge.length === 0 && (
                  <EmptyState icon="search_off" title="No matching entries" />
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={kbEditorOpen}
        onClose={() => setKbEditorOpen(false)}
        title={kbEditing ? 'Edit knowledge entry' : 'Add knowledge entry'}
        description="The voice agent searches titles and content on every call, so changes are live immediately."
        icon="menu_book"
        maxWidth="max-w-xl"
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setKbEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="check"
              loading={kbSaving}
              onClick={() => void saveKnowledge()}
            >
              {kbEditing ? 'Save changes' : 'Add entry'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
              Category
            </span>
            <input
              list="kb-categories"
              value={kbForm.category}
              onChange={(event) =>
                setKbForm((current) => ({ ...current, category: event.target.value }))
              }
              placeholder="Hours, Allergens, Local…"
              className="h-11 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-sm text-body-sm text-text-primary outline-none focus:border-secondary"
            />
            <datalist id="kb-categories">
              {KB_CATEGORIES.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
              Title
            </span>
            <input
              autoFocus
              value={kbForm.title}
              onChange={(event) =>
                setKbForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="e.g. Weekend brunch"
              className="h-11 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-sm text-body-sm text-text-primary outline-none focus:border-secondary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
              What should the agent know?
            </span>
            <textarea
              value={kbForm.content}
              onChange={(event) =>
                setKbForm((current) => ({ ...current, content: event.target.value }))
              }
              placeholder="Write the answer the way a well-briefed host would say it."
              className="min-h-[160px] w-full rounded-lg border border-border-subtle bg-surface-container-lowest p-3 font-body-sm text-body-sm text-text-primary outline-none placeholder:text-text-subtle focus:border-secondary"
            />
          </label>

          <p className="font-body-sm text-body-sm text-text-subtle">
            Keep entries short and factual. Live data such as the 86 list and table
            availability is checked separately and always wins over this text.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(kbDelete)}
        onClose={() => setKbDelete(null)}
        title={`Delete “${kbDelete?.title ?? 'entry'}”?`}
        description="The agent stops using this answer immediately."
        icon="delete"
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setKbDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              icon="delete"
              loading={kbDeleting}
              onClick={() => void deleteKnowledge()}
            >
              Delete entry
            </Button>
          </>
        }
      >
        <p className="font-body-sm text-body-sm text-text-secondary">
          This removes the entry from the knowledge base. Calls already logged keep
          their transcripts and sources.
        </p>
      </Modal>
    </AppShell>
  );
}
