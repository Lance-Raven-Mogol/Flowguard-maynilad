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
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 12pt/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; padding: 16px; }
  @media print { body { padding: 0; } }
  header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 16px; }
  header .brand { font-size: 10pt; letter-spacing: .08em; text-transform: uppercase; color: #555; }
  header h1 { font-size: 20pt; margin: 2px 0 4px; }
  header .meta { font-size: 10pt; color: #555; }
  /* Long refs, emails and descriptions wrap instead of running off the page. */
  td, th, dd, p, span, strong { overflow-wrap: anywhere; }
  table { width: 100%; max-width: 100%; border-collapse: collapse; font-size: 11pt; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #eee; }
  .num, .charges-table td:first-child { text-align: right; white-space: nowrap; }
  .charges-table td:first-child { text-align: left; }
  tfoot th { font-size: 12pt; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 18px; margin: 0 0 14px; }
  dt { font-weight: 600; color: #444; }
  dd { margin: 0; }
  dl > div { display: contents; }
  .billing-amount-card { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; border: 2px solid #111; padding: 10px 14px; margin-bottom: 16px; }
  .billing-amount-card span { font-weight: 600; }
  .billing-amount-card strong { font-size: 20pt; }
  .billing-amount-card small { margin-left: auto; font-size: 11pt; color: #444; }
  img { max-width: 220px; max-height: 220px; margin: 4px 8px 4px 0; border: 1px solid #ccc; }
  /* Hide controls, but keep buttons that wrap images (photo / QR galleries). */
  button:not(:has(img)), select, input[type="file"] { display: none !important; }
  button:has(img) { border: 0; background: none; padding: 0; }
  .detail-section-title { font-weight: 700; font-size: 13pt; margin: 16px 0 6px; }
  footer { margin-top: 16px; font-size: 9pt; color: #777; }
  @page { margin: 12mm; }
  /* Investigation Form — filled in by hand on site. */
  .io-section { font-weight: 700; font-size: 12pt; margin: 14px 0 6px; border-bottom: 1px solid #111; padding-bottom: 2px; }
  .io-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 24px; margin: 0 0 6px; }
  .io-grid dl { margin: 0; }
  .io-blank { display: inline-block; min-width: 180px; border-bottom: 1px solid #111; }
  .io-checks { display: flex; flex-wrap: wrap; gap: 6px 28px; margin: 4px 0 8px; }
  .io-lines div { border-bottom: 1px solid #111; height: 26px; }
  .io-materials td { height: 26px; }
  .io-materials th:first-child, .io-materials td:first-child { width: 32px; text-align: center; }
  .io-materials th:nth-child(3), .io-materials th:nth-child(4) { width: 90px; }
  .io-signs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; margin-top: 28px; }
  .io-sign div { border-bottom: 1px solid #111; height: 34px; }
  .io-sign span { display: block; font-size: 10pt; color: #333; margin-top: 2px; }
  .io-note { font-size: 10pt; color: #444; margin: 2px 0 8px; }
  .io-desc { border: 1px solid #999; padding: 6px 8px; min-height: 40px; margin: 0 0 6px; }
`;

/** Open a print window with the given body HTML under a standard FlowGuard header. */
export function printHtml(
  title: string,
  bodyHtml: string,
  printedBy?: string,
  landscape = false,
  footer = 'System-generated report.',
): void {
  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) {
    window.alert('Allow pop-ups for this site to print.');
    return;
  }
  const printedAt = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}${landscape ? '@page { size: landscape; }' : ''}</style></head><body>
<header>
  <div class="brand">FlowGuard · Maynilad Water Services</div>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Printed ${escapeHtml(printedAt)}${printedBy ? ` by ${escapeHtml(printedBy)}` : ''}</div>
</header>
${bodyHtml}
<footer>${escapeHtml(footer)}</footer>
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

/** What the printed Investigation Form is pre-filled with. Blank = a line to write on. */
export interface InvestigationFormData {
  refCode: string;
  filedOn: string;
  category: string;
  concern: string;
  urgency: string;
  description: string;
  customerName: string;
  serialNumber: string;
  address: string;
  barangay: string;
  visitDate: string;
}

/**
 * Investigation Form (#3): the Zone Specialist takes it to the complainant,
 * writes the findings and required materials by hand and has the registered
 * customer sign it. The Commercial Department then encodes it into FlowGuard.
 */
export function printInvestigationForm(data: InvestigationFormData, printedBy?: string): void {
  const value = (text: string) => (text.trim() ? escapeHtml(text) : '<span class="io-blank">&nbsp;</span>');
  const row = (label: string, text: string) => `<dl><div><dt>${escapeHtml(label)}</dt><dd>${value(text)}</dd></div></dl>`;
  const lines = (n: number) => `<div class="io-lines">${'<div></div>'.repeat(n)}</div>`;
  const materialRows = Array.from({ length: 8 }, (_, i) => `<tr><td>${i + 1}</td><td></td><td></td><td></td></tr>`).join('');
  const sign = (caption: string) => `<div class="io-sign"><div></div><span>${escapeHtml(caption)}</span></div>`;

  const body = `
<div class="io-grid">
  ${row('Ref No.', data.refCode)}
  ${row('Date Filed', data.filedOn)}
  ${row('Category', data.category)}
  ${row('Concern', data.concern)}
  ${row('Urgency', data.urgency)}
  ${row('Date of Visit', data.visitDate)}
</div>
<p class="io-section">Registered Customer</p>
<div class="io-grid">
  ${row('Name', data.customerName)}
  ${row('Serial No.', data.serialNumber)}
  ${row('Address', data.address)}
  ${row('Barangay', data.barangay)}
</div>
<p class="io-note">Complaint as filed:</p>
<div class="io-desc">${escapeHtml(data.description || '—')}</div>

<p class="io-section">Investigation (to be filled in by the Zone Specialist)</p>
<p class="io-note">Location of the problem:</p>
<div class="io-checks"><span>☐ Before the meter</span><span>☐ After the meter</span><span>☐ Not a leak / other</span></div>
<p class="io-note">Findings:</p>
${lines(6)}

<p class="io-section">Required Materials</p>
<table class="io-materials">
  <thead><tr><th>#</th><th>Material</th><th>Qty</th><th>Unit</th></tr></thead>
  <tbody>${materialRows}</tbody>
</table>

<div class="io-signs">
  ${sign('Registered Customer — printed name & signature / date')}
  ${sign('Zone Specialist — printed name & signature / date')}
</div>
<div class="io-signs">
  ${sign('Encoded by (Commercial Department) — name & signature / date')}
  <div></div>
</div>`;

  printHtml(
    'Investigation Form',
    body,
    printedBy,
    false,
    'Return the signed form to the Commercial Department for encoding.',
  );
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
    // Wide tables (e.g. Transaction History) fit better across the page.
    table.columns.length > 6,
  );
}
