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
}

export const RESOURCES: Record<string, ResourceDef> = {
  incidents: {
    table: 'incidents',
    writeRoles: ['customer', 'zone-specialist', 'technical-team'],
    allowed: ['type', 'description', 'location', 'urgency', 'status', 'reported_by', 'archived'],
    required: ['description'],
    autoKeys: [{ column: 'ref_code', prefix: 'INC', digits: 4 }],
    touch: 'updated_at',
  },

  'job-orders': {
    table: 'job_orders',
    writeRoles: ['technical-team'],
    allowed: ['incident_ref', 'title', 'scope', 'team', 'assigned_to', 'estimated_cost', 'scheduled_date', 'status', 'archived'],
    required: ['title'],
    numeric: ['estimated_cost'],
    nullable: ['scheduled_date'],
    autoKeys: [{ column: 'ref_code', prefix: 'JO-2026', digits: 3 }],
  },

  materials: {
    table: 'materials',
    writeRoles: ['inventory-officer'],
    allowed: ['sku', 'name', 'category', 'description', 'quantity', 'unit', 'unit_price', 'supplier', 'source', 'min_level', 'status', 'archived'],
    required: ['name'],
    numeric: ['quantity', 'unit_price', 'min_level'],
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
};

export type ResourceSlug = keyof typeof RESOURCES;
