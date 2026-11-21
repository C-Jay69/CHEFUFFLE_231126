'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Stat,
  Tabs,
  type BadgeTone,
} from '@/components/ui';
import { API_BASE, api, rawRequest } from '@/lib/api';
import { cn } from '@/lib/cn';
import { money, timeLabel, titleCase } from '@/lib/format';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import type { DiningTable } from '@/lib/types';

interface FloorPlanConfig {
  name: string;
  backgroundUrl: string | null;
  backgroundType: string | null;
}

type Mode = 'service' | 'design';
type Shape = 'square' | 'rectangle' | 'circle' | 'booth';

const tableSorter = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const statusTone: Record<DiningTable['status'], BadgeTone> = {
  available: 'ready',
  occupied: 'info',
  reserved: 'caution',
  dirty: 'neutral',
};

const statusLabel: Record<DiningTable['status'], string> = {
  available: 'Available',
  occupied: 'In service',
  reserved: 'Reserved',
  dirty: 'Needs bus',
};

const nodeTone: Record<DiningTable['status'], string> = {
  available: 'border-status-ready/70 bg-status-ready/15 text-status-ready',
  occupied: 'border-status-urgent/65 bg-status-urgent/20 text-text-primary',
  reserved: 'border-status-caution/70 bg-status-caution/20 text-status-caution',
  dirty: 'border-text-muted/60 bg-surface-container-high/80 text-text-tertiary',
};

const designNodeTone =
  'border-accent-cyan-bright/60 bg-surface-container-high text-text-primary';

const shapeClasses: Record<Shape, string> = {
  square: 'h-[82px] w-[82px] rounded-xl',
  rectangle: 'h-[62px] w-[118px] rounded-xl',
  circle: 'h-[82px] w-[82px] rounded-full',
  booth: 'h-[72px] w-[108px] rounded-2xl',
};

const statusForTab: Record<string, string> = {
  available: 'Ready',
  occupied: 'In service',
  reserved: 'Reserved',
  dirty: 'Needs bus',
};

function badgeFor(table: DiningTable): { label: string; tone: BadgeTone } {
  if (table.status === 'occupied') {
    return { label: table.stageShort || statusLabel.occupied, tone: 'info' };
  }
  return { label: statusLabel[table.status], tone: statusTone[table.status] };
}

function partyLabel(table: DiningTable) {
  if (table.currentPartyName) return table.currentPartyName;
  if (table.status === 'available') return 'Open table';
  if (table.status === 'dirty') return 'Awaiting reset';
  if (table.status === 'reserved') return 'Reserved party';
  return 'Walk-in';
}

function seatedLabel(table: DiningTable) {
  if (table.status === 'available') return 'Ready for guests';
  if (table.status === 'dirty') return 'Needs bus';
  if (table.seatedAt) {
    return `${timeLabel(table.seatedAt)} · ${table.seatedMinutes ?? 0}m`;
  }
  return table.status === 'reserved' ? 'Not seated yet' : 'Not seated';
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg bg-surface-container px-3 py-2">
      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">{label}</span>
      <span className="mt-0.5 truncate font-body-sm text-body-sm font-semibold text-text-primary">
        {value}
      </span>
    </div>
  );
}

