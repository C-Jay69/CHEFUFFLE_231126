'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  permissionsForRole,
  type Permission,
} from '@shift-happens/shared/permissions';

export interface SessionStaff {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  permissions?: Permission[];
  serveOnlyWhenClockedIn?: boolean;
}

export interface ActiveShift {
  id: string;
  staffId: string | null;
  clockIn: string | null;
  clockOut: string | null;
  status: string;
}

const STAFF_KEY = 'sh-staff';
const SHIFT_KEY = 'sh-shift';
const TOKEN_KEY = 'sh-token';
export const SESSION_EVENT = 'sh-session-change';

/**
 * Opaque bearer token issued by `POST /api/auth/pin`. This is the only piece
 * of session state the API trusts; the staff object is a cached display copy.
 */
export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
  emitSessionChange();
}

export function readStaff(): SessionStaff | null {
  try {
    const raw = localStorage.getItem(STAFF_KEY);
    return raw ? (JSON.parse(raw) as SessionStaff) : null;
  } catch {
    return null;
  }
}

export function readShift(): ActiveShift | null {
  try {
    const raw = localStorage.getItem(SHIFT_KEY);
    return raw ? (JSON.parse(raw) as ActiveShift) : null;
  } catch {
    return null;
  }
}

export function emitSessionChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function writeStaff(staff: SessionStaff | null) {
  try {
    if (staff) localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
    else localStorage.removeItem(STAFF_KEY);
  } catch {
    /* private mode */
  }
  emitSessionChange();
}

export function writeShift(shift: ActiveShift | null) {
  try {
    if (shift) localStorage.setItem(SHIFT_KEY, JSON.stringify(shift));
    else localStorage.removeItem(SHIFT_KEY);
  } catch {
    /* private mode */
  }
  emitSessionChange();
}

export function clearSession() {
  try {
    localStorage.removeItem(STAFF_KEY);
    localStorage.removeItem(SHIFT_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
  emitSessionChange();
}

/** Server-restricted roles lose every screen except the table plan on shift. */
export function isClockedIn(shift: ActiveShift | null) {
  return Boolean(shift && shift.clockIn && !shift.clockOut);
}

export function useSession() {
  const [staff, setStaff] = useState<SessionStaff | null>(null);
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setStaff(readStaff());
      setShift(readShift());
      setReady(true);
    };
    sync();
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const can = useCallback(
    (permission: Permission) => {
      // No authenticated staff means no permissions. There is no anonymous
      // "demo" default any more.
      if (!staff) return false;
      // Derive from the role so a session stored before a permission was added
      // still sees the current matrix (e.g. End of Night).
      if (staff.role) return permissionsForRole(staff.role).includes(permission);
      return staff.permissions?.includes(permission) ?? false;
    },
    [staff],
  );

  const onShift = isClockedIn(shift);
  const lockedToServe = Boolean(
    staff &&
      onShift &&
      (staff.serveOnlyWhenClockedIn ||
        staff.role === 'server' ||
        staff.role === 'bartender'),
  );

  return { staff, shift, ready, can, onShift, lockedToServe };
}
