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

export interface AuthResult extends AuthResponse {
  otpRequired?: boolean;
}

export const authService = {
  /** Step 1: Initiate registration - generates OTP and returns it. */
  async initiateRegistration(input: InitiateRegistrationInput): Promise<{ message: string; email: string; otp: string }> {
    return api.post<{ message: string; email: string; otp: string }>('/auth/register/initiate', input);
  },

  /** Step 2: Complete registration with OTP verification. */
  async completeRegistration(email: string, otpCode: string): Promise<{ token: string; user: User }> {
    const res = await api.post<{ token: string; user: User }>('/auth/register/complete', { email, otpCode });
    if (res.token) {
      tokenStore.set(res.token);
    }
    return res;
  },

  async resendOtp(email: string): Promise<{ message: string; otp: string }> {
    return api.post<{ message: string; otp: string }>('/auth/register/resend-otp', { email });
  },

  async login({ remember, ...input }: LoginInput): Promise<User> {
    const res = await api.post<AuthResponse>('/auth/login', input);
    tokenStore.set(res.token, remember ?? true);
    return res.user;
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

  async updateProfile(input: { fullName?: string; email?: string }): Promise<User> {
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

  async generateOtp(): Promise<{ code: string }> {
    return api.post<{ code: string }>('/auth/otp/generate', {});
  },

  async verifyOtp(code: string): Promise<{ valid: boolean }> {
    return api.post<{ valid: boolean }>('/auth/otp/verify', { code });
  },

  async enableOtp(): Promise<void> {
    await api.post<{ ok: true }>('/auth/otp/enable', {});
  },

  async disableOtp(): Promise<void> {
    await api.post<{ ok: true }>('/auth/otp/disable', {});
  },

  logout(): void {
    tokenStore.clear();
  },
};
