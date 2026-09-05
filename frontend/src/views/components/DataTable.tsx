import { useMemo } from 'react';
import type { ResourceTable } from '../../models/types';
import { Cell } from './StatusPills';
import { Icon } from './Icon';

interface DataTableProps {
  table: ResourceTable;
  className?: string;
  /** Optional free-text filter applied across every cell. */
  filter?: string;
  /** Optional action column rendered per row. */
  renderActions?: (rowId: string) => React.ReactNode;
  actionLabel?: string;
}

export function DataTable({ table, className = '', filter = '', renderActions, actionLabel = 'Action' }: DataTableProps) {
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return table.rows;
    return table.rows.filter((r) => r.cells.some((c) => c.text.toLowerCase().includes(q)));
  }, [table.rows, filter]);

  return (
    <section className={`panel invoice-table${className ? ` ${className}` : ''}`}>
      <div className="table-scroll" tabIndex={0} aria-label={`Scrollable ${table.id} table`}>
        <table role="table">
          <thead role="rowgroup">
            <tr role="row">
              {table.columns.map((col) => (
                <th role="columnheader" scope="col" key={col}>{col}</th>
              ))}
              {renderActions && <th role="columnheader" scope="col">{actionLabel}</th>}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((row) => (
              <tr role="row" key={row.id}>
                {row.cells.map((cell, i) => (
                  <td role="cell" key={i} data-label={table.columns[i]}>
                    <div className="table-cell-value"><Cell cell={cell} /></div>
                  </td>
                ))}
                {renderActions && (
                  <td role="cell" className="table-row-actions" data-label={actionLabel}>
                    <div className="action-group">{renderActions(row.id)}</div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr role="row">
                <td role="cell" className="table-empty" colSpan={table.columns.length + (renderActions ? 1 : 0)}>
                  <span className="table-empty-icon">
                    <Icon name="inbox" />
                  </span>
                  <strong>{filter ? 'No matching records' : 'Nothing here yet'}</strong>
                  <small>{filter ? 'Try a different search term.' : 'New entries will appear here once added.'}</small>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
