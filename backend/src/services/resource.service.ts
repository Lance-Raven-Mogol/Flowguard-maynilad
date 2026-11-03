/**
 * Resource service — business logic for the generic CRUD API: role checks,
 * field whitelisting + coercion, auto-generated keys, asset health enrichment,
 * and translation of Postgres errors into HTTP errors.
 */
import { RESOURCES, type ResourceDef } from '../config/resources.js';
import * as repo from '../models/resourceRepo.js';
import type { Row, DbError } from '../models/resourceRepo.js';
import type { PublicUser, Role } from '../models/types.js';
import { withAssetHealth } from './assetHealth.js';
import { badRequest, conflict, forbidden, notFound, serviceUnavailable } from '../utils/httpError.js';

/* ---------------------------------------------------------- Audit logging */
async function logAudit(
  entity: string,
  entityId: string | undefined,
  action: string,
  actor: string | undefined,
  actorRole: string | undefined,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await repo.insertRow('audit_logs', {
      entity,
      entity_id: entityId ?? null,
      action,
      actor: actor ?? null,
      actor_role: actorRole ?? null,
      details,
    });
  } catch (err) {
    console.warn('[audit] failed to write audit log:', err);
  }
}

function getDef(entity: string): ResourceDef {
  const def = RESOURCES[entity];
  if (!def) throw notFound(`Unknown resource "${entity}".`);
  return def;
}

function canWrite(def: ResourceDef, role: Role): boolean {
  return role === 'general-manager' || def.writeRoles.includes(role);
}

/** Derive the inventory status from the material's current stock levels. */
function materialStockStatus(quantity: unknown, minLevel: unknown, requestedStatus?: unknown): string {
  if (requestedStatus === 'defective') return 'defective';
  const stock = Number(quantity ?? 0);
  const minimum = Number(minLevel ?? 10);
  if (stock <= 0) return 'out_of_stock';
  if (stock <= minimum) return 'low_stock';
  return 'in_stock';
}

/* ------------------------------------------------ Complaint charges (#2/#16) */
/** Concerns normally covered by the utility — no Bill To needed at verification. */
const FREE_INCIDENT_TYPES = new Set(['odor-water', 'dirty-water', 'low-pressure', 'no-water']);
const MAX_CHARGE_LINES = 30;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface ChargeLine {
  kind: 'material' | 'labor' | 'fee' | 'discount';
  description: string;
  material_sku: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
}

/**
 * Validate the Technical Team's itemized charges. Material lines are priced
 * from inventory (never trusted from the client); labor and fees carry their
 * own amount. Returns the lines and the total amount due.
 */
async function normalizeCharges(raw: unknown): Promise<{ charges: ChargeLine[]; total: number }> {
  if (!Array.isArray(raw) || raw.length === 0) throw badRequest('Add at least one charge (materials, labor, or other fees).');
  if (raw.length > MAX_CHARGE_LINES) throw badRequest(`A complaint can have at most ${MAX_CHARGE_LINES} charge lines.`);
  const charges: ChargeLine[] = [];
  for (const entry of raw as Row[]) {
    const kind = String(entry.kind ?? '');
    if (kind === 'material') {
      const sku = String(entry.material_sku ?? '').trim();
      const material = sku ? await materialBySku(sku) : undefined;
      if (!material || material.archived) throw badRequest(`No active inventory item found for SKU "${sku}".`);
      const qty = Number(entry.quantity);
      if (!Number.isInteger(qty) || qty <= 0) throw badRequest(`Enter a whole-number quantity for "${material.name}".`);
      const price = Number(material.unit_price ?? 0);
      if (!(price > 0)) throw badRequest(`"${material.name}" has no unit price in inventory — set it in the Material List first.`);
      charges.push({
        kind: 'material', description: String(material.name ?? sku), material_sku: sku,
        quantity: qty, unit: String(material.unit ?? 'units'), unit_price: price, amount: round2(qty * price),
      });
    } else if (kind === 'labor' || kind === 'fee') {
      const description = String(entry.description ?? '').trim();
      const amount = round2(Number(entry.amount));
      if (!description) throw badRequest(`Describe each ${kind === 'labor' ? 'labor' : 'fee'} charge.`);
      if (!(amount > 0)) throw badRequest(`Enter an amount greater than 0 for "${description}".`);
      charges.push({ kind, description, material_sku: '', quantity: 1, unit: '', unit_price: amount, amount });
    } else {
      throw badRequest('Each charge must be a material, labor, or fee.');
    }
  }
  return { charges, total: round2(charges.reduce((sum, line) => sum + line.amount, 0)) };
}

/** Senior citizen discount on a customer's bill (Terms and Conditions). */
const SENIOR_DISCOUNT_RATE = 0.2;

/**
 * Apply the senior citizen discount to a new bill: a negative "discount" line
 * is appended to the breakdown and the amount due is reduced. Only for a bill
 * owner whose account is marked as a senior citizen.
 */
async function applySeniorDiscount(values: Row): Promise<void> {
  const owner = values.customer_id ? await repo.getRowById('app_users', String(values.customer_id)) : null;
  if (!owner || owner.role !== 'customer' || owner.is_senior !== true) {
    throw badRequest('The senior citizen discount is only for customers registered as senior citizens.');
  }
  const base = round2(Number(values.amount));
  if (!(base > 0)) return;
  const discount = round2(base * SENIOR_DISCOUNT_RATE);
  const lines: ChargeLine[] = Array.isArray(values.charges) && values.charges.length > 0
    ? [...(values.charges as ChargeLine[])]
    : [{ kind: 'fee', description: String(values.service_description || 'Service charge'), material_sku: '', quantity: 1, unit: '', unit_price: base, amount: base }];
  const idNo = String(owner.senior_id_number ?? '').trim();
  lines.push({
    kind: 'discount',
    description: `Senior citizen discount (${SENIOR_DISCOUNT_RATE * 100}%)${idNo ? ` — SC ID ${idNo}` : ''}`,
    material_sku: '', quantity: 1, unit: '', unit_price: -discount, amount: -discount,
  });
  values.charges = lines;
  values.amount = round2(base - discount);
}

const SITE_VISIT_FIELDS = ['site_visit_date', 'site_visit_period', 'site_visit_companions', 'site_visit_materials', 'site_visit_notes'];
const MAX_SITE_VISIT_ITEMS = 30;

/**
 * Validates the structured Site Visit Plan (#19): a visit date + AM/PM, the
 * people coming along, and the inventory items to bring. Material names and
 * units are taken from inventory, not trusted from the client.
 */
async function normalizeSiteVisit(values: Row): Promise<void> {
  const date = String(values.site_visit_date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw badRequest('Select the date of the site visit.');
  }
  values.site_visit_date = date;
  const period = String(values.site_visit_period ?? '');
  if (period !== 'AM' && period !== 'PM') throw badRequest('Select AM or PM for the site visit.');

  const companions = Array.isArray(values.site_visit_companions) ? values.site_visit_companions : [];
  const names = [...new Set(companions.map((name) => String(name).trim()).filter(Boolean))];
  if (names.length > MAX_SITE_VISIT_ITEMS) throw badRequest('Too many companions on the site visit.');
  values.site_visit_companions = names;

  const raw = Array.isArray(values.site_visit_materials) ? (values.site_visit_materials as Row[]) : [];
  if (raw.length > MAX_SITE_VISIT_ITEMS) throw badRequest('Too many materials on the site visit.');
  const materials: Row[] = [];
  for (const entry of raw) {
    const sku = String(entry.material_sku ?? '').trim();
    const material = sku ? await materialBySku(sku) : undefined;
    if (!material || material.archived) throw badRequest(`No active inventory item found for SKU "${sku}".`);
    const qty = Number(entry.quantity);
    if (!Number.isInteger(qty) || qty <= 0) throw badRequest(`Enter a whole-number quantity for "${material.name}".`);
    if (materials.some((m) => m.material_sku === sku)) throw badRequest(`"${material.name}" is listed twice.`);
    materials.push({ material_sku: sku, name: String(material.name ?? sku), quantity: qty, unit: String(material.unit ?? 'units') });
  }
  values.site_visit_materials = materials;
  values.site_visit_notes = String(values.site_visit_notes ?? '').trim();
}

/** Payment method stored for cash paid in person at the office. */
const CASH_WALK_IN = 'Cash (Walk-in)';

const hasImages = (value: unknown): boolean => Array.isArray(value) && value.length > 0;

const randDigits = (n: number): string =>
  Math.floor(Math.random() * 10 ** n)
    .toString()
    .padStart(n, '0');

/** Whitelist + coerce a request body into a safe set of column values. */
function sanitize(def: ResourceDef, body: Record<string, unknown>): Row {
  const out: Row = {};
  for (const col of def.allowed) {
    if (!(col in body)) continue;
    let value = body[col];

    if (def.nullable?.includes(col) && (value === '' || value === undefined)) {
      value = null;
    } else if (def.numeric?.includes(col)) {
      if (value === '' || value === null || value === undefined) continue;
      const num = Number(value);
      if (Number.isNaN(num)) throw badRequest(`"${col}" must be a number.`);
      value = num;
    } else if (typeof value === 'string') {
      value = value.trim();
    }
    out[col] = value;
  }
  return out;
}

