/**
 * Automatic schema migration on boot.
 *
 * When a Supabase personal access token (SUPABASE_ACCESS_TOKEN, sbp_…) is
 * configured, the server applies `supabase/schema.sql` through the Management
 * API every time it starts. The schema is fully idempotent (create table if
 * not exists / add column if not exists), so this safely brings the database
 * up to date — no more "missing remarks column" data loss — without anyone
 * having to run a migration by hand.
 *
 * If no token is set, this is a no-op and the server boots normally.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../config/env.js';

/** Candidate locations for schema.sql across dev (tsx) and prod (dist) runs. */
function readSchema(): string {
  const candidates = [
    resolve(process.cwd(), 'supabase/schema.sql'),
    resolve(process.cwd(), 'backend/supabase/schema.sql'),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      /* try next */
    }
  }
  throw new Error(`schema.sql not found (looked in: ${candidates.join(', ')})`);
}

/**
 * Apply the schema via the Supabase Management API. Resolves quietly when no
 * access token is configured; throws only on an actual API failure.
 */
export async function autoMigrate(): Promise<'skipped' | 'applied'> {
  const { url, accessToken } = env.supabase;
  if (!accessToken || !url) return 'skipped';

  const ref = new URL(url).hostname.split('.')[0];
  const query = readSchema();

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return 'applied';
}
