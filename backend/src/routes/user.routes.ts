import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { userRepo } from '../models/userRepo.js';
import { authService } from '../services/auth.service.js';
import { forbidden, badRequest } from '../utils/httpError.js';
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
    const role = req.user?.role;
    // General manager has full management access; commercial-department can
    // read the list (needed to look up customer emails for billing).
    if (role !== 'general-manager' && role !== 'commercial-department') {
      throw forbidden('Only the general manager can manage users.');
    }
    res.json({ data: await userRepo.listPublic() });
  }),
);

// Scoped team-member list — returns only technical-team and contractor accounts.
// Accessible to any authenticated role so the job-order form can populate the
// team picker regardless of who is creating the job order.
userRoutes.get(
  '/team-members',
  requireAuth,
  asyncHandler(async (req, res) => {
    const all = await userRepo.listPublic();
    const teamRoles = new Set(['technical-team', 'contractor', 'inhouse-team']);
    res.json({ data: all.filter((u) => teamRoles.has(u.role) && !u.isArchived) });
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

// Update a user's job level (GM only).
userRoutes.patch(
  '/:id/job-level',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    const jobLevel = String(req.body?.jobLevel ?? '').trim();
    if (!jobLevel) throw badRequest('jobLevel is required.');
    const user = await authService.adminUpdateJobLevel(req.params.id, jobLevel, req.user);
    res.json({ data: user });
  }),
);

// Archive (resign) a user — preserves audit trail.
userRoutes.patch(
  '/:id/archive',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    await authService.archiveUser(req.params.id, req.user, req.body?.reason);
    res.json({ ok: true });
  }),
);

// Restore an archived user.
userRoutes.patch(
  '/:id/restore',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);
    await authService.restoreUser(req.params.id, req.user);
    res.json({ ok: true });
  }),
);
