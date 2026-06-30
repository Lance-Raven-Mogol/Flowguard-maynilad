/**
 * In-memory user store — the fallback used only when Supabase is not
 * configured (e.g. local dev without keys). Seeded on boot. When Supabase is
 * configured, `userRepo` talks to the database instead and this is unused.
 */
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { Role, User } from './types.js';
import { SEED_USERS } from './seed.js';

class Store {
  private users: User[] = [];

  constructor() {
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

  updateUser(id: string, fields: { fullName?: string; email?: string; passwordHash?: string; role?: Role; avatarUrl?: string }): User | undefined {
    const user = this.users.find((u) => u.id === id);
    if (!user) return undefined;
    if (fields.fullName !== undefined) user.fullName = fields.fullName;
    if (fields.email !== undefined) user.email = fields.email.toLowerCase();
    if (fields.passwordHash !== undefined) user.passwordHash = fields.passwordHash;
    if (fields.role !== undefined) user.role = fields.role;
    if (fields.avatarUrl !== undefined) user.avatarUrl = fields.avatarUrl;
    return user;
  }
}

/** Singleton — one in-memory store per server process. */
export const store = new Store();
