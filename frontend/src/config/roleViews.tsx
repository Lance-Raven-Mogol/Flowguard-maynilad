/**
 * Role view configuration — the declarative heart of the dashboards. Each role
 * lists its sidebar entries and a `render` function for the active view,
 * composing the shared building blocks. This replaces the five near-duplicate
 * HTML files with one well-typed source of truth.
 */
import type { ReactNode } from 'react';
import type { DashboardData, Role } from '../models/types';
import type { ModalKey } from './modals';
import { MetricsGrid } from '../views/components/MetricsGrid';
import { DataTable } from '../views/components/DataTable';
import { DonutPanel, LineChart } from '../views/components/charts';
import {
  ActionButton,
  FaqAccordion,
  Field,
  InfoCardGrid,
  PanelHead,
  ScheduleTimeline,
  SettingsView,
  StatList,
} from '../views/components/panels';
import {
  AdvisoriesModule,
  AssetsModule,
  IncidentsModule,
  JobOrdersModule,
  MaterialRequestsModule,
  MaterialsModule,
  UsersPanel,
} from './modules';

export interface ViewContext {
  data: DashboardData;
  filter: string;
  openModal: (key: ModalKey) => void;
  notify: (msg: string) => void;
}

export interface ViewDef {
  id: string;
  label: string;
  icon: string;
  badge?: string;
  group: 'main' | 'support';
  render: (ctx: ViewContext) => ReactNode;
}

export interface RoleConfig {
  brand: { title: string; subtitle: string };
  menuTitle: string;
  supportTitle: string;
  searchPlaceholder: string;
  avatar: { name: string; color: string };
  views: ViewDef[];
}

/** A two-column analytics row used at the top of most overviews. */
function AnalyticsRow({ children }: { children: ReactNode }) {
  return <section className="analytics-grid">{children}</section>;
}

const settingsField = (label: string, value: string, ro = false) => (
  <Field key={label} label={label} value={value} readOnly={ro} />
);

