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

export const authService = {
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
