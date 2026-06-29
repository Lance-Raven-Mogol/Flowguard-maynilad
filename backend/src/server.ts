/** Server entry point. */
import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`FlowGuard API listening on http://localhost:${env.port}`);
  console.log(`CORS origin: ${env.corsOrigin}`);
});
