/**
 * Frontend domain model — mirrors the backend contract in `backend/src/models`.
 * Keeping a typed copy here means the views never deal with `any`.
 */

export type Role =
  | 'customer'
  | 'zone-specialist'
  | 'general-manager'
  | 'inventory-officer'
  | 'technical-team';

export const ROLES: { value: Role; label: string }[] = [
  { value: 'customer', label: 'Customer' },
  { value: 'zone-specialist', label: 'Zone Specialist' },
  { value: 'general-manager', label: 'General Manager' },
  { value: 'inventory-officer', label: 'Inventory Officer' },
  { value: 'technical-team', label: 'Technical Team' },
];

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  avatarUrl?: string | null;
  createdAt: string;
}

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

export interface TableCell {
  text: string;
  strong?: boolean;
  status?: StatusTone;
  badge?: BadgeTone;
}

export interface TableRow {
  id: string;
  cells: TableCell[];
}

export interface ResourceTable {
  id: string;
  columns: string[];
  rows: TableRow[];
}

export interface DashboardData {
  role: Role;
  greeting: string;
  metrics: Metric[];
  tables: Record<string, ResourceTable>;
}

export interface AuthResponse {
  token: string;
  user: User;
}
