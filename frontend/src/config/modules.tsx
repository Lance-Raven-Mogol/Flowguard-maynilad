/**
 * Operational module configurations — thin wrappers over <LiveModule> that map
 * each FlowGuard module from the paper (incidents, job orders, inventory,
 * material requests, assets + health scoring, advisories, users) to live data.
 */
import { useEffect, useMemo, useState } from 'react';
import type { BadgeTone, Metric, StatusTone, TableCell } from '../models/types';
import { useAuth } from '../controllers/AuthContext';
import { api } from '../services/apiClient';
import type { EntityRow } from '../services/resourceService';
import { LiveModule, StatusSelect, type ModuleColumn, type ModuleField, type RowActionCtx } from '../views/components/LiveModule';
import { DataTable } from '../views/components/DataTable';
import { PanelHead } from '../views/components/panels';

/* ------------------------------------------------------------------ helpers */
const GREEN = new Set(['resolved', 'completed', 'released', 'published', 'approved', 'in_stock', 'good']);
const RED = new Set(['rejected', 'cancelled', 'needs_replacement', 'dispose', 'defective', 'overdue', 'critical']);

function statusTone(v: unknown): StatusTone {
  const k = String(v ?? '').toLowerCase();
  if (GREEN.has(k)) return 'paid';
  if (RED.has(k)) return 'overdue';
  return 'pending';
}
const titleCase = (v: unknown): string =>
  String(v ?? '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const statusCell = (v: unknown): TableCell => ({ text: titleCase(v), status: statusTone(v) });
const badgeCell = (text: string, tone: BadgeTone): TableCell => ({ text, badge: tone });
const money = (v: unknown): string =>
  '₱ ' + Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateShort = (v: unknown): string => {
  if (!v) return '—';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-GB');
};
const count = (rows: EntityRow[], pred: (r: EntityRow) => boolean) => String(rows.filter(pred).length);

const metric = (id: string, label: string, value: string, icon: string, accent: Metric['accent']): Metric => ({
  id, label, value, icon, accent,
});

const WRITE: Record<string, string[]> = {
  incidents: ['customer', 'zone-specialist', 'technical-team', 'general-manager'],
  'job-orders': ['technical-team', 'general-manager'],
  materials: ['inventory-officer', 'general-manager'],
  'material-requests': ['technical-team', 'inventory-officer', 'general-manager'],
  assets: ['technical-team', 'zone-specialist', 'general-manager'],
  advisories: ['technical-team', 'general-manager'],
};

interface ModuleProps {
  filter?: string;
}

/* --------------------------------------------------------------- Incidents */
const INCIDENT_STATUS = [
  { value: 'under_verification', label: 'Under Verification' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'resolved', label: 'Resolved' },
];
const INCIDENT_TYPES = ['complaint', 'leak', 'new-connection', 'disconnection', 'other'];
const URGENCY = ['low', 'medium', 'high'];

export function IncidentsModule({ filter, mine = false, title }: ModuleProps & { mine?: boolean; title?: string }) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = WRITE.incidents.includes(role);
  const manage = !mine && role !== 'customer';

  const columns: ModuleColumn[] = [
    { header: 'Ref', cell: (r) => ({ text: String(r.ref_code), strong: true }) },
    { header: 'Type', cell: (r) => titleCase(r.type) },
    { header: 'Description', cell: (r) => String(r.description ?? '') },
    { header: 'Location', cell: (r) => String(r.location ?? '—') },
    { header: 'Urgency', cell: (r) => badgeCell(titleCase(r.urgency), String(r.urgency) as BadgeTone) },
    { header: 'Status', cell: (r) => statusCell(r.status) },
  ];

  const fields: ModuleField[] = [
    { name: 'type', label: 'Type', kind: 'select', options: INCIDENT_TYPES, default: 'complaint' },
    { name: 'description', label: 'Description', kind: 'textarea', placeholder: 'Describe the concern…' },
    { name: 'location', label: 'Location', placeholder: 'Brgy., Boac' },
    { name: 'urgency', label: 'Urgency', kind: 'select', options: URGENCY, default: 'medium' },
    { name: 'reported_by', label: 'Reported By', default: user!.fullName },
  ];

  const actions = manage
    ? (c: RowActionCtx) => (
        <>
          <StatusSelect value={String(c.row.status)} options={INCIDENT_STATUS} disabled={c.busy} onChange={(s) => c.update({ status: s })} />
          {role === 'general-manager' && (
            <button className="btn-action" onClick={c.remove} disabled={c.busy}>Delete</button>
          )}
        </>
      )
    : undefined;

  return (
    <LiveModule
      entity="incidents"
      title={title ?? (mine ? 'My Complaints & Inquiries' : 'Incident Management')}
      createLabel="File Complaint"
      columns={columns}
      fields={fields}
      canWrite={canWrite}
      filter={filter}
      mineField={mine ? 'reported_by' : undefined}
      mineValue={mine ? user!.fullName : undefined}
      actions={actions}
      metrics={
        manage
          ? (rows) => [
              metric('i1', 'Total Incidents', String(rows.length), 'message-square', 'customers'),
              metric('i2', 'Open', count(rows, (r) => r.status !== 'resolved'), 'clock', 'revenue'),
              metric('i3', 'High Urgency', count(rows, (r) => r.urgency === 'high'), 'alert-triangle', 'profit'),
              metric('i4', 'Resolved', count(rows, (r) => r.status === 'resolved'), 'check-circle', 'invoices'),
            ]
          : undefined
      }
    />
  );
}

