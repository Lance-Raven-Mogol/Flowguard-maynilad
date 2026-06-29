import type { DashboardData, TableRow } from '../models/types';
import { api } from './apiClient';

export const dashboardService = {
  get: () => api.get<DashboardData>('/dashboard'),

  createRecord: (action: string, payload: Record<string, string>) =>
    api.post<{ tableId: string; row: TableRow }>('/dashboard/records', { action, payload }),
};
