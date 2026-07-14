/**
 * Auth service — uses Supabase Auth for OTP emails.
 *
 * Flow:
 * 1. User submits registration form
 * 2. Backend calls Supabase Auth signInWithOtp (sends 6-digit code via email)
 * 3. User enters the 6-digit code
 * 4. Backend verifies OTP and creates account
 *
 * Requirements:
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set
 * - SUPABASE_ANON_KEY must be set (for signInWithOtp)
 * - Email provider must be configured in Supabase Dashboard → Authentication → Email
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { userRepo } from '../models/userRepo.js';
import { supabase, supabaseAuth } from '../models/supabase.js';
import { renameIncidentReporter, insertRow as auditInsert } from '../models/resourceRepo.js';
import { uploadAvatar } from '../models/supabase.js';
import { ROLES, type PublicUser, type Role, type User } from '../models/types.js';
import { badRequest, conflict, notFound, unauthorized } from '../utils/httpError.js';

/* ---------------------------------------------------------- Email via Supabase Auth */

/**
 * Check if email sending is configured.
 */
function isEmailConfigured(): boolean {
  if (!supabaseAuth) {
    console.error('[email] SUPABASE_ANON_KEY not configured. Cannot send OTP emails.');
    console.error('[email] Please add SUPABASE_ANON_KEY to your environment variables.');
    return false;
  }
  return true;
}

/**
 * Send OTP email via Supabase Auth.
 *
 * This calls signInWithOtp which:
 * 1. Creates a temporary session for the email
 * 2. Generates a 6-digit OTP code
 * 3. Sends the code via the configured email provider (SMTP in Supabase Dashboard)
 *
 * The OTP code is returned in the response for fallback purposes.
 */
async function sendOtpEmail(email: string): Promise<{ success: boolean; otp?: string; error?: string }> {
  // Check if email is configured
  if (!isEmailConfigured()) {
    return {
      success: false,
      error: 'Email delivery is not configured. Please set SUPABASE_ANON_KEY in your environment variables and configure an email provider in Supabase Dashboard.',
    };
  }

  try {
    console.log(`[email] Sending OTP to ${email} via Supabase Auth...`);

    // Call signInWithOtp - this sends a 6-digit code to the email
    const { data, error } = await supabaseAuth!.auth.signInWithOtp({
      email,
      options: {
        // The data object can store custom metadata
        data: {
          purpose: 'registration_verification',
        },
      },
    });

    if (error) {
      console.error(`[email] Supabase Auth error for ${email}:`, error.message);

      // Provide helpful error messages
      if (error.message.includes('Email provider')) {
        return {
          success: false,
          error: 'Email provider not configured. Please set up SMTP in Supabase Dashboard → Authentication → Email.',
        };
      }
      if (error.message.includes('rate limit')) {
        return {
          success: false,
          error: 'Too many email requests. Please wait a few minutes and try again.',
        };
      }

      return {
        success: false,
        error: `Failed to send OTP email: ${error.message}`,
      };
    }

    console.log(`[email] OTP email sent successfully to ${email}`);

    // signInWithOtp doesn't return the OTP code directly
    // The user will receive it via email
    return {
      success: true,
    };
  } catch (err) {
    console.error(`[email] Exception sending OTP to ${email}:`, err);
    return {
      success: false,
      error: 'An unexpected error occurred while sending the OTP email.',
    };
  }
}

/**
 * Verify OTP code via Supabase Auth.
 */
