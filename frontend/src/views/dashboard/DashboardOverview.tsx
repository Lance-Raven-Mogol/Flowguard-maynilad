/**
 * DashboardOverview — the per-role landing view, computed entirely from live
 * data (no hardcoded numbers). Replaces the old illustrative metrics/charts.
 */
import { useEffect } from 'react';
import { useAuth } from '../../controllers/AuthContext';
import { useStats, type DashboardStats } from '../../controllers/StatsContext';
import type { BadgeTone, Metric, ResourceTable, StatusTone, TableCell } from '../../models/types';
import { MetricsGrid } from '../components/MetricsGrid';
import { DataTable } from '../components/DataTable';
import { DonutPanel } from '../components/charts';
import { InfoCardGrid, PanelHead, StatList } from '../components/panels';
import type { EntityRow } from '../../services/resourceService';

/* helpers */
const GREEN = new Set(['resolved', 'completed', 'released', 'published', 'approved', 'in_stock', 'good']);
const RED = new Set(['rejected', 'cancelled', 'needs_replacement', 'dispose', 'defective', 'critical']);
const tone = (v: unknown): StatusTone => {
  const k = String(v ?? '').toLowerCase();
  return GREEN.has(k) ? 'paid' : RED.has(k) ? 'overdue' : 'pending';
};
const title = (v: unknown) => String(v ?? '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const n = (rows: EntityRow[], p: (r: EntityRow) => boolean) => rows.filter(p).length;
const money = (v: number) => '₱ ' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const metric = (id: string, label: string, value: string | number, icon: string, accent: Metric['accent'], hint?: string): Metric => ({
  id, label, value: String(value), icon, accent, hint,
});
const sCell = (v: unknown): TableCell => ({ text: title(v), status: tone(v) });
const bCell = (text: string, t: BadgeTone): TableCell => ({ text, badge: t });

function recent(columns: string[], rows: TableCell[][]): ResourceTable {
  return { id: 'recent', columns, rows: rows.map((cells, i) => ({ id: String(i), cells })) };
}

export function DashboardOverview() {
  const { user } = useAuth();
  const { stats, loading, reload } = useStats();

  // Refresh the snapshot whenever the overview is opened.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && stats.incidents.length === 0 && stats.materials.length === 0) {
    return <p style={{ color: 'var(--muted)', padding: '8px 2px' }}>Loading live data…</p>;
  }

  switch (user!.role) {
    case 'customer':
      return <CustomerOverview stats={stats} fullName={user!.fullName} />;
    case 'general-manager':
      return <ManagerOverview stats={stats} />;
    case 'inventory-officer':
      return <InventoryOverview stats={stats} />;
    case 'technical-team':
      return <TechnicalOverview stats={stats} />;
    case 'zone-specialist':
      return <ZoneOverview stats={stats} />;
    default:
      return null;
  }
}

