'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  Stat,
  Tabs,
  type BadgeTone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { money, titleCase } from '@/lib/format';
import { listen } from '@/lib/socket';
import { showToast } from '@/lib/toast';
import type { ArchitectAsset, ArchitectResponse } from '@/lib/types';

interface PublishAllResponse {
  published: number;
  terminals: number;
  voiceKnowledgeEntries: number;
}

interface SyncVoiceResponse {
  synced: boolean;
  menuItems: number;
  knowledgeEntries: number;
  eightySixed: number;
}

function mappingFor(item: ArchitectAsset): { tone: BadgeTone; label: string } {
  if (item.hasPosMedia && item.hasMobileMedia) {
    return { tone: 'ready', label: 'Fully mapped' };
  }
  if (item.hasPosMedia || item.hasMobileMedia) {
    return { tone: 'caution', label: 'Partially mapped' };
  }
  return { tone: 'urgent', label: 'Unmapped' };
}

export default function ArchitectPage() {
  const [data, setData] = useState<ArchitectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [imageUrl, setImageUrl] = useState('');
  const [imageError, setImageError] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishAllBusy, setPublishAllBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const response = await api.get<ArchitectResponse>('/architect');
      setData(response);
      setSelectedId((previous) =>
        previous && response.menuItems.some((item) => item.id === previous)
          ? previous
          : response.menuItems[0]?.id ?? null,
      );
      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the menu studio.';
      setError(message);
      showToast(message, 'error');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    return listen('MEDIA_PUBLISHED', () => {
      void load(false);
    });
  }, [load]);

  const items = useMemo(() => data?.menuItems ?? [], [data]);
  const health = data?.mediaHealth;

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  // Stage the selected dish's current image when the selection changes.
  useEffect(() => {
    if (!selected) return;
    setImageUrl(selected.imageUrlPos ?? selected.imageUrlMobile ?? '');
    setImageError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const categoryTabs = useMemo(
    () => [
      { id: 'all', label: 'All', count: items.length },
      ...(data?.categories ?? []).map((entry) => ({
        id: entry.id,
        label: entry.name,
        count: entry.count,
      })),
    ],
    [data, items.length],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const categoryOk = category === 'all' || item.categoryId === category;
      const searchOk =
        !term ||
        [item.name, item.category ?? '', item.station, ...item.tags].some((value) =>
          value.toLowerCase().includes(term),
        );
      return categoryOk && searchOk;
    });
  }, [category, items, search]);

  const previewSrc = imageUrl.trim();
  const mapping = selected ? mappingFor(selected) : null;

  const publish = async () => {
    if (!selected) return;
    if (!previewSrc) {
      showToast('Add an image URL before publishing.', 'warn');
      return;
    }
    if (!/^https?:\/\//i.test(previewSrc)) {
      showToast('Enter a full URL starting with http:// or https://.', 'warn');
      return;
    }
    setPublishing(true);
    try {
      await api.post('/architect/publish', {
        menuItemId: selected.id,
        imageUrlPos: previewSrc,
        imageUrlMobile: previewSrc,
        publishTo: ['pos', 'mobile'],
      });
      showToast(`${selected.name} published to POS and mobile.`, 'success');
      await load(false);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not publish the dish.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const publishAll = async () => {
    setPublishAllBusy(true);
    try {
      const result = await api.post<PublishAllResponse>('/architect/publish-all');
      showToast(`Published ${result.published} menu item(s) to every screen.`, 'success');
      await load(false);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not publish all dishes.', 'error');
    } finally {
      setPublishAllBusy(false);
    }
  };

  const syncVoice = async () => {
    setSyncBusy(true);
    try {
      const result = await api.post<SyncVoiceResponse>('/architect/sync-voice');
      showToast(
        `Voice AI synced — ${result.menuItems} menu item(s), ${result.knowledgeEntries} knowledge entries.`,
        'success',
      );
      await load(false);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not sync Voice AI.', 'error');
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <PageHeader
          eyebrow="Menu publishing"
          title="Menu Studio"
          description="Stage one dish image, publish it to POS and mobile, and keep Voice AI reading the same menu."
          icon="architecture"
          actions={
            <>
              <Button
                variant="primary"
                icon="publish"
                loading={publishAllBusy}
                disabled={loading || publishAllBusy}
                onClick={() => void publishAll()}
              >
                Publish all
              </Button>
              <Button
                variant="secondary"
                icon="graphic_eq"
                loading={syncBusy}
                disabled={loading || syncBusy}
                onClick={() => void syncVoice()}
              >
                Sync Voice AI
              </Button>
            </>
          }
        />

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-subtle bg-surface-container-low py-20">
            <span className="material-symbols-outlined animate-spin text-headline-xl text-secondary">
              progress_activity
            </span>
            <p className="font-body-sm text-body-sm text-text-tertiary">Loading menu studio…</p>
          </div>
        ) : !data ? (
          <Card>
            <EmptyState
              icon="cloud_off"
              title="Could not load the menu studio"
              description={error ?? 'The architect API did not respond.'}
              action={
                <Button variant="primary" icon="refresh" onClick={() => void load(true)}>
                  Try again
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label="Coverage"
                value={`${health?.coverage ?? 0}%`}
                icon="check_circle"
                tone="ready"
                hint="POS + mobile mapped"
              />
              <Stat
                label="Mapped"
                value={health?.mappedPos ?? 0}
                icon="image"
                tone="secondary"
                hint={`POS images · ${health?.total ?? 0} items`}
              />
              <Stat
                label="Missing"
                value={health?.unmapped ?? 0}
                icon="hide_image"
                tone="urgent"
                hint="Need a dish image"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <Card
                  title="Menu items"
                  icon="restaurant_menu"
                  subtitle="Pick a dish to preview its image."
                  actions={<Badge tone="neutral">{filtered.length}</Badge>}
                >
                  <div className="flex flex-col gap-3">
                    <SearchInput
                      value={search}
                      onChange={setSearch}
                      placeholder="Search dishes, tags, stations…"
                    />
                    <Tabs
                      items={categoryTabs}
                      value={category}
                      onChange={setCategory}
                      className="[&>button]:h-11"
                    />
                  </div>

                  <div className="mt-3 flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto pr-1">
                    {filtered.length === 0 ? (
                      <EmptyState
                        icon="search_off"
                        title="No dishes match"
                        description="Try a different search or category filter."
                        action={
                          <Button
                            variant="secondary"
                            icon="filter_alt_off"
                            onClick={() => {
                              setSearch('');
                              setCategory('all');
                            }}
                          >
                            Clear filters
                          </Button>
                        }
                      />
                    ) : (
                      filtered.map((item) => {
                        const active = item.id === selectedId;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setSelectedId(item.id)}
                            className={`flex min-h-[64px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                              active
                                ? 'border-accent-cyan-bright/60 bg-accent-cyan-bright/[0.08]'
                                : 'border-border-subtle bg-surface-container hover:bg-surface-container-high'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-body-sm text-body-sm font-bold text-text-primary">
                                {item.name}
                              </p>
                              <p className="truncate font-label-badge text-label-badge uppercase text-text-tertiary">
                                {item.category ?? 'Uncategorized'} · {titleCase(item.station)}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="font-mono-metric-sm text-mono-metric-sm font-bold text-accent-lime">
                                {money(item.price)}
                              </span>
                              <div className="flex gap-1">
                                <span
                                  className={`rounded px-1.5 py-0.5 font-label-badge text-label-badge font-bold ${
                                    item.hasPosMedia
                                      ? 'bg-status-ready/15 text-status-ready'
                                      : 'bg-surface-variant text-text-subtle'
                                  }`}
                                >
                                  POS
                                </span>
                                <span
                                  className={`rounded px-1.5 py-0.5 font-label-badge text-label-badge font-bold ${
                                    item.hasMobileMedia
                                      ? 'bg-status-ready/15 text-status-ready'
                                      : 'bg-surface-variant text-text-subtle'
                                  }`}
                                >
                                  MOBILE
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </Card>
              </div>

              <div className="lg:col-span-7">
                <Card
                  title="Dish preview"
                  icon="preview"
                  actions={mapping ? <Badge tone={mapping.tone}>{mapping.label}</Badge> : undefined}
                >
                  {!selected ? (
                    <EmptyState
                      icon="restaurant_menu"
                      title="Select a dish"
                      description="Choose a menu item on the left to preview and publish its image."
                    />
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border-subtle bg-surface-container">
                          {previewSrc && !imageError ? (
                            <img
                              src={previewSrc}
                              alt={selected.name}
                              className="h-full w-full object-cover"
                              onError={() => setImageError(true)}
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center">
                              <span className="material-symbols-outlined text-headline-xl text-text-subtle">
                                add_photo_alternate
                              </span>
                              <span className="font-body-sm text-body-sm text-text-tertiary">
                                {imageError ? 'Image could not load — paste another URL' : 'No image staged'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-1">
                            <h2 className="font-headline-lg text-headline-lg font-bold text-text-primary">
                              {selected.name}
                            </h2>
                            <p className="line-clamp-2 font-body-sm text-body-sm text-text-tertiary">
                              {selected.description ?? 'No description yet.'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="neutral">{selected.category ?? 'Uncategorized'}</Badge>
                            <Badge tone="info">{titleCase(selected.station)}</Badge>
                            {selected.is86ed && <Badge tone="urgent">86&apos;d</Badge>}
                            <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-accent-lime">
                              {money(selected.price)}
                            </span>
                          </div>

                          <div className="mt-1 grid grid-cols-2 gap-2">
                            <div className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2">
                              <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                                POS
                              </span>
                              <Badge tone={selected.hasPosMedia ? 'ready' : 'urgent'}>
                                {selected.hasPosMedia ? 'Mapped' : 'Missing'}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2">
                              <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                                Mobile
                              </span>
                              <Badge tone={selected.hasMobileMedia ? 'ready' : 'urgent'}>
                                {selected.hasMobileMedia ? 'Mapped' : 'Missing'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-border-subtle pt-4">
                        <label className="flex flex-col gap-1.5">
                          <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                            Image URL (POS + mobile)
                          </span>
                          <input
                            type="url"
                            value={imageUrl}
                            onChange={(event) => {
                              setImageUrl(event.target.value);
                              setImageError(false);
                            }}
                            placeholder="https://example.com/dish.jpg"
                            className="h-12 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-base text-body-base text-text-primary outline-none focus:border-secondary"
                          />
                        </label>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-body-sm text-body-sm text-text-tertiary">
                            The image is staged until you publish it to POS and mobile.
                          </p>
                          <Button
                            variant="success"
                            size="lg"
                            icon="publish"
                            loading={publishing}
                            className="w-full sm:w-auto"
                            onClick={() => void publish()}
                          >
                            Publish dish
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
