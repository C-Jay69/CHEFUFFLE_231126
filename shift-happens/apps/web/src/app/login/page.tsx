'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Permission } from '@shift-happens/shared/permissions';
import { api } from '@/lib/api';
import {
  clearSession,
  readStaff,
  readToken,
  writeShift,
  writeStaff,
  writeToken,
} from '@/lib/session';

const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 8;

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState<{ name: string; roleLabel: string } | null>(null);

  useEffect(() => {
    const stored = readStaff();
    if (stored && readToken()) {
      setSignedIn({ name: stored.name, roleLabel: stored.roleLabel });
    } else if (stored) {
      clearSession();
    }
  }, []);

  const signOut = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* the token may already be invalid */
    }
    clearSession();
    setSignedIn(null);
    setPin('');
  };

  const submit = async (value = pin) => {
    if (value.length < PIN_MIN_LENGTH) {
      setError(`Enter at least ${PIN_MIN_LENGTH} digits.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<{
        token: string;
        staff: {
          id: string;
          name: string;
          role: string;
          roleLabel: string;
          permissions?: Permission[];
          serveOnlyWhenClockedIn?: boolean;
        };
        activeShift: {
          id: string;
          staffId: string | null;
          clockIn: string | null;
          clockOut: string | null;
          status: string;
        } | null;
      }>('/auth/pin', { pin: value });
      writeToken(response.token);
      writeStaff({
        id: response.staff.id,
        name: response.staff.name,
        role: response.staff.role,
        roleLabel: response.staff.roleLabel,
        permissions: response.staff.permissions,
        serveOnlyWhenClockedIn: response.staff.serveOnlyWhenClockedIn,
      });
      writeShift(response.activeShift ?? null);
      setSignedIn({ name: response.staff.name, roleLabel: response.staff.roleLabel });
      router.push('/serve');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid PIN.');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const press = (digit: string) => {
    setError(null);
    if (digit === 'back') {
      setPin((current) => current.slice(0, -1));
      return;
    }
    if (digit === 'clear') {
      setPin('');
      return;
    }
    setPin((current) => (current.length >= PIN_MAX_LENGTH ? current : current + digit));
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg-canvas p-space-md">
      <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-primary-container/10 blur-[130px]" />
      <div className="pointer-events-none absolute right-10 top-10 h-80 w-80 rounded-full bg-secondary/10 blur-[120px]" />
      <div className="relative z-10 flex w-full max-w-md flex-col gap-space-md">
        <div className="flex flex-col gap-2">
          <img
            src="/chefuffle-logo.png"
            alt="Chefuffle"
            className="h-16 w-auto self-start object-contain"
          />
          <span className="font-label-badge text-label-badge font-bold uppercase tracking-widest text-secondary">
            HYDRAFORGE AI · Terminal Access
          </span>
        </div>

        <div className="rounded-2xl border border-border-subtle bg-surface-container-low p-space-lg shadow-2xl">
          {signedIn ? (
            <div className="flex flex-col items-center gap-space-sm py-space-md text-center">
              <span className="material-symbols-outlined text-headline-xl text-status-ready">verified_user</span>
              <span className="font-headline-md text-headline-md text-text-primary">
                {signedIn.name} is signed in
              </span>
              <span className="font-body-sm text-body-sm text-text-secondary">{signedIn.roleLabel}</span>
              <Link
                href="/serve"
                className="mt-space-sm flex h-12 items-center gap-space-xs rounded-lg bg-gradient-to-r from-accent-purple-glow to-secondary px-space-lg font-bold text-bg-canvas"
              >
                <span className="material-symbols-outlined">room_service</span>
                Continue to Serve
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="font-body-sm text-body-sm font-bold text-text-tertiary underline-offset-4 hover:text-status-urgent hover:underline"
              >
                Sign out
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-space-xs pb-space-md">
                <span className="material-symbols-outlined text-headline-xl text-secondary">lock</span>
                <span className="font-headline-md text-headline-md text-text-primary">Staff PIN</span>
                <span className="font-body-sm text-body-sm text-text-tertiary">
                  Enter your terminal PIN to open the ops grid.
                </span>
              </div>
              <div className="mb-space-md flex items-center justify-center gap-space-sm">
                {Array.from({ length: PIN_MAX_LENGTH }).map((_, index) => (
                  <span
                    key={index}
                    className={`h-3 w-3 rounded-full ${
                      index < pin.length
                        ? 'bg-secondary shadow-[0_0_10px_rgba(76,215,246,0.6)]'
                        : 'bg-surface-variant'
                    }`}
                  />
                ))}
              </div>
              {error && (
                <div className="mb-space-sm rounded-lg border border-status-urgent/40 bg-status-urgent/10 p-space-xs text-center font-body-sm text-body-sm text-status-urgent">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-3 gap-space-sm">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].map((key) => (
                  <button
                    key={key}
                    onClick={() => press(key)}
                    disabled={busy}
                    className={`flex h-14 items-center justify-center rounded-xl font-mono-metric-lg text-mono-metric-lg font-bold transition-all active:scale-95 ${
                      key === 'clear' || key === 'back'
                        ? 'bg-surface-container text-text-secondary hover:bg-surface-container-high'
                        : 'bg-surface-container-high text-text-primary hover:bg-surface-bright'
                    }`}
                  >
                    {key === 'clear' ? (
                      <span className="font-label-badge text-label-badge">CLR</span>
                    ) : key === 'back' ? (
                      <span className="material-symbols-outlined">backspace</span>
                    ) : (
                      key
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => void submit()}
                disabled={busy || pin.length < PIN_MIN_LENGTH}
                className="mt-space-md flex h-12 w-full items-center justify-center gap-space-xs rounded-lg bg-gradient-to-r from-accent-purple-glow to-secondary font-headline-md text-body-base font-bold text-bg-canvas shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                <span className="material-symbols-outlined">lock_open</span>
                {busy ? 'Verifying…' : 'Enter Ops Grid'}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
