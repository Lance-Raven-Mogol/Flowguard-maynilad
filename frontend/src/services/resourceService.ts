/**
 * Resource service — typed access to the generic CRUD API that backs every
 * operational module (incidents, job orders, materials, requests, assets,
 * advisories). Every record is a loose key/value map; module configs know how
 * to render each entity's fields.
 */
import { api } from './apiClient';

export type EntityRow = Record<string, unknown> & { id: string };

/** Shared signals used by live tables and the dashboard-wide stats snapshot. */
export const RESOURCE_CHANGE_KEY = 'flowguard:resource-change';
export const RESOURCE_CHANGE_EVENT = 'flowguard:resource-change';

/** Notify this window and other open FlowGuard tabs that data has changed. */
const broadcastResourceChange = (entity: string): void => {
  const detail = { entity, at: Date.now() };
  window.dispatchEvent(new CustomEvent(RESOURCE_CHANGE_EVENT, { detail }));
  try {
    localStorage.setItem(RESOURCE_CHANGE_KEY, JSON.stringify(detail));
  } catch {
    /* Storage can be unavailable; background polling remains as fallback. */
  }
};

export const resourceService = {
  list: (entity: string, archived?: 'only' | 'all') =>
    api
      .get<{ data: EntityRow[] }>(`/resources/${entity}${archived ? `?archived=${archived}` : ''}`)
      .then((r) => r.data),
  create: (entity: string, values: Record<string, unknown>) =>
    api.post<{ data: EntityRow }>(`/resources/${entity}`, values).then((r) => {
      broadcastResourceChange(entity);
      return r.data;
    }),
  update: (entity: string, id: string, values: Record<string, unknown>) =>
    api.patch<{ data: EntityRow }>(`/resources/${entity}/${id}`, values).then((r) => {
      broadcastResourceChange(entity);
      return r.data;
    }),
  remove: (entity: string, id: string) => api.del(`/resources/${entity}/${id}`).then(() => {
    broadcastResourceChange(entity);
  }),
};
