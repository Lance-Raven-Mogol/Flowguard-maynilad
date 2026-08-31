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
    writeRoles: ['customer', 'zone-specialist', 'technical-team', 'commercial-department'],
    allowed: ['type', 'description', 'location', 'urgency', 'status', 'reported_by', 'remarks', 'images', 'archived', 'estimated_cost'],
    required: ['description'],
    numeric: ['estimated_cost'],
    nullable: ['estimated_cost'],
    // Zone-specialist remarks have no fallback column — they must be stored, or
    // the save is a lie. Fail loudly (prompt a migration) rather than silently.
    critical: ['remarks', 'estimated_cost'],
    autoKeys: [{ column: 'ref_code', prefix: 'INC', digits: 4 }],
    touch: 'updated_at',
    // Valid incident statuses (informational — enforced in DB check constraint):
    // under_verification | in_progress | for_estimation | for_billing | resolved | cancelled | declined
  },

  'job-orders': {
    table: 'job_orders',
    // technical-team and commercial-department create/edit full job orders.
    // contractor and inhouse-team are team members who may update the status of
    // a job order they are leading — enforced on the frontend by checking that
    // the logged-in user's name matches the team_leader field. Including them
    // here so that their PATCH requests are not rejected by the write-role guard.
    writeRoles: ['technical-team', 'commercial-department', 'contractor', 'inhouse-team'],
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
    writeRoles: ['inventory-officer', 'technical-team'],
    allowed: ['sku', 'name', 'category', 'description', 'quantity', 'unit', 'unit_price', 'supplier', 'supplier_id', 'source', 'min_level', 'status', 'archived', 'weight_kg', 'size', 'color'],
    required: ['name'],
    numeric: ['quantity', 'unit_price', 'min_level', 'weight_kg'],
    nullable: ['supplier_id'],
    autoKeys: [{ column: 'sku', prefix: 'SKU', digits: 5 }],
  },

  suppliers: {
    table: 'suppliers',
    writeRoles: ['inventory-officer'],
    allowed: ['name', 'contact_person', 'email', 'phone', 'address', 'notes', 'status', 'archived'],
    required: ['name'],
  },

  'material-requests': {
    table: 'material_requests',
    // All roles can create requests; request_type determines the form variant:
    //   'mrf'      — formal Material Request Form, linked to inventory SKU / job order (technical-team, inventory-officer)
    //   'general'  — informal supply request open to all roles including customers
    //   'purchase' — procurement request with pricing & supplier (inventory-officer only, enforced frontend-side)
    writeRoles: ['customer', 'zone-specialist', 'technical-team', 'contractor', 'inhouse-team', 'inventory-officer'],
    allowed: [
      // shared
      'material_name', 'quantity', 'requested_by', 'requested_by_id', 'status', 'archived', 'request_type',
      // mrf
      'material_sku', 'job_order_ref',
      // general
      'reason',
      // general (customer fulfilment)
      'payment_option', 'delivery_address',
      // purchase
      'category', 'description', 'unit', 'min_level', 'weight_kg', 'size', 'color',
      'unit_price', 'total_cost', 'source', 'supplier', 'supplier_id', 'justification',
    ],
    required: ['material_name'],
    numeric: ['quantity', 'min_level', 'weight_kg', 'unit_price', 'total_cost'],
    nullable: ['supplier_id'],
    autoKeys: [{ column: 'ref_code', prefix: 'REQ', digits: 4 }],
  },

  assets: {
    table: 'assets',
    writeRoles: ['technical-team', 'zone-specialist', 'contractor', 'inhouse-team'],
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
    writeRoles: ['technical-team', 'inventory-officer'],
    allowed: ['entity', 'entity_id', 'action', 'actor', 'actor_role', 'details', 'archived'],
    required: ['entity', 'action'],
  },

  payments: {
    table: 'payments',
    writeRoles: ['general-manager', 'inventory-officer', 'commercial-department'],
    allowed: [
      'customer_name', 'customer_email', 'incident_ref', 'job_order_ref', 'service_description',
      'amount', 'due_date', 'paid_date', 'status', 'notes', 'archived',
      'payment_method', 'account_name', 'account_number', 'payment_qr',
      'amount_paid', 'payment_date', 'payment_reference', 'payment_proof', 'verification_notes',
    ],
    required: ['customer_name', 'customer_email', 'amount'],
    numeric: ['amount', 'amount_paid'],
    nullable: ['due_date', 'paid_date', 'payment_date'],
    autoKeys: [{ column: 'ref_code', prefix: 'PAY', digits: 5 }],
  },

  'payment-methods': {
    table: 'payment_methods',
    writeRoles: ['general-manager', 'commercial-department'],
    allowed: ['name', 'payment_method', 'account_name', 'account_number', 'payment_qr', 'archived'],
    required: ['name', 'payment_method', 'account_name'],
  },

  'support-messages': {
    table: 'support_messages',
    writeRoles: ['customer', 'commercial-department'],
    allowed: [
      'customer_id', 'customer_name', 'customer_email', 'incident_ref',
      'sender_id', 'sender_name', 'sender_role', 'message',
    ],
    required: ['customer_id', 'customer_name', 'sender_id', 'sender_name', 'sender_role', 'message'],
  },

};

export type ResourceSlug = keyof typeof RESOURCES;
