/**
 * In-memory data store. Swappable for a real database later — every consumer
 * goes through this module rather than touching the arrays directly.
 */
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { DashboardData, Role, ResourceTable, TableRow, User } from './types.js';
import { SEED_DASHBOARDS, SEED_USERS } from './seed.js';

class Store {
  private users: User[] = [];
  private dashboards: Record<Role, DashboardData>;

  constructor() {
    // Deep clone seed dashboards so runtime mutations never corrupt the seed.
    this.dashboards = structuredClone(SEED_DASHBOARDS);
    for (const u of SEED_USERS) {
      this.users.push({
        id: randomUUID(),
        fullName: u.fullName,
        email: u.email.toLowerCase(),
        role: u.role,
        passwordHash: bcrypt.hashSync(u.password, 10),
        createdAt: new Date().toISOString(),
      });
    }
  }

  // --- Users ---------------------------------------------------------------
  findUserByEmail(email: string): User | undefined {
    return this.users.find((u) => u.email === email.toLowerCase());
  }

  findUserById(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  createUser(data: { fullName: string; email: string; role: Role; passwordHash: string }): User {
    const user: User = {
      id: randomUUID(),
      fullName: data.fullName,
      email: data.email.toLowerCase(),
      role: data.role,
      passwordHash: data.passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    return user;
  }

  // --- Dashboards ----------------------------------------------------------
  getDashboard(role: Role): DashboardData {
    return this.dashboards[role];
  }

  getTable(role: Role, tableId: string): ResourceTable | undefined {
    return this.dashboards[role]?.tables[tableId];
  }

  /** Prepend a freshly created row to a role's table. Returns the new row. */
  addRow(role: Role, tableId: string, row: TableRow): TableRow | undefined {
    const table = this.getTable(role, tableId);
    if (!table) return undefined;
    table.rows.unshift(row);
    return row;
  }
}

/** Singleton — one in-memory store per server process. */
export const store = new Store();
