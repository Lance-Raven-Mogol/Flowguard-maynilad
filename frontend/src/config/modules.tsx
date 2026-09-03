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
import { ImageUpload, LiveModule, StatusSelect, type ModuleColumn, type ModuleField, type RowActionCtx, AutocompleteInput } from '../views/components/LiveModule';
import { DataTable } from '../views/components/DataTable';
import { Modal } from '../views/components/Modal';
import { ActionButton, PanelHead, QRLabelModal } from '../views/components/panels';
import { AddressInput, BARANGAYS } from '../views/components/BarangayCombobox';

/** Flat list of all barangay values for autocomplete suggestions. */
const BARANGAY_SUGGESTIONS = BARANGAYS.flatMap(({ municipality, barangays }) =>
  barangays.map((b) => `${b}, ${municipality}`),
);

const roleLabel = (role: unknown): string => ROLES.find((r) => r.value === role)?.label ?? String(role ?? '');

/* ------------------------------------------------------------------ helpers */
const GREEN = new Set(['active', 'resolved', 'completed', 'released', 'published', 'approved', 'in_stock', 'good', 'paid']);
const RED = new Set(['inactive', 'rejected', 'cancelled', 'declined', 'needs_replacement', 'dispose', 'defective', 'overdue', 'critical', 'out_of_stock', 'unpaid']);
const AMBER = new Set(['for_billing', 'for_estimation']);

function statusTone(v: unknown): StatusTone {
  const k = String(v ?? '').toLowerCase();
  if (GREEN.has(k)) return 'paid';
  if (RED.has(k)) return 'overdue';
  if (AMBER.has(k)) return 'pending';
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
  incidents: ['customer', 'zone-specialist', 'technical-team', 'general-manager', 'commercial-department'],
  'job-orders': ['technical-team', 'general-manager', 'commercial-department'],
  materials: ['inventory-officer', 'general-manager'],
  suppliers: ['inventory-officer', 'general-manager'],
  'material-requests': ['customer', 'zone-specialist', 'technical-team', 'contractor', 'inhouse-team', 'inventory-officer', 'general-manager'],
  assets: ['technical-team', 'zone-specialist', 'contractor', 'inhouse-team', 'general-manager'],
  advisories: ['technical-team', 'general-manager'],
  payments: ['general-manager', 'commercial-department'],
};