function mapDbError(err: unknown): never {
  const e = err as DbError;
  if (e?.code === '23505') throw conflict('A record with that identifier already exists.');
  if (e?.code === '23514') throw badRequest('One of the fields has an invalid value.');
  if (e?.code === '23502') throw badRequest('A required field is missing.');
  throw err as Error;
}

/**
 * If the DB reports a column that doesn't exist yet (schema not migrated),
 * return its name so the caller can drop it and retry. Keeps the app working
 * when newer optional columns (e.g. incidents.images / remarks) haven't been
 * applied yet — those fields simply won't persist until the migration is run.
 */
function missingColumn(err: unknown): string | null {
  const e = err as DbError;
  const code = e?.code;
  const msg = e?.message ?? '';
  if (code === 'PGRST204' || code === '42703' || /column/i.test(msg)) {
    const m = msg.match(/'([^']+)' column/) || msg.match(/column "?([a-z0-9_]+)"?/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Run a write, dropping any not-yet-migrated OPTIONAL columns and retrying.
 * A missing *critical* column instead raises a clear 503 — never a silent,
 * false-success write that discards the caller's data.
 */
async function writeResilient<T>(values: Row, run: (v: Row) => Promise<T>, critical: string[] = []): Promise<T> {
  const v: Row = { ...values };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await run(v);
    } catch (err) {
      const col = missingColumn(err);
      if (col && col in v) {
        if (critical.includes(col)) {
          throw serviceUnavailable(
            `The database is missing the "${col}" column, so it could not be saved. ` +
              'Apply the schema migration (backend/supabase/schema.sql) and try again.',
          );
        }
        delete v[col];
        console.warn(`[resource] column "${col}" not found — dropping it. Run the schema migration to enable it.`);
        continue;
      }
      throw err;
    }
  }
  return run(v);
}

function enrich(entity: string, row: Row): Row {
  return entity === 'assets' ? withAssetHealth(row) : row;
}

/* ------------------------------------------------ Material request items */
/** One material line on an MRF. */
interface MrfItem { material_sku: string; material_name: string; quantity: number; unit: string; }

const MAX_MRF_ITEMS = 50;

/** The items on a request — its `items` list, or the legacy single-item columns. */
function mrfItems(row: Row): MrfItem[] {
  const list = Array.isArray(row.items) ? (row.items as Row[]) : [];
  const source = list.length
    ? list
    : [{ material_sku: row.material_sku, material_name: row.material_name, quantity: row.quantity, unit: row.unit }];
  return source.map((item) => ({
    material_sku: String(item.material_sku ?? '').trim(),
    material_name: String(item.material_name ?? '').trim(),
    quantity: Number(item.quantity ?? 0),
    unit: String(item.unit ?? '').trim(),
  }));
}

/** The active inventory row for a SKU, if any. */
async function materialBySku(sku: string): Promise<Row | undefined> {
  const rows = await repo.findRowsBy('materials', 'sku', sku);
  return rows.find((m) => !m.archived) ?? rows[0];
}

/**
 * Validate the materials on a new MRF. Accepts an `items` list (or the legacy
 * single material_* fields), takes names/units of linked items from inventory,
 * merges duplicate lines, and fills the summary columns shown in tables.
 */
async function normalizeMrfItems(values: Row, body: Record<string, unknown>): Promise<void> {
  const raw = Array.isArray(body.items) && body.items.length
    ? (body.items as Row[])
    : [{ material_sku: values.material_sku, material_name: values.material_name, quantity: values.quantity ?? 1 }];
  if (raw.length > MAX_MRF_ITEMS) throw badRequest(`An MRF can list at most ${MAX_MRF_ITEMS} materials.`);

  const items: MrfItem[] = [];
  for (const entry of raw) {
    const sku = String(entry.material_sku ?? '').trim();
    let name = String(entry.material_name ?? '').trim();
    let unit = String(entry.unit ?? '').trim();
    const qty = Number(entry.quantity);
    if (sku) {
      const material = await materialBySku(sku);
      if (!material || material.archived) throw badRequest(`No active inventory item found for SKU "${sku}".`);
      name = String(material.name ?? name);
      unit = String(material.unit ?? unit);
    }
    if (!name) throw badRequest('Each material needs a name.');
    if (!Number.isInteger(qty) || qty <= 0) throw badRequest(`Enter a whole-number quantity greater than 0 for "${name}".`);
    const same = items.find((item) => (sku ? item.material_sku === sku : !item.material_sku && item.material_name.toLowerCase() === name.toLowerCase()));
    if (same) same.quantity += qty;
    else items.push({ material_sku: sku, material_name: name, quantity: qty, unit });
  }
  if (!items.length) throw badRequest('Add at least one material.');

  values.items = items;
  values.material_name = items.length === 1 ? items[0].material_name : `${items[0].material_name} +${items.length - 1} more`;
  values.material_sku = items.length === 1 ? items[0].material_sku : '';
  values.quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  if (items.length === 1 && items[0].unit) values.unit = items[0].unit;
}

/** Units kept as safety stock — MRFs can never take a material below this. */
const safetyLevel = (material: Row): number => Math.max(0, Number(material.safety_level ?? 1));

/**
 * Check that inventory can cover every linked item on a request without
 * dipping into safety stock. Returns each
 * item with its inventory row; throws one error listing every shortage.
 * Custom (no-SKU) items are skipped — they are procured outside inventory.
 */
async function checkMrfStock(row: Row): Promise<Array<{ item: MrfItem; material: Row }>> {
  const lines: Array<{ item: MrfItem; material: Row }> = [];
  const problems: string[] = [];
  for (const item of mrfItems(row)) {
    if (!item.material_sku || !(item.quantity > 0)) continue;
    const material = await materialBySku(item.material_sku);
    if (!material) {
      problems.push(`"${item.material_name}" (${item.material_sku}) is no longer in inventory`);
      continue;
    }
    const reserve = safetyLevel(material);
    const available = Math.max(0, Number(material.quantity ?? 0) - reserve);
    if (available < item.quantity) {
      problems.push(`"${material.name}" (${item.material_sku}): ${available} available after ${reserve} safety stock, ${item.quantity} requested`);
      continue;
    }
    lines.push({ item, material });
  }
  if (problems.length) throw conflict(`Insufficient stock — ${problems.join('; ')}.`);
  return lines;
}

/**
 * Deduct every linked item on an approved material request from inventory —
 * exactly once. Idempotent via the `stock_deducted` flag. All items are
 * checked before any is deducted, so a shortage blocks the whole approval.
 */
async function settleStockDeduction(mrfId: string, user: PublicUser): Promise<void> {
  const current = await repo.getRowById('material_requests', mrfId);
  if (!current) throw notFound('Material request not found.');
  if (current.stock_deducted) return; // already settled — no double deduction

  const lines = await checkMrfStock(current);
  for (const { item, material } of lines) {
    const available = Number(material.quantity ?? 0);
    const remaining = available - item.quantity;
    const patch: Row = { quantity: remaining };
    // Keep the stock status honest after the deduction (never override defective).
    if (material.status !== 'defective') {
      patch.status = materialStockStatus(remaining, material.min_level);
    }
    await repo.updateRow('materials', String(material.id), patch);
    await logAudit('materials', String(material.id), 'stock_movement', user.fullName, user.role, {
      movement_type: 'stock_out',
      material_name: material.name,
      sku: material.sku,
      previous_quantity: available,
      new_quantity: remaining,
      quantity_change: -item.quantity,
      unit: material.unit,
      reference: current.ref_code,
      job_order_ref: current.job_order_ref ?? null,
      reason: 'Material request approved',
    });
  }
  await repo.updateRow('material_requests', mrfId, { stock_deducted: true });
}

/**
 * MRF workflow: Team Leader files → Inventory Officer verifies stock → General
 * Manager approves → Inventory Officer releases. Either reviewer can reject.
 */
const MRF_TRANSITIONS: Array<{ from: string; to: string; roles: Role[]; denied: string }> = [
  { from: 'pending', to: 'verified', roles: ['inventory-officer'], denied: 'Only the Inventory Officer can verify stock for a material request.' },
  { from: 'pending', to: 'rejected', roles: ['inventory-officer', 'general-manager'], denied: 'Only the Inventory Officer or General Manager can reject a material request.' },
  { from: 'verified', to: 'approved', roles: ['general-manager'], denied: 'Only the General Manager can approve a stock-verified material request.' },
  { from: 'verified', to: 'rejected', roles: ['general-manager'], denied: 'Only the General Manager can reject a stock-verified material request.' },
  { from: 'approved', to: 'released', roles: ['inventory-officer'], denied: 'Only the Inventory Officer can release approved materials.' },
];

const MRF_STATUS_LABEL: Record<string, string> = {
  pending: 'For Stock Verification',
  verified: 'For GM Approval',
  approved: 'For Release',
  released: 'Released',
  rejected: 'Rejected',
};

const isMrf = (row: Row) => (String(row.request_type ?? '').trim() || 'mrf') === 'mrf';

/**
 * When a purchase request is marked "received", add its quantity to inventory.
 * If a material with the same name already exists, restock it. Otherwise,
 * create a new inventory item using the purchase request's specs.
 * Idempotent via `stock_deducted` flag (reused as a "settled" marker).
 */
