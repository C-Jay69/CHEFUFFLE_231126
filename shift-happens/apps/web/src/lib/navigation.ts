'use client';

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

interface NavItem {
  route: string;
  label: string;
  icon: string;
  iconClass: string;
}

const NAV_ITEMS: NavItem[] = [
  { route: '/pos', label: 'POS & Orders', icon: 'point_of_sale', iconClass: 'text-secondary' },
  { route: '/floor-plan', label: 'Floor Plan & Seating', icon: 'table_restaurant', iconClass: 'text-secondary' },
  { route: '/kds', label: 'Kitchen KDS', icon: 'skillet', iconClass: 'text-status-caution' },
  { route: '/reservations', label: 'Reservations & CRM', icon: 'book_online', iconClass: 'text-secondary' },
  { route: '/inventory', label: 'Inventory Management', icon: 'inventory_2', iconClass: 'text-secondary' },
  { route: '/scheduling', label: 'Staff Scheduling & Shifts', icon: 'calendar_month', iconClass: 'text-secondary' },
  { route: '/briefing', label: 'Pre-Shift Briefing', icon: 'campaign', iconClass: 'text-accent-purple-glow' },
  { route: '/onboarding', label: 'Team Onboarding & Training', icon: 'school', iconClass: 'text-secondary' },
  { route: '/architect', label: 'Architect & Media Studio', icon: 'architecture', iconClass: 'text-secondary' },
  { route: '/mobile', label: 'Mobile Floor Manager', icon: 'smartphone', iconClass: 'text-secondary' },
  { route: '/voice-ai', label: 'Voice AI Agent', icon: 'neurology', iconClass: 'text-accent-purple-glow' },
];

const INACTIVE_FALLBACK =
  'flex items-center gap-space-sm px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors';

export function routeForDataPath(path: string | undefined): string | null {
  if (!path) return null;
  const value = path.toLowerCase();
  if (value.includes('pos')) return '/pos';
  if (value.includes('architect')) return '/architect';
  if (value.includes('floor-plan')) return '/floor-plan';
  if (value.includes('kitchen') || value.includes('kds')) return '/kds';
  if (value.includes('reservation')) return '/reservations';
  if (value.includes('inventory')) return '/inventory';
  if (value.includes('scheduling')) return '/scheduling';
  if (value.includes('briefing')) return '/briefing';
  if (value.includes('onboarding') || value.includes('training')) return '/onboarding';
  if (value.includes('mobile')) return '/mobile';
  if (value.includes('voice')) return '/voice-ai';
  return null;
}

/**
 * Normalises the static design sidebar into a working app router:
 *  - maps design data-path labels onto real routes
 *  - appends any screens missing from this page's variant of the rail
 *  - applies the design system's own active-state classes
 */
export function setupNavigation(
  root: HTMLElement,
  router: AppRouterInstance,
  pathname: string,
): () => void {
  const nav = root.querySelector('nav[data-active-classes]') as HTMLElement | null;
  const activeClasses = nav?.getAttribute('data-active-classes') ?? '';
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[data-path]'));
  const inactiveClasses =
    anchors.find((anchor) => !anchor.className.includes('bg-gradient-to-r'))?.className ||
    INACTIVE_FALLBACK;

  const mappedRoutes = new Set<string>();
  for (const anchor of anchors) {
    const route = routeForDataPath(anchor.dataset.path);
    if (!route) continue;
    mappedRoutes.add(route);
    anchor.dataset.route = route;
    anchor.setAttribute('href', route);
    anchor.setAttribute('aria-current', route === pathname ? 'page' : 'false');
  }

  if (nav) {
    nav.style.maxHeight = 'calc(100vh - 190px)';
    nav.style.overflowY = 'auto';
    nav.style.paddingBottom = '0.5rem';
    nav.dataset.liveNav = 'true';

    for (const item of NAV_ITEMS) {
      if (mappedRoutes.has(item.route)) continue;
      const anchor = document.createElement('a');
      anchor.className = inactiveClasses;
      anchor.href = item.route;
      anchor.dataset.path = item.route;
      anchor.dataset.route = item.route;
      anchor.innerHTML = `<span class="material-symbols-outlined ${item.iconClass}">${item.icon}</span><span class="font-body-base text-body-base font-semibold">${item.label}</span>`;
      nav.appendChild(anchor);
      mappedRoutes.add(item.route);
    }
  }

  const liveAnchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[data-route]'));
  for (const anchor of liveAnchors) {
    const isActive = anchor.dataset.route === pathname;
    anchor.className = isActive ? activeClasses : inactiveClasses;
    anchor.setAttribute('aria-current', isActive ? 'page' : 'false');
    if (isActive) {
      anchor.classList.add(
        'bg-gradient-to-r',
        'from-accent-purple-glow/20',
        'to-secondary/20',
        'text-text-primary',
        'font-bold',
      );
    }
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest<HTMLAnchorElement>('a[data-route]');
    if (!anchor) return;
    const route = anchor.dataset.route;
    if (!route || route === pathname) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    router.push(route);
  };
  root.addEventListener('click', onClick);

  // The design's profile block is the entry point to the PIN terminal.
  const profile = root.querySelector('header img[alt="Profile"]')?.closest('div');
  const onProfile = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('header') && target.closest('div') === profile) {
      event.preventDefault();
      router.push('/login');
    }
  };
  profile?.addEventListener('click', onProfile);

  const pwaDot = root.querySelector('.sh-live-dot');
  void pwaDot;

  return () => {
    root.removeEventListener('click', onClick);
    profile?.removeEventListener('click', onProfile);
  };
}