interface ModuleProps {
  filter?: string;
  navigate?: (viewId: string) => void;
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
 * Fetches all assignable team accounts (technical-team, inhouse-team,
 * contractor) from /users/team-members in one call, then exposes them
 * split by role so the job-order form can filter by the chosen team type.
 */
function useAllTeamMembers(): {
  inhouseMembers: UserLite[];
  contractorMembers: UserLite[];
  loading: boolean;
  error: string | null;
} {
  const [all, setAll] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .get<{ data: UserLite[] }>('/users/team-members')
      .then((r) => { if (alive) setAll(r.data); })
      .catch(() => alive && setError('Could not load team accounts.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);
  const inhouseMembers  = all.filter((u) => u.role === 'inhouse-team');
  const contractorMembers = all.filter((u) => u.role === 'contractor');
  return { inhouseMembers, contractorMembers, loading, error };
}

/**
 * A styled single-select dropdown for picking a team leader.
 * Shows an avatar initial + full name per option.
 */
function LeaderSelect({
  members,
  value,
  onChange,
  placeholder = 'Select a team leader…',
}: {
  members: UserLite[];
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = members.find((m) => m.fullName === value);

  return (
    <div className="ls-wrap" ref={ref}>
      <button
        type="button"
        className={`ls-trigger${open ? ' is-open' : ''}${selected ? ' is-filled' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <span className="ls-avatar">{selected.fullName[0].toUpperCase()}</span>
            <span className="ls-name">{selected.fullName}</span>
          </>
        ) : (
          <span className="ls-placeholder">{placeholder}</span>
        )}
        <svg className="ls-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <ul className="ls-list" role="listbox">
          {members.map((m) => (
            <li
              key={m.id}
              role="option"
              aria-selected={m.fullName === value}
              className={`ls-option${m.fullName === value ? ' is-selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); onChange(m.fullName); setOpen(false); }}
            >
              <span className="ls-avatar">{m.fullName[0].toUpperCase()}</span>
              <span className="ls-name">{m.fullName}</span>
              {m.fullName === value && (
                <svg className="ls-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A styled multi-select dropdown for picking team members.
 * Shows a summary chip when closed; expands to a scrollable card list.
 */
function MembersMultiSelect({
  members,
  value,
  onChange,
  placeholder = 'Select team members…',
  leaderName = '',
}: {
  members: UserLite[];
  value: string[];
  onChange: (names: string[]) => void;
  placeholder?: string;
  leaderName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter((x) => x !== name) : [...value, name]);

  return (
    <div className="ms-wrap" ref={ref}>
      <button
        type="button"
        className={`ms-trigger${open ? ' is-open' : ''}${value.length > 0 ? ' is-filled' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {value.length > 0 ? (
          <div className="ms-chips">
            {value.slice(0, 2).map((name) => (
              <span key={name} className="ms-chip">{name}</span>
            ))}
            {value.length > 2 && <span className="ms-chip ms-chip-more">+{value.length - 2}</span>}
          </div>
        ) : (
          <span className="ls-placeholder">{placeholder}</span>
        )}
        <svg className="ls-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="ms-dropdown" role="listbox" aria-multiselectable="true">
          <p className="ms-hint">Click to select/deselect — {value.length} selected</p>
          {members.map((m) => {
            const selected = value.includes(m.fullName);
            const isLeader = leaderName && m.fullName === leaderName;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`ms-option${selected ? ' is-selected' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); toggle(m.fullName); }}
              >
                <span className="ls-avatar">{m.fullName[0].toUpperCase()}</span>
                <span className="ms-option-name">
                  {m.fullName}
                  {isLeader && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>Leader</span>
                  )}
                </span>
                <span className={`ms-tick${selected ? ' is-selected' : ''}`}>
                  {selected ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Commercial Department creates the pending work order after a complaint is resolved. */
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
  const [title, setTitle] = useState(
    incident ? `${titleCase(incident.type)} — ${String(incident.location ?? '')}`.trim().replace(/—\s*$/, '').trim() : '',
  );
  const [scope, setScope] = useState(incident ? String(incident.remarks || incident.description || '') : '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return notify('A job title is required.', 'error');
    setSaving(true);
    try {
      await resourceService.create('job-orders', {
        title: title.trim(),
        incident_ref: incident ? String(incident.ref_code ?? '') : '',
        scope: scope.trim(),
        status: 'pending',
      });
      notify('Pending job order created. The Technical Team can now assign the crew.');
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
      submitText="Create Pending Job Order"
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

      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        Team type, team name, leader, and members will be assigned by the Technical Team.
      </p>

    </Modal>
  );
}

/** Commercial Department may also raise a standalone pending work order. */
function CreateJobOrderButton({ onCreated }: { onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionButton label="Create Job Order" icon="plus-circle" onClick={() => setOpen(true)} />
      {open && (
        <JobOrderForm
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
}

/** Technical Team completes the assignment on a pending job order. */
function JobOrderAssignmentForm({
  row,
  onClose,
  onAssigned,
}: {
  row: EntityRow;
  onClose: () => void;
  onAssigned: () => Promise<void>;
}) {
  const { notify } = useToast();
  const { inhouseMembers, contractorMembers, loading, error } = useAllTeamMembers();
  const initialTeam = row.team === 'contractor' ? 'contractor' : 'in-house';
  const [teamType, setTeamType] = useState<'in-house' | 'contractor'>(initialTeam);
  const [teamName, setTeamName] = useState(String(row.team_name ?? ''));
  const [leader, setLeader] = useState(String(row.team_leader ?? ''));
  const [picked, setPicked] = useState<string[]>(
    Array.isArray(row.team_members) ? (row.team_members as string[]).map(String) : [],
  );
  const [scheduled, setScheduled] = useState(String(row.scheduled_date ?? ''));
  const [saving, setSaving] = useState(false);
  const memberPool = teamType === 'in-house' ? inhouseMembers : contractorMembers;
  const poolLabel = teamType === 'in-house' ? 'In-house Team' : 'Contractor';

  const changeType = (next: 'in-house' | 'contractor') => {
    setTeamType(next);
    setLeader('');
    setPicked([]);
  };

  const save = async () => {
    if (!teamName.trim()) return notify('Enter a team name.', 'error');
    if (!leader) return notify('Select a team leader.', 'error');
    const membersList = [leader, ...picked.filter((name) => name !== leader)];
    setSaving(true);
    try {
      await resourceService.update('job-orders', String(row.id), {
        team: teamType,
        team_name: teamName.trim(),
        team_leader: leader,
        team_members: membersList,
        assigned_to: membersList.join(', '),
        scheduled_date: scheduled,
        status: 'in_progress',
      });
      notify('Team assigned. The job order is now ongoing.');
      await onAssigned();
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not assign the team.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Assign Team — ${row.ref_code}`} open wide onClose={onClose} onSubmit={save} submitText="Assign & Start" submitting={saving}>
      <div className="form-group">
        <label>Job Order</label>
        <input value={String(row.title ?? '')} readOnly />
      </div>
      <div className="form-group">
        <label>Team Type</label>
        <select value={teamType} onChange={(e) => changeType(e.target.value as 'in-house' | 'contractor')}>
          <option value="in-house">In-house Team</option>
          <option value="contractor">Contractor</option>
        </select>
      </div>
      <div className="form-group">
        <label>Team Name</label>
        <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Alpha Crew" />
      </div>
      <div className="form-group">
        <label>Team Leader <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({poolLabel})</span></label>
        {loading ? <p>Loading accounts…</p> : error ? <p style={{ color: '#e25577' }}>{error}</p> : (
          <LeaderSelect key={teamType} members={memberPool} value={leader} onChange={setLeader} placeholder={`Select a ${poolLabel.toLowerCase()} leader…`} />
        )}
      </div>
      <div className="form-group">
        <label>Team Members <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({poolLabel} — optional)</span></label>
        {loading ? <p>Loading accounts…</p> : error ? <p style={{ color: '#e25577' }}>{error}</p> : (
          <MembersMultiSelect key={teamType} members={memberPool} value={picked} onChange={setPicked} leaderName={leader} />
        )}
      </div>
      <div className="form-group">
        <label>Scheduled Date</label>
        <input type="date" min={todayISO()} value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
      </div>
    </Modal>
  );
}

function AssignJobOrderButton({ c }: { c: RowActionCtx }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-action" onClick={() => setOpen(true)} disabled={c.busy}>Assign Team</button>
      {open && <JobOrderAssignmentForm row={c.row} onClose={() => setOpen(false)} onAssigned={c.reload} />}
    </>
  );
}

/* --------------------------------------------------------------- Incidents */
const INCIDENT_STATUS = [
  { value: 'under_verification', label: 'Under Verification' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'for_estimation', label: 'For Estimation' },
  { value: 'for_billing', label: 'For Billing' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'declined', label: 'Declined' },
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
  const hasEstimate = row.estimated_cost !== null && row.estimated_cost !== undefined && Number(row.estimated_cost) > 0;
  return (
    <>
      <p className="detail-section-title">Complaint Details</p>
      <dl className="detail-list complaint-detail-grid">
        <DetailRow label="Reference">{String(row.ref_code ?? '')}</DetailRow>
        <DetailRow label="Type">{titleCase(row.type)}</DetailRow>
        <DetailRow label="Status">{titleCase(row.status)}</DetailRow>
        <DetailRow label="Urgency">{row.urgency ? titleCase(row.urgency) : '— Not yet assessed'}</DetailRow>
        <DetailRow label="Location">{String(row.location ?? '')}</DetailRow>
        <DetailRow label="Reported By">{String(row.reported_by ?? '')}</DetailRow>
        <DetailRow label="Filed On">{dateShort(row.created_at)}</DetailRow>
        {hasEstimate && <DetailRow label="Estimated Cost">{money(row.estimated_cost)}</DetailRow>}
      </dl>
      <div className="complaint-narratives">
        <section className="complaint-note-card">
          <span>Description</span>
          <p>{String(row.description ?? '') || '—'}</p>
        </section>
        {!hideRemarks && (
          <section className="complaint-note-card is-remarks">
            <span>Zone Specialist Remarks</span>
            <p>{String(row.remarks ?? '') || 'No remarks added yet.'}</p>
          </section>
        )}
      </div>
      <ImageGallery images={row.images} />
    </>
  );
}

/**
 * Inline "Issue Bill" form shown inside the incident View modal for commercial-department.
 * Pre-fills the incident ref and shows the estimated cost for reference.
 */
function IssueBillInline({
  incident,
  onIssued,
}: {
  incident: EntityRow;
  onIssued: () => Promise<void>;
}) {
  const { notify } = useToast();
  const { stats } = useStats();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(
    Number(incident.estimated_cost ?? 0) > 0 ? String(incident.estimated_cost) : '',
  );
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState(String(incident.description ?? ''));
  const [profiles, setProfiles] = useState<EntityRow[]>([]);
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const [users, setUsers] = useState<Array<{ fullName: string; email: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if a bill already exists for this incident.
  const alreadyBilled = stats.payments.some(
    (p) => String(p.incident_ref ?? '') === String(incident.ref_code ?? ''),
  );

  const load = async () => {
    setLoading(true);
    try {
      const [pms, userResp] = await Promise.all([
        resourceService.list('payment-methods'),
        api.get<{ data: Array<{ fullName: string; email: string }> }>('/users'),
      ]);
      setProfiles(pms.filter((p) => !p.archived));
      setUsers(userResp.data);
    } catch {
      notify('Could not load payment options.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openForm = () => { setOpen(true); void load(); };
  const toggleProfile = (id: string) =>
    setProfileIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const customerName = String(incident.reported_by ?? '');
  const customer = users.find(
    (u) => u.fullName.trim().toLowerCase() === customerName.trim().toLowerCase(),
  );
  const selectedProfiles = profiles.filter((p) => profileIds.includes(String(p.id)));

  const submit = async () => {
    if (!customer?.email) { notify('No registered email found for this customer.', 'error'); return; }
    if (!(Number(amount) > 0)) { notify('Enter the billing amount.', 'error'); return; }
    if (!dueDate) { notify('Set a due date.', 'error'); return; }
    if (selectedProfiles.length === 0) { notify('Select at least one payment profile.', 'error'); return; }

    setSaving(true);
    try {
      await resourceService.create('payments', {
        customer_name: customerName,
        customer_email: customer.email,
        incident_ref: String(incident.ref_code ?? ''),
        job_order_ref: '',
        service_description: description,
        amount: Number(amount),
        due_date: dueDate,
        payment_method: selectedProfiles.map((p) => String(p.payment_method)).join(' / '),
        account_name: selectedProfiles.map((p) => String(p.account_name)).join(' / '),
        account_number: selectedProfiles.map((p) => String(p.account_number || '')).filter(Boolean).join(' / '),
        payment_qr: selectedProfiles.flatMap((p) => Array.isArray(p.payment_qr) ? p.payment_qr as string[] : []),
      });
      // Advance incident to for_billing after bill is issued.
      await resourceService.update('incidents', String(incident.id), {
        status: 'for_billing',
      });
      notify('Bill issued. Incident moved to For Billing.');
      setOpen(false);
      await onIssued();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Could not issue the bill.', 'error');
    } finally { setSaving(false); }
  };

  if (alreadyBilled) {
    return (
      <p style={{ marginTop: 14, color: 'var(--muted)', fontSize: 13 }}>
        A bill has already been issued for this complaint.
      </p>
    );
  }

  return (
    <>
      <div style={{ marginTop: 18 }}>
        <ActionButton label="Issue Bill" icon="file-text" onClick={openForm} />
      </div>
      {open && (
        <Modal
          title={`Issue Bill — ${incident.ref_code}`}
          open
          wide
          onClose={() => setOpen(false)}
          onSubmit={submit}
          submitText="Issue Bill"
          submitting={saving}
        >
          {loading ? <p className="billing-helper">Loading payment options…</p> : (
            <>
              <div className="form-group">
                <label>Incident</label>
                <input value={`${incident.ref_code} — ${String(incident.description ?? '').slice(0, 60)}`} readOnly />
              </div>
              <div className="form-group">
                <label>Customer</label>
                <input value={customerName} readOnly />
                {customer?.email
                  ? <small style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>{customer.email}</small>
                  : <small style={{ color: '#e25577', display: 'block', marginTop: 4 }}>No registered account email found.</small>}
              </div>
              {Number(incident.estimated_cost ?? 0) > 0 && (
                <div className="form-group">
                  <label>Technical Estimate</label>
                  <input value={money(incident.estimated_cost)} readOnly />
                </div>
              )}
              <div className="form-group">
                <label>Service Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Final Amount</label>
                  <div className="peso-input">
                    <span>₱</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => { const v = e.target.value; if (/^\d*(\.\d{0,2})?$/.test(v)) setAmount(v); }}
                      onKeyDown={(e) => { if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault(); }}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <input type="date" min={todayISO()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Payment Profile {profileIds.length > 0 && <span className="profile-count-badge">{profileIds.length} selected</span>}</label>
                {profiles.length === 0
                  ? <small style={{ color: '#e25577' }}>No payment profiles saved. Add one via Payment Options.</small>
                  : (
                    <div className="profile-card-list">
                      {profiles.map((p) => {
                        const selected = profileIds.includes(String(p.id));
                        return (
                          <div
                            key={String(p.id)}
                            className={`selected-payment-profile profile-card-selectable${selected ? ' profile-card-active' : ''}`}
                            onClick={() => toggleProfile(String(p.id))}
                            role="checkbox"
                            aria-checked={selected}
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleProfile(String(p.id)); } }}
                          >
                            {selected && <span className="profile-card-check" aria-hidden="true">✓</span>}
                            <div className="selected-payment-icon">
                              {Array.isArray(p.payment_qr) && p.payment_qr[0]
                                ? <img src={String(p.payment_qr[0])} alt="QR" />
                                : <span>₱</span>}
                            </div>
                            <div className="selected-payment-copy">
                              <small>{selected ? 'Selected — click to remove' : 'Click to select'}</small>
                              <strong>{String(p.name)}</strong>
                              <span>{String(p.payment_method)}</span>
                            </div>
                            <dl>
                              <div><dt>Account name</dt><dd>{String(p.account_name)}</dd></div>
                              <div><dt>Account number</dt><dd>{String(p.account_number || 'Not provided')}</dd></div>
                            </dl>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            </>
          )}
        </Modal>
      )}
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
  canEditUrgency = false,
  canEstimate = false,
  canIssueBill = false,
}: {
  c: RowActionCtx;
  canEditRemarks: boolean;
  canCreateJobOrder?: boolean;
  showCustomerBilling?: boolean;
  canEditUrgency?: boolean;
  canEstimate?: boolean;
  canIssueBill?: boolean;
}) {
  const { stats } = useStats();
  const [open, setOpen] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [urgency, setUrgency] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [saving, setSaving] = useState(false);
  const editable = canEditRemarks && !c.archived;
  const urgencyEditable = canEditUrgency && !c.archived;
  // Technical team can enter estimate only when complaint is in_progress.
  const estimateEditable = canEstimate && !c.archived && c.row.status === 'in_progress';

  const hasRemarks = String(c.row.remarks ?? '').trim() !== '';
  // A job order already exists for this incident — no second one may be created.
  const linkedJobOrder = stats.jobOrders.find(
    (j) => String(j.incident_ref ?? '') === String(c.row.ref_code ?? ''),
  );
  const hasJobOrder = Boolean(linkedJobOrder);
  // Technical Team and GM can dispatch a job order once the complaint is Resolved
  // — no zone-specialist remark required for these roles.
  // For other roles, a remark must exist first.
  const remarksOk = canCreateJobOrder || hasRemarks;
  const canDispatch = canCreateJobOrder && !c.archived && remarksOk && c.row.status === 'resolved' && !hasJobOrder;

  const afterCreate = async () => {
    setShowJobForm(false);
    setOpen(false);
    await c.reload();
  };

  const openModal = () => {
    setRemarks(String(c.row.remarks ?? ''));
    setUrgency(String(c.row.urgency ?? ''));
    setEstimatedCost(
      Number(c.row.estimated_cost ?? 0) > 0 ? String(c.row.estimated_cost) : '',
    );
    setOpen(true);
  };

  const { notify } = useToast();

  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};

      if (editable) {
        patch.remarks = remarks.trim();
        // Zone specialist: advancing from under_verification to in_progress.
        // Urgency is set separately by Commercial Department — no check needed here.
        if (c.row.status === 'under_verification') {
          patch.status = 'in_progress';
        }
      } else if (urgencyEditable) {
        if (!URGENCY.includes(urgency)) {
          notify('Please select an urgency.', 'error');
          setSaving(false);
          return;
        }
        patch.urgency = urgency;
      }

      // Technical team: saving an estimate auto-advances to for_estimation.
      if (estimateEditable) {
        const cost = Number(estimatedCost);
        if (estimatedCost.trim() !== '' && (isNaN(cost) || cost <= 0)) {
          notify('Enter a valid estimated cost greater than 0.', 'error');
          setSaving(false);
          return;
        }
        if (cost > 0) {
          patch.estimated_cost = cost;
          patch.status = 'for_estimation';
        }
      }

      if (Object.keys(patch).length > 0) await c.update(patch);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  // Show Save button if there are editable fields.
  const hasEdits = editable || urgencyEditable || estimateEditable;

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
          onSubmit={hasEdits ? save : undefined}
          submitText={estimateEditable ? 'Submit Estimate' : 'Save Changes'}
          submitting={saving}
        >
          <IncidentDetail row={c.row} hideRemarks={editable} />
          {showCustomerBilling && linkedJobOrder && (
            <>
              <p className="detail-section-title job-order-section-title">Job Order Details</p>
              <dl className="detail-list complaint-detail-grid job-order-detail-grid">
                <DetailRow label="Reference">{String(linkedJobOrder.ref_code ?? '')}</DetailRow>
                <DetailRow label="Job Title">{String(linkedJobOrder.title ?? '—')}</DetailRow>
                <DetailRow label="Status">{jobStatusLabel(linkedJobOrder.status)}</DetailRow>
                <DetailRow label="Team">{String(linkedJobOrder.team_name || titleCase(linkedJobOrder.team) || '—')}</DetailRow>
                <DetailRow label="Team Leader">{String(linkedJobOrder.team_leader ?? '—')}</DetailRow>
                <DetailRow label="Team Members">
                  {Array.isArray(linkedJobOrder.team_members)
                    ? (linkedJobOrder.team_members as string[]).join(', ') || '—'
                    : String(linkedJobOrder.assigned_to ?? '—')}
                </DetailRow>
                <DetailRow label="Scheduled Date">{dateShort(linkedJobOrder.scheduled_date)}</DetailRow>
              </dl>
              <div className="complaint-narratives job-order-narratives">
                <section className="complaint-note-card is-job-scope">
                  <span>Scope of Work</span>
                  <p>{String(linkedJobOrder.scope ?? '') || 'No scope of work provided yet.'}</p>
                </section>
              </div>
            </>
          )}
          {showCustomerBilling && !linkedJobOrder && c.row.status !== 'under_verification' && c.row.status !== 'resolved' && (
            <p style={{ marginTop: 14, color: 'var(--muted)', fontSize: 13 }}>
              No work order has been dispatched for this complaint yet.
            </p>
          )}
          {urgencyEditable && (
            <div className="form-group" style={{ marginTop: 18, marginBottom: 0 }}>
              <label>Urgency</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                required
              >
                <option value="" disabled>Select an urgency</option>
                {URGENCY.map((u) => (
                  <option key={u} value={u}>{titleCase(u)}</option>
                ))}
              </select>
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
          {/* Technical Team: estimation input — only visible when in_progress */}
          {estimateEditable && (
            <div className="form-group" style={{ marginTop: 18, marginBottom: 0 }}>
              <label>Estimated Cost</label>
              <div className="peso-input">
                <span>₱</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={estimatedCost}
                  onChange={(e) => { const v = e.target.value; if (/^\d*(\.\d{0,2})?$/.test(v)) setEstimatedCost(v); }}
                  onKeyDown={(e) => { if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault(); }}
                  placeholder="0.00"
                />
              </div>
              <small style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                Saving an estimate will automatically move this complaint to For Estimation.
              </small>
            </div>
          )}
          {/* Technical Team: estimate already submitted or wrong status hint */}
          {canEstimate && !estimateEditable && !c.archived && (
            <p style={{ marginTop: 14, color: 'var(--muted)', fontSize: 13 }}>
              {c.row.status === 'in_progress'
                ? 'Set an estimated cost above to submit for estimation.'
                : Number(c.row.estimated_cost ?? 0) > 0
                ? `Estimate of ${money(c.row.estimated_cost)} has been submitted.`
                : 'Estimation can be entered once the complaint is In Progress.'}
            </p>
          )}
          {/* Commercial Department: Issue Bill button for for_estimation incidents */}
          {canIssueBill && c.row.status === 'for_estimation' && (
            <IssueBillInline incident={c.row} onIssued={async () => { setOpen(false); await c.reload(); }} />
          )}
          {canIssueBill && c.row.status !== 'for_estimation' && c.row.status !== 'for_billing' && c.row.status !== 'resolved' && (
            <p style={{ marginTop: 14, color: 'var(--muted)', fontSize: 13 }}>
              The Issue Bill button will appear once the Technical Team submits their estimate.
            </p>
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
                : 'A job order can be created once the complaint status is set to "Resolved".'}
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
  // Urgency assessment belongs exclusively to the Commercial Department.
  const canManageUrgency = role === 'commercial-department';

  const columns: ModuleColumn[] = [
    { header: 'Ref', cell: (r) => ({ text: String(r.ref_code), strong: true }) },
    { header: 'Type', cell: (r) => titleCase(r.type) },
    { header: 'Description', cell: (r) => String(r.description ?? '') },
    { header: 'Location', cell: (r) => String(r.location ?? '—') },
    { header: 'Urgency', cell: (r) => r.urgency ? badgeCell(titleCase(r.urgency), String(r.urgency) as BadgeTone) : { text: '—' } },
    { header: 'Status', cell: (r) => statusCell(r.status) },
  ];

  const fields: ModuleField[] = [
    { name: 'type', label: 'Type', kind: 'select', optionList: INCIDENT_TYPE_OPTIONS, default: 'complaint' },
    { name: 'description', label: 'Description', kind: 'textarea', placeholder: 'Describe the concern…' },
    { name: 'location', label: 'Location', placeholder: 'e.g. Isok II Poblacion, Boac', default: user!.barangay ?? 'Isok II Poblacion, Boac', suggestionsFromRows: () => BARANGAY_SUGGESTIONS },
    ...(canManageUrgency ? [{
      name: 'urgency',
      label: 'Urgency',
      kind: 'select' as const,
      options: URGENCY,
      default: 'medium',
    }] : []),
    { name: 'images', label: 'Photos (optional)', kind: 'images', maxFiles: 5 },
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
          {manage && !c.archived && (
            <StatusSelect value={String(c.row.status)} options={INCIDENT_STATUS} disabled={c.busy} onChange={(s) => c.update({ status: s })} />
          )}
          <div className="btn-row">
            {(manage || role === 'customer') && (
              <IncidentViewButton
                c={c}
                canEditRemarks={role === 'zone-specialist'}
                canCreateJobOrder={['general-manager', 'commercial-department'].includes(role)}
                canEditUrgency={canManageUrgency}
                showCustomerBilling={role === 'customer'}
                canEstimate={role === 'technical-team'}
                canIssueBill={role === 'commercial-department'}
              />
            )}
            <EditBtn c={c} />
            <ArchiveBtn c={c} />
          </div>
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
      rowFilter={role === 'zone-specialist' ? (r) => r.urgency != null && String(r.urgency).trim() !== '' : undefined}
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
  { value: 'pending', label: 'Pending Assignment' },
  { value: 'in_progress', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];
const ASSIGNED_TEAM_STATUS = JOB_STATUS.filter((status) => ['in_progress', 'completed', 'cancelled'].includes(status.value));
const jobStatusLabel = (value: unknown): string =>
  JOB_STATUS.find((status) => status.value === String(value ?? ''))?.label ?? titleCase(value);

/** Full job-order detail incl. the linked complaint + zone-specialist remarks. */
function JobOrderDetail({ row }: { row: EntityRow }) {
  const { stats } = useStats();
  const incident = stats.incidents.find((i) => String(i.ref_code) === String(row.incident_ref));
  return (
    <>
      <p className="detail-section-title">Job Order Details</p>
      <dl className="detail-list complaint-detail-grid job-order-detail-grid">
        <DetailRow label="Reference">{String(row.ref_code ?? '')}</DetailRow>
        <DetailRow label="Title">{String(row.title ?? '')}</DetailRow>
        <DetailRow label="Status">{jobStatusLabel(row.status)}</DetailRow>
        <DetailRow label="Team">{titleCase(row.team)}</DetailRow>
        <DetailRow label="Team Name">{String(row.team_name ?? '')}</DetailRow>
        <DetailRow label="Team Leader">{String(row.team_leader ?? '')}</DetailRow>
        <DetailRow label="Team Members">
          {Array.isArray(row.team_members) ? (row.team_members as string[]).join(', ') : String(row.assigned_to ?? '')}
        </DetailRow>
        <DetailRow label="Scheduled">{dateShort(row.scheduled_date)}</DetailRow>
        <DetailRow label="Linked Complaint">{String(row.incident_ref ?? '')}</DetailRow>
      </dl>
      <div className="complaint-narratives job-order-narratives">
        <section className="complaint-note-card is-job-scope">
          <span>Scope of Work</span>
          <p>{String(row.scope ?? '') || 'No scope of work provided yet.'}</p>
        </section>
      </div>

      {incident ? (
        <>
          <p className="detail-section-title job-order-section-title">Linked Complaint Details</p>
          <dl className="detail-list complaint-detail-grid">
            <DetailRow label="Reference">{String(incident.ref_code ?? '')}</DetailRow>
            <DetailRow label="Type">{titleCase(incident.type)}</DetailRow>
            <DetailRow label="Urgency">{titleCase(incident.urgency)}</DetailRow>
            <DetailRow label="Location">{String(incident.location ?? '')}</DetailRow>
            <DetailRow label="Requested By">{String(incident.reported_by ?? '')}</DetailRow>
          </dl>
          <div className="complaint-narratives">
            <section className="complaint-note-card">
              <span>Description</span>
              <p>{String(incident.description ?? '') || '—'}</p>
            </section>
            <section className="complaint-note-card is-remarks">
              <span>Zone Specialist Remarks</span>
              <p>{String(incident.remarks ?? '') || 'No remarks added yet.'}</p>
            </section>
          </div>
          <ImageGallery images={incident.images} />
        </>
      ) : row.incident_ref ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Linked complaint {String(row.incident_ref)} not found.</p>
      ) : null}
    </>
  );
}

type ReturnQuality = 'good' | 'fair' | 'damaged';

interface ReturnRow {
  id: string;
  sku: string;
  name: string;
  released: number;
  alreadyLogged: number;   // total qty already logged (returned + discarded) in previous submissions
  remaining: number;       // released - alreadyLogged — the true max for this submission
  unit: string;
  returnQty: string;
  quality: ReturnQuality;
  isUsable: boolean;
}

/**
 * Modal for logging leftover materials after a completed job order.
 * - Fetches released MRF rows fresh from the API (never stale).
 * - Only shows items linked to an inventory SKU (custom/unnamed materials excluded).
 * - Qty is hard-capped to the released amount on every keystroke.
 * - Writes one audit-log entry per item on submit.
 * - Usable items are added back to inventory; damaged/unusable are logged only.
 */
function MaterialReturnModal({
  jobOrderRef,
  onClose,
  onDone,
}: {
  jobOrderRef: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { user } = useAuth();
  const { notify } = useToast();

  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      resourceService.list('material-requests'),
      resourceService.list('materials'),
      resourceService.list('audit-logs'),
    ])
      .then(([mrfs, materials, auditLogs]) => {
        if (!alive) return;
        const ref = jobOrderRef.trim().toUpperCase();

        // Sum previously logged qty per SKU for this job order
        const loggedQtyBySku: Record<string, number> = {};
        auditLogs
          .filter((l) => l.action === 'leftover_log' || l.entity === 'materials')
          .forEach((l) => {
            const d = (l.details ?? {}) as Record<string, unknown>;
            const loggedJobRef = String(d.job_order_ref ?? d.returned_from_job_order ?? '').trim().toUpperCase();
            if (loggedJobRef !== ref) return;
            const sku = String(d.material_sku ?? d.sku ?? '').trim();
            if (!sku) return;
            loggedQtyBySku[sku] = (loggedQtyBySku[sku] ?? 0) + Number(d.qty_leftover ?? d.returned_quantity ?? 0);
          });

        const linked = mrfs.filter((r) => {
          if (String(r.job_order_ref ?? '').trim().toUpperCase() !== ref) return false;
          if (String(r.status ?? '') !== 'released') return false;
          const rt = String(r.request_type ?? '').trim().toLowerCase();
          if (rt !== '' && rt !== 'mrf') return false;
          const sku = String(r.material_sku ?? '').trim();
          if (!sku) return false;
          return materials.some((m) => String(m.sku ?? '').trim() === sku);
        });

        setRows(linked.map((r) => {
          const sku = String(r.material_sku ?? '').trim();
          const mat = materials.find((m) => String(m.sku ?? '').trim() === sku);
          const released = Number(r.quantity ?? 0);
          const alreadyLogged = loggedQtyBySku[sku] ?? 0;
          const remaining = Math.max(0, released - alreadyLogged);
          return {
            id: String(r.id),
            sku,
            name: String(r.material_name ?? (sku || 'Unknown')),
            released,
            alreadyLogged,
            remaining,
            unit: String(r.unit ?? mat?.unit ?? 'units'),
            returnQty: '',
            quality: 'good' as ReturnQuality,
            isUsable: true,
          };
        }));
      })
      .catch(() => alive && notify('Could not load released materials.', 'error'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [jobOrderRef]);

  const setRow = <K extends keyof ReturnRow>(id: string, field: K, value: ReturnRow[K]) =>
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));

  const handleQtyChange = (id: string, raw: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed) && parsed > row.remaining) {
      setRow(id, 'returnQty', String(row.remaining));
    } else {
      setRow(id, 'returnQty', raw);
    }
  };

  const setQuality = (id: string, quality: ReturnQuality) =>
    setRows((prev) => prev.map((r) =>
      r.id === id ? { ...r, quality, isUsable: quality !== 'damaged' } : r,
    ));

  const save = async () => {
    const active = rows.filter((r) => Number(r.returnQty) > 0);
    if (active.length === 0) {
      notify('Enter a leftover quantity for at least one item.', 'error');
      return;
    }
    // Guard: never log more than the remaining (released − already logged) per item
    const overLimitItem = active.find((r) => Number(r.returnQty) > r.remaining);
    if (overLimitItem) {
      notify(`Qty for "${overLimitItem.name}" exceeds the remaining ${overLimitItem.remaining} ${overLimitItem.unit}.`, 'error');
      return;
    }

    setSaving(true);
    try {
      const allMaterials = await resourceService.list('materials');
      const actor = user!.fullName;
      const actorRole = user!.role;

      for (const item of active) {
        const qty = Number(item.returnQty);
        const status = item.isUsable ? 'returned' : 'discarded';

        // Restock inventory only for usable items.
        // The backend automatically writes a materials/update audit log entry
        // (action:'update', movement_type:'stock_in') when we update the quantity,
        // so we must NOT also write a leftover_log for usable items — that would
        // produce a duplicate row in Inventory History.
        if (item.isUsable) {
          const mat = allMaterials.find((m) => String(m.sku ?? '').trim() === item.sku);
          if (mat) {
            const isFieldTeam = ['contractor', 'inhouse-team'].includes(user!.role);
            await resourceService.update('materials', String(mat.id), isFieldTeam
              ? { return_job_order_ref: jobOrderRef, return_quantity: qty }
              : { quantity: Number(mat.quantity ?? 0) + qty });
          } else {
            notify(`${item.sku} not found — skipped restocking.`, 'error');
          }
          // No leftover_log here — the backend's automatic stock_in audit covers it.
        } else {
          // Discarded items have no inventory change, so no automatic backend log.
          // Write the leftover_log so the discard is recorded in Inventory History.
          await resourceService.create('audit-logs', {
            entity: 'material-requests',
            entity_id: item.id,
            action: 'leftover_log',
            actor,
            actor_role: actorRole,
            details: {
              description: `${actor} discarded ${qty} ${item.unit} of "${item.name}" (${item.sku}) — condition: ${item.quality}`,
              job_order_ref: jobOrderRef,
              material_name: item.name,
              material_sku: item.sku,
              qty_leftover: qty,
              unit: item.unit,
              condition: item.quality,
              leftover_status: status,
              restocked: false,
            },
          });
        }
      }

      const restocked = active.filter((r) => r.isUsable).length;
      const discarded = active.filter((r) => !r.isUsable).length;
      const parts: string[] = [];
      if (restocked > 0) parts.push(`${restocked} item(s) returned to inventory`);
      if (discarded > 0) parts.push(`${discarded} item(s) logged as discarded`);
      notify(parts.join(', ') + '.');

      await onDone();
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not submit leftover log.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const qualityOptions: { value: ReturnQuality; label: string; cls: string }[] = [
    { value: 'good',    label: 'Good',    cls: 'is-good' },
    { value: 'fair',    label: 'Fair',    cls: 'is-fair' },
    { value: 'damaged', label: 'Damaged', cls: 'is-damaged' },
  ];

  return (
    <Modal
      title="Log Leftover Materials"
      open
      wide
      onClose={onClose}
      onSubmit={rows.length > 0 ? save : undefined}
      submitText="Submit Leftover Log"
      submitting={saving}
    >
      <p style={{ margin: '0 0 20px', color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
        Rate the condition of each leftover item. <strong>Usable</strong> items will be restocked.
      </p>

      {loading ? (
        <p style={{ color: 'var(--muted)', padding: '8px 0' }}>Loading released materials…</p>
      ) : rows.length === 0 ? (
        <div className="return-empty-state">
          <p>No inventory materials were released for <strong>{jobOrderRef}</strong>.</p>
          <small>Only MRF items with an inventory SKU that have been released appear here.</small>
        </div>
      ) : (
        <div className="return-materials-list">
          {rows.map((r) => {
            const qty = Number(r.returnQty);
            const hasQty = qty > 0;
            const overLimit = qty > r.remaining;
            const fullyLogged = r.remaining === 0;
            return (
              <div
                key={r.id}
                className={`return-material-card${hasQty && !overLimit ? (r.isUsable ? ' is-restock' : ' is-discard') : ''}${fullyLogged ? ' is-fully-logged' : ''}`}
              >
                {/* Header */}
                <div className="return-card-header">
                  <div className="return-card-identity">
                    <span className="combobox-sku">{r.sku}</span>
                    <span className="return-card-name">{r.name}</span>
                  </div>
                  <div className="return-card-badges">
                    <span className="return-card-badge">
                      Released: <strong>{r.released} {r.unit}</strong>
                    </span>
                    {r.alreadyLogged > 0 && (
                      <span className="return-card-badge is-logged">
                        Already Logged: <strong>{r.alreadyLogged} {r.unit}</strong>
                      </span>
                    )}
                    <span className={`return-card-badge${r.remaining === 0 ? ' is-zero' : ' is-remaining'}`}>
                      Remaining: <strong>{r.remaining} {r.unit}</strong>
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="return-card-body">

                  {/* Qty Leftover */}
                  <div className="return-qty-row">
                    <label>Qty Leftover</label>
                    <div className={`return-qty-input-wrap${overLimit ? ' is-over' : ''}`}>
                      <input
                        type="number"
                        min="0"
                        max={r.remaining}
                        step="any"
                        placeholder="0"
                        disabled={fullyLogged}
                        value={r.returnQty}
                        onChange={(e) => handleQtyChange(r.id, e.target.value)}
                      />
                      <span className="return-qty-unit">{r.unit}</span>
                    </div>
                    {fullyLogged
                      ? <span className="return-qty-hint is-done">All previously logged</span>
                      : overLimit
                      ? <span className="return-qty-error">Cannot exceed {r.remaining} {r.unit}</span>
                      : <span className="return-qty-hint">Max: {r.remaining} {r.unit}</span>
                    }
                  </div>

                  {/* Condition + Return to Inventory */}
                  <div className="return-toggles-row">
                    <div className="return-toggle-group">
                      <label>Condition</label>
                      <div className="return-quality-toggle">
                        {qualityOptions.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className={`return-quality-btn${r.quality === opt.value ? ` ${opt.cls}` : ''}`}
                            onClick={() => setQuality(r.id, opt.value)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="return-toggle-group">
                      <label>Return to Inventory?</label>
                      <div className="return-usable-toggle">
                        <button
                          type="button"
                          className={`return-usable-btn${r.isUsable ? ' is-yes' : ''}`}
                          onClick={() => setRow(r.id, 'isUsable', true)}
                        >
                          ✓ Yes
                        </button>
                        <button
                          type="button"
                          className={`return-usable-btn${!r.isUsable ? ' is-no' : ''}`}
                          onClick={() => setRow(r.id, 'isUsable', false)}
                        >
                          ✕ No
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Outcome strip */}
                  {hasQty && !overLimit && (
                    <div className={`return-card-outcome${r.isUsable ? ' is-restock' : ' is-discard'}`}>
                      {r.isUsable
                        ? `✓ ${qty} ${r.unit} of "${r.name}" (${r.quality}) will be returned to inventory`
                        : `✕ ${qty} ${r.unit} of "${r.name}" (${r.quality}) will be logged as discarded`}
                    </div>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/**
 * "View" action for a job order. Shows the full detail and — for anyone who can
 * file material requests (technical team, inventory, GM) — a "Request Materials"
 * button that opens the shared MRF modal pre-linked to this job order.
 */
function JobOrderViewButton({ row, onReload }: { row: EntityRow; onReload: () => Promise<void> }) {
  const { user } = useAuth();
  const role = user!.role;
  const isGM = role === 'general-manager';
  // A user is the team leader of this specific job order when their name matches.
  const isLeader = String(row.team_leader ?? '').toLowerCase() === user!.fullName.toLowerCase();
  // For contractor/inhouse-team/technical-team: only the team leader of this job
  // order may request materials. GM can always request.
  const canRequest = isGM
    ? WRITE['material-requests'].includes(role)
    : WRITE['material-requests'].includes(role) && isLeader;
  const isActive = ['pending', 'in_progress'].includes(String(row.status));
  const isCompleted = String(row.status) === 'completed';
  const canReturn = isCompleted && (isGM || isLeader);

  const [open, setOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  return (
    <>
      <button className="btn-action" onClick={() => setOpen(true)}>
        View
      </button>
      {open && (
        <Modal title={`Job Order ${row.ref_code}`} open wide onClose={() => setOpen(false)} closeText="Close">
          <JobOrderDetail row={row} />
          {canRequest && isActive && (
            <div style={{ marginTop: 18 }}>
              <ActionButton label="Request Materials" icon="hammer" onClick={() => setReqOpen(true)} />
            </div>
          )}
          {canReturn && (
            <div style={{ marginTop: 12 }}>
              <ActionButton
                label="Log Leftovers"
                icon="package"
                onClick={() => setReturnOpen(true)}
              />
            </div>
          )}
        </Modal>
      )}
      {reqOpen && (
        <RequestForm
          lockedJobOrderRef={String(row.ref_code)}
          onClose={() => setReqOpen(false)}
          onCreated={onReload}
        />
      )}
      {returnOpen && (
        <MaterialReturnModal
          jobOrderRef={String(row.ref_code)}
          onClose={() => setReturnOpen(false)}
          onDone={onReload}
        />
      )}
    </>
  );
}

export function JobOrdersModule({ filter, readOnly = false, title }: ModuleProps & { readOnly?: boolean; title?: string }) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = !readOnly && WRITE['job-orders'].includes(role);
  const isTechTeam = role === 'technical-team';
  const isCommercial = role === 'commercial-department';
  const isContractor = role === 'contractor';
  const isInhouseTeam = role === 'inhouse-team';
  // Contractors and in-house team members only see job orders assigned to them.
  // Technical-team and managers see everything.
  const me = user!.fullName.toLowerCase();
  const rowFilter =
    isContractor || isInhouseTeam
      ? (r: EntityRow) => {
          const members = Array.isArray(r.team_members)
            ? (r.team_members as string[]).map((s) => String(s).toLowerCase())
            : [];
          const assigned = String(r.assigned_to ?? '').toLowerCase();
          return members.includes(me) || assigned.includes(me);
        }
      : undefined;

  const columns: ModuleColumn[] = [
    { header: 'Ref', cell: (r) => ({ text: String(r.ref_code), strong: true }) },
    { header: 'Title', cell: (r) => String(r.title ?? '') },
    { header: 'Team', cell: (r) => String(r.team_name || titleCase(r.team) || '—') },
    { header: 'Assigned To', cell: (r) => String(r.assigned_to ?? '—') },
    { header: 'Schedule', cell: (r) => dateShort(r.scheduled_date) },
    { header: 'Status', cell: (r) => ({ text: jobStatusLabel(r.status), status: statusTone(r.status) }) },
  ];

  const fields: ModuleField[] = [
    { name: 'title', label: 'Title', placeholder: 'e.g. Repair main line leak' },
    { name: 'incident_ref', label: 'Linked Incident Ref', placeholder: 'INC-XXXX (optional)' },
    { name: 'scope', label: 'Scope of Work', kind: 'textarea' },
    { name: 'team', label: 'Team', kind: 'select', optionList: [{ value: 'in-house', label: 'In-house Team' }, { value: 'contractor', label: 'Contractor' }] },
    { name: 'assigned_to', label: 'Assigned To', placeholder: 'Crew or contractor name' },
    { name: 'scheduled_date', label: 'Scheduled Date', kind: 'date' },
    { name: 'status', label: 'Status', kind: 'select', optionList: JOB_STATUS },
  ];

  // View button: full detail + "Request Materials" for all roles.
  const viewAction = (c: RowActionCtx) => <JobOrderViewButton row={c.row} onReload={c.reload} />;

  /** Technical Team assigns pending work orders; assigned crew leaders own later status updates. */
  const techTeamActions = (c: RowActionCtx) => {
    return (
      <div className="btn-row">
        {viewAction(c)}
        {!c.archived && String(c.row.status) === 'pending' && <AssignJobOrderButton c={c} />}
      </div>
    );
  };

  /**
   * Contractor / In-house team: if the logged-in user is the team leader of this
   * specific job order they can update the status; otherwise view only.
   */
  const contractorActions = (c: RowActionCtx) => {
    const isLeaderOfRow =
      String(c.row.team_leader ?? '').toLowerCase() === me;
    return (
      <>
        {!c.archived && isLeaderOfRow && (
          <StatusSelect
            value={String(c.row.status)}
            options={ASSIGNED_TEAM_STATUS}
            disabled={c.busy}
            onChange={(s) => c.update({ status: s })}
          />
        )}
        <div className="btn-row">
          {viewAction(c)}
        </div>
      </>
    );
  };

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
      actionLabel="Action"
      archivable={canWrite && !isContractor && !isInhouseTeam}
      renderCreate={({ reload }) => (
        isCommercial ? <CreateJobOrderButton onCreated={reload} /> : null
      )}
      metrics={(rows) => [
        metric('j1', 'Total Job Orders', String(rows.length), 'clipboard-list', 'customers'),
        metric('j2', 'Ongoing', count(rows, (r) => r.status === 'in_progress'), 'wrench', 'revenue'),
        metric('j3', 'Pending Assignment', count(rows, (r) => r.status === 'pending'), 'clock', 'profit'),
        metric('j4', 'Completed', count(rows, (r) => r.status === 'completed'), 'check-circle', 'invoices'),
      ]}
      actions={
        isContractor || isInhouseTeam
          ? contractorActions
          : isTechTeam
          ? techTeamActions
          : canWrite
          ? (c) => (
              <>
                {!c.archived && !isCommercial && (
                  <StatusSelect
                    value={String(c.row.status)}
                    options={JOB_STATUS}
                    disabled={c.busy}
                    onChange={(s) => c.update({ status: s })}
                  />
                )}
                <div className="btn-row">
                  {viewAction(c)}
                  {!isCommercial && <EditBtn c={c} />}
                  <ArchiveBtn c={c} />
                </div>
              </>
            )
          : viewAction
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
  const supplierOptions = useSupplierOptions();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [supplierId, setSupplierId] = useState(String(c.row.supplier_id ?? ''));
  const [saving, setSaving] = useState(false);
  const current = Number(c.row.quantity ?? 0);
  const added = Number(amount || 0);
  const unit = String(c.row.unit ?? 'units');

  const close = () => {
    if (saving) return;
    setOpen(false);
    setAmount('');
    setSupplierId(String(c.row.supplier_id ?? ''));
  };

  const save = async () => {
    if (!Number.isFinite(added) || added <= 0) {
      notify('Enter a restock quantity greater than zero.', 'error');
      return;
    }
    const supplier = supplierOptions.find((option) => option.value === supplierId);
    if (!supplier) {
      notify('Select the supplier this stock came from.', 'error');
      return;
    }
    setSaving(true);
    try {
      await resourceService.update('materials', c.row.id, {
        quantity: current + added,
        supplier_id: supplier.value,
        supplier: supplier.label,
        source: 'external',
      });
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
        <div className="form-group">
          <label htmlFor={`restock-supplier-${c.row.id}`}>Supplier</label>
          <select id={`restock-supplier-${c.row.id}`} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">Select supplier</option>
            {supplierOptions.map((supplier) => <option key={supplier.value} value={supplier.value}>{supplier.label}</option>)}
          </select>
          <small>Select where this restocked batch came from.</small>
        </div>
      </Modal>
    </>
  );
}

/** Derive a display colour from a material's own `color` field.
 *  If the value is a valid CSS colour (e.g. "blue", "#ff0000") it is used as-is.
 *  Otherwise the text is hashed to a stable hue so any string produces a colour. */
function materialColor(colorField: unknown): string | undefined {
  const raw = String(colorField ?? '').trim();
  if (!raw) return undefined;
  return categoryColor(raw, raw); // use raw as both seed and explicit — handles css names + free text
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
          // Standard material stock movements
          if (row.entity === 'materials') {
            const details = (row.details ?? {}) as Record<string, unknown>;
            return row.action === 'stock_movement' || row.action === 'create' ||
              (row.action === 'update' && ('quantity_change' in details || 'quantity' in details));
          }
          // Leftover log entries (entity = material-requests, action = leftover_log)
          if (row.action === 'leftover_log') return true;
          return false;
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

      // ── Leftover log entries ──────────────────────────────────────────
      if (row.action === 'leftover_log') {
        const qty    = Number(details.qty_leftover ?? 0);
        const unit   = String(details.unit ?? '').trim();
        const status = String(details.leftover_status ?? 'discarded');
        const restocked = details.restocked === true;
        const movLabel  = restocked ? 'Returned' : 'Discarded';
        const when = row.created_at ? new Date(String(row.created_at)) : null;
        const timestamp = when && !Number.isNaN(when.getTime())
          ? when.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
          : '—';
        return {
          id: String(row.id),
          cells: [
            { text: timestamp },
            { text: String(details.material_name ?? details.material_sku ?? 'Unknown'), strong: true },
            { text: movLabel, badge: (restocked ? 'low' : 'high') as BadgeTone },
            { text: restocked ? `+${qty}${unit ? ` ${unit}` : ''}` : `${qty}${unit ? ` ${unit}` : ''}`, strong: true },
            { text: '—' },
            { text: '—' },
            { text: `JO: ${String(details.job_order_ref ?? '—')} · ${titleCase(status)}` },
            { text: String(row.actor ?? titleCase(row.actor_role ?? 'System')) },
          ],
        };
      }

      // ── Standard material stock movements ────────────────────────────
      const previous = details.previous_quantity;
      const next = details.new_quantity ?? details.quantity;
      const rawChange = details.quantity_change;
      const change = rawChange === undefined && previous !== undefined && next !== undefined
        ? Number(next) - Number(previous)
        : Number(rawChange ?? 0);
      const movement = String(details.movement_type ?? (row.action === 'create' ? 'initial_stock' : 'adjustment'));
      const movementLabel =
        movement === 'stock_out'     ? 'Released' :
        movement === 'initial_stock' ? 'Initial'  :
        movement === 'stock_in'      ? 'Restocked' :
        change > 0 ? 'Restocked' : change < 0 ? 'Released' : 'Adjusted';
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
          { text: movementLabel, badge: (change < 0 ? 'high' : change > 0 ? 'low' : 'medium') as BadgeTone },
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
  const [qrTarget, setQrTarget] = useState<EntityRow | null>(null);

  const columns: ModuleColumn[] = [
    { header: 'SKU', cell: (r) => ({ text: String(r.sku), strong: true }) },
    { header: 'Material', cell: (r) => {
      const mc = materialColor(r.color);
      return mc
        ? { text: String(r.name ?? ''), swatch: mc }
        : String(r.name ?? '');
    } },
    { header: 'Category', cell: (r) => ({ text: String(r.category ?? 'Uncategorized'), swatch: categoryColor(r.category) }) },
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
          color: categoryColor(category),
          hint: `${rows.filter((row) => String(row.category ?? 'Uncategorized') === category).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0)} units`,
          matches: (row: EntityRow) => String(row.category ?? 'Uncategorized') === category,
        }))}
      actions={
        (c) => (
          <>
            <button className="btn-action" title="Print QR label" onClick={() => setQrTarget(c.row)}>
              QR
            </button>
            {canWrite && (
              <div className="btn-row">
                <RestockBtn c={c} />
                <EditBtn c={c} />
                <ArchiveBtn c={c} />
              </div>
            )}
          </>
        )
      }
        />
      )}
      {qrTarget && (
        <QRLabelModal
          sku={String(qrTarget.sku ?? '')}
          name={String(qrTarget.name ?? '')}
          supplier={String(qrTarget.supplier ?? '')}
          category={String(qrTarget.category ?? '')}
          unit={String(qrTarget.unit ?? '')}
          onClose={() => setQrTarget(null)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------- Material Requests */


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
 * Unified Request create modal — handles both MRF-type requests (linked to
 * job orders / inventory SKUs, for Technical Team) and General requests
 * (informal supply requests, open to all roles including customers).
 *
 * When opened from a job order, `lockedJobOrderRef` pre-fills and locks the
 * Job Order Ref field and forces request_type to 'mrf'.
 */
function RequestForm({
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

  // MRF type is only relevant for roles that deal with inventory/job orders.
  const canUseMrf = role === 'technical-team' || role === 'inventory-officer' || role === 'general-manager';
  const defaultType = canUseMrf ? 'mrf' : 'general';

  // Only active, in-stock inventory can be requested by SKU.
  const inventory = stats.materials.filter(
    (m) => !m.archived && m.status !== 'defective' && m.status !== 'out_of_stock' && Number(m.quantity ?? 0) > 0,
  );
  // Active job orders available to link to an MRF.
  const activeJobOrders = stats.jobOrders.filter((j) =>
    ['pending', 'in_progress'].includes(String(j.status)),
  );
  const supplierOptions = useSupplierOptions();

  const [form, setForm] = useState({
    request_type: lockedJobOrderRef ? 'mrf' : defaultType,
    material_name: '',
    material_sku: '',
    quantity: '1',
    job_order_ref: lockedJobOrderRef ?? '',
    reason: '',
    // general: price info auto-filled from inventory when an item is picked
    unit_price: '',
    linked_unit: '',
    // customer general-request fulfilment fields
    payment_option: 'cash_on_delivery',
    delivery_address: user!.barangay ?? '',
    // purchase fields
    category: '',
    description: '',
    unit: 'units',
    min_level: '10',
    weight_kg: '',
    size: '',
    color: '',
    source: 'external',
    supplier_id: '',
    justification: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const isMrf = form.request_type === 'mrf';
  const isGeneral = form.request_type === 'general';
  const isPurchase = form.request_type === 'purchase';

  const save = async () => {
    if (!form.material_name.trim()) return notify('Item name is required.', 'error');
    setSaving(true);
    try {
      const base = {
        request_type: form.request_type,
        material_name: form.material_name.trim(),
        quantity: form.quantity,
        requested_by: user!.fullName,
        requested_by_id: user!.id,
      };
      const payload = isMrf
        ? { ...base, material_sku: form.material_sku, job_order_ref: form.job_order_ref }
        : isGeneral
        ? {
            ...base,
            reason: form.reason.trim(),
            // Include SKU, unit price, and total cost when an inventory item was linked.
            ...(form.material_sku ? { material_sku: form.material_sku } : {}),
            ...(Number(form.unit_price) > 0
              ? {
                  unit_price: form.unit_price,
                  total_cost: String(Number(form.quantity || 0) * Number(form.unit_price)),
                }
              : {}),
            // Customer fulfilment fields (only populated for customers; harmless for other roles).
            ...(role === 'customer'
              ? {
                  payment_option: form.payment_option,
                  delivery_address: form.delivery_address.trim(),
                }
              : {}),
          }
        : {
            // purchase
            ...base,
            category: form.category.trim(),
            description: form.description.trim(),
            unit: form.unit,
            min_level: form.min_level,
            weight_kg: form.weight_kg,
            size: form.size.trim(),
            color: form.color.trim(),
            unit_price: form.unit_price,
            total_cost: String(Number(form.quantity || 0) * Number(form.unit_price || 0)),
            source: form.source,
            supplier_id: form.source === 'external' ? form.supplier_id : null,
            supplier: form.source === 'external'
              ? supplierOptions.find((s) => s.value === form.supplier_id)?.label ?? ''
              : 'Mother Company',
            justification: form.justification.trim(),
          };

      await resourceService.create('material-requests', payload);
      notify('Request submitted successfully!');
      await onCreated();
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Something went wrong.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New Request" open onClose={onClose} onSubmit={save} submitText="Submit" submitting={saving}>
      {/* Request type switcher */}
      {canUseMrf && !lockedJobOrderRef && (
        <div className="form-group">
          <label>Request Type</label>
          <select value={form.request_type} onChange={set('request_type')}>
            <option value="mrf">Material Request Form (MRF) — linked to inventory / job order</option>
            <option value="general">General Request — informal supply request</option>
            <option value="purchase">Purchase Request — procurement with pricing &amp; supplier</option>
          </select>
        </div>
      )}

      {/* ── Item name ── */}
      <div className="form-group">
        <label>{isMrf ? 'Material' : isPurchase ? 'Material to Purchase' : 'Item Name'}</label>
        {isMrf || isGeneral ? (
          <MaterialCombobox
            inventory={inventory}
            value={{ name: form.material_name, sku: form.material_sku }}
            onChange={(next) => {
              // When an inventory item is picked, pull its unit price and unit
              // so the estimated total can be shown. Clear them on custom text.
              const picked = inventory.find((m) => String(m.sku) === next.sku);
              setForm((f) => ({
                ...f,
                material_name: next.name,
                material_sku: next.sku,
                unit_price: picked ? String(picked.unit_price ?? '') : '',
                linked_unit: picked ? String(picked.unit ?? '') : '',
              }));
            }}
          />
        ) : (
          <input
            value={form.material_name}
            onChange={(e) => setForm((f) => ({ ...f, material_name: e.target.value }))}
            placeholder={isPurchase ? 'e.g. Gate Valve 50mm' : 'What do you need?'}
          />
        )}
      </div>

      {/* ── Purchase: category + description ── */}
      {isPurchase && (
        <>
          <div className="form-group">
            <label>Category</label>
            <AutocompleteInput
              value={form.category}
              suggestions={Array.from(new Set(
                stats.materials
                  .map((m) => String(m.category ?? '').trim())
                  .filter(Boolean),
              )).sort((a, b) => a.localeCompare(b))}
              placeholder="Pipes / Valves / Meters…"
              onChange={(v) => setForm((f) => ({ ...f, category: v }))}
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={form.description} onChange={set('description')} rows={2} placeholder="Additional details" />
          </div>
        </>
      )}

      {/* ── Quantity + unit ── */}
      <div className="form-group">
        <label>Quantity</label>
        <input type="number" min={1} value={form.quantity} onChange={set('quantity')} />
      </div>
      {isPurchase && (
        <div className="form-group">
          <label>Unit</label>
          <input value={form.unit} onChange={set('unit')} placeholder="pcs / meters / kg…" />
        </div>
      )}

      {/* ── General: estimated total (shown only when an inventory item with a price is linked) ── */}
      {isGeneral && Number(form.unit_price) > 0 && (
        <div className="form-group">
          <label>Estimated Total</label>
          <input
            value={`₱ ${(Number(form.quantity || 0) * Number(form.unit_price)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
            readOnly
          />
          <small style={{ display: 'block', marginTop: 4, color: 'var(--muted)' }}>
            {Number(form.quantity || 0)} {form.linked_unit || 'unit(s)'} × ₱{Number(form.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })} per {form.linked_unit || 'unit'}
          </small>
        </div>
      )}

      {/* ── MRF: job order link ── */}
      {isMrf && (
        <div className="form-group">
          <label>Job Order Ref (optional)</label>
          {lockedJobOrderRef ? (
            <>
              <input value={form.job_order_ref} readOnly />
              <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)' }}>Linked to this job order.</small>
            </>
          ) : (
            <JobOrderCombobox
              jobOrders={activeJobOrders}
              value={form.job_order_ref}
              onChange={(ref) => setForm((f) => ({ ...f, job_order_ref: ref }))}
            />
          )}
        </div>
      )}

      {/* ── General: reason ── */}
      {isGeneral && (
        <div className="form-group">
          <label>Reason</label>
          <textarea value={form.reason} onChange={set('reason')} placeholder="Why do you need this?" rows={3} />
        </div>
      )}

      {/* ── Customer general: payment option + delivery address ── */}
      {isGeneral && role === 'customer' && (
        <>
          <div className="form-group">
            <label>Payment Option</label>
            <select value={form.payment_option} onChange={set('payment_option')}>
              <option value="cash_on_delivery">Cash on Delivery (Pay upon delivery)</option>
              <option value="gcash">GCash (Online Payment)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Delivery Address</label>
            <AddressInput
              value={form.delivery_address}
              onChange={(v) => setForm((f) => ({ ...f, delivery_address: v }))}
              variant="dashboard"
            />
            <small style={{ display: 'block', marginTop: 4, color: 'var(--muted)' }}>
              Auto-filled from your account's address. Edit if delivery is to a different location.
            </small>
          </div>
        </>
      )}

      {/* ── Purchase: specs + pricing ── */}
      {isPurchase && (
        <>
          <div className="form-group">
            <label>Minimum Stock Level</label>
            <input type="number" min={0} value={form.min_level} onChange={set('min_level')} />
            <small style={{ display: 'block', marginTop: 4, color: 'var(--muted)' }}>Minimum level to set when this item is added to inventory.</small>
          </div>
          <div className="form-group">
            <label>Weight (kg)</label>
            <input type="number" min={0} step="0.01" value={form.weight_kg} onChange={set('weight_kg')} />
          </div>
          <div className="form-group">
            <label>Size</label>
            <input value={form.size} onChange={set('size')} placeholder="e.g. 50mm, 4 inches" />
          </div>
          <div className="form-group">
            <label>Color</label>
            <input value={form.color} onChange={set('color')} placeholder="e.g. Blue, Red" />
          </div>
          <div className="form-group">
            <label>Unit Price (₱)</label>
            <input type="number" min={0} step="0.01" value={form.unit_price} onChange={set('unit_price')} />
          </div>
          <div className="form-group">
            <label>Estimated Total</label>
            <input
              value={`₱ ${(Number(form.quantity || 0) * Number(form.unit_price || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
              readOnly
            />
          </div>
          <div className="form-group">
            <label>Source</label>
            <select value={form.source} onChange={set('source')}>
              <option value="external">External Supplier</option>
              <option value="mother-company">Mother Company</option>
            </select>
          </div>
          {form.source === 'external' && (
            <div className="form-group">
              <label>Supplier</label>
              <select value={form.supplier_id} onChange={set('supplier_id')}>
                <option value="">Select supplier</option>
                {supplierOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Justification</label>
            <textarea value={form.justification} onChange={set('justification')} placeholder="Why is this purchase needed?" rows={3} />
          </div>
        </>
      )}

      {/* ── Requested by (always) ── */}
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

/** Trigger button that opens the unified Request modal. */
function RequestButton({
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
        <RequestForm
          lockedJobOrderRef={lockedJobOrderRef}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
}

// Legacy alias so Job Order inline "Request Materials" buttons still compile.
export const MaterialRequestButton = RequestButton;

const MRF_STATUS = [
  { value: 'pending', label: 'Ongoing' },
  { value: 'approved', label: 'Approved' },
  { value: 'released', label: 'Released' },
  { value: 'rejected', label: 'Rejected' },
];

const GENERAL_STATUS = [
  { value: 'pending', label: 'Ongoing' },
  { value: 'approved', label: 'Approved' },
  { value: 'released', label: 'Released' },
  { value: 'rejected', label: 'Rejected' },
];

const PURCHASE_STATUS = [
  { value: 'pending', label: 'Ongoing' },
  { value: 'approved', label: 'Approved' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'received', label: 'Received' },
  { value: 'rejected', label: 'Rejected' },
];

const requestStatusOptions = (requestType: string) =>
  requestType === 'purchase' ? PURCHASE_STATUS : requestType === 'general' ? GENERAL_STATUS : MRF_STATUS;

/**
 * Row-level component that owns the "Approve → issue bill" interaction for a
 * single general customer request. Rendered inside the actions callback so
 * each row has its own independent modal state.
 *
 * Approval workflow:
 *   Pending → Approved (GM only) → Released (Inventory Officer)
 *          ↘ Rejected  (GM only)
 */
function ApprovalBillingRow({
  c,
  canApprove,
  canRelease,
}: {
  c: RowActionCtx;
  canApprove: boolean;  // GM only — can approve or reject
  canRelease: boolean;  // Inventory Officer — can only release an already-approved request
}) {
  const { notify } = useToast();
  const t = String(c.row.request_type ?? 'mrf');
  const isCustomerGeneral = t === 'general' && String(c.row.payment_option ?? '').trim() !== '';

  const [billingOpen, setBillingOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [profileId, setProfileId] = useState('');
  const [profiles, setProfiles] = useState<EntityRow[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [saving, setSaving] = useState(false);

  const isCod = String(c.row.payment_option ?? '') === 'cash_on_delivery';

  const openBilling = () => {
    // Pre-fill defaults.
    setAmount(Number(c.row.total_cost ?? 0) > 0 ? String(c.row.total_cost) : '');
    const due = new Date();
    due.setDate(due.getDate() + 7);
    setDueDate(due.toISOString().slice(0, 10));

    if (!isCod) {
      setLoadingProfiles(true);
      resourceService
        .list('payment-methods')
        .then((rows) => {
          const active = rows.filter((p) => !p.archived);
          setProfiles(active);
          if (active[0]) setProfileId(String(active[0].id));
        })
        .catch(() => {/* non-fatal */})
        .finally(() => setLoadingProfiles(false));
    }
    setBillingOpen(true);
  };

  const handleStatusChange = (s: string) => {
    if (s === 'approved' && isCustomerGeneral && c.row.status !== 'approved') {
      // Update status first, then open billing modal.
      void c.update({ status: 'approved' }).then(openBilling);
    } else {
      void c.update({ status: s });
    }
  };

  const selectedProfile = profiles.find((p) => String(p.id) === profileId);

  const issueBill = async () => {
    if (!(Number(amount) > 0)) { notify('Enter the billing amount.', 'error'); return; }
    if (!dueDate) { notify('Set a due date.', 'error'); return; }
    if (!isCod && !selectedProfile) {
      notify('Select a GCash payment profile, or add one in Billing → Payment Information.', 'error');
      return;
    }
    setSaving(true);
    try {
      // Look up customer email (GM-only endpoint — non-fatal if it fails).
      const customerName = String(c.row.requested_by ?? '');
      let customerEmail = '';
      try {
        const r = await api.get<{ data: Array<{ fullName: string; email: string }> }>('/users');
        customerEmail = r.data.find(
          (u) => u.fullName.trim().toLowerCase() === customerName.trim().toLowerCase(),
        )?.email ?? '';
      } catch { /* ok */ }

      const paymentFields = isCod
        ? { payment_method: 'Cash on Delivery', account_name: '', account_number: '', payment_qr: [] }
        : {
            payment_method: String(selectedProfile!.payment_method ?? 'GCash'),
            account_name: String(selectedProfile!.account_name ?? ''),
            account_number: String(selectedProfile!.account_number ?? ''),
            payment_qr: selectedProfile!.payment_qr ?? [],
          };

      await resourceService.create('payments', {
        customer_name: customerName,
        customer_email: customerEmail,
        service_description: `Item Request — ${String(c.row.material_name ?? c.row.ref_code ?? '')}` +
          (Number(c.row.quantity ?? 0) > 0 ? ` × ${c.row.quantity}${c.row.unit ? ` ${c.row.unit}` : ''}` : ''),
        notes: isCod
          ? `Cash on Delivery — deliver to: ${String(c.row.delivery_address ?? '').trim() || 'address on file'}`
          : '',
        amount: Number(amount),
        due_date: dueDate,
        status: 'pending',
        ...paymentFields,
      });

      notify(`Bill issued to ${customerName || 'customer'}.`);
      await c.reload();
      setBillingOpen(false);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not create the bill.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* GM: can approve or reject (full status options) */}
      {canApprove && !c.archived && (
        <StatusSelect
          value={String(c.row.status)}
          options={requestStatusOptions(t)}
          disabled={c.busy}
          onChange={handleStatusChange}
        />
      )}
      {/* Inventory Officer: can only release a GM-approved request */}
      {!canApprove && canRelease && !c.archived && String(c.row.status) === 'approved' && (
        <StatusSelect
          value={String(c.row.status)}
          options={[
            { value: 'approved', label: 'Approved' },
            { value: 'released', label: 'Released' },
          ]}
          disabled={c.busy}
          onChange={(s) => void c.update({ status: s })}
        />
      )}

      {billingOpen && (
        <Modal
          title={`Issue Bill — ${String(c.row.ref_code ?? '')}`}
          open
          wide
          onClose={() => setBillingOpen(false)}
          onSubmit={issueBill}
          submitText="Issue Bill"
          submitting={saving}
        >
          {/* Request summary */}
          <div className="billing-customer-preview">
            <span>Customer</span>
            <strong>{String(c.row.requested_by ?? '—')}</strong>
            <small>
              {String(c.row.material_name ?? '')}
              {Number(c.row.quantity ?? 0) > 0 ? ` · ${c.row.quantity}${c.row.unit ? ` ${c.row.unit}` : ''}` : ''}
            </small>
          </div>

          {/* Payment option (read-only — set by the customer) */}
          <div className="form-group">
            <label>Customer's Payment Option</label>
            <input value={isCod ? 'Cash on Delivery' : 'GCash (Online Payment)'} readOnly />
            {isCod && String(c.row.delivery_address ?? '').trim() && (
              <small style={{ display: 'block', marginTop: 4, color: 'var(--muted)' }}>
                Delivery address: {String(c.row.delivery_address)}
              </small>
            )}
          </div>

          {/* Amount */}
          <div className="form-group">
            <label>Billing Amount (₱)</label>
            <div className="peso-input">
              <span>₱</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                placeholder="0.00"
                onChange={(e) => { if (/^\d*(\.\d{0,2})?$/.test(e.target.value)) setAmount(e.target.value); }}
                onKeyDown={(e) => { if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault(); }}
              />
            </div>
            {Number(c.row.total_cost ?? 0) > 0 && (
              <small style={{ display: 'block', marginTop: 4, color: 'var(--muted)' }}>
                Pre-filled from estimated total. Adjust if needed.
              </small>
            )}
          </div>

          {/* Due date */}
          <div className="form-group">
            <label>Due Date</label>
            <input type="date" min={todayISO()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          {/* GCash payment profile */}
          {!isCod && (
            loadingProfiles ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading payment profiles…</p>
            ) : profiles.length === 0 ? (
              <p style={{ color: '#e25577', fontSize: 13 }}>
                No GCash payment profile found. Add one in <strong>Billing → Payment Information</strong> first.
              </p>
            ) : (
              <>
                <div className="form-group">
                  <label>GCash Payment Profile</label>
                  <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                    {profiles.map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>
                        {String(p.name)} — {String(p.payment_method)}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedProfile && (
                  <div className="selected-payment-profile">
                    <div className="selected-payment-icon">
                      {Array.isArray(selectedProfile.payment_qr) && selectedProfile.payment_qr[0]
                        ? <img src={String(selectedProfile.payment_qr[0])} alt="QR" />
                        : <span>₱</span>}
                    </div>
                    <div className="selected-payment-copy">
                      <small>GCash payment destination</small>
                      <strong>{String(selectedProfile.name)}</strong>
                      <span>{String(selectedProfile.payment_method)}</span>
                    </div>
                    <dl>
                      <div><dt>Account name</dt><dd>{String(selectedProfile.account_name)}</dd></div>
                      <div><dt>Account number</dt><dd>{String(selectedProfile.account_number || 'Not provided')}</dd></div>
                    </dl>
                  </div>
                )}
              </>
            )
          )}

        </Modal>
      )}
    </>
  );
}

/**
 * Unified Requests module — MRF, General, and Purchase requests in one table.
 * Replaces MaterialRequestsModule, SupplyRequestsModule, and PurchaseRequestsModule.
 */
export function RequestsModule({ filter, title }: ModuleProps & { title?: string }) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = WRITE['material-requests'].includes(role);
  // GM only can approve or reject requests.
  const canApprove = role === 'general-manager';
  // Inventory Officer can only release requests that are already GM-approved.
  const canRelease = role === 'inventory-officer';

  // Non-GM roles see only their own requests. The General Manager sees all so
  // they can review, approve, and release requests from every department.
  const isGM = role === 'general-manager';
  const rowFilter = isGM
    ? undefined
    : role === 'inventory-officer'
    ? (row: EntityRow) =>
        String(row.request_type ?? 'mrf') === 'mrf' &&
        ['approved', 'released'].includes(String(row.status ?? ''))
    : (row: EntityRow) => {
        // Match by stored ID first; fall back to name for legacy rows.
        if (String(row.requested_by_id ?? '').trim() === user!.id) return true;
        return (
          String(row.requested_by ?? '').trim().toLowerCase() ===
          user!.fullName.trim().toLowerCase()
        );
      };

  const columns: ModuleColumn[] = [
    { header: 'Ref', cell: (r) => ({ text: String(r.ref_code), strong: true }) },
    {
      header: 'Type',
      cell: (r) => {
        const t = String(r.request_type ?? 'mrf');
        if (t === 'mrf') return 'MRF';
        if (t === 'purchase') return 'Purchase';
        return 'General';
      },
    },
    { header: 'Item', cell: (r) => String(r.material_name ?? r.material_sku ?? '') },
    {
      header: 'Qty',
      cell: (r) => `${r.quantity ?? 0}${r.unit ? ` ${r.unit}` : ''}`.trim(),
    },
    {
      header: 'Details',
      cell: (r) => {
        const t = String(r.request_type ?? 'mrf');
        if (t === 'mrf') return String(r.job_order_ref ?? '—');
        if (t === 'purchase') return String(r.total_cost ? `₱ ${Number(r.total_cost).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—');
        return String(r.reason ?? '—');
      },
    },
    { header: 'Requested By', cell: (r) => String(r.requested_by ?? '—') },
    { header: 'Status', cell: (r) => workflowStatusCell(r.status) },
  ];

  return (
    <LiveModule
      entity="material-requests"
      title={title ?? 'Requests'}
      createLabel="New Request"
      columns={columns}
      fields={[]}
      canWrite={canWrite}
      filter={filter}
      rowFilter={rowFilter}
      renderCreate={({ reload }) => <RequestButton onCreated={reload} />}
      metrics={(rows) => [
        metric('req1', 'Total Requests', String(rows.length), 'file-input', 'customers'),
        metric('req2', 'Ongoing', count(rows, (r) => r.status === 'pending'), 'clock', 'revenue'),
        metric('req3', 'Approved', count(rows, (r) => r.status === 'approved'), 'check-circle', 'profit'),
        metric('req4', 'Released / Received', count(rows, (r) => r.status === 'released' || r.status === 'received'), 'package-check', 'invoices'),
      ]}
      actions={(c) => {
        const t = String(c.row.request_type ?? 'mrf');
        return (
          <>
            <ViewAction title={`Request ${c.row.ref_code}`} wide>
              <dl className="detail-list">
                <DetailRow label="Reference">{String(c.row.ref_code ?? '')}</DetailRow>
                <DetailRow label="Type">
                  {t === 'mrf' ? 'Material Request Form (MRF)' : t === 'purchase' ? 'Purchase Request' : 'General Request'}
                </DetailRow>
                <DetailRow label="Item">{String(c.row.material_name ?? c.row.material_sku ?? '—')}</DetailRow>
                {String(c.row.material_sku ?? '') && <DetailRow label="SKU">{String(c.row.material_sku)}</DetailRow>}
                <DetailRow label="Quantity">{`${c.row.quantity ?? 0}${c.row.unit ? ` ${c.row.unit}` : ''}`}</DetailRow>
                {/* MRF fields */}
                {String(c.row.job_order_ref ?? '') && <DetailRow label="Job Order">{String(c.row.job_order_ref)}</DetailRow>}
                {/* General fields */}
                {String(c.row.reason ?? '') && <DetailRow label="Reason">{String(c.row.reason)}</DetailRow>}
                {/* General: customer fulfilment fields */}
                {t === 'general' && String(c.row.payment_option ?? '') && (
                  <DetailRow label="Payment Option">
                    {c.row.payment_option === 'cash_on_delivery' ? 'Cash on Delivery (Pay upon delivery)' : c.row.payment_option === 'gcash' ? 'GCash (Online Payment)' : String(c.row.payment_option)}
                  </DetailRow>
                )}
                {t === 'general' && String(c.row.delivery_address ?? '') && (
                  <DetailRow label="Delivery Address">{String(c.row.delivery_address)}</DetailRow>
                )}
                {/* Estimated total for general requests linked to inventory */}
                {t === 'general' && Number(c.row.total_cost ?? 0) > 0 && (
                  <DetailRow label="Estimated Total">{money(c.row.total_cost)}</DetailRow>
                )}
                {/* Purchase fields */}
                {t === 'purchase' && (<>
                  {String(c.row.category ?? '') && <DetailRow label="Category">{String(c.row.category)}</DetailRow>}
                  {String(c.row.description ?? '') && <DetailRow label="Description">{String(c.row.description)}</DetailRow>}
                  {Number(c.row.min_level ?? 0) > 0 && <DetailRow label="Min Level">{String(c.row.min_level)}</DetailRow>}
                  {Number(c.row.weight_kg ?? 0) > 0 && <DetailRow label="Weight">{`${c.row.weight_kg} kg`}</DetailRow>}
                  {String(c.row.size ?? '') && <DetailRow label="Size">{String(c.row.size)}</DetailRow>}
                  {String(c.row.color ?? '') && <DetailRow label="Color">{String(c.row.color)}</DetailRow>}
                  <DetailRow label="Unit Price">{money(c.row.unit_price)}</DetailRow>
                  <DetailRow label="Total Cost">{money(c.row.total_cost)}</DetailRow>
                  <DetailRow label="Source">{titleCase(c.row.source ?? 'external')}</DetailRow>
                  <DetailRow label="Supplier">{String(c.row.supplier ?? '—')}</DetailRow>
                  {String(c.row.justification ?? '') && <DetailRow label="Justification">{String(c.row.justification)}</DetailRow>}
                </>)}
                <DetailRow label="Requested By">{String(c.row.requested_by ?? '—')}</DetailRow>
                <DetailRow label="Status">{workflowStatusLabel(c.row.status)}</DetailRow>
                <DetailRow label="Submitted On">{dateShort(c.row.created_at)}</DetailRow>
              </dl>
            </ViewAction>
            {canWrite && (
              <>
                <ApprovalBillingRow c={c} canApprove={canApprove} canRelease={canRelease} />
                <ArchiveBtn c={c} />
              </>
            )}
          </>
        );
      }}
    />
  );
}

// Legacy aliases
export const MaterialRequestsModule = RequestsModule;
export const PurchaseRequestsModule = RequestsModule;

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
  { value: 'approved', label: 'Approved & Published' },
];
const ADVISORY_TYPE_BADGE: Record<string, BadgeTone> = { emergency: 'high', interruption: 'medium', maintenance: 'low' };

/** Advisory type labels for display inside the view modal. */
const ADVISORY_TYPE_LABEL: Record<string, string> = {
  maintenance: 'Scheduled Maintenance',
  interruption: 'Service Interruption',
  emergency: 'Emergency',
};

/**
 * Read-only modal that shows the full advisory details and lets the
 * Commercial Department share it directly to Facebook.
 */
function ViewAdvisoryModal({ row, onClose }: { row: EntityRow; onClose: () => void }) {
  const { notify } = useToast();
  const typeLabel = ADVISORY_TYPE_LABEL[String(row.type)] ?? titleCase(row.type);
  const typeEmoji =
    row.type === 'emergency' ? '🚨' : row.type === 'interruption' ? '⚠️' : '🔧';
  const [copied, setCopied] = useState(false);

  /**
   * Build the Facebook post text — bilingual (Filipino + English), structured.
   *
   * Format:
   *   [emoji] [TYPE] — SERVICE ADVISORY
   *   Maynilad Water Services – Boac, Marinduque
   *
   *   📢 [Title]
   *   📍 Affected Area: [area]
   *   📅 Date Issued: [date]
   *
   *   [body]
   *
   *   Para sa mga katanungan...
   *   #MayniladBoac #ServiceAdvisory #[Type]
   */
  const buildPostText = (): string => {
    const dateIssued = new Date(
      String(row.published_at ?? row.created_at),
    ).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

    const typeTag = String(row.type ?? '').replace(/[^a-zA-Z]/g, '');
    const tag = typeTag.charAt(0).toUpperCase() + typeTag.slice(1);

    return [
      `${typeEmoji} ${typeLabel.toUpperCase()} — SERVICE ADVISORY`,
      `Maynilad Water Services – Boac, Marinduque`,
      ``,
      `📢 ${String(row.title)}`,
      `📍 Affected Area: ${String(row.area ?? 'To be announced')}`,
      `📅 Date Issued: ${dateIssued}`,
      ``,
      String(row.body ?? ''),
      ``,
      `Nais naming ipaabot ang aming paghingi ng paumanhin para sa abot-kamay na abala.`,
      `We apologize for any inconvenience this may cause.`,
      ``,
      `Para sa mga katanungan, makipag-ugnayan sa aming opisina.`,
      `For inquiries, please contact our office.`,
      ``,
      `#MayniladBoac #ServiceAdvisory #${tag}`,
    ].join('\n');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildPostText());
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      notify('Hindi ma-kopya ang text. I-copy mo manually mula sa preview.', 'error');
    }
  };

  const postText = buildPostText();

  return (
    <Modal
      title="Service Advisory"
      open
      wide
      onClose={onClose}
    >
      {/* Type + Status banner */}
      <div className={`adv-modal-banner adv-modal-banner--${String(row.type)}`}>
        <span className="adv-modal-banner-emoji">{typeEmoji}</span>
        <div>
          <p className="adv-modal-banner-type">{typeLabel}</p>
          <p className="adv-modal-banner-status">
            {row.status === 'published' ? 'Published' : 'Approved & Published'}
          </p>
        </div>
      </div>

      {/* Details grid */}
      <dl>
        <div className="detail-row">
          <dt>Title</dt>
          <dd className="adv-modal-title">{String(row.title)}</dd>
        </div>
        <div className="detail-row">
          <dt>Affected Area</dt>
          <dd>{String(row.area ?? '—')}</dd>
        </div>
        <div className="detail-row">
          <dt>Date Issued</dt>
          <dd>{dateShort(row.published_at ?? row.created_at)}</dd>
        </div>
        <div className="detail-row">
          <dt>Details</dt>
          <dd className="adv-modal-body-text">{String(row.body ?? '—')}</dd>
        </div>
      </dl>

      {/* Post preview */}
      <div className="adv-modal-preview">
        <div className="adv-modal-preview-header">
          <span className="adv-modal-preview-label">Post Preview</span>
          <span className="adv-modal-preview-hint">Ready to paste on Facebook</span>
        </div>
        <pre className="adv-modal-preview-text">{postText}</pre>
      </div>

      {/* Copy button */}
      <button
        type="button"
        className={`adv-modal-copy-btn${copied ? ' is-copied' : ''}`}
        onClick={handleCopy}
      >
        {copied ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            Nakopya! I-paste na sa Facebook
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy Post Text
          </>
        )}
      </button>
    </Modal>
  );
}

export function AdvisoriesModule({ filter, readOnly = false, title }: ModuleProps & { readOnly?: boolean; title?: string }) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = !readOnly && WRITE.advisories.includes(role);
  // Only the General Manager can approve/publish advisories.
  // Technical-team can only create (always draft) and edit content — no status control.
  const canApprove = role === 'general-manager';
  // Commercial Department can view approved/published advisories and share them.
  const isCommercial = role === 'commercial-department';

  const [viewRow, setViewRow] = useState<EntityRow | null>(null);

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
    // GM can set status on create; technical-team always creates as draft (field hidden).
    ...(canApprove ? [{ name: 'status', label: 'Status', kind: 'select' as const, optionList: ADVISORY_STATUS }] : []),
  ];

  /** Whether a row is approved/published — only these get the View button. */
  const isPublished = (row: EntityRow) =>
    row.status === 'approved' || row.status === 'published';

  return (
    <>
      <LiveModule
        entity="advisories"
        title={title ?? 'Service Advisory Management'}
        createLabel="Create Advisory"
        columns={columns}
        fields={fields}
        // Technical-team always creates as draft regardless of what the form sends.
        prepareValues={!canApprove ? (values) => ({ ...values, status: 'draft' }) : undefined}
        canWrite={canWrite}
        filter={filter}
        rowFilter={readOnly ? (r) => isPublished(r) : undefined}
        actions={
          canWrite || isCommercial
            ? (c) => (
                <>
                  {/* Only GM sees the approve/publish dropdown */}
                  {canApprove && !c.archived && (
                    <StatusSelect
                      value={String(c.row.status)}
                      options={ADVISORY_STATUS}
                      disabled={c.busy}
                      onChange={(s) => c.update({ status: s })}
                    />
                  )}
                  {/* View button — shown to Commercial Department for approved/published advisories */}
                  {isCommercial && isPublished(c.row) && (
                    <button
                      className="btn-action btn-view"
                      disabled={c.busy}
                      onClick={() => setViewRow(c.row)}
                    >
                      View
                    </button>
                  )}
                  {canWrite && <EditBtn c={c} />}
                  {canWrite && <ArchiveBtn c={c} />}
                </>
              )
            : undefined
        }
      />

      {/* View Advisory modal — shown when a row is selected */}
      {viewRow && (
        <ViewAdvisoryModal row={viewRow} onClose={() => setViewRow(null)} />
      )}
    </>
  );
}

/* ----------------------------------------------------- Users (admin only) */

/** Default job level titles per role — what someone holds when first assigned. */
const JOB_LEVEL_DEFAULTS: Record<string, string[]> = {
  'zone-specialist':   ['Junior Zone Specialist', 'Senior Zone Specialist'],
  'technical-team':    ['Junior Technician', 'Senior Technician'],
  'inventory-officer': ['Junior Inventory Officer', 'Senior Inventory Officer'],
  'contractor':        ['Junior Contractor', 'Senior Contractor'],
  'inhouse-team':      ['Junior In-house Technician', 'Senior In-house Technician'],
  'general-manager':   ['General Manager'],
};

/** Roles that can have a job level (customers and GMs are excluded from manual editing). */
const JOB_LEVEL_ROLES = new Set(['zone-specialist', 'technical-team', 'inventory-officer', 'contractor', 'inhouse-team']);

interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  jobLevel?: string | null;
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
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Job-level edit modal state
  const [jobLevelTarget, setJobLevelTarget] = useState<UserRow | null>(null);
  const [jobLevelValue, setJobLevelValue] = useState('');
  const [savingJobLevel, setSavingJobLevel] = useState(false);

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

  const openJobLevelModal = (u: UserRow) => {
    setJobLevelTarget(u);
    setJobLevelValue(u.jobLevel ?? JOB_LEVEL_DEFAULTS[u.role]?.[0] ?? '');
  };

  const saveJobLevel = async () => {
    if (!jobLevelTarget || !jobLevelValue.trim()) return;
    setSavingJobLevel(true);
    try {
      await api.patch(`/users/${jobLevelTarget.id}/job-level`, { jobLevel: jobLevelValue.trim() });
      notify(`Job level updated to "${jobLevelValue.trim()}".`);
      setJobLevelTarget(null);
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not update job level.', 'error');
    } finally {
      setSavingJobLevel(false);
    }
  };

  const roleOptions = ROLES.map((r) => ({ value: r.value, label: r.label }));

  const openCreateUser = () => {
    setForm({ ...BLANK_USER, password: DEFAULT_TEMPORARY_PASSWORD });
    setShowTemporaryPassword(false);
    setOpen(true);
  };

  const closeCreateUser = () => {
    setOpen(false);
    setShowTemporaryPassword(false);
  };

  // Roles that actually appear in the user list (excluding customer for the filter bar)
  const staffRoles = ROLES.filter((r) => r.value !== 'customer');
  const roleFilteredRows = rows.filter((u) => {
    if (showArchived ? !u.isArchived : u.isArchived) return false;
    if (roleFilter === 'all') return true;
    return u.role === roleFilter;
  });

  const table = useMemo(
    () => ({
      id: 'users',
      columns: ['Name', 'Email', 'Role', 'Job Level', 'Start Date', 'Status'],
      rows: roleFilteredRows.map((u) => ({
        id: u.id,
        cells: [
          { text: u.fullName, strong: true } as TableCell,
          { text: u.email },
          badgeCell(titleCase(u.role), 'low'),
          { text: u.jobLevel ?? (JOB_LEVEL_DEFAULTS[u.role]?.[0] ?? '—') },
          { text: u.startDate ? dateShort(u.startDate) : '—' },
          u.isArchived ? badgeCell('Archived', 'high') : { text: 'Active', status: 'paid' as StatusTone },
        ],
      })),
    }),
    [roleFilteredRows],
  );

  return (
    <>
      {/* Role filter bar */}
      <div className="quick-filter-bar" aria-label="Filter by role">
        <button type="button" className={roleFilter === 'all' ? 'active' : ''} onClick={() => setRoleFilter('all')}>
          All Roles
        </button>
        {staffRoles.map((r) => (
          <button key={r.value} type="button" className={roleFilter === r.value ? 'active' : ''} onClick={() => setRoleFilter(r.value)}>
            {r.label}
            <strong>{rows.filter((u) => u.role === r.value && !u.isArchived).length}</strong>
          </button>
        ))}
      </div>

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
          className=" users-table"
          renderActions={(id) => {
            const u = rows.find((x) => x.id === id);
            if (!u) return null;
            const busy = busyId === id;
            return (
              <div className="user-actions">
                <StatusSelect
                  value={u.role}
                  options={roleOptions}
                  disabled={busy}
                  onChange={(role) => changeRole(id, role)}
                />
                <div className="user-action-btns">
                  {JOB_LEVEL_ROLES.has(u.role) && !u.isArchived && (
                    <button className="btn-action" disabled={busy} onClick={() => openJobLevelModal(u)}>
                      Set Level
                    </button>
                  )}
                  {u.isArchived ? (
                    <button className="btn-action btn-restore" disabled={busy} onClick={() => restoreUser(id)}>
                      Restore
                    </button>
                  ) : (
                    <button className="btn-action btn-archive" disabled={busy} onClick={() => archiveUser(id)}>
                      Resign
                    </button>
                  )}
                </div>
              </div>
            );
          }}
        />
      )}

      {/* Job Level Modal */}
      {jobLevelTarget && (
        <Modal
          title={`Job Level — ${jobLevelTarget.fullName}`}
          open
          onClose={() => setJobLevelTarget(null)}
          onSubmit={saveJobLevel}
          submitText="Save"
          submitting={savingJobLevel}
        >
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>
            Role: <strong>{titleCase(jobLevelTarget.role)}</strong>
          </p>
          <div className="form-group">
            <label>Job Level</label>
            <select
              value={jobLevelValue}
              onChange={(e) => setJobLevelValue(e.target.value)}
            >
              {(JOB_LEVEL_DEFAULTS[jobLevelTarget.role] ?? []).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </Modal>
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
  leftover_log: 'medium',
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
        <div className="payment-resubmit-hint" role="alert" style={{ marginBottom: 16 }}>
          Your previous payment was declined. See the reason above and resubmit below.
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
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const isRejected = String(c.row.status) === 'rejected';
  const [method, setMethod] = useState(String(c.row.payment_method ?? 'GCash'));
  const [amount, setAmount] = useState(String(c.row.amount ?? ''));
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<string[]>([]);
  const payable = ['pending', 'unpaid', 'overdue'].includes(String(c.row.status));

  const resetForm = () => {
    setMethod(String(c.row.payment_method ?? 'GCash'));
    setAmount(String(c.row.amount ?? ''));
    setPaymentDate(todayISO());
    setReference('');
    setProof([]);
  };

  const openResubmit = () => {
    resetForm();
    setResubmitOpen(true);
  };

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
        status: 'for_verification',
      });
      await c.reload();
      notify('Payment proof submitted for verification.');
      setResubmitOpen(false);
      setOpen(false);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Could not submit payment proof.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <>
      <button className="btn-action" type="button" onClick={() => setOpen(true)}>
        {payable || isRejected ? 'View / Pay' : 'View Bill'}
      </button>

      {/* ── Main bill modal ── */}
      <Modal
        title={`Bill ${c.row.ref_code}`}
        open={open}
        wide
        onClose={() => setOpen(false)}
        closeText="Close"
      >
        {/* Rejection banner */}
        {isRejected && (
          <div className="billing-rejected-banner" role="alert">
            <div className="billing-rejected-icon">✕</div>
            <div>
              <strong>Your payment was declined</strong>
              <p>{String(c.row.verification_notes || 'Please review your payment details and resubmit.')}</p>
            </div>
          </div>
        )}

        <BillingDetails row={c.row} customer />

        {/* Action buttons at bottom */}
        {(payable || isRejected) && (
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" type="button" onClick={isRejected ? openResubmit : () => { setOpen(false); setResubmitOpen(true); resetForm(); }}>
              {isRejected ? 'Resubmit Payment' : 'Submit Payment'}
            </button>
          </div>
        )}
      </Modal>

      {/* ── Resubmit / pay modal ── */}
      <Modal
        title={isRejected ? 'Resubmit Payment' : 'Submit Payment'}
        open={resubmitOpen}
        wide
        onClose={() => setResubmitOpen(false)}
        onSubmit={submit}
        submitText={isRejected ? 'Resubmit' : 'Submit Proof'}
        submitting={saving}
      >
        <div className="billing-amount-card" style={{ marginBottom: 20 }}>
          <span>Amount Due</span>
          <strong>{money(c.row.amount)}</strong>
          <small>Bill {String(c.row.ref_code)} · Due {dateShort(c.row.due_date)}</small>
        </div>
        {Array.isArray(c.row.payment_qr) && (c.row.payment_qr as string[]).length > 0 && (
          <>
            <p className="detail-section-title">Scan to Pay</p>
            <ImageGallery images={c.row.payment_qr} />
          </>
        )}
        <div className="form-grid">
          <div className="form-group">
            <label>Payment Method</label>
            <input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="GCash / Maya / Bank" />
          </div>
          <div className="form-group">
            <label>Amount Paid (₱)</label>
            <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Payment Date</label>
            <input type="date" max={todayISO()} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Reference Number</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction / confirmation number" />
          </div>
        </div>
        <div className="form-group">
          <label>Screenshot / Proof of Payment</label>
          <ImageUpload value={proof} onChange={setProof} maxFiles={3} />
        </div>
      </Modal>
    </>
  );
}

function BillingReviewAction({ c }: { c: RowActionCtx }) {
  const { notify } = useToast();
  const { stats } = useStats();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(String(c.row.verification_notes ?? ''));
  const [saving, setSaving] = useState(false);
  const reviewable = c.row.status === 'for_verification';
  const decide = async (status: 'paid' | 'rejected') => {
    if (status === 'rejected' && !notes.trim()) return notify('Enter a rejection reason for the customer.', 'error');
    setSaving(true);
    try {
      await resourceService.update('payments', c.row.id, { status, verification_notes: notes.trim() });

      // Auto-update the linked incident status.
      const incidentRef = String(c.row.incident_ref ?? '').trim();
      if (incidentRef) {
        const incident = stats.incidents.find((i) => String(i.ref_code ?? '') === incidentRef);
        if (incident && !incident.archived) {
          if (status === 'paid' && String(incident.status) === 'for_billing') {
            // Payment confirmed → incident is fully resolved.
            try {
              await resourceService.update('incidents', String(incident.id), { status: 'resolved' });
            } catch { /* non-blocking — billing record is already saved */ }
          } else if (status === 'rejected' && String(incident.status) === 'for_billing') {
            // Payment rejected → mark incident as declined so customer knows.
            try {
              await resourceService.update('incidents', String(incident.id), { status: 'declined' });
            } catch { /* non-blocking */ }
          }
        }
      }

      await c.reload();
      notify(status === 'paid' ? 'Payment verified as Paid. Incident marked as Resolved.' : 'Payment rejected; customer may resubmit. Incident marked as Declined.');
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

/**
 * A single saved payment profile card — shows full details including QR code,
 * with inline edit and delete capability.
 */
function PaymentProfileCard({ profile, onDeleted }: { profile: EntityRow; onDeleted: () => void }) {
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName]             = useState(String(profile.name ?? ''));
  const [method, setMethod]         = useState(String(profile.payment_method ?? ''));
  const [acctName, setAcctName]     = useState(String(profile.account_name ?? ''));
  const [acctNum, setAcctNum]       = useState(String(profile.account_number ?? ''));
  const [qr, setQr]                 = useState<string[]>(Array.isArray(profile.payment_qr) ? profile.payment_qr as string[] : []);

  const save = async () => {
    if (!name.trim() || !method.trim() || !acctName.trim()) {
      notify('Profile name, payment method, and account name are required.', 'error'); return;
    }
    setSaving(true);
    try {
      await resourceService.update('payment-methods', String(profile.id), {
        name, payment_method: method, account_name: acctName, account_number: acctNum, payment_qr: qr,
      });
      notify('Payment profile updated.');
      setEditing(false);
      onDeleted(); // refresh parent list
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not update profile.', 'error');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm(`Delete payment profile "${String(profile.name)}"?`)) return;
    setDeleting(true);
    try {
      await resourceService.update('payment-methods', String(profile.id), { archived: true });
      notify('Payment profile removed.');
      onDeleted();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not delete profile.', 'error');
    } finally { setDeleting(false); }
  };

  if (editing) {
    return (
      <div className="payment-profile-card payment-profile-card--editing">
        <div className="form-grid">
          <div className="form-group"><label>Profile Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="form-group"><label>Payment Method</label><input value={method} onChange={(e) => setMethod(e.target.value)} /></div>
          <div className="form-group"><label>Account Name</label><input value={acctName} onChange={(e) => setAcctName(e.target.value)} /></div>
          <div className="form-group"><label>Account Number</label><input value={acctNum} onChange={(e) => setAcctNum(e.target.value)} /></div>
        </div>
        <div className="form-group"><label>QR Code</label><ImageUpload value={qr} onChange={setQr} maxFiles={1} /></div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn-action" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-profile-card">
      <div className="payment-profile-card__qr">
        {Array.isArray(profile.payment_qr) && profile.payment_qr[0]
          ? <img src={String(profile.payment_qr[0])} alt={`${String(profile.name)} QR`} />
          : <span className="payment-profile-card__qr-placeholder">₱</span>}
      </div>
      <div className="payment-profile-card__body">
        <strong className="payment-profile-card__name">{String(profile.name)}</strong>
        <span className="payment-profile-card__method">{String(profile.payment_method)}</span>
        <dl className="payment-profile-card__details">
          <div><dt>Account Name</dt><dd>{String(profile.account_name)}</dd></div>
          {Boolean(profile.account_number) && <div><dt>Account No.</dt><dd>{String(profile.account_number ?? '')}</dd></div>}
        </dl>
      </div>
      <div className="payment-profile-card__actions">
        <button className="btn-action" onClick={() => setEditing(true)}>Edit</button>
        <button className="btn-action btn-archive" onClick={remove} disabled={deleting}>{deleting ? '…' : 'Delete'}</button>
      </div>
    </div>
  );
}

interface BillingUser { fullName: string; email: string; role: string }
interface BillableWork {
  key: string;
  label: string;
  /** Present for incident-direct billing (for_billing status). */
  incident?: EntityRow;
  /** Present for approved general-request billing. */
  request?: EntityRow;
  /** True when a payment record already references this work item. */
  alreadyBilled?: boolean;
}

function BillingControls({
  onCreated,
  profiles,
  onPaymentOptions,
}: {
  onCreated: () => Promise<void>;
  profiles: EntityRow[];
  onPaymentOptions?: () => void;
}) {
  const { notify } = useToast();
  const [issueOpen, setIssueOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [works, setWorks] = useState<BillableWork[]>([]);
  const [users, setUsers] = useState<BillingUser[]>([]);
  const [workKey, setWorkKey] = useState('');
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [existingBills, setExistingBills] = useState<EntityRow[]>([]);

  // All bills loaded for the "already billed" check and display.
  const [allBills, setAllBills] = useState<EntityRow[]>([]);

  const loadOptions = async () => {
    setLoading(true);
    try {
      const [incidents, bills, requests, userResponse] = await Promise.all([
        resourceService.list('incidents'),
        resourceService.list('payments'),
        resourceService.list('material-requests'),
        api.get<{ data: BillingUser[] }>('/users'),
      ]);

      setAllBills(bills);

      // --- Incident-backed billable work (status = for_billing) ---
      const incidentWorks: BillableWork[] = incidents
        .filter((i) => String(i.status ?? '') === 'for_billing' && !i.archived)
        .map((i) => {
          const alreadyBilled = bills.some((b) => String(b.incident_ref ?? '') === String(i.ref_code));
          return {
            key: `inc:${i.id}`,
            label: `[Incident] ${i.ref_code} — ${String(i.description ?? '').slice(0, 60)} (${i.reported_by})${alreadyBilled ? ' ✓ Billed' : ''}`,
            incident: i,
            alreadyBilled,
          };
        });

      // --- Approved general-request-backed billable work ---
      const billedReqRefs = new Set(
        bills
          .map((b) => { const m = String(b.service_description ?? '').match(/REQ-\d+/i); return m ? m[0].toUpperCase() : ''; })
          .filter(Boolean),
      );
      const requestWorks: BillableWork[] = requests
        .filter(
          (r) =>
            String(r.request_type ?? '') === 'general' &&
            String(r.status ?? '') === 'approved' &&
            String(r.payment_option ?? '').trim() !== '' &&
            !r.archived,
        )
        .map((r) => {
          const alreadyBilled = billedReqRefs.has(String(r.ref_code ?? '').toUpperCase());
          return {
            key: `req:${r.id}`,
            label: `[Item Request] ${r.ref_code} — ${r.material_name} (${r.requested_by})${alreadyBilled ? ' ✓ Billed' : ''}`,
            request: r,
            alreadyBilled,
          };
        });

      setWorks([...incidentWorks, ...requestWorks]);
      setUsers(userResponse.data);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Could not load bill options.', 'error');
    } finally { setLoading(false); }
  };

  const openIssue = () => { setIssueOpen(true); void loadOptions(); };
  const selectedWork = works.find((work) => work.key === workKey);
  const selectedProfiles = profiles.filter((p) => profileIds.includes(String(p.id)));

  // Derive customer name from whichever work type is selected.
  const customerName = selectedWork?.request
    ? String(selectedWork.request.requested_by ?? '')
    : String(selectedWork?.incident?.reported_by ?? '');

  const customer = users.find(
    (u) => u.fullName.trim().toLowerCase() === customerName.trim().toLowerCase(),
  );

  const selectedRequest = selectedWork?.request ?? null;
  const isCodRequest = String(selectedRequest?.payment_option ?? '') === 'cash_on_delivery';
  const needsProfile = !selectedRequest || !isCodRequest;

  // Existing bills for the currently selected work item.
  useEffect(() => {
    if (!selectedWork) { setExistingBills([]); return; }
    if (selectedWork.incident) {
      setExistingBills(allBills.filter((b) => String(b.incident_ref ?? '') === String(selectedWork.incident!.ref_code)));
    } else if (selectedWork.request) {
      const ref = String(selectedWork.request.ref_code ?? '').toUpperCase();
      setExistingBills(allBills.filter((b) => String(b.service_description ?? '').toUpperCase().includes(ref)));
    } else {
      setExistingBills([]);
    }
  }, [workKey, allBills]);

  const selectWork = (key: string) => {
    setWorkKey(key);
    const work = works.find((item) => item.key === key);
    if (work?.request) {
      setDescription(
        `Item Request — ${String(work.request.material_name ?? '')}` +
          (Number(work.request.quantity ?? 0) > 0 ? ` × ${work.request.quantity}${work.request.unit ? ` ${work.request.unit}` : ''}` : ''),
      );
      setAmount(Number(work.request.total_cost ?? 0) > 0 ? String(work.request.total_cost) : '');
    } else if (work?.incident) {
      setDescription(String(work.incident.description ?? ''));
      setAmount('');
    } else {
      setDescription('');
      setAmount('');
    }
  };

  const toggleProfile = (id: string) =>
    setProfileIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const issueBill = async () => {
    if (!selectedWork) { notify('Select an incident marked For Billing or an approved item request.', 'error'); return; }
    if (!customer?.email) { notify('No registered account email found for this customer.', 'error'); return; }
    if (!(Number(amount) > 0)) { notify('Enter the billing amount.', 'error'); return; }
    if (!dueDate) { notify('Set a due date.', 'error'); return; }
    if (needsProfile && selectedProfiles.length === 0) {
      notify('Select at least one payment profile, or add one via Payment Options.', 'error'); return;
    }

    setSaving(true);
    try {
      const paymentFields = isCodRequest
        ? { payment_method: 'Cash on Delivery', account_name: '', account_number: '', payment_qr: [] }
        : {
            payment_method: selectedProfiles.map((p) => String(p.payment_method)).join(' / '),
            account_name: selectedProfiles.map((p) => String(p.account_name)).join(' / '),
            account_number: selectedProfiles.map((p) => String(p.account_number || '')).filter(Boolean).join(' / '),
            payment_qr: selectedProfiles.flatMap((p) => Array.isArray(p.payment_qr) ? p.payment_qr as string[] : []),
          };

      const isReq = Boolean(selectedRequest);
      await resourceService.create('payments', {
        customer_name: customerName,
        customer_email: customer.email,
        incident_ref: isReq ? '' : String(selectedWork.incident?.ref_code ?? ''),
        job_order_ref: '',
        service_description: description,
        notes: isCodRequest ? `Cash on Delivery — deliver to: ${String(selectedRequest?.delivery_address ?? '').trim() || 'address on file'}` : '',
        amount: Number(amount),
        due_date: dueDate,
        ...paymentFields,
      });

      await onCreated();
      notify('Bill issued to the customer.');
      setIssueOpen(false);
      setWorkKey(''); setAmount(''); setDueDate(''); setDescription(''); setProfileIds([]);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Could not issue the bill.', 'error');
    } finally { setSaving(false); }
  };

  return <>
    <div className="panel-head-actions">
      {onPaymentOptions && (
        <ActionButton label="Payment Options" icon="wallet" variant="secondary" onClick={onPaymentOptions} />
      )}
      <ActionButton label="Issue Final Bill" icon="plus-circle" onClick={openIssue} />
    </div>
    <Modal title="Issue Final Bill" open={issueOpen} wide onClose={() => setIssueOpen(false)} onSubmit={issueBill} submitText="Issue Bill" submitting={saving}>
      {loading ? <p className="billing-helper">Loading billable work…</p> : <>
        {/* Work selector — only show unbilled items */}
        <div className="form-group">
          <label>Incident (For Billing) or Approved Item Request</label>
          <select value={workKey} onChange={(e) => selectWork(e.target.value)}>
            <option value="">Select…</option>
            {works.filter((w) => w.incident && !w.alreadyBilled).length > 0 && (
              <optgroup label="Incidents — For Billing">
                {works.filter((w) => w.incident && !w.alreadyBilled).map((work) => (
                  <option key={work.key} value={work.key}>{work.label}</option>
                ))}
              </optgroup>
            )}
            {works.filter((w) => w.request && !w.alreadyBilled).length > 0 && (
              <optgroup label="Approved Item Requests">
                {works.filter((w) => w.request && !w.alreadyBilled).map((work) => (
                  <option key={work.key} value={work.key}>{work.label}</option>
                ))}
              </optgroup>
            )}
          </select>
          {works.length > 0 && works.every((w) => w.alreadyBilled) && (
            <small style={{ color: 'var(--muted)' }}>All billable items have already been billed.</small>
          )}
          {works.length === 0 && !loading && (
            <small style={{ color: 'var(--muted)' }}>No items ready to bill. Set an incident status to "For Billing" first.</small>
          )}
        </div>

        {/* Existing bills for selected work */}
        {existingBills.length > 0 && (
          <div className="billing-existing-bills">
            <p className="detail-section-title" style={{ marginTop: 0 }}>
              Existing Bill{existingBills.length > 1 ? 's' : ''} for this {selectedWork?.request ? 'Request' : 'Incident'}
            </p>
            {existingBills.map((b) => (
              <div key={String(b.id)} className="billing-existing-bill-row">
                <span className="billing-existing-ref">{String(b.ref_code ?? '')}</span>
                <span className="billing-existing-amount">{money(b.amount)}</span>
                <span className="billing-existing-due">Due {dateShort(b.due_date)}</span>
                <span className={`billing-existing-status status-${String(b.status ?? 'pending')}`}>
                  {billingStatusLabel(b.status)}
                </span>
              </div>
            ))}
          </div>
        )}

        {selectedWork && (
          <div className="billing-customer-preview">
            <span>Customer</span>
            <strong>{customerName || 'Unknown customer'}</strong>
            <small>{customer?.email ?? 'No matching registered email'}</small>
          </div>
        )}

        {/* Customer payment option for item requests */}
        {selectedRequest && (
          <div className="form-group">
            <label>Customer's Payment Option</label>
            <input value={isCodRequest ? 'Cash on Delivery' : 'GCash (Online Payment)'} readOnly />
            {isCodRequest && String(selectedRequest.delivery_address ?? '').trim() && (
              <small style={{ display: 'block', marginTop: 4, color: 'var(--muted)' }}>
                Delivery address: {String(selectedRequest.delivery_address)}
              </small>
            )}
          </div>
        )}

        <div className="form-grid">
          <div className="form-group"><label>Final Amount</label><div className="peso-input"><span>₱</span><input type="text" inputMode="decimal" value={amount} onChange={(e) => { const next = e.target.value; if (/^\d*(\.\d{0,2})?$/.test(next)) setAmount(next); }} onKeyDown={(e) => { if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault(); }} placeholder="0.00" /></div></div>
          <div className="form-group"><label>Due Date</label><input type="date" min={todayISO()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        </div>

        {/* Payment profile multi-select — card-click style, hidden for COD */}
        {needsProfile && (
          <div className="form-group">
            <label>Payment Information {profileIds.length > 0 && <span className="profile-count-badge">{profileIds.length} selected</span>}</label>
            {profiles.length === 0 ? (
              <small style={{ color: '#e25577' }}>No payment profiles saved. Add one via Payment Information first.</small>
            ) : (
              <div className="profile-card-list">
                {profiles.map((p) => {
                  const selected = profileIds.includes(String(p.id));
                  return (
                    <div
                      key={String(p.id)}
                      className={`selected-payment-profile profile-card-selectable${selected ? ' profile-card-active' : ''}`}
                      onClick={() => toggleProfile(String(p.id))}
                      role="checkbox"
                      aria-checked={selected}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleProfile(String(p.id)); } }}
                    >
                      {selected && <span className="profile-card-check" aria-hidden="true">✓</span>}
                      <div className="selected-payment-icon">
                        {Array.isArray(p.payment_qr) && p.payment_qr[0]
                          ? <img src={String(p.payment_qr[0])} alt={` QR`} />
                          : <span>₱</span>}
                      </div>
                      <div className="selected-payment-copy">
                        <small>{selected ? 'Selected — click to remove' : 'Click to select'}</small>
                        <strong>{String(p.name)}</strong>
                        <span>{String(p.payment_method)}</span>
                      </div>
                      <dl>
                        <div><dt>Account name</dt><dd>{String(p.account_name)}</dd></div>
                        <div><dt>Account number</dt><dd>{String(p.account_number || 'Not provided')}</dd></div>
                      </dl>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

                <div className="form-group"><label>Service Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      </>}
    </Modal>
  </>;
}



export function BillingModule({ filter, navigate }: ModuleProps) {
  const { user } = useAuth();
  const customer = user!.role === 'customer';

  // ── Payment profiles (needed in the Issue Final Bill modal) ──
  const [profiles, setProfiles] = useState<EntityRow[]>([]);

  const loadProfiles = async () => {
    try {
      const saved = await resourceService.list('payment-methods');
      setProfiles(saved.filter((p) => !p.archived));
    } catch {
      // ignore — profiles just won't appear in the bill modal
    }
  };

  useEffect(() => {
    if (!customer) void loadProfiles();
  }, [customer]);

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

  return (
    <LiveModule
      entity="payments" title={customer ? 'My Billing' : 'Billing'} createLabel="Issue Final Bill"
      columns={columns} fields={customer ? [] : fields} canWrite={!customer} filter={filter} archivable={!customer}
      tableClassName="billing-table"
      renderCreate={!customer ? ({ reload }) => <BillingControls onCreated={reload} profiles={profiles} onPaymentOptions={navigate ? () => navigate('payment-options') : undefined} /> : undefined}
      metrics={(rows) => [
        metric('bill1', customer ? 'My Bills' : 'Total Bills', String(rows.length), 'credit-card', 'customers'),
        metric('bill2', 'Unpaid', count(rows, (r) => ['pending', 'unpaid'].includes(String(r.status))), 'clock', 'revenue'),
        metric('bill3', 'For Verification', count(rows, (r) => r.status === 'for_verification'), 'shield', 'profit'),
        metric('bill4', 'Paid', count(rows, (r) => r.status === 'paid'), 'check-circle', 'invoices'),
      ]}
      actions={(c) => customer ? <CustomerBillingAction c={c} /> : <><BillingReviewAction c={c} /><EditBtn c={c} /><ArchiveBtn c={c} /></>}
    />
  );
}

/* ------------------------------------------------- Payment Options */
export function PaymentOptionsModule() {
  const { notify } = useToast();
  const [profiles, setProfiles] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileMethod, setProfileMethod] = useState('GCash');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [profileQr, setProfileQr] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const saved = await resourceService.list('payment-methods');
      setProfiles(saved.filter((p) => !p.archived));
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadProfiles(); }, []);

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
      await loadProfiles();
      notify('Payment option saved.');
      setProfileName(''); setProfileMethod('GCash'); setAccountName(''); setAccountNumber(''); setProfileQr([]);
      setAddOpen(false);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Could not save payment option.', 'error');
    } finally { setSaving(false); }
  };

  const closeModal = () => {
    setAddOpen(false);
    setProfileName(''); setProfileMethod('GCash'); setAccountName(''); setAccountNumber(''); setProfileQr([]);
  };

  return (
    <>
      <div className="billing-payment-info-panel panel">
        <div className="billing-payment-info-head">
          <div>
            <h3 className="billing-payment-info-title">Payment Options</h3>
            <p className="billing-payment-info-sub">
              {loading
                ? 'Loading…'
                : profiles.length > 0
                  ? `${profiles.length} active payment option${profiles.length !== 1 ? 's' : ''}`
                  : 'No payment options saved yet'}
            </p>
          </div>
          <button className="btn-primary billing-add-payment-btn" onClick={() => setAddOpen(true)}>
            + Add Payment Option
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--muted)', padding: '8px 0' }}>Loading payment options…</p>
        ) : profiles.length === 0 ? (
          <p style={{ color: 'var(--muted)', padding: '8px 0' }}>
            No payment options yet. Add one to attach it to bills you issue.
          </p>
        ) : (
          <div className="billing-payment-info-list">
            {profiles.map((p) => (
              <PaymentProfileCard key={String(p.id)} profile={p} onDeleted={loadProfiles} />
            ))}
          </div>
        )}
      </div>

      <Modal
        title="Add Payment Option"
        open={addOpen}
        wide
        onClose={closeModal}
        onSubmit={addProfile}
        submitText="Save Payment Option"
        submitting={saving}
      >
        <div className="form-grid">
          <div className="form-group"><label>Profile Name</label><input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="e.g. Main GCash" /></div>
          <div className="form-group"><label>Payment Method</label><input value={profileMethod} onChange={(e) => setProfileMethod(e.target.value)} placeholder="e.g. GCash, Maya, BDO" /></div>
          <div className="form-group"><label>Account Name</label><input value={accountName} onChange={(e) => setAccountName(e.target.value)} /></div>
          <div className="form-group"><label>Account Number / Mobile No.</label><input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></div>
        </div>
        <div className="form-group"><label>QR Code</label><ImageUpload value={profileQr} onChange={setProfileQr} maxFiles={1} /></div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------ Customer Service Chat --- */
interface SupportThread {
  key: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  incidentRef: string;
  messages: EntityRow[];
}

export function InquiriesModule({ filter = '' }: ModuleProps) {
  const { user } = useAuth();
  const { stats } = useStats();
  const { notify } = useToast();
  const isCustomer = user!.role === 'customer';
  const [messages, setMessages] = useState<EntityRow[]>([]);
  const [selectedKey, setSelectedKey] = useState(isCustomer ? 'general' : '');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setMessages(await resourceService.list('support-messages'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load inquiries.');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 3_000);
    return () => clearInterval(timer);
  }, []);

  const threads = useMemo<SupportThread[]>(() => {
    const grouped = new Map<string, SupportThread>();
    for (const message of messages) {
      const customerId = String(message.customer_id ?? '');
      const incidentRef = String(message.incident_ref ?? '');
      const key = `${customerId}|${incidentRef || 'general'}`;
      const thread = grouped.get(key) ?? {
        key,
        customerId,
        customerName: String(message.customer_name ?? 'Customer'),
        customerEmail: String(message.customer_email ?? ''),
        incidentRef,
        messages: [],
      };
      thread.messages.push(message);
      grouped.set(key, thread);
    }
    return [...grouped.values()]
      .map((thread) => ({ ...thread, messages: thread.messages.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) }))
      .filter((thread) => {
        const query = filter.trim().toLowerCase();
        return !query || thread.customerName.toLowerCase().includes(query) || thread.incidentRef.toLowerCase().includes(query);
      })
      .sort((a, b) => String(b.messages[b.messages.length - 1]?.created_at ?? '').localeCompare(String(a.messages[a.messages.length - 1]?.created_at ?? '')));
  }, [messages, filter]);

  const ownIncidents = useMemo(
    () => stats.incidents.filter((incident) =>
      String(incident.reported_by ?? '').trim().toLowerCase() === user!.fullName.trim().toLowerCase(),
    ),
    [stats.incidents, user],
  );

  useEffect(() => {
    if (!isCustomer && !selectedKey && threads[0]) setSelectedKey(threads[0].key);
  }, [isCustomer, selectedKey, threads]);

  const selectedThread = isCustomer
    ? threads.find((thread) => thread.incidentRef === (selectedKey === 'general' ? '' : selectedKey))
    : threads.find((thread) => thread.key === selectedKey);
  const visibleMessages = selectedThread?.messages ?? [];

  useEffect(() => {
    // Scroll only the message pane. scrollIntoView() also moves the dashboard
    // page itself, which can hide the chat title/header under the top bar.
    const messagePane = endRef.current?.parentElement;
    if (messagePane) messagePane.scrollTo({ top: messagePane.scrollHeight, behavior: 'smooth' });
  }, [visibleMessages.length, selectedKey]);

  const send = async () => {
    const message = draft.trim();
    if (!message || sending) return;
    if (!isCustomer && !selectedThread) return notify('Select a conversation first.', 'error');
    setSending(true);
    try {
      await resourceService.create('support-messages', {
        message,
        customer_id: isCustomer ? user!.id : selectedThread!.customerId,
        incident_ref: isCustomer ? (selectedKey === 'general' ? '' : selectedKey) : selectedThread!.incidentRef,
      });
      setDraft('');
      await load(true);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Message could not be sent.', 'error');
    } finally {
      setSending(false);
    }
  };

  const conversationTitle = isCustomer
    ? selectedKey === 'general' ? 'General Customer Service' : `Incident ${selectedKey}`
    : selectedThread
      ? `${selectedThread.customerName} · ${selectedThread.incidentRef || 'General Customer Service'}`
      : 'Select a conversation';

  return (
    <>
      <PanelHead title="Inquiries & Customer Service" />
      <div className="support-chat-layout">
        <aside className="support-thread-list">
          <h3>{isCustomer ? 'Conversations' : 'Customer Inquiries'}</h3>
          {isCustomer ? (
            <>
              <button className={selectedKey === 'general' ? 'active' : ''} onClick={() => setSelectedKey('general')}>
                <strong>General Customer Service</strong>
                <span>Questions not tied to an incident</span>
              </button>
              {ownIncidents.map((incident) => (
                <button key={String(incident.id)} className={selectedKey === incident.ref_code ? 'active' : ''} onClick={() => setSelectedKey(String(incident.ref_code))}>
                  <strong>Incident {String(incident.ref_code)}</strong>
                  <span>{String(incident.description ?? '')}</span>
                </button>
              ))}
            </>
          ) : loading ? <p>Loading conversations…</p> : threads.length === 0 ? (
            <p className="support-empty">No customer inquiries yet.</p>
          ) : threads.map((thread) => (
            <button key={thread.key} className={selectedKey === thread.key ? 'active' : ''} onClick={() => setSelectedKey(thread.key)}>
              <strong>{thread.customerName}</strong>
              <span>{thread.incidentRef ? `Incident ${thread.incidentRef}` : 'General Customer Service'}</span>
              <small>{String(thread.messages[thread.messages.length - 1]?.message ?? '')}</small>
            </button>
          ))}
        </aside>

        <section className="support-conversation">
          <header>
            <strong>{conversationTitle}</strong>
            {!isCustomer && selectedThread?.customerEmail && <span>{selectedThread.customerEmail}</span>}
          </header>
          <div className="support-message-list">
            {error ? <p className="support-error">{error}</p> : loading ? <p>Loading messages…</p> : visibleMessages.length === 0 ? (
              <div className="support-empty-chat"><strong>No messages yet</strong><span>Send the first message to start this conversation.</span></div>
            ) : visibleMessages.map((message) => {
              const mine = String(message.sender_id) === user!.id;
              return (
                <div key={String(message.id)} className={`support-message${mine ? ' mine' : ''}`}>
                  <div>
                    <strong>{mine ? 'You' : String(message.sender_name ?? 'Customer Service')}</strong>
                    <p>{String(message.message ?? '')}</p>
                    <time>{new Date(String(message.created_at)).toLocaleString('en-PH')}</time>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          {(isCustomer || selectedThread) && (
            <div className="support-composer">
              <textarea
                value={draft}
                maxLength={2000}
                placeholder="Type your message…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button type="button" onClick={() => void send()} disabled={!draft.trim() || sending}>{sending ? 'Sending…' : 'Send'}</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/* --------------------------------------------------- Supply Requests */
// SupplyRequestsModule is superseded by RequestsModule (which handles both
// MRF and General/supply request types in one unified view). This alias is
// kept so existing imports in roleViews.tsx continue to compile while the
// transition is completed.
export const SupplyRequestsModule = RequestsModule;