async function settlePurchaseReceived(prId: string, user: PublicUser): Promise<void> {
  const pr = await repo.getRowById('material_requests', prId);
  if (!pr) throw notFound('Purchase request not found.');
  if (pr.stock_deducted) return; // already settled — no double stock-in

  const name = String(pr.material_name ?? '').trim();
  const qty = Number(pr.quantity ?? 0);
  if (!name || !(qty > 0)) {
    await repo.updateRow('material_requests', prId, { stock_deducted: true });
    return;
  }

  // Try to find an existing non-archived material with the same name (case-insensitive).
  const allMaterials = await repo.listRows('materials', {});
  const existing = allMaterials.find(
    (m) => !m.archived && String(m.name ?? '').trim().toLowerCase() === name.toLowerCase(),
  );

  if (existing) {
    // Restock existing inventory item.
    const previous = Number(existing.quantity ?? 0);
    const newQty = previous + qty;
    const minLevel = Number(existing.min_level ?? 0);
    const patch: Row = {
      quantity: newQty,
      status: existing.status === 'defective' ? existing.status
        : newQty <= 0 ? 'out_of_stock'
        : newQty <= minLevel ? 'low_stock'
        : 'in_stock',
    };
    await repo.updateRow('materials', String(existing.id), patch);
    await repo.updateRow('material_requests', prId, { stock_deducted: true });
    await logAudit('materials', String(existing.id), 'stock_movement', user.fullName, user.role, {
      movement_type: 'stock_in',
      material_name: existing.name,
      sku: existing.sku,
      previous_quantity: previous,
      new_quantity: newQty,
      quantity_change: qty,
      unit: existing.unit,
      reference: pr.ref_code,
      reason: 'Purchase request received',
    });
  } else {
    // Create a new inventory item from the purchase request's specs.
    // Generate a SKU for it.
    const existingSkus = allMaterials.map((m) => String(m.sku ?? ''));
    let skuNum = Math.floor(10000 + Math.random() * 90000);
    let sku = `SKU-${skuNum}`;
    while (existingSkus.includes(sku)) {
      skuNum = Math.floor(10000 + Math.random() * 90000);
      sku = `SKU-${skuNum}`;
    }
    const minLevel = Number(pr.min_level ?? 10);
    const newItem: Row = {
      sku,
      name,
      category: pr.category ?? null,
      description: pr.description ?? null,
      quantity: qty,
      unit: pr.unit ?? 'units',
      unit_price: pr.unit_price ?? 0,
      supplier: pr.supplier ?? null,
      supplier_id: pr.supplier_id ?? null,
      source: pr.source ?? 'external',
      min_level: minLevel,
      weight_kg: pr.weight_kg ?? 0,
      size: pr.size ?? null,
      color: pr.color ?? null,
      status: qty <= 0 ? 'out_of_stock' : qty <= minLevel ? 'low_stock' : 'in_stock',
      archived: false,
    };
    const created = await repo.insertRow('materials', newItem);
    await repo.updateRow('material_requests', prId, { stock_deducted: true });
    await logAudit('materials', String(created?.id ?? ''), 'create', user.fullName, user.role, {
      movement_type: 'initial_stock',
      material_name: name,
      sku,
      previous_quantity: 0,
      new_quantity: qty,
      quantity_change: qty,
      unit: newItem.unit,
      reference: pr.ref_code,
      reason: 'New item added from purchase request',
    });
  }
}

/* ------------------------------------------------------ Waste management */
const WASTE_STATUS_LABEL: Record<string, string> = {
  pending_disposal: 'Pending Disposal',
  disposed: 'For GM Verification',
  verified: 'Verified',
  rejected: 'Rejected by GM',
};
const WASTE_VIEW_ROLES: Role[] = ['general-manager', 'inventory-officer', 'contractor', 'inhouse-team'];
const WASTE_CONDITIONS = ['fair', 'damaged'];
const MAX_DISPOSAL_PHOTOS = 5;