async function verifyOtpCode(email: string, token: string): Promise<boolean> {
  if (!supabaseAuth) {
    console.error('[email] Cannot verify OTP - SUPABASE_ANON_KEY not configured');
    return false;
  }

  try {
    const { data, error } = await supabaseAuth.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error) {
      console.error(`[email] OTP verification failed for ${email}:`, error.message);
      return false;
    }

    console.log(`[email] OTP verified successfully for ${email}`);
    return true;
  } catch (err) {
    console.error(`[email] OTP verification exception for ${email}:`, err);
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

const pendingRegistrations = new Map<string, {
  fullName: string;
  email: string;
  passwordHash: string;
  barangay: string;
  otpCode: string;
  expiresAt: number;
  attempts: number;
  supabaseOtpSent: boolean;
}>();

function generateOtpCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export const authService = {
  /**
   * Step 1: Initiate registration with OTP verification.
   * Sends OTP email via Supabase Auth.
   */
  async initiateRegistration(input: {
    fullName?: string;
    email?: string;
    password?: string;
    barangay?: string;
  }): Promise<{ message: string; email: string; otp?: string; emailConfigured?: boolean }> {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const barangay = input.barangay?.trim() || 'Boac';

    // Validate inputs
    if (!fullName || fullName.length < 2) throw badRequest('Full name is required.');
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    if (await userRepo.findByEmail(email)) throw conflict('An account with this email already exists.');

    // Check if email is configured
    const emailConfigured = isEmailConfigured();

    // Handle existing pending registration (resend)
    const existing = pendingRegistrations.get(email);
    if (existing && existing.expiresAt > Date.now()) {
      const otpCode = existing.supabaseOtpSent ? existing.otpCode : generateOtpCode();

      if (!existing.supabaseOtpSent) {
        // Try to send via Supabase Auth
        const result = await sendOtpEmail(email);
        if (result.success) {
          existing.supabaseOtpSent = true;
        }
      }

      pendingRegistrations.set(email, {
        ...existing,
        otpCode,
        expiresAt: Date.now() + 5 * 60 * 1000,
        attempts: 0,
      });

      return {
        message: 'OTP sent to your email.',
        email,
        otp: emailConfigured ? undefined : otpCode,
        emailConfigured,
      };
    }

    // Generate new OTP
    const otpCode = generateOtpCode();
    let supabaseOtpSent = false;

    // Try to send via Supabase Auth
    const result = await sendOtpEmail(email);
    if (result.success) {
      supabaseOtpSent = true;
    }

    pendingRegistrations.set(email, {
      fullName,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      barangay,
      otpCode,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      supabaseOtpSent,
    });

    return {
      message: 'OTP sent to your email.',
      email,
      // Only return OTP in response if email is not configured (fallback)
      otp: emailConfigured ? undefined : otpCode,
      emailConfigured,
    };
  },

  /**
   * Step 2: Complete registration with OTP verification.
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

    // Try Supabase Auth verification first if OTP was sent via Supabase
    let otpValid = false;

    if (pending.supabaseOtpSent) {
      otpValid = await verifyOtpCode(email, otpCode);
    }

    // Fallback to local verification if Supabase verification failed or wasn't used
    if (!otpValid) {
      otpValid = pending.otpCode === otpCode;
    }

    if (!otpValid) {
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
  async resendOtp(input: { email?: string }): Promise<{ message: string; otp?: string; emailConfigured?: boolean }> {
    const email = input.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');

    const pending = pendingRegistrations.get(email);
    if (!pending) throw badRequest('No pending registration found. Please start over.');

    const emailConfigured = isEmailConfigured();
    const otpCode = pending.supabaseOtpSent ? pending.otpCode : generateOtpCode();

    if (!pending.supabaseOtpSent) {
      const result = await sendOtpEmail(email);
      if (result.success) {
        pending.supabaseOtpSent = true;
      }
    }

    pendingRegistrations.set(email, {
      ...pending,
      otpCode,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });

    return {
      message: 'OTP resent to your email.',
      otp: emailConfigured ? undefined : otpCode,
      emailConfigured,
    };
  },

  // ... rest of the auth service methods remain the same
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

  async generateOtp(userId: string): Promise<string> {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await userRepo.update(userId, { otpSecret: `${code}:${expiresAt}` });

    const user = await userRepo.findById(userId);
    if (user) {
      await sendOtpEmail(user.email);
    }

    return code;
  },

  async verifyOtp(userId: string, code: string): Promise<boolean> {
    const user = await userRepo.findById(userId);
    if (!user || !user.otpSecret) return false;
    const [stored, expiresAt] = user.otpSecret.split(':');
    if (stored !== code) return false;
    if (new Date(expiresAt) < new Date()) return false;
    await userRepo.update(userId, { otpSecret: undefined });
    return true;
  },

  async enableOtp(userId: string): Promise<void> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');
    await userRepo.update(userId, { otpEnabled: true });
    await logUserAudit('otp_enabled', user.fullName, user.role, userId, user.email, {});
  },

  async disableOtp(userId: string): Promise<void> {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('User not found.');
    await userRepo.update(userId, { otpEnabled: false, otpSecret: undefined });
    await logUserAudit('otp_disabled', user.fullName, user.role, userId, user.email, {});
  },

  async isOtpEnabled(userId: string): Promise<boolean> {
    const user = await userRepo.findById(userId);
    return user?.otpEnabled ?? true;
  },
};
