/**
 * One-shot data wipe — empties all business tables and deletes every user
 * account EXCEPT the administrator, leaving a fresh database.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/wipe.mjs
 *
 * Project ref + token are read from backend/.env.
 */
import 'dotenv/config';

const pat = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.SUPABASE_URL;

if (!pat) {
  console.error('✖ Missing SUPABASE_ACCESS_TOKEN in backend/.env.');
  process.exit(1);
}
const ref = new URL(url).hostname.split('.')[0];

const ADMIN_EMAIL = 'thecapstone01@gmail.com';

const SQL = `
-- Empty every business table (fast, resets nothing else).
truncate table
  public.incidents,
  public.job_orders,
  public.materials,
  public.material_requests,
  public.assets,
  public.advisories
restart identity cascade;

-- Remove all accounts except the administrator.
delete from public.app_users
where lower(email) <> lower('${ADMIN_EMAIL}');
`;

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${await res.text()}`);
  return res.json();
}

(async () => {
  console.log(`→ Project: ${ref}`);
  console.log('→ Wiping business data + non-admin accounts…');
  await runSql(SQL);

  // Report what's left.
  const rows = await runSql(
    `select 'app_users' as t, count(*) from public.app_users
     union all select 'incidents', count(*) from public.incidents
     union all select 'job_orders', count(*) from public.job_orders
     union all select 'materials', count(*) from public.materials
     union all select 'material_requests', count(*) from public.material_requests
     union all select 'assets', count(*) from public.assets
     union all select 'advisories', count(*) from public.advisories
     order by t;`,
  );
  console.log('✓ Wipe complete. Remaining rows:');
  for (const r of rows) console.log(`   ${r.t.padEnd(20)} ${r.count}`);

  const admins = await runSql(
    `select full_name, email, role from public.app_users order by email;`,
  );
  console.log('✓ Remaining account(s):');
  for (const a of admins) console.log(`   ${a.email} (${a.role})`);
})().catch((e) => {
  console.error('✖ Wipe failed:', e.message);
  process.exit(1);
});
