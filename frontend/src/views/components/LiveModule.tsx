/**
 * LiveModule — a self-contained, data-driven operational module. It fetches an
 * entity from the resource API, renders a metrics strip + table, and provides
 * create/edit (modal) and per-row actions (status changes, delete). Every
 * dashboard module is a thin configuration of this component.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ImagePlus } from 'lucide-react';
import type { Metric, ResourceTable, TableCell, TableRow } from '../../models/types';
import { resourceService, type EntityRow } from '../../services/resourceService';
import { ApiError } from '../../services/apiClient';
import { useToast } from '../../controllers/ToastContext';
import { useStats } from '../../controllers/StatsContext';
import { MetricsGrid } from './MetricsGrid';
import { DataTable } from './DataTable';
import { PanelHead, ActionButton } from './panels';
import { Modal } from './Modal';

export interface ModuleField {
  name: string;
  label: string;
  kind?: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'images';
  options?: string[];
  optionList?: { value: string; label: string }[];
  placeholder?: string;
  default?: string;
  /** Render the field as a non-editable display (value is still submitted). */
  readOnly?: boolean;
  /** Helper text shown under the field (e.g. the reporter's role). */
  hint?: string;
}

export interface ModuleColumn {
  header: string;
  cell: (row: EntityRow) => TableCell | string;
}

export interface RowActionCtx {
  row: EntityRow;
  busy: boolean;
  archived: boolean;
  update: (values: Record<string, unknown>) => Promise<void>;
  remove: () => void;
  archive: () => void;
  restore: () => void;
  edit: () => void;
}

export interface LiveModuleProps {
  entity: string;
  title: string;
  columns: ModuleColumn[];
  filter?: string;
  createLabel?: string;
  fields?: ModuleField[];
  canWrite?: boolean;
  /** Restrict visible rows to those where row[mineField] === mineValue. */
  mineField?: string;
  mineValue?: string;
  metrics?: (rows: EntityRow[]) => Metric[];
  actions?: (ctx: RowActionCtx) => ReactNode;
  actionLabel?: string;
  /** Show the "Show archived" toggle (defaults to on when the user can write). */
  archivable?: boolean;
}

