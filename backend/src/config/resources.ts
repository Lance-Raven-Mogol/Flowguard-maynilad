/**
 * Resource registry — declarative config for the generic CRUD API. Each entry
 * maps a URL slug (e.g. /api/resources/incidents) to its table, the roles
 * allowed to write, validation, auto-generated keys and type coercion.
 *
 * Reads are open to any authenticated user; the general-manager can always
 * write (management override).
 */
import type { Role } from '../models/types.js';

export interface AutoKey {
  column: string;
  prefix: string;
  digits: number;
}

export interface ResourceDef {
  table: string;
  /** Roles allowed to create/update/delete (general-manager is always allowed). */
  writeRoles: Role[];
  /** Whitelisted writable columns (everything else in the body is ignored). */
  allowed: string[];
  /** Fields that must be present and non-empty on create. */
  required: string[];
  /** Columns coerced to numbers before insert/update. */
  numeric?: string[];
  /** Columns that should become NULL when sent as an empty string. */
  nullable?: string[];
  /** Server-generated unique keys when not supplied. */
  autoKeys?: AutoKey[];
  /** Column bumped to "now" on every update (e.g. updated_at). */
  touch?: string;
  /**
   * Columns that MUST persist. If one is missing from the database (schema not
   * migrated), the write fails loudly with a clear error instead of silently
   * dropping the value and reporting a false success.
   */
  critical?: string[];
}

export const RESOURCES: Record<string, ResourceDef> = {
  incidents: {
    table: 'incidents',
    writeRoles: ['customer', 'zone-specialist', 'technical-team'],
    allowed: ['type', 'description', 'location', 'urgency', 'status', 'reported_by', 'remarks', 'images', 'archived'],
    required: ['description'],
    // Zone-specialist remarks have no fallback column — they must be stored, or
    // the save is a lie. Fail loudly (prompt a migration) rather than silently.
    critical: ['remarks'],
    autoKeys: [{ column: 'ref_code', prefix: 'INC', digits: 4 }],
    touch: 'updated_at',
  },

  'job-orders': {
    table: 'job_orders',
    writeRoles: ['technical-team'],
    allowed: [
      'incident_ref', 'title', 'scope', 'team', 'assigned_to',
      'team_name', 'team_leader', 'team_members',
      'estimated_cost', 'scheduled_date', 'status', 'archived',
    ],
    required: ['title'],
    numeric: ['estimated_cost'],
    nullable: ['scheduled_date'],
    autoKeys: [{ column: 'ref_code', prefix: 'JO-2026', digits: 3 }],
  },

  materials: {
    table: 'materials',
    writeRoles: ['inventory-officer'],
    allowed: ['sku', 'name', 'category', 'description', 'quantity', 'unit', 'unit_price', 'supplier', 'source', 'min_level', 'status', 'archived', 'weight_kg', 'size', 'color'],
    required: ['name'],
    numeric: ['quantity', 'unit_price', 'min_level', 'weight_kg'],
    autoKeys: [{ column: 'sku', prefix: 'SKU', digits: 5 }],
  },

  'material-requests': {
    table: 'material_requests',
    writeRoles: ['technical-team', 'inventory-officer'],
    allowed: ['material_sku', 'material_name', 'job_order_ref', 'quantity', 'requested_by', 'status', 'archived'],
    required: ['material_name'],
    numeric: ['quantity'],
    autoKeys: [{ column: 'ref_code', prefix: 'MR', digits: 4 }],
  },

  assets: {
    table: 'assets',
    writeRoles: ['technical-team', 'zone-specialist'],
    allowed: ['asset_tag', 'name', 'type', 'location', 'install_date', 'expected_lifespan_years', 'last_maintenance', 'condition', 'archived'],
    required: ['name'],
    numeric: ['expected_lifespan_years'],
    nullable: ['install_date', 'last_maintenance'],
    autoKeys: [{ column: 'asset_tag', prefix: 'AST', digits: 5 }],
  },

  advisories: {
    table: 'advisories',
    writeRoles: ['technical-team'],
    allowed: ['title', 'body', 'area', 'type', 'status', 'published_at', 'archived'],
    required: ['title'],
    nullable: ['published_at'],
  },

  'audit-logs': {
    table: 'audit_logs',
    writeRoles: [],
    allowed: ['entity', 'entity_id', 'action', 'actor', 'actor_role', 'details', 'archived'],
    required: ['entity', 'action'],
  },

  'purchase-requests': {
    table: 'purchase_requests',
    writeRoles: ['inventory-officer'],
    allowed: ['material_name', 'material_sku', 'quantity', 'unit', 'unit_price', 'total_cost', 'supplier', 'justification', 'requested_by', 'status', 'archived'],
    required: ['material_name'],
    numeric: ['quantity', 'unit_price', 'total_cost'],
    autoKeys: [{ column: 'ref_code', prefix: 'PR', digits: 4 }],
  },

  payments: {
    table: 'payments',
    writeRoles: ['general-manager'],
    allowed: ['customer_name', 'customer_email', 'amount', 'due_date', 'paid_date', 'status', 'notes', 'archived'],
    required: ['customer_name', 'amount'],
    numeric: ['amount'],
    nullable: ['due_date', 'paid_date'],
    autoKeys: [{ column: 'ref_code', prefix: 'PAY', digits: 5 }],
  },

  'supply-requests': {
    table: 'supply_requests',
    writeRoles: ['customer', 'zone-specialist', 'technical-team', 'inventory-officer'],
    allowed: ['item_name', 'quantity', 'reason', 'requested_by', 'requested_by_id', 'status', 'archived'],
    required: ['item_name'],
    numeric: ['quantity'],
    autoKeys: [{ column: 'ref_code', prefix: 'SR', digits: 4 }],
  },
};

export type ResourceSlug = keyof typeof RESOURCES;
