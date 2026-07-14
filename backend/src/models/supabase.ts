/**
 * Supabase clients — server-side only.
 *
 * Admin client uses the service-role key (bypasses RLS) for trusted server access.
 * Auth client uses the anon key for Supabase Auth OTP functionality.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from '../config/env.js';

let client: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  // Admin client (service role) - bypasses RLS
  client = createClient(env.supabase.url, env.supabase.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Auth client (anon key) - for Supabase Auth OTP
  if (env.supabase.anonKey) {
    authClient = createClient(env.supabase.url, env.supabase.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
} else {
  console.warn(
    '[supabase] SUPABASE_URL / service key not set — falling back to in-memory user store.',
  );
}

/** The shared admin client, or null when Supabase is not configured. */
export const supabase = client;

/** The auth client for Supabase Auth OTP (uses anon key). */
export const supabaseAuth = authClient;

/** Narrowing helper for call sites that require a configured client. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

/** Upload a user's avatar to the public `avatars` bucket; returns its URL. */
export async function uploadAvatar(userId: string, buffer: Buffer, contentType: string): Promise<string> {
  const sb = requireSupabase();
  const ext = (contentType.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const path = `${userId}.${ext}`;
  const { error } = await sb.storage.from('avatars').upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Avatar upload failed: ${error.message}`);
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}
