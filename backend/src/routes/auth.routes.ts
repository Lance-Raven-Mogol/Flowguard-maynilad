import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authRoutes = Router();

authRoutes.post('/register', asyncHandler(authController.register));
authRoutes.post('/login', asyncHandler(authController.login));
authRoutes.get('/me', requireAuth, authController.me);
authRoutes.patch('/profile', requireAuth, asyncHandler(authController.updateProfile));
authRoutes.patch('/password', requireAuth, asyncHandler(authController.changePassword));
authRoutes.patch('/avatar', requireAuth, asyncHandler(authController.updateAvatar));
