/**
 * Centralised environment configuration.
 */
import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'flowguard-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  isProduction: process.env.NODE_ENV === 'production',

  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '',
    accessToken: process.env.SUPABASE_ACCESS_TOKEN ?? '',
  },

  // Resend API for email delivery
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    // Use onboarding@resend.dev for testing (works without domain verification)
    fromEmail: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
  },
} as const;

export const isSupabaseConfigured = Boolean(env.supabase.url && env.supabase.serviceKey);
