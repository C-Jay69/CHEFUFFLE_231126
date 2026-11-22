'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE, api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Health {
  status: string;
  db: string;
  uptimeSeconds: number;
  timestamp: string;
}

type SocketState = 'connecting' | 'online' | 'offline';

function printTestReceipt() {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Whiteout printer test</title>
    <style>
      @page { margin: 4mm; }
      body { width: 72mm; margin: 0 auto; font-family: "Courier New", monospace; font-size: 12px; color: #000; }
      h1 { font-size: 16px; text-align: center; letter-spacing: 2px; margin: 0 0 4px; }
      .meta { text-align: center; font-size: 10px; margin: 0 0 8px; }
      hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
      .big { font-size: 18px; text-align: center; font-weight: bold; }
    </style></head><body>
      <h1>WHITEOUT</h1>
      <div class="meta">Printer test</div>
      <hr/>
      <div class="big">RECEIPT PRINTER OK</div>
      <hr/>
      <div class="meta">${new Date().toLocaleString('en-US')}</div>
      <div class="meta">If you can read this, the tablet can print.</div>
    </body></html>`);
  doc.close();
  window.setTimeout(() => {
    win.focus();
    win.print();
    window.setTimeout(() => frame.remove(), 1500);
  }, 300);
}

export default function SetupPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [menuCount, setMenuCount] = useState<number | null>(null);
  const [socketState, setSocketState] = useState<SocketState>('connecting');
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const runChecks = useCallback(async () => {
    setRunning(true);
    setApiError(null);
    setLastRun(new Date());
    try {
      const result = await api.get<Health>('/health');
      setHealth(result);
    } catch (error) {
      setHealth(null);
      setApiError(
        error instanceof Error ? error.message : 'The API did not answer.',
      );
    }
    try {
      const menu = await api.get<{ items: unknown[] }>('/menu');
      setMenuCount(menu.items.length);
    } catch {
      setMenuCount(null);
    }
    setRunning(false);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    setMounted(true);
  }, []);

  useEffect(() => {
    void runChecks();
    const socket = getSocket();
    const online = () => setSocketState('online');
    const offline = () => setSocketState('offline');
    socket.on('connect', online);
    socket.on('disconnect', offline);
    socket.on('connect_error', offline);
    setSocketState(socket.connected ? 'online' : 'connecting');
    return () => {
      socket.off('connect', online);
      socket.off('disconnect', offline);
      socket.off('connect_error', offline);
    };
  }, [runChecks]);

  const warnings = useMemo(() => {
    const list: Array<{ tone: 'error' | 'warn'; text: string }> = [];
    if (!mounted) return list;
    const host = window.location.hostname;
    const localHost = host === 'localhost' || host === '127.0.0.1';
    if (!localHost && /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_BASE)) {
      list.push({
        tone: 'error',
        text: 'The API address points at localhost. On a tablet this means “this tablet”. Set PUBLIC_API_URL to “same-origin” (with the proxy) or to the server address, then restart the web app.',
      });
    }
    if (!localHost && window.location.protocol === 'http:') {
      list.push({
        tone: 'warn',
        text: 'This page is on plain HTTP. Everything works, but installing the PWA and offline use need HTTPS. Put the site behind Caddy or a TLS reverse proxy.',
      });
    }
    if (apiError) {
      list.push({
        tone: 'error',
        text: `The API did not answer at ${API_BASE}. Check the API is running, the port is open, and CORS_ORIGIN includes ${window.location.origin}.`,
      });
    }
    if (health && health.db !== 'ok') {
      list.push({
        tone: 'error',
        text: 'The API is up but the database is unreachable. Start Postgres and run pnpm db:push.',
      });
    }
    if (socketState === 'offline') {
      list.push({
        tone: 'warn',
        text: 'Realtime is offline. The app still reads and writes over REST, but tables and tickets will not update live. Check /socket.io reaches the API.',
      });
    }
    if (menuCount === 0) {
      list.push({
        tone: 'warn',
        text: 'The menu is empty. Seed the database or import a menu before service.',
      });
    }
    return list;
  }, [apiError, health, menuCount, socketState, mounted]);

  const pill = (label: string, ok: boolean, neutral = false) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-badge text-[10px] font-bold uppercase tracking-widest ${
        neutral
          ? 'bg-white/5 text-text-tertiary'
          : ok
            ? 'bg-emerald-400/10 text-emerald-300'
            : 'bg-rose-400/10 text-rose-300'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          neutral ? 'bg-text-tertiary' : ok ? 'bg-emerald-400' : 'bg-rose-400'
        }`}
      />
      {label}
    </span>
  );

  return (
    <div className="min-h-screen bg-[#060a13] px-4 py-10 text-text-primary sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Whiteout home">
              <img src="/whiteout-logo.png" alt="Whiteout" className="h-8 w-auto" />
            </Link>
            <div className="flex flex-col">
              <h1 className="font-headline-lg text-headline-lg font-bold">
                Setup &amp; diagnostics
              </h1>
              <span className="font-body-sm text-body-sm text-text-tertiary">
                Does this device reach the server, the database and realtime?
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runChecks()}
              disabled={running}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-white px-4 font-body-sm text-body-sm font-bold text-[#0c1322] disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              {running ? 'Checking…' : 'Run checks'}
            </button>
            <button
              type="button"
              onClick={printTestReceipt}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-white/15 px-4 font-body-sm text-body-sm font-bold text-text-primary hover:bg-white/5"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              Test receipt
            </button>
          </div>
        </header>

        {warnings.length > 0 && (
          <div className="flex flex-col gap-2">
            {warnings.map((warning) => (
              <div
                key={warning.text}
                className={`flex items-start gap-2 rounded-xl border px-4 py-3 ${
                  warning.tone === 'error'
                    ? 'border-rose-400/30 bg-rose-400/[0.07] text-rose-100'
                    : 'border-amber-300/30 bg-amber-300/[0.06] text-amber-100'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {warning.tone === 'error' ? 'error' : 'warning'}
                </span>
                <p className="font-body-sm text-body-sm leading-relaxed">{warning.text}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <span className="font-label-badge text-[10px] uppercase tracking-widest text-text-subtle">
              This page
            </span>
            <span className="break-all font-mono text-[13px] text-text-secondary">
              {origin ?? '—'}
            </span>
            <span className="font-body-sm text-[12px] text-text-tertiary">
              {origin ? new URL(origin).hostname : ''}
            </span>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <span className="font-label-badge text-[10px] uppercase tracking-widest text-text-subtle">
              API address
            </span>
            <span className="break-all font-mono text-[13px] text-text-secondary">{API_BASE}</span>
            <span className="font-body-sm text-[12px] text-text-tertiary">
              Set at runtime by <span className="font-mono">PUBLIC_API_URL</span>
            </span>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <span className="font-label-badge text-[10px] uppercase tracking-widest text-text-subtle">
                API
              </span>
              {pill(
                apiError ? 'Offline' : health ? 'Online' : 'Checking',
                Boolean(health) && !apiError,
                running,
              )}
            </div>
            {health ? (
              <span className="font-body-sm text-[13px] text-text-tertiary">
                Up {Math.floor(health.uptimeSeconds / 60)}m · {health.status}
              </span>
            ) : (
              <span className="font-body-sm text-[13px] text-text-tertiary">
                {apiError ?? 'No answer yet.'}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <span className="font-label-badge text-[10px] uppercase tracking-widest text-text-subtle">
                Database
              </span>
              {pill(
                health ? (health.db === 'ok' ? 'Connected' : 'Error') : 'Unknown',
                health?.db === 'ok',
                !health,
              )}
            </div>
            <span className="font-body-sm text-[13px] text-text-tertiary">
              {health ? `db: ${health.db}` : 'Waiting for the API.'}
            </span>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <span className="font-label-badge text-[10px] uppercase tracking-widest text-text-subtle">
                Realtime
              </span>
              {pill(
                socketState === 'online'
                  ? 'Connected'
                  : socketState === 'offline'
                    ? 'Offline'
                    : 'Connecting',
                socketState === 'online',
                socketState === 'connecting',
              )}
            </div>
            <span className="font-body-sm text-[13px] text-text-tertiary">
              Socket.io on {API_BASE}/socket.io
            </span>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <span className="font-label-badge text-[10px] uppercase tracking-widest text-text-subtle">
                Menu
              </span>
              {pill(
                menuCount === null ? 'Unknown' : menuCount > 0 ? 'Loaded' : 'Empty',
                Boolean(menuCount && menuCount > 0),
                menuCount === null,
              )}
            </div>
            <span className="font-body-sm text-[13px] text-text-tertiary">
              {menuCount === null ? 'No menu response.' : `${menuCount} items visible`}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <span className="font-body-sm text-[12px] text-text-tertiary">
            {lastRun ? `Last check ${lastRun.toLocaleTimeString('en-US')}` : 'Not run yet'}
          </span>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/login"
              className="flex h-10 items-center rounded-lg border border-white/15 px-4 font-body-sm text-body-sm font-bold text-text-primary hover:bg-white/5"
            >
              Sign in
            </Link>
            <Link
              href="/serve"
              className="flex h-10 items-center gap-1.5 rounded-lg bg-white px-4 font-body-sm text-body-sm font-bold text-[#0c1322] hover:bg-white/90"
            >
              Open the terminal
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>
        </div>

        <p className="font-body-sm text-[11px] leading-relaxed text-text-subtle">
          Printer test opens the browser print dialog — choose the receipt printer on this
          device. If realtime is offline but the API is online, check that the reverse proxy
          forwards <span className="font-mono">/socket.io</span> with WebSocket upgrades.
        </p>
      </div>
    </div>
  );
}
