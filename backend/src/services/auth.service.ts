/**
 * Auth service — business logic for registration, login and token issuance.
 * Controllers stay thin; all rules live here.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { store } from '../models/store.js';
import { ROLES, type PublicUser, type Role, type User } from '../models/types.js';
import { badRequest, conflict, unauthorized } from '../utils/httpError.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash, ...pub } = user;
  return pub;
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

export const authService = {
  register(input: { fullName?: string; email?: string; password?: string; role?: string }): AuthResult {
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const role = input.role as Role;

    if (!fullName) throw badRequest('Full name is required.');
    if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required.');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    if (!ROLES.includes(role)) throw badRequest('A valid role is required.');
    if (store.findUserByEmail(email)) throw conflict('An account with this email already exists.');

    const user = store.createUser({
      fullName,
      email,
      role,
      passwordHash: bcrypt.hashSync(password, 10),
    });
    return { token: signToken(user), user: toPublicUser(user) };
  },

  login(input: { email?: string; password?: string; role?: string }): AuthResult {
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const role = input.role as Role;

    if (!email || !password) throw badRequest('Email and password are required.');
    if (!ROLES.includes(role)) throw badRequest('Please select a valid role.');

    const user = store.findUserByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      throw unauthorized('Invalid email or password.');
    }
    if (user.role !== role) {
      throw unauthorized('This account is not registered for the selected role.');
    }
    return { token: signToken(user), user: toPublicUser(user) };
  },

  verifyToken(token: string): { sub: string; role: Role } {
    try {
      return jwt.verify(token, env.jwtSecret) as { sub: string; role: Role };
    } catch {
      throw unauthorized('Invalid or expired session.');
    }
  },
};
