/**
 * Supabase admin client — server-side only.
 *
 * Uses the service-role key, which bypasses Row Level Security, so this module
 * must never be imported by anything that runs in the browser. All trusted
 * server data access (user accounts) goes through this client.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from '../config/env.js';

let client: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  client = createClient(env.supabase.url, env.supabase.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
} else {
  console.warn(
    '[supabase] SUPABASE_URL / service key not set — falling back to in-memory user store.',
  );
}

/** The shared admin client, or null when Supabase is not configured. */
export const supabase = client;

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
