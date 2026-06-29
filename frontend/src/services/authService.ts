import type { AuthResponse, Role, User } from '../models/types';
import { api, tokenStore } from './apiClient';

export interface LoginInput {
  email: string;
  password: string;
  role: Role;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  role: Role;
}

export const authService = {
  async login(input: LoginInput): Promise<User> {
    const res = await api.post<AuthResponse>('/auth/login', input);
    tokenStore.set(res.token);
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

  logout(): void {
    tokenStore.clear();
  },
};
