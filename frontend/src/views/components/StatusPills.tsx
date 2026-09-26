import type { TableCell } from '../../models/types';

/** Renders a single table cell respecting its status/badge/strong styling. */
export function Cell({ cell }: { cell: TableCell }) {
  if (cell.status && cell.meter !== undefined) {
    return (
      <span className="level-cell">
        <span className={`status ${cell.status}`}>{cell.text}</span>
        <span className={`level-meter ${cell.status}`} aria-hidden="true">
          <span style={{ width: `${Math.round(Math.min(1, Math.max(0, cell.meter)) * 100)}%` }} />
        </span>
      </span>
    );
  }
  if (cell.status) return <span className={`status ${cell.status}`}>{cell.text}</span>;
  if (cell.badge) return <span className={`badge badge-${cell.badge}`}>{cell.text}</span>;
  if (cell.swatch) return <span className="color-cell"><span className="color-swatch" style={{ background: cell.swatch }} />{cell.text}</span>;
  if (cell.strong) return <strong>{cell.text}</strong>;
  return <>{cell.text}</>;
}
