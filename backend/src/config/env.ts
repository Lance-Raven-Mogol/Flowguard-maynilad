/**
 * Centralised environment configuration.
 * Reading process.env in exactly one place keeps the rest of the codebase
 * decoupled from how configuration is sourced.
 */
import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'flowguard-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  isProduction: process.env.NODE_ENV === 'production',

  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    // Prefer the service-role JWT for the admin client; fall back to the
    // new-style secret key. Either bypasses RLS for trusted server access.
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '',
    // Personal access token (sbp_…) — enables automatic schema migration on
    // boot via the Management API. Optional; omit to disable auto-migrate.
    accessToken: process.env.SUPABASE_ACCESS_TOKEN ?? '',
  },
} as const;

/** True when the Supabase admin client has enough config to connect. */
export const isSupabaseConfigured = Boolean(env.supabase.url && env.supabase.serviceKey);
