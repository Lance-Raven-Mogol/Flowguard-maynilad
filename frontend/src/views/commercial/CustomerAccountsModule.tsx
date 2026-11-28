/**
 * Customer Accounts — the Commercial Department gives each customer their CAN
 * (Customer Account Number). A customer with a CAN is a registered Maynilad
 * customer: they can be the Bill To of a complaint, and their account is not
 * deactivated by the 2-month registration window.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ResourceTable } from '../../models/types';
import { useToast } from '../../controllers/ToastContext';
import { api, ApiError } from '../../services/apiClient';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PanelHead } from '../components/panels';

interface CustomerAccount {
  id: string;
  fullName: string;
  email: string;
  barangay?: string;
  serialNumber?: string | null;
  accountNumber?: string | null;
  registrationDeadline?: string | null;
  createdAt: string;
}

const dateOf = (value?: string | null): string => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—';
};

/** Days left before an unregistered account is deactivated (negative = past). */
const daysLeft = (deadline?: string | null): number | null => {
  const t = deadline ? Date.parse(deadline) : NaN;
  return Number.isFinite(t) ? Math.ceil((t - Date.now()) / 86_400_000) : null;
};

export function CustomerAccountsModule({ filter = '' }: { filter?: string }) {
  const { notify } = useToast();
  const [customers, setCustomers] = useState<CustomerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<CustomerAccount | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: CustomerAccount[] }>('/users/customers');
      setCustomers(data);
      setError('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to load customer accounts.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    if (!confirming) return;
    setSaving(true);
    try {
      const { data } = await api.post<{ data: CustomerAccount }>(`/users/${confirming.id}/can`, {});
      notify(`CAN ${data.accountNumber ?? ''} generated for ${confirming.fullName}. They are now a registered customer.`);
      setConfirming(null);
      await load();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Could not generate the CAN.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Unregistered first (closest deadline first), then registered by name.
  const sorted = useMemo(() => [...customers].sort((a, b) => {
    if (Boolean(a.accountNumber) !== Boolean(b.accountNumber)) return a.accountNumber ? 1 : -1;
    if (!a.accountNumber) return (daysLeft(a.registrationDeadline) ?? 1e9) - (daysLeft(b.registrationDeadline) ?? 1e9);
    return a.fullName.localeCompare(b.fullName);
  }), [customers]);

  const table = useMemo<ResourceTable>(() => ({
    id: 'customer-accounts',
    columns: ['Customer', 'Email', 'Serial No.', 'Barangay', 'Signed Up', 'CAN', 'Status'],
    rows: sorted.map((c) => {
      const left = daysLeft(c.registrationDeadline);
      const status = c.accountNumber
        ? { text: 'Registered', status: 'paid' as const }
        : left === null
          ? { text: 'Not registered', status: 'pending' as const }
          : left > 0
            ? { text: `Not registered · ${left} day${left === 1 ? '' : 's'} left`, status: left <= 14 ? 'overdue' as const : 'pending' as const }
            : { text: 'Not registered · window ended', status: 'overdue' as const };
      return {
        id: c.id,
        cells: [
          { text: c.fullName, strong: true },
          { text: c.email },
          { text: c.serialNumber || '—' },
          { text: c.barangay || '—' },
          { text: dateOf(c.createdAt) },
          { text: c.accountNumber || '—', strong: Boolean(c.accountNumber) },
          status,
        ],
      };
    }),
  }), [sorted]);

  const registered = customers.filter((c) => c.accountNumber).length;

  if (loading) return <p style={{ color: 'var(--muted)', padding: '8px 2px' }}>Loading customer accounts…</p>;
  if (error) return <p style={{ color: '#e25577', padding: '8px 2px' }}>{error}</p>;
  return (
    <>
      <PanelHead title="Customer Accounts" />
      <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 13 }}>
        {registered} of {customers.length} active customer{customers.length === 1 ? '' : 's'} registered.
        Generate the CAN once the customer is a registered Maynilad customer. Without a CAN, an account is
        deactivated 2 months after sign-up and cannot be the Bill To of a complaint.
      </p>
      <DataTable
        table={table}
        filter={filter}
        className="customer-accounts-table"
        renderActions={(id) => {
          const customer = customers.find((c) => c.id === id);
          if (!customer || customer.accountNumber) return <span style={{ color: 'var(--muted)' }}>—</span>;
          return (
            <button className="btn-action" type="button" onClick={() => setConfirming(customer)}>
              Generate CAN
            </button>
          );
        }}
      />
      {confirming && (
        <Modal
          title="Generate CAN"
          open
          onClose={() => !saving && setConfirming(null)}
          onSubmit={() => void generate()}
          submitText="Generate CAN"
          submitting={saving}
        >
          <p style={{ marginTop: 0 }}>
            Give <strong>{confirming.fullName}</strong> ({confirming.email}) a Customer Account Number?
          </p>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            They become a registered Maynilad customer: they can be billed (Bill To) and their account is no
            longer deactivated after 2 months. The CAN cannot be changed afterwards.
          </p>
        </Modal>
      )}
    </>
  );
}
