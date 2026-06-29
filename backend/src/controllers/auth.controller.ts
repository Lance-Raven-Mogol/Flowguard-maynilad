/** Auth controller — thin HTTP adapters over the auth service. */
import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';

export const authController = {
  register(req: Request, res: Response): void {
    const result = authService.register(req.body ?? {});
    res.status(201).json(result);
  },

  login(req: Request, res: Response): void {
    const result = authService.login(req.body ?? {});
    res.json(result);
  },

  me(req: Request, res: Response): void {
    res.json({ user: req.user });
  },
};
