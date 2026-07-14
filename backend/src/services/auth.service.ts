/**
 * Auth service — business logic for registration, login and token issuance.
 * Uses Supabase Auth for OTP email delivery (zero configuration needed).
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { userRepo } from '../models/userRepo.js';
import { supabaseAuth } from '../models/supabase.js';
import { renameIncidentReporter, insertRow as auditInsert } from '../models/resourceRepo.js';
import { uploadAvatar } from '../models/supabase.js';
import { ROLES, type PublicUser, type Role, type User } from '../models/types.js';
import { badRequest, conflict, notFound, unauthorized } from '../utils/httpError.js';

/* ---------------------------------------------------------- Email via Supabase Auth */
async function sendOtpEmail(email: string, otpCode: string): Promise<boolean> {
  if (!supabaseAuth) {
    console.warn(`[auth] Supabase Auth not configured. OTP for ${email}: ${otpCode}`);
    return false;
  }

  try {
    // Use Supabase Auth to send OTP email
    const { error } = await supabaseAuth.auth.signInWithOtp({
      email,
      options: {
        data: { otp_code: otpCode },
      },
    });

    if (error) {
      console.error(`[auth] Supabase Auth OTP failed for ${email}:`, error.message);
      return false;
    }

    console.log(`[auth] OTP email sent to ${email} via Supabase Auth`);
    return true;
  } catch (err) {
    console.error(`[auth] Supabase Auth error for ${email}:`, err);
    return false;
  }
}

/* ---------------------------------------------------------- Audit logging */
function formatRoleName(role?: string): string {
  if (!role) return 'User';
  const roleMap: Record<string, string> = {
    'general-manager': 'Manager',
    'inventory-officer': 'Inventory Officer',
    'zone-specialist': 'Zone Specialist',
    'technical-team': 'Technical Team',
    'customer': 'Customer',
  };
  return roleMap[role] || role;
}

async function logUserAudit(
  action: string,
  actor: string | undefined,
  actorRole: string | undefined,
  targetUserId: string | undefined,
  targetEmail: string | undefined,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    let description = '';
    const actorName = actor || 'System';
    const targetName = (details.target_name as string) || targetEmail || 'Unknown';
    const targetRoleFormatted = formatRoleName(details.target_role as string);

    switch (action) {
      case 'register':
        description = `New account created for "${targetName}" as ${formatRoleName(details.role as string)}`;
        break;
      case 'admin_create_user':
        description = `Manager created account "${targetName}" as ${formatRoleName(details.role as string)}`;
        break;
      case 'role_change':
        description = `Manager changed "${targetName}"'s role from ${formatRoleName(details.from as string)} to ${formatRoleName(details.to as string)}`;
        break;
      case 'resign':
        description = `Manager ${actorName} resigned the account "${targetName}" (${targetRoleFormatted})`;
        break;
      case 'reactivate':
        description = `Manager ${actorName} reactivated the account "${targetName}" (${targetRoleFormatted})`;
        break;
      case 'profile_update':
        description = `${actorName} updated profile information`;
        break;
      case 'password_change':
        description = `${actorName} changed their password`;
        break;
      case 'otp_enabled':
        description = `${actorName} enabled two-factor authentication`;
        break;
      case 'otp_disabled':
        description = `${actorName} disabled two-factor authentication`;
        break;
      default:
        description = `${action} performed on "${targetName}"`;
    }

    await auditInsert('audit_logs', {
      entity: 'users',
      entity_id: targetUserId ?? null,
      action,
      actor: actor ?? null,
      actor_role: actorRole ?? null,
      details: {
        ...details,
        target_email: targetEmail,
        description,
      },
    });
  } catch (err) {
    console.warn('[audit] failed to write user audit log:', err);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash, otpSecret, ...pub } = user;
  return {
    ...pub,
    startDate: user.startDate,
    isArchived: user.isArchived,
    barangay: user.barangay,
    otpEnabled: user.otpEnabled,
  };
}

