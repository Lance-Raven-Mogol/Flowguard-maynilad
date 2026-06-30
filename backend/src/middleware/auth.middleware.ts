/** Authentication middleware — validates the Bearer token and attaches the
 * authenticated user to the request. */
import type { NextFunction, Request, Response } from 'express';
import { authService, toPublicUser } from '../services/auth.service.js';
import { userRepo } from '../models/userRepo.js';
import type { PublicUser } from '../models/types.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { unauthorized } from '../utils/httpError.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(unauthorized('Missing authentication token.'));
  }
  const { sub } = authService.verifyToken(header.slice(7));
  const user = await userRepo.findById(sub);
  if (!user) return next(unauthorized('Account no longer exists.'));
  req.user = toPublicUser(user);
  next();
});