/* -------------------------------------------------------------- Job Orders */
const JOB_STATUS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function JobOrdersModule({ filter }: ModuleProps) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = WRITE['job-orders'].includes(role);

  const columns: ModuleColumn[] = [
    { header: 'Ref', cell: (r) => ({ text: String(r.ref_code), strong: true }) },
    { header: 'Title', cell: (r) => String(r.title ?? '') },
    { header: 'Team', cell: (r) => titleCase(r.team) || '—' },
    { header: 'Assigned To', cell: (r) => String(r.assigned_to ?? '—') },
    { header: 'Est. Cost', cell: (r) => money(r.estimated_cost) },
    { header: 'Schedule', cell: (r) => dateShort(r.scheduled_date) },
    { header: 'Status', cell: (r) => statusCell(r.status) },
  ];

  const fields: ModuleField[] = [
    { name: 'title', label: 'Title', placeholder: 'e.g. Repair main line leak' },
    { name: 'incident_ref', label: 'Linked Incident Ref', placeholder: 'INC-XXXX (optional)' },
    { name: 'scope', label: 'Scope of Work', kind: 'textarea' },
    { name: 'team', label: 'Team', kind: 'select', optionList: [{ value: 'in-house', label: 'In-house Team' }, { value: 'contractor', label: 'Contractor' }] },
    { name: 'assigned_to', label: 'Assigned To', placeholder: 'Crew or contractor name' },
    { name: 'estimated_cost', label: 'Estimated Cost (₱)', kind: 'number' },
    { name: 'scheduled_date', label: 'Scheduled Date', kind: 'date' },
    { name: 'status', label: 'Status', kind: 'select', optionList: JOB_STATUS },
  ];

  return (
    <LiveModule
      entity="job-orders"
      title="Job Order Management"
      createLabel="Create Job Order"
      columns={columns}
      fields={fields}
      canWrite={canWrite}
      filter={filter}
      metrics={(rows) => [
        metric('j1', 'Total Job Orders', String(rows.length), 'clipboard-list', 'customers'),
        metric('j2', 'In Progress', count(rows, (r) => r.status === 'in_progress'), 'wrench', 'revenue'),
        metric('j3', 'Pending', count(rows, (r) => r.status === 'pending'), 'clock', 'profit'),
        metric('j4', 'Completed', count(rows, (r) => r.status === 'completed'), 'check-circle', 'invoices'),
      ]}
      actions={
        canWrite
          ? (c) => (
              <>
                <StatusSelect value={String(c.row.status)} options={JOB_STATUS} disabled={c.busy} onChange={(s) => c.update({ status: s })} />
                <button className="btn-action" onClick={c.edit} disabled={c.busy}>Edit</button>
                {role === 'general-manager' && <button className="btn-action" onClick={c.remove} disabled={c.busy}>Delete</button>}
              </>
            )
          : undefined
      }
    />
  );
}

