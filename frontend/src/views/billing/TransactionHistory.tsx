/**
 * Transaction History — every billing event in one ledger for the Commercial
 * Department and General Manager: bills issued, payments submitted, verified,
 * rejected, walk-in cash recorded, and complaints waived as no charge.
 * Built from the audit log, so it covers everything that ever happened even if
 * a bill was later edited or archived.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import type { BadgeTone, Metric, ResourceTable } from '../../models/types';
import { useAuth } from '../../controllers/AuthContext';
import { ApiError } from '../../services/apiClient';
import { resourceService, type EntityRow } from '../../services/resourceService';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { BillingDetails } from '../../config/modules';
import { MetricsGrid } from '../components/MetricsGrid';
import { ActionButton, PanelHead } from '../components/panels';
import { printTable } from '../components/print';

type TxType = 'issued' | 'submitted' | 'verified' | 'cash' | 'rejected' | 'no_charge' | 'overdue' | 'archived' | 'updated';

const TX_LABEL: Record<TxType, string> = {
  issued: 'Bill Issued',
  submitted: 'Payment Submitted',
  verified: 'Payment Verified',
  cash: 'Cash Payment',
  rejected: 'Payment Rejected',
  no_charge: 'No Charge',
  overdue: 'Marked Overdue',
  archived: 'Archived / Restored',
  updated: 'Bill Updated',
};
const TX_TONE: Record<TxType, BadgeTone> = {
  issued: 'medium',
  submitted: 'medium',
  verified: 'low',
  cash: 'low',
  rejected: 'high',
  no_charge: 'low',
  overdue: 'high',
  archived: 'medium',
  updated: 'medium',
};
/** Money actually received. */
const COLLECTED: TxType[] = ['verified', 'cash'];
const CASH_WALK_IN = 'Cash (Walk-in)';

interface Tx {
  id: string;
  /** The bill behind this transaction, if any — opened with View. */
  billId: string;
  at: Date;
  type: TxType;
  ref: string;
  serviceRef: string;
  customer: string;
  amount: number | null;
  method: string;
  reference: string;
  by: string;
}

