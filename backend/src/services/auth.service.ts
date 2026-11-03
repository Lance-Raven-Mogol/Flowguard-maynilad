/**
 * Auth service — email OTP verification. 6-digit codes are generated on the
 * server and sent through Gmail SMTP (nodemailer) for signup, sign-in (when
 * two-factor is on), password reset and turning two-factor on.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { userRepo } from '../models/userRepo.js';
import { mailer, type OtpPurpose } from './mailer.service.js';
import { renameIncidentReporter, insertRow as auditInsert } from '../models/resourceRepo.js';
import { uploadAvatar, supabase as supabaseClient } from '../models/supabase.js';
import { ROLES, type PublicUser, type Role, type User } from '../models/types.js';
import { badRequest, conflict, notFound, unauthorized } from '../utils/httpError.js';

/* ---------------------------------------------------------- Audit */
function fmtRole(r?: string): string {
  const m: Record<string, string> = { 'general-manager': 'Manager', 'inventory-officer': 'Inventory Officer', 'zone-specialist': 'Zone Specialist', 'technical-team': 'Technical Team', 'customer': 'Customer', 'contractor': 'Contractor', 'inhouse-team': 'In-house Team', 'commercial-department': 'Commercial Department' };
  return m[r || ''] || r || 'User';
}

