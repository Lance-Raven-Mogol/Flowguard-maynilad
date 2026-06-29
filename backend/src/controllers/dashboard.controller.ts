/** Dashboard controller — serves the authenticated user's dashboard and
 * handles record-creation actions. */
import type { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service.js';
import { unauthorized } from '../utils/httpError.js';

export const dashboardController = {
  get(req: Request, res: Response): void {
    if (!req.user) throw unauthorized();
    res.json(dashboardService.getDashboard(req.user.role));
  },

  createRecord(req: Request, res: Response): void {
    if (!req.user) throw unauthorized();
    const { action, payload } = req.body ?? {};
    const result = dashboardService.createRecord(req.user.role, action, payload ?? {});
    res.status(201).json(result);
  },
};
