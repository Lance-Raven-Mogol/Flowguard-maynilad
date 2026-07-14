import type { AuthResponse, User } from '../models/types';
import { api, tokenStore } from './apiClient';
import { auth } from '../config/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut as firebaseSignOut,
} from 'firebase/auth';

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

// Store user data temporarily for registration
let pendingRegistration: {
  fullName: string;
  email: string;
  password: string;
  barangay: string;
} | null = null;

export const authService = {
  /** Step 1: Initiate registration - create Firebase user and send verification email. */
  async initiateRegistration(input: InitiateRegistrationInput): Promise<{ message: string; email: string; otp?: string }> {
    try {
      // Create user in Firebase Auth
      await createUserWithEmailAndPassword(auth, input.email, input.password);

      // Send email verification
      await sendSignInLinkToEmail(auth, input.email, {
        url: window.location.origin + '/dashboard',
        handleCodeInApp: true,
      });

      // Store registration data for backend
      pendingRegistration = {
        fullName: input.fullName,
        email: input.email,
        password: input.password,
        barangay: input.barangay || 'Boac',
      };

      // Sign out from Firebase (we'll use our own JWT)
      await firebaseSignOut(auth);

      // Create account in our backend
      const result = await api.post<{ message: string; email: string; otp?: string; user?: User; token?: string }>(
        '/auth/register',
        {
          fullName: input.fullName,
          email: input.email,
          password: input.password,
        }
      );

      // If backend returns token, store it
      if (result.token) {
        tokenStore.set(result.token);
      }

      return {
        message: 'Verification email sent! Check your inbox.',
        email: input.email,
      };
    } catch (error: any) {
      console.error('Registration error:', error);

      // If Firebase user already exists, try to sign in
      if (error.code === 'auth/email-already-in-use') {
        // User already exists in Firebase, try backend registration
        const result = await api.post<{ message: string; email: string; otp?: string; user?: User; token?: string }>(
          '/auth/register',
          {
            fullName: input.fullName,
            email: input.email,
            password: input.password,
          }
        );

        if (result.token) {
          tokenStore.set(result.token);
        }

        return {
          message: result.message || 'Account created!',
          email: input.email,
          otp: result.otp,
        };
      }

      throw error;
    }
  },

  /** Step 2: Complete registration - verify email link. */
  async completeRegistration(email: string, _otpCode: string): Promise<{ token: string; user: User }> {
    // Check if we have a pending registration
    if (pendingRegistration) {
      // Try to sign in with email link
      try {
        if (isSignInWithEmailLink(auth, window.location.href)) {
          await signInWithEmailLink(auth, email, window.location.href);
          await firebaseSignOut(auth);

          // Backend registration was already done in initiateRegistration
          // Just get the token from backend
          const result = await api.post<{ token: string; user: User }>(
            '/auth/login',
            { email: pendingRegistration.email, password: pendingRegistration.password }
          );

          pendingRegistration = null;
          return result;
        }
      } catch (error) {
        console.error('Email verification error:', error);
      }
    }

    // Fallback: just login with email/password
    const result = await api.post<{ token: string; user: User }>(
      '/auth/login',
      { email, password: pendingRegistration?.password || '' }
    );

    pendingRegistration = null;
    return result;
  },

  async resendOtp(email: string): Promise<{ message: string; otp?: string }> {
    // Resend verification email via Firebase
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: window.location.origin + '/dashboard',
        handleCodeInApp: true,
      });
      return { message: 'Verification email resent!' };
    } catch (error) {
      console.error('Resend error:', error);
      return { message: 'Email resent' };
    }
  },

  async login({ remember, ...input }: LoginInput): Promise<User> {
    // Try Firebase auth first
    try {
      await signInWithEmailAndPassword(auth, input.email, input.password);
      await firebaseSignOut(auth);
    } catch (error) {
      // Firebase auth failed, try backend
      console.warn('Firebase auth failed, trying backend:', error);
    }

    // Login via backend
    const res = await api.post<AuthResponse & { otpRequired?: boolean }>('/auth/login', input);
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
    firebaseSignOut(auth).catch(() => {});
  },
};
