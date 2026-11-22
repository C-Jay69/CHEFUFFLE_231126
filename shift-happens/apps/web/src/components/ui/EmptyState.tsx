import type { ReactNode } from 'react';

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-space-xs rounded-xl border border-dashed border-border-subtle py-space-lg px-space-md text-center">
      <span className="material-symbols-outlined text-headline-xl text-text-subtle">{icon}</span>
      <span className="font-body-base text-body-base font-bold text-text-primary">{title}</span>
      {description && (
        <span className="max-w-sm font-body-sm text-body-sm text-text-tertiary">{description}</span>
      )}
      {action && <div className="mt-space-xs">{action}</div>}
    </div>
  );
}