export function LiveModule({
  entity,
  title,
  columns,
  filter = '',
  createLabel,
  fields,
  canWrite,
  mineField,
  mineValue,
  metrics,
  actions,
  actionLabel = 'Action',
  archivable,
}: LiveModuleProps) {
  const { notify } = useToast();
  const { reload: reloadStats } = useStats();
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EntityRow | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const showArchiveToggle = (archivable ?? canWrite) === true;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await resourceService.list(entity, showArchived ? 'only' : undefined));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load records.');
    } finally {
      setLoading(false);
    }
  }, [entity, showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRows = useMemo(() => {
    if (!mineField || !mineValue) return rows;
    return rows.filter((r) => String(r[mineField] ?? '').toLowerCase() === mineValue.toLowerCase());
  }, [rows, mineField, mineValue]);

  const table: ResourceTable = useMemo(
    () => ({
      id: entity,
      columns: columns.map((c) => c.header),
      rows: visibleRows.map<TableRow>((row) => ({
        id: row.id,
        cells: columns.map((c) => {
          const out = c.cell(row);
          return (typeof out === 'string' ? { text: out } : out) as TableCell;
        }),
      })),
    }),
    [entity, columns, visibleRows],
  );

  const rowById = useMemo(() => new Map(visibleRows.map((r) => [r.id, r])), [visibleRows]);

  const openCreate = () => {
    setEditing(null);
    const init: Record<string, unknown> = {};
    fields?.forEach((f) => {
      init[f.name] = f.kind === 'images' ? [] : f.default ?? f.optionList?.[0]?.value ?? f.options?.[0] ?? '';
    });
    setValues(init);
    setOpen(true);
  };

  const openEdit = (row: EntityRow) => {
    setEditing(row);
    const init: Record<string, unknown> = {};
    fields?.forEach((f) => {
      if (f.kind === 'images') init[f.name] = Array.isArray(row[f.name]) ? row[f.name] : [];
      else init[f.name] = row[f.name] != null ? String(row[f.name]) : '';
    });
    setValues(init);
    setOpen(true);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      if (editing) await resourceService.update(entity, editing.id, values);
      else await resourceService.create(entity, values);
      notify(editing ? 'Record updated successfully!' : 'Record created successfully!');
      setOpen(false);
      await Promise.all([load(), reloadStats()]);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Something went wrong.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const runUpdate = async (id: string, vals: Record<string, unknown>) => {
    setBusyId(id);
    try {
      await resourceService.update(entity, id, vals);
      notify('Updated successfully!');
      await Promise.all([load(), reloadStats()]);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Update failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const runRemove = async (id: string) => {
    setBusyId(id);
    try {
      await resourceService.remove(entity, id);
      notify('Record deleted.');
      await Promise.all([load(), reloadStats()]);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Delete failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const renderActions = actions
    ? (rowId: string) => {
        const row = rowById.get(rowId);
        if (!row) return null;
        return actions({
          row,
          busy: busyId === row.id,
          archived: Boolean(row.archived),
          update: (vals) => runUpdate(row.id, vals),
          remove: () => runRemove(row.id),
          archive: () => runUpdate(row.id, { archived: true }),
          restore: () => runUpdate(row.id, { archived: false }),
          edit: () => openEdit(row),
        });
      }
    : undefined;

  return (
    <>
      {metrics && !showArchived && rows.length > 0 && <MetricsGrid metrics={metrics(rows)} />}
      <PanelHead
        title={showArchived ? `${title} · Archived` : title}
        action={
          <div className="panel-head-actions">
            {showArchiveToggle && (
              <button className="btn-action" type="button" onClick={() => setShowArchived((s) => !s)}>
                {showArchived ? 'View Active' : 'View Archived'}
              </button>
            )}
            {canWrite && fields && !showArchived && (
              <ActionButton label={createLabel ?? 'Add New'} icon="plus-circle" onClick={openCreate} />
            )}
          </div>
        }
      />

      {loading ? (
        <p style={{ color: 'var(--muted)', padding: '8px 2px' }}>Loading…</p>
      ) : error ? (
        <p style={{ color: '#e25577', padding: '8px 2px' }}>{error}</p>
      ) : (
        <DataTable table={table} filter={filter} renderActions={renderActions} actionLabel={actionLabel} />
      )}

      {open && fields && (
        <Modal
          title={editing ? `Edit — ${title}` : createLabel ?? 'New Record'}
          open
          onClose={() => setOpen(false)}
          onSubmit={submit}
          submitText={editing ? 'Save Changes' : 'Create'}
          submitting={submitting}
        >
          {fields.map((f) => (
            <div className="form-group" key={f.name}>
              <label>{f.label}</label>
              {f.kind === 'images' ? (
                <ImageUpload
                  value={(values[f.name] as string[]) ?? []}
                  onChange={(imgs) => setValues((p) => ({ ...p, [f.name]: imgs }))}
                />
              ) : f.kind === 'textarea' ? (
                <textarea
                  placeholder={f.placeholder}
                  readOnly={f.readOnly}
                  value={String(values[f.name] ?? '')}
                  onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                />
              ) : f.kind === 'select' && !f.readOnly ? (
                <select
                  value={String(values[f.name] ?? '')}
                  onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                >
                  {(f.optionList ?? (f.options ?? []).map((o) => ({ value: o, label: o }))).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'}
                  placeholder={f.placeholder}
                  readOnly={f.readOnly}
                  value={String(values[f.name] ?? '')}
                  onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                />
              )}
              {f.hint && <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)' }}>{f.hint}</small>}
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}

/**
 * Multi-image upload with live previews. Images are held as base64 data URLs so
 * they travel with the record (stored in a jsonb column). Add/remove any time.
 * Files are downscaled + re-encoded client-side so payloads stay small and the
 * request never trips the server body limit.
 */
const MAX_IMAGES = 6;
const MAX_INPUT_BYTES = 12 * 1024 * 1024; // reject absurdly large source files
const MAX_DIM = 1280; // longest edge after downscale
const REENCODE_OVER = 350 * 1024; // re-encode anything bigger than this

const readDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Downscale to MAX_DIM and re-encode to JPEG when the source is large. */
async function compressImage(file: File): Promise<string> {
  const original = await readDataUrl(file);
  // Small files (and GIFs, to preserve animation) pass through untouched.
  if (file.size <= REENCODE_OVER || file.type === 'image/gif') return original;
  try {
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL('image/jpeg', 0.72);
    // Guard against pathological cases where re-encoding grows the payload.
    return out.length < original.length ? out : original;
  } catch {
    return original;
  }
}

export function ImageUpload({ value, onChange }: { value: string[]; onChange: (imgs: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const room = MAX_IMAGES - value.length;
      const picked = files.slice(0, Math.max(0, room));
      if (files.length > room) notify(`You can attach up to ${MAX_IMAGES} images.`, 'error');
      const next: string[] = [];
      for (const file of picked) {
        if (!file.type.startsWith('image/')) {
          notify('Only image files can be attached.', 'error');
          continue;
        }
        if (file.size > MAX_INPUT_BYTES) {
          notify(`"${file.name}" is too large and was skipped.`, 'error');
          continue;
        }
        next.push(await compressImage(file));
      }
      if (next.length) onChange([...value, ...next]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="image-field">
      {value.map((src, i) => (
        <div className="image-thumb" key={i}>
          <img src={src} alt={`Attachment ${i + 1}`} />
          <button
            type="button"
            className="image-thumb-remove"
            aria-label="Remove image"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      {value.length < MAX_IMAGES && (
        <button type="button" className="image-add" onClick={() => inputRef.current?.click()} disabled={busy}>
          <ImagePlus size={20} />
          {busy ? 'Adding…' : 'Add Photo'}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
    </div>
  );
}

/** Compact inline <select> styled as a button — used for row status actions. */
export function StatusSelect({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="btn-action"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{ cursor: 'pointer' }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
