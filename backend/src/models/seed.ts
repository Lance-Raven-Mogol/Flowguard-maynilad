/**
 * Seed data — the demo accounts created on first boot (in Supabase via
 * `userRepo.seedDemoUsers`, or in the in-memory store as a fallback).
 */
import type { Role } from './types.js';

/** Demo accounts. Password for every seeded account is `password123`. */
export const SEED_USERS: ReadonlyArray<{
  fullName: string;
  email: string;
  role: Role;
  password: string;
}> = [
  { fullName: 'Valued Customer', email: 'customer@flowguard.ph', role: 'customer', password: 'password123' },
  { fullName: 'Specialist Ramos', email: 'ramos@flowguard.ph', role: 'zone-specialist', password: 'password123' },
  { fullName: 'GM Reyes', email: 'reyes@flowguard.ph', role: 'general-manager', password: 'password123' },
  { fullName: 'Officer Cruz', email: 'cruz@flowguard.ph', role: 'inventory-officer', password: 'password123' },
  { fullName: 'Tech Santiago', email: 'santiago@flowguard.ph', role: 'technical-team', password: 'password123' },
];
