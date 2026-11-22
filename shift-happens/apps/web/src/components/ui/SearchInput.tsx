import { cn } from '@/lib/cn';

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'flex h-11 flex-1 items-center gap-space-xs rounded-lg border border-border-subtle bg-surface-container px-space-sm',
        className,
      )}
    >
      <span className="material-symbols-outlined text-body-base text-text-tertiary">search</span>
      <input
        className="w-full bg-transparent font-body-sm text-body-sm text-text-primary outline-none placeholder:text-text-subtle"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
