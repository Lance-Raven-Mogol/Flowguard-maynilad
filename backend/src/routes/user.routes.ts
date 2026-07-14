import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { userRepo } from '../models/userRepo.js';
import { authService } from '../services/auth.service.js';
import { forbidden } from '../utils/httpError.js';
import type { Request } from 'express';

export const userRoutes = Router();

function assertAdmin(req: Request): void {
  if (req.user?.role !== 'general-manager') throw forbidden('Only the general manager can manage users.');
}

// Directory (User Management module).
userRoutes.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    res.json({ data: await userRepo.listPublic() });
  }),
);

// Create a staff account with an explicit role.
userRoutes.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const user = await authService.adminCreateUser(req.body ?? {});
    res.status(201).json({ data: user });
  }),
);

// Reassign a user's role.
userRoutes.patch(
  '/:id/role',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const user = await authService.adminUpdateRole(req.params.id, req.body?.role, req.user);
    res.json({ data: user });
  }),
);

// Archive (soft-delete) a user — preserves audit trail.
userRoutes.patch(
  '/:id/archive',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    await userRepo.archive(req.params.id);
    res.json({ ok: true });
  }),
);

// Restore an archived user.
userRoutes.patch(
  '/:id/restore',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    await userRepo.restore(req.params.id);
    res.json({ ok: true });
  }),
);
