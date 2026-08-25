/** Server entry point. */
import { createApp } from './app.js';
import { env, isSupabaseConfigured } from './config/env.js';
import { userRepo } from './models/userRepo.js';
import { autoMigrate } from './models/autoMigrate.js';

// ---------------------------------------------------------------------------
// Keep-alive ping — prevents Render free-tier from spinning down after 15 min
// of inactivity. Pings /api/health every 5 minutes while the server is up.
// ---------------------------------------------------------------------------
const PING_URL = 'https://flowguard-api-yl5r.onrender.com/api/health';
const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function startKeepAlivePing(): void {
  setInterval(async () => {
    try {
      const res = await fetch(PING_URL);
      console.log(`[keep-alive] ping ${res.ok ? 'ok' : 'failed'} (${res.status})`);
    } catch (err) {
      console.warn('[keep-alive] ping error:', err instanceof Error ? err.message : err);
    }
  }, PING_INTERVAL_MS);
}

const app = createApp();

app.listen(env.port, async () => {
  console.log(`FlowGuard API listening on http://localhost:${env.port}`);
  console.log(`CORS origin: ${env.corsOrigin.join(', ')}`);
  console.log(`Data store: ${isSupabaseConfigured ? 'Supabase' : 'in-memory'}`);

  // Keep-alive: ping our own health endpoint every 5 min so Render never spins down
  startKeepAlivePing();
  console.log(`[keep-alive] pinging ${PING_URL} every 5 min`);

  if (isSupabaseConfigured) {
    // Keep the database schema in sync automatically (idempotent) so new
    // columns like incidents.remarks are always present.
    try {
      const result = await autoMigrate();
      if (result === 'applied') console.log('[supabase] Schema auto-migrated (up to date).');
      else console.log('[supabase] Auto-migrate skipped (no SUPABASE_ACCESS_TOKEN set).');
    } catch (err) {
      console.error('[supabase] Auto-migrate failed:', err instanceof Error ? err.message : err);
    }

    try {
      await userRepo.seedAdminUser();
      console.log('[supabase] Connected — user accounts ready.');
    } catch (err) {
      console.error(
        '[supabase] Could not seed users. Did you run the schema in supabase/schema.sql?',
        err instanceof Error ? err.message : err,
      );
    }
  }
});
