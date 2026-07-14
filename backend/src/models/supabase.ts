/**
 * Supabase clients — server-side only.
 *
 * Admin client uses the service-role key (bypasses RLS) for trusted server access.
 * Auth client uses the anon key for Supabase Auth OTP functionality.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from '../config/env.js';

let adminClient: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  // Admin client (service role) - bypasses RLS
  adminClient = createClient(env.supabase.url, env.supabase.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Auth client (anon key) - for Supabase Auth OTP (signInWithOtp)
  if (env.supabase.anonKey) {
    authClient = createClient(env.supabase.url, env.supabase.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    console.log('[supabase] Auth client initialized with anon key');
  } else {
    console.warn('[supabase] SUPABASE_ANON_KEY not set - OTP emails will not work');
  }
} else {
  console.warn('[supabase] SUPABASE_URL / service key not set');
}

/** The shared admin client (service role). */
export const supabase = adminClient;

/** The auth client for Supabase Auth OTP (uses anon key). */
export const supabaseAuth = authClient;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function uploadAvatar(userId: string, buffer: Buffer, contentType: string): Promise<string> {
  const sb = requireSupabase();
  const ext = (contentType.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const path = `${userId}.${ext}`;
  const { error } = await sb.storage.from('avatars').upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Avatar upload failed: ${error.message}`);
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}
