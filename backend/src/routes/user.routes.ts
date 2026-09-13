import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { userRepo } from '../models/userRepo.js';
import * as resourceRepo from '../models/resourceRepo.js';
import { authService } from '../services/auth.service.js';
import { forbidden, badRequest } from '../utils/httpError.js';
import type { Request } from 'express';

export const userRoutes = Router();

function assertAdmin(req: Request): void {
  if (req.user?.role !== 'general-manager') throw forbidden('Only the general manager can manage users.');
}

// Directory (User Management module).
userRoutes.get(
  '/customers',
  requireAuth,
  asyncHandler(async (req, res) => {
    const allowed = new Set(['general-manager', 'commercial-department', 'zone-specialist']);
    if (!req.user || !allowed.has(req.user.role)) {
      throw forbidden('You do not have permission to view the customer directory.');
    }
    const all = await userRepo.listPublic();
    res.json({ data: all.filter((u) => u.role === 'customer' && !u.isArchived) });
  }),
);

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
    const assignedJobs = (await resourceRepo.listRows('job_orders', {})).filter(
      (job) => ['in_progress', 'completed'].includes(String(job.status)) && job.scheduled_date,
    );
    const weeklyRosterRows = (await resourceRepo.listRows('team_schedules', {})).filter(
      (schedule) => String(schedule.activity ?? '').startsWith('WEEKLY_ROSTER:'),
    );
    const data = all.filter((u) => teamRoles.has(u.role) && !u.isArchived).map((user) => {
      const normalizedName = user.fullName.trim().toLowerCase();
      const userJobs = assignedJobs.filter((job) => {
        const members = Array.isArray(job.team_members)
          ? job.team_members.map((member) => String(member).trim().toLowerCase())
          : [];
        const assignedNames = String(job.assigned_to ?? '').split(',').map((name) => name.trim().toLowerCase());
        return members.includes(normalizedName) || assignedNames.includes(normalizedName);
      });
      const today = new Date().toISOString().slice(0, 10);
      const activeJob = userJobs.find((job) => String(job.scheduled_date).slice(0, 10) === today && job.status === 'in_progress');
      const weeklyRoster = weeklyRosterRows
        .filter((schedule) => String(schedule.member_id) === user.id)
        .map((schedule) => {
          const sentinelDates = ['1970-01-05', '1970-01-06', '1970-01-07', '1970-01-08', '1970-01-09', '1970-01-10', '1970-01-11'];
          const weekday = sentinelDates.indexOf(String(schedule.schedule_date).slice(0, 10)) + 1;
          try {
            const settings = JSON.parse(String(schedule.activity).slice('WEEKLY_ROSTER:'.length)) as Record<string, unknown>;
            const legacyNoWork = Boolean(settings.noWork);
            return {
              weekday,
              amNoWork: settings.amNoWork === undefined ? legacyNoWork : Boolean(settings.amNoWork),
              pmNoWork: settings.pmNoWork === undefined ? legacyNoWork : Boolean(settings.pmNoWork),
              amStart: String(settings.amStart ?? '08:00').slice(0, 5),
              amEnd: String(settings.amEnd ?? '12:00').slice(0, 5),
              pmStart: String(settings.pmStart ?? '13:00').slice(0, 5),
              pmEnd: String(settings.pmEnd ?? '17:00').slice(0, 5),
            };
          } catch {
            return null;
          }
        })
        .filter((entry) => entry && entry.weekday > 0);
      return {
        ...user,
        availability: activeJob ? 'busy' : 'available',
        activeJobOrderRef: activeJob ? String(activeJob.ref_code ?? '') : null,
        activeJobOrderTitle: activeJob ? String(activeJob.title ?? '') : null,
        jobAssignments: userJobs.map((job) => ({
          ref: String(job.ref_code ?? ''),
          title: String(job.title ?? ''),
          date: String(job.scheduled_date).slice(0, 10),
          period: String(job.schedule_period ?? 'AM'),
          startTime: String(job.scheduled_start_time ?? '').slice(0, 5),
          endTime: String(job.scheduled_end_time ?? '').slice(0, 5),
          status: String(job.status ?? ''),
        })),
        weeklyRoster,
      };
    });
    res.json({ data });
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
