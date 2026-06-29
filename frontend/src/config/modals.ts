/**
 * Modal catalogue — the declarative replacement for the original `modals`
 * object in dashboard.js. Each entry describes its form; `action` (when set)
 * is the backend record-creation action the submission maps to.
 */
export type ModalField =
  | { kind: 'text' | 'number' | 'date'; name: string; label: string; placeholder?: string; value?: string; readOnly?: boolean }
  | { kind: 'textarea'; name: string; label: string; placeholder?: string }
  | { kind: 'select'; name: string; label: string; options: string[] };

export interface ModalConfig {
  title: string;
  fields: ModalField[];
  submitText: string;
  successMsg: string;
  /** Backend action key — when present the submission appends a real row. */
  action?: string;
}

export type ModalKey =
  | 'file-complaint'
  | 'new-po'
  | 'register-vendor'
  | 'add-material'
  | 'new-mrf'
  | 'start-inspection'
  | 'submit-report'
  | 'add-staff'
  | 'generate-report'
  | 'order-inventory';

const MUNICIPALITIES = ['Boac (Capital)', 'Mogpog', 'Gasan', 'Buenavista', 'Torrijos', 'Santa Cruz'];

export const MODALS: Record<ModalKey, ModalConfig> = {
  'file-complaint': {
    title: 'File New Complaint',
    action: 'file-complaint',
    submitText: 'Submit Complaint',
    successMsg: 'Complaint filed successfully!',
    fields: [
      { kind: 'select', name: 'issueType', label: 'Issue Type', options: ['Pipe Leakage', 'No Water Supply', 'Water Quality', 'Billing Error', 'Other'] },
      { kind: 'textarea', name: 'description', label: 'Description', placeholder: 'Please describe the issue in detail…' },
      { kind: 'select', name: 'urgency', label: 'Urgency', options: ['Low', 'Medium', 'High (Urgent)'] },
    ],
  },
  'new-po': {
    title: 'Create Purchase Order',
    action: 'new-po',
    submitText: 'Issue PO',
    successMsg: 'Purchase order issued to vendor.',
    fields: [
      { kind: 'text', name: 'vendor', label: 'Vendor Name', placeholder: 'e.g., AquaSupplies Inc.' },
      { kind: 'textarea', name: 'details', label: 'Order Details / Items', placeholder: 'List items, SKUs, and quantities…' },
      { kind: 'text', name: 'value', label: 'Estimated Value', placeholder: 'P 0.00' },
    ],
  },
  'register-vendor': {
    title: 'Register New Preferred Vendor',
    action: 'register-vendor',
    submitText: 'Register Vendor',
    successMsg: 'Vendor registered and added to directory.',
    fields: [
      { kind: 'text', name: 'name', label: 'Company Name', placeholder: 'Legal business name' },
      { kind: 'select', name: 'category', label: 'Asset Category', options: ['Main Lines & Pumps', 'Fittings & PVC', 'Tools & Safety Gear', 'Electrical Components'] },
      { kind: 'text', name: 'contact', label: 'Primary Contact Person', placeholder: 'Full Name' },
      { kind: 'textarea', name: 'address', label: 'Business Address', placeholder: 'Office / Warehouse address' },
    ],
  },
  'add-material': {
    title: 'Add New Material',
    action: 'add-material',
    submitText: 'Add Item',
    successMsg: 'New material added to inventory.',
    fields: [
      { kind: 'text', name: 'name', label: 'Item Name', placeholder: 'e.g., Chlorine Drum' },
      { kind: 'select', name: 'category', label: 'Category', options: ['Pipes', 'Meters', 'Fittings', 'Consumables'] },
      { kind: 'number', name: 'stock', label: 'Initial Stock', value: '10' },
    ],
  },
  'new-mrf': {
    title: 'Create Material Request (MRF)',
    action: 'new-mrf',
    submitText: 'Submit MRF',
    successMsg: 'Material request submitted to Inventory.',
    fields: [
      { kind: 'text', name: 'jobOrder', label: 'Job Order Reference', value: '#JO-552', readOnly: true },
      { kind: 'textarea', name: 'items', label: 'Items Needed', placeholder: 'e.g., 5x PVC Pipe 2", 2x Brass Coupling…' },
      { kind: 'select', name: 'urgency', label: 'Urgency', options: ['Standard', 'Urgent (Work Stalled)'] },
    ],
  },
  'start-inspection': {
    title: 'Start New Zone Inspection',
    action: 'start-inspection',
    submitText: 'Launch Inspection',
    successMsg: 'Inspection task created successfully!',
    fields: [
      { kind: 'select', name: 'municipality', label: 'Target Municipality', options: MUNICIPALITIES },
      { kind: 'text', name: 'location', label: 'Specific Location / Address', placeholder: 'e.g., Block 12 Lot 4, Riverside Subd.' },
      { kind: 'select', name: 'category', label: 'Inspection Category', options: ['Routine Check', 'Leakage Report', 'Meter Audit', 'Illegal Usage'] },
      { kind: 'textarea', name: 'notes', label: 'Preliminary Notes', placeholder: 'Briefly describe the purpose of this inspection…' },
    ],
  },
  'submit-report': {
    title: 'Submit New Field Report',
    action: 'submit-report',
    submitText: 'Submit Report',
    successMsg: 'Field report submitted and queued for approval.',
    fields: [
      { kind: 'select', name: 'municipality', label: 'Municipality', options: ['Boac', 'Mogpog', 'Gasan', 'Buenavista', 'Torrijos', 'Santa Cruz'] },
      { kind: 'select', name: 'category', label: 'Inspection Category', options: ['Routine Check', 'Leakage Report', 'Meter Audit', 'Illegal Usage'] },
      { kind: 'textarea', name: 'summary', label: 'Findings Summary', placeholder: 'Provide a brief summary of your findings…' },
    ],
  },
  'add-staff': {
    title: 'Add New Staff Member',
    submitText: 'Add Staff',
    successMsg: 'New staff member added successfully!',
    fields: [
      { kind: 'text', name: 'name', label: 'Full Name', placeholder: 'Enter name' },
      { kind: 'select', name: 'role', label: 'Role', options: ['Zone Specialist', 'Technician', 'Inventory Officer'] },
      { kind: 'select', name: 'municipality', label: 'Assigned Municipality', options: MUNICIPALITIES },
    ],
  },
  'generate-report': {
    title: 'Generate Custom Report',
    submitText: 'Generate Report',
    successMsg: 'Report generated and ready for download.',
    fields: [
      { kind: 'select', name: 'type', label: 'Report Type', options: ['Executive Summary', 'Financial (Capex/Opex)', 'Technical Analysis'] },
      { kind: 'date', name: 'from', label: 'From Date' },
      { kind: 'date', name: 'to', label: 'To Date' },
    ],
  },
  'order-inventory': {
    title: 'Order Replenishment',
    submitText: 'Create PO',
    successMsg: 'Purchase order generated and sent.',
    fields: [
      { kind: 'select', name: 'vendor', label: 'Select Supplier', options: ['AquaSupplies Philippines Inc.', 'PipeMaster Manufacturing Co.', 'Marinduque General Hardware'] },
      { kind: 'number', name: 'qty', label: 'Order Quantity', value: '100' },
      { kind: 'select', name: 'urgency', label: 'Urgency', options: ['Standard', 'Expedited (Critical Low)'] },
    ],
  },
};