/* ----------------------------------------------------------------- Customer */
function CustomerOverview({ stats, fullName }: { stats: DashboardStats; fullName: string }) {
  const mine = stats.incidents.filter((i) => String(i.reported_by).toLowerCase() === fullName.toLowerCase());
  const published = stats.advisories.filter((a) => a.status === 'published');
  return (
    <>
      <MetricsGrid
        metrics={[
          metric('c1', 'Open Complaints', n(mine, (i) => i.status !== 'resolved'), 'message-square', 'customers'),
          metric('c2', 'Resolved', n(mine, (i) => i.status === 'resolved'), 'check-circle', 'revenue'),
          metric('c3', 'Total Filed', mine.length, 'file-text', 'profit'),
          metric('c4', 'Service Advisories', published.length, 'megaphone', 'invoices'),
        ]}
      />
      <section className="analytics-grid" style={{ marginTop: 22 }}>
        <article className="panel">
          <PanelHead title="My Complaint Status" />
          <DonutPanel
            value={String(mine.length)}
            label="Total"
            legend={[
              { label: 'Awaiting Verification', value: String(n(mine, (i) => i.status === 'under_verification')), dot: 'dark' },
              { label: 'In Progress / Scheduled', value: String(n(mine, (i) => i.status === 'in_progress' || i.status === 'scheduled')), dot: 'blue' },
              { label: 'Resolved', value: String(n(mine, (i) => i.status === 'resolved')), dot: 'pale' },
            ]}
          />
        </article>
        <article className="panel">
          <PanelHead title="Latest Service Advisories" />
          <DataTable
            table={recent(
              ['Title', 'Area', 'Type'],
              published.slice(0, 5).map((a) => [{ text: String(a.title), strong: true }, { text: String(a.area ?? '—') }, bCell(title(a.type), a.type === 'emergency' ? 'high' : a.type === 'interruption' ? 'medium' : 'low')]),
            )}
          />
        </article>
      </section>
      <div style={{ marginTop: 22 }}>
        <PanelHead title="My Recent Complaints" />
        <DataTable
          table={recent(
            ['Ref', 'Description', 'Urgency', 'Status'],
            mine.slice(0, 6).map((i) => [{ text: String(i.ref_code), strong: true }, { text: String(i.description ?? '') }, bCell(title(i.urgency), String(i.urgency) as BadgeTone), sCell(i.status)]),
          )}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Manager */
function ManagerOverview({ stats }: { stats: DashboardStats }) {
  const inv = stats.materials.reduce((s, m) => s + Number(m.quantity || 0) * Number(m.unit_price || 0), 0);
  const pendingJobs = stats.jobOrders.filter((j) => j.status === 'pending');
  const ongoingJobs = stats.jobOrders.filter((j) => j.status === 'in_progress');
  const pendingIncidents = stats.incidents.filter((i) => i.status === 'under_verification');
  const ongoingIncidents = stats.incidents.filter((i) => i.status === 'in_progress');

  return (
    <>
      <MetricsGrid
        metrics={[
          metric('g1', 'Pending Incidents', pendingIncidents.length, 'clock', 'customers'),
          metric('g2', 'Ongoing Job Orders', ongoingJobs.length, 'wrench', 'revenue'),
          metric('g3', 'Low Stock Items', n(stats.materials, (m) => m.status === 'low_stock'), 'alert-triangle', 'profit'),
          metric('g4', 'Pending Payments', n(stats.payments, (p) => p.status === 'pending' || p.status === 'overdue'), 'credit-card', 'invoices'),
        ]}
      />
      <section className="analytics-grid" style={{ marginTop: 22 }}>
        <article className="panel">
          <PanelHead title="Incident Status" />
          <DonutPanel
            value={String(stats.incidents.length)}
            label="Incidents"
            legend={[
              { label: 'Pending Verification', value: String(pendingIncidents.length), dot: 'dark' },
              { label: 'Ongoing', value: String(ongoingIncidents.length), dot: 'blue' },
              { label: 'Resolved', value: String(n(stats.incidents, (i) => i.status === 'resolved')), dot: 'pale' },
            ]}
          />
        </article>
        <StatList
          title="Operations Snapshot"
          items={[
            { icon: 'clipboard-list', color: 'var(--blue)', label: 'Pending Job Orders', value: String(pendingJobs.length) },
            { icon: 'wrench', color: '#16a34a', label: 'Ongoing Job Orders', value: String(ongoingJobs.length) },
            { icon: 'file-input', color: '#f59e0b', label: 'Pending MRFs', value: String(n(stats.materialRequests, (r) => r.status === 'pending')) },
            { icon: 'shopping-cart', color: 'var(--pink)', label: 'Pending Purchases', value: String(n(stats.purchaseRequests, (r) => r.status === 'pending')) },
          ]}
        />
      </section>
      <div style={{ marginTop: 22 }}>
        <PanelHead title="Pending & Ongoing" />
        <DataTable
          table={recent(
            ['Ref', 'Type', 'Title/Location', 'Status'],
            [
              ...pendingIncidents.slice(0, 3).map((i) => [{ text: String(i.ref_code), strong: true }, { text: 'Incident' }, { text: String(i.location ?? i.description ?? '—') }, sCell(i.status)]),
              ...ongoingIncidents.slice(0, 3).map((i) => [{ text: String(i.ref_code), strong: true }, { text: 'Incident' }, { text: String(i.location ?? i.description ?? '—') }, sCell(i.status)]),
              ...pendingJobs.slice(0, 3).map((j) => [{ text: String(j.ref_code), strong: true }, { text: 'Job Order' }, { text: String(j.title ?? '—') }, sCell(j.status)]),
              ...ongoingJobs.slice(0, 3).map((j) => [{ text: String(j.ref_code), strong: true }, { text: 'Job Order' }, { text: String(j.title ?? '—') }, sCell(j.status)]),
            ].slice(0, 8),
          )}
        />
      </div>
      <InfoCardGrid
        cards={[
          { icon: 'box', tint: '#f0f7ff', color: 'var(--blue)', label: 'Inventory Value', value: money(inv), note: `${stats.materials.length} SKUs tracked` },
          { icon: 'users', tint: '#f0fdf4', color: '#16a34a', label: 'Completed', value: String(n(stats.jobOrders, (j) => j.status === 'completed')), note: 'All time' },
          { icon: 'credit-card', tint: '#fff8f1', color: '#f59e0b', label: 'Late Payments', value: String(n(stats.payments, (p) => p.status === 'late' || p.status === 'overdue')), note: 'Needs attention' },
        ]}
      />
    </>
  );
}

/* ---------------------------------------------------------------- Inventory */
function InventoryOverview({ stats }: { stats: DashboardStats }) {
  const inv = stats.materials.reduce((s, m) => s + Number(m.quantity || 0) * Number(m.unit_price || 0), 0);
  return (
    <>
      <MetricsGrid
        metrics={[
          metric('iv1', 'Total SKUs', stats.materials.length, 'box', 'customers'),
          metric('iv2', 'Low Stock', n(stats.materials, (m) => m.status === 'low_stock'), 'alert-triangle', 'revenue'),
          metric('iv3', 'Defective', n(stats.materials, (m) => m.status === 'defective'), 'package-x', 'profit'),
          metric('iv4', 'Inventory Value', money(inv), 'wallet', 'invoices'),
        ]}
      />
      <section className="analytics-grid" style={{ marginTop: 22 }}>
        <article className="panel">
          <PanelHead title="Stock Status" />
          <DonutPanel
            value={String(stats.materials.length)}
            label="Items"
            legend={[
              { label: 'In Stock', value: String(n(stats.materials, (m) => m.status === 'in_stock')), dot: 'dark' },
              { label: 'Low Stock', value: String(n(stats.materials, (m) => m.status === 'low_stock')), dot: 'blue' },
              { label: 'Defective', value: String(n(stats.materials, (m) => m.status === 'defective')), dot: 'pale' },
            ]}
          />
        </article>
        <StatList
          title="Material Requests"
          items={[
            { icon: 'clock', color: '#f59e0b', label: 'Pending', value: String(n(stats.materialRequests, (r) => r.status === 'pending')) },
            { icon: 'check-circle', color: 'var(--blue)', label: 'Approved', value: String(n(stats.materialRequests, (r) => r.status === 'approved')) },
            { icon: 'package-check', color: '#16a34a', label: 'Released', value: String(n(stats.materialRequests, (r) => r.status === 'released')) },
            { icon: 'x-circle', color: 'var(--pink)', label: 'Rejected', value: String(n(stats.materialRequests, (r) => r.status === 'rejected')) },
          ]}
        />
      </section>
      <div style={{ marginTop: 22 }}>
        <PanelHead title="Low Stock & Defective Items" />
        <DataTable
          table={recent(
            ['SKU', 'Material', 'Stock', 'Status'],
            stats.materials.filter((m) => m.status !== 'in_stock').slice(0, 6).map((m) => [{ text: String(m.sku), strong: true }, { text: String(m.name) }, { text: `${m.quantity} ${m.unit ?? ''}`.trim() }, sCell(m.status)]),
          )}
        />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Technical */
function TechnicalOverview({ stats }: { stats: DashboardStats }) {
  return (
    <>
      <MetricsGrid
        metrics={[
          metric('t1', 'Total Job Orders', stats.jobOrders.length, 'clipboard-list', 'customers'),
          metric('t2', 'In Progress', n(stats.jobOrders, (j) => j.status === 'in_progress'), 'wrench', 'revenue'),
          metric('t3', 'Pending', n(stats.jobOrders, (j) => j.status === 'pending'), 'clock', 'profit'),
          metric('t4', 'Completed', n(stats.jobOrders, (j) => j.status === 'completed'), 'check-circle', 'invoices'),
        ]}
      />
      <section className="analytics-grid" style={{ marginTop: 22 }}>
        <article className="panel">
          <PanelHead title="Job Order Status" />
          <DonutPanel
            value={String(stats.jobOrders.length)}
            label="Job Orders"
            legend={[
              { label: 'Pending', value: String(n(stats.jobOrders, (j) => j.status === 'pending')), dot: 'dark' },
              { label: 'In Progress', value: String(n(stats.jobOrders, (j) => j.status === 'in_progress')), dot: 'blue' },
              { label: 'Completed', value: String(n(stats.jobOrders, (j) => j.status === 'completed')), dot: 'pale' },
            ]}
          />
        </article>
        <StatList
          title="Field Snapshot"
          items={[
            { icon: 'users', color: 'var(--blue)', label: 'In-house Jobs', value: String(n(stats.jobOrders, (j) => j.team === 'in-house')) },
            { icon: 'truck', color: '#16a34a', label: 'Contractor Jobs', value: String(n(stats.jobOrders, (j) => j.team === 'contractor')) },
            { icon: 'file-input', color: '#f59e0b', label: 'My Pending MRFs', value: String(n(stats.materialRequests, (r) => r.status === 'pending')) },
            { icon: 'wrench', color: 'var(--pink)', label: 'Assets Needing Work', value: String(n(stats.assets, (a) => a.condition !== 'good')) },
          ]}
        />
      </section>
      <div style={{ marginTop: 22 }}>
        <PanelHead title="Active Job Orders" />
        <DataTable
          table={recent(
            ['Ref', 'Title', 'Team', 'Schedule', 'Status'],
            stats.jobOrders.filter((j) => j.status !== 'completed').slice(0, 6).map((j) => [{ text: String(j.ref_code), strong: true }, { text: String(j.title) }, { text: title(j.team) || '—' }, { text: j.scheduled_date ? new Date(String(j.scheduled_date)).toLocaleDateString('en-GB') : '—' }, sCell(j.status)]),
          )}
        />
      </div>
    </>
  );
}

/* --------------------------------------------------------------------- Zone */
function ZoneOverview({ stats }: { stats: DashboardStats }) {
  const open = stats.incidents.filter((i) => i.status !== 'resolved');
  return (
    <>
      <MetricsGrid
        metrics={[
          metric('z1', 'Open Investigations', open.length, 'search', 'customers'),
          metric('z2', 'High Urgency', n(open, (i) => i.urgency === 'high'), 'alert-triangle', 'revenue'),
          metric('z3', 'Resolved', n(stats.incidents, (i) => i.status === 'resolved'), 'check-circle', 'profit'),
          metric('z4', 'Assets to Inspect', n(stats.assets, (a) => a.condition !== 'good'), 'box', 'invoices'),
        ]}
      />
      <section className="analytics-grid" style={{ marginTop: 22 }}>
        <article className="panel">
          <PanelHead title="Case Urgency" />
          <DonutPanel
            value={String(open.length)}
            label="Open"
            legend={[
              { label: 'High', value: String(n(open, (i) => i.urgency === 'high')), dot: 'dark' },
              { label: 'Medium', value: String(n(open, (i) => i.urgency === 'medium')), dot: 'blue' },
              { label: 'Low', value: String(n(open, (i) => i.urgency === 'low')), dot: 'pale' },
            ]}
          />
        </article>
        <StatList
          title="Zone Snapshot"
          items={[
            { icon: 'search', color: 'var(--blue)', label: 'Total Incidents', value: String(stats.incidents.length) },
            { icon: 'check-circle', color: '#16a34a', label: 'Resolved', value: String(n(stats.incidents, (i) => i.status === 'resolved')) },
            { icon: 'box', color: '#f59e0b', label: 'Assets Monitored', value: String(stats.assets.length) },
            { icon: 'wrench', color: 'var(--pink)', label: 'Needs Replacement', value: String(n(stats.assets, (a) => a.condition === 'needs_replacement' || a.condition === 'dispose')) },
          ]}
        />
      </section>
      <div style={{ marginTop: 22 }}>
        <PanelHead title="High Priority Cases" />
        <DataTable
          table={recent(
            ['Ref', 'Type', 'Location', 'Urgency', 'Status'],
            open.slice(0, 6).map((i) => [{ text: String(i.ref_code), strong: true }, { text: title(i.type) }, { text: String(i.location ?? '—') }, bCell(title(i.urgency), String(i.urgency) as BadgeTone), sCell(i.status)]),
          )}
        />
      </div>
    </>
  );
}
