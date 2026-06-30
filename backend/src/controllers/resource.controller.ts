/** Resource controller — thin HTTP adapters over the generic resource service. */
import type { Request, Response } from 'express';
import { resourceService } from '../services/resource.service.js';
import { unauthorized } from '../utils/httpError.js';

export const resourceController = {
  async list(req: Request, res: Response): Promise<void> {
    const rows = await resourceService.list(req.params.entity);
    res.json({ data: rows });
  },

  async create(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    const row = await resourceService.create(req.params.entity, req.user.role, req.body ?? {});
    res.status(201).json({ data: row });
  },

  async update(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    const row = await resourceService.update(req.params.entity, req.user.role, req.params.id, req.body ?? {});
    res.json({ data: row });
  },

  async remove(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    await resourceService.remove(req.params.entity, req.user.role, req.params.id);
    res.status(204).end();
  },
};
