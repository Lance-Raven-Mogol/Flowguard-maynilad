import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authRoutes = Router();

// Email verification registration flow
authRoutes.post('/register/initiate', asyncHandler(authController.initiateRegistration));
authRoutes.post('/register/complete', asyncHandler(authController.completeRegistration));
authRoutes.post('/register/resend-otp', asyncHandler(authController.resendOtp));

// Legacy registration (admin-created accounts)
authRoutes.post('/register', asyncHandler(authController.register));

authRoutes.post('/login', asyncHandler(authController.login));
authRoutes.post('/login/verify-otp', asyncHandler(authController.verifyLoginOtp));
authRoutes.post('/login/resend-otp', asyncHandler(authController.resendLoginOtp));
authRoutes.get('/me', requireAuth, authController.me);
authRoutes.patch('/profile', requireAuth, asyncHandler(authController.updateProfile));
authRoutes.patch('/password', requireAuth, asyncHandler(authController.changePassword));
authRoutes.patch('/avatar', requireAuth, asyncHandler(authController.updateAvatar));

// OTP endpoints
authRoutes.post('/otp/generate', requireAuth, asyncHandler(authController.generateOtp));
authRoutes.post('/otp/verify', requireAuth, asyncHandler(authController.verifyOtp));
authRoutes.post('/otp/enable', requireAuth, asyncHandler(authController.enableOtp));
authRoutes.post('/otp/disable', requireAuth, asyncHandler(authController.disableOtp));
