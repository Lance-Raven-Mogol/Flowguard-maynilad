/**
 * Dashboard service — serves per-role dashboard data and handles the "create"
 * actions that the dashboard modals trigger (file complaint, new PO, etc.).
 */
import { store } from '../models/store.js';
import type { DashboardData, Role, TableRow } from '../models/types.js';
import { badRequest, notFound } from '../utils/httpError.js';

const today = () => new Date().toLocaleDateString('en-GB');
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Registry mapping an action key to the table it appends to and the row it
 * builds. This is the data-driven equivalent of the original `openModal`
 * switch statement, but on the server where the data actually lives.
 */
type RowFactory = (payload: Record<string, string>) => { tableId: string; row: TableRow };

const ACTIONS: Partial<Record<Role, Record<string, RowFactory>>> = {
  customer: {
    'file-complaint': (p) => {
      const id = `C-${rand(100, 999)}`;
      return {
        tableId: 'complaints',
        row: {
          id,
          cells: [
            { text: `#${id}`, strong: true },
            { text: p.description || 'New complaint filed.' },
            { text: today() },
            { text: p.urgency || 'Medium', badge: 'medium' },
            { text: 'Investigation', status: 'pending' },
          ],
        },
      };
    },
  },
  'general-manager': {
    'new-po': (p) => {
      const id = `PO-2026-${rand(100, 999)}`;
      return {
        tableId: 'purchaseOrders',
        row: {
          id,
          cells: [
            { text: `#${id}`, strong: true },
            { text: p.vendor || 'Unknown Vendor' },
            { text: p.value || 'P 0.00' },
            { text: 'Processing PO', status: 'pending' },
            { text: 'TBD' },
          ],
        },
      };
    },
    'register-vendor': (p) => ({
      tableId: 'vendors',
      row: {
        id: `V-${rand(100, 999)}`,
        cells: [
          { text: p.name || 'New Vendor', strong: true },
          { text: p.category || 'General' },
          { text: p.contact || 'N/A' },
          { text: '☆☆☆☆☆' },
          { text: 'Pending', status: 'pending' },
        ],
      },
    }),
  },
  'inventory-officer': {
    'add-material': (p) => {
      const stock = Number(p.stock || '0');
      return {
        tableId: 'materials',
        row: {
          id: `SKU-${rand(100, 999)}`,
          cells: [
            { text: `SKU-${rand(100, 999)}` },
            { text: p.name || 'New Item' },
            { text: p.category || 'Consumables' },
            { text: `${stock} units` },
            stock > 10 ? { text: 'In Stock', status: 'paid' } : { text: 'Low Stock', status: 'overdue' },
          ],
        },
      };
    },
  },
  'technical-team': {
    'new-mrf': () => {
      const id = `MRF-${rand(100, 999)}`;
      return {
        tableId: 'techMrf',
        row: {
          id,
          cells: [
            { text: `#${id}` },
            { text: '#JO-Pending' },
            { text: 'Requested Materials' },
            { text: today() },
            { text: 'Awaiting Issue', status: 'pending' },
          ],
        },
      };
    },
  },
  'zone-specialist': {
    'start-inspection': (p) => {
      const id = `C-${rand(100, 999)}`;
      return {
        tableId: 'investigations',
        row: {
          id,
          cells: [
            { text: '1' },
            { text: `#${id}`, strong: true },
            { text: p.location || 'Pending Location' },
            { text: 'New Inspection', badge: 'medium' },
            { text: today() },
          ],
        },
      };
    },
    'submit-report': (p) => {
      const id = `REP-${rand(100, 999)}`;
      return {
        tableId: 'fieldReports',
        row: {
          id,
          cells: [
            { text: `#${id}`, strong: true },
            { text: today() },
            { text: p.municipality || 'Assigned Zone' },
            { text: p.category || 'Field Report' },
            { text: p.summary || 'Report submitted awaiting review.' },
            { text: 'Under Review', status: 'pending' },
          ],
        },
      };
    },
  },
};

export const dashboardService = {
  getDashboard(role: Role): DashboardData {
    const data = store.getDashboard(role);
    if (!data) throw notFound('Dashboard not found for role.');
    return data;
  },

  /** Execute a create-action for a role, appending a row to the right table. */
  createRecord(role: Role, action: string, payload: Record<string, string>): { tableId: string; row: TableRow } {
    const factory = ACTIONS[role]?.[action];
    if (!factory) throw badRequest(`Unsupported action "${action}" for role "${role}".`);
    const { tableId, row } = factory(payload);
    const created = store.addRow(role, tableId, row);
    if (!created) throw notFound(`Table "${tableId}" not found.`);
    return { tableId, row: created };
  },
};
