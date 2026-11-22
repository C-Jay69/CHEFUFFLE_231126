export const money = (value: number | string | null | undefined, digits = 2) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value ?? 0));

export const compactMoney = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

export const number = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('en-US').format(Number(value ?? 0));

export const initials = (name: string | null | undefined) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '??';

export const elapsed = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

export const timeLabel = (value: string | Date | null | undefined) => {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const dateLabel = (value: string | Date | null | undefined) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const relativeMinutes = (value: string | Date | null | undefined) => {
  if (!value) return '—';
  const diff = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m ago`;
};

export const titleCase = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const escapeHtml = (value: string | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const localInputValue = (date = new Date()) => {
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

export const initialsColor = (seed: string) => {
  const palette = ['text-secondary', 'text-accent-purple-glow', 'text-accent-lime', 'text-status-caution'];
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
};
