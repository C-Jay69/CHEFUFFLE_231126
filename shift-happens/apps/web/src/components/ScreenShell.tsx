'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { playChime } from '@/lib/audio';
import { getBinder } from '@/lib/binders';
import { setupNavigation } from '@/lib/navigation';
import { screens } from '@/lib/screens';
import { getSocket } from '@/lib/socket';
import { showToast } from '@/lib/toast';

export default function ScreenShell({ screen }: { screen: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const definition = screens[screen];

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !definition) return;

    const cleanupNavigation = setupNavigation(root, router, pathname);
    const socket = getSocket();
    const binder = getBinder(screen);

    let cleanupBinder: (() => void) | undefined;
    if (binder) {
      try {
        cleanupBinder = binder({
          root,
          api,
          socket,
          router,
          toast: showToast,
          chime: playChime,
          pathname,
        }) ?? undefined;
      } catch (error) {
        console.error(`[screen:${screen}] binder failed`, error);
        showToast('This screen hit a wiring error — check the API console.', 'error');
      }
    }

    return () => {
      cleanupNavigation();
      try {
        cleanupBinder?.();
      } catch (error) {
        console.warn(`[screen:${screen}] cleanup failed`, error);
      }
    };
  }, [definition, pathname, router, screen]);

  if (!definition) {
    return (
      <main className="min-h-screen bg-bg-canvas p-10 text-on-surface">
        <h1 className="font-headline-lg text-headline-lg">Screen not found</h1>
        <p className="mt-2 text-text-secondary">
          No generated design for <code>{screen}</code>.
        </p>
      </main>
    );
  }

  return (
    <div
      ref={rootRef}
      suppressHydrationWarning
      className={`${definition.bodyClass} min-h-screen`}
      data-screen={screen}
      dangerouslySetInnerHTML={{ __html: definition.bodyHtml }}
    />
  );
}
