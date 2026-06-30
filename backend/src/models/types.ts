/**
 * Domain model — the single source of truth for the shapes that flow through
 * the API. The frontend mirrors these in its own `models/` directory.
 */

export type Role =
  | 'customer'
  | 'zone-specialist'
  | 'general-manager'
  | 'inventory-officer'
  | 'technical-team';

export const ROLES: Role[] = [
  'customer',
  'zone-specialist',
  'general-manager',
  'inventory-officer',
  'technical-team',
];

/** Stored user record. Never serialise `passwordHash` to clients. */
export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  passwordHash: string;
  avatarUrl?: string | null;
  createdAt: string;
}

/** Safe projection of a user for API responses. */
export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  avatarUrl?: string | null;
  createdAt: string;
}

/** Visual status pill variants reused across every table. */
export type StatusTone = 'paid' | 'pending' | 'overdue';
export type BadgeTone = 'high' | 'medium' | 'low';

export interface Metric {
  id: string;
  label: string;
  value: string;
  hint?: string;
  trend?: 'up' | 'down';
  icon: string;
  accent: 'customers' | 'revenue' | 'profit' | 'invoices';
}

/** A generic row used by the data-driven tables on the dashboards. */
export interface TableRow {
  id: string;
  cells: TableCell[];
}

export interface TableCell {
  text: string;
  strong?: boolean;
  status?: StatusTone;
  badge?: BadgeTone;
}

export interface ResourceTable {
  id: string;
  columns: string[];
  rows: TableRow[];
}

/** The complete payload the dashboard view renders for a given role. */
export interface DashboardData {
  role: Role;
  greeting: string;
  metrics: Metric[];
  tables: Record<string, ResourceTable>;
}
