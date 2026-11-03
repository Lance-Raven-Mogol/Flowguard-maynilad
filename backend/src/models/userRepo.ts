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
/** Columns added by terms-senior-migration.sql (2026-11-03). */
const OPTIONAL_COLUMNS = ['is_senior', 'senior_id_number', 'terms_accepted_at'];

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
  job_level: string | null;
  serial_number: string | null;
  is_senior?: boolean | null;
  senior_id_number?: string | null;
  terms_accepted_at?: string | null;
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
    jobLevel: row.job_level ?? null,
    serialNumber: row.serial_number ?? null,
    isSenior: row.is_senior ?? false,
    seniorIdNumber: row.senior_id_number ?? null,
    termsAcceptedAt: row.terms_accepted_at ?? null,
  };
}

export interface NewUser {
  fullName: string;
  email: string;
  role: Role;
  passwordHash: string;
  startDate?: string;
  barangay?: string;
  otpSecret?: string;
  otpEnabled?: boolean;
  jobLevel?: string | null;
  serialNumber?: string | null;
  isSenior?: boolean;
  seniorIdNumber?: string | null;
  termsAcceptedAt?: string | null;
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

    const row: Record<string, unknown> = {
      full_name: input.fullName,
      email: input.email.toLowerCase(),
      role: input.role,
      password_hash: input.passwordHash,
      start_date: input.startDate ?? new Date().toISOString().slice(0, 10),
      otp_enabled: input.otpEnabled ?? false,
      ...(input.barangay ? { barangay: input.barangay } : {}),
      ...(input.isSenior ? { is_senior: true, senior_id_number: input.seniorIdNumber ?? null } : {}),
      ...(input.termsAcceptedAt ? { terms_accepted_at: input.termsAcceptedAt } : {}),
      ...(input.otpSecret ? { otp_secret: input.otpSecret } : {}),
      ...(input.jobLevel != null ? { job_level: input.jobLevel } : {}),
      ...(input.serialNumber != null ? { serial_number: input.serialNumber } : {}),
    };
    const insert = (values: Record<string, unknown>) =>
      supabase!.from(TABLE).insert(values).select('*').single<UserRow>();

    let { data, error } = await insert(row);
    // Before terms-senior-migration.sql is applied, sign up still works — the
    // senior/terms columns are dropped (terms acceptance is also in the audit log).
    if (error && (error.code === '42703' || error.code === 'PGRST204') && OPTIONAL_COLUMNS.some((c) => c in row)) {
      console.warn('[userRepo] senior/terms columns missing — run backend/supabase/terms-senior-migration.sql');
      const fallback = { ...row };
      for (const c of OPTIONAL_COLUMNS) delete fallback[c];
      ({ data, error } = await insert(fallback));
    }
    if (error || !data) throw new Error(`Supabase create user failed: ${error?.message ?? 'no row returned'}`);
    return fromRow(data);
  },

  async update(
    id: string,
    fields: { fullName?: string; email?: string; passwordHash?: string; role?: Role; avatarUrl?: string; startDate?: string; isArchived?: boolean; barangay?: string; otpSecret?: string; otpEnabled?: boolean; jobLevel?: string | null; serialNumber?: string | null; isSenior?: boolean; seniorIdNumber?: string | null },
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
    if (fields.jobLevel !== undefined) row.job_level = fields.jobLevel;
    if (fields.serialNumber !== undefined) row.serial_number = fields.serialNumber;
    if (fields.isSenior !== undefined) row.is_senior = fields.isSenior;
    if (fields.seniorIdNumber !== undefined) row.senior_id_number = fields.seniorIdNumber;

    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq('id', id)
      .select('*')
      .maybeSingle<UserRow>();
    if (error) throw new Error(`Supabase update user failed: ${error.message}`);
    return data ? fromRow(data) : undefined;
  },

  /**
   * Safe directory listing for admin (User Management module) — no hashes.
   * Selects `*` so a not-yet-migrated column never breaks the list; only the
   * public fields below are returned.
   */
  async listPublic(): Promise<PublicUser[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
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
      jobLevel: (r.job_level as string | null) ?? null,
      serialNumber: (r.serial_number as string | null) ?? null,
      isSenior: (r.is_senior as boolean | null) ?? false,
      seniorIdNumber: (r.senior_id_number as string | null) ?? null,
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
      otp_enabled: false,
    }));
    const { error: insertError } = await supabase.from(TABLE).insert(rows);
    if (insertError) throw new Error(`Supabase seed insert failed: ${insertError.message}`);
    console.log(`[supabase] Seeded ${rows.length} account(s) into ${TABLE}.`);
  },
};