/* --------------------------------------------------------------- Materials */
const MATERIAL_STATUS = [
  { value: 'in_stock', label: 'In Stock' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'defective', label: 'Defective' },
];

export function MaterialsModule({ filter, readOnly = false, title }: ModuleProps & { readOnly?: boolean; title?: string }) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = !readOnly && WRITE.materials.includes(role);

  const columns: ModuleColumn[] = [
    { header: 'SKU', cell: (r) => ({ text: String(r.sku), strong: true }) },
    { header: 'Material', cell: (r) => String(r.name ?? '') },
    { header: 'Category', cell: (r) => String(r.category ?? '—') },
    { header: 'Stock', cell: (r) => `${r.quantity ?? 0} ${r.unit ?? ''}`.trim() },
    { header: 'Unit Price', cell: (r) => money(r.unit_price) },
    { header: 'Supplier', cell: (r) => String(r.supplier ?? '—') },
    { header: 'Status', cell: (r) => statusCell(r.status) },
  ];

  const fields: ModuleField[] = [
    { name: 'name', label: 'Material Name', placeholder: 'e.g. PVC Pipe 50mm' },
    { name: 'category', label: 'Category', placeholder: 'Pipes / Valves / Meters…' },
    { name: 'description', label: 'Description', kind: 'textarea' },
    { name: 'quantity', label: 'Quantity', kind: 'number', default: '0' },
    { name: 'unit', label: 'Unit', default: 'units' },
    { name: 'unit_price', label: 'Unit Price (₱)', kind: 'number' },
    { name: 'supplier', label: 'Supplier', placeholder: 'Supplier name' },
    { name: 'source', label: 'Source', kind: 'select', optionList: [{ value: 'mother-company', label: 'Mother Company' }, { value: 'external', label: 'External Supplier' }] },
    { name: 'min_level', label: 'Minimum Level', kind: 'number', default: '10' },
    { name: 'status', label: 'Status', kind: 'select', optionList: MATERIAL_STATUS },
  ];

  return (
    <LiveModule
      entity="materials"
      title={title ?? 'Material List & Stock Levels'}
      createLabel="Add New Item"
      columns={columns}
      fields={fields}
      canWrite={canWrite}
      filter={filter}
      metrics={(rows) => [
        metric('m1', 'Total SKUs', String(rows.length), 'box', 'customers'),
        metric('m2', 'Low Stock', count(rows, (r) => r.status === 'low_stock'), 'alert-triangle', 'revenue'),
        metric('m3', 'Defective', count(rows, (r) => r.status === 'defective'), 'package-x', 'profit'),
        metric('m4', 'Inventory Value', money(rows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unit_price || 0), 0)), 'wallet', 'invoices'),
      ]}
      actions={
        canWrite
          ? (c) => (
              <>
                <button className="btn-action btn-blue" onClick={c.edit} disabled={c.busy}>Edit</button>
                <button className="btn-action" onClick={c.remove} disabled={c.busy}>Delete</button>
              </>
            )
          : undefined
      }
    />
  );
}

/* ------------------------------------------------------- Material Requests */
const MR_STATUS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'released', label: 'Released' },
  { value: 'rejected', label: 'Rejected' },
];

