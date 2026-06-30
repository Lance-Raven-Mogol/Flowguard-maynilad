/** Server entry point. */
import { createApp } from './app.js';
import { env, isSupabaseConfigured } from './config/env.js';
import { userRepo } from './models/userRepo.js';

const app = createApp();

app.listen(env.port, async () => {
  console.log(`FlowGuard API listening on http://localhost:${env.port}`);
  console.log(`CORS origin: ${env.corsOrigin}`);
  console.log(`Data store: ${isSupabaseConfigured ? 'Supabase' : 'in-memory'}`);

  if (isSupabaseConfigured) {
    try {
      await userRepo.seedDemoUsers();
      console.log('[supabase] Connected — user accounts ready.');
    } catch (err) {
      console.error(
        '[supabase] Could not seed users. Did you run the schema in supabase/schema.sql?',
        err instanceof Error ? err.message : err,
      );
    }
  }
});
