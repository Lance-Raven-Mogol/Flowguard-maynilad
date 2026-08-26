/** Auth controller — thin HTTP adapters over the auth service. */
import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { unauthorized } from '../utils/httpError.js';

export const authController = {
  /** Step 1: Validate form, generate TOTP secret + QR code. Returns { email, qrCodeDataUrl, manualKey }. */
  async initiateRegistration(req: Request, res: Response): Promise<void> {
    const result = await authService.initiateRegistration(req.body ?? {});
    res.status(200).json(result);
  },

  /** Step 2: Verify first TOTP token from authenticator app, create account. */
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

  async generateOtp(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    const result = await authService.generateOtp(req.user.id);
    // result = { qrCodeDataUrl, manualKey }
    res.json({ ...result, message: 'Scan the QR code with your authenticator app.' });
  },

  async verifyOtp(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    const valid = await authService.verifyOtp(req.user.id, req.body?.code ?? '');
    res.json({ valid });
  },

  async enableOtp(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    await authService.enableOtp(req.user.id);
    res.json({ ok: true });
  },

  async disableOtp(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    await authService.disableOtp(req.user.id);
    res.json({ ok: true });
  },
};
