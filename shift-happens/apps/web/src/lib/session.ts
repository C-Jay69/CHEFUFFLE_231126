'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Permission } from '@shift-happens/shared/permissions';

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
export const SESSION_EVENT = 'sh-session-change';

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
    localStorage.removeItem('sh-token');
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
      // An unidentified terminal keeps full access; this is a PIN demo gate.
      if (!staff) return true;
      if (!staff.permissions) return true;
      return staff.permissions.includes(permission);
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
