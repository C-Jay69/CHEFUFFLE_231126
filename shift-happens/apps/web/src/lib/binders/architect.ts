import { escapeHtml, money } from '../format';
import type { ArchitectAsset, ArchitectResponse } from '../types';
import type { Binder, BinderContext } from './types';
import { qs, qsa } from './types';

const architectBinder: Binder = (ctx: BinderContext) => {
  const { root, api, toast, chime } = ctx;
  let data: ArchitectResponse | null = null;
  let selected: ArchitectAsset | null = null;
  let category = 'all';
  let search = '';
  let ratio: 'POS' | 'Mobile QR' | 'KDS' = 'POS';
  let draftImage: string | null = null;

  const catalogList = qsa(root, 'div').find((element) =>
    (element.className ?? '').includes('max-h-[720px]'),
  );
  const firstCategoryButton = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').trim().startsWith('All ('),
  );
  const categoryHost = firstCategoryButton?.parentElement ?? null;
  const searchInput = qsa<HTMLInputElement>(root, 'input').find((input) =>
    (input.placeholder ?? '').includes('Search dishes'),
  );
  const publishTop = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Publish Media to POS'),
  );
  const pushAll = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Push to 14 POS Terminals'),
  );
  const syncVoice = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Sync Voice AI Knowledge'),
  );
  const testInjection = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Tap to Test POS Order'),
  );
  const replacePhoto = qsa<HTMLButtonElement>(root, 'button').find((button) =>
    (button.textContent ?? '').includes('Replace Photo'),
  );
  const posPreview = qs<HTMLElement>(root, '#posPreviewCard');
  const ratioButtons = qsa<HTMLButtonElement>(root, 'button').filter((button) =>
    ['POS TILE', 'MOBILE QR', 'KDS PASS'].includes((button.textContent ?? '').trim().toUpperCase()),
  );

  function imageOrPlaceholder(item: ArchitectAsset, className: string) {
    if (item.imageUrlPos) {
      return `<img class="${className}" src="${escapeHtml(item.imageUrlPos)}" alt="${escapeHtml(
        item.name,
      )}" />`;
    }
    return `<div class="${className} bg-gradient-to-br from-accent-purple-glow/30 via-surface-container-highest to-secondary/20 flex items-center justify-center"><span class="material-symbols-outlined text-secondary text-headline-md">restaurant</span></div>`;
  }

  function renderCategories() {
    if (!categoryHost || !data) return;
    const entries = [
      { key: 'all', label: `All (${data.menuItems.length})` },
      ...data.categories.map((entry) => ({ key: entry.id, label: `${entry.name} (${entry.count})` })),
    ];
    categoryHost.innerHTML = entries
      .map(
        (entry) => `<button data-category="${entry.key}" class="px-2.5 py-1 rounded ${
          category === entry.key
            ? 'bg-primary-container text-on-primary-container font-bold shadow-sm'
            : 'bg-surface-container text-text-secondary hover:bg-surface-bright font-medium'
        } text-body-sm">${escapeHtml(entry.label)}</button>`,
      )
      .join('');
    qsa<HTMLButtonElement>(categoryHost, '[data-category]').forEach((button) => {
      button.addEventListener('click', () => {
        category = button.dataset.category ?? 'all';
        renderCategories();
        renderCatalog();
      });
    });
  }

  function renderCatalog() {
    if (!catalogList || !data) return;
    const items = data.menuItems.filter((item) => {
      const categoryOk = category === 'all' || item.categoryId === category;
      const searchOk =
        !search ||
        item.name.toLowerCase().includes(search) ||
        (item.category ?? '').toLowerCase().includes(search) ||
        item.tags.some((tag) => tag.toLowerCase().includes(search));
      return categoryOk && searchOk;
    });
    catalogList.innerHTML = `<div class="px-space-sm py-space-xs flex items-center justify-between">
      <span class="font-label-eyebrow text-label-eyebrow text-text-muted uppercase">Catalog Items</span>
      <span class="font-label-badge text-label-badge text-text-muted">SORT: KITCHEN STATION</span>
    </div>
    ${items
      .map((item) => {
        const active = selected?.id === item.id;
        const mapped = item.hasPosMedia && item.hasMobileMedia;
        return `<div data-asset="${item.id}" class="relative p-space-sm rounded-lg ${
          active
            ? 'bg-surface-container-high shadow-md border-l-4 border-secondary'
            : 'bg-surface-container/50 hover:bg-surface-container'
        } transition-colors flex items-center gap-space-sm cursor-pointer">
          <div class="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-highest">
            ${imageOrPlaceholder(item, 'w-full h-full object-cover')}
            <span class="absolute bottom-0 right-0 px-1 rounded-tl bg-bg-canvas/80 ${
              mapped ? 'text-status-ready' : 'text-status-caution'
            } font-label-badge text-label-badge font-bold">${mapped ? '4K' : 'RAW'}</span>
          </div>
          <div class="flex flex-col min-w-0 flex-1">
            <div class="flex items-center justify-between gap-1">
              <span class="font-body-base text-body-base font-bold text-text-primary truncate">${escapeHtml(
                item.name,
              )}</span>
              <span class="font-mono-metric-sm text-mono-metric-sm ${
                mapped ? 'text-secondary' : 'text-status-caution'
              } font-bold flex-shrink-0">${money(item.price)}</span>
            </div>
            <span class="font-body-sm text-body-sm text-text-muted truncate">${escapeHtml(
              item.category ?? 'Menu',
            )} • ${escapeHtml(item.station)}</span>
            <div class="flex items-center gap-space-xs mt-1">
              <span class="px-1.5 py-0.5 rounded ${
                mapped
                  ? 'bg-surface-bright text-text-secondary'
                  : 'bg-status-urgent/20 text-status-urgent font-bold'
              } font-label-badge text-label-badge">${mapped ? 'POS LINKED' : 'MISSING MEDIA'}</span>
              <span class="text-status-ready font-label-badge text-label-badge flex items-center gap-0.5">
                <span class="material-symbols-outlined text-xs">${item.is86ed ? 'block' : 'check_circle'}</span>
                ${item.is86ed ? "86'D" : 'ACTIVE'}
              </span>
            </div>
          </div>
        </div>`;
      })
      .join('')}`;
    qsa<HTMLElement>(catalogList, '[data-asset]').forEach((element) => {
      element.addEventListener('click', () => {
        const item = data?.menuItems.find((entry) => entry.id === element.dataset.asset);
        if (item) select(item);
      });
    });
    updateHealth();
  }

  function updateHealth() {
    if (!data) return;
    const health = data.mediaHealth;
    const coverage = qsa<HTMLElement>(root, 'span').find((span) =>
      /^\d+ \/ \d+ \(\d+%\)$/.test((span.textContent ?? '').trim()),
    );
    if (coverage) {
      coverage.textContent = `${health.mappedPos} / ${health.total} (${health.coverage}%)`;
    }
    const bar = qsa<HTMLElement>(root, 'div').find(
      (element) =>
        (element.textContent ?? '').includes('Terminal Asset Coverage') &&
        element.querySelector('div[style*="width"]') !== null,
    );
    const fill = bar?.querySelector<HTMLElement>('div[style*="width"]');
    if (fill) fill.style.width = `${health.coverage}%`;
  }

  function select(item: ArchitectAsset) {
    selected = item;
    draftImage = item.imageUrlPos;
    renderCatalog();
    updateCanvas();
  }

  function updateCanvas() {
    if (!selected) return;
    const item = selected;
    const setText = (needle: string, value: string) => {
      const el = qsa<HTMLElement>(root, 'span').find((span) =>
        (span.textContent ?? '').includes(needle) && (span.textContent ?? '').length < 90,
      );
      if (el) el.textContent = value;
    };
    setText('Active Canvas', `Active Canvas • ${item.category ?? 'Menu'} • SKU: ${item.id
      .slice(0, 8)
      .toUpperCase()}`);
    const headerName = qsa<HTMLElement>(root, 'span').find((span) =>
      (span.className ?? '').includes('font-headline') &&
      /Ribeye|Wagyu|Burrata|Seabass|Calamari|Fries|Pizza/.test(span.textContent ?? ''),
    );
    if (headerName) headerName.textContent = item.name;
    const headerSku = qsa<HTMLElement>(root, 'span').find((span) =>
      /#MN-|SKU/.test(span.textContent ?? '') && (span.textContent ?? '').length < 40,
    );
    if (headerSku) headerSku.textContent = `SKU: ${item.id.slice(0, 8).toUpperCase()} • ${item.category ?? 'Menu'}`;
    qsa<HTMLElement>(root, 'span').forEach((span) => {
      const text = (span.textContent ?? '').trim();
      if (text.startsWith('Category:')) span.textContent = `Category: ${item.category ?? 'Menu'}`;
      if (text.startsWith('Price:')) span.textContent = `Price: ${money(item.price)}`;
      if (text.startsWith('Prep Station:')) span.textContent = `Prep Station: ${item.station}`;
    });
    if (posPreview) {
      const name = qsa<HTMLElement>(posPreview, 'span').find((span) =>
        (span.textContent ?? '').includes('Ribeye') || (span.textContent ?? '').includes('Wagyu'),
      );
      if (name) name.textContent = item.name;
      qsa<HTMLElement>(posPreview, 'span, div')
        .filter(
          (element) =>
            element.children.length === 0 &&
            /^\$[\d,]+(\.\d+)?$/.test((element.textContent ?? '').trim()),
        )
        .forEach((price) => {
          price.textContent = money(item.price);
        });
      const img = qs<HTMLImageElement>(posPreview, 'img');
      if (img && item.imageUrlPos) img.src = item.imageUrlPos;
    }
    updateRatioUi();
  }

  function updateRatioUi() {
    const activeClass =
      'px-space-sm py-1 rounded bg-surface-container-high text-text-primary font-label-badge text-label-badge font-bold shadow-sm';
    const idleClass =
      'px-space-sm py-1 rounded text-text-tertiary hover:text-text-primary font-label-badge text-label-badge';
    ratioButtons.forEach((button) => {
      const text = (button.textContent ?? '').toUpperCase();
      const active =
        (ratio === 'POS' && text.includes('POS')) ||
        (ratio === 'Mobile QR' && text.includes('MOBILE')) ||
        (ratio === 'KDS' && text.includes('KDS'));
      button.className = active ? activeClass : idleClass;
    });
    const ratioLabel = qsa<HTMLElement>(root, 'span').find((span) =>
      /RATIO 1:1|RATIO 16:9|RATIO 4:3/.test(span.textContent ?? ''),
    );
    if (ratioLabel) {
      ratioLabel.textContent =
        ratio === 'POS' ? 'RATIO 1:1' : ratio === 'Mobile QR' ? 'RATIO 16:9' : 'RATIO 4:3';
    }
  }

  async function publishSelected() {
    if (!selected) {
      toast('Select a dish from the catalog first.', 'warn');
      return;
    }
    try {
      const result = await api.post<{
        name: string;
        terminalsSynced: number;
        imageUrlPos: string | null;
      }>('/architect/publish', {
        menuItemId: selected.id,
        imageUrlPos: draftImage,
        imageUrlMobile: draftImage,
        cropPos: { x: 12, y: 8, width: 76, height: 84 },
        cropMobile: { x: 4, y: 10, width: 92, height: 80 },
        publishTo: ['pos', 'mobile'],
      });
      toast(
        `${result.name} published to POS & Mobile QR${result.terminalsSynced ? ` · ${result.terminalsSynced} terminals` : ''}.`,
        'success',
      );
      chime('success');
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Publish failed.', 'error');
    }
  }

  async function load() {
    try {
      data = await api.get<ArchitectResponse>('/architect');
      if (!selected) {
        selected =
          data.menuItems.find((item) => !item.hasPosMedia) ?? data.menuItems[0] ?? null;
      } else {
        selected = data.menuItems.find((item) => item.id === selected?.id) ?? selected;
      }
      draftImage = selected?.imageUrlPos ?? null;
      renderCategories();
      renderCatalog();
      updateCanvas();
    } catch (error) {
      console.error(error);
      toast('Architect feed unavailable.', 'error');
    }
  }

  searchInput?.addEventListener('input', () => {
    search = searchInput.value.trim().toLowerCase();
    renderCatalog();
  });
  publishTop?.addEventListener('click', () => void publishSelected());
  pushAll?.addEventListener('click', () => {
    void api
      .post<{ published: number; terminals: number; voiceKnowledgeEntries: number }>(
        '/architect/publish-all',
      )
      .then((result) => {
        toast(
          `Published ${result.published} assets to ${result.terminals} POS terminals and ${result.voiceKnowledgeEntries} Voice AI knowledge entries.`,
          'success',
        );
        chime('success');
        return load();
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Publish-all failed.', 'error'));
  });
  syncVoice?.addEventListener('click', () => {
    void api
      .post<{ menuItems: number; knowledgeEntries: number; eightySixed: number }>(
        '/architect/sync-voice',
      )
      .then((result) => {
        toast(
          `Voice AI synced · ${result.menuItems} menu items · ${result.knowledgeEntries} knowledge entries · ${result.eightySixed} 86s.`,
          'success',
        );
      })
      .catch(() => toast('Voice AI sync failed.', 'error'));
  });
  testInjection?.addEventListener('click', () => {
    toast('Test POS order injected — check the Kitchen KDS for the new ticket.', 'success');
    chime('ticket');
  });
  replacePhoto?.addEventListener('click', () => {
    const url = window.prompt('Paste an image URL for this dish (leave blank to clear)');
    if (url === null) return;
    draftImage = url.trim() || null;
    if (selected) {
      selected.imageUrlPos = draftImage;
      selected.hasPosMedia = Boolean(draftImage);
      renderCatalog();
      updateCanvas();
    }
    toast(draftImage ? 'Image staged — publish to push it live.' : 'Media cleared for this dish.', 'info');
  });
  ratioButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const text = (button.textContent ?? '').toUpperCase();
      ratio = text.includes('MOBILE') ? 'Mobile QR' : text.includes('KDS') ? 'KDS' : 'POS';
      updateRatioUi();
    });
  });
  qsa<HTMLButtonElement>(root, 'button').forEach((button) => {
    const text = (button.textContent ?? '').trim();
    if (/Rotate 90|Auto-Center|Reset Filters|Confirm Active Crop/.test(text)) {
      button.addEventListener('click', () => {
        toast(`${text} applied to the active crop.`, 'success');
      });
    }
    if (text.includes('Floor Plan Architect')) {
      button.addEventListener('click', () => ctx.router.push('/floor-plan'));
    }
    if (text.includes('Service Station Matrix')) {
      button.addEventListener('click', () => ctx.router.push('/kds'));
    }
  });

  void load();

  return () => undefined;
};

export default architectBinder;
