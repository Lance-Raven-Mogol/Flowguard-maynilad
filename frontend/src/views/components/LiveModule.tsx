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
  /** For date fields: allow selecting past dates (defaults to future-only). */
  allowPast?: boolean;
  /** Show this field only when the current form values satisfy a condition. */
  visibleWhen?: (values: Record<string, unknown>) => boolean;
  /** Existing values to offer as autocomplete suggestions while allowing new text. */
  suggestionsFromRows?: (rows: EntityRow[]) => string[];
  /** Render select options with the shared custom dropdown instead of the browser-native menu. */
  styledSelect?: boolean;
}

/** Today's date as YYYY-MM-DD — used as the min for scheduling date pickers. */
const todayISO = (): string => new Date().toISOString().slice(0, 10);

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
  /** Reload this module's rows + the shared stats snapshot. */
  reload: () => Promise<void>;
}

export interface LiveModuleProps {
  entity: string;
  title: string;
  columns: ModuleColumn[];
  tableClassName?: string;
  filter?: string;
  createLabel?: string;
  fields?: ModuleField[];
  canWrite?: boolean;
  /** Restrict visible rows to those where row[mineField] === mineValue. */
  mineField?: string;
  mineValue?: string;
  /** Arbitrary per-row visibility predicate (e.g. "assigned to me"). */
  rowFilter?: (row: EntityRow) => boolean;
  metrics?: (rows: EntityRow[]) => Metric[];
  quickFilters?: (rows: EntityRow[]) => { id: string; label: string; hint?: string; matches: (row: EntityRow) => boolean }[];
  /** Normalize or derive values immediately before create/update. */
  prepareValues?: (values: Record<string, unknown>) => Record<string, unknown>;
  actions?: (ctx: RowActionCtx) => ReactNode;
  actionLabel?: string;
  /** Show the "Show archived" toggle (defaults to on when the user can write). */
  archivable?: boolean;
  /**
   * Replace the default create button + modal with a custom control (e.g. the
   * job-order team-assignment form). Rendered in the panel head when the user
   * can write and is viewing active records. `reload` refreshes the table.
   */
  renderCreate?: (ctx: { reload: () => Promise<void> }) => ReactNode;
}

