import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-accent-purple-glow to-secondary text-bg-canvas shadow-lg hover:brightness-110',
  secondary:
    'border border-border-subtle bg-surface-container text-text-primary hover:bg-surface-container-high',
  ghost: 'text-text-secondary hover:bg-surface-container hover:text-text-primary',
  danger:
    'border border-status-urgent/30 bg-status-urgent/15 text-status-urgent hover:bg-status-urgent/25',
  success: 'bg-status-ready text-bg-canvas shadow-md hover:bg-emerald-400',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-body-sm',
  md: 'h-11 px-4 text-body-sm',
  lg: 'h-12 px-5 text-body-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: string;
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-body-base font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        sizes[size],
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-body-base">progress_activity</span>
      ) : (
        icon && <span className="material-symbols-outlined text-body-base">{icon}</span>
      )}
      {children}
    </button>
  );
}
