import { cn } from '@/lib/cn';

export type BadgeTone = 'ready' | 'caution' | 'urgent' | 'info' | 'neutral' | 'violet' | 'lime';

const tones: Record<BadgeTone, string> = {
  ready: 'bg-status-ready/15 text-status-ready',
  caution: 'bg-status-caution/15 text-status-caution',
  urgent: 'bg-status-urgent/15 text-status-urgent',
  info: 'bg-status-info/15 text-status-info',
  neutral: 'bg-surface-variant text-text-tertiary',
  violet: 'bg-accent-purple-glow/15 text-accent-purple-glow',
  lime: 'bg-accent-lime/15 text-accent-lime',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-badge text-label-badge font-bold uppercase tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
