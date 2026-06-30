/** Auth controller — thin HTTP adapters over the auth service. */
import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { unauthorized } from '../utils/httpError.js';

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body ?? {});
    res.status(201).json(result);
  },

  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(req.body ?? {});
    res.json(result);
  },

  me(req: Request, res: Response): void {
    res.json({ user: req.user });
  },

  async updateProfile(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    const user = await authService.updateProfile(req.user.id, req.body ?? {});
    res.json({ user });
  },

  async changePassword(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    await authService.changePassword(req.user.id, req.body ?? {});
    res.json({ ok: true });
  },
};
