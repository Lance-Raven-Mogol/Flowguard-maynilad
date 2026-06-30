/**
 * Auth controller — owns session state and exposes login/register/logout to
 * the views. Acts as the bridge between the auth service and React components.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '../models/types';
import { authService, type LoginInput, type RegisterInput } from '../services/authService';
import { tokenStore } from '../services/apiClient';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  updateProfile: (input: { fullName?: string; email?: string }) => Promise<User>;
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
  updateAvatar: (dataUrl: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from a stored token on first load.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    authService
      .me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const u = await authService.login(input);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const u = await authService.register(input);
    setUser(u);
    return u;
  }, []);

  const updateProfile = useCallback(async (input: { fullName?: string; email?: string }) => {
    const u = await authService.updateProfile(input);
    setUser(u);
    return u;
  }, []);

  const changePassword = useCallback(
    (input: { currentPassword: string; newPassword: string }) => authService.changePassword(input),
    [],
  );

  const updateAvatar = useCallback(async (dataUrl: string) => {
    const u = await authService.updateAvatar(dataUrl);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, updateProfile, changePassword, updateAvatar, logout }),
    [user, loading, login, register, updateProfile, changePassword, updateAvatar, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
