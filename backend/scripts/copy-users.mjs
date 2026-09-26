/**
 * Copy user accounts (public.app_users) from an OLD Supabase project to the
 * NEW one — nothing else. Keeps each account's id, email, password hash, role,
 * serial number, etc., so everyone logs in with the same password. Profile
 * photos stored in the old project's "avatars" bucket are re-uploaded to the
 * new project and their URLs rewritten.
 *
 * Prerequisite: run backend/supabase/schema.sql in the NEW project's SQL editor.
 *
 * backend/.env must have the NEW project's credentials plus the OLD project's:
 *   SUPABASE_URL=...                 (new)
 *   SUPABASE_SERVICE_ROLE_KEY=...    (new — or SUPABASE_SECRET_KEY)
 *   OLD_SUPABASE_URL=...
 *   OLD_SUPABASE_SERVICE_ROLE_KEY=...
 *
 *   node scripts/copy-users.mjs --dry-run   # preview only
 *   node scripts/copy-users.mjs             # copy
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const dryRun = process.argv.includes('--dry-run');
const oldUrl = process.env.OLD_SUPABASE_URL;
const oldKey = process.env.OLD_SUPABASE_SERVICE_ROLE_KEY;
const newUrl = process.env.SUPABASE_URL;
const newKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!oldUrl || !oldKey || !newUrl || !newKey) {
  console.error('✖ Set OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.');
  process.exit(1);
}
if (new URL(oldUrl).host === new URL(newUrl).host) {
  console.error('✖ OLD_SUPABASE_URL and SUPABASE_URL point to the same project.');
  process.exit(1);
}

const opts = { auth: { persistSession: false } };
const oldDb = createClient(oldUrl, oldKey, opts);
const newDb = createClient(newUrl, newKey, opts);

/** Move a photo from the old project's avatars bucket to the new one. */
async function copyAvatar(avatarUrl) {
  const marker = '/storage/v1/object/public/avatars/';
  if (!avatarUrl || !avatarUrl.includes(marker)) return avatarUrl;
  if (new URL(avatarUrl).host !== new URL(oldUrl).host) return avatarUrl;
  const path = decodeURIComponent(avatarUrl.split(marker)[1].split('?')[0]);
  const { data: file, error } = await oldDb.storage.from('avatars').download(path);
  if (error || !file) {
    console.warn(`  ! could not download avatar ${path}: ${error?.message ?? 'empty'} — photo dropped`);
    return null;
  }
  const { error: upErr } = await newDb.storage.from('avatars').upload(path, file, { contentType: file.type || 'image/png', upsert: true });
  if (upErr) {
    console.warn(`  ! could not upload avatar ${path}: ${upErr.message} — photo dropped`);
    return null;
  }
  return `${newDb.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

(async () => {
  console.log(`→ From ${new URL(oldUrl).host}\n→ To   ${new URL(newUrl).host}${dryRun ? '  (dry run)' : ''}`);

  const { data: users, error } = await oldDb.from('app_users').select('*');
  if (error) throw new Error(`Reading old app_users failed: ${error.message}`);
  console.log(`✓ ${users.length} account(s) in the old project`);

  const { error: probeErr } = await newDb.from('app_users').select('id', { head: true, count: 'exact' });
  if (probeErr) throw new Error(`New project has no app_users table — run backend/supabase/schema.sql there first. (${probeErr.message})`);

  const byRole = users.reduce((acc, u) => ({ ...acc, [u.role]: (acc[u.role] ?? 0) + 1 }), {});
  console.table(byRole);
  if (dryRun) {
    users.forEach((u) => console.log(`  ${u.email.padEnd(36)} ${u.role.padEnd(22)} ${u.is_archived ? 'archived' : ''}`));
    console.log('Dry run — nothing written.');
    return;
  }

  const { error: bucketErr } = await newDb.storage.createBucket('avatars', {
    public: true,
    fileSizeLimit: '3MB',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  });
  if (bucketErr && !/already exists/i.test(bucketErr.message)) console.warn('  ! avatars bucket:', bucketErr.message);

  const rows = [];
  for (const user of users) {
    // otp_secret belonged to the removed authenticator-app 2FA — not carried over.
    rows.push({ ...user, otp_secret: null, avatar_url: await copyAvatar(user.avatar_url) });
  }

  // Upsert on email so re-running is safe and a pre-seeded admin row is replaced
  // by the real account (same id and password as before).
  const { error: insErr } = await newDb.from('app_users').upsert(rows, { onConflict: 'email' });
  if (insErr) throw new Error(`Writing new app_users failed: ${insErr.message}`);

  const { count } = await newDb.from('app_users').select('*', { count: 'exact', head: true });
  console.log(`✓ Copied ${rows.length} account(s). New project now has ${count} account(s).`);
})().catch((e) => {
  console.error('✖', e.message);
  process.exit(1);
});