const peso = (n: number | null): string =>
  n === null ? '—' : `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Turn one audit-log row into a ledger entry (or null if it isn't a billing event). */
function toTx(log: EntityRow, bills: Map<string, EntityRow>, incidents: Map<string, EntityRow>): Tx | null {
  const details = (log.details ?? {}) as Record<string, unknown>;
  const at = new Date(text(log.created_at));
  const by = text(log.actor) || 'System';
  const base = { id: String(log.id), billId: '', at, by };

  if (log.entity === 'incidents') {
    if (details.billable !== false) return null;
    const incident = incidents.get(text(log.entity_id));
    return {
      ...base,
      type: 'no_charge',
      ref: '—',
      serviceRef: text(incident?.ref_code) || '—',
      customer: text(incident?.bill_to_customer_name ?? incident?.reported_by) || '—',
      amount: num(incident?.estimated_cost),
      method: 'Covered by Maynilad',
      reference: '',
      by,
    };
  }
  if (log.entity !== 'payments') return null;

  const bill: Record<string, unknown> = bills.get(text(log.entity_id)) ?? {};
  const pick = (key: string) => details[key] ?? bill[key];
  const common = {
    ...base,
    billId: bill.id ? String(bill.id) : '',
    ref: text(bill.ref_code ?? details.ref_code) || '—',
    serviceRef: text(pick('incident_ref') || pick('job_order_ref')) || '—',
    customer: text(pick('customer_name')) || '—',
  };

  if (log.action === 'create') {
    return { ...common, type: 'issued', amount: num(details.amount ?? bill.amount), method: text(details.payment_method), reference: '' };
  }
  if (log.action === 'delete') {
    return { ...common, type: 'updated', amount: null, method: '', reference: 'Deleted' };
  }
  const status = text(details.status);
  const paidAmount = num(details.amount_paid ?? bill.amount_paid ?? bill.amount);
  if (details.payment_method === CASH_WALK_IN) {
    return { ...common, type: 'cash', amount: paidAmount, method: CASH_WALK_IN, reference: text(pick('payment_reference')) };
  }
  if (status === 'for_verification') {
    return { ...common, type: 'submitted', amount: paidAmount, method: text(pick('payment_method')), reference: text(pick('payment_reference')) };
  }
  if (status === 'paid') {
    return { ...common, type: 'verified', amount: paidAmount, method: text(bill.payment_method), reference: text(bill.payment_reference) };
  }
  if (status === 'rejected') {
    return { ...common, type: 'rejected', amount: paidAmount, method: text(bill.payment_method), reference: text(details.verification_notes) };
  }
  if (status === 'overdue' || status === 'late') {
    return { ...common, type: 'overdue', amount: num(bill.amount), method: '', reference: '' };
  }
  if ('archived' in details) {
    return { ...common, type: 'archived', amount: null, method: '', reference: details.archived ? 'Archived' : 'Restored' };
  }
  return { ...common, type: 'updated', amount: num(details.amount), method: '', reference: '' };
}

const toCsv = (rows: string[][]): string =>
  rows.map((r) => r.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')).join('\r\n');

export function TransactionHistory({ filter = '', onBack }: { filter?: string; onBack?: () => void }) {
  const { user } = useAuth();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState<'all' | TxType>('all');
  const [bills, setBills] = useState<Map<string, EntityRow>>(new Map());
  const [viewing, setViewing] = useState<EntityRow | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      resourceService.list('audit-logs'),
      resourceService.list('payments', 'all'),
      resourceService.list('incidents', 'all'),
    ])
      .then(([logs, bills, incidents]) => {
        if (!active) return;
        const billMap = new Map(bills.map((b) => [String(b.id), b]));
        setBills(billMap);
        const incidentMap = new Map(incidents.map((i) => [String(i.id), i]));
        const list = logs
          .map((log) => toTx(log, billMap, incidentMap))
          .filter((tx): tx is Tx => tx !== null && !Number.isNaN(tx.at.getTime()))
          .sort((a, b) => b.at.getTime() - a.at.getTime());
        setTxs(list);
      })
      .catch((cause) => { if (active) setError(cause instanceof ApiError ? cause.message : 'Unable to load transactions.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Date range first, so the type pills can show counts for the chosen period.
  const inRange = useMemo(() => {
    const start = from ? new Date(`${from}T00:00:00`) : null;
    const end = to ? new Date(`${to}T23:59:59.999`) : null;
    return txs.filter((tx) => (!start || tx.at >= start) && (!end || tx.at <= end));
  }, [txs, from, to]);
  const visible = useMemo(() => (type === 'all' ? inRange : inRange.filter((tx) => tx.type === type)), [inRange, type]);
  const typeCounts = useMemo(() => {
    const counts = new Map<TxType, number>();
    inRange.forEach((tx) => counts.set(tx.type, (counts.get(tx.type) ?? 0) + 1));
    return counts;
  }, [inRange]);

  const sum = (types: TxType[]) => visible.filter((tx) => types.includes(tx.type)).reduce((s, tx) => s + (tx.amount ?? 0), 0);
  const metrics: Metric[] = [
    { id: 'tx1', label: 'Transactions', value: String(visible.length), icon: 'receipt', accent: 'customers' },
    { id: 'tx2', label: 'Total Billed', value: peso(sum(['issued'])), icon: 'file-text', accent: 'revenue' },
    { id: 'tx3', label: 'Total Collected', value: peso(sum(COLLECTED)), icon: 'wallet', accent: 'profit' },
    { id: 'tx4', label: 'Waived (No Charge)', value: peso(sum(['no_charge'])), icon: 'hand-heart', accent: 'invoices' },
  ];

  const columns = ['Date & Time', 'Transaction', 'Bill Ref', 'Service Ref', 'Customer', 'Amount', 'Method', 'Reference / OR', 'By'];
  const cellsOf = (tx: Tx) => [
    tx.at.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
    TX_LABEL[tx.type],
    tx.ref,
    tx.serviceRef,
    tx.customer,
    peso(tx.amount),
    tx.method || '—',
    tx.reference || '—',
    tx.by,
  ];
  const table: ResourceTable = {
    id: 'transactions',
    columns,
    rows: visible.map((tx) => {
      const cells = cellsOf(tx);
      return {
        id: tx.id,
        cells: cells.map((t, i) =>
          i === 1 ? { text: t, badge: TX_TONE[tx.type] } : i === 2 ? { text: t, strong: true } : { text: t }),
      };
    }),
  };

  // Export / print what is on screen, including the top-bar search.
  const shownRows = () => {
    const q = filter.trim().toLowerCase();
    return q ? table.rows.filter((r) => r.cells.some((c) => c.text.toLowerCase().includes(q))) : table.rows;
  };
  const rangeLabel = from || to ? ` (${from || '…'} to ${to || '…'})` : '';
  const exportCsv = () => {
    const csv = toCsv([columns, ...shownRows().map((r) => r.cells.map((c) => c.text.replace(/^₱\s/, '')))]);
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions${from ? `-${from}` : ''}${to ? `-to-${to}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const txById = new Map(visible.map((tx) => [tx.id, tx]));
  const renderView = (rowId: string) => {
    const bill = bills.get(txById.get(rowId)?.billId ?? '');
    return bill
      ? <button type="button" className="btn-action" onClick={() => setViewing(bill)}>View</button>
      : null;
  };

  return (
    <>
      <MetricsGrid metrics={metrics} />
      <div className="quick-filter-bar" aria-label="Transaction type">
        <button type="button" className={type === 'all' ? 'active' : ''} onClick={() => setType('all')}>
          <span>All Transactions</span><strong>{inRange.length}</strong>
        </button>
        {(Object.keys(TX_LABEL) as TxType[])
          .filter((key) => typeCounts.has(key) || key === type)
          .map((key) => (
            <button key={key} type="button" className={type === key ? 'active' : ''} onClick={() => setType(key)}>
              <span>{TX_LABEL[key]}</span><strong>{typeCounts.get(key) ?? 0}</strong>
            </button>
          ))}
      </div>
      <PanelHead
        title="Transaction History"
        action={
          <div className="panel-head-actions">
            <div className={`date-range${from || to ? ' is-set' : ''}`} role="group" aria-label="Date range">
              <CalendarDays aria-hidden="true" />
              <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              <span className="date-range-sep">to</span>
              <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              {(from || to) && (
                <button type="button" className="date-range-clear" aria-label="Clear dates" onClick={() => { setFrom(''); setTo(''); }}>
                  <X />
                </button>
              )}
            </div>
            <ActionButton label="Export CSV" icon="download" variant="secondary" onClick={exportCsv} />
            <ActionButton
              label="Print"
              icon="printer"
              variant="secondary"
              onClick={() => printTable(`Transaction History${rangeLabel}`, { ...table, rows: shownRows() }, user?.fullName)}
            />
            {onBack && <ActionButton label="Back to Billing" icon="arrow-left" onClick={onBack} />}
          </div>
        }
      />
      {loading ? (
        <p style={{ color: 'var(--muted)', padding: '8px 2px' }}>Loading transactions…</p>
      ) : error ? (
        <p style={{ color: '#e25577', padding: '8px 2px' }}>{error}</p>
      ) : (
        <DataTable table={table} filter={filter} className="transactions-table" renderActions={renderView} actionLabel="Bill" />
      )}
      {viewing && (
        <Modal
          title={`Bill ${String(viewing.ref_code ?? '')}`}
          open
          wide
          onClose={() => setViewing(null)}
          closeText="Close"
          printable
          printedBy={user?.fullName}
        >
          <BillingDetails row={viewing} />
        </Modal>
      )}
    </>
  );
}
