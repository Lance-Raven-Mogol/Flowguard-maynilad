/** Auth controller — thin HTTP adapters over the auth service. */
import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { unauthorized } from '../utils/httpError.js';

export const authController = {
  /** Forgot password step 1: email a reset code. */
  async requestPasswordReset(req: Request, res: Response): Promise<void> {
    const result = await authService.requestPasswordReset(req.body ?? {});
    res.json(result);
  },

  /** Forgot password step 2: verify the code and set the new password. */
  async resetPassword(req: Request, res: Response): Promise<void> {
    await authService.resetPassword(req.body ?? {});
    res.json({ message: 'Password reset successfully. Sign in with your new password.' });
  },

  /** Step 1: Validate the form and email a 6-digit verification code. */
  async initiateRegistration(req: Request, res: Response): Promise<void> {
    const result = await authService.initiateRegistration(req.body ?? {});
    res.status(200).json(result);
  },

  /** Step 2: Verify the emailed code and create the account. */
  async completeRegistration(req: Request, res: Response): Promise<void> {
    const result = await authService.completeRegistration(req.body ?? {});
    res.status(201).json(result);
  },

  /** Resend OTP for pending registration. */
  async resendOtp(req: Request, res: Response): Promise<void> {
    const result = await authService.resendOtp(req.body ?? {});
    res.json(result);
  },

  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body ?? {});
    res.status(201).json(result);
  },

  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(req.body ?? {});
    res.json(result);
  },

  async verifyLoginOtp(req: Request, res: Response): Promise<void> {
    const result = await authService.verifyLoginOtp(req.body ?? {});
    res.json(result);
  },

  async resendLoginOtp(req: Request, res: Response): Promise<void> {
    const result = await authService.resendLoginOtp(req.body ?? {});
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

  async updateAvatar(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    const user = await authService.updateAvatar(req.user.id, req.body?.dataUrl);
    res.json({ user });
  },

  /** Email a code to confirm turning two-factor on. */
  async generateOtp(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    res.json(await authService.generateOtp(req.user.id));
  },

  /** Verify the emailed code and turn two-factor on. */
  async verifyOtp(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    await authService.verifyOtp(req.user.id, req.body?.code);
    res.json({ ok: true });
  },

  async disableOtp(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    await authService.disableOtp(req.user.id);
    res.json({ ok: true });
  },
};
