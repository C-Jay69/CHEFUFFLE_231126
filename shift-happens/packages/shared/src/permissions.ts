/**
 * Role → permission matrix shared by the API (enforcement) and the web app
 * (navigation + controls). Kept dependency-free so the browser bundle never
 * pulls in Zod.
 */

import type { UserRole } from './constants';

export type UserRoleName = UserRole;

export type Permission =
  | 'serve.order'
  | 'serve.pay'
  | 'orders.void'
  | 'floor.seat'
  | 'floor.manage'
  | 'reservations.manage'
  | 'kds.operate'
  | 'inventory.manage'
  | 'menu.manage'
  | 'scheduling.manage'
  | 'briefing.manage'
  | 'training.manage'
  | 'staff.manage'
  | 'voice.manage'
  | 'reports.view';

export const ALL_PERMISSIONS: Permission[] = [
  'serve.order',
  'serve.pay',
  'orders.void',
  'floor.seat',
  'floor.manage',
  'reservations.manage',
  'kds.operate',
  'inventory.manage',
  'menu.manage',
  'scheduling.manage',
  'briefing.manage',
  'training.manage',
  'staff.manage',
  'voice.manage',
  'reports.view',
];

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  general_manager: 'General Manager',
  floor_manager: 'Floor Manager',
  chef_expo: 'Chef / Expo',
  line_cook: 'Line Cook',
  server: 'Server',
  bartender: 'Bartender',
  host: 'Host',
};

export const ROLE_PERMISSIONS: Record<UserRoleName, Permission[]> = {
  owner: ALL_PERMISSIONS,
  general_manager: ALL_PERMISSIONS,
  floor_manager: [
    'serve.order',
    'serve.pay',
    'orders.void',
    'floor.seat',
    'floor.manage',
    'reservations.manage',
    'kds.operate',
    'inventory.manage',
    'scheduling.manage',
    'briefing.manage',
    'training.manage',
    'reports.view',
  ],
  chef_expo: [
    'kds.operate',
    'inventory.manage',
    'menu.manage',
    'briefing.manage',
    'training.manage',
    'reports.view',
  ],
  line_cook: ['kds.operate', 'inventory.manage'],
  server: ['serve.order', 'serve.pay', 'floor.seat'],
  bartender: ['serve.order', 'serve.pay', 'floor.seat'],
  host: ['floor.seat', 'reservations.manage'],
};

export function permissionsForRole(role: string | null | undefined): Permission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role as UserRoleName] ?? [];
}

export function roleHasPermission(
  role: string | null | undefined,
  permission: Permission,
): boolean {
  return permissionsForRole(role).includes(permission);
}

/** Roles restricted to the table plan while they are clocked in. */
export const SERVE_ONLY_WHEN_CLOCKED_IN: UserRoleName[] = ['server', 'bartender'];

export function isServeOnlyRole(role: string | null | undefined): boolean {
  return SERVE_ONLY_WHEN_CLOCKED_IN.includes(role as UserRoleName);
}
