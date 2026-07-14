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

/**
 * Deduct an approved material request's quantity from its linked inventory item
 * — exactly once. Idempotent via the `stock_deducted` flag, so re-approving or
 * editing an already-settled request never double-deducts. Requests with no SKU
 * (external procurement) settle without touching inventory. Throws when the
 * requested quantity exceeds available stock, blocking the approval.
 */
async function settleStockDeduction(mrfId: string): Promise<void> {
  const current = await repo.getRowById('material_requests', mrfId);
  if (!current) throw notFound('Material request not found.');
  if (current.stock_deducted) return; // already settled — no double deduction

  const sku = String(current.material_sku ?? '').trim();
  const qty = Number(current.quantity ?? 0);

  // External procurement (no inventory link) or a zero quantity: settle, no-op.
  if (!sku || !(qty > 0)) {
    await repo.updateRow('material_requests', mrfId, { stock_deducted: true });
    return;
  }

  const materials = await repo.findRowsBy('materials', 'sku', sku);
  const material = materials.find((m) => !m.archived) ?? materials[0];
  if (!material) throw badRequest(`No inventory item found for SKU "${sku}".`);

  const available = Number(material.quantity ?? 0);
  if (available < qty) {
    throw conflict(
      `Insufficient stock for "${material.name}" (${sku}): ${available} in stock, ${qty} requested.`,
    );
  }

  const remaining = available - qty;
  const patch: Row = { quantity: remaining };
  // Keep the stock status honest after the deduction (never override defective).
  if (material.status !== 'defective') {
    patch.status = remaining <= Number(material.min_level ?? 0) ? 'low_stock' : 'in_stock';
  }
  await repo.updateRow('materials', String(material.id), patch);
  await repo.updateRow('material_requests', mrfId, { stock_deducted: true });
}

export const resourceService = {
  async list(entity: string, archived?: 'only' | 'all'): Promise<Row[]> {
    const def = getDef(entity);
    const rows = await repo.listRows(def.table, { archived });
    return entity === 'assets' ? rows.map(withAssetHealth) : rows;
  },

  async create(entity: string, user: PublicUser, body: Record<string, unknown>): Promise<Row> {
    const def = getDef(entity);
    if (!canWrite(def, user.role)) throw forbidden('You do not have permission to create this record.');

    const values = sanitize(def, body);

    // A customer's complaint is always attributed to them (prevents spoofing
    // and keeps it linked through display-name changes).
    if (entity === 'incidents' && user.role === 'customer') {
      values.reported_by = user.fullName;
    }

    for (const field of def.required) {
      if (values[field] === undefined || values[field] === '' || values[field] === null) {
        throw badRequest(`"${field}" is required.`);
      }
    }
    for (const key of def.autoKeys ?? []) {
      if (!values[key.column]) values[key.column] = `${key.prefix}-${randDigits(key.digits)}`;
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
      await logAudit(entity, String(row.id ?? ''), 'create', user.fullName, user.role, values);
      // A job order dispatched for an incident schedules that incident.
      if (incidentRef) {
        try {
          await repo.updateRowsBy('incidents', 'ref_code', incidentRef, {
            status: 'scheduled',
            updated_at: new Date().toISOString(),
          });
        } catch (statusErr) {
          console.warn('[resource] job order created but incident status update failed:', statusErr);
        }
      }
      return enrich(entity, row);
    } catch (err) {
      mapDbError(err);
    }
  },

  async update(entity: string, role: Role, id: string, body: Record<string, unknown>): Promise<Row> {
    const def = getDef(entity);
    if (!canWrite(def, role)) throw forbidden('You do not have permission to update this record.');

    const values = sanitize(def, body);
    if (def.touch) values[def.touch] = new Date().toISOString();
    if (Object.keys(values).length === 0) throw badRequest('No valid fields to update.');

    // Approving/releasing a material request deducts its quantity from stock —
    // once. Runs before the status write so insufficient stock blocks approval.
    if (entity === 'material-requests' && (values.status === 'approved' || values.status === 'released')) {
      await settleStockDeduction(id);
    }

    try {
      const row = await writeResilient(values, (v) => repo.updateRow(def.table, id, v), def.critical);
      if (!row) throw notFound('Record not found.');
      await logAudit(entity, id, 'update', undefined, role, values);
      return enrich(entity, row);
    } catch (err) {
      if (err instanceof Error && err.name === 'HttpError') throw err;
      mapDbError(err);
    }
  },

  async remove(entity: string, role: Role, id: string): Promise<void> {
    const def = getDef(entity);
    if (!canWrite(def, role)) throw forbidden('You do not have permission to delete this record.');
    await repo.deleteRow(def.table, id);
    await logAudit(entity, id, 'delete', undefined, role, {});
  },
};
