/**
 * User repository — the single data-access layer for user accounts.
 *
 * When Supabase is configured it persists to the `app_users` table; otherwise
 * it transparently falls back to the in-memory store so local development and
 * tests keep working without any external service.
 */
import bcrypt from 'bcryptjs';
import { supabase } from './supabase.js';
import { store } from './store.js';
import { SEED_USERS } from './seed.js';
import type { PublicUser, Role, User } from './types.js';

const TABLE = 'app_users';

/** DB row shape (snake_case) → domain `User` (camelCase). */
interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  password_hash: string;
  avatar_url: string | null;
  created_at: string;
  start_date: string | null;
  is_archived: boolean;
  barangay: string | null;
  otp_secret: string | null;
  otp_enabled: boolean;
}

function fromRow(row: UserRow): User {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    startDate: row.start_date,
    isArchived: row.is_archived ?? false,
    barangay: row.barangay ?? 'Boac',
    otpSecret: row.otp_secret ?? undefined,
    otpEnabled: row.otp_enabled ?? false,
  };
}

export interface NewUser {
  fullName: string;
  email: string;
  role: Role;
  passwordHash: string;
  startDate?: string;
  barangay?: string;
}

export const userRepo = {
  async findByEmail(email: string): Promise<User | undefined> {
    const normalized = email.toLowerCase();
    if (!supabase) return store.findUserByEmail(normalized);

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('email', normalized)
      .maybeSingle<UserRow>();
    if (error) throw new Error(`Supabase findByEmail failed: ${error.message}`);
    return data ? fromRow(data) : undefined;
  },

  async findById(id: string): Promise<User | undefined> {
    if (!supabase) return store.findUserById(id);

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle<UserRow>();
    if (error) throw new Error(`Supabase findById failed: ${error.message}`);
    return data ? fromRow(data) : undefined;
  },

  async create(input: NewUser): Promise<User> {
    if (!supabase) return store.createUser(input);

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        full_name: input.fullName,
        email: input.email.toLowerCase(),
        role: input.role,
        password_hash: input.passwordHash,
        start_date: input.startDate ?? new Date().toISOString().slice(0, 10),
      })
      .select('*')
      .single<UserRow>();
    if (error) throw new Error(`Supabase create user failed: ${error.message}`);
    return fromRow(data);
  },

  async update(
    id: string,
    fields: { fullName?: string; email?: string; passwordHash?: string; role?: Role; avatarUrl?: string; startDate?: string; isArchived?: boolean; barangay?: string; otpSecret?: string; otpEnabled?: boolean },
  ): Promise<User | undefined> {
    if (!supabase) return store.updateUser(id, fields);

    const row: Record<string, unknown> = {};
    if (fields.fullName !== undefined) row.full_name = fields.fullName;
    if (fields.email !== undefined) row.email = fields.email.toLowerCase();
    if (fields.passwordHash !== undefined) row.password_hash = fields.passwordHash;
    if (fields.role !== undefined) row.role = fields.role;
    if (fields.avatarUrl !== undefined) row.avatar_url = fields.avatarUrl;
    if (fields.startDate !== undefined) row.start_date = fields.startDate;
    if (fields.isArchived !== undefined) row.is_archived = fields.isArchived;
    if (fields.barangay !== undefined) row.barangay = fields.barangay;
    if (fields.otpSecret !== undefined) row.otp_secret = fields.otpSecret;
    if (fields.otpEnabled !== undefined) row.otp_enabled = fields.otpEnabled;

    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq('id', id)
      .select('*')
      .maybeSingle<UserRow>();
    if (error) throw new Error(`Supabase update user failed: ${error.message}`);
    return data ? fromRow(data) : undefined;
  },

  /** Safe directory listing for admin (User Management module) — no hashes. */
  async listPublic(): Promise<PublicUser[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, full_name, email, role, created_at, avatar_url, start_date, is_archived, barangay')
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Supabase listPublic failed: ${error.message}`);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      fullName: r.full_name as string,
      email: r.email as string,
      role: r.role as Role,
      avatarUrl: r.avatar_url as string | null,
      createdAt: r.created_at as string,
      startDate: r.start_date as string | null,
      isArchived: (r.is_archived as boolean) ?? false,
      barangay: (r.barangay as string) ?? 'Boac',
    }));
  },

  /** Archive (soft-delete) a user instead of hard deleting. */
  async archive(id: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from(TABLE).update({ is_archived: true }).eq('id', id);
    if (error) throw new Error(`Supabase archive user failed: ${error.message}`);
  },

  /** Restore an archived user. */
  async restore(id: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from(TABLE).update({ is_archived: false }).eq('id', id);
    if (error) throw new Error(`Supabase restore user failed: ${error.message}`);
  },

  /**
   * Idempotently insert the seed account(s) (skipped when they already exist).
   * Only runs against Supabase — the in-memory store seeds itself.
   */
  async seedAdminUser(): Promise<void> {
    if (!supabase) return;

    const { data, error } = await supabase.from(TABLE).select('email');
    if (error) throw new Error(`Supabase seed lookup failed: ${error.message}`);

    const existing = new Set((data ?? []).map((r: { email: string }) => r.email.toLowerCase()));
    const missing = SEED_USERS.filter((u) => !existing.has(u.email.toLowerCase()));
    if (!missing.length) return;

    const rows = missing.map((u) => ({
      full_name: u.fullName,
      email: u.email.toLowerCase(),
      role: u.role,
      password_hash: bcrypt.hashSync(u.password, 10),
    }));
    const { error: insertError } = await supabase.from(TABLE).insert(rows);
    if (insertError) throw new Error(`Supabase seed insert failed: ${insertError.message}`);
    console.log(`[supabase] Seeded ${rows.length} account(s) into ${TABLE}.`);
  },
};
