import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { dashboardRoutes } from './dashboard.routes.js';
import { resourceRoutes } from './resource.routes.js';
import { userRoutes } from './user.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ status: 'ok', service: 'flowguard-api' }));
apiRouter.use('/auth', authRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/resources', resourceRoutes);
apiRouter.use('/users', userRoutes);
