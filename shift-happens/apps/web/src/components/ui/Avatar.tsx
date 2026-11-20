import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'h-8 w-8 text-[10px]',
    md: 'h-10 w-10 text-label-badge',
    lg: 'h-12 w-12 text-mono-metric-md',
  };
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-accent-purple-glow/15 font-bold text-accent-purple-glow',
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
