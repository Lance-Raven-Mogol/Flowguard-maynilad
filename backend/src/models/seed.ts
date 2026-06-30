/**
 * Seed data — the administrator account created on first boot (in Supabase via
 * `userRepo.seedAdminUser`, or in the in-memory store as a fallback).
 */
import type { Role } from './types.js';

/** The administrator account created on first boot. */
export const SEED_USERS: ReadonlyArray<{
  fullName: string;
  email: string;
  role: Role;
  password: string;
}> = [
  { fullName: 'Administrator', email: 'thecapstone01@gmail.com', role: 'general-manager', password: 'Admin123' },
];