export default function FloorPlanPage() {
  const router = useRouter();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [config, setConfig] = useState<FloorPlanConfig | null>(null);
  const [mode, setMode] = useState<Mode>('service');
  const [zone, setZone] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seatTarget, setSeatTarget] = useState<DiningTable | null>(null);
  const [partyName, setPartyName] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [resetTarget, setResetTarget] = useState<DiningTable | null>(null);
  const [tableEditor, setTableEditor] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState({
    tableNumber: '',
    zone: 'Main Dining Room',
    capacity: 4,
    shape: 'square' as Shape,
    rotation: 0,
  });
  const requestRef = useRef(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    rect: DOMRect;
  } | null>(null);

  const load = useCallback(async (silent = false) => {
    const requestId = ++requestRef.current;
    try {
      const [tableData, planData] = await Promise.all([
        api.get<DiningTable[]>('/tables'),
        api.get<FloorPlanConfig>('/floor-plan/config'),
      ]);
      if (requestId !== requestRef.current) return;
      setTables(tableData);
      setConfig(planData);
      setError(null);
    } catch (loadError) {
      if (requestId !== requestRef.current) return;
      const message = errorText(loadError, 'Could not load the floor plan.');
      setError(message);
      if (!silent) showToast(message, 'error');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void load(false).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (mode === 'design' && dirty) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(true), 300);
    };
    const offs = [
      listen('TABLE_STAGE_ADVANCED', schedule),
      listen('TABLE_UPDATED', schedule),
    ];
    return () => {
      offs.forEach((off) => off());
      if (timer) clearTimeout(timer);
    };
  }, [dirty, load, mode]);

  const manualRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
    setDirty(false);
  }, [load]);

  const zones = useMemo(
    () => Array.from(new Set(tables.map((table) => table.zone))).sort(),
    [tables],
  );
  const zoneTabs = useMemo(
    () => [
      { id: 'all', label: 'All zones', count: tables.length },
      ...zones.map((entry) => ({
        id: entry,
        label: entry,
        count: tables.filter((table) => table.zone === entry).length,
      })),
    ],
    [tables, zones],
  );

  const visibleTables = useMemo(
    () =>
      tables
        .filter((table) => mode === 'design' || zone === 'all' || table.zone === zone)
        .sort((a, b) => tableSorter.compare(a.tableNumber, b.tableNumber)),
    [mode, tables, zone],
  );

  const stats = useMemo(() => {
    const summary = { occupied: 0, available: 0, reserved: 0, dirty: 0 };
    for (const table of tables) {
      if (table.status === 'occupied') summary.occupied += 1;
      else if (table.status === 'available') summary.available += 1;
      else if (table.status === 'reserved') summary.reserved += 1;
      else summary.dirty += 1;
    }
    return summary;
  }, [tables]);

  const selected = useMemo(
    () => tables.find((table) => table.id === selectedId) ?? null,
    [selectedId, tables],
  );
  const allergyNotes = selected?.activeOrder?.allergyNotes ?? null;
  const seatMax = seatTarget ? Math.min(40, Math.max(1, seatTarget.capacity)) : 40;

  const openSeat = (table: DiningTable) => {
    const max = Math.min(40, Math.max(1, table.capacity));
    setSeatTarget(table);
    setPartyName(table.currentPartyName ?? '');
    setPartySize(Math.min(max, Math.max(1, table.currentPartySize ?? Math.min(2, max))));
  };

  const closeSeat = () => {
    if (busy) return;
    setSeatTarget(null);
    setPartyName('');
  };

  const changeCovers = (delta: number) => {
    setPartySize((current) => Math.min(seatMax, Math.max(1, current + delta)));
  };

  const submitSeat = async () => {
    if (!seatTarget) return;
    const name = partyName.trim() || 'Walk-in';
    setBusy(true);
    try {
      await api.post(`/tables/${seatTarget.id}/seat`, { partyName: name, partySize });
      showToast(`${name} seated at ${seatTarget.tableNumber}.`, 'success');
      setSeatTarget(null);
      setPartyName('');
      await load(true);
    } catch (seatError) {
      showToast(errorText(seatError, 'Could not seat the party.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const advanceStage = async (table: DiningTable) => {
    setBusy(true);
    try {
      const result = await api.post<{ stage?: string }>(`/tables/${table.id}/advance`);
      showToast(`${table.tableNumber} advanced to ${titleCase(result.stage ?? 'next stage')}.`, 'success');
      await load(true);
    } catch (advanceError) {
      showToast(errorText(advanceError, 'Could not advance the table.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const resetTable = async (table: DiningTable) => {
    setBusy(true);
    try {
      await api.post(`/tables/${table.id}/reset`);
      showToast(`${table.tableNumber} reset — ready for the next party.`, 'success');
      setResetTarget(null);
      await load(true);
    } catch (resetError) {
      showToast(errorText(resetError, 'Could not reset the table.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const requestReset = (table: DiningTable) => {
    if (table.status === 'occupied' || table.status === 'reserved') {
      setResetTarget(table);
      return;
    }
    void resetTable(table);
  };

  const startOrder = (table: DiningTable) => {
    router.push(`/serve?table=${table.tableNumber}`);
  };

  const openCreate = () => {
    setForm({ tableNumber: '', zone: zones[0] ?? 'Main Dining Room', capacity: 4, shape: 'square', rotation: 0 });
    setTableEditor('create');
  };

  const openEdit = (table: DiningTable) => {
    setForm({
      tableNumber: table.tableNumber,
      zone: table.zone,
      capacity: table.capacity,
      shape: (table.shape as Shape) ?? 'square',
      rotation: table.rotation,
    });
    setTableEditor('edit');
  };

  const saveTableEditor = async () => {
    const number = form.tableNumber.trim();
    if (!number) {
      showToast('Enter a table number.', 'warn');
      return;
    }
    setBusy(true);
    try {
      if (tableEditor === 'create') {
        const result = await api.post<{ table: DiningTable }>('/tables', {
          tableNumber: number,
          zone: form.zone.trim() || 'Main Dining Room',
          capacity: form.capacity,
          shape: form.shape,
          rotation: form.rotation,
          posX: 500,
          posY: 500,
        });
        setTables((current) => [...current, result.table]);
        setSelectedId(result.table.id);
        showToast(`Table ${result.table.tableNumber} added — drag it into place.`, 'success');
      } else if (selected) {
        const result = await api.patch<DiningTable>(`/tables/${selected.id}`, {
          tableNumber: number,
          zone: form.zone.trim() || 'Main Dining Room',
          capacity: form.capacity,
          shape: form.shape,
          rotation: form.rotation,
        });
        setTables((current) =>
          current.map((table) => (table.id === result.id ? result : table)),
        );
        showToast(`Table ${result.tableNumber} updated.`, 'success');
      }
      setTableEditor(null);
      setDirty(true);
    } catch (saveError) {
      showToast(errorText(saveError, 'Could not save the table.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    if (!window.confirm(`Remove ${selected.tableNumber} from the floor plan?`)) return;
    setBusy(true);
    try {
      await api.del(`/tables/${selected.id}`);
      setTables((current) => current.filter((table) => table.id !== selected.id));
      setSelectedId(null);
      setTableEditor(null);
      setDirty(true);
      showToast(`${selected.tableNumber} removed from the floor.`, 'info');
    } catch (deleteError) {
      showToast(errorText(deleteError, 'Could not remove the table.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveLayout = async () => {
    setBusy(true);
    try {
      await api.post('/floor-layout', {
        tables: tables.map((table) => ({
          id: table.id,
          posX: table.posX,
          posY: table.posY,
          rotation: table.rotation,
          zone: table.zone,
          capacity: table.capacity,
          shape: table.shape,
        })),
      });
      setDirty(false);
      showToast('Floor layout saved.', 'success');
    } catch (saveError) {
      showToast(errorText(saveError, 'Could not save the layout.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const enterDesign = () => {
    setZone('all');
    setMode('design');
    setSelectedId(null);
    setDirty(false);
  };

  const exitDesign = () => {
    if (dirty && !window.confirm('Discard unsaved layout changes?')) return;
    setMode('service');
    setDirty(false);
    void load(true);
  };

  const uploadBackground = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await rawRequest('/api/floor-plan/background', {
        method: 'POST',
        body,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'Upload failed.');
      }
      const result = (await response.json()) as FloorPlanConfig;
      setConfig((current) => ({ ...(current ?? { name: 'Restaurant' }), ...result }));
      showToast('Floor plan background uploaded.', 'success');
    } catch (uploadError) {
      showToast(errorText(uploadError, 'Could not upload the floor plan.'), 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeBackground = async () => {
    if (!window.confirm('Remove the uploaded floor plan background?')) return;
    setUploading(true);
    try {
      await api.del('/floor-plan/background');
      setConfig((current) => (current ? { ...current, backgroundUrl: null, backgroundType: null } : current));
      showToast('Background removed.', 'info');
    } catch (removeError) {
      showToast(errorText(removeError, 'Could not remove the background.'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, table: DiningTable) => {
    setSelectedId(table.id);
    if (mode !== 'design') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    dragRef.current = {
      id: table.id,
      startX: event.clientX,
      startY: event.clientY,
      origX: table.posX,
      origY: table.posY,
      rect,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || mode !== 'design') return;
    const dx = ((event.clientX - drag.startX) / drag.rect.width) * 1000;
    const dy = ((event.clientY - drag.startY) / drag.rect.height) * 1000;
    const clamp = (value: number) => Math.min(980, Math.max(20, value));
    setTables((current) =>
      current.map((table) =>
        table.id === drag.id
          ? { ...table, posX: clamp(drag.origX + dx), posY: clamp(drag.origY + dy) }
          : table,
      ),
    );
    setDirty(true);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const primaryAction = selected
    ? selected.status === 'dirty'
      ? { label: 'Reset / Bus', icon: 'cleaning_services', run: () => void resetTable(selected) }
      : selected.status === 'occupied'
        ? { label: 'Advance stage', icon: 'arrow_forward', run: () => void advanceStage(selected) }
        : { label: 'Seat party', icon: 'event_seat', run: () => openSeat(selected) }
    : null;

  const selectedBadge = selected ? badgeFor(selected) : null;
  const backgroundUrl = config?.backgroundUrl ? `${API_BASE}${config.backgroundUrl}` : null;
  const isPdf = config?.backgroundType === 'application/pdf';

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow={mode === 'design' ? 'Design mode' : 'Live floor'}
          icon="table_restaurant"
          title="Floor Plan"
          description={
            mode === 'design'
              ? 'Drag tables to match the room. Upload a floor plan image or PDF as the background.'
              : 'Tap a table to see its party, stage and check. Switch to design mode to rearrange the room.'
          }
          actions={
            mode === 'design' ? (
              <>
                <Button variant="secondary" icon="add" onClick={openCreate}>
                  Add table
                </Button>
                <Button
                  variant="secondary"
                  icon="upload_file"
                  loading={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload plan
                </Button>
                {backgroundUrl && (
                  <Button variant="ghost" icon="delete" onClick={() => void removeBackground()}>
                    Remove plan
                  </Button>
                )}
                <Button
                  variant="primary"
                  icon="save"
                  loading={busy}
                  onClick={() => void saveLayout()}
                >
                  Save layout{dirty ? ' *' : ''}
                </Button>
                <Button variant="ghost" icon="close" onClick={exitDesign}>
                  Exit design
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" icon="edit" onClick={enterDesign}>
                  Design layout
                </Button>
                <Button
                  variant="secondary"
                  icon="refresh"
                  loading={refreshing}
                  onClick={() => void manualRefresh()}
                >
                  Refresh
                </Button>
              </>
            )
          }
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadBackground(file);
          }}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="In service" value={stats.occupied} icon="room_service" tone="violet" hint="Occupied tables" />
          <Stat label="Available" value={stats.available} icon="check_circle" tone="ready" hint="Ready to seat" />
          <Stat label="Reserved" value={stats.reserved} icon="book_online" tone="caution" hint="Upcoming parties" />
          <Stat label="Needs bus" value={stats.dirty} icon="cleaning_services" tone="urgent" hint="Awaiting reset" />
        </div>

        {mode === 'service' && (
          <Tabs value={zone} onChange={setZone} items={zoneTabs} />
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="order-2 flex min-w-0 flex-col gap-3 xl:order-1">
            {error && tables.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-status-urgent/40 bg-status-urgent/10 px-4 py-3">
                <span className="font-body-sm text-body-sm text-text-primary">
                  Live floor feed interrupted — showing the last known state.
                </span>
                <Button size="sm" variant="secondary" icon="refresh" loading={refreshing} onClick={() => void manualRefresh()}>
                  Retry
                </Button>
              </div>
            )}

            {loading ? (
              <div className="sh-skeleton h-[520px] rounded-2xl" />
            ) : error && tables.length === 0 ? (
              <EmptyState
                icon="cloud_off"
                title="Floor plan unavailable"
                description={error}
                action={<Button variant="secondary" icon="refresh" onClick={() => void manualRefresh()}>Retry</Button>}
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface-container-lowest p-2 shadow-inner">
                <div
                  ref={canvasRef}
                  className="sh-floor-grid relative mx-auto aspect-[16/9] w-full min-w-[760px] max-w-[1180px] overflow-hidden rounded-xl bg-bg-canvas"
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setSelectedId(null);
                  }}
                >
                  {backgroundUrl ? (
                    isPdf ? (
                      <embed
                        src={backgroundUrl}
                        type="application/pdf"
                        className="pointer-events-none absolute inset-0 h-full w-full"
                      />
                    ) : (
                      <img
                        src={backgroundUrl}
                        alt="Floor plan background"
                        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                      />
                    )
                  ) : mode === 'design' ? (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-text-subtle">
                      <span className="material-symbols-outlined text-[42px]">floor</span>
                      <span className="font-label-badge text-label-badge uppercase tracking-widest">
                        Upload a plan or drag tables to design the room
                      </span>
                    </div>
                  ) : null}

                  {visibleTables.map((table) => {
                    const shape = (table.shape as Shape) in shapeClasses ? (table.shape as Shape) : 'square';
                    const isSelected = table.id === selectedId;
                    return (
                      <button
                        key={table.id}
                        type="button"
                        onPointerDown={(event) => handlePointerDown(event, table)}
                        className={cn(
                          'absolute flex -translate-x-1/2 -translate-y-1/2 touch-none flex-col items-center justify-center gap-0.5 border px-1 py-1 text-center shadow-lg transition-shadow',
                          shapeClasses[shape],
                          mode === 'design' ? designNodeTone : nodeTone[table.status],
                          mode === 'design' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                          isSelected && 'ring-2 ring-accent-cyan-bright ring-offset-1 ring-offset-bg-canvas',
                        )}
                        style={{
                          left: `${Math.min(98, Math.max(2, table.posX / 10))}%`,
                          top: `${Math.min(96, Math.max(2, table.posY / 10))}%`,
                          transform: `translate(-50%, -50%) rotate(${table.rotation}deg)`,
                        }}
                        title={`${table.tableNumber} · ${table.zone} · ${table.capacity} seats`}
                      >
                        <span className="font-mono-metric-sm text-mono-metric-sm font-bold leading-none">
                          {table.tableNumber}
                        </span>
                        <span className="font-mono-metric-sm text-[10px] leading-none opacity-80">
                          {table.currentPartySize ?? table.capacity}p
                        </span>
                        <span className="line-clamp-1 font-label-badge text-[8px] font-bold uppercase leading-tight">
                          {mode === 'design'
                            ? table.zone.split(' ')[0]
                            : table.status === 'available'
                              ? 'Ready'
                              : table.status === 'dirty'
                                ? 'Bus'
                                : table.stageShort}
                        </span>
                        {mode === 'design' && (
                          <span className="material-symbols-outlined text-[11px] opacity-60">drag_indicator</span>
                        )}
                      </button>
                    );
                  })}

                  <div className="pointer-events-none absolute bottom-2 left-3 flex flex-wrap items-center gap-3 rounded-lg bg-bg-canvas/75 px-2 py-1 backdrop-blur-sm">
                    {mode === 'design' ? (
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                        Drag tables · click a table to edit · save when done
                      </span>
                    ) : (
                      Object.entries(statusForTab).map(([status, label]) => (
                        <span key={status} className="flex items-center gap-1 font-label-badge text-label-badge uppercase text-text-tertiary">
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full',
                              status === 'available'
                                ? 'bg-status-ready'
                                : status === 'occupied'
                                  ? 'bg-status-urgent'
                                  : status === 'reserved'
                                    ? 'bg-status-caution'
                                    : 'bg-text-muted',
                            )}
                          />
                          {label}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <aside className="order-1 xl:order-2">
            {mode === 'design' ? (
              <Card
                title={selected ? selected.tableNumber : 'Design mode'}
                subtitle={
                  selected
                    ? `${selected.zone} · ${selected.capacity} seats · ${selected.shape}`
                    : 'Select a table to edit it'
                }
                icon="edit"
                className="xl:sticky xl:top-20"
              >
                {selected ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <DetailRow label="Position" value={`${Math.round(selected.posX)}, ${Math.round(selected.posY)}`} />
                      <DetailRow label="Rotation" value={`${selected.rotation}°`} />
                    </div>
                    <Button variant="primary" icon="edit" onClick={() => openEdit(selected)}>
                      Edit table properties
                    </Button>
                    <Button variant="danger" icon="delete" onClick={() => void deleteSelected()}>
                      Remove table
                    </Button>
                    <p className="font-body-sm text-body-sm text-text-tertiary">
                      Drag this table on the plan. Use Edit to change its number, zone, covers or shape.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <EmptyState
                      icon="touch_app"
                      title="Select a table"
                      description="Click any table on the plan to edit its properties, or add a new table."
                    />
                    <Button variant="primary" icon="add" onClick={openCreate}>
                      Add table
                    </Button>
                  </div>
                )}
              </Card>
            ) : selected && primaryAction && selectedBadge ? (
              <Card
                title={selected.tableNumber}
                subtitle={`${selected.zone} · ${selected.capacity} seats`}
                icon="table_restaurant"
                actions={<Badge tone={selectedBadge.tone}>{selectedBadge.label}</Badge>}
                className="xl:sticky xl:top-20"
              >
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <DetailRow label="Party" value={partyLabel(selected)} />
                    <DetailRow
                      label="Covers"
                      value={selected.currentPartySize != null ? String(selected.currentPartySize) : '—'}
                    />
                    <DetailRow label="Stage" value={selected.stageLabel} />
                    <DetailRow
                      label="Seated"
                      value={selected.seatedAt ? `${timeLabel(selected.seatedAt)} · ${selected.seatedMinutes ?? 0}m` : seatedLabel(selected)}
                    />
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-surface-container px-3 py-2">
                    <Avatar name={selected.serverName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <span className="block font-label-badge text-label-badge uppercase text-text-tertiary">Server</span>
                      <span className="block truncate font-body-sm text-body-sm font-semibold text-text-primary">
                        {selected.serverName ?? 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-surface-container px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Check</span>
                      <span className="font-mono-metric-md text-mono-metric-md font-bold text-text-primary">
                        {selected.activeOrder ? money(selected.activeOrder.total) : '—'}
                      </span>
                    </div>
                    <span className="font-body-sm text-body-sm text-text-tertiary">
                      {selected.activeOrder ? `Ticket #${selected.activeOrder.orderNumber} · ${selected.activeOrder.itemCount} items` : 'No open check'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Stage progress</span>
                      <span className="font-label-badge text-label-badge text-text-secondary">
                        {Math.min(selected.stageNumber, 6)} / 6
                      </span>
                    </div>
                    <Progress
                      value={(Math.min(selected.stageNumber, 6) / 6) * 100}
                      tone={selected.status === 'dirty' ? 'caution' : selected.status === 'occupied' ? 'secondary' : 'ready'}
                    />
                  </div>

                  {allergyNotes && (
                    <div className="flex items-start gap-2 rounded-lg border border-status-urgent/40 bg-status-urgent/10 px-3 py-2">
                      <span className="material-symbols-outlined text-body-base text-status-urgent">warning</span>
                      <div className="min-w-0">
                        <span className="block font-label-badge text-label-badge font-bold uppercase text-status-urgent">Allergy</span>
                        <p className="font-body-sm text-body-sm font-semibold text-text-primary">{allergyNotes}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
                    <Button variant="primary" size="lg" icon={primaryAction.icon} loading={busy} onClick={primaryAction.run} className="w-full">
                      {primaryAction.label}
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" size="md" icon="restaurant_menu" disabled={busy} onClick={() => startOrder(selected)}>
                        Start Order
                      </Button>
                      {selected.status === 'occupied' ? (
                        <Button variant="danger" size="md" icon="cleaning_services" disabled={busy} onClick={() => requestReset(selected)}>
                          Reset / Bus
                        </Button>
                      ) : (
                        <Button variant="secondary" size="md" icon="arrow_forward" disabled={busy} onClick={() => void advanceStage(selected)}>
                          Advance stage
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ) : (
              <Card title="No table selected" subtitle="Tap a table to see its party and actions." icon="table_restaurant" className="hidden xl:block">
                <EmptyState icon="touch_app" title="Select a table" description="Party details, stage controls and check totals appear here." />
              </Card>
            )}
          </aside>
        </div>
      </div>

      <Modal
        open={Boolean(seatTarget)}
        onClose={closeSeat}
        title={seatTarget ? `Seat ${seatTarget.tableNumber}` : 'Seat party'}
        description={seatTarget ? `${seatTarget.zone} · up to ${seatTarget.capacity} covers` : undefined}
        icon="event_seat"
        footer={
          <>
            <Button variant="ghost" onClick={closeSeat} disabled={busy}>Cancel</Button>
            <Button variant="primary" icon="event_seat" loading={busy} onClick={() => void submitSeat()}>Seat party</Button>
          </>
        }
      >
        {seatTarget && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Party name</span>
              <input value={partyName} onChange={(event) => setPartyName(event.target.value)} placeholder="Walk-in" className="h-12 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-4 font-body-base text-body-base text-text-primary outline-none focus:border-secondary" />
            </label>
            <div className="flex flex-col gap-1">
              <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Party size</span>
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="lg" className="h-12 w-12 px-0" aria-label="Decrease party size" disabled={busy || partySize <= 1} onClick={() => changeCovers(-1)}>−</Button>
                <div className="flex flex-1 items-baseline justify-center gap-1 rounded-lg bg-surface-container py-2">
                  <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-text-primary">{partySize}</span>
                  <span className="font-body-sm text-body-sm text-text-tertiary">covers</span>
                </div>
                <Button variant="secondary" size="lg" className="h-12 w-12 px-0" aria-label="Increase party size" disabled={busy || partySize >= seatMax} onClick={() => changeCovers(1)}>+</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => { if (!busy) setResetTarget(null); }}
        title="Reset table"
        description={resetTarget ? `${resetTarget.tableNumber} · ${resetTarget.zone}` : undefined}
        icon="cleaning_services"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button variant="danger" icon="cleaning_services" loading={busy} onClick={() => { if (resetTarget) void resetTable(resetTarget); }}>Reset / Bus</Button>
          </>
        }
      >
        <p className="font-body-base text-body-base text-text-secondary">
          This clears the party, covers and server, and returns <span className="font-bold text-text-primary">{resetTarget?.tableNumber}</span> to ready.
        </p>
      </Modal>

      <Modal
        open={Boolean(tableEditor)}
        onClose={() => { if (!busy) setTableEditor(null); }}
        title={tableEditor === 'create' ? 'Add table' : `Edit ${selected?.tableNumber ?? 'table'}`}
        description="Changes are staged until you press Save layout."
        icon="table_restaurant"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setTableEditor(null)}>Cancel</Button>
            {tableEditor === 'edit' && (
              <Button variant="danger" icon="delete" disabled={busy} onClick={() => void deleteSelected()}>Remove</Button>
            )}
            <Button variant="primary" icon="save" loading={busy} onClick={() => void saveTableEditor()}>
              {tableEditor === 'create' ? 'Add table' : 'Apply'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Table number</span>
            <input value={form.tableNumber} onChange={(event) => setForm((current) => ({ ...current, tableNumber: event.target.value }))} placeholder="e.g. T-25" className="h-11 rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-base text-body-base text-text-primary outline-none focus:border-secondary" />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Zone</span>
            <input value={form.zone} onChange={(event) => setForm((current) => ({ ...current, zone: event.target.value }))} placeholder="Main Dining Room" className="h-11 rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-base text-body-base text-text-primary outline-none focus:border-secondary" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Covers</span>
            <input type="number" min={1} max={40} value={form.capacity} onChange={(event) => setForm((current) => ({ ...current, capacity: Number(event.target.value) || 1 }))} className="h-11 rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-mono-metric-sm text-mono-metric-sm text-text-primary outline-none focus:border-secondary" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Shape</span>
            <select value={form.shape} onChange={(event) => setForm((current) => ({ ...current, shape: event.target.value as Shape }))} className="h-11 rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-sm text-body-sm text-text-primary outline-none focus:border-secondary">
              <option value="square">Square</option>
              <option value="rectangle">Rectangle</option>
              <option value="circle">Round</option>
              <option value="booth">Booth</option>
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="font-label-badge text-label-badge uppercase text-text-tertiary">Rotation · {form.rotation}°</span>
            <input type="range" min={-180} max={180} step={5} value={form.rotation} onChange={(event) => setForm((current) => ({ ...current, rotation: Number(event.target.value) }))} className="h-11 w-full accent-secondary" />
          </label>
        </div>
      </Modal>
    </AppShell>
  );
}
