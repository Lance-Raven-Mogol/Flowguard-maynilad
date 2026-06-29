import type { TableCell } from '../../models/types';

/** Renders a single table cell respecting its status/badge/strong styling. */
export function Cell({ cell }: { cell: TableCell }) {
  if (cell.status) return <span className={`status ${cell.status}`}>{cell.text}</span>;
  if (cell.badge) return <span className={`badge badge-${cell.badge}`}>{cell.text}</span>;
  if (cell.strong) return <strong>{cell.text}</strong>;
  return <>{cell.text}</>;
}
