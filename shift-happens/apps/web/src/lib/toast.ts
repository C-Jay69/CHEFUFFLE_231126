'use client';

export type ToastKind = 'success' | 'error' | 'warn' | 'info';

const ICONS: Record<ToastKind, string> = {
  success: 'check_circle',
  error: 'error',
  warn: 'warning',
  info: 'info',
};

function stack(): HTMLElement {
  let node = document.getElementById('sh-toast-stack');
  if (!node) {
    node = document.createElement('div');
    node.id = 'sh-toast-stack';
    node.className = 'sh-toast-stack';
    document.body.appendChild(node);
  }
  return node;
}

export function showToast(message: string, kind: ToastKind = 'info', timeout = 4200) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.className = `sh-toast sh-toast--${kind}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="sh-toast__icon text-${
    kind === 'success' ? 'status-ready' : kind === 'error' ? 'status-urgent' : kind === 'warn' ? 'status-caution' : 'secondary'
  }">${ICONS[kind]}</span><span class="flex-1">${escapeHtml(message)}</span>`;
  stack().appendChild(el);
  window.setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    window.setTimeout(() => el.remove(), 220);
  }, timeout);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
