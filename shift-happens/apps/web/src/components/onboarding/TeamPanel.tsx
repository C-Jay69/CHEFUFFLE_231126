'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type Permission,
} from '@shift-happens/shared/permissions';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  SearchInput,
  Stat,
} from '@/components/ui';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { showToast } from '@/lib/toast';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  permissions: Permission[];
  hourlyRate: number;
  phone: string | null;
  email: string | null;
  address: string | null;
  sinMasked: string | null;
  startDate: string | null;
  isActive: boolean;
  createdAt: string;
}

const ROLE_OPTIONS = [
  'server',
  'bartender',
  'host',
  'line_cook',
  'chef_expo',
  'floor_manager',
  'general_manager',
  'owner',
] as const;

const PERMISSION_LABELS: Record<Permission, string> = {
  'serve.order': 'Take orders',
  'serve.pay': 'Take payment',
  'orders.void': 'Void checks',
  'floor.seat': 'Seat tables',
  'floor.manage': 'Edit floor plan',
  'floor.close': 'Close tables',
  'reservations.manage': 'Reservations',
  'kds.operate': 'Kitchen display',
  'inventory.manage': 'Inventory',
  'menu.manage': 'Menu & 86s',
  'scheduling.manage': 'Scheduling',
  'briefing.manage': 'Briefing',
  'training.manage': 'Training',
  'staff.manage': 'Employee records',
  'voice.manage': 'Voice AI',
  'reports.view': 'Reports',
};

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];

interface MemberForm {
  name: string;
  role: string;
  hourlyRate: string;
  phone: string;
  email: string;
  address: string;
  sin: string;
  startDate: string;
  pin: string;
}

const emptyForm = (): MemberForm => ({
  name: '',
  role: 'server',
  hourlyRate: '18',
  phone: '',
  email: '',
  address: '',
  sin: '',
  startDate: '',
  pin: '',
});

const INPUT =
  'h-11 w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 font-body-sm text-body-sm text-text-primary outline-none transition-colors focus:border-secondary';

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="font-label-badge text-label-badge uppercase text-text-tertiary">
        {label}
      </span>
      {children}
      {hint && <span className="font-body-sm text-body-sm text-text-subtle">{hint}</span>}
    </label>
  );
}

