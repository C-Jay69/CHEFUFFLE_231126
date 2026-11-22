import { cn } from '@/lib/cn';

const tones = {
  ready: 'bg-status-ready',
  caution: 'bg-status-caution',
  urgent: 'bg-status-urgent',
  secondary: 'bg-gradient-to-r from-accent-purple-glow to-secondary',
  primary: 'bg-primary',
};

export function Progress({
  value,
  tone = 'secondary',
  className,
}: {
  value: number;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest', className)}>
      <div
        className={cn('h-full rounded-full transition-all', tones[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
