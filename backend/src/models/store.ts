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
        otpEnabled: false,
      });
    }
  }

  findUserByEmail(email: string): User | undefined {
    return this.users.find((u) => u.email === email.toLowerCase());
  }

  findUserById(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  createUser(data: { fullName: string; email: string; role: Role; passwordHash: string; barangay?: string; isSenior?: boolean; seniorIdNumber?: string | null; termsAcceptedAt?: string | null; registrationDeadline?: string | null }): User {
    const user: User = {
      id: randomUUID(),
      fullName: data.fullName,
      email: data.email.toLowerCase(),
      role: data.role,
      passwordHash: data.passwordHash,
      createdAt: new Date().toISOString(),
      otpEnabled: false,
      barangay: data.barangay,
      isSenior: data.isSenior ?? false,
      seniorIdNumber: data.seniorIdNumber ?? null,
      termsAcceptedAt: data.termsAcceptedAt ?? null,
      registrationDeadline: data.registrationDeadline ?? null,
    };
    this.users.push(user);
    return user;
  }

  updateUser(id: string, fields: { fullName?: string; email?: string; passwordHash?: string; role?: Role; avatarUrl?: string; otpSecret?: string; otpEnabled?: boolean; barangay?: string; isSenior?: boolean; seniorIdNumber?: string | null; isArchived?: boolean; registrationDeadline?: string | null; accountNumber?: string | null }): User | undefined {
    const user = this.users.find((u) => u.id === id);
    if (!user) return undefined;
    if (fields.fullName !== undefined) user.fullName = fields.fullName;
    if (fields.email !== undefined) user.email = fields.email.toLowerCase();
    if (fields.passwordHash !== undefined) user.passwordHash = fields.passwordHash;
    if (fields.role !== undefined) user.role = fields.role;
    if (fields.avatarUrl !== undefined) user.avatarUrl = fields.avatarUrl;
    if (fields.otpSecret !== undefined) user.otpSecret = fields.otpSecret;
    if (fields.otpEnabled !== undefined) user.otpEnabled = fields.otpEnabled;
    if (fields.barangay !== undefined) user.barangay = fields.barangay;
    if (fields.isSenior !== undefined) user.isSenior = fields.isSenior;
    if (fields.seniorIdNumber !== undefined) user.seniorIdNumber = fields.seniorIdNumber;
    if (fields.isArchived !== undefined) user.isArchived = fields.isArchived;
    if (fields.registrationDeadline !== undefined) user.registrationDeadline = fields.registrationDeadline;
    if (fields.accountNumber !== undefined) user.accountNumber = fields.accountNumber;
    return user;
  }

  findUserByAccountNumber(accountNumber: string): User | undefined {
    return this.users.find((u) => u.accountNumber === accountNumber);
  }

  /** Same rule as userRepo.deactivateOverdueCustomers, for the in-memory store. */
  deactivateOverdueCustomers(nowIso: string): User[] {
    const now = Date.parse(nowIso);
    const overdue = this.users.filter((u) =>
      u.role === 'customer' && !u.isArchived && !u.accountNumber &&
      Boolean(u.registrationDeadline) && Date.parse(u.registrationDeadline!) <= now);
    for (const u of overdue) u.isArchived = true;
    return overdue;
  }
}

/** Singleton — one in-memory store per server process. */
export const store = new Store();