export function MaterialRequestsModule({ filter, title }: ModuleProps & { title?: string }) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = WRITE['material-requests'].includes(role);
  const canApprove = role === 'inventory-officer' || role === 'general-manager';

  const columns: ModuleColumn[] = [
    { header: 'Ref', cell: (r) => ({ text: String(r.ref_code), strong: true }) },
    { header: 'Material', cell: (r) => String(r.material_name ?? r.material_sku ?? '') },
    { header: 'Qty', cell: (r) => String(r.quantity ?? 0) },
    { header: 'Job Order', cell: (r) => String(r.job_order_ref ?? '—') },
    { header: 'Requested By', cell: (r) => String(r.requested_by ?? '—') },
    { header: 'Status', cell: (r) => statusCell(r.status) },
  ];

  const fields: ModuleField[] = [
    { name: 'material_name', label: 'Material', placeholder: 'Material name' },
    { name: 'material_sku', label: 'SKU', placeholder: 'SKU-XXXX (optional)' },
    { name: 'quantity', label: 'Quantity', kind: 'number', default: '1' },
    { name: 'job_order_ref', label: 'Job Order Ref', placeholder: 'JO-XXXX (optional)' },
    { name: 'requested_by', label: 'Requested By', default: user!.fullName },
  ];

  return (
    <LiveModule
      entity="material-requests"
      title={title ?? 'Material Request Forms (MRF)'}
      createLabel="New Request"
      columns={columns}
      fields={fields}
      canWrite={canWrite}
      filter={filter}
      metrics={(rows) => [
        metric('r1', 'Total Requests', String(rows.length), 'file-input', 'customers'),
        metric('r2', 'Pending', count(rows, (r) => r.status === 'pending'), 'clock', 'revenue'),
        metric('r3', 'Approved', count(rows, (r) => r.status === 'approved'), 'check-circle', 'profit'),
        metric('r4', 'Released', count(rows, (r) => r.status === 'released'), 'package-check', 'invoices'),
      ]}
      actions={
        canApprove
          ? (c) => (
              <StatusSelect value={String(c.row.status)} options={MR_STATUS} disabled={c.busy} onChange={(s) => c.update({ status: s })} />
            )
          : undefined
      }
    />
  );
}

/* ------------------------------------------------------- Assets + Health */
const CONDITION = [
  { value: 'good', label: 'Good' },
  { value: 'needs_maintenance', label: 'Needs Maintenance' },
  { value: 'needs_replacement', label: 'Needs Replacement' },
  { value: 'dispose', label: 'Dispose' },
];

export function AssetsModule({ filter, title }: ModuleProps & { title?: string }) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = WRITE.assets.includes(role);

  const columns: ModuleColumn[] = [
    { header: 'Tag', cell: (r) => ({ text: String(r.asset_tag), strong: true }) },
    { header: 'Asset', cell: (r) => String(r.name ?? '') },
    { header: 'Type', cell: (r) => String(r.type ?? '—') },
    { header: 'Location', cell: (r) => String(r.location ?? '—') },
    { header: 'Installed', cell: (r) => dateShort(r.install_date) },
    { header: 'Health', cell: (r) => ({ text: `${r.health_score ?? '—'} · ${r.health_label ?? ''}`.trim(), status: statusTone(r.health_label) }) },
    { header: 'Remaining', cell: (r) => `${r.remaining_years ?? 0} yrs` },
    { header: 'Action Needed', cell: (r) => String(r.recommendation ?? '—') },
  ];

  const fields: ModuleField[] = [
    { name: 'name', label: 'Asset Name', placeholder: 'e.g. Distribution Main A' },
    { name: 'type', label: 'Type', placeholder: 'Pipe / Pump / Meter / Valve' },
    { name: 'location', label: 'Location', placeholder: 'Brgy., Boac' },
    { name: 'install_date', label: 'Installation Date', kind: 'date' },
    { name: 'expected_lifespan_years', label: 'Expected Lifespan (years)', kind: 'number', default: '10' },
    { name: 'last_maintenance', label: 'Last Maintenance', kind: 'date' },
    { name: 'condition', label: 'Condition', kind: 'select', optionList: CONDITION },
  ];

  return (
    <LiveModule
      entity="assets"
      title={title ?? 'Asset Lifecycle Monitoring'}
      createLabel="Register Asset"
      columns={columns}
      fields={fields}
      canWrite={canWrite}
      filter={filter}
      metrics={(rows) => [
        metric('a1', 'Total Assets', String(rows.length), 'box', 'customers'),
        metric('a2', 'Needs Attention', count(rows, (r) => r.condition === 'needs_maintenance' || r.condition === 'needs_replacement'), 'wrench', 'revenue'),
        metric('a3', 'Critical', count(rows, (r) => Number(r.health_score) < 15 || r.condition === 'dispose'), 'alert-triangle', 'profit'),
        metric('a4', 'Healthy', count(rows, (r) => Number(r.health_score) >= 70), 'shield-check', 'invoices'),
      ]}
      actions={
        canWrite
          ? (c) => (
              <>
                <StatusSelect value={String(c.row.condition)} options={CONDITION} disabled={c.busy} onChange={(s) => c.update({ condition: s })} />
                <button className="btn-action" onClick={c.edit} disabled={c.busy}>Edit</button>
                {role === 'general-manager' && <button className="btn-action" onClick={c.remove} disabled={c.busy}>Delete</button>}
              </>
            )
          : undefined
      }
    />
  );
}