function signToken(user: User): string {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

/** In-memory store for pending registrations (supplement to DB). */
const pendingRegistrations = new Map<string, {
  fullName: string;
  email: string;
  passwordHash: string;
  barangay: string;
  otpCode: string;
  expiresAt: number;
  attempts: number;
}>();

function generateOtpCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export const authService = {
  /**
   * Step 1 of registration: validate input, check email uniqueness,
   * generate OTP, and store pending registration. Does NOT create account yet.
   */
  async initiateRegistration(input: {
    fullName?: string;
    email?: string;
    password?: string;
    barangay?: string;
  }): Promise<{ message: string; email: string; otp?: string }> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const barangay = input.barangay?.trim() || 'Boac';

    if (!fullName || fullName.length < 2) throw badRequest('Full name is required.');
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    if (await userRepo.findByEmail(email)) throw conflict('An account with this email already exists.');

    // Check if there's already a pending registration for this email
    const existing = pendingRegistrations.get(email);
    if (existing && existing.expiresAt > Date.now()) {
      const otpCode = generateOtpCode();
      pendingRegistrations.set(email, {
        fullName,
        email,
        passwordHash: bcrypt.hashSync(password, 10),
        barangay,
        otpCode,
        expiresAt: Date.now() + 5 * 60 * 1000,
        attempts: 0,
      });
      await sendOtpEmail(email, otpCode);
      return { message: 'OTP sent to your email.', email };
    }

    // Generate OTP
    const otpCode = generateOtpCode();
    pendingRegistrations.set(email, {
      fullName,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      barangay,
      otpCode,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });

    // Send OTP email via Supabase Auth
    const emailSent = await sendOtpEmail(email, otpCode);

    return {
      message: 'OTP sent to your email.',
      email,
      // Include OTP in response when Supabase Auth is not configured (dev mode)
      ...(emailSent ? {} : { otp: otpCode }),
    };
  },

  /**
   * Step 2 of registration: verify OTP and create account.
   */
  async completeRegistration(input: {
    email?: string;
    otpCode?: string;
  }): Promise<AuthResult> {
    const email = input.email?.trim().toLowerCase();
    const otpCode = input.otpCode ?? '';

    if (!email || !otpCode) throw badRequest('Email and OTP code are required.');

    const pending = pendingRegistrations.get(email);
    if (!pending) throw badRequest('No pending registration found. Please start over.');
    if (pending.expiresAt < Date.now()) {
      pendingRegistrations.delete(email);
      throw badRequest('OTP has expired. Please request a new code.');
    }
    if (pending.attempts >= 5) {
      pendingRegistrations.delete(email);
      throw badRequest('Too many failed attempts. Please start over.');
    }
    if (pending.otpCode !== otpCode) {
      pending.attempts++;
      throw badRequest(`Invalid OTP code. ${5 - pending.attempts} attempts remaining.`);
    }

    // OTP verified - create the account
    const user = await userRepo.create({
      fullName: pending.fullName,
      email: pending.email,
      role: 'customer',
      passwordHash: pending.passwordHash,
      barangay: pending.barangay,
    });

    pendingRegistrations.delete(email);

    await logUserAudit('register', pending.fullName, 'customer', user.id, pending.email, {
      email: pending.email,
      role: 'customer',
      barangay: pending.barangay,
      verified: true,
    });

    return { token: signToken(user), user: toPublicUser(user) };
  },

  /**
   * Resend OTP for a pending registration.
   */
  async resendOtp(input: { email?: string }): Promise<{ message: string; otp?: string }> {
    const email = input.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');

    const pending = pendingRegistrations.get(email);
    if (!pending) throw badRequest('No pending registration found. Please start over.');

    const otpCode = generateOtpCode();
    pendingRegistrations.set(email, {
      ...pending,
      otpCode,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });

    const emailSent = await sendOtpEmail(email, otpCode);

    return {
      message: 'OTP resent to your email.',
      ...(emailSent ? {} : { otp: otpCode }),
    };
  },

  /**
   * Legacy registration (for admin-created accounts - no OTP required).
   */
  async register(input: { fullName?: string; email?: string; password?: string }): Promise<AuthResult> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';

    if (!fullName || fullName.length < 2) throw badRequest('Full name is required.');
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    if (await userRepo.findByEmail(email)) throw conflict('An account with this email already exists.');

    const user = await userRepo.create({
      fullName,
      email,
      role: 'customer',
      passwordHash: bcrypt.hashSync(password, 10),
    });
    await logUserAudit('register', fullName, 'customer', user.id, email, { email, role: 'customer' });
    return { token: signToken(user), user: toPublicUser(user) };
  },

  /** Login by email + password only. */
  async login(input: { email?: string; password?: string }): Promise<AuthResult & { otpRequired?: boolean }> {
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';

    if (!email || !password) throw badRequest('Email and password are required.');

    const user = await userRepo.findByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      throw unauthorized('Invalid email or password.');
    }

    if (user.isArchived) {
      throw unauthorized('This account has been deactivated. Please contact support.');
    }

    const otpRequired = user.otpEnabled ?? true;

    return { token: signToken(user), user: toPublicUser(user), otpRequired };
  },

  /** Admin (GM) — create a staff account with an explicit role. */
  async adminCreateUser(input: {
    fullName?: string;
    email?: string;
    password?: string;
    role?: string;
    startDate?: string;
    barangay?: string;
  }): Promise<PublicUser> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const role = input.role as Role;

    if (!fullName || fullName.length < 2) throw badRequest('Full name is required.');
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    if (!ROLES.includes(role)) throw badRequest('A valid role is required.');
    if (await userRepo.findByEmail(email)) throw conflict('An account with this email already exists.');

    const user = await userRepo.create({
      fullName,
      email,
      role,
      passwordHash: bcrypt.hashSync(password, 10),
      startDate: input.startDate,
      barangay: input.barangay,
    });
    await logUserAudit('admin_create_user', undefined, 'general-manager', user.id, email, {
      fullName,
      email,
      role,
      startDate: input.startDate,
      barangay: input.barangay,
    });
    return toPublicUser(user);
  },

  /** Admin (GM) — reassign a user's role. */
  async adminUpdateRole(userId: string, role?: string, actorUser?: PublicUser): Promise<PublicUser> {
    if (!ROLES.includes(role as Role)) throw badRequest('A valid role is required.');
    const before = await userRepo.findById(userId);
    const updated = await userRepo.update(userId, { role: role as Role });
    if (!updated) throw notFound('User not found.');
    await logUserAudit('role_change', actorUser?.fullName, 'general-manager', userId, updated.email, {
      from: before?.role,
      to: role,
      target_name: updated.fullName,
    });
    return toPublicUser(updated);
  },

  /** Admin (GM) — archive (resign) a user. */
  async archiveUser(userId: string, actorUser?: PublicUser, reason?: string): Promise<void> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');

    await userRepo.archive(userId);
    await logUserAudit('resign', actorUser?.fullName, 'general-manager', userId, user.email, {
      target_name: user.fullName,
      target_role: user.role,
      reason: reason || 'Account resigned',
    });
  },

  /** Admin (GM) — restore an archived user. */
  async restoreUser(userId: string, actorUser?: PublicUser): Promise<void> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');

    await userRepo.restore(userId);
    await logUserAudit('reactivate', actorUser?.fullName, 'general-manager', userId, user.email, {
      target_name: user.fullName,
      target_role: user.role,
    });
  },

  async updateProfile(userId: string, input: { fullName?: string; email?: string }): Promise<PublicUser> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();

    if (fullName !== undefined && fullName.length < 2) throw badRequest('Full name is too short.');
    if (email !== undefined && !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');

    if (email) {
      const existing = await userRepo.findByEmail(email);
      if (existing && existing.id !== userId) throw conflict('That email is already in use.');
    }

    const before = await userRepo.findById(userId);
    const updated = await userRepo.update(userId, { fullName, email });
    if (!updated) throw unauthorized('Account no longer exists.');

    if (before && fullName && before.fullName !== fullName) {
      await renameIncidentReporter(before.fullName, fullName);
    }

    await logUserAudit('profile_update', updated.fullName, updated.role, userId, updated.email, {
      fields_changed: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined),
    });

    return toPublicUser(updated);
  },

  /** Upload a new profile photo to Supabase Storage. */
  async updateAvatar(userId: string, dataUrl?: string): Promise<PublicUser> {
    const match = /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/.exec(dataUrl ?? '');
    if (!match) throw badRequest('Please upload a valid PNG, JPG, WEBP or GIF image.');

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
    await logUserAudit('password_change', user.fullName, user.role, userId, user.email, {});
  },

  verifyToken(token: string): { sub: string; role: Role } {
    try {
      return jwt.verify(token, env.jwtSecret) as { sub: string; role: Role };
    } catch {
      throw unauthorized('Invalid or expired session.');
    }
  },

  /** Generate and store a 6-digit OTP for the user. Sends email via Supabase Auth. */
  async generateOtp(userId: string): Promise<string> {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await userRepo.update(userId, { otpSecret: `${code}:${expiresAt}` });

    const user = await userRepo.findById(userId);
    if (user) {
      await sendOtpEmail(user.email, code);
    }

    return code;
  },

  /** Verify a 6-digit OTP code for a user. */
  async verifyOtp(userId: string, code: string): Promise<boolean> {
    const user = await userRepo.findById(userId);
    if (!user || !user.otpSecret) return false;
    const [stored, expiresAt] = user.otpSecret.split(':');
    if (stored !== code) return false;
    if (new Date(expiresAt) < new Date()) return false;
    await userRepo.update(userId, { otpSecret: undefined });
    return true;
  },

  /** Enable OTP for a user. */
  async enableOtp(userId: string): Promise<void> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');
    await userRepo.update(userId, { otpEnabled: true });
    await logUserAudit('otp_enabled', user.fullName, user.role, userId, user.email, {});
  },

  /** Disable OTP for a user. */
  async disableOtp(userId: string): Promise<void> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');
    await userRepo.update(userId, { otpEnabled: false, otpSecret: undefined });
    await logUserAudit('otp_disabled', user.fullName, user.role, userId, user.email, {});
  },

  /** Check if a user has OTP enabled. */
  async isOtpEnabled(userId: string): Promise<boolean> {
    const user = await userRepo.findById(userId);
    return user?.otpEnabled ?? true;
  },
};
