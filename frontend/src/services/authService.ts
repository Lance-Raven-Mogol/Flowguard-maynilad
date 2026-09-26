import type { AuthResponse, User } from '../models/types';
import { api, tokenStore } from './apiClient';

export interface LoginInput {
  email: string;
  password: string;
  remember?: boolean;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
}

export interface InitiateRegistrationInput {
  fullName: string;
  email: string;
  password: string;
  barangay?: string;
}

export interface LoginResult {
  token?: string;
  user?: User;
  loginToken?: string;
  otpRequired: boolean;
  message: string;
}

export const authService = {
  /** Forgot password step 1: email a 6-digit reset code. */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    return api.post<{ message: string }>('/auth/forgot-password', { email });
  },
  async resetPassword(input: { email: string; otpCode: string; newPassword: string }): Promise<{ message: string }> {
    return api.post<{ message: string }>('/auth/reset-password', input);
  },
  /** Step 1: Validate the form and email a 6-digit verification code. */
  async initiateRegistration(input: InitiateRegistrationInput): Promise<{ message: string; email: string }> {
    return api.post<{ message: string; email: string }>('/auth/register/initiate', input);
  },

  /** Step 2: Complete registration with the emailed code. */
  async completeRegistration(email: string, otpCode: string): Promise<{ token: string; user: User }> {
    const res = await api.post<{ token: string; user: User }>('/auth/register/complete', { email, otpCode });
    if (res.token) {
      tokenStore.set(res.token);
    }
    return res;
  },

  async resendOtp(email: string): Promise<{ message: string }> {
    return api.post<{ message: string }>('/auth/register/resend-otp', { email });
  },

  async login({ remember, ...input }: LoginInput): Promise<LoginResult> {
    const res = await api.post<LoginResult>('/auth/login', input);
    if (res.token && res.user) {
      tokenStore.set(res.token, remember ?? true);
    }
    return res;
  },

  async verifyLoginOtp(loginToken: string, otpCode: string, remember?: boolean): Promise<User> {
    const res = await api.post<AuthResponse>('/auth/login/verify-otp', { loginToken, otpCode });
    tokenStore.set(res.token, remember ?? true);
    return res.user;
  },

  async resendLoginOtp(loginToken: string): Promise<{ message: string }> {
    return api.post<{ message: string }>('/auth/login/resend-otp', { loginToken });
  },

  async register(input: RegisterInput): Promise<User> {
    const res = await api.post<AuthResponse>('/auth/register', input);
    tokenStore.set(res.token);
    return res.user;
  },

  async me(): Promise<User> {
    const res = await api.get<{ user: User }>('/auth/me');
    return res.user;
  },

  async updateProfile(input: { fullName?: string; email?: string; barangay?: string }): Promise<User> {
    const res = await api.patch<{ user: User }>('/auth/profile', input);
    return res.user;
  },

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
    await api.patch<{ ok: true }>('/auth/password', input);
  },

  async updateAvatar(dataUrl: string): Promise<User> {
    const res = await api.patch<{ user: User }>('/auth/avatar', { dataUrl });
    return res.user;
  },

  /** Account Settings: email a code to confirm turning two-factor on. */
  async generateOtp(): Promise<{ email: string; message: string }> {
    return api.post<{ email: string; message: string }>('/auth/otp/generate', {});
  },

  /** Verify the emailed code; the server turns two-factor on when it matches. */
  async verifyOtp(code: string): Promise<void> {
    await api.post<{ ok: true }>('/auth/otp/verify', { code });
  },

  async disableOtp(): Promise<void> {
    await api.post<{ ok: true }>('/auth/otp/disable', {});
  },

  logout(): void {
    tokenStore.clear();
  },
};
