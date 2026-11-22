import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
  bodyClassName,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  icon?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border-subtle bg-surface-container-low shadow-md',
        padded && 'p-space-md',
        className,
      )}
    >
      {(title || actions) && (
        <header className="mb-space-sm flex flex-wrap items-start justify-between gap-space-sm">
          <div className="flex items-start gap-space-xs">
            {icon && <span className="material-symbols-outlined text-body-base text-secondary">{icon}</span>}
            <div className="flex flex-col">
              {title && (
                <h2 className="font-headline-md text-headline-md font-bold text-text-primary">{title}</h2>
              )}
              {subtitle && (
                <p className="font-body-sm text-body-sm text-text-tertiary">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-space-xs">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
