/**
 * Role view configuration — the declarative heart of the dashboards. Each role
 * lists its sidebar entries and a `render` function for the active view. Live
 * operational data comes from <LiveModule> wrappers (see `modules.tsx`); the
 * overview and settings are fully data-driven components.
 */
import type { ReactNode } from 'react';
import type { Role } from '../models/types';
import { FaqAccordion, PanelHead } from '../views/components/panels';
import { DashboardOverview } from '../views/dashboard/DashboardOverview';
import { AccountSettings } from '../views/dashboard/AccountSettings';
import {
  AdvisoriesModule,
  AssetsModule,
  AuditLogsModule,
  BillingModule,
  IncidentsModule,
  JobOrdersModule,
  MaterialsModule,
  PaymentOptionsModule,
  RequestsModule,
  SuppliersModule,
  UsersPanel,
} from './modules';

export interface ViewContext {
  filter: string;
  navigate: (viewId: string) => void;
}

export interface ViewDef {
  id: string;
  label: string;
  icon: string;
  badge?: string;
  /** 'hidden' views are reachable by navigate() but not shown in the sidebar. */
  group: 'main' | 'support' | 'hidden';
  render: (ctx: ViewContext) => ReactNode;
}

export interface RoleConfig {
  brand: { title: string; subtitle: string };
  menuTitle: string;
  supportTitle: string;
  searchPlaceholder: string;
  views: ViewDef[];
}

const overview = (label: string): ViewDef => ({
  id: 'overview',
  label,
  icon: 'layout-dashboard',
  group: 'main',
  render: () => <DashboardOverview />,
});

const settings = (label = 'Account Settings'): ViewDef => ({
  id: 'settings',
  label,
  icon: 'settings',
  group: 'support',
  render: () => <AccountSettings />,
});

const faqView = (id: string, label: string, icon: string, title: string, items: { q: string; a: string }[]): ViewDef => ({
  id,
  label,
  icon,
  group: 'support',
  render: () => (
    <>
      <PanelHead title={title} />
      <FaqAccordion items={items} />
    </>
  ),
});

/** Hidden view for the Payment Options page — navigated to via button in Billing. */
const paymentOptionsView: ViewDef = {
  id: 'payment-options',
  label: 'Payment Options',
  icon: 'wallet',
  group: 'hidden',
  render: () => <PaymentOptionsModule />,
};

