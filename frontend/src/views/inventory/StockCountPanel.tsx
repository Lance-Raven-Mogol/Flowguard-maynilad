/**
 * Stock Count mode — scan a material, enter what is physically on the shelf,
 * and save it. The system quantity is corrected to the actual count and the
 * variance is recorded in the inventory history / audit log.
 */
import { useState } from 'react';
import type { ResourceTable } from '../../models/types';
import { useStats } from '../../controllers/StatsContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { resourceService, type EntityRow } from '../../services/resourceService';
import { DataTable } from '../components/DataTable';
import { PanelHead } from '../components/panels';
import { ScanInput } from '../components/ScanInput';

interface CountEntry {
  id: string;
  sku: string;
  name: string;
  unit: string;
  system: number;
  actual: number;
  at: Date;
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

export function StockCountPanel() {
  const { stats, reload } = useStats();
  const { notify } = useToast();
  const [current, setCurrent] = useState<EntityRow | null>(null);
  const [actual, setActual] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<CountEntry[]>([]);

  const onScan = (sku: string) => {
    const match = stats.materials.find((m) => !m.archived && String(m.sku ?? '').toLowerCase() === sku.toLowerCase());
    if (!match) {
      notify(`No active material with SKU "${sku}".`, 'error');
      return;
    }
    setCurrent(match);
    setActual('');
    setNote('');
  };

  const system = Number(current?.quantity ?? 0);
  const counted = actual.trim() === '' ? null : Number(actual);
  const valid = counted !== null && Number.isInteger(counted) && counted >= 0;
  const variance = valid ? counted - system : 0;
  const unit = String(current?.unit ?? 'units');

  const save = async () => {
    if (!current || !valid) return notify('Enter the actual count as a whole number (0 or more).', 'error');
    setSaving(true);
    try {
      await resourceService.update('materials', String(current.id), {
        quantity: counted,
        stock_count: true,
        stock_count_note: note.trim(),
      });
      await reload();
      setSession((list) => [
        { id: `${current.id}-${Date.now()}`, sku: String(current.sku ?? ''), name: String(current.name ?? ''), unit, system, actual: counted, at: new Date() },
        ...list,
      ]);
      notify(variance === 0
        ? `${current.name}: count matches the system (${counted} ${unit}).`
        : `${current.name}: stock adjusted ${signed(variance)} ${unit} to ${counted}.`);
      setCurrent(null);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Could not save the count.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const table: ResourceTable = {
    id: 'stock-count-session',
    columns: ['Time', 'SKU', 'Material', 'System', 'Actual', 'Variance'],
    rows: session.map((entry) => ({
      id: entry.id,
      cells: [
        { text: entry.at.toLocaleTimeString('en-PH', { timeStyle: 'short' }) },
        { text: entry.sku, strong: true },
        { text: entry.name },
        { text: `${entry.system} ${entry.unit}` },
        { text: `${entry.actual} ${entry.unit}` },
        entry.actual === entry.system
          ? { text: 'Match', status: 'paid' as const }
          : { text: `${signed(entry.actual - entry.system)} ${entry.unit}`, status: 'overdue' as const },
      ],
    })),
  };

  return (
    <>
      <PanelHead title="Stock Count" />
      <section className="panel stock-count">
        <p className="stock-count-help">
          Scan a material's QR label or barcode (camera or USB scanner), count what is on the shelf, then save.
          The system quantity is corrected to the actual count and the difference is logged in Inventory History.
        </p>
        <ScanInput onScan={onScan} />

        {current && (
          <div className="stock-count-card">
            <div className="stock-count-item">
              <small>{String(current.sku ?? '')}</small>
              <strong>{String(current.name ?? '')}</strong>
              <span>{String(current.category ?? 'Uncategorized')}</span>
            </div>
            <div className="stock-count-figures">
              <div><span>System</span><strong>{system} {unit}</strong></div>
              <div className="form-group">
                <label htmlFor="stock-count-actual">Actual count</label>
                <input
                  id="stock-count-actual"
                  type="number"
                  min={0}
                  step={1}
                  autoFocus
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
                />
              </div>
              <div className={`stock-count-variance${!valid ? '' : variance === 0 ? ' is-ok' : ' is-off'}`}>
                <span>Variance</span>
                <strong>{!valid ? '—' : variance === 0 ? 'Match' : `${signed(variance)} ${unit}`}</strong>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="stock-count-note">Note (optional)</label>
              <input id="stock-count-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 pcs damaged, moved to defective" />
            </div>
            <div className="stock-count-actions">
              <button type="button" className="btn-secondary" onClick={() => setCurrent(null)} disabled={saving}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving || !valid}>
                {saving ? 'Saving…' : variance === 0 ? 'Confirm Count' : 'Save & Adjust Stock'}
              </button>
            </div>
          </div>
        )}
      </section>

      {session.length > 0 && (
        <>
          <PanelHead title={`Counted this session (${session.length})`} />
          <DataTable table={table} />
        </>
      )}
    </>
  );
}
