'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-bg-canvas/80 p-space-md backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-border-subtle bg-surface-container-high p-space-lg shadow-2xl',
          maxWidth,
        )}
      >
        <div className="flex items-start justify-between gap-space-sm">
          <div className="flex items-start gap-space-xs">
            {icon && (
              <span className="material-symbols-outlined text-headline-md text-secondary">{icon}</span>
            )}
            <div className="flex flex-col">
              <h2 className="font-headline-lg text-headline-lg font-bold text-text-primary">{title}</h2>
              {description && (
                <p className="mt-0.5 font-body-sm text-body-sm text-text-tertiary">{description}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container text-text-tertiary transition-colors hover:text-text-primary"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="mt-space-md">{children}</div>
        {footer && (
          <div className="mt-space-md flex flex-wrap justify-end gap-space-sm border-t border-border-subtle pt-space-md">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
