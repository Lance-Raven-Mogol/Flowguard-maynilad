/** Server entry point. */
import { createApp } from './app.js';
import { env, isSupabaseConfigured } from './config/env.js';
import { userRepo } from './models/userRepo.js';
import { autoMigrate } from './models/autoMigrate.js';

const app = createApp();

app.listen(env.port, async () => {
  console.log(`FlowGuard API listening on http://localhost:${env.port}`);
  console.log(`CORS origin: ${env.corsOrigin}`);
  console.log(`Data store: ${isSupabaseConfigured ? 'Supabase' : 'in-memory'}`);

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
