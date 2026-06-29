/**
 * Seed data — the demo content originally hard-coded across the static HTML
 * dashboards, now expressed once as structured data the API serves per role.
 */
import type { DashboardData, Role } from './types.js';

/** Demo accounts. Password for every seeded account is `password123`. */
export const SEED_USERS: ReadonlyArray<{
  fullName: string;
  email: string;
  role: Role;
  password: string;
}> = [
  { fullName: 'Valued Customer', email: 'customer@flowguard.ph', role: 'customer', password: 'password123' },
  { fullName: 'Specialist Ramos', email: 'ramos@flowguard.ph', role: 'zone-specialist', password: 'password123' },
  { fullName: 'GM Reyes', email: 'reyes@flowguard.ph', role: 'general-manager', password: 'password123' },
  { fullName: 'Officer Cruz', email: 'cruz@flowguard.ph', role: 'inventory-officer', password: 'password123' },
  { fullName: 'Tech Santiago', email: 'santiago@flowguard.ph', role: 'technical-team', password: 'password123' },
];

export const SEED_DASHBOARDS: Record<Role, DashboardData> = {
  customer: {
    role: 'customer',
    greeting: 'Welcome Back, Valued Customer',
    metrics: [
      { id: 'm1', label: 'Active Complaints', value: '1', hint: '+1 Since yesterday', trend: 'up', icon: 'alert-circle', accent: 'customers' },
      { id: 'm2', label: 'Current Balance', value: 'P 1,240.50', hint: 'Due in 5 days', trend: 'down', icon: 'wallet', accent: 'revenue' },
      { id: 'm3', label: 'Consumption', value: '15m³', hint: '- 2% vs last month', trend: 'down', icon: 'droplet', accent: 'profit' },
      { id: 'm4', label: 'Last Bill Status', value: 'Paid', hint: 'No arrears', trend: 'up', icon: 'check-circle', accent: 'invoices' },
    ],
    tables: {
      activity: {
        id: 'activity', columns: ['No', 'Reference ID', 'Type', 'Description', 'Date', 'Status'],
        rows: [
          { id: 'C-998', cells: [{ text: '1' }, { text: '#C-998', strong: true }, { text: 'Complaint', badge: 'high' }, { text: 'Pipe Leakage - Main gate area' }, { text: '01/05/2026' }, { text: 'Under Investigation', status: 'pending' }] },
          { id: 'B-1052', cells: [{ text: '2' }, { text: '#B-1052', strong: true }, { text: 'Payment', badge: 'low' }, { text: 'Monthly Bill - April 2026' }, { text: '25/04/2026' }, { text: 'Paid', status: 'paid' }] },
          { id: 'B-1051', cells: [{ text: '3' }, { text: '#B-1051', strong: true }, { text: 'Payment', badge: 'low' }, { text: 'Monthly Bill - March 2026' }, { text: '22/03/2026' }, { text: 'Paid', status: 'paid' }] },
        ],
      },
      complaints: {
        id: 'complaints', columns: ['Reference', 'Description', 'Date Filed', 'Urgency', 'Status'],
        rows: [
          { id: 'C-998', cells: [{ text: '#C-998', strong: true }, { text: 'Main gate pipe leak near the driveway.' }, { text: '01/05/2026' }, { text: 'High', badge: 'high' }, { text: 'Investigation', status: 'pending' }] },
          { id: 'C-850', cells: [{ text: '#C-850', strong: true }, { text: 'Water meter showing unusual reading.' }, { text: '20/04/2026' }, { text: 'Medium', badge: 'medium' }, { text: 'Resolved', status: 'paid' }] },
          { id: 'C-842', cells: [{ text: '#C-842', strong: true }, { text: 'Low water pressure during peak hours.' }, { text: '15/04/2026' }, { text: 'Low', badge: 'low' }, { text: 'Resolved', status: 'paid' }] },
        ],
      },
      bills: {
        id: 'bills', columns: ['Invoice #', 'Period', 'Amount', 'Due Date', 'Status'],
        rows: [
          { id: 'INV-2026-05', cells: [{ text: '#INV-2026-05', strong: true }, { text: 'May 2026' }, { text: 'P 1,240.50' }, { text: '10/05/2026' }, { text: 'Unpaid', status: 'pending' }] },
          { id: 'INV-2026-04', cells: [{ text: '#INV-2026-04', strong: true }, { text: 'Apr 2026' }, { text: 'P 1,120.00' }, { text: '10/04/2026' }, { text: 'Paid', status: 'paid' }] },
          { id: 'INV-2026-03', cells: [{ text: '#INV-2026-03', strong: true }, { text: 'Mar 2026' }, { text: 'P 1,350.25' }, { text: '10/03/2026' }, { text: 'Paid', status: 'paid' }] },
        ],
      },
    },
  },

  'general-manager': {
    role: 'general-manager',
    greeting: 'Welcome Back, GM Reyes',
    metrics: [
      { id: 'm1', label: 'Active Network Repairs', value: '24', hint: '8 in Boac, 16 Island-wide', trend: 'up', icon: 'wrench', accent: 'customers' },
      { id: 'm2', label: 'Monthly Revenue Target', value: 'P 2.4M', hint: '+12.5% vs last month', trend: 'up', icon: 'trending-up', accent: 'revenue' },
      { id: 'm3', label: 'Budget Utilization', value: '85%', hint: 'Q2 Capex limit approaching', trend: 'down', icon: 'pie-chart', accent: 'profit' },
      { id: 'm4', label: 'Field Staff Active', value: '18/20', hint: 'All 6 municipalities covered', trend: 'up', icon: 'users', accent: 'invoices' },
    ],
    tables: {
      alerts: {
        id: 'alerts', columns: ['Priority', 'Alert Type', 'Municipality', 'Description', 'Status'],
        rows: [
          { id: 'a1', cells: [{ text: 'High', badge: 'high' }, { text: 'Inventory Critical' }, { text: 'Boac HQ' }, { text: 'Water Meters below 10% threshold' }, { text: 'Action Required', status: 'overdue' }] },
          { id: 'a2', cells: [{ text: 'High', badge: 'high' }, { text: 'Main Line Repair' }, { text: 'Mogpog' }, { text: 'Major pipe burst reported' }, { text: 'In Progress', status: 'pending' }] },
          { id: 'a3', cells: [{ text: 'Medium', badge: 'medium' }, { text: 'Staff Leave' }, { text: 'Gasan' }, { text: 'Tech Reyes on leave - coverage needed' }, { text: 'Pending Assignment', status: 'pending' }] },
          { id: 'a4', cells: [{ text: 'Medium', badge: 'medium' }, { text: 'Budget Alert' }, { text: 'All Zones' }, { text: 'Q2 Capex at 85%' }, { text: 'Review Needed', status: 'pending' }] },
          { id: 'a5', cells: [{ text: 'Low', badge: 'low' }, { text: 'Routine Inspection' }, { text: 'Santa Cruz' }, { text: 'Monthly zone audit scheduled' }, { text: 'Scheduled', status: 'paid' }] },
        ],
      },
      staff: {
        id: 'staff', columns: ['Employee Name', 'Role Designation', 'Assigned Municipality', 'Current Status'],
        rows: [
          { id: 's1', cells: [{ text: 'Specialist Ramos', strong: true }, { text: 'Zone Specialist' }, { text: 'Boac (Capital)' }, { text: 'Active in Field', status: 'paid' }] },
          { id: 's2', cells: [{ text: 'Officer Cruz', strong: true }, { text: 'Inventory Officer' }, { text: 'Boac (HQ)' }, { text: 'At Office', status: 'paid' }] },
          { id: 's3', cells: [{ text: 'Tech Santiago', strong: true }, { text: 'Senior Technician' }, { text: 'Gasan & Buenavista' }, { text: 'Active in Field', status: 'paid' }] },
          { id: 's4', cells: [{ text: 'Tech Reyes', strong: true }, { text: 'Field Technician' }, { text: 'Mogpog' }, { text: 'On Leave', status: 'pending' }] },
          { id: 's5', cells: [{ text: 'Specialist Santos', strong: true }, { text: 'Zone Specialist' }, { text: 'Santa Cruz & Torrijos' }, { text: 'Active in Field', status: 'paid' }] },
        ],
      },
      inventory: {
        id: 'inventory', columns: ['Asset Category', 'Total Stock Value', 'Items Below Threshold', 'Last Full Audit', 'Health Status'],
        rows: [
          { id: 'i1', cells: [{ text: 'Pipes & Fittings', strong: true }, { text: 'P 450,000' }, { text: '12 SKUs' }, { text: '01/05/2026' }, { text: 'Healthy', status: 'paid' }] },
          { id: 'i2', cells: [{ text: 'Water Meters (Residential)', strong: true }, { text: 'P 280,000' }, { text: '25 SKUs' }, { text: '01/05/2026' }, { text: 'Critical Low', status: 'overdue' }] },
          { id: 'i3', cells: [{ text: 'Tools & Heavy Equipment', strong: true }, { text: 'P 1.2M' }, { text: '2 SKUs' }, { text: '25/04/2026' }, { text: 'Healthy', status: 'paid' }] },
        ],
      },
      reports: {
        id: 'reports', columns: ['Document Title', 'Category', 'Generation Date', 'Author / Source'],
        rows: [
          { id: 'r1', cells: [{ text: 'April 2026 Executive Summary', strong: true }, { text: 'Executive' }, { text: '01/05/2026' }, { text: 'Automated System' }] },
          { id: 'r2', cells: [{ text: 'Q1 Capex Budget Utilization', strong: true }, { text: 'Financial' }, { text: '15/04/2026' }, { text: 'Finance Dept.' }] },
          { id: 'r3', cells: [{ text: 'Boac District NRW Analysis', strong: true }, { text: 'Technical' }, { text: '10/04/2026' }, { text: 'Spec. Ramos' }] },
        ],
      },
      purchaseOrders: {
        id: 'purchaseOrders', columns: ['PO Reference', 'Vendor / Supplier', 'Total Valuation', 'Logistics Status', 'ETA'],
        rows: [
          { id: 'PO-2026-102', cells: [{ text: '#PO-2026-102', strong: true }, { text: 'AquaSupplies PH' }, { text: 'P 320,000' }, { text: 'In Transit to Marinduque', status: 'pending' }, { text: '08/05/2026' }] },
          { id: 'PO-2026-098', cells: [{ text: '#PO-2026-098', strong: true }, { text: 'PipeMaster Co.' }, { text: 'P 145,000' }, { text: 'Received at HQ (Boac)', status: 'paid' }, { text: '--' }] },
        ],
      },
      vendors: {
        id: 'vendors', columns: ['Vendor Name', 'Asset Category', 'Primary Contact', 'Supplier Rating', 'Status'],
        rows: [
          { id: 'v1', cells: [{ text: 'AquaSupplies Philippines', strong: true }, { text: 'Main Lines & Pumps' }, { text: 'Maria Santos' }, { text: '★★★★★' }, { text: 'Contracted', status: 'paid' }] },
          { id: 'v2', cells: [{ text: 'PipeMaster Manufacturing', strong: true }, { text: 'Fittings & PVC' }, { text: 'John Doe' }, { text: '★★★★☆' }, { text: 'Contracted', status: 'paid' }] },
          { id: 'v3', cells: [{ text: 'Marinduque General Hardware', strong: true }, { text: 'Tools & Safety Gear' }, { text: 'Lucy Tan' }, { text: '★★★☆☆' }, { text: 'Verified', status: 'pending' }] },
        ],
      },
    },
  },

  'inventory-officer': {
    role: 'inventory-officer',
    greeting: 'Welcome Back, Officer Cruz',
    metrics: [
      { id: 'm1', label: 'Low Stock Items', value: '12', hint: 'Action Required', trend: 'down', icon: 'alert-octagon', accent: 'profit' },
      { id: 'm2', label: 'Pending MRFs', value: '4', hint: '2 Awaiting Approval', trend: 'up', icon: 'file-text', accent: 'customers' },
      { id: 'm3', label: 'Items Issued', value: '145', hint: 'This week', trend: 'up', icon: 'package-check', accent: 'revenue' },
      { id: 'm4', label: 'Total Stock Value', value: 'P 850k', hint: 'Current valuation', icon: 'banknote', accent: 'invoices' },
    ],
    tables: {
      recentMrf: {
        id: 'recentMrf', columns: ['MRF ID', 'Requested By', 'Items', 'Department', 'Date', 'Status'],
        rows: [
          { id: 'MRF-102', cells: [{ text: '#MRF-102', strong: true }, { text: 'Tech Santiago' }, { text: '3x PVC Pipe, 1x Coupling' }, { text: 'Technical' }, { text: '02/05/2026' }, { text: 'Pending', status: 'pending' }] },
          { id: 'MRF-101', cells: [{ text: '#MRF-101', strong: true }, { text: 'Tech Ramos' }, { text: '1x Water Meter G-4' }, { text: 'Technical' }, { text: '01/05/2026' }, { text: 'Issued', status: 'paid' }] },
          { id: 'MRF-100', cells: [{ text: '#MRF-100', strong: true }, { text: 'Spec. Ramos' }, { text: '2x Brass Coupling' }, { text: 'Zone Specialist' }, { text: '30/04/2026' }, { text: 'Issued', status: 'paid' }] },
        ],
      },
      materials: {
        id: 'materials', columns: ['SKU', 'Item Name', 'Category', 'Current Stock', 'Status'],
        rows: [
          { id: 'PI-001', cells: [{ text: 'PI-001' }, { text: 'PVC Pipe 2" (Standard)' }, { text: 'Pipes' }, { text: '120 units' }, { text: 'In Stock', status: 'paid' }] },
          { id: 'WM-005', cells: [{ text: 'WM-005' }, { text: 'Water Meter G-4' }, { text: 'Meters' }, { text: '5 units' }, { text: 'Low Stock', status: 'overdue' }] },
          { id: 'FT-022', cells: [{ text: 'FT-022' }, { text: 'Brass Coupling 2"' }, { text: 'Fittings' }, { text: '45 units' }, { text: 'In Stock', status: 'paid' }] },
          { id: 'SL-010', cells: [{ text: 'SL-010' }, { text: 'Industrial Sealant' }, { text: 'Consumables' }, { text: '2 units' }, { text: 'Out of Stock', status: 'overdue' }] },
        ],
      },
      mrf: {
        id: 'mrf', columns: ['MRF ID', 'Technician', 'Items Requested', 'Date', 'Status'],
        rows: [
          { id: 'MRF-102', cells: [{ text: '#MRF-102' }, { text: 'Tech Santiago' }, { text: '3x PVC Pipe 2", 1x Coupling' }, { text: '02/05/2026' }, { text: 'Pending Issue', status: 'pending' }] },
          { id: 'MRF-103', cells: [{ text: '#MRF-103' }, { text: 'Tech Reyes' }, { text: '2x Water Meter, 1x Sealant' }, { text: '02/05/2026' }, { text: 'Pending Issue', status: 'pending' }] },
          { id: 'MRF-101', cells: [{ text: '#MRF-101' }, { text: 'Tech Ramos' }, { text: '1x Water Meter G-4' }, { text: '01/05/2026' }, { text: 'Issued', status: 'paid' }] },
        ],
      },
      shipments: {
        id: 'shipments', columns: ['Tracking #', 'Supplier', 'Expected Date', 'Status'],
        rows: [
          { id: 'AQ-88902', cells: [{ text: '#AQ-88902' }, { text: 'AquaSupplies Inc.' }, { text: '05/05/2026' }, { text: 'In Transit', status: 'pending' }] },
          { id: 'PM-55210', cells: [{ text: '#PM-55210' }, { text: 'PipeMaster Co.' }, { text: '03/05/2026' }, { text: 'Arrived', status: 'paid' }] },
        ],
      },
      audit: {
        id: 'audit', columns: ['Timestamp', 'Action', 'User', 'Item', 'Change'],
        rows: [
          { id: 'au1', cells: [{ text: '03/05/2026 10:20' }, { text: 'Stock Issued' }, { text: 'Officer Cruz' }, { text: 'PVC Pipe 2"' }, { text: '-3 units' }] },
          { id: 'au2', cells: [{ text: '02/05/2026 15:45' }, { text: 'Stock Updated' }, { text: 'Officer Cruz' }, { text: 'Water Meter G-4' }, { text: '+50 units' }] },
          { id: 'au3', cells: [{ text: '01/05/2026 09:12' }, { text: 'System Audit' }, { text: 'Auto-System' }, { text: 'Multiple' }, { text: 'Log cycle complete', status: 'paid' }] },
        ],
      },
    },
  },

  'technical-team': {
    role: 'technical-team',
    greeting: 'Welcome Back, Tech Santiago',
    metrics: [
      { id: 'm1', label: 'Assigned Jobs', value: '3', hint: 'For today', icon: 'briefcase', accent: 'customers' },
      { id: 'm2', label: 'Ready to Start', value: '1', hint: 'Materials issued', trend: 'up', icon: 'play', accent: 'revenue' },
      { id: 'm3', label: 'Ongoing Jobs', value: '2', hint: 'In-field', icon: 'loader', accent: 'profit' },
      { id: 'm4', label: 'Completed Jobs', value: '28', hint: 'This month', trend: 'up', icon: 'check-circle-2', accent: 'invoices' },
    ],
    tables: {
      priorityTasks: {
        id: 'priorityTasks', columns: ['Job ID', 'Location', 'Task Description', 'Priority', 'Status'],
        rows: [
          { id: 'JO-552', cells: [{ text: '#JO-552', strong: true }, { text: 'Block 5 Lot 2' }, { text: 'Repair Leak (Main Pipe)' }, { text: 'High', badge: 'high' }, { text: 'In Progress', status: 'pending' }] },
          { id: 'JO-555', cells: [{ text: '#JO-555', strong: true }, { text: 'Street 12' }, { text: 'Supply Interruption Fix' }, { text: 'Urgent', badge: 'high' }, { text: 'Waiting Materials', status: 'overdue' }] },
          { id: 'JO-548', cells: [{ text: '#JO-548', strong: true }, { text: '45 High Rd' }, { text: 'Meter Installation' }, { text: 'Medium', badge: 'medium' }, { text: 'Scheduled', status: 'pending' }] },
        ],
      },
      jobOrders: {
        id: 'jobOrders', columns: ['Job ID', 'Location', 'Task Description', 'Status'],
        rows: [
          { id: 'JO-552', cells: [{ text: '#JO-552' }, { text: '123 Main St' }, { text: 'Repair Leak (Main Pipe)' }, { text: 'In Progress', status: 'pending' }] },
          { id: 'JO-555', cells: [{ text: '#JO-555' }, { text: 'Street 12, West' }, { text: 'Supply Interruption Fix' }, { text: 'Waiting Materials', status: 'overdue' }] },
          { id: 'JO-550', cells: [{ text: '#JO-550' }, { text: '45 High Rd' }, { text: 'Meter Installation' }, { text: 'Completed', status: 'paid' }] },
        ],
      },
      techMrf: {
        id: 'techMrf', columns: ['MRF ID', 'Job ID', 'Items', 'Date', 'Status'],
        rows: [
          { id: 'MRF-102', cells: [{ text: '#MRF-102' }, { text: '#JO-552' }, { text: '3x PVC Pipe 2", 1x Coupling' }, { text: '02/05/2026' }, { text: 'Awaiting Issue', status: 'pending' }] },
          { id: 'MRF-095', cells: [{ text: '#MRF-095' }, { text: '#JO-540' }, { text: '1x Water Meter G-4' }, { text: '28/04/2026' }, { text: 'Received', status: 'paid' }] },
        ],
      },
    },
  },

  'zone-specialist': {
    role: 'zone-specialist',
    greeting: 'Welcome Back, Specialist Ramos',
    metrics: [
      { id: 'm1', label: 'New Complaints', value: '5', hint: '3 Urgent cases', trend: 'up', icon: 'alert-triangle', accent: 'customers' },
      { id: 'm2', label: 'Completed Reports', value: '12', hint: '+4 this week', trend: 'up', icon: 'clipboard-check', accent: 'revenue' },
      { id: 'm3', label: 'Assigned Area', value: 'Boac', hint: 'Capital District', icon: 'map', accent: 'profit' },
      { id: 'm4', label: 'Avg Response', value: '4.2 hrs', hint: '-15% time', trend: 'down', icon: 'clock', accent: 'invoices' },
    ],
    tables: {
      priorityCases: {
        id: 'priorityCases', columns: ['Case ID', 'Location', 'Issue Type', 'Priority', 'Due', 'Status'],
        rows: [
          { id: 'C-998', cells: [{ text: '#C-998', strong: true }, { text: 'Block 5 Lot 2' }, { text: 'Main Pipe Leak' }, { text: 'Critical', badge: 'high' }, { text: 'Today' }, { text: 'Urgent', status: 'overdue' }] },
          { id: 'C-995', cells: [{ text: '#C-995', strong: true }, { text: 'Street 12' }, { text: 'No Water Supply' }, { text: 'Urgent', badge: 'high' }, { text: 'In 2hrs' }, { text: 'Assigned', status: 'pending' }] },
          { id: 'C-990', cells: [{ text: '#C-990', strong: true }, { text: 'North Park Area' }, { text: 'Illegal Connection' }, { text: 'Medium', badge: 'medium' }, { text: 'Tomorrow' }, { text: 'Scheduled', status: 'pending' }] },
        ],
      },
      investigations: {
        id: 'investigations', columns: ['No', 'ID', 'Location', 'Issue Reported', 'Assigned'],
        rows: [
          { id: 'C-998', cells: [{ text: '1' }, { text: '#C-998', strong: true }, { text: 'Phase 1, B5 L2' }, { text: 'Major Leakage', badge: 'high' }, { text: '02/05/2026' }] },
          { id: 'C-995', cells: [{ text: '2' }, { text: '#C-995', strong: true }, { text: 'West Side, S12' }, { text: 'Supply Interruption', badge: 'medium' }, { text: '01/05/2026' }] },
          { id: 'C-990', cells: [{ text: '3' }, { text: '#C-990', strong: true }, { text: 'North Park Area' }, { text: 'Illegal Connection?', badge: 'low' }, { text: '30/04/2026' }] },
        ],
      },
      fieldReports: {
        id: 'fieldReports', columns: ['Report ID', 'Date', 'Municipality', 'Inspection Category', 'Findings Summary', 'Status'],
        rows: [
          { id: 'REP-550', cells: [{ text: '#REP-550', strong: true }, { text: '01/05/2026' }, { text: 'Boac' }, { text: 'Leakage Report' }, { text: 'Corroded 2" PVC pipe found at Phase 1.' }, { text: 'Approved', status: 'paid' }] },
          { id: 'REP-548', cells: [{ text: '#REP-548', strong: true }, { text: '30/04/2026' }, { text: 'Mogpog' }, { text: 'Illegal Usage' }, { text: 'Unregistered sub-meter connection detected.' }, { text: 'Under Review', status: 'pending' }] },
          { id: 'REP-545', cells: [{ text: '#REP-545', strong: true }, { text: '28/04/2026' }, { text: 'Boac' }, { text: 'Meter Audit' }, { text: 'Water meter #M-402 recalibrated.' }, { text: 'Approved', status: 'paid' }] },
          { id: 'REP-542', cells: [{ text: '#REP-542', strong: true }, { text: '25/04/2026' }, { text: 'Gasan' }, { text: 'Routine Check' }, { text: 'No major issues found. Pressure stable.' }, { text: 'Archived', status: 'paid' }] },
        ],
      },
    },
  },
};
