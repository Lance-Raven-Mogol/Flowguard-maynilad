/**
 * LiveModule — a self-contained, data-driven operational module. It fetches an
 * entity from the resource API, renders a metrics strip + table, and provides
 * create/edit (modal) and per-row actions (status changes, delete). Every
 * dashboard module is a thin configuration of this component.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  kind?: 'text' | 'textarea' | 'number' | 'date' | 'select';
  options?: string[];
  optionList?: { value: string; label: string }[];
  placeholder?: string;
  default?: string;
}

export interface ModuleColumn {
  header: string;
  cell: (row: EntityRow) => TableCell | string;
}

export interface RowActionCtx {
  row: EntityRow;
  busy: boolean;
  update: (values: Record<string, unknown>) => void;
  remove: () => void;
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
}: LiveModuleProps) {
  const { notify } = useToast();
  const { reload: reloadStats } = useStats();
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EntityRow | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await resourceService.list(entity));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load records.');
    } finally {
      setLoading(false);
    }
  }, [entity]);

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
    const init: Record<string, string> = {};
    fields?.forEach((f) => {
      init[f.name] = f.default ?? f.optionList?.[0]?.value ?? f.options?.[0] ?? '';
    });
    setValues(init);
    setOpen(true);
  };

  const openEdit = (row: EntityRow) => {
    setEditing(row);
    const init: Record<string, string> = {};
    fields?.forEach((f) => {
      init[f.name] = row[f.name] != null ? String(row[f.name]) : '';
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
          update: (vals) => runUpdate(row.id, vals),
          remove: () => runRemove(row.id),
          edit: () => openEdit(row),
        });
      }
    : undefined;

  return (
    <>
      {metrics && rows.length > 0 && <MetricsGrid metrics={metrics(rows)} />}
      <PanelHead
        title={title}
        action={
          canWrite && fields ? (
            <ActionButton label={createLabel ?? 'Add New'} icon="plus-circle" onClick={openCreate} />
          ) : undefined
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
              {f.kind === 'textarea' ? (
                <textarea
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                />
              ) : f.kind === 'select' ? (
                <select
                  value={values[f.name] ?? ''}
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
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </Modal>
      )}
    </>
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
