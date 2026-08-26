import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { resourceRoutes } from './resource.routes.js';
import { userRoutes } from './user.routes.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { findRowsBy } from '../models/resourceRepo.js';
import { notFound } from '../utils/httpError.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ status: 'ok', service: 'flowguard-api' }));

/**
 * Public — no auth required.
 * Returns safe display fields for a material by SKU.
 * Used by the QR code scan page so anyone can view material info without logging in.
 */
apiRouter.get('/material/:sku', asyncHandler(async (req, res) => {
  const rows = await findRowsBy('materials', 'sku', req.params.sku);
  if (!rows.length) throw notFound('Material not found.');
  const r = rows[0];
  res.json({
    data: {
      sku:        r.sku,
      name:       r.name,
      category:   r.category,
      description: r.description,
      quantity:   r.quantity,
      unit:       r.unit,
      unit_price: r.unit_price,
      supplier:   r.supplier,
      source:     r.source,
      status:     r.status,
      min_level:  r.min_level,
    },
  });
}));

apiRouter.use('/auth', authRoutes);
apiRouter.use('/resources', resourceRoutes);
apiRouter.use('/users', userRoutes);