async function audit(action: string, actor: string | undefined, actorRole: string | undefined, userId: string | undefined, email: string | undefined, details: Record<string, unknown> = {}): Promise<void> {
  try {
    const name = (details.target_name as string) || email || 'Unknown';
    let desc = '';
    switch (action) {
      case 'register': desc = `New account created for "${name}" as ${fmtRole(details.role as string)}`; break;
      case 'admin_create_user': desc = `Manager created account "${name}" as ${fmtRole(details.role as string)}`; break;
      case 'role_change': desc = `Manager changed "${name}"'s role from ${fmtRole(details.from as string)} to ${fmtRole(details.to as string)}`; break;
      case 'resign': desc = `Manager resigned the account "${name}"`; break;
      case 'reactivate': desc = `Manager reactivated the account "${name}"`; break;
      case 'profile_update': desc = `Updated profile information`; break;
      case 'password_change': desc = `Changed password`; break;
      case 'otp_enabled': desc = `Enabled two-factor authentication`; break;
      case 'otp_disabled': desc = `Disabled two-factor authentication`; break;
      default: desc = action;
    }
    await auditInsert('audit_logs', { entity: 'users', entity_id: userId ?? null, action, actor: actor ?? null, actor_role: actorRole ?? null, details: { ...details, target_email: email, description: desc } });
  } catch {}
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Generate a unique CUST-##### serial number for a new customer account. */
async function generateCustomerSerial(): Promise<string> {
  // Retry up to 50 times to find an unused slot
  for (let i = 0; i < 50; i++) {
    const num = Math.floor(Math.random() * 99999) + 1;
    const candidate = `CUST-${num.toString().padStart(5, '0')}`;
    // Check uniqueness in DB
    if (supabaseClient) {
      const { data } = await supabaseClient.from('app_users').select('id').eq('serial_number', candidate).maybeSingle();
      if (!data) return candidate;
    } else {
      // In-memory fallback — uniqueness not guaranteed but acceptable for dev
      return candidate;
    }
  }
  // Fallback: timestamp-based to guarantee uniqueness
  return `CUST-${Date.now().toString().slice(-5)}`;
}

export function toPublicUser(u: User): PublicUser {
  const { passwordHash: _, otpSecret: __, ...pub } = u;
  return { ...pub, startDate: u.startDate, isArchived: u.isArchived, barangay: u.barangay, otpEnabled: u.otpEnabled, jobLevel: u.jobLevel ?? null, serialNumber: u.serialNumber ?? null };
}

function signToken(u: User): string {
  return jwt.sign({ sub: u.id, role: u.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export interface AuthResult { token: string; user: PublicUser; }

/* ---------------------------------------------------------- Email OTP */
const OTP_TTL_MINUTES = 10;
const LOGIN_TTL_MINUTES = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

/** A sent code. Only its hash is kept in memory. */
interface OtpEntry { hash: string; expiresAt: number; sentAt: number; attempts: number; }

const hashCode = (code: string) => createHash('sha256').update(code).digest();

/** Generate a code, email it, and return the entry to store. */
async function issueCode(email: string, purpose: OtpPurpose, ttlMinutes: number, previous?: OtpEntry): Promise<OtpEntry> {
  if (previous) {
    const wait = previous.sentAt + RESEND_COOLDOWN_MS - Date.now();
    if (wait > 0) throw badRequest(`Please wait ${Math.ceil(wait / 1000)}s before requesting a new code.`);
  }
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await mailer.sendOtpEmail(email, code, purpose, ttlMinutes);
  const now = Date.now();
  return { hash: hashCode(code).toString('hex'), expiresAt: now + ttlMinutes * 60 * 1000, sentAt: now, attempts: 0 };
}

/**
 * Check a submitted code. Throws a friendly error on a wrong/expired code and
 * counts the attempt; returns normally only when the code matches.
 */
function checkCode(entry: OtpEntry, input: unknown, startOver: string): void {
  const code = String(input ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) throw badRequest('Enter the 6-digit code sent to your email.');
  if (entry.expiresAt < Date.now()) throw badRequest(`This code has expired. ${startOver}`);
  if (entry.attempts >= MAX_ATTEMPTS) throw badRequest(`Too many failed attempts. ${startOver}`);
  if (!timingSafeEqual(hashCode(code), Buffer.from(entry.hash, 'hex'))) {
    entry.attempts++;
    const left = MAX_ATTEMPTS - entry.attempts;
    throw badRequest(left > 0 ? `Invalid code. ${left} attempt${left === 1 ? '' : 's'} remaining.` : `Too many failed attempts. ${startOver}`);
  }
}

/** True once a code can no longer be used (expired or out of attempts). */
const isSpent = (entry: OtpEntry) => entry.attempts >= MAX_ATTEMPTS || entry.expiresAt < Date.now();

/** Pending self-registrations waiting for email verification. Key: email. */
const pending = new Map<string, {
  fullName: string; email: string; passwordHash: string; barangay: string;
  isSenior: boolean; seniorIdNumber: string | null; termsAcceptedAt: string; otp: OtpEntry;
}>();

/** Bump when the Terms and Conditions text changes (stored in the audit log). */
const TERMS_VERSION = '2026-11-03';

/** Senior Citizen ID: optional; trimmed and capped so it fits a single line. */
function seniorFields(input: { isSenior?: unknown; seniorIdNumber?: unknown }): { isSenior: boolean; seniorIdNumber: string | null } {
  const isSenior = input.isSenior === true;
  const id = typeof input.seniorIdNumber === 'string' ? input.seniorIdNumber.trim() : '';
  if (!isSenior) return { isSenior: false, seniorIdNumber: null };
  if (!id) throw badRequest('Enter your Senior Citizen ID number.');
  if (id.length > 40) throw badRequest('Senior Citizen ID number is too long.');
  return { isSenior: true, seniorIdNumber: id };
}

/** Pending sign-ins waiting for the emailed code. Key: email (the loginToken). */
const pendingLogins = new Map<string, { userId: string; otp: OtpEntry }>();

/** Password reset codes. Key: email. */
const passwordResets = new Map<string, { userId: string; otp: OtpEntry }>();

/** Codes sent from Account Settings to turn two-factor on. Key: user id. */
const enableOtpCodes = new Map<string, OtpEntry>();

export const authService = {
  /**
   * Forgot password step 1: email a reset code. Always answers the same way so
   * the endpoint can't be used to discover which emails have accounts.
   */
  async requestPasswordReset(input: { email?: string }): Promise<{ message: string }> {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    const message = 'If an account exists for that email, a 6-digit reset code has been sent.';
    const user = await userRepo.findByEmail(email);
    if (!user || user.isArchived) return { message };
    const previous = passwordResets.get(email);
    const otp = await issueCode(email, 'reset', OTP_TTL_MINUTES, previous?.userId === user.id ? previous.otp : undefined);
    passwordResets.set(email, { userId: user.id, otp });
    return { message };
  },

  /** Forgot password step 2: verify the emailed code and set the new password. */
  async resetPassword(input: { email?: string; otpCode?: string; newPassword?: string }): Promise<void> {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.newPassword === 'string' ? input.newPassword : '';
    if (!EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('New password must be at least 6 characters.');
    if (Buffer.byteLength(password, 'utf8') > 72) throw badRequest('New password must be at most 72 bytes.');

    const entry = passwordResets.get(email);
    if (!entry) throw badRequest('Request a reset code first.');
    try {
      checkCode(entry.otp, input.otpCode, 'Please request a new code.');
    } catch (err) {
      if (isSpent(entry.otp)) passwordResets.delete(email);
      throw err;
    }
    // Consume before awaiting the write so the code cannot be reused.
    passwordResets.delete(email);

    const user = await userRepo.findById(entry.userId);
    if (!user || user.isArchived) throw badRequest('Unable to reset password. Please try again.');
    const updated = await userRepo.update(user.id, { passwordHash: bcrypt.hashSync(password, 10) });
    if (!updated) throw badRequest('Unable to reset password. Please try again.');
    pendingLogins.delete(email);
    await audit('password_change', user.fullName, user.role, user.id, user.email, { method: 'email_reset' });
  },

  /**
   * Step 1 of signup: validate the form and email a verification code. The
   * account is only created once the code is confirmed.
   */
  async initiateRegistration(input: {
    fullName?: string; email?: string; password?: string; barangay?: string;
    acceptTerms?: boolean; isSenior?: boolean; seniorIdNumber?: string;
  }): Promise<{
    email: string; message: string;
  }> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const barangay = input.barangay?.trim() || 'Boac';

    if (!fullName || fullName.length < 2) throw badRequest('Full name is required.');
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    if (input.acceptTerms !== true) throw badRequest('Please read and accept the Terms and Conditions.');
    const senior = seniorFields(input);
    if (await userRepo.findByEmail(email)) throw conflict('An account with this email already exists.');

    const previous = pending.get(email);
    const otp = await issueCode(email, 'signup', OTP_TTL_MINUTES, previous?.otp);
    pending.set(email, {
      fullName, email, passwordHash: bcrypt.hashSync(password, 10), barangay, ...senior,
      termsAcceptedAt: new Date().toISOString(), otp,
    });
    return { email, message: `We sent a 6-digit code to ${email}.` };
  },

  /** Step 2 of signup: confirm the emailed code, then create the account. */
  async completeRegistration(input: { email?: string; otpCode?: string }): Promise<AuthResult> {
    const email = input.email?.trim().toLowerCase();
    if (!email) throw badRequest('Email is required.');
    const p = pending.get(email);
    if (!p) throw badRequest('No pending registration found. Please start over.');
    try {
      checkCode(p.otp, input.otpCode, 'Please start over.');
    } catch (err) {
      if (isSpent(p.otp)) pending.delete(email);
      throw err;
    }
    pending.delete(email);
    if (await userRepo.findByEmail(email)) throw conflict('An account with this email already exists.');

    const user = await userRepo.create({
      fullName: p.fullName,
      email: p.email,
      role: 'customer',
      passwordHash: p.passwordHash,
      barangay: p.barangay,
      otpEnabled: true,
      serialNumber: await generateCustomerSerial(),
      isSenior: p.isSenior,
      seniorIdNumber: p.seniorIdNumber,
      termsAcceptedAt: p.termsAcceptedAt,
    });
    await audit('register', p.fullName, 'customer', user.id, p.email, {
      email: p.email, role: 'customer', barangay: p.barangay, is_senior: p.isSenior,
      terms_version: TERMS_VERSION, terms_accepted_at: p.termsAcceptedAt,
    });
    return { token: signToken(user), user: toPublicUser(user) };
  },

  /** Email a fresh signup code (60 s cooldown). */
  async resendOtp(input: { email?: string }): Promise<{ message: string }> {
    const email = input.email?.trim().toLowerCase() ?? '';
    const p = pending.get(email);
    if (!p) throw badRequest('No pending registration found. Please start over.');
    p.otp = await issueCode(email, 'signup', OTP_TTL_MINUTES, p.otp);
    return { message: `A new code was sent to ${email}.` };
  },

  /** Step 2 of login (when two-factor is on): verify the emailed code. */
  async verifyLoginOtp(input: { loginToken?: string; otpCode?: string }): Promise<AuthResult> {
    const email = input.loginToken?.trim().toLowerCase();
    if (!email) throw badRequest('Login token is required.');
    const p = pendingLogins.get(email);
    if (!p) throw badRequest('No pending login found. Please log in again.');
    try {
      checkCode(p.otp, input.otpCode, 'Please log in again.');
    } catch (err) {
      if (isSpent(p.otp)) pendingLogins.delete(email);
      throw err;
    }
    pendingLogins.delete(email);
    const user = await userRepo.findById(p.userId);
    if (!user || user.isArchived) throw unauthorized('Account no longer exists.');
    return { token: signToken(user), user: toPublicUser(user) };
  },

  /** Email a fresh sign-in code (60 s cooldown). */
  async resendLoginOtp(input: { loginToken?: string }): Promise<{ message: string }> {
    const email = input.loginToken?.trim().toLowerCase() ?? '';
    const p = pendingLogins.get(email);
    if (!p) throw badRequest('No pending login found. Please log in again.');
    p.otp = await issueCode(email, 'login', LOGIN_TTL_MINUTES, p.otp);
    return { message: `A new code was sent to ${email}.` };
  },

  async register(input: { fullName?: string; email?: string; password?: string; acceptTerms?: boolean }): Promise<AuthResult> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    if (!fullName || fullName.length < 2) throw badRequest('Full name is required.');
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    if (input.acceptTerms !== true) throw badRequest('Please read and accept the Terms and Conditions.');
    if (await userRepo.findByEmail(email)) throw conflict('An account with this email already exists.');
    const termsAcceptedAt = new Date().toISOString();
    const user = await userRepo.create({ fullName, email, role: 'customer', passwordHash: bcrypt.hashSync(password, 10), serialNumber: await generateCustomerSerial(), termsAcceptedAt });
    await audit('register', fullName, 'customer', user.id, email, { email, role: 'customer', terms_version: TERMS_VERSION, terms_accepted_at: termsAcceptedAt });
    return { token: signToken(user), user: toPublicUser(user) };
  },

  async login(input: { email?: string; password?: string }): Promise<{ token?: string; user?: PublicUser; loginToken?: string; otpRequired: boolean; message: string }> {
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    if (!email || !password) throw badRequest('Email and password are required.');
    const user = await userRepo.findByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) throw unauthorized('Invalid email or password.');
    if (user.isArchived) throw unauthorized('This account has been deactivated.');

    if (user.otpEnabled) {
      // Password is correct — email a sign-in code; verifyLoginOtp issues the session.
      const previous = pendingLogins.get(email);
      const reusable = previous && previous.userId === user.id && !isSpent(previous.otp) ? previous : undefined;
      // Signing in again within the resend cooldown reuses the code already sent.
      const otp = reusable && reusable.otp.sentAt + RESEND_COOLDOWN_MS > Date.now()
        ? reusable.otp
        : await issueCode(email, 'login', LOGIN_TTL_MINUTES);
      pendingLogins.set(email, { userId: user.id, otp });
      return { loginToken: email, otpRequired: true, message: `We sent a 6-digit code to ${email}.` };
    }

    return { token: signToken(user), user: toPublicUser(user), otpRequired: false, message: 'Login successful.' };
  },

  async adminCreateUser(input: { fullName?: string; email?: string; password?: string; role?: string; startDate?: string; barangay?: string; jobLevel?: string }): Promise<PublicUser> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const role = input.role as Role;
    if (!fullName || fullName.length < 2) throw badRequest('Full name is required.');
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    if (!ROLES.includes(role)) throw badRequest('A valid role is required.');
    if (await userRepo.findByEmail(email)) throw conflict('An account with this email already exists.');
    const user = await userRepo.create({ fullName, email, role, passwordHash: bcrypt.hashSync(password, 10), startDate: input.startDate, barangay: input.barangay, jobLevel: input.jobLevel ?? null, serialNumber: role === 'customer' ? await generateCustomerSerial() : null });
    await audit('admin_create_user', undefined, 'general-manager', user.id, email, { fullName, email, role });
    return toPublicUser(user);
  },

  async adminUpdateJobLevel(userId: string, jobLevel: string, actorUser?: PublicUser): Promise<PublicUser> {
    const target = await userRepo.findById(userId);
    if (!target) throw notFound('User not found.');
    const prevLevel = target.jobLevel ?? null;
    const updated = await userRepo.update(userId, { jobLevel });
    if (!updated) throw notFound('User not found.');
    await audit('job_level_change', actorUser?.fullName, 'general-manager', userId, updated.email, {
      target_name: updated.fullName,
      target_role: updated.role,
      from: prevLevel,
      to: jobLevel,
    });
    return toPublicUser(updated);
  },

  async adminUpdateRole(userId: string, role?: string, actorUser?: PublicUser): Promise<PublicUser> {
    if (!ROLES.includes(role as Role)) throw badRequest('A valid role is required.');
    const before = await userRepo.findById(userId);
    const updated = await userRepo.update(userId, { role: role as Role });
    if (!updated) throw notFound('User not found.');
    await audit('role_change', actorUser?.fullName, 'general-manager', userId, updated.email, { from: before?.role, to: role, target_name: updated.fullName });
    return toPublicUser(updated);
  },

  async archiveUser(userId: string, actorUser?: PublicUser, reason?: string): Promise<void> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');
    await userRepo.archive(userId);
    await audit('resign', actorUser?.fullName, 'general-manager', userId, user.email, { target_name: user.fullName, target_role: user.role, reason });
  },

  async restoreUser(userId: string, actorUser?: PublicUser): Promise<void> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');
    await userRepo.restore(userId);
    await audit('reactivate', actorUser?.fullName, 'general-manager', userId, user.email, { target_name: user.fullName, target_role: user.role });
  },

  async updateProfile(userId: string, input: { fullName?: string; email?: string; barangay?: string; isSenior?: boolean; seniorIdNumber?: string }): Promise<PublicUser> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const barangay = input.barangay?.trim() || undefined;
    if (fullName !== undefined && fullName.length < 2) throw badRequest('Full name is too short.');
    if (email !== undefined && !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (email) { const existing = await userRepo.findByEmail(email); if (existing && existing.id !== userId) throw conflict('That email is already in use.'); }
    const before = await userRepo.findById(userId);
    // Senior status is a customer-only field; only touched when it is sent.
    const senior = 'isSenior' in input && before?.role === 'customer' ? seniorFields(input) : {};
    const updated = await userRepo.update(userId, { fullName, email, barangay, ...senior });
    if (!updated) throw unauthorized('Account no longer exists.');
    if (before && fullName && before.fullName !== fullName) await renameIncidentReporter(before.fullName, fullName);
    await audit('profile_update', updated.fullName, updated.role, userId, updated.email, { fields_changed: Object.keys(input) });
    return toPublicUser(updated);
  },

  async updateAvatar(userId: string, dataUrl?: string): Promise<PublicUser> {
    const match = /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/.exec(dataUrl ?? '');
    if (!match) throw badRequest('Please upload a valid image.');
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 3 * 1024 * 1024) throw badRequest('Image must be smaller than 3MB.');
    const url = await uploadAvatar(userId, buffer, match[1]);
    const updated = await userRepo.update(userId, { avatarUrl: `${url}?v=${Date.now()}` });
    if (!updated) throw unauthorized('Account no longer exists.');
    return toPublicUser(updated);
  },

  async changePassword(userId: string, input: { currentPassword?: string; newPassword?: string }): Promise<void> {
    const current = input.currentPassword ?? '';
    const next = input.newPassword ?? '';
    if (next.length < 6) throw badRequest('New password must be at least 6 characters.');
    const user = await userRepo.findById(userId);
    if (!user) throw unauthorized('Account no longer exists.');
    if (!bcrypt.compareSync(current, user.passwordHash)) throw badRequest('Current password is incorrect.');
    await userRepo.update(userId, { passwordHash: bcrypt.hashSync(next, 10) });
    await audit('password_change', user.fullName, user.role, userId, user.email, {});
  },

  verifyToken(token: string): { sub: string; role: Role } {
    try { return jwt.verify(token, env.jwtSecret) as { sub: string; role: Role }; }
    catch { throw unauthorized('Invalid or expired session.'); }
  },

  /** Account Settings: email a code to confirm turning two-factor on. */
  async generateOtp(userId: string): Promise<{ email: string; message: string }> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');
    const otp = await issueCode(user.email, 'enable-2fa', OTP_TTL_MINUTES, enableOtpCodes.get(userId));
    enableOtpCodes.set(userId, otp);
    return { email: user.email, message: `We sent a 6-digit code to ${user.email}.` };
  },

  /** Account Settings: confirm the emailed code and turn two-factor on. */
  async verifyOtp(userId: string, code: unknown): Promise<void> {
    const entry = enableOtpCodes.get(userId);
    if (!entry) throw badRequest('Request a verification code first.');
    try {
      checkCode(entry, code, 'Please request a new code.');
    } catch (err) {
      if (isSpent(entry)) enableOtpCodes.delete(userId);
      throw err;
    }
    enableOtpCodes.delete(userId);
    const user = await userRepo.update(userId, { otpEnabled: true });
    if (!user) throw notFound('User not found.');
    await audit('otp_enabled', user.fullName, user.role, userId, user.email, {});
  },

  async disableOtp(userId: string): Promise<void> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');
    await userRepo.update(userId, { otpEnabled: false });
    await audit('otp_disabled', user.fullName, user.role, userId, user.email, {});
  },

  async isOtpEnabled(userId: string): Promise<boolean> {
    const user = await userRepo.findById(userId);
    return user?.otpEnabled ?? false;
  },
};
