/**
 * Auth service — TOTP-based verification (Google Authenticator / Authy).
 * No nodemailer. No email OTP. Codes are generated locally on the device —
 * zero network lag, works on free hosting with no SMTP setup.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { userRepo } from '../models/userRepo.js';
import { generateTotpSetup, verifyTotpToken } from './totp.service.js';
import { renameIncidentReporter, insertRow as auditInsert } from '../models/resourceRepo.js';
import { uploadAvatar } from '../models/supabase.js';
import { ROLES, type PublicUser, type Role, type User } from '../models/types.js';
import { badRequest, conflict, notFound, unauthorized } from '../utils/httpError.js';

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
  return { ...pub, startDate: u.startDate, isArchived: u.isArchived, barangay: u.barangay, otpEnabled: u.otpEnabled, jobLevel: u.jobLevel ?? null };
}

function signToken(u: User): string {
  return jwt.sign({ sub: u.id, role: u.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export interface AuthResult { token: string; user: PublicUser; }

/**
 * Pending registrations waiting for TOTP setup verification.
 * Key: email. Value: form data + temporary TOTP secret.
 * Expires in 10 minutes so users have time to install / scan.
 */
const pending = new Map<string, {
  fullName: string; email: string; passwordHash: string; barangay: string;
  totpSecret: string; expiresAt: number; attempts: number;
}>();

/**
 * Pending logins waiting for TOTP verification.
 * Key: email. Value: userId reference.
 */
const pendingLogins = new Map<string, {
  userId: string; email: string; expiresAt: number; attempts: number;
}>();

