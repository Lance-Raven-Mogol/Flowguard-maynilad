/** Central error handler — converts thrown errors into consistent JSON. */
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/httpError.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found.' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error.' });
}
