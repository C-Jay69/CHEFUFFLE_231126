import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { Socket } from 'socket.io-client';
import type { api } from '../api';
import type { playChime } from '../audio';
import type { showToast } from '../toast';

export interface BinderContext {
  root: HTMLElement;
  api: typeof api;
  socket: Socket;
  router: AppRouterInstance;
  toast: typeof showToast;
  chime: typeof playChime;
  pathname: string;
}

export type Binder = (ctx: BinderContext) => void | (() => void);

export const qs = <T extends Element = HTMLElement>(root: ParentNode, selector: string): T | null =>
  root.querySelector<T>(selector);

export const qsa = <T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T[] => Array.from(root.querySelectorAll<T>(selector));

export function findButton(root: ParentNode, ...texts: string[]): HTMLButtonElement | null {
  const buttons = qsa<HTMLButtonElement>(root, 'button');
  return (
    buttons.find((button) => {
      const text = (button.textContent ?? '').toLowerCase();
      return texts.some((needle) => text.includes(needle.toLowerCase()));
    }) ?? null
  );
}

export function findSectionByText(root: ParentNode, text: string): HTMLElement | null {
  const sections = qsa<HTMLElement>(root, 'section, div');
  return (
    sections.find((section) => {
      const content = section.textContent ?? '';
      return content.includes(text) && section.children.length > 0;
    }) ?? null
  );
}

export function setText(root: ParentNode, selector: string, value: string) {
  const element = qs(root, selector);
  if (element) element.textContent = value;
}

export function onClick(
  element: Element | null,
  handler: (event: MouseEvent) => void,
): void {
  element?.addEventListener('click', handler as EventListener);
}
