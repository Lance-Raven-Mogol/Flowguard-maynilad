/**
 * Operational module configurations — thin wrappers over <LiveModule> that map
 * each FlowGuard module from the paper (incidents, job orders, inventory,
 * material requests, assets + health scoring, advisories, users) to live data.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { BadgeTone, Metric, ResourceTable, StatusTone, TableCell } from '../models/types';
import { ROLES } from '../models/types';
import { useAuth } from '../controllers/AuthContext';
import { useToast } from '../controllers/ToastContext';
import { useStats } from '../controllers/StatsContext';
import { api, ApiError } from '../services/apiClient';
import { resourceService, type EntityRow } from '../services/resourceService';
import { ImageUpload, LiveModule, StatusSelect, type ModuleColumn, type ModuleField, type RowActionCtx } from '../views/components/LiveModule';
import { DataTable } from '../views/components/DataTable';
import { Modal } from '../views/components/Modal';
import { ActionButton, PanelHead } from '../views/components/panels';

const roleLabel = (role: unknown): string => ROLES.find((r) => r.value === role)?.label ?? String(role ?? '');

/* ------------------------------------------------------------------ helpers */
const GREEN = new Set(['active', 'resolved', 'completed', 'released', 'published', 'approved', 'in_stock', 'good']);
const RED = new Set(['inactive', 'rejected', 'cancelled', 'needs_replacement', 'dispose', 'defective', 'overdue', 'critical', 'out_of_stock']);

function statusTone(v: unknown): StatusTone {
  const k = String(v ?? '').toLowerCase();
  if (GREEN.has(k)) return 'paid';
  if (RED.has(k)) return 'overdue';
  return 'pending';
}
const titleCase = (v: unknown): string =>
  String(v ?? '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const statusCell = (v: unknown): TableCell => ({ text: titleCase(v), status: statusTone(v) });
const workflowStatusLabel = (v: unknown): string => String(v ?? '').toLowerCase() === 'pending' ? 'Ongoing' : titleCase(v);
const workflowStatusCell = (v: unknown): TableCell => ({ text: workflowStatusLabel(v), status: statusTone(v) });
const badgeCell = (text: string, tone: BadgeTone): TableCell => ({ text, badge: tone });
const money = (v: unknown): string =>
  '₱ ' + Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateShort = (v: unknown): string => {
  if (!v) return '—';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-GB');
};
const count = (rows: EntityRow[], pred: (r: EntityRow) => boolean) => String(rows.filter(pred).length);
/** Today's date as YYYY-MM-DD — used as the min for scheduling date pickers. */
const todayISO = (): string => new Date().toISOString().slice(0, 10);

const metric = (id: string, label: string, value: string, icon: string, accent: Metric['accent']): Metric => ({
  id, label, value, icon, accent,
});

const WRITE: Record<string, string[]> = {
  incidents: ['customer', 'zone-specialist', 'technical-team', 'general-manager'],
  'job-orders': ['technical-team', 'general-manager'],
  materials: ['inventory-officer', 'general-manager'],
  suppliers: ['inventory-officer', 'general-manager'],
  'material-requests': ['technical-team', 'inventory-officer', 'general-manager'],
  assets: ['technical-team', 'zone-specialist', 'general-manager'],
  advisories: ['technical-team', 'general-manager'],
  'purchase-requests': ['inventory-officer', 'general-manager'],
  payments: ['general-manager'],
  'supply-requests': ['customer', 'zone-specialist', 'technical-team', 'inventory-officer', 'general-manager'],
};

interface ModuleProps {
  filter?: string;
}

/** Edit button shown only for active rows. */
function EditBtn({ c }: { c: RowActionCtx }) {
  if (c.archived) return null;
  return (
    <button className="btn-action" onClick={c.edit} disabled={c.busy}>
      Edit
    </button>
  );
}

/** Archive (active) or Restore (archived) toggle for a row. */
function ArchiveBtn({ c }: { c: RowActionCtx }) {
  return c.archived ? (
    <button className="btn-action" onClick={c.restore} disabled={c.busy}>
      Restore
    </button>
  ) : (
    <button className="btn-action btn-archive" onClick={c.archive} disabled={c.busy}>
      Archive
    </button>
  );
}

/* --------------------------------------------------- Detail / view helpers */
/** A single label/value row inside a detail (view) modal. */
function DetailRow({ label, children }: { label: string; children?: ReactNode }) {
  const empty = children == null || children === '' ;
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{empty ? '—' : children}</dd>
    </div>
  );
}

/** Read-only gallery of attached images; click to enlarge in a lightbox. */
function ImageGallery({ images }: { images?: unknown }) {
  const list = Array.isArray(images) ? (images as string[]) : [];
  const [zoom, setZoom] = useState<string | null>(null);
  if (!list.length) return null;
  return (
    <>
      <p className="detail-section-title">Attached Photos ({list.length})</p>
      <div className="detail-gallery">
        {list.map((src, i) => (
          <button key={i} type="button" onClick={() => setZoom(src)} title="Click to enlarge">
            <img src={src} alt={`Attachment ${i + 1}`} />
          </button>
        ))}
      </div>
      {zoom && (
        <div className="image-lightbox" onClick={() => setZoom(null)} role="dialog" aria-label="Enlarged photo">
          <img src={zoom} alt="Enlarged attachment" />
          <button type="button" className="image-lightbox-close" aria-label="Close">
            ✕
          </button>
        </div>
      )}
    </>
  );
}

/** Generic "View" row action — opens a read-only detail modal. */
function ViewAction({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-action" onClick={() => setOpen(true)}>
        View
      </button>
      {open && (
        <Modal title={title} open wide={wide} onClose={() => setOpen(false)}>
          {children}
        </Modal>
      )}
    </>
  );
}


/* ------------------------------------------------ Tech-team assignment */
interface UserLite {
  id: string;
  fullName: string;
  role: string;
}

/**
 * Registered technical-team members, for job-order assignment. Only the general
 * manager can read the user directory (`/users`), so this is used solely inside
 * general-manager views.
 */
