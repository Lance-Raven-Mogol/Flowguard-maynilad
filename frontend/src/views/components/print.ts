/**
 * Print helpers — render a clean, self-contained document in a new window and
 * open the browser's print dialog. A separate window keeps the dashboard's own
 * `@media print` rules (used by the QR label) out of the way.
 */
import type { ResourceTable } from '../../models/types';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font: 11pt/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 24px; }
  header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 16px; }
  header .brand { font-size: 9pt; letter-spacing: .08em; text-transform: uppercase; color: #555; }
  header h1 { font-size: 16pt; margin: 2px 0 4px; }
  header .meta { font-size: 9pt; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { border: 1px solid #bbb; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #eee; }
  tr { page-break-inside: avoid; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0 0 12px; }
  dt { font-weight: 600; color: #444; }
  dd { margin: 0; }
  dl > div { display: contents; }
  img { max-width: 180px; max-height: 180px; margin: 4px 8px 4px 0; border: 1px solid #ccc; }
  button, select, input[type="file"] { display: none !important; }
  .detail-section-title { font-weight: 700; margin: 14px 0 6px; }
  footer { margin-top: 16px; font-size: 8.5pt; color: #777; }
  @page { margin: 14mm; }
`;

/** Open a print window with the given body HTML under a standard FlowGuard header. */
export function printHtml(title: string, bodyHtml: string, printedBy?: string): void {
  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) {
    window.alert('Allow pop-ups for this site to print.');
    return;
  }
  const printedAt = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}</style></head><body>
<header>
  <div class="brand">FlowGuard · Maynilad Water Services</div>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Printed ${escapeHtml(printedAt)}${printedBy ? ` by ${escapeHtml(printedBy)}` : ''}</div>
</header>
${bodyHtml}
<footer>System-generated report.</footer>
</body></html>`);
  win.document.close();
  win.focus();
  // Give images a moment to load before opening the dialog. `load` doesn't
  // fire reliably for document.write() in every browser, so fall back to a
  // timer — whichever comes first prints, once.
  let printed = false;
  const printOnce = () => {
    if (printed || win.closed) return;
    printed = true;
    win.print();
  };
  win.onload = printOnce;
  setTimeout(printOnce, 600);
}

/** Print a table model (e.g. what a LiveModule is showing) as a plain grid. */
export function printTable(title: string, table: ResourceTable, printedBy?: string): void {
  const head = table.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = table.rows.length
    ? table.rows
        .map((row) => `<tr>${row.cells.map((cell) => `<td>${escapeHtml(cell.text)}</td>`).join('')}</tr>`)
        .join('')
    : `<tr><td colspan="${table.columns.length}">No records.</td></tr>`;
  printHtml(
    title,
    `<p class="meta">${table.rows.length} record${table.rows.length === 1 ? '' : 's'}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
    printedBy,
  );
}
