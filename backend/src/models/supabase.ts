/**
 * Supabase admin client — server-side only.
 * Uses the service-role key which bypasses RLS.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from '../config/env.js';

let client: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  client = createClient(env.supabase.url, env.supabase.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const supabase = client;

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