function useTechTeam(): { members: UserLite[]; loading: boolean; error: string | null } {
  const [members, setMembers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .get<{ data: UserLite[] }>('/users')
      .then((r) => {
        if (alive) setMembers(r.data.filter((u) => u.role === 'technical-team'));
      })
      .catch(() => alive && setError('Could not load technical-team members.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  return { members, loading, error };
}

/**
 * Create-and-assign a job order. The general manager names the crew, picks a
 * team leader and any number of member(s) — restricted to technical-team users
 * registered in the system — then dispatches the work. When opened from a
 * complaint the title, scope and linked reference are pre-filled.
 */
function JobOrderForm({
  incident,
  onClose,
  onCreated,
}: {
  incident?: EntityRow;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const { notify } = useToast();
  const { members, loading, error } = useTechTeam();

  const [teamName, setTeamName] = useState('');
  const [leader, setLeader] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState(
    incident ? `${titleCase(incident.type)} — ${String(incident.location ?? '')}`.trim().replace(/—\s*$/, '').trim() : '',
  );
  const [scope, setScope] = useState(incident ? String(incident.remarks || incident.description || '') : '');
  const [cost, setCost] = useState('');
  const [scheduled, setScheduled] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleMember = (name: string) =>
    setPicked((m) => (m.includes(name) ? m.filter((x) => x !== name) : [...m, name]));

  const save = async () => {
    if (!title.trim()) return notify('A job title is required.', 'error');
    if (!leader) return notify('Select a team leader.', 'error');
    // Members list = leader first, then any additional picked members (deduped).
    const membersList = [leader, ...picked.filter((m) => m !== leader)];
    setSaving(true);
    try {
      await resourceService.create('job-orders', {
        title: title.trim(),
        incident_ref: incident ? String(incident.ref_code ?? '') : '',
        scope: scope.trim(),
        team: 'in-house',
        team_name: teamName.trim(),
        team_leader: leader,
        team_members: membersList,
        assigned_to: membersList.join(', '),
        estimated_cost: cost || 0,
        scheduled_date: scheduled,
        status: 'in_progress',
      });
      notify('Job order created and assigned to the team!');
      await onCreated();
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not create the job order.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={incident ? `Create Job Order — Complaint ${incident.ref_code}` : 'Create Job Order'}
      open
      wide
      onClose={onClose}
      onSubmit={save}
      submitText="Create & Assign"
      submitting={saving}
    >
      {incident && (
        <div className="form-group">
          <label>Linked Complaint</label>
          <input value={`${incident.ref_code} — ${titleCase(incident.type)}`} readOnly />
          <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)' }}>
            Automatically associated with the complaint you opened.
          </small>
        </div>
      )}
      <div className="form-group">
        <label>Job Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Repair main line leak" />
      </div>
      <div className="form-group">
        <label>Scope of Work</label>
        <textarea value={scope} onChange={(e) => setScope(e.target.value)} placeholder="What needs to be done…" />
      </div>

      <p className="detail-section-title">Team Assignment</p>
      <div className="form-group">
        <label>Team Name</label>
        <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Alpha Crew" />
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Loading technical-team members…</p>
      ) : error ? (
        <p style={{ color: '#e25577' }}>{error}</p>
      ) : members.length === 0 ? (
        <p style={{ color: '#e25577' }}>
          No technical-team members are registered yet. Add them in User Management first.
        </p>
      ) : (
        <>
          <div className="form-group">
            <label>Team Leader</label>
            <select value={leader} onChange={(e) => setLeader(e.target.value)}>
              <option value="">Select a team leader…</option>
              {members.map((m) => (
                <option key={m.id} value={m.fullName}>
                  {m.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Team Members (optional — click to select any number)</label>
            <div className="member-list">
              {members.map((m) => {
                const isLeader = m.fullName === leader;
                const selected = isLeader || picked.includes(m.fullName);
                return (
                  <button
                    type="button"
                    key={m.id}
                    className={`member-card${selected ? ' is-selected' : ''}${isLeader ? ' is-leader' : ''}`}
                    aria-pressed={selected}
                    disabled={isLeader}
                    onClick={() => !isLeader && toggleMember(m.fullName)}
                  >
                    <span className="member-name">{m.fullName}</span>
                    {isLeader ? (
                      <span className="member-tag is-leader">Leader</span>
                    ) : (
                      selected && <span className="member-tag">Selected</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="form-group">
        <label>Estimated Cost (₱)</label>
        <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
      </div>
      <div className="form-group">
        <label>Scheduled Date</label>
        <input type="date" min={todayISO()} value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
      </div>
    </Modal>
  );
}

/** Panel-head "Create Job Order" button that opens the team-assignment form. */
function CreateJobOrderButton({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ActionButton label="Create Job Order" icon="plus-circle" onClick={() => setOpen(true)} />
      {open && <JobOrderForm onClose={() => setOpen(false)} onCreated={onCreated} />}
    </>
  );
}

/* --------------------------------------------------------------- Incidents */
const INCIDENT_STATUS = [
  { value: 'under_verification', label: 'Under Verification' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'resolved', label: 'Resolved' },
];
const INCIDENT_TYPE_OPTIONS = [
  { value: 'complaint', label: 'General Complaint' },
  { value: 'leak', label: 'Pipe Leak' },
  { value: 'new-connection', label: 'New Connection' },
  { value: 'disconnection', label: 'Disconnection' },
  { value: 'other', label: 'Other' },
];
const URGENCY = ['low', 'medium', 'high'];

/** Read-only detail body for a complaint/incident, incl. customer photos + remarks. */
function IncidentDetail({ row, hideRemarks = false }: { row: EntityRow; hideRemarks?: boolean }) {
  return (
    <>
      <p className="detail-section-title">Complaint Details</p>
      <dl className="detail-list">
        <DetailRow label="Reference">{String(row.ref_code ?? '')}</DetailRow>
        <DetailRow label="Type">{titleCase(row.type)}</DetailRow>
        <DetailRow label="Status">{titleCase(row.status)}</DetailRow>
        <DetailRow label="Urgency">{titleCase(row.urgency)}</DetailRow>
        <DetailRow label="Location">{String(row.location ?? '')}</DetailRow>
        <DetailRow label="Reported By">{String(row.reported_by ?? '')}</DetailRow>
        <DetailRow label="Filed On">{dateShort(row.created_at)}</DetailRow>
        <DetailRow label="Description">{String(row.description ?? '')}</DetailRow>
        {!hideRemarks && <DetailRow label="Zone Specialist Remarks">{String(row.remarks ?? '')}</DetailRow>}
      </dl>
      <ImageGallery images={row.images} />
    </>
  );
}

/**
 * "View" action for incidents. Opens a detail modal; zone specialists can also
 * add/edit the remarks forwarded to the technical team directly inside it.
 */
function IncidentViewButton({
  c,
  canEditRemarks,
  canCreateJobOrder = false,
  showCustomerBilling = false,
}: {
  c: RowActionCtx;
  canEditRemarks: boolean;
  canCreateJobOrder?: boolean;
  showCustomerBilling?: boolean;
}) {
  const { stats } = useStats();
  const [open, setOpen] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [bills, setBills] = useState<EntityRow[]>([]);
  const editable = canEditRemarks && !c.archived;

  const hasRemarks = String(c.row.remarks ?? '').trim() !== '';
  // A job order already exists for this incident — no second one may be created.
  const hasJobOrder = stats.jobOrders.some(
    (j) => String(j.incident_ref ?? '') === String(c.row.ref_code ?? ''),
  );
  // The general manager can dispatch a crew once, and only while a complaint is
  // triaged (has a remark, still "in progress", and not yet scheduled/ordered).
  const canDispatch =
    canCreateJobOrder && !c.archived && hasRemarks && c.row.status === 'in_progress' && !hasJobOrder;

  const afterCreate = async () => {
    setShowJobForm(false);
    setOpen(false);
    await c.reload();
  };

  const loadBills = async () => {
    if (!showCustomerBilling) return;
    const rows = await resourceService.list('payments');
    setBills(rows.filter((bill) => String(bill.incident_ref ?? '') === String(c.row.ref_code ?? '')));
  };
  const openModal = () => {
    setRemarks(String(c.row.remarks ?? ''));
    setOpen(true);
    void loadBills();
  };
  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { remarks: remarks.trim() };
      // Adding a remark advances a freshly-reported complaint to "in progress"
      // so the general manager can act on it (and create a job order).
      if (c.row.status === 'under_verification') patch.status = 'in_progress';
      await c.update(patch);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button className="btn-action" onClick={openModal} disabled={c.busy}>
        View
      </button>
      {open && (
        <Modal
          title={`Complaint ${c.row.ref_code}`}
          open
          wide
          onClose={() => setOpen(false)}
          onSubmit={editable ? save : undefined}
          submitText="Save Remarks"
          submitting={saving}
        >
          <IncidentDetail row={c.row} hideRemarks={editable} />
          {showCustomerBilling && bills.length > 0 && (
            <div className="complaint-billing-summary">
              <p className="detail-section-title">Billing for this Complaint</p>
              {bills.map((bill) => (
                <div className="complaint-bill-row" key={bill.id}>
                  <div><strong>{String(bill.ref_code)}</strong><span>{money(bill.amount)} · Due {dateShort(bill.due_date)} · {billingStatusLabel(bill.status)}</span></div>
                  <CustomerBillingAction c={{ row: bill, busy: false, archived: false, update: async () => {}, remove: () => {}, archive: () => {}, restore: () => {}, edit: () => {}, reload: loadBills }} />
                </div>
              ))}
            </div>
          )}
          {editable && (
            <div className="form-group" style={{ marginTop: 18, marginBottom: 0 }}>
              <label>Zone Specialist Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Findings, recommended action, parts likely needed…"
              />
            </div>
          )}
          {canDispatch && (
            <div style={{ marginTop: 18 }}>
              <ActionButton label="Create Job Order" icon="clipboard-list" onClick={() => setShowJobForm(true)} />
            </div>
          )}
          {canCreateJobOrder && !canDispatch && !editable && (
            <p style={{ marginTop: 16, color: 'var(--muted)', fontSize: 13 }}>
              {hasJobOrder
                ? 'A job order has already been created for this complaint.'
                : 'A job order can be created once this complaint has a zone-specialist remark and its status is “In Progress”.'}
            </p>
          )}
        </Modal>
      )}
      {showJobForm && (
        <JobOrderForm incident={c.row} onClose={() => setShowJobForm(false)} onCreated={afterCreate} />
      )}
    </>
  );
}

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
    { name: 'type', label: 'Type', kind: 'select', optionList: INCIDENT_TYPE_OPTIONS, default: 'complaint' },
    { name: 'description', label: 'Description', kind: 'textarea', placeholder: 'Describe the concern…' },
    { name: 'location', label: 'Location', placeholder: 'Brgy., Boac', default: user!.barangay ?? 'Boac' },
    { name: 'urgency', label: 'Urgency', kind: 'select', options: URGENCY, default: 'medium' },
    { name: 'images', label: 'Photos (optional)', kind: 'images' },
    // Reporter is always the signed-in account — read-only, never editable.
    {
      name: 'reported_by',
      label: 'Reported By',
      default: user!.fullName,
      readOnly: true,
      hint: `${user!.fullName} · ${roleLabel(role)} (auto-filled from your account)`,
    },
  ];

  const actions = canWrite
    ? (c: RowActionCtx) => (
        <>
          {(manage || role === 'customer') && (
            <IncidentViewButton
              c={c}
              canEditRemarks={role === 'zone-specialist'}
              canCreateJobOrder={role === 'general-manager'}
              showCustomerBilling={role === 'customer'}
            />
          )}
          {manage && !c.archived && !(role === 'general-manager' && c.row.status === 'under_verification') && (
            <StatusSelect value={String(c.row.status)} options={INCIDENT_STATUS} disabled={c.busy} onChange={(s) => c.update({ status: s })} />
          )}
          <EditBtn c={c} />
          <ArchiveBtn c={c} />
        </>
      )
    : undefined;

  return (
    <LiveModule
      entity="incidents"
      title={title ?? (mine ? 'My Complaints & Inquiries' : 'Incident Management')}
      createLabel="File Complaint"
      columns={columns}
      tableClassName="incidents-table"
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
  { value: 'pending', label: 'Ongoing' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Full job-order detail incl. the linked complaint + zone-specialist remarks. */
function JobOrderDetail({ row }: { row: EntityRow }) {
  const { stats } = useStats();
  const incident = stats.incidents.find((i) => String(i.ref_code) === String(row.incident_ref));
  return (
    <>
      <p className="detail-section-title">Job Order</p>
      <dl className="detail-list">
        <DetailRow label="Reference">{String(row.ref_code ?? '')}</DetailRow>
        <DetailRow label="Title">{String(row.title ?? '')}</DetailRow>
        <DetailRow label="Status">{titleCase(row.status)}</DetailRow>
        <DetailRow label="Team">{titleCase(row.team)}</DetailRow>
        <DetailRow label="Team Name">{String(row.team_name ?? '')}</DetailRow>
        <DetailRow label="Team Leader">{String(row.team_leader ?? '')}</DetailRow>
        <DetailRow label="Team Members">
          {Array.isArray(row.team_members) ? (row.team_members as string[]).join(', ') : String(row.assigned_to ?? '')}
        </DetailRow>
        <DetailRow label="Estimated Cost">{money(row.estimated_cost)}</DetailRow>
        <DetailRow label="Scheduled">{dateShort(row.scheduled_date)}</DetailRow>
        <DetailRow label="Scope of Work">{String(row.scope ?? '')}</DetailRow>
        <DetailRow label="Linked Complaint">{String(row.incident_ref ?? '')}</DetailRow>
      </dl>

      {incident ? (
        <>
          <p className="detail-section-title">Linked Complaint — for Material Allocation</p>
          <dl className="detail-list">
            <DetailRow label="Type">{titleCase(incident.type)}</DetailRow>
            <DetailRow label="Urgency">{titleCase(incident.urgency)}</DetailRow>
            <DetailRow label="Location">{String(incident.location ?? '')}</DetailRow>
            <DetailRow label="Requested By">{String(incident.reported_by ?? '')}</DetailRow>
            <DetailRow label="Description">{String(incident.description ?? '')}</DetailRow>
            <DetailRow label="Zone Specialist Remarks">{String(incident.remarks ?? '')}</DetailRow>
          </dl>
          <ImageGallery images={incident.images} />
        </>
      ) : row.incident_ref ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Linked complaint {String(row.incident_ref)} not found.</p>
      ) : null}
    </>
  );
}

/**
 * "View" action for a job order. Shows the full detail and — for anyone who can
 * file material requests (technical team, inventory, GM) — a "Request Materials"
 * button that opens the shared MRF modal pre-linked to this job order.
 */
function JobOrderViewButton({ row, onReload }: { row: EntityRow; onReload: () => Promise<void> }) {
  const { user } = useAuth();
  const canRequest = WRITE['material-requests'].includes(user!.role);
  const [open, setOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  return (
    <>
      <button className="btn-action" onClick={() => setOpen(true)}>
        View
      </button>
      {open && (
        <Modal title={`Job Order ${row.ref_code}`} open wide onClose={() => setOpen(false)} closeText="Close">
          <JobOrderDetail row={row} />
          {canRequest && (
            <div style={{ marginTop: 18 }}>
              <ActionButton label="Request Materials" icon="hammer" onClick={() => setReqOpen(true)} />
            </div>
          )}
        </Modal>
      )}
      {reqOpen && (
        <MaterialRequestForm
          lockedJobOrderRef={String(row.ref_code)}
          onClose={() => setReqOpen(false)}
          onCreated={onReload}
        />
      )}
    </>
  );
}

export function JobOrdersModule({ filter, readOnly = false, title }: ModuleProps & { readOnly?: boolean; title?: string }) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = !readOnly && WRITE['job-orders'].includes(role);
  // The general manager creates + assigns job orders through the team form.
  const canAssign = role === 'general-manager';
  // Technical-team members only see the job orders their crew is assigned to.
  const me = user!.fullName.toLowerCase();
  const rowFilter =
    role === 'technical-team'
      ? (r: EntityRow) => {
          const leader = String(r.team_leader ?? '').toLowerCase();
          const members = Array.isArray(r.team_members)
            ? (r.team_members as string[]).map((s) => String(s).toLowerCase())
            : [];
          const assigned = String(r.assigned_to ?? '').toLowerCase();
          return leader === me || members.includes(me) || assigned.includes(me);
        }
      : undefined;

  const columns: ModuleColumn[] = [
    { header: 'Ref', cell: (r) => ({ text: String(r.ref_code), strong: true }) },
    { header: 'Title', cell: (r) => String(r.title ?? '') },
    { header: 'Team', cell: (r) => String(r.team_name || titleCase(r.team) || '—') },
    { header: 'Assigned To', cell: (r) => String(r.assigned_to ?? '—') },
    { header: 'Est. Cost', cell: (r) => money(r.estimated_cost) },
    { header: 'Schedule', cell: (r) => dateShort(r.scheduled_date) },
    { header: 'Status', cell: (r) => workflowStatusCell(r.status) },
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

  // The technical team's tab is view-only: every row exposes a full-detail View
  // (job order + linked complaint + remarks) plus a "Request Materials" action.
  const viewAction = (c: RowActionCtx) => <JobOrderViewButton row={c.row} onReload={c.reload} />;

  return (
    <LiveModule
      entity="job-orders"
      title={title ?? 'Job Order Management'}
      createLabel="Create Job Order"
      columns={columns}
      tableClassName="job-orders-table"
      fields={fields}
      canWrite={canWrite}
      filter={filter}
      rowFilter={rowFilter}
      actionLabel={readOnly ? 'Details' : 'Action'}
      archivable={!readOnly}
      renderCreate={
        canAssign
          ? ({ reload }) => <CreateJobOrderButton onCreated={reload} />
          : undefined
      }
      metrics={(rows) => [
        metric('j1', 'Total Job Orders', String(rows.length), 'clipboard-list', 'customers'),
        metric('j2', 'In Progress', count(rows, (r) => r.status === 'in_progress'), 'wrench', 'revenue'),
        metric('j3', 'Ongoing', count(rows, (r) => r.status === 'pending'), 'clock', 'profit'),
        metric('j4', 'Completed', count(rows, (r) => r.status === 'completed'), 'check-circle', 'invoices'),
      ]}
      actions={
        readOnly
          ? viewAction
          : canWrite
          ? (c) => (
              <>
                {viewAction(c)}
                {!c.archived && <StatusSelect value={String(c.row.status)} options={JOB_STATUS} disabled={c.busy} onChange={(s) => c.update({ status: s })} />}
                <EditBtn c={c} />
                <ArchiveBtn c={c} />
              </>
            )
          : undefined
      }
    />
  );
}

/* --------------------------------------------------------------- Materials */
function useSupplierOptions() {
  const [suppliers, setSuppliers] = useState<EntityRow[]>([]);
  useEffect(() => {
    resourceService.list('suppliers').then(setSuppliers).catch(() => setSuppliers([]));
  }, []);
  return suppliers
    .filter((supplier) => !supplier.archived && supplier.status !== 'inactive')
    .map((supplier) => ({ value: String(supplier.id), label: String(supplier.name) }));
}

function RestockBtn({ c }: { c: RowActionCtx }) {
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const current = Number(c.row.quantity ?? 0);
  const added = Number(amount || 0);
  const unit = String(c.row.unit ?? 'units');

  const close = () => {
    if (saving) return;
    setOpen(false);
    setAmount('');
  };

  const save = async () => {
    if (!Number.isFinite(added) || added <= 0) {
      notify('Enter a restock quantity greater than zero.', 'error');
      return;
    }
    setSaving(true);
    try {
      await resourceService.update('materials', c.row.id, { quantity: current + added });
      await c.reload();
      notify(`${c.row.name ?? 'Material'} restocked by ${added} ${unit}.`);
      setOpen(false);
      setAmount('');
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Restock failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button className="btn-action btn-restock" type="button" onClick={() => setOpen(true)} disabled={c.busy}>
        Restock
      </button>
      <Modal title="Restock Material" open={open} onClose={close} onSubmit={save} submitText="Add to Stock" submitting={saving}>
        <div className="restock-material-card">
          <span>Material</span>
          <strong>{String(c.row.name ?? 'Unnamed material')}</strong>
          <small>{String(c.row.sku ?? '')}</small>
        </div>
        <div className="restock-stock-summary" aria-label="Stock calculation">
          <div><span>Current stock</span><strong>{current} {unit}</strong></div>
          <b>+</b>
          <div><span>To add</span><strong>{added > 0 ? added : 0} {unit}</strong></div>
          <b>=</b>
          <div className="restock-new-total"><span>New stock</span><strong>{current + (added > 0 ? added : 0)} {unit}</strong></div>
        </div>
        <div className="form-group restock-quantity-field">
          <label htmlFor={`restock-${c.row.id}`}>Quantity to add</label>
          <input
            id={`restock-${c.row.id}`}
            type="number"
            min="0.01"
            step="any"
            inputMode="decimal"
            autoFocus
            placeholder="Enter quantity"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void save(); }}
          />
          <small>This amount will be added to the current stock and recorded in Inventory History.</small>
        </div>
      </Modal>
    </>
  );
}

function categoryColor(category: unknown, explicitColor?: unknown): string {
  const supplied = String(explicitColor ?? '').trim();
  if (/^(#[0-9a-f]{3,8}|[a-z]+|hsl\(.+\)|rgb\(.+\))$/i.test(supplied)) return supplied;
  const name = String(category ?? 'Uncategorized');
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 65% 52%)`;
}

function materialStockStatus(quantity: unknown, minLevel: unknown, requestedStatus?: unknown): string {
  if (requestedStatus === 'defective') return 'defective';
  const stock = Number(quantity ?? 0);
  const minimum = Number(minLevel ?? 10);
  if (stock <= 0) return 'out_of_stock';
  if (stock <= minimum) return 'low_stock';
  return 'in_stock';
}

function InventoryHistory({ filter }: ModuleProps) {
  const [logs, setLogs] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    resourceService.list('audit-logs')
      .then((rows) => {
        if (!active) return;
        setLogs(rows.filter((row) => {
          if (row.entity !== 'materials') return false;
          const details = (row.details ?? {}) as Record<string, unknown>;
          return row.action === 'stock_movement' || row.action === 'create' ||
            (row.action === 'update' && ('quantity_change' in details || 'quantity' in details));
        }));
      })
      .catch((cause) => {
        if (active) setError(cause instanceof ApiError ? cause.message : 'Unable to load inventory history.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const table = useMemo<ResourceTable>(() => ({
    id: 'inventory-history',
    columns: ['Date & Time', 'Material', 'Movement', 'Change', 'Previous', 'New Stock', 'Supplier / Reference', 'Performed By'],
    rows: logs.map((row) => {
      const details = (row.details ?? {}) as Record<string, unknown>;
      const previous = details.previous_quantity;
      const next = details.new_quantity ?? details.quantity;
      const rawChange = details.quantity_change;
      const change = rawChange === undefined && previous !== undefined && next !== undefined
        ? Number(next) - Number(previous)
        : Number(rawChange ?? 0);
      const movement = String(details.movement_type ?? (row.action === 'create' ? 'initial_stock' : 'adjustment'));
      const movementLabel = movement === 'stock_out' ? 'Stock Out' : movement === 'initial_stock' ? 'Initial Stock' : change > 0 ? 'Stock In' : change < 0 ? 'Stock Out' : 'Adjustment';
      const unit = String(details.unit ?? '').trim();
      const formatQty = (value: unknown) => value === undefined || value === null ? '—' : `${Number(value)}${unit ? ` ${unit}` : ''}`;
      const when = row.created_at ? new Date(String(row.created_at)) : null;
      const timestamp = when && !Number.isNaN(when.getTime())
        ? when.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
        : '—';
      return {
        id: String(row.id),
        cells: [
          { text: timestamp },
          { text: String(details.material_name ?? details.name ?? details.sku ?? 'Unknown material'), strong: true },
          { text: movementLabel, badge: change < 0 ? 'high' : change > 0 ? 'low' : 'medium' },
          { text: `${change > 0 ? '+' : ''}${formatQty(change)}`, strong: true },
          { text: formatQty(previous) },
          { text: formatQty(next) },
          { text: String(details.supplier ?? details.reference ?? details.source ?? '—') },
          { text: String(row.actor ?? titleCase(row.actor_role ?? 'System')) },
        ],
      };
    }),
  }), [logs]);

  if (loading) return <p style={{ color: 'var(--muted)', padding: '8px 2px' }}>Loading inventory history…</p>;
  if (error) return <p style={{ color: '#e25577', padding: '8px 2px' }}>{error}</p>;
  return (
    <>
      <PanelHead title="Inventory Movement History" />
      <DataTable table={table} filter={filter} className="inventory-history-table" />
    </>
  );
}

export function MaterialsModule({ filter, readOnly = false, title }: ModuleProps & { readOnly?: boolean; title?: string }) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = !readOnly && WRITE.materials.includes(role);
  const supplierOptions = useSupplierOptions();
  const [activeTab, setActiveTab] = useState<'inventory' | 'history'>('inventory');

  const columns: ModuleColumn[] = [
    { header: 'SKU', cell: (r) => ({ text: String(r.sku), strong: true }) },
    { header: 'Material', cell: (r) => String(r.name ?? '') },
    { header: 'Category', cell: (r) => ({ text: String(r.category ?? 'Uncategorized'), swatch: categoryColor(r.category, r.color) }) },
    { header: 'Stock', cell: (r) => `${r.quantity ?? 0} ${r.unit ?? ''}`.trim() },
    { header: 'Weight', cell: (r) => r.weight_kg ? `${r.weight_kg} kg` : '—' },
    { header: 'Size', cell: (r) => String(r.size ?? '—') },
    { header: 'Unit Price', cell: (r) => money(r.unit_price) },
    { header: 'Status', cell: (r) => statusCell(materialStockStatus(r.quantity, r.min_level, r.status)) },
  ];

  const fields: ModuleField[] = [
    { name: 'name', label: 'Material Name', placeholder: 'e.g. PVC Pipe 50mm' },
    {
      name: 'category',
      label: 'Category',
      placeholder: 'Pipes / Valves / Meters…',
      suggestionsFromRows: (rows) => Array.from(new Map(
        rows
          .map((row) => String(row.category ?? '').trim())
          .filter(Boolean)
          .map((category) => [category.toLocaleLowerCase(), category]),
      ).values()).sort((a, b) => a.localeCompare(b)),
      hint: 'Type to choose an existing category, or enter a new one.',
    },
    { name: 'description', label: 'Description', kind: 'textarea' },
    { name: 'quantity', label: 'Quantity', kind: 'number', default: '0' },
    { name: 'min_level', label: 'Minimum Level', kind: 'number', default: '10', hint: 'Stock at or below this level is automatically marked Low Stock.' },
    { name: 'unit', label: 'Unit', default: 'units' },
    { name: 'weight_kg', label: 'Weight (kg)', kind: 'number' },
    { name: 'size', label: 'Size', placeholder: 'e.g. 50mm, 4 inches' },
    { name: 'color', label: 'Color', placeholder: 'e.g. Blue, Red' },
    { name: 'unit_price', label: 'Unit Price (₱)', kind: 'number' },
    {
      name: 'source',
      label: 'Source',
      kind: 'select',
      styledSelect: true,
      optionList: [{ value: 'mother-company', label: 'Mother Company' }, { value: 'external', label: 'External Supplier' }],
    },
    {
      name: 'supplier_id',
      label: 'Supplier',
      kind: 'select',
      optionList: [{ value: '', label: 'Select external supplier' }, ...supplierOptions],
      visibleWhen: (values) => values.source === 'external',
      hint: 'Manage available supplier profiles from the Suppliers module.',
    },
  ];

  return (
    <>
      <div className="inventory-tabs" role="tablist" aria-label="Inventory views">
        <button type="button" role="tab" aria-selected={activeTab === 'inventory'} className={activeTab === 'inventory' ? 'active' : ''} onClick={() => setActiveTab('inventory')}>Current Inventory</button>
        <button type="button" role="tab" aria-selected={activeTab === 'history'} className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>Inventory History</button>
      </div>
      {activeTab === 'history' ? (
        <InventoryHistory filter={filter} />
      ) : (
        <LiveModule
          entity="materials"
          title={title ?? 'Material List & Stock Levels'}
          tableClassName="inventory-materials-table"
      createLabel="Add New Item"
      columns={columns}
      fields={fields}
      prepareValues={(values) => ({
        ...values,
        status: materialStockStatus(values.quantity, values.min_level),
        supplier_id: values.source === 'external' ? values.supplier_id : null,
        supplier: values.source === 'external'
          ? supplierOptions.find((supplier) => supplier.value === values.supplier_id)?.label ?? ''
          : '',
      })}
      canWrite={canWrite}
      filter={filter}
      metrics={(rows) => [
        metric('m1', 'Total SKUs', String(rows.length), 'box', 'customers'),
        metric('m2', 'Out of Stock', count(rows, (r) => materialStockStatus(r.quantity, r.min_level, r.status) === 'out_of_stock'), 'package-x', 'profit'),
        metric('m3', 'Low Stock', count(rows, (r) => materialStockStatus(r.quantity, r.min_level, r.status) === 'low_stock'), 'alert-triangle', 'revenue'),
        metric('m4', 'Inventory Value', money(rows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unit_price || 0), 0)), 'wallet', 'invoices'),
      ]}
      quickFilters={(rows) => Array.from(new Set(rows.map((row) => String(row.category ?? 'Uncategorized'))))
        .sort((a, b) => a.localeCompare(b))
        .map((category) => ({
          id: `category:${category}`,
          label: category,
          hint: `${rows.filter((row) => String(row.category ?? 'Uncategorized') === category).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0)} units`,
          matches: (row: EntityRow) => String(row.category ?? 'Uncategorized') === category,
        }))}
      actions={
        canWrite
          ? (c) => (
              <>
                <RestockBtn c={c} />
                <EditBtn c={c} />
                <ArchiveBtn c={c} />
              </>
            )
          : undefined
      }
        />
      )}
    </>
  );
}

/* ------------------------------------------------------- Material Requests */
const MR_STATUS = [
  { value: 'pending', label: 'Ongoing' },
  { value: 'approved', label: 'Approved' },
  { value: 'released', label: 'Released' },
  { value: 'rejected', label: 'Rejected' },
];

/** Full MRF detail incl. which job order the material is allocated to. */
function MrfDetail({ row }: { row: EntityRow }) {
  const { stats } = useStats();
  const jo = stats.jobOrders.find((j) => String(j.ref_code) === String(row.job_order_ref));
  return (
    <>
      <p className="detail-section-title">Material Request</p>
      <dl className="detail-list">
        <DetailRow label="Reference">{String(row.ref_code ?? '')}</DetailRow>
        <DetailRow label="Material">{String(row.material_name ?? '')}</DetailRow>
        <DetailRow label="SKU">{String(row.material_sku ?? '')}</DetailRow>
        <DetailRow label="Quantity">{String(row.quantity ?? 0)}</DetailRow>
        <DetailRow label="Job Order Ref">{String(row.job_order_ref ?? '')}</DetailRow>
        <DetailRow label="Used On (Job Order)">{jo ? String(jo.title ?? '') : row.job_order_ref ? 'Not found' : '—'}</DetailRow>
        <DetailRow label="Requested By">{String(row.requested_by ?? '')}</DetailRow>
        <DetailRow label="Status">{titleCase(row.status)}</DetailRow>
        <DetailRow label="Requested On">{dateShort(row.created_at)}</DetailRow>
      </dl>
    </>
  );
}

/**
 * Searchable Material field — a combobox that lets the user either pick an
 * existing inventory item (linking its SKU) or type a brand-new custom material
 * (no SKU). Selecting from the list links the SKU; typing anything clears the
 * link and treats the text as a custom material.
 */
function MaterialCombobox({
  inventory,
  value,
  onChange,
}: {
  inventory: EntityRow[];
  value: { name: string; sku: string };
  onChange: (next: { name: string; sku: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.name.trim().toLowerCase();
    const list = q
      ? inventory.filter((m) => `${m.sku} ${m.name}`.toLowerCase().includes(q))
      : inventory;
    return list.slice(0, 50);
  }, [inventory, value.name]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (m: EntityRow) => {
    onChange({ name: String(m.name ?? ''), sku: String(m.sku ?? '') });
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return setOpen(true);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && open && highlight >= 0 && filtered[highlight]) {
      e.preventDefault();
      pick(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="combobox" ref={wrapRef}>
      <div className={`combobox-control${value.sku ? ' is-linked' : ''}`}>
        <input
          role="combobox"
          aria-expanded={open}
          value={value.name}
          onChange={(e) => {
            // Typing = a custom material; drop any previously linked SKU.
            onChange({ name: e.target.value, sku: '' });
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search inventory or type a new material…"
        />
        {value.sku && <span className="combobox-chip">{value.sku}</span>}
        <button
          type="button"
          className="combobox-caret"
          tabIndex={-1}
          aria-label="Toggle inventory list"
          onClick={() => setOpen((o) => !o)}
        >
          ▾
        </button>
      </div>

      {value.sku ? (
        <small className="combobox-hint is-linked">✓ Linked to inventory — stock will be deducted on approval.</small>
      ) : value.name.trim() ? (
        <small className="combobox-hint is-custom">New custom material — not linked to inventory, no stock deducted.</small>
      ) : (
        <small className="combobox-hint">Pick an item to link its SKU, or just type a name.</small>
      )}

      {open && (
        <ul className="combobox-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="combobox-empty">
              No inventory match — “{value.name.trim()}” will be saved as a custom material.
            </li>
          ) : (
            filtered.map((m, i) => (
              <li
                key={String(m.id)}
                role="option"
                aria-selected={value.sku === String(m.sku)}
                className={`combobox-option${i === highlight ? ' is-active' : ''}${
                  value.sku === String(m.sku) ? ' is-selected' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="combobox-sku">{String(m.sku)}</span>
                <span className="combobox-name">{String(m.name ?? '')}</span>
                <span className="combobox-stock">
                  {Number(m.quantity ?? 0)} {String(m.unit ?? 'units')}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Searchable Job Order field — an optional combobox over active job orders.
 * Selecting one links its reference to the request; it can be cleared back to
 * "no job order". Typing filters by reference, title or linked complaint; free
 * text is never stored (only a real selection or blank is committed).
 */
function JobOrderCombobox({
  jobOrders,
  value,
  onChange,
}: {
  jobOrders: EntityRow[];
  value: string;
  onChange: (ref: string) => void;
}) {
  const labelOf = (j: EntityRow) => `${String(j.ref_code)} — ${String(j.title || 'Untitled')}`;
  const selected = jobOrders.find((j) => String(j.ref_code) === value) ?? null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Reflect the committed selection in the input whenever it changes.
  useEffect(() => {
    const s = jobOrders.find((j) => String(j.ref_code) === value) ?? null;
    setQuery(s ? labelOf(s) : '');
  }, [value, jobOrders]);

  const close = () => {
    setOpen(false);
    setHighlight(-1);
    setQuery(selected ? labelOf(selected) : ''); // discard un-committed typing
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  });

  const q = query.trim().toLowerCase();
  const showingSelected = selected && q === labelOf(selected).toLowerCase();
  const filtered = useMemo(() => {
    const list =
      !q || showingSelected
        ? jobOrders
        : jobOrders.filter((j) =>
            `${j.ref_code} ${j.title ?? ''} ${j.incident_ref ?? ''}`.toLowerCase().includes(q),
          );
    return list.slice(0, 50);
  }, [jobOrders, q, showingSelected]);

  const pick = (j: EntityRow) => {
    onChange(String(j.ref_code));
    setOpen(false);
    setHighlight(-1);
  };
  const clear = () => {
    onChange('');
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return setOpen(true);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && open && highlight >= 0 && filtered[highlight]) {
      e.preventDefault();
      pick(filtered[highlight]);
    } else if (e.key === 'Escape') {
      close();
    }
  };

  return (
    <div className="combobox" ref={wrapRef}>
      <div className={`combobox-control${value ? ' is-linked' : ''}`}>
        <input
          role="combobox"
          aria-expanded={open}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search a job order (optional)…"
        />
        {value && (
          <button type="button" className="combobox-caret" tabIndex={-1} aria-label="Clear job order" onClick={clear}>
            ✕
          </button>
        )}
        <button
          type="button"
          className="combobox-caret"
          tabIndex={-1}
          aria-label="Toggle job order list"
          onClick={() => setOpen((o) => !o)}
        >
          ▾
        </button>
      </div>

      {value ? (
        <small className="combobox-hint is-linked">✓ Linked to {value}.</small>
      ) : (
        <small className="combobox-hint">Optional — leave blank to file without a job order.</small>
      )}

      {open && (
        <ul className="combobox-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="combobox-empty">No matching job order.</li>
          ) : (
            filtered.map((j, i) => (
              <li
                key={String(j.id)}
                role="option"
                aria-selected={value === String(j.ref_code)}
                className={`combobox-option${i === highlight ? ' is-active' : ''}${
                  value === String(j.ref_code) ? ' is-selected' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(j);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="combobox-sku">{String(j.ref_code)}</span>
                <span className="combobox-name">{String(j.title || 'Untitled')}</span>
                <span className="combobox-stock">{j.incident_ref ? String(j.incident_ref) : ''}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * The Material Request (MRF) create modal — the single source of truth for
 * filing a request, reused by the "New Request" button on the Material Requests
 * tab and the "Request Materials" button inside a Job Order. When opened from a
 * job order, `lockedJobOrderRef` pre-fills and locks the Job Order Ref field.
 */
function MaterialRequestForm({
  lockedJobOrderRef,
  onClose,
  onCreated,
}: {
  lockedJobOrderRef?: string;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();
  const { stats } = useStats();
  const role = user!.role;

  // Only active, in-stock (non-defective, non-out-of-stock) inventory can be requested by SKU.
  const inventory = stats.materials.filter(
    (m) => !m.archived && m.status !== 'defective' && m.status !== 'out_of_stock' && Number(m.quantity ?? 0) > 0,
  );
  // Active (open) job orders available to link a request to.
  const activeJobOrders = stats.jobOrders.filter((j) =>
    ['pending', 'in_progress'].includes(String(j.status)),
  );

  const [form, setForm] = useState({
    material_name: '',
    material_sku: '',
    quantity: '1',
    job_order_ref: lockedJobOrderRef ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.material_name.trim()) return notify('Material name is required.', 'error');
    setSaving(true);
    try {
      await resourceService.create('material-requests', {
        material_name: form.material_name.trim(),
        // SKU is set only when an inventory item was picked from the combobox.
        material_sku: form.material_sku,
        quantity: form.quantity,
        job_order_ref: form.job_order_ref,
        requested_by: user!.fullName,
      });
      notify('Record created successfully!');
      await onCreated();
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Something went wrong.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New Request" open onClose={onClose} onSubmit={save} submitText="Create" submitting={saving}>
      <div className="form-group">
        <label>Material</label>
        <MaterialCombobox
          inventory={inventory}
          value={{ name: form.material_name, sku: form.material_sku }}
          onChange={(next) => setForm((f) => ({ ...f, material_name: next.name, material_sku: next.sku }))}
        />
      </div>

      <div className="form-group">
        <label>Quantity</label>
        <input type="number" min={1} value={form.quantity} onChange={set('quantity')} />
      </div>
      <div className="form-group">
        <label>Job Order Ref (optional)</label>
        {lockedJobOrderRef ? (
          <>
            <input value={form.job_order_ref} readOnly />
            <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)' }}>
              Linked to this job order.
            </small>
          </>
        ) : (
          <JobOrderCombobox
            jobOrders={activeJobOrders}
            value={form.job_order_ref}
            onChange={(ref) => setForm((f) => ({ ...f, job_order_ref: ref }))}
          />
        )}
      </div>
      <div className="form-group">
        <label>Requested By</label>
        <input value={user!.fullName} readOnly />
        <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)' }}>
          {user!.fullName} · {roleLabel(role)} (auto-filled from your account)
        </small>
      </div>
    </Modal>
  );
}

/** Trigger button that opens the shared Material Request modal. */
function MaterialRequestButton({
  onCreated,
  lockedJobOrderRef,
  label = 'New Request',
  icon = 'plus-circle',
}: {
  onCreated: () => Promise<void> | void;
  lockedJobOrderRef?: string;
  label?: string;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ActionButton label={label} icon={icon} onClick={() => setOpen(true)} />
      {open && (
        <MaterialRequestForm
          lockedJobOrderRef={lockedJobOrderRef}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
}

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
    { header: 'Status', cell: (r) => workflowStatusCell(r.status) },
  ];

  const fields: ModuleField[] = [
    { name: 'material_name', label: 'Material', placeholder: 'Material name' },
    { name: 'material_sku', label: 'SKU', placeholder: 'SKU-XXXX (optional)' },
    { name: 'quantity', label: 'Quantity', kind: 'number', default: '1' },
    { name: 'job_order_ref', label: 'Job Order Ref', placeholder: 'JO-XXXX (optional)' },
    {
      name: 'requested_by',
      label: 'Requested By',
      default: user!.fullName,
      readOnly: true,
      hint: `${user!.fullName} · ${roleLabel(role)} (auto-filled from your account)`,
    },
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
      renderCreate={({ reload }) => <MaterialRequestButton onCreated={reload} />}
      metrics={(rows) => [
        metric('r1', 'Total Requests', String(rows.length), 'file-input', 'customers'),
        metric('r2', 'Ongoing', count(rows, (r) => r.status === 'pending'), 'clock', 'revenue'),
        metric('r3', 'Approved', count(rows, (r) => r.status === 'approved'), 'check-circle', 'profit'),
        metric('r4', 'Released', count(rows, (r) => r.status === 'released'), 'package-check', 'invoices'),
      ]}
      actions={(c) => (
        <>
          <ViewAction title={`Material Request ${c.row.ref_code}`} wide>
            <MrfDetail row={c.row} />
          </ViewAction>
          {canWrite && (
            <>
              {canApprove && !c.archived && <StatusSelect value={String(c.row.status)} options={MR_STATUS} disabled={c.busy} onChange={(s) => c.update({ status: s })} />}
              <EditBtn c={c} />
              <ArchiveBtn c={c} />
            </>
          )}
        </>
      )}
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
    { header: 'Health', cell: (r) => ({ text: `${r.health_score ?? '—'} · ${r.health_label ?? ''}`.trim(), status: statusTone(r.health_label) }) },
    { header: 'Remaining', cell: (r) => `${r.remaining_years ?? 0} yrs` },
  ];

  const fields: ModuleField[] = [
    { name: 'name', label: 'Asset Name', placeholder: 'e.g. Distribution Main A' },
    { name: 'type', label: 'Type', placeholder: 'Pipe / Pump / Meter / Valve' },
    { name: 'location', label: 'Location', placeholder: 'Brgy., Boac' },
    { name: 'install_date', label: 'Installation Date', kind: 'date', allowPast: true },
    { name: 'expected_lifespan_years', label: 'Expected Lifespan (years)', kind: 'number', default: '10' },
    { name: 'last_maintenance', label: 'Last Maintenance', kind: 'date', allowPast: true },
    { name: 'condition', label: 'Condition', kind: 'select', optionList: CONDITION },
  ];

  return (
    <LiveModule
      entity="assets"
      title={title ?? 'Asset Lifecycle Monitoring'}
      createLabel="Register Asset"
      columns={columns}
      tableClassName="gm-incidents-table assets-table"
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
                <ViewAction title={`Asset ${c.row.asset_tag}`} wide>
                  <p className="detail-section-title">Asset Details</p>
                  <dl className="detail-list">
                    <DetailRow label="Asset Tag">{String(c.row.asset_tag ?? '')}</DetailRow>
                    <DetailRow label="Asset Name">{String(c.row.name ?? '')}</DetailRow>
                    <DetailRow label="Type">{String(c.row.type ?? '—')}</DetailRow>
                    <DetailRow label="Location">{String(c.row.location ?? '—')}</DetailRow>
                    <DetailRow label="Installation Date">{dateShort(c.row.install_date)}</DetailRow>
                    <DetailRow label="Last Maintenance">{dateShort(c.row.last_maintenance)}</DetailRow>
                    <DetailRow label="Expected Lifespan">{`${c.row.expected_lifespan_years ?? 0} years`}</DetailRow>
                    <DetailRow label="Remaining Lifespan">{`${c.row.remaining_years ?? 0} years`}</DetailRow>
                    <DetailRow label="Condition">{titleCase(c.row.condition)}</DetailRow>
                    <DetailRow label="Health">{`${c.row.health_score ?? '—'} · ${c.row.health_label ?? ''}`.trim()}</DetailRow>
                    <DetailRow label="Recommended Action">{String(c.row.recommendation ?? '—')}</DetailRow>
                  </dl>
                </ViewAction>
                {!c.archived && <StatusSelect value={String(c.row.condition)} options={CONDITION} disabled={c.busy} onChange={(s) => c.update({ condition: s })} />}
                <EditBtn c={c} />
                <ArchiveBtn c={c} />
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
        canWrite
          ? (c) => (
              <>
                {canApprove && !c.archived && <StatusSelect value={String(c.row.status)} options={ADVISORY_STATUS} disabled={c.busy} onChange={(s) => c.update({ status: s })} />}
                <EditBtn c={c} />
                <ArchiveBtn c={c} />
              </>
            )
          : undefined
      }
    />
  );
}

/* ----------------------------------------------------- Users (admin only) */
interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  createdAt: string;
  startDate?: string | null;
  isArchived?: boolean;
  barangay?: string;
}
const BLANK_USER = { fullName: '', email: '', password: '', role: 'customer', startDate: '' };
const DEFAULT_TEMPORARY_PASSWORD = 'Password123';

export function UsersPanel({ filter }: ModuleProps) {
  const { notify } = useToast();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_USER);
  const [showArchived, setShowArchived] = useState(false);
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);

  const load = () =>
    api
      .get<{ data: UserRow[] }>('/users')
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load users.'));

  useEffect(() => {
    load();
  }, []);

  const createUser = async () => {
    setSubmitting(true);
    try {
      await api.post('/users', form);
      notify('User account created successfully!');
      setOpen(false);
      setForm(BLANK_USER);
      setShowTemporaryPassword(false);
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not create user.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const changeRole = async (id: string, role: string) => {
    setBusyId(id);
    try {
      await api.patch(`/users/${id}/role`, { role });
      notify('Role updated! Email confirmation will be sent.');
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not update role.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const archiveUser = async (id: string) => {
    setBusyId(id);
    try {
      await api.patch(`/users/${id}/archive`, {});
      notify('User archived (resigned). Account preserved in audit trail.');
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not archive user.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const restoreUser = async (id: string) => {
    setBusyId(id);
    try {
      await api.patch(`/users/${id}/restore`, {});
      notify('User restored successfully!');
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not restore user.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const roleOptions = ROLES.map((r) => ({ value: r.value, label: r.label }));
  const filteredRows = rows.filter((u) => (showArchived ? Boolean(u.isArchived) : !u.isArchived));

  const openCreateUser = () => {
    setForm({ ...BLANK_USER, password: DEFAULT_TEMPORARY_PASSWORD });
    setShowTemporaryPassword(false);
    setOpen(true);
  };

  const closeCreateUser = () => {
    setOpen(false);
    setShowTemporaryPassword(false);
  };

  const table = useMemo(
    () => ({
      id: 'users',
      columns: ['Name', 'Email', 'Role', 'Start Date', 'Status'],
      rows: filteredRows.map((u) => ({
        id: u.id,
        cells: [
          { text: u.fullName, strong: true } as TableCell,
          { text: u.email },
          badgeCell(titleCase(u.role), 'low'),
          { text: u.startDate ? dateShort(u.startDate) : '—' },
          u.isArchived ? badgeCell('Archived', 'high') : { text: 'Active', status: 'paid' as StatusTone },
        ],
      })),
    }),
    [filteredRows],
  );

  return (
    <>
      <PanelHead
        title="User Management"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show Archived
            </label>
            <ActionButton label="Add User" icon="user-plus" onClick={openCreateUser} />
          </div>
        }
      />
      {error ? (
        <p style={{ color: '#e25577' }}>{error}</p>
      ) : (
        <DataTable
          table={table}
          filter={filter}
          actionLabel="Action"
          renderActions={(id) => {
            const u = rows.find((x) => x.id === id);
            if (!u) return null;
            return (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <StatusSelect value={u.role} options={roleOptions} disabled={busyId === id} onChange={(role) => changeRole(id, role)} />
                {u.isArchived ? (
                  <button className="btn-action" disabled={busyId === id} onClick={() => restoreUser(id)}>Restore</button>
                ) : (
                  <button className="btn-action btn-archive" disabled={busyId === id} onClick={() => archiveUser(id)}>Resign</button>
                )}
              </div>
            );
          }}
        />
      )}

      {open && (
        <Modal title="Add Staff User" open onClose={closeCreateUser} onSubmit={createUser} submitText="Create User" submitting={submitting}>
          <div className="form-group">
            <label>Full Name</label>
            <input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Full name" />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@flowguard.ph" />
          </div>
          <div className="form-group">
            <label>Temporary Password</label>
            <div className="dashboard-password-field">
              <input
                type={showTemporaryPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min. 6 characters"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowTemporaryPassword((visible) => !visible)}
                aria-label={showTemporaryPassword ? 'Hide temporary password' : 'Show temporary password'}
                title={showTemporaryPassword ? 'Hide password' : 'Show password'}
              >
                {showTemporaryPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Start Date (Join Date)</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            A confirmation email will be sent to the user upon account creation and role changes.
          </p>
        </Modal>
      )}
    </>
  );
}

/* ------------------------------------------------------- Audit Log (read-only) */
const ACTION_BADGE: Record<string, BadgeTone> = {
  register: 'low',
  admin_create_user: 'low',
  role_change: 'medium',
  resign: 'high',
  reactivate: 'low',
  profile_update: 'medium',
  password_change: 'medium',
  otp_enabled: 'low',
  otp_disabled: 'medium',
  create: 'low',
  update: 'medium',
  delete: 'high',
};

export function AuditLogsModule({ filter }: ModuleProps) {
  const columns: ModuleColumn[] = [
    { header: 'Timestamp', cell: (r) => dateShort(r.created_at) },
    { header: 'Action', cell: (r) => badgeCell(titleCase(r.action), ACTION_BADGE[String(r.action)] ?? 'medium') },
    { header: 'Description', cell: (r) => {
      const d = r.details as Record<string, unknown> | null;
      if (d?.description) return String(d.description);
      // Fallback: construct from available data
      const actor = String(r.actor ?? 'System');
      const target = d?.target_name ? String(d.target_name) : '';
      return target ? `${actor} performed ${titleCase(r.action)} on "${target}"` : `${actor} performed ${titleCase(r.action)}`;
    }},
    { header: 'Time', cell: (r) => {
      if (!r.created_at) return '—';
      const d = new Date(String(r.created_at));
      return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }},
  ];

  return (
    <LiveModule
      entity="audit-logs"
      title="Audit Log"
      columns={columns}
      fields={[]}
      canWrite={false}
      filter={filter}
      metrics={(rows) => [
        metric('al1', 'Total Entries', String(rows.length), 'scroll', 'customers'),
        metric('al2', 'Account Events', count(rows, (r) => ['register', 'admin_create_user', 'resign', 'reactivate'].includes(String(r.action))), 'users', 'revenue'),
        metric('al3', 'Security Events', count(rows, (r) => ['role_change', 'password_change', 'otp_enabled', 'otp_disabled'].includes(String(r.action))), 'shield', 'profit'),
        metric('al4', 'Profile Updates', count(rows, (r) => r.action === 'profile_update'), 'edit', 'invoices'),
      ]}
    />
  );
}

/* ---------------------------------------------------------- Suppliers */
const SUPPLIER_STATUS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export function SuppliersModule({ filter }: ModuleProps) {
  const { user } = useAuth();
  const canWrite = WRITE.suppliers.includes(user!.role);
  const columns: ModuleColumn[] = [
    { header: 'Supplier', cell: (r) => ({ text: String(r.name ?? ''), strong: true }) },
    { header: 'Contact Person', cell: (r) => String(r.contact_person ?? '—') },
    { header: 'Email', cell: (r) => String(r.email ?? '—') },
    { header: 'Phone', cell: (r) => String(r.phone ?? '—') },
    { header: 'Address', cell: (r) => String(r.address ?? '—') },
    { header: 'Status', cell: (r) => statusCell(r.status) },
  ];
  const fields: ModuleField[] = [
    { name: 'name', label: 'Supplier Name', placeholder: 'Registered business name' },
    { name: 'contact_person', label: 'Contact Person' },
    { name: 'email', label: 'Email' },
    { name: 'phone', label: 'Phone Number' },
    { name: 'address', label: 'Address', kind: 'textarea' },
    { name: 'notes', label: 'Notes', kind: 'textarea' },
    { name: 'status', label: 'Status', kind: 'select', optionList: SUPPLIER_STATUS },
  ];
  return (
    <LiveModule
      entity="suppliers"
      title="Supplier Profiles"
      createLabel="Add Supplier"
      columns={columns}
      fields={fields}
      canWrite={canWrite}
      filter={filter}
      metrics={(rows) => [
        metric('sp1', 'Total Suppliers', String(rows.length), 'users', 'customers'),
        metric('sp2', 'Active', count(rows, (r) => r.status !== 'inactive'), 'check-circle', 'profit'),
        metric('sp3', 'Inactive', count(rows, (r) => r.status === 'inactive'), 'archive', 'invoices'),
      ]}
      actions={canWrite ? (c) => <><EditBtn c={c} /><ArchiveBtn c={c} /></> : undefined}
    />
  );
}

/* --------------------------------------------------- Purchase Requests */
const PR_STATUS = [
  { value: 'pending', label: 'Ongoing' },
  { value: 'approved', label: 'Approved' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'received', label: 'Received' },
  { value: 'rejected', label: 'Rejected' },
];

export function PurchaseRequestsModule({ filter }: ModuleProps) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = WRITE['purchase-requests'].includes(role);
  const canApprove = role === 'general-manager';
  const supplierOptions = useSupplierOptions();

  const columns: ModuleColumn[] = [
    { header: 'Ref', cell: (r) => ({ text: String(r.ref_code), strong: true }) },
    { header: 'Material', cell: (r) => String(r.material_name ?? '') },
    { header: 'Category', cell: (r) => String(r.category ?? '—') },
    { header: 'Qty', cell: (r) => `${r.quantity ?? 0} ${r.unit ?? ''}`.trim() },
    { header: 'Weight', cell: (r) => Number(r.weight_kg ?? 0) > 0 ? `${r.weight_kg} kg` : '—' },
    { header: 'Unit Price', cell: (r) => money(r.unit_price) },
    { header: 'Total', cell: (r) => money(r.total_cost) },
    { header: 'Supplier', cell: (r) => String(r.supplier ?? '—') },
    { header: 'Requested By', cell: (r) => String(r.requested_by ?? '—') },
    { header: 'Status', cell: (r) => workflowStatusCell(r.status) },
  ];

  const fields: ModuleField[] = [
    { name: 'material_name', label: 'Material Name', placeholder: 'Material to purchase' },
    { name: 'category', label: 'Category', placeholder: 'Pipes / Valves / Meters…' },
    { name: 'description', label: 'Description', kind: 'textarea' },
    { name: 'quantity', label: 'Quantity', kind: 'number', default: '1' },
    { name: 'min_level', label: 'Minimum Level', kind: 'number', default: '10', hint: 'Minimum stock level to use when this item is added to inventory.' },
    { name: 'unit', label: 'Unit', default: 'units' },
    { name: 'weight_kg', label: 'Weight (kg)', kind: 'number' },
    { name: 'size', label: 'Size', placeholder: 'e.g. 50mm, 4 inches' },
    { name: 'color', label: 'Color', placeholder: 'e.g. Blue, Red' },
    { name: 'unit_price', label: 'Unit Price (₱)', kind: 'number' },
    {
      name: 'source',
      label: 'Source',
      kind: 'select',
      styledSelect: true,
      optionList: [{ value: 'mother-company', label: 'Mother Company' }, { value: 'external', label: 'External Supplier' }],
      default: 'external',
    },
    { name: 'supplier_id', label: 'Supplier', kind: 'select', optionList: [{ value: '', label: 'Select external supplier' }, ...supplierOptions], visibleWhen: (values) => values.source === 'external' },
    { name: 'justification', label: 'Justification', kind: 'textarea', placeholder: 'Why is this purchase needed?' },
    { name: 'requested_by', label: 'Requested By', default: user!.fullName, readOnly: true },
  ];

  return (
    <LiveModule
      entity="purchase-requests"
      title="Purchase Requests"
      createLabel="New Purchase Request"
      columns={columns}
      fields={fields}
      prepareValues={(values) => ({
        ...values,
        total_cost: Number(values.quantity || 0) * Number(values.unit_price || 0),
        supplier_id: values.source === 'external' ? values.supplier_id : null,
        supplier: values.source === 'external'
          ? supplierOptions.find((supplier) => supplier.value === values.supplier_id)?.label ?? ''
          : 'Mother Company',
      })}
      canWrite={canWrite}
      filter={filter}
      metrics={(rows) => [
        metric('pr1', 'Total Requests', String(rows.length), 'shopping-cart', 'customers'),
        metric('pr2', 'Ongoing', count(rows, (r) => r.status === 'pending'), 'clock', 'revenue'),
        metric('pr3', 'Approved', count(rows, (r) => r.status === 'approved'), 'check-circle', 'profit'),
        metric('pr4', 'Total Value', money(rows.reduce((s, r) => s + Number(r.total_cost || 0), 0)), 'wallet', 'invoices'),
      ]}
      actions={(c) => (
        <>
          <ViewAction title={`Purchase Request ${c.row.ref_code}`} wide>
            <dl className="detail-list">
              <DetailRow label="Reference">{String(c.row.ref_code ?? '')}</DetailRow>
              <DetailRow label="Material">{String(c.row.material_name ?? '')}</DetailRow>
              <DetailRow label="Category">{String(c.row.category ?? '—')}</DetailRow>
              <DetailRow label="Description">{String(c.row.description ?? '—')}</DetailRow>
              <DetailRow label="Quantity">{`${c.row.quantity ?? 0} ${c.row.unit ?? ''}`}</DetailRow>
              <DetailRow label="Minimum Level">{String(c.row.min_level ?? 10)}</DetailRow>
              <DetailRow label="Weight">{Number(c.row.weight_kg ?? 0) > 0 ? `${c.row.weight_kg} kg` : '—'}</DetailRow>
              <DetailRow label="Size">{String(c.row.size ?? '—')}</DetailRow>
              <DetailRow label="Color">{String(c.row.color ?? '—')}</DetailRow>
              <DetailRow label="Unit Price">{money(c.row.unit_price)}</DetailRow>
              <DetailRow label="Total Cost">{money(c.row.total_cost)}</DetailRow>
              <DetailRow label="Source">{titleCase(c.row.source ?? 'external')}</DetailRow>
              <DetailRow label="Supplier">{String(c.row.supplier ?? '—')}</DetailRow>
              <DetailRow label="Justification">{String(c.row.justification ?? '—')}</DetailRow>
              <DetailRow label="Requested By">{String(c.row.requested_by ?? '—')}</DetailRow>
              <DetailRow label="Status">{workflowStatusLabel(c.row.status)}</DetailRow>
            </dl>
          </ViewAction>
          {canWrite && (
            <>
              {canApprove && !c.archived && <StatusSelect value={String(c.row.status)} options={PR_STATUS} disabled={c.busy} onChange={(s) => c.update({ status: s })} />}
              <EditBtn c={c} />
              <ArchiveBtn c={c} />
            </>
          )}
        </>
      )}
    />
  );
}

/* ------------------------------------------------------- E-Billing / Payments */
const PAYMENT_STATUS = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'late', label: 'Late' },
  { value: 'overdue', label: 'Overdue' },
];

export function LegacyPaymentsModule({ filter }: ModuleProps) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = WRITE.payments.includes(role);

  const columns: ModuleColumn[] = [
    { header: 'Ref', cell: (r) => ({ text: String(r.ref_code), strong: true }) },
    { header: 'Customer', cell: (r) => String(r.customer_name ?? '') },
    { header: 'Amount', cell: (r) => money(r.amount) },
    { header: 'Due Date', cell: (r) => dateShort(r.due_date) },
    { header: 'Paid Date', cell: (r) => dateShort(r.paid_date) },
    { header: 'Status', cell: (r) => statusCell(r.status) },
  ];

  const fields: ModuleField[] = [
    { name: 'customer_name', label: 'Customer Name' },
    { name: 'customer_email', label: 'Customer Email', placeholder: 'email@example.com' },
    { name: 'amount', label: 'Amount (₱)', kind: 'number' },
    { name: 'due_date', label: 'Due Date', kind: 'date' },
    { name: 'paid_date', label: 'Paid Date', kind: 'date' },
    { name: 'status', label: 'Status', kind: 'select', optionList: PAYMENT_STATUS },
    { name: 'notes', label: 'Notes', kind: 'textarea' },
  ];

  return (
    <LiveModule
      entity="payments"
      title="E-Billing & Payments"
      createLabel="Record Payment"
      columns={columns}
      fields={fields}
      canWrite={canWrite}
      filter={filter}
      metrics={(rows) => [
        metric('pay1', 'Total Records', String(rows.length), 'credit-card', 'customers'),
        metric('pay2', 'Paid', count(rows, (r) => r.status === 'paid'), 'check-circle', 'revenue'),
        metric('pay3', 'Late', count(rows, (r) => r.status === 'late'), 'clock', 'profit'),
        metric('pay4', 'Overdue', count(rows, (r) => r.status === 'overdue'), 'alert-triangle', 'invoices'),
      ]}
      actions={(c) => (
        <>
          <ViewAction title={`Payment ${c.row.ref_code}`} wide>
            <dl className="detail-list">
              <DetailRow label="Reference">{String(c.row.ref_code ?? '')}</DetailRow>
              <DetailRow label="Customer">{String(c.row.customer_name ?? '')}</DetailRow>
              <DetailRow label="Email">{String(c.row.customer_email ?? '—')}</DetailRow>
              <DetailRow label="Amount">{money(c.row.amount)}</DetailRow>
              <DetailRow label="Due Date">{dateShort(c.row.due_date)}</DetailRow>
              <DetailRow label="Paid Date">{dateShort(c.row.paid_date)}</DetailRow>
              <DetailRow label="Status">{titleCase(c.row.status)}</DetailRow>
              <DetailRow label="Notes">{String(c.row.notes ?? '—')}</DetailRow>
            </dl>
          </ViewAction>
          {canWrite && (
            <>
              {!c.archived && <StatusSelect value={String(c.row.status)} options={PAYMENT_STATUS} disabled={c.busy} onChange={(s) => c.update({ status: s })} />}
              <EditBtn c={c} />
              <ArchiveBtn c={c} />
            </>
          )}
        </>
      )}
    />
  );
}

const billingStatusLabel = (value: unknown): string => {
  const status = String(value ?? 'unpaid');
  if (status === 'pending') return 'Unpaid';
  if (status === 'for_verification') return 'For Verification';
  if (status === 'rejected') return 'Payment Rejected';
  return titleCase(status);
};

function BillingDetails({ row, customer = false }: { row: EntityRow; customer?: boolean }) {
  return (
    <>
      <div className="billing-amount-card">
        <span>Amount Due</span><strong>{money(row.amount)}</strong><small>Due {dateShort(row.due_date)}</small>
      </div>
      {customer && row.status === 'rejected' && (
        <div className="payment-rejection-notice" role="alert">
          <strong>Payment was declined</strong>
          <p>{String(row.verification_notes || 'Please review your payment details and submit a new proof of payment.')}</p>
        </div>
      )}
      <dl className="detail-list">
        <DetailRow label="Bill Reference">{String(row.ref_code ?? '')}</DetailRow>
        <DetailRow label="Incident">{String(row.incident_ref ?? '—')}</DetailRow>
        <DetailRow label="Job Order">{String(row.job_order_ref ?? '—')}</DetailRow>
        <DetailRow label="Service">{String(row.service_description ?? row.notes ?? '—')}</DetailRow>
        {!customer && <DetailRow label="Customer">{String(row.customer_name ?? '')}</DetailRow>}
        {!customer && <DetailRow label="Email">{String(row.customer_email ?? '')}</DetailRow>}
        <DetailRow label="Status">{billingStatusLabel(row.status)}</DetailRow>
        <DetailRow label="Payment Method">{String(row.payment_method ?? '—')}</DetailRow>
        <DetailRow label="Account Name">{String(row.account_name ?? '—')}</DetailRow>
        <DetailRow label="Account Number">{String(row.account_number ?? '—')}</DetailRow>
        {Boolean(row.payment_reference) && <DetailRow label="Submitted Reference">{String(row.payment_reference)}</DetailRow>}
        {row.amount_paid != null && <DetailRow label="Amount Submitted">{money(row.amount_paid)}</DetailRow>}
        {Boolean(row.payment_date) && <DetailRow label="Payment Date">{dateShort(row.payment_date)}</DetailRow>}
        {Boolean(row.verification_notes) && <DetailRow label="Verification Notes">{String(row.verification_notes)}</DetailRow>}
      </dl>
      {Array.isArray(row.payment_qr) && row.payment_qr.length > 0 && <><p className="detail-section-title">Scan to Pay</p><ImageGallery images={row.payment_qr} /></>}
      {Array.isArray(row.payment_proof) && row.payment_proof.length > 0 && <><p className="detail-section-title">Payment Proof</p><ImageGallery images={row.payment_proof} /></>}
    </>
  );
}

function CustomerBillingAction({ c }: { c: RowActionCtx }) {
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState(String(c.row.payment_method ?? 'GCash'));
  const [amount, setAmount] = useState(String(c.row.amount ?? ''));
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<string[]>([]);
  const payable = ['pending', 'unpaid', 'overdue', 'rejected'].includes(String(c.row.status));

  const submit = async () => {
    if (!method.trim() || !(Number(amount) > 0) || !paymentDate || !reference.trim() || proof.length === 0) {
      notify('Complete every payment field and attach a screenshot.', 'error');
      return;
    }
    setSaving(true);
    try {
      await resourceService.update('payments', c.row.id, {
        payment_method: method, amount_paid: Number(amount), payment_date: paymentDate,
        payment_reference: reference.trim(), payment_proof: proof,
      });
      await c.reload();
      notify('Payment proof submitted for verification.');
      setOpen(false);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Could not submit payment proof.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <>
      <button className="btn-action" type="button" onClick={() => setOpen(true)}>{payable ? 'View / Pay' : 'View Bill'}</button>
      <Modal title={`Bill ${c.row.ref_code}`} open={open} wide onClose={() => setOpen(false)} onSubmit={payable ? submit : undefined} submitText="Submit Payment Proof" submitting={saving}>
        <BillingDetails row={c.row} customer />
        {payable && <div className="payment-submission-form">
          <p className="detail-section-title">Submit Payment</p>
          <div className="form-grid">
            <div className="form-group"><label>Payment Method</label><input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="GCash / Maya / Bank" /></div>
            <div className="form-group"><label>Amount Paid</label><input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="form-group"><label>Payment Date</label><input type="date" max={todayISO()} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
            <div className="form-group"><label>Reference Number</label><input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          </div>
          <div className="form-group"><label>Screenshot / Proof of Payment</label><ImageUpload value={proof} onChange={setProof} /></div>
        </div>}
      </Modal>
    </>
  );
}

function BillingReviewAction({ c }: { c: RowActionCtx }) {
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(String(c.row.verification_notes ?? ''));
  const [saving, setSaving] = useState(false);
  const reviewable = c.row.status === 'for_verification';
  const decide = async (status: 'paid' | 'rejected') => {
    if (status === 'rejected' && !notes.trim()) return notify('Enter a rejection reason for the customer.', 'error');
    setSaving(true);
    try {
      await resourceService.update('payments', c.row.id, { status, verification_notes: notes.trim() });
      await c.reload();
      notify(status === 'paid' ? 'Payment verified as Paid.' : 'Payment rejected; customer may resubmit.');
      setOpen(false);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Could not review payment.', 'error');
    } finally { setSaving(false); }
  };
  return <>
    <button className="btn-action" type="button" onClick={() => setOpen(true)}>{reviewable ? 'Review' : 'View'}</button>
    <Modal title={`${reviewable ? 'Review' : 'Payment'} ${c.row.ref_code}`} open={open} wide onClose={() => setOpen(false)}>
      <BillingDetails row={c.row} />
      {reviewable && <div className="payment-review-controls">
        <div className="form-group"><label>Verification Notes / Rejection Reason</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Required when rejecting" /></div>
        <div className="payment-review-actions">
          <button className="btn-secondary payment-reject" disabled={saving} onClick={() => void decide('rejected')}>Reject Payment</button>
          <button className="btn-primary" disabled={saving} onClick={() => void decide('paid')}>Verify as Paid</button>
        </div>
      </div>}
    </Modal>
  </>;
}

interface BillingUser { fullName: string; email: string; role: string }
interface BillableWork { key: string; label: string; incident: EntityRow; job?: EntityRow }

function BillingControls({ onCreated }: { onCreated: () => Promise<void> }) {
  const { notify } = useToast();
  const [issueOpen, setIssueOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [works, setWorks] = useState<BillableWork[]>([]);
  const [profiles, setProfiles] = useState<EntityRow[]>([]);
  const [users, setUsers] = useState<BillingUser[]>([]);
  const [workKey, setWorkKey] = useState('');
  const [profileId, setProfileId] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileMethod, setProfileMethod] = useState('GCash');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [profileQr, setProfileQr] = useState<string[]>([]);

  const loadOptions = async () => {
    setLoading(true);
    try {
      const [incidents, jobs, bills, savedProfiles, userResponse] = await Promise.all([
        resourceService.list('incidents'), resourceService.list('job-orders'), resourceService.list('payments'),
        resourceService.list('payment-methods'), api.get<{ data: BillingUser[] }>('/users'),
      ]);
      const billedJobs = new Set(bills.map((bill) => String(bill.job_order_ref ?? '')).filter(Boolean));
      const jobWorks: BillableWork[] = jobs
        .filter((job) => job.status === 'completed' && !billedJobs.has(String(job.ref_code)))
        .map((job) => ({ job, incident: incidents.find((incident) => String(incident.ref_code) === String(job.incident_ref)) }))
        .filter((item): item is { job: EntityRow; incident: EntityRow } => Boolean(item.incident))
        .map(({ job, incident }) => ({ key: `job:${job.id}`, label: `${job.ref_code} — ${job.title} — ${incident.reported_by}`, job, incident }));
      setWorks(jobWorks);
      setProfiles(savedProfiles);
      setUsers(userResponse.data);
      if (!profileId && savedProfiles[0]) setProfileId(String(savedProfiles[0].id));
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Could not load bill options.', 'error');
    } finally { setLoading(false); }
  };

  const openIssue = () => { setIssueOpen(true); void loadOptions(); };
  const selectedWork = works.find((work) => work.key === workKey);
  const selectedProfile = profiles.find((profile) => profile.id === profileId);
  const customerName = String(selectedWork?.incident.reported_by ?? '');
  const customer = users.find((candidate) => candidate.fullName.trim().toLowerCase() === customerName.trim().toLowerCase());

  const selectWork = (key: string) => {
    setWorkKey(key);
    const work = works.find((item) => item.key === key);
    setDescription(String(work?.job?.title ?? work?.incident.description ?? ''));
  };

  const issueBill = async () => {
    if (!selectedWork || !customer?.email || !selectedProfile || !(Number(amount) > 0) || !dueDate) {
      notify(!customer?.email && selectedWork ? 'No customer account email matches the complaint reporter.' : 'Complete the Job Order, amount, due date, and payment profile.', 'error');
      return;
    }
    setSaving(true);
    try {
      await resourceService.create('payments', {
        customer_name: customerName, customer_email: customer.email,
        incident_ref: selectedWork.incident.ref_code,
        job_order_ref: selectedWork.job?.ref_code ?? '', service_description: description,
        amount: Number(amount), due_date: dueDate,
        payment_method: selectedProfile.payment_method, account_name: selectedProfile.account_name,
        account_number: selectedProfile.account_number, payment_qr: selectedProfile.payment_qr,
      });
      await onCreated();
      notify('Final bill issued to the customer.');
      setIssueOpen(false); setWorkKey(''); setAmount(''); setDueDate(''); setDescription('');
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Could not issue the bill.', 'error');
    } finally { setSaving(false); }
  };

  const addProfile = async () => {
    if (!profileName.trim() || !profileMethod.trim() || !accountName.trim()) {
      notify('Profile name, payment method, and account name are required.', 'error'); return;
    }
    setSaving(true);
    try {
      await resourceService.create('payment-methods', {
        name: profileName, payment_method: profileMethod, account_name: accountName,
        account_number: accountNumber, payment_qr: profileQr,
      });
      await loadOptions();
      notify('Payment information saved.');
      setProfileName(''); setAccountName(''); setAccountNumber(''); setProfileQr([]);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Could not save payment information.', 'error');
    } finally { setSaving(false); }
  };

  return <>
    <div className="panel-head-actions">
      <ActionButton label="Payment Information" icon="wallet" variant="secondary" onClick={() => { setProfilesOpen(true); void loadOptions(); }} />
      <ActionButton label="Issue Final Bill" icon="plus-circle" onClick={openIssue} />
    </div>
    <Modal title="Issue Final Bill" open={issueOpen} wide onClose={() => setIssueOpen(false)} onSubmit={issueBill} submitText="Issue Bill" submitting={saving}>
      {loading ? <p className="billing-helper">Loading completed Job Orders…</p> : <>
        <div className="form-group"><label>Completed Job Order</label><select value={workKey} onChange={(e) => selectWork(e.target.value)}><option value="">Select Job Order</option>{works.map((work) => <option key={work.key} value={work.key}>{work.label}</option>)}</select></div>
        {selectedWork && <div className="billing-customer-preview"><span>Customer</span><strong>{customerName || 'Unknown customer'}</strong><small>{customer?.email ?? 'No matching registered email'}</small></div>}
        <div className="form-grid">
          <div className="form-group"><label>Final Amount</label><div className="peso-input"><span>₱</span><input type="text" inputMode="decimal" value={amount} onChange={(e) => { const next = e.target.value; if (/^\d*(\.\d{0,2})?$/.test(next)) setAmount(next); }} onKeyDown={(e) => { if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault(); }} placeholder="0.00" /></div></div>
          <div className="form-group"><label>Due Date</label><input type="date" min={todayISO()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        </div>
        <div className="form-group"><label>Saved Payment Information</label><select value={profileId} onChange={(e) => setProfileId(e.target.value)}><option value="">Select payment profile</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{String(profile.name)} — {String(profile.payment_method)}</option>)}</select>{profiles.length === 0 && <small>Add payment information first before issuing a bill.</small>}</div>
        {selectedProfile && <div className="selected-payment-profile">
          <div className="selected-payment-icon">{Array.isArray(selectedProfile.payment_qr) && selectedProfile.payment_qr[0] ? <img src={String(selectedProfile.payment_qr[0])} alt={`${selectedProfile.name} QR code`} /> : <span>₱</span>}</div>
          <div className="selected-payment-copy"><small>Selected payment destination</small><strong>{String(selectedProfile.name)}</strong><span>{String(selectedProfile.payment_method)}</span></div>
          <dl><div><dt>Account name</dt><dd>{String(selectedProfile.account_name)}</dd></div><div><dt>Account number</dt><dd>{String(selectedProfile.account_number || 'Not provided')}</dd></div></dl>
        </div>}
        <div className="form-group"><label>Service Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      </>}
    </Modal>
    <Modal title="Saved Payment Information" open={profilesOpen} wide onClose={() => setProfilesOpen(false)} onSubmit={addProfile} submitText="Save Payment Info" submitting={saving}>
      {profiles.length > 0 && <div className="saved-payment-list">{profiles.map((profile) => <div key={profile.id}><strong>{String(profile.name)}</strong><span>{String(profile.payment_method)} · {String(profile.account_name)} · {String(profile.account_number ?? 'No account number')}</span></div>)}</div>}
      <p className="detail-section-title">Add Payment Information</p>
      <div className="form-grid">
        <div className="form-group"><label>Profile Name</label><input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Main GCash" /></div>
        <div className="form-group"><label>Payment Method</label><input value={profileMethod} onChange={(e) => setProfileMethod(e.target.value)} /></div>
        <div className="form-group"><label>Account Name</label><input value={accountName} onChange={(e) => setAccountName(e.target.value)} /></div>
        <div className="form-group"><label>Account Number</label><input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></div>
      </div>
      <div className="form-group"><label>QR Code</label><ImageUpload value={profileQr} onChange={setProfileQr} /></div>
    </Modal>
  </>;
}

export function BillingModule({ filter }: ModuleProps) {
  const { user } = useAuth();
  const customer = user!.role === 'customer';
  const columns: ModuleColumn[] = [
    { header: 'Ref', cell: (r) => ({ text: String(r.ref_code), strong: true }) },
    ...(!customer ? [{ header: 'Customer', cell: (r: EntityRow) => String(r.customer_name ?? '') }] : []),
    { header: 'Service Ref', cell: (r) => String(r.job_order_ref || r.incident_ref || '—') },
    { header: 'Amount', cell: (r) => money(r.amount) },
    { header: 'Due Date', cell: (r) => dateShort(r.due_date) },
    { header: 'Status', cell: (r) => ({ ...statusCell(r.status), text: billingStatusLabel(r.status) }) },
  ];
  const fields: ModuleField[] = [
    { name: 'customer_name', label: 'Customer Name' },
    { name: 'customer_email', label: 'Customer Email', placeholder: 'Customer account email' },
    { name: 'incident_ref', label: 'Resolved Incident Ref', placeholder: 'INC-XXXX (use this or Job Order)' },
    { name: 'job_order_ref', label: 'Completed Job Order Ref', placeholder: 'JO-XXXX (use this or Incident)' },
    { name: 'service_description', label: 'Service Description', kind: 'textarea' },
    { name: 'amount', label: 'Final Amount (PHP)', kind: 'number' },
    { name: 'due_date', label: 'Due Date', kind: 'date' },
    { name: 'payment_method', label: 'Payment Method', placeholder: 'GCash / Maya / Bank Transfer' },
    { name: 'account_name', label: 'Account Name' },
    { name: 'account_number', label: 'Account Number' },
    { name: 'payment_qr', label: 'Payment QR Code', kind: 'images' },
    { name: 'notes', label: 'Billing Notes', kind: 'textarea' },
  ];
  return <LiveModule
    entity="payments" title={customer ? 'My Billing' : 'Billing'} createLabel="Issue Final Bill"
    columns={columns} fields={customer ? [] : fields} canWrite={!customer} filter={filter} archivable={!customer}
    tableClassName="billing-table"
    renderCreate={!customer ? ({ reload }) => <BillingControls onCreated={reload} /> : undefined}
    metrics={(rows) => [
      metric('bill1', customer ? 'My Bills' : 'Total Bills', String(rows.length), 'credit-card', 'customers'),
      metric('bill2', 'Unpaid', count(rows, (r) => ['pending', 'unpaid'].includes(String(r.status))), 'clock', 'revenue'),
      metric('bill3', 'For Verification', count(rows, (r) => r.status === 'for_verification'), 'shield', 'profit'),
      metric('bill4', 'Paid', count(rows, (r) => r.status === 'paid'), 'check-circle', 'invoices'),
    ]}
    actions={(c) => customer ? <CustomerBillingAction c={c} /> : <><BillingReviewAction c={c} /><EditBtn c={c} /><ArchiveBtn c={c} /></>}
  />;
}

/* --------------------------------------------------- Supply Requests */
const SR_STATUS = [
  { value: 'pending', label: 'Ongoing' },
  { value: 'approved', label: 'Approved' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'rejected', label: 'Rejected' },
];

export function SupplyRequestsModule({ filter }: ModuleProps) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = WRITE['supply-requests'].includes(role);
  const canApprove = role === 'inventory-officer' || role === 'general-manager';

  const columns: ModuleColumn[] = [
    { header: 'Ref', cell: (r) => ({ text: String(r.ref_code), strong: true }) },
    { header: 'Item', cell: (r) => String(r.item_name ?? '') },
    { header: 'Qty', cell: (r) => String(r.quantity ?? 0) },
    { header: 'Reason', cell: (r) => String(r.reason ?? '—') },
    { header: 'Requested By', cell: (r) => String(r.requested_by ?? '—') },
    { header: 'Status', cell: (r) => workflowStatusCell(r.status) },
  ];

  const fields: ModuleField[] = [
    { name: 'item_name', label: 'Item Name', placeholder: 'What do you need?' },
    { name: 'quantity', label: 'Quantity', kind: 'number', default: '1' },
    { name: 'reason', label: 'Reason', kind: 'textarea', placeholder: 'Why do you need this?' },
    { name: 'requested_by', label: 'Requested By', default: user!.fullName, readOnly: true },
  ];

  return (
    <LiveModule
      entity="supply-requests"
      title="Supplies Request"
      createLabel="New Supply Request"
      columns={columns}
      fields={fields}
      canWrite={canWrite}
      filter={filter}
      metrics={(rows) => [
        metric('sr1', 'Total Requests', String(rows.length), 'package', 'customers'),
        metric('sr2', 'Ongoing', count(rows, (r) => r.status === 'pending'), 'clock', 'revenue'),
        metric('sr3', 'Fulfilled', count(rows, (r) => r.status === 'fulfilled'), 'check-circle', 'profit'),
        metric('sr4', 'Rejected', count(rows, (r) => r.status === 'rejected'), 'x-circle', 'invoices'),
      ]}
      actions={(c) => (
        <>
          <ViewAction title={`Supply Request ${c.row.ref_code}`}>
            <dl className="detail-list">
              <DetailRow label="Reference">{String(c.row.ref_code ?? '')}</DetailRow>
              <DetailRow label="Item">{String(c.row.item_name ?? '')}</DetailRow>
              <DetailRow label="Quantity">{String(c.row.quantity ?? 0)}</DetailRow>
              <DetailRow label="Reason">{String(c.row.reason ?? '—')}</DetailRow>
              <DetailRow label="Requested By">{String(c.row.requested_by ?? '—')}</DetailRow>
              <DetailRow label="Status">{workflowStatusLabel(c.row.status)}</DetailRow>
            </dl>
          </ViewAction>
          {canWrite && (
            <>
              {canApprove && !c.archived && <StatusSelect value={String(c.row.status)} options={SR_STATUS} disabled={c.busy} onChange={(s) => c.update({ status: s })} />}
              <EditBtn c={c} />
              <ArchiveBtn c={c} />
            </>
          )}
        </>
      )}
    />
  );
}