export default function TeamPanel() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true);
    try {
      const response = await api.get<{ staff: TeamMember[] }>('/staff');
      setMembers(response.staff);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not load the team.',
        'error',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) =>
      [member.name, member.roleLabel, member.email ?? '', member.phone ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [members, query]);

  const payroll = members.reduce((sum, member) => sum + member.hourlyRate, 0);
  const managers = members.filter((member) =>
    ['owner', 'general_manager', 'floor_manager'].includes(member.role),
  ).length;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setEditorOpen(true);
  };

  const openEdit = (member: TeamMember) => {
    setEditing(member);
    setForm({
      name: member.name,
      role: member.role,
      hourlyRate: String(member.hourlyRate),
      phone: member.phone ?? '',
      email: member.email ?? '',
      address: member.address ?? '',
      sin: '',
      startDate: member.startDate ? member.startDate.slice(0, 10) : '',
      pin: '',
    });
    setEditorOpen(true);
  };

  const update = <K extends keyof MemberForm>(key: K, value: MemberForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      showToast('Enter the employee’s full name.', 'warn');
      return;
    }
    const rate = Number(form.hourlyRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 500) {
      showToast('Pay rate must be between 0 and 500 per hour.', 'warn');
      return;
    }
    if (form.pin && !/^\d{3,6}$/.test(form.pin)) {
      showToast('PIN must be 3-6 digits.', 'warn');
      return;
    }

    const payload: Record<string, unknown> = {
      name,
      role: form.role,
      hourlyRate: rate,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      startDate: form.startDate || null,
    };
    if (form.sin.trim()) payload.sin = form.sin.trim();
    if (form.pin) payload.pin = form.pin;

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/staff/${editing.id}`, payload);
        showToast(`${name} updated.`, 'success');
      } else {
        await api.post('/staff', payload);
        showToast(`${name} added to the team.`, 'success');
      }
      setEditorOpen(false);
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not save this employee.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await api.del(`/staff/${removing.id}`);
      showToast(`${removing.name} removed from the active team.`, 'success');
      setRemoving(null);
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not remove this employee.',
        'error',
      );
    } finally {
      setDeleting(false);
    }
  };

  const rolePermissions = ROLE_PERMISSIONS[form.role as keyof typeof ROLE_PERMISSIONS] ?? [];
  const blocked = ALL_PERMISSIONS.filter((permission) => !rolePermissions.includes(permission));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Team" value={members.length} icon="groups" tone="secondary" hint="Active employees" />
        <Stat label="Managers" value={managers} icon="supervisor_account" tone="violet" hint="Owner, GM, floor manager" />
        <Stat label="Payroll / hr" value={money(payroll)} icon="payments" tone="ready" hint="At current rates" />
        <Stat
          label="Average rate"
          value={money(members.length ? payroll / members.length : 0)}
          icon="trending_up"
          tone="caution"
          hint="Per hour"
        />
      </div>

      <Card
        title="Team"
        icon="badge"
        subtitle="New hires, positions, pay rates and contact details"
        actions={
          <>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search name or role…"
              className="min-w-[180px]"
            />
            <Button
              variant="ghost"
              icon="refresh"
              loading={refreshing}
              onClick={() => void load(true)}
            >
              Refresh
            </Button>
            <Button variant="primary" icon="person_add" onClick={openCreate}>
              Add employee
            </Button>
          </>
        }
      >
        {loading && members.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-headline-lg text-secondary">
              progress_activity
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="person_search"
            title={query ? 'No matching employees' : 'No employees yet'}
            description={
              query
                ? 'Try a different name or position.'
                : 'Add your first hire to capture their details, rate and access level.'
            }
            action={
              !query ? (
                <Button variant="primary" icon="person_add" onClick={openCreate}>
                  Add employee
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((member) => (
              <article
                key={member.id}
                className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-container p-3 lg:flex-row lg:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Avatar name={member.name} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-body-base text-body-base font-bold text-text-primary">
                        {member.name}
                      </span>
                      <Badge tone={member.permissions.includes('orders.void') ? 'violet' : 'neutral'}>
                        {member.roleLabel}
                      </Badge>
                      <span className="font-mono-metric-sm text-mono-metric-sm font-bold text-accent-lime">
                        {money(member.hourlyRate)}/hr
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body-sm text-body-sm text-text-tertiary">
                      {member.phone && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">call</span>
                          {member.phone}
                        </span>
                      )}
                      {member.email && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">mail</span>
                          {member.email}
                        </span>
                      )}
                      {member.startDate && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">event</span>
                          Started {new Date(member.startDate).toLocaleDateString('en-US')}
                        </span>
                      )}
                      {member.sinMasked && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">badge</span>
                          SIN {member.sinMasked}
                        </span>
                      )}
                    </div>
                    {member.address && (
                      <p className="truncate font-body-sm text-body-sm text-text-subtle">{member.address}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 lg:shrink-0">
                  <Button variant="ghost" size="md" icon="edit" className="flex-1 lg:flex-none" onClick={() => openEdit(member)}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="md"
                    icon="person_remove"
                    className="flex-1 lg:flex-none"
                    onClick={() => setRemoving(member)}
                  >
                    Remove
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add employee'}
        description="Capture the hire’s details and choose the position that sets their access."
        icon="person_add"
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" icon="check" loading={saving} onClick={() => void save()}>
              {editing ? 'Save changes' : 'Add employee'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <input
                autoFocus
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="e.g. Jordan Ellis"
                className={INPUT}
              />
            </Field>
            <Field label="Position">
              <select
                value={form.role}
                onChange={(event) => update('role', event.target.value)}
                className={`${INPUT} [color-scheme:dark]`}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pay rate (per hour)">
              <input
                type="number"
                min={0}
                step="0.25"
                value={form.hourlyRate}
                onChange={(event) => update('hourlyRate', event.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Start date">
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => update('startDate', event.target.value)}
                className={`${INPUT} [color-scheme:dark]`}
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                placeholder="(555) 010-2233"
                className={INPUT}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
                placeholder="name@restaurant.com"
                className={INPUT}
              />
            </Field>
            <Field label="S.I.N." hint={editing ? 'Leave blank to keep the current number' : 'Stored masked, last three digits shown'}>
              <input
                value={form.sin}
                onChange={(event) => update('sin', event.target.value)}
                placeholder={editing ? '••• ••• 123' : '000 000 000'}
                className={INPUT}
              />
            </Field>
            <Field label="Terminal PIN" hint="3-6 digits used at the login screen">
              <input
                inputMode="numeric"
                value={form.pin}
                onChange={(event) => update('pin', event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={editing ? 'Leave blank to keep current' : 'e.g. 4821'}
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Home address">
            <textarea
              value={form.address}
              onChange={(event) => update('address', event.target.value)}
              placeholder="Street, city, postal code"
              className="min-h-[72px] w-full rounded-lg border border-border-subtle bg-surface-container-lowest p-3 font-body-sm text-body-sm text-text-primary outline-none placeholder:text-text-subtle focus:border-secondary"
            />
          </Field>

          <div className="rounded-xl border border-border-subtle bg-surface-container-low p-3">
            <p className="font-label-badge text-label-badge uppercase text-text-tertiary">
              Access for {ROLE_LABELS[form.role] ?? form.role}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {rolePermissions.map((permission) => (
                <span
                  key={permission}
                  className="rounded-full bg-accent-cyan-bright/15 px-2 py-1 font-body-sm text-[11px] font-bold text-accent-cyan-bright"
                >
                  {PERMISSION_LABELS[permission]}
                </span>
              ))}
              {rolePermissions.length === 0 && (
                <span className="font-body-sm text-body-sm text-text-subtle">No screens</span>
              )}
            </div>
            {blocked.length > 0 && (
              <p className="mt-2 font-body-sm text-body-sm text-text-subtle">
                <span className="font-bold text-text-tertiary">No access: </span>
                {blocked.slice(0, 6).map((permission) => PERMISSION_LABELS[permission]).join(' · ')}
                {blocked.length > 6 ? ` · +${blocked.length - 6} more` : ''}
              </p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? 'employee'}?`}
        description="They are deactivated, not deleted — their shifts and orders stay on record."
        icon="person_remove"
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="md" icon="person_remove" loading={deleting} onClick={() => void deactivate()}>
              Remove from team
            </Button>
          </>
        }
      >
        <p className="font-body-sm text-body-sm text-text-secondary">
          {removing?.name} will no longer be able to sign in at the terminal or appear in the team list.
        </p>
      </Modal>
    </>
  );
}