/* -------------------------------------------------------------- Advisories */
const ADVISORY_STATUS = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'published', label: 'Published' },
];
const ADVISORY_TYPE_BADGE: Record<string, BadgeTone> = { emergency: 'high', interruption: 'medium', maintenance: 'low' };

export function AdvisoriesModule({ filter, readOnly = false, title }: ModuleProps & { readOnly?: boolean; title?: string }) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = !readOnly && WRITE.advisories.includes(role);
  const canApprove = role === 'general-manager';

  const columns: ModuleColumn[] = [
    { header: 'Title', cell: (r) => ({ text: String(r.title), strong: true }) },
    { header: 'Area', cell: (r) => String(r.area ?? '—') },
    { header: 'Type', cell: (r) => badgeCell(titleCase(r.type), ADVISORY_TYPE_BADGE[String(r.type)] ?? 'low') },
    { header: 'Status', cell: (r) => statusCell(r.status) },
    { header: 'Created', cell: (r) => dateShort(r.created_at) },
  ];

  const fields: ModuleField[] = [
    { name: 'title', label: 'Title', placeholder: 'Advisory headline' },
    { name: 'body', label: 'Details', kind: 'textarea', placeholder: 'Advisory details…' },
    { name: 'area', label: 'Affected Area', placeholder: 'Brgy. / Poblacion' },
    { name: 'type', label: 'Type', kind: 'select', optionList: [{ value: 'maintenance', label: 'Scheduled Maintenance' }, { value: 'interruption', label: 'Service Interruption' }, { value: 'emergency', label: 'Emergency' }] },
    { name: 'status', label: 'Status', kind: 'select', optionList: ADVISORY_STATUS },
  ];

  return (
    <LiveModule
      entity="advisories"
      title={title ?? 'Service Advisory Management'}
      createLabel="Create Advisory"
      columns={columns}
      fields={fields}
      canWrite={canWrite}
      filter={filter}
      mineField={readOnly ? 'status' : undefined}
      mineValue={readOnly ? 'published' : undefined}
      actions={
        canApprove
          ? (c) => (
              <StatusSelect value={String(c.row.status)} options={ADVISORY_STATUS} disabled={c.busy} onChange={(s) => c.update({ status: s })} />
            )
          : undefined
      }
    />
  );
}

/* ----------------------------------------------------- Users (admin only) */
export function UsersPanel({ filter }: ModuleProps) {
  const [rows, setRows] = useState<{ id: string; fullName: string; email: string; role: string; createdAt: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: typeof rows }>('/users')
      .then((r) => setRows(r.data))
      .catch((e) => setError(e?.message ?? 'Failed to load users.'));
  }, []);

  const table = useMemo(
    () => ({
      id: 'users',
      columns: ['Name', 'Email', 'Role', 'Joined'],
      rows: rows.map((u) => ({
        id: u.id,
        cells: [
          { text: u.fullName, strong: true } as TableCell,
          { text: u.email },
          badgeCell(titleCase(u.role), 'low'),
          { text: dateShort(u.createdAt) },
        ],
      })),
    }),
    [rows],
  );

  return (
    <>
      <PanelHead title="User Management" />
      {error ? <p style={{ color: '#e25577' }}>{error}</p> : <DataTable table={table} filter={filter} />}
    </>
  );
}
