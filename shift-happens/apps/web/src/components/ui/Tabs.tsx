import { cn } from '@/lib/cn';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto pb-1', className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'flex h-10 shrink-0 items-center gap-1.5 rounded-full px-space-md font-body-sm font-bold transition-colors',
              active
                ? 'bg-gradient-to-r from-accent-purple-glow to-secondary text-bg-canvas shadow-md'
                : 'bg-surface-container text-text-secondary hover:bg-surface-container-high hover:text-text-primary',
            )}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 font-mono-metric-sm text-[10px] font-bold',
                  active ? 'bg-bg-canvas/20 text-bg-canvas' : 'bg-surface-variant text-text-tertiary',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
