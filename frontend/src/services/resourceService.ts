/**
 * Resource service — typed access to the generic CRUD API that backs every
 * operational module (incidents, job orders, materials, requests, assets,
 * advisories). Every record is a loose key/value map; module configs know how
 * to render each entity's fields.
 */
import { api } from './apiClient';

export type EntityRow = Record<string, unknown> & { id: string };

export const resourceService = {
  list: (entity: string) => api.get<{ data: EntityRow[] }>(`/resources/${entity}`).then((r) => r.data),
  create: (entity: string, values: Record<string, unknown>) =>
    api.post<{ data: EntityRow }>(`/resources/${entity}`, values).then((r) => r.data),
  update: (entity: string, id: string, values: Record<string, unknown>) =>
    api.patch<{ data: EntityRow }>(`/resources/${entity}/${id}`, values).then((r) => r.data),
  remove: (entity: string, id: string) => api.del(`/resources/${entity}/${id}`),
};
