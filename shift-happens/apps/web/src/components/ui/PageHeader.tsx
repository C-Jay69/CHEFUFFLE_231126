import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-space-sm rounded-2xl border border-border-subtle bg-surface-container-low p-space-md shadow-lg lg:flex-row lg:items-center lg:justify-between lg:p-space-lg">
      <div className="flex flex-col">
        {eyebrow && (
          <div className="flex items-center gap-space-xs">
            {icon && (
              <span className="material-symbols-outlined text-body-base text-accent-cyan-bright">
                {icon}
              </span>
            )}
            <span className="font-label-eyebrow text-label-eyebrow uppercase tracking-widest text-secondary">
              {eyebrow}
            </span>
          </div>
        )}
        <h1 className="mt-1 font-headline-xl text-headline-xl tracking-tight text-text-primary">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl font-body-base text-body-base text-text-secondary">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-space-sm">{actions}</div>}
    </header>
  );
}
