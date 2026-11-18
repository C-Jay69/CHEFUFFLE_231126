'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface StaffSummary {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [staff, setStaff] = useState<StaffSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState<{ name: string; roleLabel: string } | null>(null);

  useEffect(() => {
    api
      .get<{ staff: StaffSummary[] }>('/auth/staff')
      .then((response) => setStaff(response.staff))
      .catch(() => undefined);
    try {
      const raw = localStorage.getItem('sh-staff');
      if (raw) setSignedIn(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const submit = async (value = pin) => {
    if (value.length < 3) {
      setError('Enter at least 3 digits.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<{
        token: string;
        staff: { id: string; name: string; role: string; roleLabel: string };
      }>('/auth/pin', { pin: value });
      try {
        localStorage.setItem('sh-token', response.token);
        localStorage.setItem(
          'sh-staff',
          JSON.stringify({ name: response.staff.name, roleLabel: response.staff.roleLabel }),
        );
      } catch {
        /* private mode */
      }
      setSignedIn({ name: response.staff.name, roleLabel: response.staff.roleLabel });
      router.push('/pos');
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
    setPin((current) => (current.length >= 6 ? current : current + digit));
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg-canvas p-space-md">
      <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-primary-container/10 blur-[130px]" />
      <div className="pointer-events-none absolute right-10 top-10 h-80 w-80 rounded-full bg-secondary/10 blur-[120px]" />
      <div className="relative z-10 flex w-full max-w-md flex-col gap-space-md">
        <div className="flex items-center gap-space-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent-purple-glow to-secondary font-headline-xl text-headline-xl font-black text-bg-canvas">
            S
          </div>
          <div className="flex flex-col">
            <span className="font-headline-lg text-headline-lg uppercase tracking-tight text-text-primary">
              SHIFT HAPPENS!
            </span>
            <span className="font-label-badge text-label-badge font-bold uppercase tracking-widest text-secondary">
              HYDRAFORGE AI · Terminal Access
            </span>
          </div>
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
                href="/pos"
                className="mt-space-sm flex h-12 items-center gap-space-xs rounded-lg bg-gradient-to-r from-accent-purple-glow to-secondary px-space-lg font-bold text-bg-canvas"
              >
                <span className="material-symbols-outlined">point_of_sale</span>
                Continue to POS
              </Link>
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
                {Array.from({ length: 6 }).map((_, index) => (
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
                disabled={busy || pin.length < 3}
                className="mt-space-md flex h-12 w-full items-center justify-center gap-space-xs rounded-lg bg-gradient-to-r from-accent-purple-glow to-secondary font-headline-md text-body-base font-bold text-bg-canvas shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                <span className="material-symbols-outlined">lock_open</span>
                {busy ? 'Verifying…' : 'Enter Ops Grid'}
              </button>
              <button
                onClick={() => {
                  setPin('1111');
                  void submit('1111');
                }}
                className="mt-space-sm w-full text-center font-label-badge text-label-badge uppercase tracking-widest text-text-subtle hover:text-text-secondary"
              >
                Demo GM PIN: 1111
              </button>
            </>
          )}
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-container-low p-space-sm">
          <span className="font-label-eyebrow text-label-eyebrow uppercase text-text-tertiary">
            Roster PINs
          </span>
          <div className="mt-space-xs grid grid-cols-2 gap-1">
            {(staff.length
              ? staff.slice(0, 8)
              : [
                  { id: '1', name: 'Chef Marco Vance', roleLabel: 'GM', role: '' },
                  { id: '2', name: 'Zach Arroyo', roleLabel: 'Server', role: '' },
                  { id: '3', name: 'Maya Santos', roleLabel: 'Bartender', role: '' },
                  { id: '4', name: 'Priya Kapoor', roleLabel: 'Host', role: '' },
                ]
            ).map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-2 rounded bg-surface-container px-space-xs py-1">
                <span className="min-w-0 flex-1 truncate font-body-sm text-body-sm text-text-secondary">{member.name}</span>
                <span className="shrink-0 font-label-badge text-label-badge text-text-subtle">{member.roleLabel}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
