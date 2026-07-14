/**
 * Auth controller — owns session state and exposes login/register/logout to
 * the views. Acts as the bridge between the auth service and React components.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '../models/types';
import { authService, type LoginInput, type RegisterInput, type InitiateRegistrationInput } from '../services/authService';
import { tokenStore } from '../services/apiClient';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<{ user: User; otpRequired?: boolean }>;
  register: (input: RegisterInput) => Promise<User>;
  initiateRegistration: (input: InitiateRegistrationInput) => Promise<{ message: string; email: string }>;
  completeRegistration: (email: string, otpCode: string) => Promise<User>;
  resendOtp: (email: string) => Promise<{ message: string }>;
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
    const res = await authService.login(input);
    // Don't set user yet if OTP is required
    if (!res.otpRequired) {
      setUser(res.user);
    }
    return { user: res.user, otpRequired: res.otpRequired };
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const u = await authService.register(input);
    setUser(u);
    return u;
  }, []);

  const initiateRegistration = useCallback(async (input: InitiateRegistrationInput) => {
    return authService.initiateRegistration(input);
  }, []);

  const completeRegistration = useCallback(async (email: string, otpCode: string) => {
    const u = await authService.completeRegistration(email, otpCode);
    setUser(u);
    return u;
  }, []);

  const resendOtp = useCallback(async (email: string) => {
    return authService.resendOtp(email);
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
    () => ({
      user,
      loading,
      login,
      register,
      initiateRegistration,
      completeRegistration,
      resendOtp,
      updateProfile,
      changePassword,
      updateAvatar,
      logout,
    }),
    [user, loading, login, register, initiateRegistration, completeRegistration, resendOtp, updateProfile, changePassword, updateAvatar, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
