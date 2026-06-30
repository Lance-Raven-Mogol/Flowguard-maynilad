/**
 * Wraps an async Express handler so any rejected promise is forwarded to
 * `next()` and handled by the central error middleware. Express 4 does not
 * catch async errors on its own.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
