import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const dashboardRoutes = Router();

// Every dashboard route requires a valid session.
dashboardRoutes.use(requireAuth);
dashboardRoutes.get('/', dashboardController.get);
dashboardRoutes.post('/records', dashboardController.createRecord);
