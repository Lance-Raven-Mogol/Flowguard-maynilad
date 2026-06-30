import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { userRepo } from '../models/userRepo.js';
import { forbidden } from '../utils/httpError.js';

export const userRoutes = Router();

// Admin-only directory (User Management module).
userRoutes.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'general-manager') throw forbidden('Only the general manager can view users.');
    const users = await userRepo.listPublic();
    res.json({ data: users });
  }),
);
