/** Auth controller — thin HTTP adapters over the auth service. */
import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';

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
};
