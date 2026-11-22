/**
 * Seed test accounts for every role except general-manager.
 *
 *   node scripts/seed-test-users.mjs --dry-run   # preview only
 *   node scripts/seed-test-users.mjs             # insert
 *   (or: npm run seed:test)
 *
 * Roles with one account:   "Zone Specialist" / zone_specialist@test.com
 * Roles with several (3):   "Contractor 1"   / contractor1@test.com … 3
 * Every password: Password123
 *
 * Safe to re-run: accounts whose email already exists are skipped.
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) from backend/.env.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const PASSWORD = 'Password123';
const dryRun = process.argv.includes('--dry-run');

/** role → [display name, email slug, how many accounts, default job level] */
const ROLES = [
  ['zone-specialist',       'Zone Specialist',       'zone_specialist',       1, 'Junior Zone Specialist'],
  ['inventory-officer',     'Inventory Officer',     'inventory_officer',     1, 'Junior Inventory Officer'],
  ['technical-team',        'Technical Team',        'technical_team',        1, 'Junior Technician'],
  ['commercial-department', 'Commercial Department', 'commercial_department', 1, null],
  ['contractor',            'Contractor',            'contractor',            3, 'Junior Contractor'],
  ['inhouse-team',          'In-house Team',         'inhouse_team',          3, 'Junior In-house Technician'],
  ['customer',              'Customer',              'customer',              3, null],
];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('✖ Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in backend/.env.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// Build the account list.
const accounts = ROLES.flatMap(([role, name, slug, count, jobLevel]) =>
  Array.from({ length: count }, (_, i) => {
    const n = count > 1 ? i + 1 : '';
    return { role, fullName: count > 1 ? `${name} ${n}` : name, email: `${slug}${n}@test.com`, jobLevel };
  }),
);

const { data: existingRows, error: lookupErr } = await db.from('app_users').select('email, serial_number');
if (lookupErr) {
  console.error(`✖ Could not read app_users: ${lookupErr.message}`);
  if (lookupErr.code === '42501') console.error('  → Run the service_role GRANTs at the end of supabase/schema.sql in the SQL editor.');
  process.exit(1);
}
const existing = new Set(existingRows.map((r) => r.email.toLowerCase()));
const usedSerials = new Set(existingRows.map((r) => r.serial_number).filter(Boolean));

/** Same CUST-##### format the sign-up flow uses, unique against the table. */
function customerSerial() {
  for (;;) {
    const s = `CUST-${String(Math.floor(Math.random() * 99999) + 1).padStart(5, '0')}`;
    if (!usedSerials.has(s)) { usedSerials.add(s); return s; }
  }
}

const today = new Date().toISOString().slice(0, 10);
const hash = bcrypt.hashSync(PASSWORD, 10);
const toInsert = accounts.filter((a) => !existing.has(a.email));
const skipped = accounts.filter((a) => existing.has(a.email));

const rows = toInsert.map((a) => ({
  full_name: a.fullName,
  email: a.email,
  role: a.role,
  password_hash: hash,
  start_date: today,
  otp_enabled: false,
  job_level: a.jobLevel,
  ...(a.role === 'customer' ? { serial_number: customerSerial(), terms_accepted_at: new Date().toISOString() } : {}),
}));

console.log(`${dryRun ? '[dry-run] ' : ''}Seeding ${rows.length} account(s), skipping ${skipped.length} that already exist.\n`);
for (const r of rows) console.log(`  + ${r.role.padEnd(22)} ${r.full_name.padEnd(24)} ${r.email}${r.serial_number ? `  (${r.serial_number})` : ''}`);
for (const a of skipped) console.log(`  = ${a.role.padEnd(22)} ${a.fullName.padEnd(24)} ${a.email}  (exists)`);

if (dryRun || !rows.length) process.exit(0);

const { error: insertErr } = await db.from('app_users').insert(rows);
if (insertErr) {
  console.error(`\n✖ Insert failed: ${insertErr.message}`);
  process.exit(1);
}
console.log(`\n✔ Done. Password for every account: ${PASSWORD}`);
