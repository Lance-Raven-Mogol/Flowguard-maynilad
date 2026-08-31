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
async function settleStockDeduction(mrfId: string, user: PublicUser): Promise<void> {
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
    if (remaining === 0) {
      patch.status = 'out_of_stock';
    } else if (remaining <= Number(material.min_level ?? 0)) {
      patch.status = 'low_stock';
    } else {
      patch.status = 'in_stock';
    }
  }
  await repo.updateRow('materials', String(material.id), patch);
  await repo.updateRow('material_requests', mrfId, { stock_deducted: true });
  await logAudit('materials', String(material.id), 'stock_movement', user.fullName, user.role, {
    movement_type: 'stock_out',
    material_name: material.name,
    sku: material.sku,
    previous_quantity: available,
    new_quantity: remaining,
    quantity_change: -qty,
    unit: material.unit,
    reference: current.ref_code,
    reason: 'Material request released',
  });
}

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
    let rows = await repo.listRows(def.table, { archived });
    if (entity === 'payments' && user.role === 'customer') {
      const email = user.email.trim().toLowerCase();
      rows = rows.filter((row) => String(row.customer_email ?? '').trim().toLowerCase() === email);
    }
    if (entity === 'support-messages' && user.role === 'customer') {
      rows = rows.filter((row) => String(row.customer_id ?? '') === user.id);
    }
    if (entity === 'job-orders' && user.role === 'customer') {
      const ownIncidentRefs = new Set(
        (await repo.listRows('incidents', {}))
          .filter((incident) => String(incident.reported_by ?? '').trim().toLowerCase() === user.fullName.trim().toLowerCase())
          .map((incident) => String(incident.ref_code ?? '')),
      );
      rows = rows.filter((row) => ownIncidentRefs.has(String(row.incident_ref ?? '')));
    }
    // Non-GM roles only see their own material/purchase requests. The GM sees all
    // so they can review, approve, and release requests from every department.
    if (entity === 'material-requests' && user.role === 'inventory-officer') {
      // Inventory receives the GM-approved queue regardless of who requested it.
      // Keep already released rows visible as release history.
      rows = rows.filter((row) =>
        String(row.request_type ?? 'mrf') === 'mrf' &&
        ['approved', 'released'].includes(String(row.status ?? '')),
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
    }

    // Urgency is assessed by the Commercial Department or General Manager only.
    // Strip it entirely from customer submissions so it stays NULL until assessed.
    if (entity === 'incidents' && user.role === 'customer') {
      delete values.urgency;
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
    if (entity === 'job-orders') {
      if (user.role === 'technical-team' || user.role === 'contractor' || user.role === 'inhouse-team') {
        throw forbidden('Only the Commercial Department can create a job order after a complaint is resolved.');
      }
      const linkedIncidentRef = String(values.incident_ref ?? '').trim();
      if (!linkedIncidentRef) throw badRequest('A resolved complaint is required to create a job order.');
      const linkedIncident = (await repo.findRowsBy('incidents', 'ref_code', linkedIncidentRef))[0];
      if (!linkedIncident || linkedIncident.archived) throw badRequest(`Complaint "${linkedIncidentRef}" was not found.`);
      if (String(linkedIncident.status) !== 'resolved') {
        throw conflict('A job order can only be created after the complaint is Resolved.');
      }

      // Creation is intentionally unassigned. The Technical Team completes these
      // fields in the dedicated assignment step and starts the work order.
      values.status = 'pending';
      for (const field of ['team', 'team_name', 'team_leader', 'team_members', 'assigned_to', 'scheduled_date', 'estimated_cost']) {
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
      const incidentRef = String(values.incident_ref ?? '').trim();
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
        const existingBills = await repo.findRowsBy('payments', 'job_order_ref', jobOrderRef);
        if (existingBills.length > 0) throw conflict('A bill has already been issued for this Job Order.');
      }
      // Item-request-backed or manual bills (no job_order_ref) skip the above chain.

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
      await logAudit(entity, String(row.id ?? ''), 'create', user.fullName, user.role, auditDetails);
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
      if (!current || String(current.customer_email ?? '').trim().toLowerCase() !== user.email.trim().toLowerCase()) {
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
    if (entity === 'payments' && user.role === 'general-manager' && values.status === 'paid') {
      values.paid_date = new Date().toISOString().slice(0, 10);
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
        const allowed = new Set(['team', 'team_name', 'team_leader', 'team_members', 'assigned_to', 'scheduled_date', 'status']);
        for (const key of Object.keys(values)) if (!allowed.has(key)) delete values[key];
        if (!['in-house', 'contractor'].includes(String(values.team ?? ''))) {
          throw badRequest('Select whether the assigned team is in-house or a contractor.');
        }
        if (!String(values.team_name ?? '').trim()) throw badRequest('Team name is required.');
        if (!String(values.team_leader ?? '').trim()) throw badRequest('Team leader is required.');
        if (!Array.isArray(values.team_members) || values.team_members.length === 0) {
          throw badRequest('The team leader must be included in the assigned members.');
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

    // Role-based incident status transition guards.
    // The General Manager can always move to any status (management override).
    // Each role may only perform the transitions assigned to them:
    //   zone-specialist      : under_verification → in_progress (requires urgency set)
    //   technical-team       : in_progress → for_estimation (requires estimated_cost)
    //   commercial-department: for_estimation → for_billing (issue bill)
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
          // Urgency is set by Commercial Department, not Zone Specialist — no check needed here.
        } else if (user.role === 'technical-team') {
          // Technical team: only allowed to move in_progress → for_estimation (with cost).
          if (!(from === 'in_progress' && to === 'for_estimation')) {
            throw forbidden('Technical Team can only move complaints from In Progress to For Estimation.');
          }
          const cost = values.estimated_cost !== undefined ? Number(values.estimated_cost) : Number(currentIncident.estimated_cost ?? NaN);
          if (isNaN(cost) || cost <= 0) {
            throw badRequest('Please provide a valid estimated cost before submitting for estimation.');
          }
        } else if (user.role === 'commercial-department') {
          // Commercial dept: for_estimation → for_billing, for_billing → resolved (payment confirmed),
          // or for_billing → declined (payment rejected, customer may resubmit).
          const validTransitions = [
            ['for_estimation', 'for_billing'],
            ['for_billing', 'resolved'],
            ['for_billing', 'declined'],
            // After a rejection the customer resubmits → commercial dept can re-verify to resolved.
            ['declined', 'resolved'],
          ];
          const allowed = validTransitions.some(([f, t]) => f === from && t === to);
          if (!allowed) {
            throw forbidden('Commercial Department can only move: For Estimation → For Billing, For Billing → Resolved / Declined, or Declined → Resolved.');
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

    // Urgency can only be set by Commercial Department or General Manager.
    // Strip it from all other roles on update.
    if (entity === 'incidents' && !['commercial-department', 'general-manager'].includes(user.role) && 'urgency' in values) {
      delete values.urgency;
    }

    const currentMaterial = entity === 'materials' ? await repo.getRowById(def.table, id) : null;
    if (entity === 'materials' && !currentMaterial) throw notFound('Record not found.');

    if (entity === 'materials' && ('quantity' in values || 'min_level' in values)) {
      const current = currentMaterial!;
      if (!current) throw notFound('Record not found.');
      values.status = materialStockStatus(
        values.quantity ?? current.quantity,
        values.min_level ?? current.min_level,
        values.status ?? current.status,
      );
    }

    // Role-based material request status transition guards.
    // General Manager: can approve, reject, or release any request.
    // Inventory Officer: can ONLY release requests that are already approved by GM.
    // All other write roles: cannot change status at all.
    if (entity === 'material-requests' && 'status' in values && user.role !== 'general-manager') {
      const currentMrf = await repo.getRowById(def.table, id);
      if (!currentMrf) throw notFound('Record not found.');
      const from = String(currentMrf.status ?? '');
      const to = String(values.status ?? '');
      if (from !== to) {
        if (user.role === 'inventory-officer') {
          // Inventory Officer may only move approved → released.
          if (!(from === 'approved' && to === 'released')) {
            throw forbidden('Inventory Officers can only release requests that have already been approved by the General Manager.');
          }
        } else {
          // All other write roles (requester roles) cannot change status.
          throw forbidden('Only the General Manager can approve or reject material requests.');
        }
      }
    }

    // Approving/releasing a material request deducts its quantity from stock —
    // once. Runs before the status write so insufficient stock blocks approval.
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

    try {
      const row = await writeResilient(values, (v) => repo.updateRow(def.table, id, v), def.critical);
      if (!row) throw notFound('Record not found.');
      const previousQuantity = Number(currentMaterial?.quantity ?? 0);
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
          }
        : values;
      await logAudit(entity, id, 'update', user.fullName, user.role, auditDetails);
      return enrich(entity, row);
    } catch (err) {
      if (err instanceof Error && err.name === 'HttpError') throw err;
      mapDbError(err);
    }
  },

  async remove(entity: string, role: Role, id: string): Promise<void> {
    const def = getDef(entity);
    if (entity === 'support-messages') throw forbidden('Inquiry messages cannot be deleted.');
    if (!canWrite(def, role)) throw forbidden('You do not have permission to delete this record.');
    await repo.deleteRow(def.table, id);
    await logAudit(entity, id, 'delete', undefined, role, {});
  },
};
