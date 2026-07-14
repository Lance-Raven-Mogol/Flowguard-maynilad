/**
 * Auth service — OTP via Resend API (direct, not through Supabase Auth).
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { userRepo } from '../models/userRepo.js';
import { supabase } from '../models/supabase.js';
import { renameIncidentReporter, insertRow as auditInsert } from '../models/resourceRepo.js';
import { uploadAvatar } from '../models/supabase.js';
import { ROLES, type PublicUser, type Role, type User } from '../models/types.js';
import { badRequest, conflict, notFound, unauthorized } from '../utils/httpError.js';

/* ---------------------------------------------------------- Email via Resend API */
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';

async function sendOtpEmail(toEmail: string, otpCode: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set. OTP will be shown on screen.');
    return false;
  }

  const html = `<!DOCTYPE html><html><head><style>body{font-family:'Segoe UI',sans-serif;background:#f5f8fe;margin:0;padding:20px}.c{max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(31,60,120,.08)}.h{background:linear-gradient(135deg,#2f6bff,#5965f0);padding:32px;text-align:center}.h h1{color:#fff;margin:0;font-size:24px}.h p{color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px}.b{padding:32px;text-align:center}.o{font-size:48px;font-weight:700;color:#2f6bff;letter-spacing:12px;margin:24px 0;padding:16px;background:#eaf1ff;border-radius:12px}.m{color:#3a4d70;font-size:14px;line-height:1.6;margin:0 0 16px}.f{color:#7d8aa6;font-size:12px;padding:0 32px 24px}.w{color:#e25577;font-size:13px;font-weight:500}</style></head><body><div class="c"><div class="h"><h1>FlowGuard</h1><p>Water Utility Management System</p></div><div class="b"><p class="m">Your verification code is:</p><div class="o">${otpCode}</div><p class="m">This code expires in <strong>5 minutes</strong>.</p><p class="w">If you didn't request this, ignore this email.</p></div><div class="f"><p>&copy; ${new Date().getFullYear()} FlowGuard</p></div></div></body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to: toEmail, subject: 'Your FlowGuard OTP Code', html }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn(`[email] Resend error: ${JSON.stringify(data)}`);
      return false;
    }
    console.log(`[email] OTP sent to ${toEmail}`);
    return true;
  } catch (err) {
    console.warn(`[email] Resend exception: ${err}`);
    return false;
  }
}

/* ---------------------------------------------------------- Audit */
function fmtRole(r?: string): string {
  const m: Record<string, string> = { 'general-manager': 'Manager', 'inventory-officer': 'Inventory Officer', 'zone-specialist': 'Zone Specialist', 'technical-team': 'Technical Team', 'customer': 'Customer' };
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

export function toPublicUser(u: User): PublicUser {
  const { passwordHash: _, otpSecret: __, ...pub } = u;
  return { ...pub, startDate: u.startDate, isArchived: u.isArchived, barangay: u.barangay, otpEnabled: u.otpEnabled };
}

function signToken(u: User): string {
  return jwt.sign({ sub: u.id, role: u.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export interface AuthResult { token: string; user: PublicUser; }

const pending = new Map<string, { fullName: string; email: string; passwordHash: string; barangay: string; otpCode: string; expiresAt: number; attempts: number; emailSent: boolean }>();

function genOtp(): string { return crypto.randomInt(100000, 999999).toString(); }

export const authService = {
  async initiateRegistration(input: { fullName?: string; email?: string; password?: string; barangay?: string }): Promise<{ message: string; email: string; otp: string }> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const barangay = input.barangay?.trim() || 'Boac';

    if (!fullName || fullName.length < 2) throw badRequest('Full name is required.');
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    if (await userRepo.findByEmail(email)) throw conflict('An account with this email already exists.');

    const existing = pending.get(email);
    if (existing && existing.expiresAt > Date.now()) {
      const otpCode = existing.emailSent ? existing.otpCode : genOtp();
      let emailSent = existing.emailSent;
      if (!emailSent) emailSent = await sendOtpEmail(email, otpCode);
      pending.set(email, { ...existing, otpCode, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0, emailSent });
      return { message: emailSent ? 'OTP sent to your email.' : 'OTP shown on screen.', email, otp: otpCode };
    }

    const otpCode = genOtp();
    const emailSent = await sendOtpEmail(email, otpCode);
    pending.set(email, { fullName, email, passwordHash: bcrypt.hashSync(password, 10), barangay, otpCode, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0, emailSent });
    return { message: emailSent ? 'OTP sent to your email.' : 'OTP shown on screen.', email, otp: otpCode };
  },

  async completeRegistration(input: { email?: string; otpCode?: string }): Promise<AuthResult> {
    const email = input.email?.trim().toLowerCase();
    const otpCode = input.otpCode ?? '';
    if (!email || !otpCode) throw badRequest('Email and OTP code are required.');

    const p = pending.get(email);
    if (!p) throw badRequest('No pending registration found.');
    if (p.expiresAt < Date.now()) { pending.delete(email); throw badRequest('OTP expired.'); }
    if (p.attempts >= 5) { pending.delete(email); throw badRequest('Too many failed attempts.'); }
    if (p.otpCode !== otpCode) { p.attempts++; throw badRequest(`Invalid OTP. ${5 - p.attempts} attempts remaining.`); }

    const user = await userRepo.create({ fullName: p.fullName, email: p.email, role: 'customer', passwordHash: p.passwordHash, barangay: p.barangay });
    pending.delete(email);
    await audit('register', p.fullName, 'customer', user.id, p.email, { email: p.email, role: 'customer', barangay: p.barangay });
    return { token: signToken(user), user: toPublicUser(user) };
  },

  async resendOtp(input: { email?: string }): Promise<{ message: string; otp: string }> {
    const email = input.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    const p = pending.get(email);
    if (!p) throw badRequest('No pending registration found.');

    const otpCode = p.emailSent ? p.otpCode : genOtp();
    let emailSent = p.emailSent;
    if (!emailSent) emailSent = await sendOtpEmail(email, otpCode);
    pending.set(email, { ...p, otpCode, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0, emailSent });
    return { message: 'OTP resent.', otp: otpCode };
  },

  async register(input: { fullName?: string; email?: string; password?: string }): Promise<AuthResult> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    if (!fullName || fullName.length < 2) throw badRequest('Full name is required.');
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    if (await userRepo.findByEmail(email)) throw conflict('An account with this email already exists.');
    const user = await userRepo.create({ fullName, email, role: 'customer', passwordHash: bcrypt.hashSync(password, 10) });
    await audit('register', fullName, 'customer', user.id, email, { email, role: 'customer' });
    return { token: signToken(user), user: toPublicUser(user) };
  },

  async login(input: { email?: string; password?: string }): Promise<AuthResult & { otpRequired?: boolean }> {
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    if (!email || !password) throw badRequest('Email and password are required.');
    const user = await userRepo.findByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) throw unauthorized('Invalid email or password.');
    if (user.isArchived) throw unauthorized('This account has been deactivated.');
    return { token: signToken(user), user: toPublicUser(user), otpRequired: user.otpEnabled ?? true };
  },

  async adminCreateUser(input: { fullName?: string; email?: string; password?: string; role?: string; startDate?: string; barangay?: string }): Promise<PublicUser> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const role = input.role as Role;
    if (!fullName || fullName.length < 2) throw badRequest('Full name is required.');
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    if (!ROLES.includes(role)) throw badRequest('A valid role is required.');
    if (await userRepo.findByEmail(email)) throw conflict('An account with this email already exists.');
    const user = await userRepo.create({ fullName, email, role, passwordHash: bcrypt.hashSync(password, 10), startDate: input.startDate, barangay: input.barangay });
    await audit('admin_create_user', undefined, 'general-manager', user.id, email, { fullName, email, role });
    return toPublicUser(user);
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

  async updateProfile(userId: string, input: { fullName?: string; email?: string }): Promise<PublicUser> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    if (fullName !== undefined && fullName.length < 2) throw badRequest('Full name is too short.');
    if (email !== undefined && !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (email) { const existing = await userRepo.findByEmail(email); if (existing && existing.id !== userId) throw conflict('That email is already in use.'); }
    const before = await userRepo.findById(userId);
    const updated = await userRepo.update(userId, { fullName, email });
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

  async generateOtp(userId: string): Promise<string> {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await userRepo.update(userId, { otpSecret: `${code}:${expiresAt}` });
    const user = await userRepo.findById(userId);
    if (user) await sendOtpEmail(user.email, code);
    return code;
  },

  async verifyOtp(userId: string, code: string): Promise<boolean> {
    const user = await userRepo.findById(userId);
    if (!user || !user.otpSecret) return false;
    const [stored, expiresAt] = user.otpSecret.split(':');
    if (stored !== code || new Date(expiresAt) < new Date()) return false;
    await userRepo.update(userId, { otpSecret: undefined });
    return true;
  },

  async enableOtp(userId: string): Promise<void> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');
    await userRepo.update(userId, { otpEnabled: true });
    await audit('otp_enabled', user.fullName, user.role, userId, user.email, {});
  },

  async disableOtp(userId: string): Promise<void> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');
    await userRepo.update(userId, { otpEnabled: false, otpSecret: undefined });
    await audit('otp_disabled', user.fullName, user.role, userId, user.email, {});
  },

  async isOtpEnabled(userId: string): Promise<boolean> {
    const user = await userRepo.findById(userId);
    return user?.otpEnabled ?? true;
  },
};