const sameName = (a: unknown, b: string) => String(a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A team leader reports a leftover material that is Not in Good Condition.
 * It must have been released to that (completed) job order; the record always
 * starts at pending_disposal, attributed to the caller.
 */
async function prepareWasteCreate(user: PublicUser, values: Row): Promise<void> {
  if (!['contractor', 'inhouse-team', 'general-manager'].includes(user.role)) {
    throw forbidden('Only the job order team leader can report materials that are not in good condition.');
  }
  const jobOrderRef = String(values.job_order_ref ?? '').trim();
  const jobOrder = (await repo.findRowsBy('job_orders', 'ref_code', jobOrderRef)).find((j) => !j.archived);
  if (!jobOrder) throw badRequest(`Job order ${jobOrderRef || '(none)'} was not found.`);
  if (String(jobOrder.status) !== 'completed') {
    throw conflict('Leftover materials can only be reported for a completed job order.');
  }
  if (user.role !== 'general-manager' && !sameName(jobOrder.team_leader, user.fullName)) {
    throw forbidden('Only the assigned team leader can report leftovers for this job order.');
  }

  const quantity = Number(values.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw badRequest('Quantity must be greater than zero.');

  // The material must have been released to this job order.
  const sku = String(values.material_sku ?? '').trim();
  const released = (await repo.findRowsBy('material_requests', 'job_order_ref', String(jobOrder.ref_code)))
    .filter((r) => String(r.status) === 'released' && !r.archived)
    .flatMap((r) => mrfItems(r).map((item) => ({ ...item, mrfId: String(r.id) })))
    .filter((item) => item.material_sku === sku);
  if (!sku || released.length === 0) {
    throw badRequest(`${sku || 'This material'} was not released to ${jobOrder.ref_code}.`);
  }
  const releasedQty = released.reduce((sum, item) => sum + item.quantity, 0);
  if (quantity > releasedQty) {
    throw badRequest(`Only ${releasedQty} ${released[0].unit} of ${sku} was released to ${jobOrder.ref_code}.`);
  }

  const condition = String(values.condition ?? 'damaged').toLowerCase();
  values.job_order_ref = jobOrder.ref_code;
  values.material_sku = sku;
  values.mrf_id = String(values.mrf_id ?? '').trim() || released[0].mrfId;
  values.unit = String(values.unit ?? '').trim() || released[0].unit;
  values.quantity = quantity;
  values.condition = WASTE_CONDITIONS.includes(condition) ? condition : 'damaged';
  values.remarks = String(values.remarks ?? '').trim().slice(0, 500);
  values.status = 'pending_disposal';
  values.reported_by = user.fullName;
  values.reported_by_id = user.id;
  values.reported_by_role = user.role;
  for (const key of ['disposal_method', 'disposal_location', 'disposal_images', 'disposal_notes', 'verification_notes', 'archived']) {
    delete values[key];
  }
}

/**
 * The two steps after a report: the Inventory Officer records the disposal
 * (method, location, photo proof), then the General Manager verifies it from
 * the photos — or rejects it with a reason, sending it back to the officer.
 * Returns exactly the columns to write; everything else in the body is ignored.
 */
async function prepareWasteUpdate(user: PublicUser, id: string, values: Row): Promise<Row> {
  const current = await repo.getRowById('waste_disposals', id);
  if (!current) throw notFound('Waste record not found.');
  const isGM = user.role === 'general-manager';
  const from = String(current.status ?? 'pending_disposal');
  const to = 'status' in values ? String(values.status ?? '') : from;
  const out: Row = {};
  const now = new Date().toISOString();

  if ('archived' in values) {
    if (!isGM) throw forbidden('Only the General Manager can archive waste records.');
    out.archived = values.archived === true;
  }

  if (to !== from) {
    if (to === 'disposed') {
      if (!['inventory-officer', 'general-manager'].includes(user.role)) {
        throw forbidden('Only the Inventory Officer can record a disposal.');
      }
      if (!['pending_disposal', 'rejected'].includes(from)) {
        throw conflict(`A record that is ${WASTE_STATUS_LABEL[from] ?? from} cannot be disposed again.`);
      }
      const method = String(values.disposal_method ?? '').trim();
      const location = String(values.disposal_location ?? '').trim();
      const photos = Array.isArray(values.disposal_images) ? values.disposal_images.filter((p) => typeof p === 'string' && p) : [];
      if (!method) throw badRequest('Select how the material was disposed.');
      if (!location) throw badRequest('Enter where the material was disposed.');
      if (photos.length === 0) throw badRequest('Attach at least one photo as proof of disposal.');
      if (photos.length > MAX_DISPOSAL_PHOTOS) throw badRequest(`Attach at most ${MAX_DISPOSAL_PHOTOS} photos.`);
      Object.assign(out, {
        status: 'disposed',
        disposal_method: method.slice(0, 80),
        disposal_location: location.slice(0, 200),
        disposal_images: photos,
        disposal_notes: String(values.disposal_notes ?? '').trim().slice(0, 500),
        disposed_by: user.fullName,
        disposed_by_id: user.id,
        disposed_at: now,
        verified_by: null,
        verified_at: null,
      });
    } else if (to === 'verified' || to === 'rejected') {
      if (!isGM) throw forbidden('Only the General Manager can verify a disposal.');
      if (from !== 'disposed') throw conflict('Only a recorded disposal can be verified.');
      const notes = String(values.verification_notes ?? '').trim().slice(0, 500);
      if (to === 'rejected' && !notes) throw badRequest('Give a reason so the Inventory Officer knows what to fix.');
      Object.assign(out, { status: to, verification_notes: notes, verified_by: user.fullName, verified_at: now });
    } else {
      throw badRequest(`A record that is ${WASTE_STATUS_LABEL[from] ?? from} cannot be moved to ${WASTE_STATUS_LABEL[to] ?? to}.`);
    }
  }

  if (Object.keys(out).length === 0) throw badRequest('Nothing to update on this waste record.');
  return out;
}

/** Audit details for a waste write — photos are counted, not copied into the log. */
function wasteAuditDetails(values: Row): Row {
  const { disposal_images: photos, ...rest } = values;
  return Array.isArray(photos) ? { ...rest, disposal_photo_count: photos.length } : rest;
}

export const resourceService = {
  async list(entity: string, user: PublicUser, archived?: 'only' | 'all'): Promise<Row[]> {
    const def = getDef(entity);
    if (entity === 'payments' && !['general-manager', 'commercial-department', 'customer'].includes(user.role)) {
      throw forbidden('You do not have permission to view billing records.');
    }
    if (entity === 'payment-methods' && !['general-manager', 'commercial-department'].includes(user.role)) {
      throw forbidden('Only the General Manager or Commercial Department can view payment profiles.');
    }
    if (entity === 'support-messages' && !['customer', 'commercial-department'].includes(user.role)) {
      throw forbidden('Only customers and the Commercial Department can view inquiries.');
    }
    if (entity === 'team-schedules' && !['technical-team', 'general-manager'].includes(user.role)) {
      throw forbidden('Only the Technical Department can view the team schedule.');
    }
    if (entity === 'waste-disposals' && !WASTE_VIEW_ROLES.includes(user.role)) {
      throw forbidden('Only the Inventory Officer and General Manager can view waste management.');
    }
    let rows = await repo.listRows(def.table, { archived });
    // Field teams only see the items they reported themselves.
    if (entity === 'waste-disposals' && ['contractor', 'inhouse-team'].includes(user.role)) {
      rows = rows.filter((row) => String(row.reported_by_id ?? '') === user.id);
    }
    if (entity === 'incidents' && user.role === 'customer') {
      const ownName = user.fullName.trim().toLowerCase();
      rows = rows.filter((row) =>
        String(row.reported_by_id ?? '') === user.id ||
        String(row.reported_by ?? '').trim().toLowerCase() === ownName ||
        String(row.bill_to_customer_id ?? '') === user.id,
      );
    }
    if (entity === 'payments' && user.role === 'customer') {
      const email = user.email.trim().toLowerCase();
      rows = rows.filter((row) =>
        String(row.customer_id ?? '') === user.id ||
        (!row.customer_id && String(row.customer_email ?? '').trim().toLowerCase() === email),
      );
    }
    if (entity === 'support-messages' && user.role === 'customer') {
      rows = rows.filter((row) => String(row.customer_id ?? '') === user.id);
    }
    if (entity === 'job-orders' && user.role === 'customer') {
      const ownIncidentRefs = new Set(
        (await repo.listRows('incidents', {}))
          .filter((incident) =>
            String(incident.reported_by_id ?? '') === user.id ||
            String(incident.reported_by ?? '').trim().toLowerCase() === user.fullName.trim().toLowerCase() ||
            String(incident.bill_to_customer_id ?? '') === user.id,
          )
          .map((incident) => String(incident.ref_code ?? '')),
      );
      rows = rows.filter((row) => ownIncidentRefs.has(String(row.incident_ref ?? '')));
    }
    // Non-GM roles only see their own material/purchase requests. The GM sees all
    // so they can review, approve, and release requests from every department.
    if (entity === 'material-requests' && user.role === 'inventory-officer') {
      // Inventory works every MRF (verify stock → release) regardless of who
      // requested it, plus the officer's own general/purchase requests.
      rows = rows.filter((row) =>
        isMrf(row) ||
        String(row.requested_by_id ?? '').trim() === user.id ||
        String(row.requested_by ?? '').trim().toLowerCase() === user.fullName.trim().toLowerCase(),
      );
    } else if (entity === 'material-requests' && user.role !== 'general-manager') {
      rows = rows.filter(
        (row) =>
          String(row.requested_by_id ?? '').trim() === user.id ||
          // Fallback for older rows that were saved before requested_by_id was added.
          String(row.requested_by ?? '').trim().toLowerCase() === user.fullName.trim().toLowerCase(),
      );
    }
    if (entity === 'payments') {
      const today = new Date().toISOString().slice(0, 10);
      rows = rows.map((row) => ({
        ...row,
        status: ['pending', 'unpaid'].includes(String(row.status)) && row.due_date && String(row.due_date) < today
          ? 'overdue'
          : row.status,
      }));
    }
    return entity === 'assets' ? rows.map(withAssetHealth) : rows;
  },

  async create(entity: string, user: PublicUser, body: Record<string, unknown>): Promise<Row> {
    const def = getDef(entity);
    const isTeamLeftoverLog =
      entity === 'audit-logs' &&
      ['contractor', 'inhouse-team'].includes(user.role) &&
      body.action === 'leftover_log';
    if (!canWrite(def, user.role) && !isTeamLeftoverLog) throw forbidden('You do not have permission to create this record.');

    const values = sanitize(def, body);

    if (isTeamLeftoverLog) {
      const details = (values.details ?? {}) as Record<string, unknown>;
      const jobOrderRef = String(details.job_order_ref ?? '').trim();
      const jobOrder = (await repo.findRowsBy('job_orders', 'ref_code', jobOrderRef))[0];
      const isLeader = String(jobOrder?.team_leader ?? '').trim().toLowerCase() === user.fullName.trim().toLowerCase();
      if (!jobOrder || String(jobOrder.status) !== 'completed' || !isLeader) {
        throw forbidden('Only the assigned team leader can log leftovers for a completed job order.');
      }
      values.actor = user.fullName;
      values.actor_role = user.role;
    }

    // A customer's complaint is always attributed to them (prevents spoofing
    // and keeps it linked through display-name changes).
    if (entity === 'incidents' && user.role === 'customer') {
      values.reported_by = user.fullName;
      values.reported_by_id = user.id;
    }

    // Urgency is assessed exclusively by the Commercial Department. Never trust
    // this field from another role even if a client manually includes it.
    if (entity === 'incidents' && user.role !== 'commercial-department') {
      delete values.urgency;
    }

    // Every complaint needs photo evidence.
    if (entity === 'incidents' && !hasImages(values.images)) {
      throw badRequest('Attach at least one photo of the concern.');
    }

    if (entity === 'support-messages') {
      const message = String(values.message ?? '').trim();
      if (!message) throw badRequest('Message cannot be empty.');
      if (message.length > 2000) throw badRequest('Message must be 2,000 characters or fewer.');

      values.message = message;
      values.sender_id = user.id;
      values.sender_name = user.fullName;
      values.sender_role = user.role;

      if (user.role === 'customer') {
        values.customer_id = user.id;
        values.customer_name = user.fullName;
        values.customer_email = user.email;
      } else if (user.role === 'commercial-department') {
        const customerId = String(values.customer_id ?? '').trim();
        if (!customerId) throw badRequest('Select a customer conversation first.');
        const customer = await repo.getRowById('app_users', customerId);
        if (!customer || customer.role !== 'customer') throw badRequest('Customer account was not found.');
        values.customer_name = customer.full_name;
        values.customer_email = customer.email;
      } else {
        throw forbidden('Only customers and the Commercial Department can send inquiry messages.');
      }

      const linkedIncidentRef = String(values.incident_ref ?? '').trim();
      if (linkedIncidentRef) {
        const incident = (await repo.findRowsBy('incidents', 'ref_code', linkedIncidentRef))[0];
        if (!incident || String(incident.reported_by ?? '').trim().toLowerCase() !== String(values.customer_name).trim().toLowerCase()) {
          throw badRequest('The selected incident does not belong to this customer.');
        }
        values.incident_ref = linkedIncidentRef;
      } else {
        values.incident_ref = '';
      }
    }

    if (entity === 'material-requests') {
      // Requests always start at the beginning of their workflow, filed by the caller.
      values.status = 'pending';
      values.requested_by = user.fullName;
      values.requested_by_id = user.id;
      if (isMrf(values)) {
        values.request_type = 'mrf';
        if (['customer', 'zone-specialist'].includes(user.role)) {
          throw forbidden('Material Request Forms are filed by job order team leaders.');
        }
        const jobOrderRef = String(values.job_order_ref ?? '').trim();
        if (jobOrderRef) {
          const jobOrder = (await repo.findRowsBy('job_orders', 'ref_code', jobOrderRef)).find((j) => !j.archived);
          if (!jobOrder) throw badRequest(`Job order ${jobOrderRef} was not found.`);
          if (!['pending', 'in_progress'].includes(String(jobOrder.status))) {
            throw conflict('Materials can only be requested for an ongoing job order.');
          }
          const isLeader = String(jobOrder.team_leader ?? '').trim().toLowerCase() === user.fullName.trim().toLowerCase();
          if (['contractor', 'inhouse-team'].includes(user.role) && !isLeader) {
            throw forbidden('Only the team leader of this job order can request its materials.');
          }
        } else if (['contractor', 'inhouse-team'].includes(user.role)) {
          throw badRequest('Select the job order these materials are for.');
        }
        await normalizeMrfItems(values, body);
      } else {
        delete values.items;
      }
    }

    if (entity === 'waste-disposals') await prepareWasteCreate(user, values);

    for (const field of def.required) {
      if (values[field] === undefined || values[field] === '' || values[field] === null) {
        throw badRequest(`"${field}" is required.`);
      }
    }
    for (const key of def.autoKeys ?? []) {
      if (!values[key.column]) values[key.column] = `${key.prefix}-${randDigits(key.digits)}`;
    }

    if (entity === 'materials') {
      values.status = materialStockStatus(values.quantity, values.min_level, values.status);
    }
    if (entity === 'team-schedules') {
      const member = await repo.getRowById('app_users', String(values.member_id ?? ''));
      if (!member || member.is_archived || !['inhouse-team', 'contractor'].includes(String(member.role))) {
        throw badRequest('Select an active in-house or contractor account.');
      }
      if (!['AM', 'PM', 'NO_WORK'].includes(String(values.schedule_period ?? ''))) {
        throw badRequest('Select AM, PM, or No Work for the schedule.');
      }
      values.member_name = member.full_name;
      values.member_role = member.role;
      values.source = 'manual';
      values.job_order_ref = null;
      const sameDay = (await repo.findRowsBy('team_schedules', 'member_id', member.id)).filter(
        (schedule) => !schedule.archived && String(schedule.schedule_date) === String(values.schedule_date),
      );
      if (values.schedule_period === 'NO_WORK' && sameDay.some((schedule) => schedule.source === 'job_order')) {
        throw conflict('This team member already has a Job Order on that date and cannot be marked No Work.');
      }
      if (values.schedule_period !== 'NO_WORK' && sameDay.some((schedule) => schedule.schedule_period === 'NO_WORK')) {
        throw conflict('Remove the existing No Work schedule before adding a work shift.');
      }
    }
    if (entity === 'job-orders') {
      if (user.role === 'technical-team' || user.role === 'contractor' || user.role === 'inhouse-team') {
        throw forbidden('Only the Commercial Department can create a job order.');
      }
      const linkedIncidentRef = String(values.incident_ref ?? '').trim();
      if (linkedIncidentRef) {
        const linkedIncident = (await repo.findRowsBy('incidents', 'ref_code', linkedIncidentRef))[0];
        if (!linkedIncident || linkedIncident.archived) throw badRequest(`Complaint "${linkedIncidentRef}" was not found.`);
        if (String(linkedIncident.status) !== 'resolved') {
          throw conflict('A job order linked to a complaint can only be created after the complaint is Resolved.');
        }
      } else {
        // Standalone JOs cover internal work such as asset maintenance. They use
        // the same pending -> Technical Team assignment workflow.
        values.incident_ref = '';
      }

      // Creation is intentionally unassigned. The Technical Team completes these
      // fields in the dedicated assignment step and starts the work order.
      values.status = 'pending';
      for (const field of ['team', 'team_name', 'team_leader', 'team_members', 'assigned_to', 'scheduled_date', 'schedule_period', 'scheduled_start_time', 'scheduled_end_time', 'estimated_cost']) {
        delete values[field];
      }
    }

    // Mirror the update rule: creating an advisory as "published" or "approved"
    // sets published_at immediately so it is visible to customers right away.
    // Technical-team can only create drafts — force status to draft regardless.
    if (entity === 'advisories') {
      if (user.role === 'technical-team') {
        values.status = 'draft';
      } else {
        if (values.status === 'published') values.status = 'approved';
        if (values.status === 'approved' && !values.published_at) {
          values.published_at = new Date().toISOString();
        }
      }
    }

    if (entity === 'payments') {
      let incidentRef = String(values.incident_ref ?? '').trim();
      const jobOrderRef = String(values.job_order_ref ?? '').trim();

      if (jobOrderRef) {
        // Job-order-backed bill: full validation chain.
        const completedJob = (await repo.findRowsBy('job_orders', 'ref_code', jobOrderRef))[0];
        if (!completedJob) throw badRequest(`Job order "${jobOrderRef}" was not found.`);
        if (completedJob.status !== 'completed') throw conflict('The linked Job Order must be Completed before a final bill can be issued.');
        const linkedIncidentRef = String(completedJob.incident_ref ?? '').trim();
        if (!linkedIncidentRef) throw badRequest('The completed Job Order is not linked to an incident.');
        if (incidentRef && incidentRef !== linkedIncidentRef) throw badRequest('The bill incident does not match the Job Order incident.');
        const incident = (await repo.findRowsBy('incidents', 'ref_code', linkedIncidentRef))[0];
        if (!incident) throw badRequest(`The Job Order's linked incident "${linkedIncidentRef}" was not found.`);
        values.incident_ref = linkedIncidentRef;
        incidentRef = linkedIncidentRef;
        const existingBills = await repo.findRowsBy('payments', 'job_order_ref', jobOrderRef);
        if (existingBills.length > 0) throw conflict('A bill has already been issued for this Job Order.');
      }
      // Incident bills always belong to the customer selected by the Zone
      // Specialist. The commercial client cannot accidentally bill the
      // complainant when the property/account owner is someone else.
      if (incidentRef) {
        const incident = (await repo.findRowsBy('incidents', 'ref_code', incidentRef))[0];
        if (!incident) throw badRequest(`Incident "${incidentRef}" was not found.`);
        if (incident.billable === false) {
          throw conflict('This complaint is covered by the utility (no charge) — no bill is issued.');
        }
        // Full payment: the bill is exactly the Technical Team's itemized total.
        if (Array.isArray(incident.charges) && incident.charges.length > 0 && Number(incident.estimated_cost) > 0) {
          values.amount = Number(incident.estimated_cost);
          values.charges = incident.charges;
        }
        const billToId = String(incident.bill_to_customer_id ?? '').trim();
        if (billToId) {
          const owner = await repo.getRowById('app_users', billToId);
          if (!owner || owner.role !== 'customer' || owner.is_archived) {
            throw badRequest('The billing owner selected for this incident is no longer an active customer.');
          }
          values.customer_id = owner.id;
          values.customer_name = owner.full_name;
          values.customer_email = owner.email;
          values.customer_serial_number = owner.serial_number ?? incident.bill_to_serial_number ?? '';
        }
      }
      // Item-request-backed or manual bills (no job_order_ref) skip the above chain.

      if (body.senior_discount === true) await applySeniorDiscount(values);

      values.status = 'unpaid';
    }

    // One active job order per incident — reject duplicates even if the UI is
    // bypassed. Checked before insert so no orphan row is ever created.
    const incidentRef = entity === 'job-orders' ? String(values.incident_ref ?? '').trim() : '';
    if (incidentRef) {
      const existing = (await repo.findRowsBy('job_orders', 'incident_ref', incidentRef)).filter(
        (r) => !r.archived,
      );
      if (existing.length) {
        throw conflict('A job order already exists for this incident.');
      }
    }

    try {
      const row = await writeResilient(values, (v) => repo.insertRow(def.table, v), def.critical);
      const auditDetails = entity === 'support-messages'
        ? {
            customer_id: values.customer_id,
            incident_ref: values.incident_ref,
            sender_role: values.sender_role,
            message_length: String(values.message ?? '').length,
          }
        : entity === 'materials'
        ? {
            ...values,
            movement_type: 'initial_stock',
            material_name: row.name,
            sku: row.sku,
            previous_quantity: 0,
            new_quantity: Number(row.quantity ?? 0),
            quantity_change: Number(row.quantity ?? 0),
          }
        : values;
      if (entity === 'waste-disposals') {
        // Filed as a leftover log on the MRF so Log Leftovers counts it as
        // already logged and Inventory History shows it.
        await logAudit('material-requests', String(row.mrf_id ?? ''), 'leftover_log', user.fullName, user.role, {
          description: `${user.fullName} reported ${row.quantity} ${row.unit ?? ''} of "${row.material_name}" (${row.material_sku}) as not in good condition — ${row.condition}`,
          job_order_ref: row.job_order_ref,
          material_name: row.material_name,
          material_sku: row.material_sku,
          qty_leftover: Number(row.quantity ?? 0),
          unit: row.unit,
          condition: row.condition,
          leftover_status: 'not_good_condition',
          restocked: false,
          waste_ref: row.ref_code,
        });
      } else {
        await logAudit(entity, String(row.id ?? ''), 'create', user.fullName, user.role, auditDetails);
      }
      return enrich(entity, row);
    } catch (err) {
      mapDbError(err);
    }
  },

  async update(entity: string, user: PublicUser, id: string, body: Record<string, unknown>): Promise<Row> {
    const def = getDef(entity);
    if (entity === 'support-messages') throw forbidden('Inquiry messages cannot be edited.');
    const isCustomerPayment = entity === 'payments' && user.role === 'customer';
    const isTeamMaterialReturn =
      entity === 'materials' &&
      ['contractor', 'inhouse-team'].includes(user.role) &&
      String(body.return_job_order_ref ?? '').trim() !== '';
    if (!canWrite(def, user.role) && !isCustomerPayment && !isTeamMaterialReturn) {
      throw forbidden('You do not have permission to update this record.');
    }

    const values = sanitize(def, body);
    if (entity === 'incidents' && user.role === 'customer') {
      const incident = await repo.getRowById(def.table, id);
      const isReporter = incident && (
        String(incident.reported_by_id ?? '') === user.id ||
        (!incident.reported_by_id && String(incident.reported_by ?? '').trim().toLowerCase() === user.fullName.trim().toLowerCase())
      );
      if (!isReporter) throw forbidden('Only the complainant can edit this complaint.');
    }
    if (isTeamMaterialReturn) {
      const jobOrderRef = String(body.return_job_order_ref).trim();
      const returnQty = Number(body.return_quantity);
      if (!Number.isFinite(returnQty) || returnQty <= 0) throw badRequest('Return quantity must be greater than zero.');
      const jobOrder = (await repo.findRowsBy('job_orders', 'ref_code', jobOrderRef))[0];
      if (!jobOrder || String(jobOrder.status) !== 'completed') {
        throw conflict('Leftover materials can only be returned for a completed job order.');
      }
      const isLeader = String(jobOrder.team_leader ?? '').trim().toLowerCase() === user.fullName.trim().toLowerCase();
      if (!isLeader) throw forbidden('Only the assigned team leader can return leftover materials.');
      const material = await repo.getRowById('materials', id);
      if (!material) throw notFound('Material not found.');
      values.quantity = Number(material.quantity ?? 0) + returnQty;
    }
    if (isCustomerPayment) {
      const current = await repo.getRowById(def.table, id);
      const ownsBill = current && (
        String(current.customer_id ?? '') === user.id ||
        (!current.customer_id && String(current.customer_email ?? '').trim().toLowerCase() === user.email.trim().toLowerCase())
      );
      if (!ownsBill) {
        throw notFound('Bill not found.');
      }
      if (!['pending', 'unpaid', 'overdue', 'rejected'].includes(String(current.status))) {
        throw conflict('This bill is not accepting a payment submission.');
      }
      const allowed = new Set(['payment_method', 'amount_paid', 'payment_date', 'payment_reference', 'payment_proof']);
      for (const key of Object.keys(values)) if (!allowed.has(key)) delete values[key];
      if (!values.payment_method || !values.payment_reference || !values.payment_proof || !values.amount_paid || !values.payment_date) {
        throw badRequest('Payment method, amount, date, reference number, and proof are required.');
      }
      if (values.payment_method === CASH_WALK_IN) {
        throw badRequest('Cash payments are made at the office and recorded by staff.');
      }
      values.status = 'for_verification';
      values.verification_notes = '';

      // When the customer resubmits on a rejected bill, flip the linked incident
      // from 'declined' back to 'for_billing' so commercial dept can re-verify.
      const incidentRef = String(current.incident_ref ?? '').trim();
      if (incidentRef) {
        try {
          const incidents = await repo.findRowsBy('incidents', 'ref_code', incidentRef);
          const incident = incidents.find((i) => !i.archived) ?? incidents[0];
          if (incident && String(incident.status ?? '') === 'declined') {
            await repo.updateRow('incidents', String(incident.id), {
              status: 'for_billing',
              updated_at: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.warn('[resource] payment resubmit: could not flip incident back to for_billing:', err);
        }
      }
    }
    // When a bill is settled — drives when it moves from Billing to Transaction History.
    if (entity === 'payments' && !isCustomerPayment && values.status === 'paid' && !values.paid_date) {
      values.paid_date = new Date().toISOString().slice(0, 10);
    }

    // Walk-in cash: staff record the payment against the official receipt —
    // no proof upload, and the bill is settled immediately.
    if (entity === 'payments' && !isCustomerPayment && values.payment_method === CASH_WALK_IN) {
      if (!['general-manager', 'commercial-department'].includes(user.role)) {
        throw forbidden('Only the Commercial Department or General Manager can record a cash payment.');
      }
      const current = await repo.getRowById(def.table, id);
      if (!current) throw notFound('Bill not found.');
      if (String(current.status) === 'paid') throw conflict('This bill is already paid.');
      const paidOn = String(values.payment_date ?? '').trim();
      if (!String(values.payment_reference ?? '').trim()) throw badRequest('Enter the Official Receipt (OR) number.');
      if (!(Number(values.amount_paid) > 0)) throw badRequest('Enter the amount received.');
      if (!paidOn) throw badRequest('Enter the payment date.');
      values.status = 'paid';
      values.paid_date = paidOn;
      values.payment_proof = [];
      values.recorded_by = user.fullName;

      // Settling the bill resolves its complaint, same as verifying an online payment.
      const incidentRef = String(current.incident_ref ?? '').trim();
      if (incidentRef) {
        const incident = (await repo.findRowsBy('incidents', 'ref_code', incidentRef)).find((i) => !i.archived);
        if (incident && ['for_billing', 'declined'].includes(String(incident.status))) {
          await repo.updateRow('incidents', String(incident.id), { status: 'resolved', updated_at: new Date().toISOString() });
        }
      }
    }

    if (entity === 'job-orders' && user.role !== 'general-manager') {
      const currentJob = await repo.getRowById(def.table, id);
      if (!currentJob) throw notFound('Job order not found.');
      const currentStatus = String(currentJob.status ?? 'pending');

      if (user.role === 'commercial-department') {
        const allowed = new Set(['title', 'scope', 'archived']);
        for (const key of Object.keys(values)) if (!allowed.has(key)) delete values[key];
      } else if (user.role === 'technical-team') {
        if (currentStatus !== 'pending') {
          throw forbidden('The Technical Team can assign only pending job orders.');
        }
        const allowed = new Set(['team', 'team_name', 'team_leader', 'team_members', 'assigned_to', 'scheduled_date', 'schedule_period', 'scheduled_start_time', 'scheduled_end_time', 'status']);
        for (const key of Object.keys(values)) if (!allowed.has(key)) delete values[key];
        if (!['in-house', 'contractor'].includes(String(values.team ?? ''))) {
          throw badRequest('Select whether the assigned team is in-house or a contractor.');
        }
        if (!String(values.team_name ?? '').trim()) throw badRequest('Team name is required.');
        if (!String(values.team_leader ?? '').trim()) throw badRequest('Team leader is required.');
        if (!Array.isArray(values.team_members) || values.team_members.length === 0) {
          throw badRequest('The team leader must be included in the assigned members.');
        }
        const scheduledDate = String(values.scheduled_date ?? '').trim();
        if (!scheduledDate) throw badRequest('Scheduled date is required.');
        if (!['AM', 'PM'].includes(String(values.schedule_period ?? ''))) {
          throw badRequest('Select an AM or PM schedule.');
        }
        const startTime = String(values.scheduled_start_time ?? '').trim();
        const endTime = String(values.scheduled_end_time ?? '').trim();
        if (!startTime || !endTime) throw badRequest('Job Order start and end times are required.');
        if (startTime >= endTime) throw badRequest('Job Order start time must be earlier than its end time.');
        const dateJobs = (await repo.listRows('job_orders', {})).filter(
          (job) => job.id !== id &&
            ['in_progress', 'completed'].includes(String(job.status)) &&
            String(job.scheduled_date).slice(0, 10) === scheduledDate,
        );
        const scheduledDay = (() => {
          const day = new Date(`${scheduledDate}T00:00:00Z`).getUTCDay();
          return day === 0 ? 7 : day;
        })();
        const rosterDate = `1970-01-${String(scheduledDay + 4).padStart(2, '0')}`;
        const weeklyRosterRows = (await repo.listRows('team_schedules', {})).filter(
          (schedule) =>
            String(schedule.schedule_date).slice(0, 10) === rosterDate &&
            String(schedule.activity ?? '').startsWith('WEEKLY_ROSTER:'),
        );
        for (const memberName of values.team_members.map(String)) {
          const normalizedName = memberName.trim().toLowerCase();
          const conflictingJob = dateJobs.find((job) => {
            const members = Array.isArray(job.team_members)
              ? job.team_members.map((member) => String(member).trim().toLowerCase())
              : [];
            const assignedNames = String(job.assigned_to ?? '').split(',').map((name) => name.trim().toLowerCase());
            return members.includes(normalizedName) || assignedNames.includes(normalizedName);
          });
          if (conflictingJob) {
            throw conflict(`${memberName} is already assigned to ${String(conflictingJob.ref_code ?? 'another Job Order')} on ${scheduledDate}.`);
          }
          const rosterRow = weeklyRosterRows.find(
            (schedule) => String(schedule.member_name ?? '').trim().toLowerCase() === normalizedName,
          );
          if (rosterRow) {
            try {
              const roster = JSON.parse(String(rosterRow.activity).slice('WEEKLY_ROSTER:'.length)) as Record<string, unknown>;
              const legacyNoWork = Boolean(roster.noWork);
              const isAM = values.schedule_period === 'AM';
              const noWorkValue = isAM ? roster.amNoWork : roster.pmNoWork;
              const noWork = noWorkValue === undefined ? legacyNoWork : Boolean(noWorkValue);
              if (noWork) {
                throw conflict(`${memberName} is marked No Work for ${String(values.schedule_period)} on this weekday.`);
              }
              const rosterStart = String(isAM ? roster.amStart ?? '08:00' : roster.pmStart ?? '13:00').slice(0, 5);
              const rosterEnd = String(isAM ? roster.amEnd ?? '12:00' : roster.pmEnd ?? '17:00').slice(0, 5);
              if (startTime < rosterStart || endTime > rosterEnd) {
                throw conflict(`${memberName} is only available from ${rosterStart} to ${rosterEnd} for this shift.`);
              }
            } catch (error) {
              if (error instanceof Error && error.name === 'HttpError') throw error;
              console.warn(`[resource] ignored an invalid weekly roster entry for ${memberName}.`);
            }
          }
        }
        values.status = 'in_progress';
      } else if (user.role === 'contractor' || user.role === 'inhouse-team') {
        const isLeader = String(currentJob.team_leader ?? '').trim().toLowerCase() === user.fullName.trim().toLowerCase();
        if (!isLeader) throw forbidden('Only the assigned team leader can update this job order.');
        for (const key of Object.keys(values)) if (key !== 'status') delete values[key];
        const nextStatus = String(values.status ?? '');
        if (currentStatus !== 'in_progress' || !['completed', 'cancelled'].includes(nextStatus)) {
          throw forbidden('The assigned team leader can only complete or cancel an ongoing job order.');
        }
      }
    }

    if (entity === 'team-schedules') {
      const currentSchedule = await repo.getRowById(def.table, id);
      if (!currentSchedule) throw notFound('Schedule not found.');
      if (currentSchedule.source === 'job_order') {
        throw forbidden('Job Order schedules update automatically from their Job Order.');
      }
      const memberId = String(values.member_id ?? currentSchedule.member_id ?? '');
      const member = await repo.getRowById('app_users', memberId);
      if (!member || member.is_archived || !['inhouse-team', 'contractor'].includes(String(member.role))) {
        throw badRequest('Select an active in-house or contractor account.');
      }
      const period = String(values.schedule_period ?? currentSchedule.schedule_period ?? '');
      if (!['AM', 'PM', 'NO_WORK'].includes(period)) throw badRequest('Select AM, PM, or No Work for the schedule.');
      values.member_id = member.id;
      values.member_name = member.full_name;
      values.member_role = member.role;
      values.source = 'manual';
      values.job_order_ref = null;
      const scheduleDate = String(values.schedule_date ?? currentSchedule.schedule_date ?? '');
      const sameDay = (await repo.findRowsBy('team_schedules', 'member_id', member.id)).filter(
        (schedule) => schedule.id !== id && !schedule.archived && String(schedule.schedule_date) === scheduleDate,
      );
      if (period === 'NO_WORK' && sameDay.some((schedule) => schedule.source === 'job_order')) {
        throw conflict('This team member already has a Job Order on that date and cannot be marked No Work.');
      }
      if (period !== 'NO_WORK' && sameDay.some((schedule) => schedule.schedule_period === 'NO_WORK')) {
        throw conflict('Remove the existing No Work schedule before adding a work shift.');
      }
    }
    // A complaint's photos can be replaced but not all removed (legacy rows
    // saved before photos were required may stay empty).
    if (entity === 'incidents' && 'images' in values && !hasImages(values.images)) {
      const currentIncident = await repo.getRowById(def.table, id);
      if (currentIncident && hasImages(currentIncident.images)) {
        throw badRequest('A complaint must keep at least one photo.');
      }
    }
    if (entity === 'incidents' && 'bill_to_customer_id' in values) {
      if (user.role !== 'zone-specialist' && user.role !== 'general-manager') {
        throw forbidden('Only the Zone Specialist can select the billing owner.');
      }
      if (user.role === 'zone-specialist') {
        const currentIncident = await repo.getRowById(def.table, id);
        if (!currentIncident || !String(currentIncident.site_action ?? '').trim()) {
          throw badRequest('Save the Site Visit Plan before selecting the billing owner.');
        }
      }
      const ownerId = String(values.bill_to_customer_id ?? '').trim();
      if (!ownerId) throw badRequest('Select the customer account that should receive the bill.');
      const owner = await repo.getRowById('app_users', ownerId);
      if (!owner || owner.role !== 'customer' || owner.is_archived) {
        throw badRequest('Select an active customer account as the billing owner.');
      }
      values.bill_to_customer_id = owner.id;
      values.bill_to_customer_name = owner.full_name;
      values.bill_to_serial_number = owner.serial_number ?? '';
    }
    if (
      entity === 'incidents' &&
      ('remarks' in values || 'site_action' in values || SITE_VISIT_FIELDS.some((f) => f in values)) &&
      user.role !== 'zone-specialist' &&
      user.role !== 'general-manager'
    ) {
      throw forbidden('Only the Zone Specialist can update the assessment and site visit plan.');
    }
    if (entity === 'incidents' && ('site_action' in values || SITE_VISIT_FIELDS.some((f) => f in values))) {
      const currentIncident = await repo.getRowById(def.table, id);
      if (!currentIncident) throw notFound('Record not found.');
      const previousPlan = String(currentIncident.site_action ?? '').trim();
      const nextPlan = String(values.site_action ?? previousPlan).trim();
      if (previousPlan) {
        // Locked: only a no-op resend of the same summary is tolerated.
        if (nextPlan !== previousPlan || SITE_VISIT_FIELDS.some((f) => f in values)) {
          throw conflict('The Site Visit Plan is locked after it has been saved.');
        }
      } else if (nextPlan) {
        // First save. The structured fields are required for new plans — the
        // plain-text-only form is gone; legacy rows simply keep their text.
        await normalizeSiteVisit(values);
        values.site_action = nextPlan;
        values.site_action_updated_at = new Date().toISOString();
      } else if (SITE_VISIT_FIELDS.some((f) => f in values)) {
        throw badRequest('The Site Visit Plan summary is missing.');
      }
    }
    if (entity === 'waste-disposals') {
      const prepared = await prepareWasteUpdate(user, id, values);
      for (const key of Object.keys(values)) delete values[key];
      Object.assign(values, prepared);
    }
    if (def.touch) values[def.touch] = new Date().toISOString();
    if (Object.keys(values).length === 0) throw badRequest('No valid fields to update.');

    // Approving an advisory publishes it immediately — no separate "published" step.
    // Also accept the legacy "published" value from older clients and treat it as approved.
    // Technical-team cannot change status at all — strip it from their updates.
    if (entity === 'advisories' && 'status' in values) {
      if (user.role === 'technical-team') {
        // Technical-team can only edit content (title, body, area, type) — never status.
        delete values.status;
        delete values.published_at;
      } else {
        if (values.status === 'published') values.status = 'approved';
        if (values.status === 'approved' && !values.published_at) {
          values.published_at = new Date().toISOString();
        }
      }
    }

    // Price: the Technical Team (or GM) prices an Ongoing complaint with a
    // breakdown; the total is always computed here from the lines.
    // Charge decision: at billing, the Commercial Department (or GM) either
    // bills that price or marks the complaint as no charge (→ Resolved).
    if (entity === 'incidents') {
      if (!['technical-team', 'general-manager'].includes(user.role)) {
        delete values.charges;
        delete values.estimated_cost;
      }
      if (!['commercial-department', 'general-manager'].includes(user.role)) delete values.billable;
      if ('estimated_cost' in values && !('charges' in values)) delete values.estimated_cost;
    }
    if (entity === 'incidents' && ('charges' in values || 'billable' in values)) {
      const currentIncident = await repo.getRowById(def.table, id);
      if (!currentIncident) throw notFound('Record not found.');
      const isGm = user.role === 'general-manager';
      if ('charges' in values) {
        if (String(currentIncident.status) !== 'in_progress' && !isGm) {
          throw conflict('The price can only be set while the complaint is Ongoing.');
        }
        const { charges, total } = await normalizeCharges(values.charges);
        values.charges = charges;
        values.estimated_cost = total;
        if (String(currentIncident.status) === 'in_progress') values.status = 'for_estimation';
      }
      if ('billable' in values) {
        if (values.billable === false) {
          if (String(currentIncident.status) !== 'for_estimation' && !isGm) {
            throw conflict('No charge can only be chosen when the complaint is Priced and not yet billed.');
          }
          values.status = 'resolved';
        } else {
          values.billable = true;
        }
      }
    }

    // Role-based incident status transition guards.
    // The General Manager can always move to any status (management override).
    // Each role may only perform the transitions assigned to them:
    //   zone-specialist      : under_verification → in_progress (requires urgency set)
    //   technical-team       : in_progress → for_estimation (requires the price breakdown)
    //   commercial-department: for_estimation → for_billing (issue bill)
    //                          for_estimation → resolved (no charge — billable = false)
    //                          for_billing → resolved (payment confirmed)
    if (entity === 'incidents' && user.role !== 'general-manager' && 'status' in values) {
      const currentIncident = await repo.getRowById(def.table, id);
      if (!currentIncident) throw notFound('Record not found.');
      const from = String(currentIncident.status ?? '');
      const to = String(values.status ?? '');

      // Allow no-op (same status) for any role.
      if (from !== to) {
        if (user.role === 'zone-specialist') {
          // Zone specialist: only allowed to move under_verification → in_progress.
          if (!(from === 'under_verification' && to === 'in_progress')) {
            throw forbidden('Zone Specialists can only move complaints from Under Verification to In Progress.');
          }
          const remarks = String(values.remarks ?? currentIncident.remarks ?? '').trim();
          if (!remarks) {
            throw badRequest('Add Zone Specialist remarks before moving the complaint to In Progress.');
          }
          if (!String(currentIncident.site_action ?? '').trim()) {
            throw badRequest('Save the Site Visit Plan before adding remarks.');
          }
          const billToId = String(values.bill_to_customer_id ?? currentIncident.bill_to_customer_id ?? '').trim();
          if (!billToId && !FREE_INCIDENT_TYPES.has(String(currentIncident.type ?? ''))) {
            throw badRequest('Select the customer account that should receive the bill before moving the complaint to In Progress.');
          }
          // Urgency is set by Commercial Department, not Zone Specialist — no check needed here.
        } else if (user.role === 'technical-team') {
          // Technical team: only prices an Ongoing complaint (→ Priced).
          if (!(from === 'in_progress' && to === 'for_estimation')) {
            throw forbidden('Technical Team can only price an Ongoing complaint.');
          }
          const cost = values.estimated_cost !== undefined ? Number(values.estimated_cost) : Number(currentIncident.estimated_cost ?? NaN);
          if (isNaN(cost) || cost <= 0) {
            throw badRequest('Add the price breakdown before submitting.');
          }
        } else if (user.role === 'commercial-department') {
          // Commercial dept: for_estimation → for_billing, for_billing → resolved (payment confirmed),
          // or for_billing → declined (payment rejected, customer may resubmit).
          const validTransitions = [
            ['for_estimation', 'for_billing'],
            // No charge chosen at billing — resolved without a bill.
            ...(values.billable === false ? [['for_estimation', 'resolved']] : []),
            ['for_billing', 'resolved'],
            ['for_billing', 'declined'],
            // After a rejection the customer resubmits → commercial dept can re-verify to resolved.
            ['declined', 'resolved'],
          ];
          const allowed = validTransitions.some(([f, t]) => f === from && t === to);
          if (!allowed) {
            throw forbidden('Commercial Department can only move: Priced → Billing (or No Charge → Resolved), Billing → Resolved / Declined, or Declined → Resolved.');
          }
        } else {
          // All other write roles (customer, zone-specialist already handled above)
          // cannot change incident status at all except their own assigned transitions.
          if (from === 'under_verification' && to !== 'under_verification') {
            throw forbidden('Only the Zone Specialist can move a complaint from Under Verification.');
          }
        }
      }
    }

    // Urgency can only be set by the Commercial Department.
    // Strip it from all other roles on update.
    if (entity === 'incidents' && user.role !== 'commercial-department' && 'urgency' in values) {
      delete values.urgency;
    }

    const currentMaterial = entity === 'materials' ? await repo.getRowById(def.table, id) : null;
    if (entity === 'materials' && !currentMaterial) throw notFound('Record not found.');
    // Read before the write — the row object may be updated in place.
    const previousQuantity = Number(currentMaterial?.quantity ?? 0);

    if (entity === 'materials' && ('quantity' in values || 'min_level' in values)) {
      const current = currentMaterial!;
      if (!current) throw notFound('Record not found.');
      values.status = materialStockStatus(
        values.quantity ?? current.quantity,
        values.min_level ?? current.min_level,
        values.status ?? current.status,
      );
    }

    // The materials on a request are fixed once filed.
    if (entity === 'material-requests') delete values.items;

    // Role-based material request status transition guards.
    if (entity === 'material-requests' && 'status' in values) {
      const currentMrf = await repo.getRowById(def.table, id);
      if (!currentMrf) throw notFound('Record not found.');
      const from = String(currentMrf.status ?? '');
      const to = String(values.status ?? '');
      if (from !== to && isMrf(currentMrf)) {
        // MRF: Inventory verifies stock → GM approves → Inventory releases.
        const step = MRF_TRANSITIONS.find((t) => t.from === from && t.to === to);
        if (!step) {
          throw badRequest(`A material request that is ${MRF_STATUS_LABEL[from] ?? from} cannot be moved to ${MRF_STATUS_LABEL[to] ?? to}.`);
        }
        if (!step.roles.includes(user.role)) throw forbidden(step.denied);
        const now = new Date().toISOString();
        if (to === 'verified') {
          await checkMrfStock(currentMrf);
          values.verified_by = user.fullName;
          values.verified_at = now;
        } else if (to === 'approved') {
          values.approved_by = user.fullName;
          values.approved_at = now;
        } else if (to === 'released') {
          values.released_by = user.fullName;
          values.released_at = now;
        }
      } else if (from !== to && user.role !== 'general-manager') {
        // General / purchase requests: GM approves or rejects; Inventory Officer
        // may only release a request the GM already approved.
        if (user.role === 'inventory-officer') {
          if (!(from === 'approved' && to === 'released')) {
            throw forbidden('Inventory Officers can only release requests that have already been approved by the General Manager.');
          }
        } else {
          throw forbidden('Only the General Manager can approve or reject requests.');
        }
      }
    }

    // Approving a material request deducts its items from stock — once. Runs
    // before the status write so insufficient stock blocks the approval.
    if (entity === 'material-requests' && (values.status === 'approved' || values.status === 'released')) {
      await settleStockDeduction(id, user);
    }

    // Receiving a purchase request adds its quantity to inventory — once.
    if (entity === 'material-requests' && values.status === 'received') {
      const pr = await repo.getRowById('material_requests', id);
      if (pr?.request_type === 'purchase') {
        await settlePurchaseReceived(id, user);
      }
    }

    // Confirm the derived schedule table is available before assigning the JO,
    // so a missing migration cannot leave the order assigned without a roster entry.
    if (entity === 'job-orders' && values.status === 'in_progress') {
      await repo.listRows('team_schedules', { archived: 'all' });
    }

    try {
      const row = await writeResilient(values, (v) => repo.updateRow(def.table, id, v), def.critical);
      if (!row) throw notFound('Record not found.');
      if (entity === 'job-orders' && row.status === 'in_progress' && row.scheduled_date) {
        const jobRef = String(row.ref_code ?? '');
        const names = Array.isArray(row.team_members) ? row.team_members.map(String) : [];
        await repo.deleteRowsBy('team_schedules', 'job_order_ref', jobRef);
        for (const name of names) {
          const matches = await repo.findRowsBy('app_users', 'full_name', name);
          const member = matches.find((candidate) =>
            !candidate.is_archived && ['inhouse-team', 'contractor'].includes(String(candidate.role)),
          );
          if (!member) continue;
          const memberSchedules = await repo.findRowsBy('team_schedules', 'member_id', member.id);
          for (const schedule of memberSchedules) {
            if (
              schedule.source !== 'job_order' &&
              schedule.schedule_period === 'NO_WORK' &&
              String(schedule.schedule_date) === String(row.scheduled_date)
            ) {
              await repo.deleteRow('team_schedules', String(schedule.id));
            }
          }
          await repo.insertRow('team_schedules', {
            member_id: member.id,
            member_name: member.full_name,
            member_role: member.role,
            schedule_date: row.scheduled_date,
            schedule_period: ['AM', 'PM'].includes(String(row.schedule_period)) ? row.schedule_period : 'AM',
            activity: `${jobRef}: ${String(row.title ?? 'Job Order')} (${String(row.scheduled_start_time ?? '').slice(0, 5)}–${String(row.scheduled_end_time ?? '').slice(0, 5)})`,
            source: 'job_order',
            job_order_ref: jobRef,
          });
        }
      }
      const newQuantity = Number(row.quantity ?? previousQuantity);
      const quantityChange = newQuantity - previousQuantity;
      const auditDetails = entity === 'materials'
        ? {
            ...values,
            movement_type: 'quantity' in values
              ? quantityChange > 0 ? 'stock_in' : quantityChange < 0 ? 'stock_out' : 'adjustment'
              : 'details_update',
            material_name: row.name,
            sku: row.sku,
            previous_quantity: previousQuantity,
            new_quantity: newQuantity,
            quantity_change: quantityChange,
            unit: row.unit,
            supplier: row.supplier,
            ...(isTeamMaterialReturn ? {
              returned_from_job_order: String(body.return_job_order_ref),
              returned_quantity: Number(body.return_quantity),
            } : {}),
            // Physical count from the Stock Count screen: system vs. actual.
            ...(body.stock_count === true && 'quantity' in values ? {
              movement_type: 'stock_count',
              reason: 'Physical stock count',
              reference: String(body.stock_count_note ?? '').trim() || 'Stock count',
              system_quantity: previousQuantity,
              counted_quantity: newQuantity,
              variance: quantityChange,
            } : {}),
          }
        : entity === 'waste-disposals'
        ? { ...wasteAuditDetails(values), ref_code: row.ref_code, material_name: row.material_name, job_order_ref: row.job_order_ref }
        : values;
      await logAudit(entity, id, 'update', user.fullName, user.role, auditDetails);
      return enrich(entity, row);
    } catch (err) {
      if (err instanceof Error && err.name === 'HttpError') throw err;
      mapDbError(err);
    }
  },

  async remove(entity: string, user: PublicUser, id: string): Promise<void> {
    const def = getDef(entity);
    if (entity === 'support-messages') throw forbidden('Inquiry messages cannot be deleted.');
    if (!canWrite(def, user.role)) throw forbidden('You do not have permission to delete this record.');
    if (entity === 'waste-disposals' && user.role !== 'general-manager') {
      throw forbidden('Waste records cannot be deleted. The General Manager can archive them.');
    }
    if (entity === 'team-schedules') {
      const schedule = await repo.getRowById(def.table, id);
      if (!schedule) throw notFound('Schedule not found.');
      if (schedule.source === 'job_order') {
        throw forbidden('Job Order schedules can only be changed from their Job Order.');
      }
    }
    if (entity === 'incidents' && user.role === 'customer') {
      const incident = await repo.getRowById(def.table, id);
      const isReporter = incident && (
        String(incident.reported_by_id ?? '') === user.id ||
        (!incident.reported_by_id && String(incident.reported_by ?? '').trim().toLowerCase() === user.fullName.trim().toLowerCase())
      );
      if (!isReporter) throw forbidden('Only the complainant can delete this complaint.');
    }
    await repo.deleteRow(def.table, id);
    await logAudit(entity, id, 'delete', user.fullName, user.role, {});
  },
};
