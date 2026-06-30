import { Router } from 'express';
import { resourceController } from '../controllers/resource.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const resourceRoutes = Router();

// Every resource route requires a valid session.
resourceRoutes.use(requireAuth);
resourceRoutes.get('/:entity', asyncHandler(resourceController.list));
resourceRoutes.post('/:entity', asyncHandler(resourceController.create));
resourceRoutes.patch('/:entity/:id', asyncHandler(resourceController.update));
resourceRoutes.delete('/:entity/:id', asyncHandler(resourceController.remove));