export function AutocompleteInput({
  value,
  suggestions,
  placeholder,
  readOnly,
  onChange,
}: {
  value: string;
  suggestions: string[];
  placeholder?: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const query = value.trim().toLocaleLowerCase();
    return (query ? suggestions.filter((item) => item.toLocaleLowerCase().includes(query)) : suggestions).slice(0, 50);
  }, [suggestions, value]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const pick = (suggestion: string) => {
    onChange(suggestion);
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && highlight >= 0 && filtered[highlight]) {
      event.preventDefault();
      pick(filtered[highlight]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="combobox" ref={wrapRef}>
      <div className="combobox-control">
        <input
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => !readOnly && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {!readOnly && (
          <button type="button" className="combobox-caret" tabIndex={-1} aria-label="Toggle suggestions" onClick={() => setOpen((current) => !current)}>
            ▾
          </button>
        )}
      </div>
      {open && !readOnly && (
        <ul className="combobox-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="combobox-empty">No matching category. “{value.trim()}” will be saved as a new category.</li>
          ) : filtered.map((suggestion, index) => (
            <li
              key={suggestion}
              role="option"
              aria-selected={suggestion.toLocaleLowerCase() === value.toLocaleLowerCase()}
              className={`combobox-option combobox-option-simple${index === highlight ? ' is-active' : ''}${suggestion.toLocaleLowerCase() === value.toLocaleLowerCase() ? ' is-selected' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(suggestion);
              }}
              onMouseEnter={() => setHighlight(index)}
            >
              <span className="combobox-name">{suggestion}</span>
              {suggestion.toLocaleLowerCase() === value.toLocaleLowerCase() && <span className="combobox-selected-mark">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StyledSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  return (
    <div className="combobox" ref={wrapRef}>
      <div className="combobox-control">
        <input
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          value={selected?.label ?? 'Select an option'}
          readOnly
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        />
        <button
          type="button"
          className="combobox-caret"
          tabIndex={-1}
          aria-label="Toggle options"
          onClick={() => setOpen((current) => !current)}
        >
          ▾
        </button>
      </div>
      {open && (
        <ul className="combobox-list" role="listbox">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                className={`combobox-option combobox-option-simple${isSelected ? ' is-selected' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="combobox-name">{option.label}</span>
                {isSelected && <span className="combobox-selected-mark">✓</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function LiveModule({
  entity,
  title,
  columns,
  tableClassName,
  filter = '',
  createLabel,
  fields,
  canWrite,
  mineField,
  mineValue,
  rowFilter,
  metrics,
  quickFilters,
  prepareValues,
  actions,
  actionLabel = 'Action',
  archivable,
  renderCreate,
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
  const [quickFilter, setQuickFilter] = useState('all');

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
    let out = rows;
    const selectedQuickFilter = quickFilters?.(rows).find((item) => item.id === quickFilter);
    if (selectedQuickFilter) out = out.filter(selectedQuickFilter.matches);
    if (mineField && mineValue) {
      out = out.filter((r) => String(r[mineField] ?? '').toLowerCase() === mineValue.toLowerCase());
    }
    if (rowFilter) out = out.filter(rowFilter);
    return out;
  }, [rows, mineField, mineValue, rowFilter, quickFilter, quickFilters]);

  const quickFilterItems = useMemo(() => quickFilters?.(rows) ?? [], [quickFilters, rows]);

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
      const submittedValues = prepareValues ? prepareValues(values) : values;
      if (editing) await resourceService.update(entity, editing.id, submittedValues);
      else await resourceService.create(entity, submittedValues);
      notify(editing ? 'Record updated successfully!' : 'Record created successfully!');
      setOpen(false);
      await Promise.all([load(), reloadStats()]);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Something went wrong.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), reloadStats()]);
  }, [load, reloadStats]);

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
          reload: refreshAll,
        });
      }
    : undefined;

  return (
    <>
      {metrics && !showArchived && rows.length > 0 && <MetricsGrid metrics={metrics(rows)} />}
      {quickFilterItems.length > 0 && !showArchived && (
        <div className="quick-filter-bar" aria-label="Quick filters">
          <button type="button" className={quickFilter === 'all' ? 'active' : ''} onClick={() => setQuickFilter('all')}>All Categories</button>
          {quickFilterItems.map((item) => (
            <button key={item.id} type="button" className={quickFilter === item.id ? 'active' : ''} onClick={() => setQuickFilter(item.id)}>
              <span>{item.label}</span>{item.hint && <strong>{item.hint}</strong>}
            </button>
          ))}
        </div>
      )}
      <PanelHead
        title={showArchived ? `${title} · Archived` : title}
        action={
          <div className="panel-head-actions">
            {showArchiveToggle && (
              <button className="btn-action" type="button" onClick={() => setShowArchived((s) => !s)}>
                {showArchived ? 'View Active' : 'View Archived'}
              </button>
            )}
            {canWrite && !showArchived &&
              (renderCreate
                ? renderCreate({ reload: refreshAll })
                : fields && <ActionButton label={createLabel ?? 'Add New'} icon="plus-circle" onClick={openCreate} />)}
          </div>
        }
      />

      {loading ? (
        <p style={{ color: 'var(--muted)', padding: '8px 2px' }}>Loading…</p>
      ) : error ? (
        <p style={{ color: '#e25577', padding: '8px 2px' }}>{error}</p>
      ) : (
        <DataTable table={table} className={tableClassName} filter={filter} renderActions={renderActions} actionLabel={actionLabel} />
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
          {fields.filter((f) => !f.visibleWhen || f.visibleWhen(values)).map((f) => {
            const suggestions = f.suggestionsFromRows?.(rows) ?? [];
            return (
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
              ) : f.kind === 'select' && !f.readOnly && f.styledSelect ? (
                <StyledSelect
                  value={String(values[f.name] ?? '')}
                  options={f.optionList ?? (f.options ?? []).map((option) => ({ value: option, label: option }))}
                  onChange={(value) => setValues((previous) => ({ ...previous, [f.name]: value }))}
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
              ) : f.suggestionsFromRows ? (
                <AutocompleteInput
                  value={String(values[f.name] ?? '')}
                  suggestions={suggestions}
                  placeholder={f.placeholder}
                  readOnly={f.readOnly}
                  onChange={(value) => setValues((previous) => ({ ...previous, [f.name]: value }))}
                />
              ) : (
                <input
                  type={f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'}
                  placeholder={f.placeholder}
                  readOnly={f.readOnly}
                  min={f.kind === 'date' && !f.allowPast ? todayISO() : undefined}
                  value={String(values[f.name] ?? '')}
                  onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                />
              )}
              {f.hint && <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)' }}>{f.hint}</small>}
            </div>
            );
          })}
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
