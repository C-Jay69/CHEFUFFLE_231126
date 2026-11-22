'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Modal } from '@/components/ui';
import { api } from '@/lib/api';
import { money, timeLabel } from '@/lib/format';
import { showToast } from '@/lib/toast';
import type { DiningTable } from '@/lib/types';

type CloseAction = 'settle' | 'void' | 'clear';

const OPTION_BASE =
  'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors';

export default function CloseTableModal({
  table,
  open,
  onClose,
  onClosed,
}: {
  table: DiningTable | null;
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
}) {
  const [action, setAction] = useState<CloseAction>('clear');
  const [method, setMethod] = useState<'card' | 'cash'>('card');
  const [reason, setReason] = useState('Manager close-out');
  const [busy, setBusy] = useState(false);

  const hasCheck = Boolean(table?.activeOrder);

  useEffect(() => {
    if (!open) return;
    setAction(table?.activeOrder ? 'settle' : 'clear');
    setMethod('card');
    setReason('Manager close-out');
  }, [open, table]);

  const close = async () => {
    if (!table) return;
    setBusy(true);
    try {
      const result = await api.post<{ clearedChecks: number }>(
        `/tables/${table.id}/close`,
        {
          action,
          ...(action === 'settle' ? { method } : {}),
          ...(action === 'void' ? { reason, refund: true } : {}),
        },
      );
      const suffix =
        action === 'settle'
          ? ' — check settled'
          : action === 'void'
            ? ' — check voided'
            : '';
      showToast(
        `${table.tableNumber} closed${suffix}${
          result?.clearedChecks > 1 ? ` (${result.clearedChecks} checks)` : ''
        }.`,
        'success',
      );
      onClosed?.();
      onClose();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not close this table.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const primaryLabel =
    action === 'settle'
      ? 'Settle & close'
      : action === 'void'
        ? 'Void & close'
        : 'Clear table';

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={table ? `Close ${table.tableNumber}?` : 'Close table'}
      description="This frees the table and clears the party, covers and seated time."
      icon="table_restaurant"
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="ghost" size="md" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={action === 'void' ? 'danger' : 'primary'}
            size="md"
            icon={action === 'settle' ? 'payments' : action === 'void' ? 'block' : 'cleaning_services'}
            loading={busy}
            onClick={() => void close()}
          >
            {primaryLabel}
          </Button>
        </>
      }
    >
      {table && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-container-low px-3 py-2">
            <span className="font-body-base text-body-base font-bold text-text-primary">
              {table.currentPartyName ?? 'Open table'}
            </span>
            <Badge tone={table.status === 'dirty' ? 'neutral' : 'info'}>{table.stageLabel}</Badge>
            <span className="font-body-sm text-body-sm text-text-tertiary">
              {table.currentPartySize ?? 0} covers
              {table.seatedAt
                ? ` · seated ${timeLabel(table.seatedAt)} (${table.seatedMinutes ?? 0}m)`
                : ''}
            </span>
          </div>

          {hasCheck && table.activeOrder && (
            <div className="flex items-center justify-between rounded-xl border border-status-caution/30 bg-status-caution/10 px-3 py-2">
              <span className="font-body-sm text-body-sm text-text-secondary">
                Open check #{table.activeOrder.orderNumber} · {table.activeOrder.itemCount} items
              </span>
              <span className="font-mono-metric-md text-mono-metric-md font-bold text-text-primary">
                {money(table.activeOrder.total)}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {hasCheck && (
              <>
                <button
                  type="button"
                  onClick={() => setAction('settle')}
                  className={`${OPTION_BASE} ${
                    action === 'settle'
                      ? 'border-secondary bg-secondary/10'
                      : 'border-border-subtle bg-surface-container hover:bg-surface-container-high'
                  }`}
                >
                  <span className="material-symbols-outlined text-status-ready">payments</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-body-sm text-body-sm font-bold text-text-primary">
                      Settle check & close
                    </span>
                    <span className="font-body-sm text-body-sm text-text-tertiary">
                      Pay the open check, then free the table.
                    </span>
                  </span>
                </button>

                {action === 'settle' && (
                  <label className="ml-9 flex items-center gap-2">
                    <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
                      Method
                    </span>
                    <select
                      value={method}
                      onChange={(event) => setMethod(event.target.value as 'card' | 'cash')}
                      className="h-9 rounded-lg border border-border-subtle bg-surface-container-lowest px-2 font-body-sm text-body-sm text-text-primary outline-none [color-scheme:dark]"
                    >
                      <option value="card">Card</option>
                      <option value="cash">Cash</option>
                    </select>
                  </label>
                )}

                <button
                  type="button"
                  onClick={() => setAction('void')}
                  className={`${OPTION_BASE} ${
                    action === 'void'
                      ? 'border-status-urgent/60 bg-status-urgent/10'
                      : 'border-border-subtle bg-surface-container hover:bg-surface-container-high'
                  }`}
                >
                  <span className="material-symbols-outlined text-status-urgent">block</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-body-sm text-body-sm font-bold text-text-primary">
                      Void check & close
                    </span>
                    <span className="font-body-sm text-body-sm text-text-tertiary">
                      Manager void — the check leaves the book, the table frees up.
                    </span>
                  </span>
                </button>

                {action === 'void' && (
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Void reason"
                    className="ml-9 h-9 w-[calc(100%-2.25rem)] rounded-lg border border-border-subtle bg-surface-container-lowest px-2 font-body-sm text-body-sm text-text-primary outline-none focus:border-secondary"
                  />
                )}
              </>
            )}

            <button
              type="button"
              disabled={hasCheck}
              onClick={() => setAction('clear')}
              className={`${OPTION_BASE} ${
                action === 'clear'
                  ? 'border-secondary bg-secondary/10'
                  : 'border-border-subtle bg-surface-container hover:bg-surface-container-high'
              } ${hasCheck ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <span className="material-symbols-outlined text-secondary">cleaning_services</span>
              <span className="flex min-w-0 flex-col">
                <span className="font-body-sm text-body-sm font-bold text-text-primary">
                  Clear table only
                </span>
                <span className="font-body-sm text-body-sm text-text-tertiary">
                  {hasCheck
                    ? 'Settle or void the open check first.'
                    : 'No open check — reset the table for the next party.'}
                </span>
              </span>
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