export const ROLE_CONFIG: Record<Role, RoleConfig> = {
  // ---------------------------------------------------------------- CUSTOMER
  customer: {
    brand: { title: 'CUSTOMER', subtitle: 'Water Services Portal' },
    menuTitle: 'MAIN MENU',
    supportTitle: 'HELP & SUPPORT',
    searchPlaceholder: 'Search complaints or advisories',
    views: [
      overview('My Dashboard'),
      {
        id: 'complaints', label: 'Complaints', icon: 'message-square', group: 'main',
        render: ({ filter }) => <IncidentsModule filter={filter} mine />,
      },
      {
        id: 'billing', label: 'My Billing', icon: 'credit-card', group: 'main',
        render: ({ filter }) => <BillingModule filter={filter} />,
      },
      {
        id: 'requests', label: 'Requests', icon: 'package', group: 'main',
        render: ({ filter }) => <RequestsModule filter={filter} title="My Requests" />,
      },
      {
        id: 'advisories', label: 'Service Advisories', icon: 'megaphone', group: 'main',
        render: ({ filter }) => <AdvisoriesModule filter={filter} readOnly title="Service Advisories" />,
      },
      faqView('help', 'Help Center', 'circle-help', 'Help & Support Center', [
        { q: 'How do I file a complaint?', a: "Go to 'Complaints' and click 'File Complaint'. Describe the concern, set the location and urgency, then submit. A zone specialist will be notified to verify it." },
        { q: 'How do I track my complaint?', a: "Open 'Complaints' — each row shows a live status: Under Verification, In Progress, Scheduled, or Resolved." },
        { q: 'Where do I see service interruptions?', a: "Check 'Service Advisories' for published maintenance, interruption, and emergency notices for your area." },
      ]),
      settings(),
    ],
  },

  // -------------------------------------------------------- GENERAL MANAGER
  'general-manager': {
    brand: { title: 'MANAGER', subtitle: 'Operations & Coordination' },
    menuTitle: 'ADMIN MENU',
    supportTitle: 'SYSTEM',
    searchPlaceholder: 'Search operational data',
    views: [
      overview('Overview'),
      {
        id: 'staff', label: 'User Management', icon: 'users', group: 'main',
        render: ({ filter }) => <UsersPanel filter={filter} />,
      },
      {
        id: 'incidents', label: 'Incidents', icon: 'message-square', group: 'main',
        render: ({ filter }) => <IncidentsModule filter={filter} title="Incident Oversight" />,
      },
      {
        id: 'joborders', label: 'Job Orders', icon: 'clipboard-list', group: 'main',
        render: ({ filter }) => <JobOrdersModule filter={filter} title="Job Order Management" />,
      },
      {
        id: 'inventory', label: 'Inventory', icon: 'package', group: 'main',
        render: ({ filter }) => <MaterialsModule filter={filter} title="Central Inventory Overview" />,
      },
      {
        id: 'requests', label: 'Requests', icon: 'file-input', group: 'main',
        render: ({ filter }) => <RequestsModule filter={filter} title="All Requests" />,
      },
      {
        id: 'suppliers', label: 'Suppliers', icon: 'truck', group: 'main',
        render: ({ filter }) => <SuppliersModule filter={filter} />,
      },
      {
        id: 'payments', label: 'Billing', icon: 'credit-card', group: 'main',
        render: ({ filter, navigate }) => <BillingModule filter={filter} navigate={navigate} />,
      },
      paymentOptionsView,
      {
        id: 'assets', label: 'Asset Lifecycle', icon: 'box', group: 'main',
        render: ({ filter }) => <AssetsModule filter={filter} />,
      },
      {
        id: 'advisories', label: 'Service Advisories', icon: 'megaphone', group: 'main',
        render: ({ filter }) => <AdvisoriesModule filter={filter} />,
      },
      {
        id: 'audit', label: 'Audit Log', icon: 'scroll', group: 'support',
        render: ({ filter }) => <AuditLogsModule filter={filter} />,
      },
      settings('System Settings'),
    ],
  },

  // -------------------------------------------------------- INVENTORY OFFICER
  'inventory-officer': {
    brand: { title: 'INVENTORY', subtitle: 'Stock & Supply Chain' },
    menuTitle: 'STOCK MENU',
    supportTitle: 'HELP & SUPPORT',
    searchPlaceholder: 'Search item or MRF ID',
    views: [
      overview('Stock Overview'),
      {
        id: 'materials', label: 'Material List', icon: 'box', group: 'main',
        render: ({ filter }) => <MaterialsModule filter={filter} />,
      },
      {
        id: 'mrf', label: 'Requests', icon: 'file-input', group: 'main',
        render: ({ filter }) => <RequestsModule filter={filter} title="Requests" />,
      },
      {
        id: 'suppliers', label: 'Suppliers', icon: 'truck', group: 'main',
        render: ({ filter }) => <SuppliersModule filter={filter} />,
      },
      faqView('help', 'Help', 'circle-help', 'Inventory Help', [
        { q: 'How do I add a new material?', a: "In 'Material List' click 'Add New Item'. A SKU is generated automatically. Set the quantity, minimum level, supplier and source." },
        { q: 'How are low-stock items flagged?', a: 'Set a material status to Low Stock (or it can be marked when quantity nears the minimum). The overview and notifications surface them automatically.' },
        { q: 'How do I process a material request?', a: "In 'MRF Requests', use the status dropdown to move a request from Ongoing → Approved → Released, or Reject it." },
      ]),
      settings(),
    ],
  },

  // ---------------------------------------------------------- TECHNICAL TEAM
  'technical-team': {
    brand: { title: 'TECHNICAL', subtitle: 'Field Operations' },
    menuTitle: 'WORK MENU',
    supportTitle: 'HELP & SUPPORT',
    searchPlaceholder: 'Search job order ID',
    views: [
      overview('My Tasks'),
      {
        id: 'joborders', label: 'Job Orders', icon: 'clipboard-list', group: 'main',
        render: ({ filter }) => <JobOrdersModule filter={filter} title="In Progress Job Orders" />,
      },
      {
        id: 'materials', label: 'Requests', icon: 'hammer', group: 'main',
        render: ({ filter }) => <RequestsModule filter={filter} title="My Requests" />,
      },
      {
        id: 'advisories', label: 'Advisories', icon: 'megaphone', group: 'main',
        render: ({ filter }) => <AdvisoriesModule filter={filter} />,
      },
      faqView('support', 'Field Support', 'help-circle', 'Technical Field Support', [
        { q: 'How do I update a job order?', a: "In 'Job Orders' use the status dropdown to move a job from Ongoing → In Progress → Completed, or edit its details." },
        { q: 'How do I request materials?', a: "In 'Material Requests' click 'New Request', enter the material and quantity, and optionally link a job order ref." },
        { q: 'Safety protocol for main line repairs', a: 'Cordon off the area and confirm with the zone specialist that water flow is isolated at the nearest main valve before excavation.' },
      ]),
      settings(),
    ],
  },

  // --------------------------------------------------------- ZONE SPECIALIST
  'zone-specialist': {
    brand: { title: 'SPECIALIST', subtitle: 'Zone Investigations' },
    menuTitle: 'MAIN MENU',
    supportTitle: 'HELP & SUPPORT',
    searchPlaceholder: 'Search zone or case ID',
    views: [
      overview('Overview'),
      {
        id: 'investigations', label: 'Investigations', icon: 'search', group: 'main',
        render: ({ filter }) => <IncidentsModule filter={filter} title="Zone Investigations" />,
      },
      {
        id: 'assets', label: 'Asset Inspections', icon: 'box', group: 'main',
        render: ({ filter }) => <AssetsModule filter={filter} title="Asset Inspections & Health" />,
      },
      faqView('guidelines', 'Zone Guidelines', 'book-open', 'Zone Investigation Guidelines', [
        { q: 'Standard safety protocol for site inspection', a: 'Wear high-visibility vests and protective gear. Coordinate with the barangay office before entering private property.' },
        { q: 'How do I verify an incident?', a: "Open 'Investigations', review the reported concern, and use the status dropdown to set it In Progress, Scheduled, or Resolved after inspection." },
        { q: 'Recording asset condition', a: "In 'Asset Inspections', update an asset's condition (Good / Needs Maintenance / Needs Replacement / Dispose). The health score recalculates automatically." },
      ]),
      settings(),
    ],
  },

  // --------------------------------------------------------------- CONTRACTOR
  contractor: {
    brand: { title: 'CONTRACTOR', subtitle: 'Assigned Field Work' },
    menuTitle: 'WORK MENU',
    supportTitle: 'HELP & SUPPORT',
    searchPlaceholder: 'Search job order or asset',
    views: [
      overview('My Assignments'),
      {
        id: 'joborders', label: 'Job Orders', icon: 'clipboard-list', group: 'main',
        render: ({ filter }) => <JobOrdersModule filter={filter} title="Assigned Job Orders" />,
      },
      {
        id: 'requests', label: 'Material Requests', icon: 'hammer', group: 'main',
        render: ({ filter }) => <RequestsModule filter={filter} title="My Material Requests" />,
      },
      {
        id: 'assets', label: 'Asset Registry', icon: 'box', group: 'main',
        render: ({ filter }) => <AssetsModule filter={filter} title="Asset Registry" />,
      },
      faqView('support', 'Field Support', 'help-circle', 'Contractor Field Support', [
        { q: 'How do I update a job order?', a: "In 'Job Orders', use the status dropdown to move a job from Pending → In Progress → Completed. You can also add notes or update the assigned team details." },
        { q: 'How do I request materials?', a: "In 'Material Requests', click 'New Request'. Select the material from inventory or type a custom item, enter the quantity, and optionally link it to a job order reference." },
        { q: 'How do I register an installed asset?', a: "In 'Asset Registry', click 'Register Asset'. Enter the asset name, type, location, and the installation date. The system will begin tracking its health score from that date." },
        { q: 'What is the Asset Health Score?', a: "The health score (0–100) is automatically calculated based on the asset's age relative to its expected lifespan and its reported condition. It updates every time the asset record is viewed." },
      ]),
      settings(),
    ],
  },

  // ------------------------------------------------------------- INHOUSE TEAM
  'inhouse-team': {
    brand: { title: 'IN-HOUSE', subtitle: 'Assigned Field Work' },
    menuTitle: 'WORK MENU',
    supportTitle: 'HELP & SUPPORT',
    searchPlaceholder: 'Search job order or asset',
    views: [
      overview('My Assignments'),
      {
        id: 'joborders', label: 'Job Orders', icon: 'clipboard-list', group: 'main',
        render: ({ filter }) => <JobOrdersModule filter={filter} title="Assigned Job Orders" />,
      },
      {
        id: 'requests', label: 'Material Requests', icon: 'hammer', group: 'main',
        render: ({ filter }) => <RequestsModule filter={filter} title="My Material Requests" />,
      },
      {
        id: 'assets', label: 'Asset Registry', icon: 'box', group: 'main',
        render: ({ filter }) => <AssetsModule filter={filter} title="Asset Registry" />,
      },
      faqView('support', 'Field Support', 'help-circle', 'In-house Team Field Support', [
        { q: 'How do I update a job order?', a: "In 'Job Orders', use the status dropdown to move a job from Pending → In Progress → Completed. You can also add notes or update the assigned team details." },
        { q: 'How do I request materials?', a: "In 'Material Requests', click 'New Request'. Select the material from inventory or type a custom item, enter the quantity, and optionally link it to a job order reference." },
        { q: 'How do I register an installed asset?', a: "In 'Asset Registry', click 'Register Asset'. Enter the asset name, type, location, and the installation date. The system will begin tracking its health score from that date." },
        { q: 'What is the Asset Health Score?', a: "The health score (0–100) is automatically calculated based on the asset's age relative to its expected lifespan and its reported condition. It updates every time the asset record is viewed." },
      ]),
      settings(),
    ],
  },

  // ------------------------------------------------------- COMMERCIAL DEPARTMENT
  'commercial-department': {
    brand: { title: 'COMMERCIAL', subtitle: 'Customer & Service Operations' },
    menuTitle: 'MAIN MENU',
    supportTitle: 'HELP & SUPPORT',
    searchPlaceholder: 'Search incidents or job orders',
    views: [
      overview('Overview'),
      {
        id: 'incidents', label: 'Incidents', icon: 'message-square', group: 'main',
        render: ({ filter }) => <IncidentsModule filter={filter} title="Customer Complaints & Incidents" />,
      },
      {
        id: 'joborders', label: 'Job Orders', icon: 'clipboard-list', group: 'main',
        render: ({ filter }) => <JobOrdersModule filter={filter} title="Job Order Management" />,
      },
      {
        id: 'billing', label: 'Billing', icon: 'credit-card', group: 'main',
        render: ({ filter, navigate }) => <BillingModule filter={filter} navigate={navigate} />,
      },
      paymentOptionsView,
      {
        id: 'advisories', label: 'Service Advisories', icon: 'megaphone', group: 'main',
        render: ({ filter }) => <AdvisoriesModule filter={filter} readOnly title="Service Advisories" />,
      },
      faqView('support', 'Help & Support', 'circle-help', 'Commercial Department Support', [
        { q: 'How do I view customer complaints?', a: "Open 'Incidents' to see all reported complaints. You can filter by status, urgency, or type to prioritize follow-up." },
        { q: 'How do I create a job order?', a: "In 'Job Orders', click 'New Job Order'. Fill in the title, scope, assign a team, set a schedule date, and optionally link it to an incident reference." },
        { q: 'How do I track a job order status?', a: "In 'Job Orders', each row shows its current status: Pending, In Progress, Completed, or Cancelled. Use the status dropdown to update it." },
      ]),
      settings(),
    ],
  },
};
