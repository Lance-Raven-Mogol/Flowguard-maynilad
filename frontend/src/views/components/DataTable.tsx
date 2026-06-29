import { useMemo } from 'react';
import type { ResourceTable } from '../../models/types';
import { Cell } from './StatusPills';

interface DataTableProps {
  table: ResourceTable;
  /** Optional free-text filter applied across every cell. */
  filter?: string;
  /** Optional action column rendered per row. */
  renderActions?: (rowId: string) => React.ReactNode;
  actionLabel?: string;
}

export function DataTable({ table, filter = '', renderActions, actionLabel = 'Action' }: DataTableProps) {
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return table.rows;
    return table.rows.filter((r) => r.cells.some((c) => c.text.toLowerCase().includes(q)));
  }, [table.rows, filter]);

  return (
    <section className="panel invoice-table">
      <table>
        <thead>
          <tr>
            {table.columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
            {renderActions && <th>{actionLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell, i) => (
                <td key={i}>
                  <Cell cell={cell} />
                </td>
              ))}
              {renderActions && (
                <td>
                  <div className="action-group">{renderActions(row.id)}</div>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={table.columns.length + (renderActions ? 1 : 0)} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                No matching records.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
