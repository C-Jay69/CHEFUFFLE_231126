import { cn } from '@/lib/cn';

type Tone = 'secondary' | 'ready' | 'caution' | 'urgent' | 'violet' | 'lime';

const toneClasses: Record<Tone, string> = {
  secondary: 'text-secondary',
  ready: 'text-status-ready',
  caution: 'text-status-caution',
  urgent: 'text-status-urgent',
  violet: 'text-accent-purple-glow',
  lime: 'text-accent-lime',
};

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'secondary',
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: string;
  tone?: Tone;
}) {
  return (
    <div className="flex min-h-[116px] flex-col justify-between rounded-2xl border border-border-subtle bg-surface-container-low p-space-md shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="font-label-badge text-label-badge uppercase text-text-tertiary">{label}</span>
        {icon && (
          <span className={cn('material-symbols-outlined text-body-base', toneClasses[tone])}>
            {icon}
          </span>
        )}
      </div>
      <div className="flex flex-col">
        <span className={cn('font-mono-metric-lg text-mono-metric-lg font-bold', toneClasses[tone])}>
          {value}
        </span>
        {hint && <span className="mt-0.5 font-body-sm text-body-sm text-text-tertiary">{hint}</span>}
      </div>
    </div>
  );
}
