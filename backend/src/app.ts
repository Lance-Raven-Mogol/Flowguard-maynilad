/** Express application assembly. Kept separate from `server.ts` so it can be
 * imported by tests without binding a port. */
import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  // Generous limit: complaint photos travel as base64 (downscaled client-side).
  app.use(express.json({ limit: '12mb' }));

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