export const authService = {
  /**
   * Step 1 of signup: validate form data, generate TOTP secret + QR code.
   * Returns the QR code data-URL and the manual key to show in the UI.
   * The user scans this with Google Authenticator / Authy, then submits a
   * 6-digit code to complete registration — no email needed.
   */
  async initiateRegistration(input: { fullName?: string; email?: string; password?: string; barangay?: string }): Promise<{
    email: string; qrCodeDataUrl: string; manualKey: string; message: string;
  }> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const barangay = input.barangay?.trim() || 'Boac';

    if (!fullName || fullName.length < 2) throw badRequest('Full name is required.');
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    if (await userRepo.findByEmail(email)) throw conflict('An account with this email already exists.');

    // Reuse existing pending entry if still valid (user came back to this step)
    const existing = pending.get(email);
    if (existing && existing.expiresAt > Date.now()) {
      // Re-generate QR from existing secret so the screen refreshes correctly
      const { generateTotpSetup: gen } = await import('./totp.service.js');
      const setup = await gen(email);
      // Update with fresh secret for this session
      pending.set(email, { ...existing, totpSecret: setup.secret, expiresAt: Date.now() + 10 * 60 * 1000 });
      return { email, qrCodeDataUrl: setup.qrCodeDataUrl, manualKey: setup.manualKey, message: 'Scan the QR code with your authenticator app.' };
    }

    const setup = await generateTotpSetup(email);
    pending.set(email, {
      fullName, email,
      passwordHash: bcrypt.hashSync(password, 10),
      barangay,
      totpSecret: setup.secret,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    });

    return { email, qrCodeDataUrl: setup.qrCodeDataUrl, manualKey: setup.manualKey, message: 'Scan the QR code with your authenticator app.' };
  },

  /**
   * Step 2 of signup: verify the first TOTP token to confirm the user
   * successfully added the account to their authenticator app.
   * Creates the user account and returns a session JWT.
   */
  async completeRegistration(input: { email?: string; totpToken?: string }): Promise<AuthResult> {
    const email = input.email?.trim().toLowerCase();
    const token = (input.totpToken ?? '').replace(/\s/g, '');
    if (!email || !token) throw badRequest('Email and authenticator code are required.');
    if (token.length !== 6 || !/^\d{6}$/.test(token)) throw badRequest('Please enter the 6-digit code from your authenticator app.');

    const p = pending.get(email);
    if (!p) throw badRequest('No pending registration found. Please start over.');
    if (p.expiresAt < Date.now()) { pending.delete(email); throw badRequest('Setup session expired. Please start over.'); }
    if (p.attempts >= 5) { pending.delete(email); throw badRequest('Too many failed attempts. Please start over.'); }

    if (!verifyTotpToken(p.totpSecret, token)) {
      p.attempts++;
      const left = 5 - p.attempts;
      throw badRequest(left > 0 ? `Invalid code. ${left} attempt${left === 1 ? '' : 's'} remaining.` : 'Too many failed attempts. Please start over.');
    }

    // Create user with TOTP already set up and enabled
    const user = await userRepo.create({
      fullName: p.fullName,
      email: p.email,
      role: 'customer',
      passwordHash: p.passwordHash,
      barangay: p.barangay,
      otpSecret: p.totpSecret,
      otpEnabled: true,
    });
    pending.delete(email);
    await audit('register', p.fullName, 'customer', user.id, p.email, { email: p.email, role: 'customer', barangay: p.barangay });
    return { token: signToken(user), user: toPublicUser(user) };
  },

  /** Not used for TOTP (no email to resend to) — kept for API compat, does nothing harmful */
  async resendOtp(_input: { email?: string }): Promise<{ message: string }> {
    return { message: 'Scan the QR code in your authenticator app to get a new code.' };
  },

  /**
   * Step 2 of login (when TOTP is enabled): verify token from authenticator app.
   * loginToken is just the email used as a key into the pendingLogins map.
   */
  async verifyLoginOtp(input: { loginToken?: string; otpCode?: string }): Promise<AuthResult> {
    const email = input.loginToken?.trim().toLowerCase();
    const token = (input.otpCode ?? '').replace(/\s/g, '');
    if (!email || !token) throw badRequest('Login token and authenticator code are required.');

    const p = pendingLogins.get(email);
    if (!p) throw badRequest('No pending login found. Please log in again.');
    if (p.expiresAt < Date.now()) { pendingLogins.delete(email); throw badRequest('Login session expired. Please log in again.'); }
    if (p.attempts >= 5) { pendingLogins.delete(email); throw badRequest('Too many failed attempts. Please log in again.'); }

    // Get the stored TOTP secret for this user
    const user = await userRepo.findById(p.userId);
    if (!user) { pendingLogins.delete(email); throw unauthorized('Account no longer exists.'); }
    if (!user.otpSecret) { pendingLogins.delete(email); throw badRequest('TOTP not set up for this account.'); }

    if (!verifyTotpToken(user.otpSecret, token)) {
      p.attempts++;
      const left = 5 - p.attempts;
      throw badRequest(left > 0 ? `Invalid code. ${left} attempt${left === 1 ? '' : 's'} remaining.` : 'Too many failed attempts. Please log in again.');
    }

    pendingLogins.delete(email);
    return { token: signToken(user), user: toPublicUser(user) };
  },

  /** Not needed for TOTP — codes refresh every 30 s automatically */
  async resendLoginOtp(_input: { loginToken?: string }): Promise<{ message: string }> {
    return { message: 'Open your authenticator app to get a new code. Codes refresh every 30 seconds.' };
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

  async login(input: { email?: string; password?: string }): Promise<{ token?: string; user?: PublicUser; loginToken?: string; otpRequired: boolean; message: string }> {
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    if (!email || !password) throw badRequest('Email and password are required.');
    const user = await userRepo.findByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) throw unauthorized('Invalid email or password.');
    if (user.isArchived) throw unauthorized('This account has been deactivated.');

    const otpEnabled = user.otpEnabled ?? false;
    if (otpEnabled && user.otpSecret) {
      // Store a pending login entry — TOTP token will be verified in verifyLoginOtp
      pendingLogins.set(email, { userId: user.id, email, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 });
      return { loginToken: email, otpRequired: true, message: 'Enter the code from your authenticator app.' };
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
    const user = await userRepo.create({ fullName, email, role, passwordHash: bcrypt.hashSync(password, 10), startDate: input.startDate, barangay: input.barangay, jobLevel: input.jobLevel ?? null });
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

  async updateProfile(userId: string, input: { fullName?: string; email?: string; barangay?: string }): Promise<PublicUser> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const barangay = input.barangay?.trim() || undefined;
    if (fullName !== undefined && fullName.length < 2) throw badRequest('Full name is too short.');
    if (email !== undefined && !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (email) { const existing = await userRepo.findByEmail(email); if (existing && existing.id !== userId) throw conflict('That email is already in use.'); }
    const before = await userRepo.findById(userId);
    const updated = await userRepo.update(userId, { fullName, email, barangay });
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

  /**
   * Generate a fresh TOTP setup (new secret + QR) for an existing user.
   * Used by Account Settings when enabling TOTP.
   * The secret is saved as "pending" on the user row; only becomes "active"
   * after verifyOtp succeeds and enableOtp is called.
   */
  async generateOtp(userId: string): Promise<{ qrCodeDataUrl: string; manualKey: string }> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');
    const setup = await generateTotpSetup(user.email);
    // Store the secret temporarily (prefixed so we know it's pending)
    await userRepo.update(userId, { otpSecret: `pending:${setup.secret}` });
    return { qrCodeDataUrl: setup.qrCodeDataUrl, manualKey: setup.manualKey };
  },

  /**
   * Verify the TOTP token against the pending secret.
   * Returns true if valid — caller should then call enableOtp.
   */
  async verifyOtp(userId: string, token: string): Promise<boolean> {
    const user = await userRepo.findById(userId);
    if (!user || !user.otpSecret) return false;
    // Handle both pending:SECRET and plain SECRET
    const secret = user.otpSecret.startsWith('pending:') ? user.otpSecret.slice(8) : user.otpSecret;
    const valid = verifyTotpToken(secret, token);
    if (valid && user.otpSecret.startsWith('pending:')) {
      // Promote from pending to active
      await userRepo.update(userId, { otpSecret: secret });
    }
    return valid;
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
    return user?.otpEnabled ?? false;
  },
};
