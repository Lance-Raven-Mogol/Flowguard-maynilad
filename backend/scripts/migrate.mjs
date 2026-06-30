/**
 * One-shot Supabase migration runner.
 *
 * Runs backend/supabase/schema.sql against the project via the Supabase
 * Management API, then seeds the demo accounts. Requires a Personal Access
 * Token (https://supabase.com/dashboard/account/tokens), passed as:
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/migrate.mjs
 *
 * The project ref + service-role key are read from backend/.env.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const pat = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!pat) {
  console.error('✖ Missing SUPABASE_ACCESS_TOKEN (your sbp_... personal access token).');
  process.exit(1);
}
const ref = new URL(url).hostname.split('.')[0];

const SEED_USERS = [
  { full_name: 'Valued Customer', email: 'customer@flowguard.ph', role: 'customer' },
  { full_name: 'Specialist Ramos', email: 'ramos@flowguard.ph', role: 'zone-specialist' },
  { full_name: 'GM Reyes', email: 'reyes@flowguard.ph', role: 'general-manager' },
  { full_name: 'Officer Cruz', email: 'cruz@flowguard.ph', role: 'inventory-officer' },
  { full_name: 'Tech Santiago', email: 'santiago@flowguard.ph', role: 'technical-team' },
];

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

(async () => {
  console.log(`→ Project: ${ref}`);

  console.log('→ Running schema.sql (DDL)…');
  const schema = readFileSync(resolve(__dirname, '../supabase/schema.sql'), 'utf8');
  await runSql(schema);
  console.log('✓ Schema applied (public.app_users ready).');

  console.log('→ Seeding demo accounts…');
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: existing, error } = await sb.from('app_users').select('email');
  if (error) throw new Error(`Seed lookup failed: ${error.message}`);

  const have = new Set((existing ?? []).map((r) => r.email.toLowerCase()));
  const rows = SEED_USERS.filter((u) => !have.has(u.email)).map((u) => ({
    ...u,
    password_hash: bcrypt.hashSync('password123', 10),
  }));

  if (rows.length) {
    const { error: insErr } = await sb.from('app_users').insert(rows);
    if (insErr) throw new Error(`Seed insert failed: ${insErr.message}`);
    console.log(`✓ Seeded ${rows.length} demo account(s).`);
  } else {
    console.log('✓ Demo accounts already present.');
  }

  console.log('→ Ensuring "avatars" storage bucket…');
  const { error: bucketErr } = await sb.storage.createBucket('avatars', {
    public: true,
    fileSizeLimit: '3MB',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  });
  if (bucketErr && !/already exists/i.test(bucketErr.message)) {
    console.warn('  ! bucket:', bucketErr.message);
  } else {
    console.log('✓ avatars bucket ready.');
  }

  const { count } = await sb.from('app_users').select('*', { count: 'exact', head: true });
  console.log(`✓ Migration complete. app_users rows: ${count ?? 'unknown'}`);
})().catch((e) => {
  console.error('✖ Migration failed:', e.message);
  process.exit(1);
});
