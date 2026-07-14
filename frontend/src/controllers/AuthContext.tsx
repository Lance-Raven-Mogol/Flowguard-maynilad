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
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  initiateRegistration: (input: InitiateRegistrationInput) => Promise<{ message: string; email: string; otp: string }>;
  completeRegistration: (email: string, otpCode: string) => Promise<User>;
  resendOtp: (email: string) => Promise<{ message: string; otp: string }>;
  updateProfile: (input: { fullName?: string; email?: string }) => Promise<User>;
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
  updateAvatar: (dataUrl: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  const initiateRegistration = useCallback(async (input: InitiateRegistrationInput) => {
    return authService.initiateRegistration(input);
  }, []);

  const completeRegistration = useCallback(async (email: string, otpCode: string) => {
    const res = await authService.completeRegistration(email, otpCode);
    setUser(res.user);
    return res.user;
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