export const ROLE_CONFIG: Record<Role, RoleConfig> = {
  // ---------------------------------------------------------------- CUSTOMER
  customer: {
    brand: { title: 'CUSTOMER', subtitle: 'Water Services Portal' },
    menuTitle: 'MAIN MENU',
    supportTitle: 'HELP & SUPPORT',
    searchPlaceholder: 'Search invoices or complaints',
    avatar: { name: 'Maria Santos', color: '5b6fd8' },
    views: [
      {
        id: 'overview', label: 'My Dashboard', icon: 'layout-dashboard', group: 'main',
        render: ({ data, filter }) => (
          <>
            <MetricsGrid metrics={data.metrics} />
            <AnalyticsRow>
              <article className="panel">
                <PanelHead title="Water Usage Trend" />
                <LineChart points={[3, 4, 3.5, 5, 6, 5.5]} months={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']} />
              </article>
              <article className="panel">
                <PanelHead title="Payment Summary" />
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottom: '1px solid #edf0f6' }}>
                    <span style={{ color: 'var(--muted)', fontSize: 14 }}>Current Bill (May 2026)</span>
                    <strong style={{ fontSize: 20, color: 'var(--blue)' }}>P 1,240.50</strong>
                  </div>
                  {[['Basic Charge', 'P 850.00'], ['Environmental Fee', 'P 120.50'], ['Maintenance Fee', 'P 50.00'], ['VAT (12%)', 'P 220.00']].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 12 }}>
                      <span style={{ color: 'var(--muted)' }}>{k}</span>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              </article>
            </AnalyticsRow>
            <div style={{ marginTop: 24 }}>
              <PanelHead title="Recent Activity" />
              <DataTable table={data.tables.activity} filter={filter} />
            </div>
            <InfoCardGrid
              cards={[
                { icon: 'droplets', tint: '#f0f7ff', color: 'var(--blue)', label: 'Avg Daily Usage', value: '0.5 m³', note: 'Based on last 30 days' },
                { icon: 'calendar-check', tint: '#f0fdf4', color: '#16a34a', label: 'Payment Due', value: 'May 10', note: '5 days remaining' },
                { icon: 'trending-down', tint: '#fff8f1', color: '#f59e0b', label: 'Savings', value: '-2%', note: 'vs last month' },
              ]}
            />
          </>
        ),
      },
      {
        id: 'complaints', label: 'Complaints', icon: 'message-square', group: 'main',
        render: ({ filter }) => <IncidentsModule filter={filter} mine />,
      },
      {
        id: 'advisories', label: 'Service Advisories', icon: 'megaphone', group: 'main',
        render: ({ filter }) => <AdvisoriesModule filter={filter} readOnly title="Service Advisories" />,
      },
      {
        id: 'bills', label: 'My Bills', icon: 'file-text', badge: '2', group: 'main',
        render: ({ data, filter, notify }) => (
          <>
            <PanelHead title="Billing History" action={<ActionButton label="Download All Invoices" icon="download-cloud" variant="secondary" onClick={() => notify('Preparing your invoices…')} />} />
            <DataTable table={data.tables.bills} filter={filter} actionLabel="Action" renderActions={() => <button className="btn-view" onClick={() => notify('Opening invoice…')}>View</button>} />
          </>
        ),
      },
      {
        id: 'usage', label: 'Water Usage', icon: 'activity', group: 'main',
        render: () => (
          <>
            <PanelHead title="Water Consumption Analytics" />
            <article className="panel sales-panel">
              <LineChart points={[3, 4, 3.5, 5, 6, 5.5]} months={['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']} />
              <div style={{ marginTop: 20, color: 'var(--muted)', fontSize: 14, padding: '0 4px' }}>
                Your water usage has decreased by 5% compared to the previous 6 months. Keep it up!
              </div>
            </article>
          </>
        ),
      },
      {
        id: 'help', label: 'Help Center', icon: 'circle-help', group: 'support',
        render: () => (
          <>
            <PanelHead title="Help & Support Center" />
            <FaqAccordion
              items={[
                { q: 'How do I pay my bill online?', a: "Go to 'My Bills', select an unpaid invoice and click 'Pay Now'. We support major credit cards and e-wallets." },
                { q: 'What should I do if I have a leak?', a: "Turn off your main water valve and file a 'New Complaint' under the Complaints section. A zone specialist will be notified." },
                { q: 'How is my water usage calculated?', a: 'Usage is your current meter reading minus the previous reading, reflected in cubic meters (m³).' },
              ]}
            />
          </>
        ),
      },
      {
        id: 'settings', label: 'Account Settings', icon: 'settings', group: 'support',
        render: () => (
          <>
            <PanelHead title="Account Settings" />
            <SettingsView
              tabs={[
                { id: 'profile', label: 'Profile Information', content: <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>{[settingsField('Full Name', 'Valued Customer'), settingsField('Email Address', 'customer@flowguard.ph'), settingsField('Phone Number', '+63 912 345 6789'), settingsField('Service Address', '123 Water St, Manila')]}</div> },
                { id: 'security', label: 'Password & Security', content: <div style={{ maxWidth: 400 }}>{[<Field key="c" label="Current Password" type="password" />, <Field key="n" label="New Password" type="password" />, <Field key="cf" label="Confirm New Password" type="password" />]}</div> },
              ]}
            />
          </>
        ),
      },
    ],
  },

  // -------------------------------------------------------- GENERAL MANAGER
  'general-manager': {
    brand: { title: 'MANAGER', subtitle: 'Operations & Coordination' },
    menuTitle: 'ADMIN MENU',
    supportTitle: 'SYSTEM',
    searchPlaceholder: 'Search operational data',
    avatar: { name: 'GM Reyes', color: '31415a' },
    views: [
      {
        id: 'overview', label: 'Overview', icon: 'layout-dashboard', group: 'main',
        render: ({ data, filter }) => (
          <>
            <MetricsGrid metrics={data.metrics} />
            <AnalyticsRow>
              <article className="panel invoice-panel">
                <PanelHead title="Island-wide Repair Statistics" />
                <DonutPanel value="24" label="Active" legend={[{ label: 'Critical (Main Line)', value: '4', dot: 'dark' }, { label: 'Moderate (Distribution)', value: '12', dot: 'blue' }, { label: 'Low (Service Connect)', value: '8', dot: 'pale' }]} />
              </article>
              <article className="panel sales-panel">
                <PanelHead title="Water Production vs Non-Revenue Water" />
                <LineChart points={[5, 8, 4, 6, 9, 7, 5, 8, 6, 7, 4]} months={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']} />
              </article>
            </AnalyticsRow>
            <div style={{ marginTop: 24 }}>
              <PanelHead title="Critical Alerts & Pending Actions" />
              <DataTable table={data.tables.alerts} filter={filter} />
            </div>
            <InfoCardGrid
              cards={[
                { icon: 'map-pin', tint: '#f0f7ff', color: 'var(--blue)', label: 'Total Municipalities', value: '6', note: 'Boac, Mogpog, Gasan, Buenavista, Torrijos, Santa Cruz' },
                { icon: 'droplets', tint: '#f0fdf4', color: '#16a34a', label: 'Water Production', value: '12,450 m³', note: 'Daily average across all zones' },
                { icon: 'alert-triangle', tint: '#fff8f1', color: '#f59e0b', label: 'NRW Rate', value: '18.5%', note: 'Non-Revenue Water - Target: <15%' },
              ]}
            />
          </>
        ),
      },
      {
        id: 'staff', label: 'User Management', icon: 'users', group: 'main',
        render: ({ filter }) => <UsersPanel filter={filter} />,
      },
      {
        id: 'incidents', label: 'Incidents', icon: 'message-square', group: 'main',
        render: ({ filter }) => <IncidentsModule filter={filter} title="Incident Oversight" />,
      },
      {
        id: 'inventory', label: 'Inventory Overview', icon: 'package', group: 'main',
        render: ({ filter }) => <MaterialsModule filter={filter} title="Central Inventory Overview" />,
      },
      {
        id: 'requests', label: 'Material Requests', icon: 'file-input', group: 'main',
        render: ({ filter }) => <MaterialRequestsModule filter={filter} />,
      },
      {
        id: 'assets', label: 'Asset Lifecycle', icon: 'box', group: 'main',
        render: ({ filter }) => <AssetsModule filter={filter} />,
      },
      {
        id: 'advisories', label: 'Service Advisories', icon: 'megaphone', group: 'main',
        render: ({ filter }) => <AdvisoriesModule filter={filter} />,
      },
      {
        id: 'settings', label: 'System Settings', icon: 'settings', group: 'support',
        render: () => (
          <>
            <PanelHead title="System Settings" />
            <SettingsView
              tabs={[
                { id: 'profile', label: 'Admin Profile', content: <>{[settingsField('Full Name', 'GM Reyes'), settingsField('Role Designation', 'General Manager', true), settingsField('Corporate Email', 'reyes.gm@flowguard.gov.ph')]}</> },
                { id: 'security', label: 'Security & Access', content: <>{[<Field key="c" label="Current Admin Password" type="password" />, <Field key="n" label="New Admin Password" type="password" />]}</> },
              ]}
            />
          </>
        ),
      },
    ],
  },

  // -------------------------------------------------------- INVENTORY OFFICER
  'inventory-officer': {
    brand: { title: 'INVENTORY', subtitle: 'Stock & Supply Chain' },
    menuTitle: 'STOCK MENU',
    supportTitle: 'HELP & SUPPORT',
    searchPlaceholder: 'Search item or MRF ID',
    avatar: { name: 'Ricardo Cruz', color: '16a34a' },
    views: [
      {
        id: 'overview', label: 'Stock Overview', icon: 'layout-dashboard', group: 'main',
        render: ({ data, filter }) => (
          <>
            <MetricsGrid metrics={data.metrics} />
            <AnalyticsRow>
              <article className="panel">
                <PanelHead title="Stock Level Overview" />
                <DonutPanel value="850k" label="Total Value" legend={[{ label: 'In Stock', value: 'P 650k', dot: 'dark' }, { label: 'Low Stock', value: 'P 150k', dot: 'blue' }, { label: 'Out of Stock', value: 'P 50k', dot: 'pale' }]} />
              </article>
              <StatList
                title="Weekly Activity"
                items={[
                  { icon: 'package-check', color: 'var(--blue)', label: 'Items Issued', value: '145' },
                  { icon: 'truck', color: '#16a34a', label: 'Items Received', value: '89' },
                  { icon: 'file-text', color: '#f59e0b', label: 'MRFs Processed', value: '23' },
                  { icon: 'shopping-cart', color: 'var(--pink)', label: 'Orders Placed', value: '7' },
                ]}
              />
            </AnalyticsRow>
            <div style={{ marginTop: 24 }}>
              <PanelHead title="Recent MRF Activity" />
              <DataTable table={data.tables.recentMrf} filter={filter} />
            </div>
            <InfoCardGrid
              cards={[
                { icon: 'box', tint: '#f0f7ff', color: 'var(--blue)', label: 'Total SKUs', value: '248', note: 'Unique items tracked' },
                { icon: 'alert-triangle', tint: '#fff8f1', color: '#f59e0b', label: 'Critical Items', value: '12', note: 'Require immediate order' },
                { icon: 'truck', tint: '#f0fdf4', color: '#16a34a', label: 'Incoming', value: '2', note: 'Shipments in transit' },
              ]}
            />
          </>
        ),
      },
      {
        id: 'materials', label: 'Material List', icon: 'box', group: 'main',
        render: ({ filter }) => <MaterialsModule filter={filter} />,
      },
      {
        id: 'mrf', label: 'MRF Requests', icon: 'file-input', group: 'main',
        render: ({ filter }) => <MaterialRequestsModule filter={filter} />,
      },
      {
        id: 'shipments', label: 'Incoming Shipments', icon: 'truck', group: 'main',
        render: ({ data, filter, notify }) => (
          <>
            <PanelHead title="Incoming Shipments" />
            <DataTable table={data.tables.shipments} filter={filter} actionLabel="Action" renderActions={() => <button className="btn-action" onClick={() => notify('Shipment status updated.')}>Track</button>} />
          </>
        ),
      },
      {
        id: 'audit', label: 'Audit Logs', icon: 'history', group: 'main',
        render: ({ data, filter, notify }) => (
          <>
            <PanelHead title="Inventory Audit Logs" action={<ActionButton label="Export PDF" icon="download" variant="secondary" onClick={() => notify('Audit log exported.')} />} />
            <DataTable table={data.tables.audit} filter={filter} />
          </>
        ),
      },
      {
        id: 'settings', label: 'Settings', icon: 'settings', group: 'support',
        render: () => (
          <>
            <PanelHead title="Account & System Settings" />
            <SettingsView
              tabs={[
                { id: 'profile', label: 'Profile Information', content: <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>{[settingsField('Full Name', 'Ricardo Cruz'), settingsField('Email Address', 'r.cruz@flowguard.ph'), settingsField('Employee ID', 'EMP-2024-0082', true), settingsField('Phone Number', '+63 912 345 6789')]}</div> },
                { id: 'security', label: 'Security & Privacy', content: <>{[<Field key="c" label="Current Password" type="password" />, <Field key="n" label="New Password" type="password" />]}</> },
              ]}
            />
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------- TECHNICAL TEAM
  'technical-team': {
    brand: { title: 'TECHNICAL', subtitle: 'Field Operations' },
    menuTitle: 'WORK MENU',
    supportTitle: 'HELP & SUPPORT',
    searchPlaceholder: 'Search job order ID',
    avatar: { name: 'Tech Santiago', color: 'f59e0b' },
    views: [
      {
        id: 'overview', label: 'My Tasks', icon: 'layout-dashboard', group: 'main',
        render: ({ data, filter }) => (
          <>
            <MetricsGrid metrics={data.metrics} />
            <AnalyticsRow>
              <ScheduleTimeline
                entries={[
                  { time: '08:30 AM', title: 'Tool Check & Briefing', detail: 'Main Office - Team Hall', color: 'var(--blue)' },
                  { time: '10:00 AM', title: 'Repair Job #JO-552', detail: 'Block 5 Lot 2, Phase 1', color: 'var(--pink)' },
                  { time: '02:00 PM', title: 'Inspection Job #JO-555', detail: 'Street 12, West Side Area', color: 'var(--cyan)' },
                ]}
              />
              <StatList
                title="Performance This Month"
                items={[
                  { icon: 'wrench', color: 'var(--blue)', label: 'Main Line Repairs', value: '12' },
                  { icon: 'gauge', color: '#16a34a', label: 'Meter Installations', value: '8' },
                  { icon: 'plug', color: '#f59e0b', label: 'Service Connections', value: '5' },
                  { icon: 'search', color: 'var(--pink)', label: 'Inspections', value: '3' },
                ]}
              />
            </AnalyticsRow>
            <div style={{ marginTop: 24 }}>
              <PanelHead title="Today's High Priority Tasks" />
              <DataTable table={data.tables.priorityTasks} filter={filter} />
            </div>
            <InfoCardGrid
              cards={[
                { icon: 'clock', tint: '#f0f7ff', color: 'var(--blue)', label: 'Hours Logged', value: '156', note: 'This month' },
                { icon: 'wrench', tint: '#f0fdf4', color: '#16a34a', label: 'Tools Checked Out', value: '5', note: 'Currently in use' },
                { icon: 'star', tint: '#fff8f1', color: '#f59e0b', label: 'Rating', value: '4.8/5', note: 'Customer feedback' },
              ]}
            />
          </>
        ),
      },
      {
        id: 'joborders', label: 'Job Orders', icon: 'clipboard-list', group: 'main',
        render: ({ filter }) => <JobOrdersModule filter={filter} />,
      },
      {
        id: 'materials', label: 'Material Requests', icon: 'hammer', group: 'main',
        render: ({ filter }) => <MaterialRequestsModule filter={filter} title="My Material Requests (MRF)" />,
      },
      {
        id: 'assets', label: 'Asset Registry', icon: 'box', group: 'main',
        render: ({ filter }) => <AssetsModule filter={filter} title="Asset Registry & Health" />,
      },
      {
        id: 'advisories', label: 'Advisories', icon: 'megaphone', group: 'main',
        render: ({ filter }) => <AdvisoriesModule filter={filter} />,
      },
      {
        id: 'schedule', label: 'My Schedule', icon: 'calendar-check', group: 'main',
        render: () => (
          <>
            <PanelHead title="My Work Schedule" />
            <ScheduleTimeline
              entries={[
                { time: '08:30 AM', title: 'Tool Check & Briefing', detail: 'Main Office - Team Hall', color: 'var(--blue)' },
                { time: '10:00 AM', title: 'Repair Job #JO-552', detail: 'Block 5 Lot 2, Phase 1', color: 'var(--pink)' },
                { time: '02:00 PM', title: 'Inspection Job #JO-555', detail: 'Street 12, West Side Area', color: 'var(--cyan)' },
              ]}
            />
          </>
        ),
      },
      {
        id: 'support', label: 'Field Support', icon: 'help-circle', group: 'support',
        render: () => (
          <>
            <PanelHead title="Technical Field Support" />
            <FaqAccordion
              items={[
                { q: 'How do I report damaged tools?', a: 'Log it under "Material Requests" and select "Tool Replacement". Surrender the damaged tool to the Inventory Officer before receiving a new one.' },
                { q: 'What if a job takes longer than scheduled?', a: 'Use "Update Progress" on your job order and select "Delayed/Paused" with a brief reason so dispatch can adjust timelines.' },
                { q: 'Safety Protocol for Main Line Repairs', a: 'Cordon off the area. Do not excavate until the zone specialist confirms water flow is isolated at the nearest main valve.' },
              ]}
            />
          </>
        ),
      },
      {
        id: 'settings', label: 'Settings', icon: 'settings', group: 'support',
        render: () => (
          <>
            <PanelHead title="Account Settings" />
            <SettingsView
              tabs={[
                { id: 'profile', label: 'Profile', content: <>{[settingsField('Full Name', 'Tech Santiago'), settingsField('Specialization', 'Main Line Repair & Welding', true), settingsField('Contact Number', '+63 912 345 6789')]}</> },
                { id: 'security', label: 'Security', content: <>{[<Field key="c" label="Current Password" type="password" />, <Field key="n" label="New Password" type="password" />]}</> },
              ]}
            />
          </>
        ),
      },
    ],
  },

  // --------------------------------------------------------- ZONE SPECIALIST
  'zone-specialist': {
    brand: { title: 'SPECIALIST', subtitle: 'Zone Investigations' },
    menuTitle: 'MAIN MENU',
    supportTitle: 'HELP & SUPPORT',
    searchPlaceholder: 'Search zone or case ID',
    avatar: { name: 'Spec Ramos', color: 'c85b70' },
    views: [
      {
        id: 'overview', label: 'Overview', icon: 'layout-dashboard', group: 'main',
        render: ({ data, filter, openModal }) => (
          <>
            <MetricsGrid metrics={data.metrics} />
            <AnalyticsRow>
              <article className="panel">
                <PanelHead title="Case Distribution" />
                <DonutPanel value="5" label="Active" legend={[{ label: 'Critical', value: '2', dot: 'dark' }, { label: 'Urgent', value: '2', dot: 'blue' }, { label: 'Normal', value: '1', dot: 'pale' }]} />
              </article>
              <StatList
                title="Monthly Performance"
                items={[
                  { icon: 'search', color: 'var(--blue)', label: 'Investigations', value: '28' },
                  { icon: 'file-text', color: '#16a34a', label: 'Reports Filed', value: '12' },
                  { icon: 'check-circle', color: '#f59e0b', label: 'Cases Resolved', value: '23' },
                  { icon: 'clock', color: 'var(--pink)', label: 'Avg Response', value: '4.2h' },
                ]}
              />
            </AnalyticsRow>
            <div style={{ marginTop: 24 }}>
              <PanelHead title="High Priority Cases" action={<ActionButton label="New Inspection" icon="plus" onClick={() => openModal('start-inspection')} />} />
              <DataTable table={data.tables.priorityCases} filter={filter} />
            </div>
            <InfoCardGrid
              cards={[
                { icon: 'map-pin', tint: '#f0f7ff', color: 'var(--blue)', label: 'Zone Coverage', value: '100%', note: 'All areas monitored' },
                { icon: 'star', tint: '#f0fdf4', color: '#16a34a', label: 'Rating', value: '4.9/5', note: 'Customer satisfaction' },
                { icon: 'calendar', tint: '#fff8f1', color: '#f59e0b', label: 'Inspections', value: '3', note: 'Scheduled today' },
              ]}
            />
          </>
        ),
      },
      {
        id: 'investigations', label: 'Investigations', icon: 'search', group: 'main',
        render: ({ filter }) => <IncidentsModule filter={filter} title="Zone Investigations" />,
      },
      {
        id: 'assets', label: 'Asset Inspections', icon: 'box', group: 'main',
        render: ({ filter }) => <AssetsModule filter={filter} title="Asset Inspections & Health" />,
      },
      {
        id: 'schedule', label: 'My Schedule', icon: 'calendar', group: 'main',
        render: () => (
          <>
            <PanelHead title="Investigation Schedule" />
            <ScheduleTimeline
              entries={[
                { time: '09:00 AM', title: 'Site Inspection', detail: 'Location: Block 5 Lot 2, Phase 1', color: 'var(--pink)' },
                { time: '01:30 PM', title: 'Meeting with Technical Lead', detail: 'Topic: Pipe replacement requirements', color: 'var(--blue)' },
                { time: '03:30 PM', title: 'Report Documentation', detail: 'Office work: Finalize reports for Boac', color: 'var(--cyan)' },
              ]}
            />
          </>
        ),
      },
      {
        id: 'guidelines', label: 'Zone Guidelines', icon: 'book-open', group: 'support',
        render: () => (
          <>
            <PanelHead title="Zone Investigation Guidelines" />
            <FaqAccordion
              items={[
                { q: 'Standard Safety Protocol for Site Inspection', a: 'Always wear high-visibility vests and protective gear. Coordinate with the local barangay office before entering private properties.' },
                { q: 'Reporting Illegal Connections', a: 'Document with at least 3 photos from different angles. Do not confront the resident; file via the "Illegal Usage" category.' },
                { q: 'Handling Major Main Pipe Bursts', a: 'Request valve isolation from the Technical Team. Mark the area with safety cones and set status to "Critical".' },
              ]}
            />
          </>
        ),
      },
      {
        id: 'settings', label: 'Settings', icon: 'settings', group: 'support',
        render: () => (
          <>
            <PanelHead title="Account Settings" />
            <SettingsView
              tabs={[
                { id: 'profile', label: 'Profile', content: <>{[settingsField('Full Name', 'Specialist Ramos'), settingsField('Assigned Municipality', 'Boac', true), settingsField('Email Address', 'ramos.spec@flowguard.gov.ph')]}</> },
                { id: 'security', label: 'Security', content: <>{[<Field key="c" label="Current Password" type="password" />, <Field key="n" label="New Password" type="password" />]}</> },
              ]}
            />
          </>
        ),
      },
    ],
  },
};
