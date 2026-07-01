/**
 * Operational module configurations — thin wrappers over <LiveModule> that map
 * each FlowGuard module from the paper (incidents, job orders, inventory,
 * material requests, assets + health scoring, advisories, users) to live data.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BadgeTone, Metric, StatusTone, TableCell } from '../models/types';
import { ROLES } from '../models/types';
import { useAuth } from '../controllers/AuthContext';
import { useToast } from '../controllers/ToastContext';
import { useStats } from '../controllers/StatsContext';
import { api, ApiError } from '../services/apiClient';
import { resourceService, type EntityRow } from '../services/resourceService';
import { LiveModule, StatusSelect, type ModuleColumn, type ModuleField, type RowActionCtx } from '../views/components/LiveModule';
import { DataTable } from '../views/components/DataTable';
import { Modal } from '../views/components/Modal';
import { ActionButton, PanelHead } from '../views/components/panels';

const roleLabel = (role: unknown): string => ROLES.find((r) => r.value === role)?.label ?? String(role ?? '');

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
            <label>Team Members (optional — select any number)</label>
            <div className="checkbox-list">
              {members.map((m) => {
                const isLeader = m.fullName === leader;
                return (
                  <label key={m.id} className="checkbox-row" style={isLeader ? { opacity: 0.6 } : undefined}>
                    <input
                      type="checkbox"
                      checked={isLeader || picked.includes(m.fullName)}
                      disabled={isLeader}
                      onChange={() => toggleMember(m.fullName)}
                    />
                    <span>
                      {m.fullName}
                      {isLeader && ' (leader)'}
                    </span>
                  </label>
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
        <input type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
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
}: {
  c: RowActionCtx;
  canEditRemarks: boolean;
  canCreateJobOrder?: boolean;
}) {
  const { reload: reloadStats } = useStats();
  const [open, setOpen] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const editable = canEditRemarks && !c.archived;

  const hasRemarks = String(c.row.remarks ?? '').trim() !== '';
  // The general manager can dispatch a crew once a complaint has been triaged:
  // it carries a zone-specialist remark and is actively in progress.
  const canDispatch = canCreateJobOrder && !c.archived && hasRemarks && c.row.status === 'in_progress';

  const openModal = () => {
    setRemarks(String(c.row.remarks ?? ''));
    setOpen(true);
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
          {editable && (
            <div className="form-group" style={{ marginTop: 18, marginBottom: 0 }}>
              <label>Remarks for Technical Team</label>
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
              A job order can be created once this complaint has a zone-specialist remark and its status is
              “In Progress”.
            </p>
          )}
        </Modal>
      )}
      {showJobForm && (
        <JobOrderForm
          incident={c.row}
          onClose={() => setShowJobForm(false)}
          onCreated={reloadStats}
        />
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
    { name: 'location', label: 'Location', placeholder: 'Brgy., Boac' },
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
          {manage && (
            <IncidentViewButton
              c={c}
              canEditRemarks={role === 'zone-specialist'}
              canCreateJobOrder={role === 'general-manager'}
            />
          )}
          {manage && !c.archived && (
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

  // The technical team's tab is view-only: every row exposes a full-detail View
  // (job order + linked complaint + remarks) needed for material allocation.
  const viewAction = (c: RowActionCtx) => (
    <ViewAction title={`Job Order ${c.row.ref_code}`} wide>
      <JobOrderDetail row={c.row} />
    </ViewAction>
  );

  return (
    <LiveModule
      entity="job-orders"
      title={title ?? 'Job Order Management'}
      createLabel="Create Job Order"
      columns={columns}
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
        metric('j3', 'Pending', count(rows, (r) => r.status === 'pending'), 'clock', 'profit'),
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
                <EditBtn c={c} />
                <ArchiveBtn c={c} />
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
      metrics={(rows) => [
        metric('r1', 'Total Requests', String(rows.length), 'file-input', 'customers'),
        metric('r2', 'Pending', count(rows, (r) => r.status === 'pending'), 'clock', 'revenue'),
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
}
const BLANK_USER = { fullName: '', email: '', password: '', role: 'customer' };

export function UsersPanel({ filter }: ModuleProps) {
  const { notify } = useToast();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_USER);

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
      notify('Role updated successfully!');
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not update role.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const roleOptions = ROLES.map((r) => ({ value: r.value, label: r.label }));

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
      <PanelHead title="User Management" action={<ActionButton label="Add User" icon="user-plus" onClick={() => setOpen(true)} />} />
      {error ? (
        <p style={{ color: '#e25577' }}>{error}</p>
      ) : (
        <DataTable
          table={table}
          filter={filter}
          actionLabel="Assign Role"
          renderActions={(id) => {
            const u = rows.find((x) => x.id === id);
            if (!u) return null;
            return <StatusSelect value={u.role} options={roleOptions} disabled={busyId === id} onChange={(role) => changeRole(id, role)} />;
          }}
        />
      )}

      {open && (
        <Modal title="Add Staff User" open onClose={() => setOpen(false)} onSubmit={createUser} submitText="Create User" submitting={submitting}>
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
            <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min. 6 characters" />
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
        </Modal>
      )}
    </>
  );
}
