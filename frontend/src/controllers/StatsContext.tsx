/**
 * Stats controller — fetches every operational entity once for the dashboard
 * shell and shares the snapshot with the overview, the sidebar badges and the
 * topbar notification bell. A single source of truth keeps those three in sync.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { resourceService, type EntityRow } from '../services/resourceService';

export interface DashboardStats {
  incidents: EntityRow[];
  jobOrders: EntityRow[];
  materials: EntityRow[];
  materialRequests: EntityRow[];
  assets: EntityRow[];
  advisories: EntityRow[];
  payments: EntityRow[];
}

const EMPTY: DashboardStats = {
  incidents: [],
  jobOrders: [],
  materials: [],
  materialRequests: [],
  assets: [],
  advisories: [],
  payments: [],
};

const ENTITIES: [keyof DashboardStats, string][] = [
  ['incidents', 'incidents'],
  ['jobOrders', 'job-orders'],
  ['materials', 'materials'],
  ['materialRequests', 'material-requests'],
  ['assets', 'assets'],
  ['advisories', 'advisories'],
  ['payments', 'payments'],
];

interface StatsValue {
  stats: DashboardStats;
  loading: boolean;
  reload: () => Promise<void>;
}

const StatsContext = createContext<StatsValue | null>(null);

/** How often to silently re-fetch in the background (ms). */
const POLL_INTERVAL = 3_000;
const RESOURCE_CHANGE_KEY = 'flowguard:resource-change';

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<DashboardStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  /** Full fetch — shows the loading state (used on first mount). */
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        ENTITIES.map(([, slug]) => resourceService.list(slug).catch(() => [] as EntityRow[])),
      );
      const next = { ...EMPTY };
      ENTITIES.forEach(([key], i) => {
        next[key] = results[i];
      });
      setStats(next);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Silent background fetch — no loading flash, just updates the data. */
  const silentReload = useCallback(async () => {
    try {
      const results = await Promise.all(
        ENTITIES.map(([, slug]) => resourceService.list(slug).catch(() => [] as EntityRow[])),
      );
      const next = { ...EMPTY };
      ENTITIES.forEach(([key], i) => {
        next[key] = results[i];
      });
      setStats(next);
    } catch {
      /* network blip — keep the last good snapshot */
    }
  }, []);

  // Initial load.
  useEffect(() => {
    reload();
  }, [reload]);

  // Background polling — keeps the bell and badges up to date in real time
  // without requiring a page refresh or navigation action.
  useEffect(() => {
    const id = setInterval(silentReload, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [silentReload]);

  // Refresh immediately when another FlowGuard tab creates/updates a record,
  // and whenever this dashboard becomes active again. Polling remains the
  // fallback for changes made from another browser or device.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === RESOURCE_CHANGE_KEY) void silentReload();
    };
    const onFocus = () => void silentReload();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void silentReload();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [silentReload]);

  const value = useMemo(() => ({ stats, loading, reload }), [stats, loading, reload]);
  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}

export function useStats(): StatsValue {
  const ctx = useContext(StatsContext);
  if (!ctx) throw new Error('useStats must be used within a StatsProvider');
  return ctx;
}

/* --------------------------------------------------- Derived insights ----- */
const isOpen = (i: EntityRow) => i.status !== 'resolved';

export interface Alert {
  /** Stable identity for read/seen tracking — independent of the user's name. */
  key: string;
  icon: string;
  title: string;
  detail: string;
  tone: 'info' | 'warn' | 'danger';
  /** Sidebar view id to open when this notification is clicked. */
  view: string;
}

/** Stable key for an aggregate alert: tag + the sorted ids it covers. */
const aggKey = (tag: string, rows: EntityRow[]) => `${tag}:${rows.map((r) => r.id).sort().join(',')}`;

/** Urgency → alert tone mapping. */
const urgencyTone = (urgency: unknown): Alert['tone'] => {
  if (urgency === 'high') return 'danger';
  if (urgency === 'medium') return 'warn';
  return 'info';
};

/** Human-readable incident status label. */
const incidentStatusLabel = (status: unknown): string =>
  String(status ?? '').replace(/_/g, ' ');

/** Role-aware notification feed derived from the live snapshot. */
export function buildAlerts(stats: DashboardStats, role: string, fullName: string): Alert[] {
  const alerts: Alert[] = [];
  const outOfStock = stats.materials.filter((m) => m.status === 'out_of_stock' || Number(m.quantity) === 0);
  const lowStock = stats.materials.filter((m) => m.status === 'low_stock');
  const defective = stats.materials.filter((m) => m.status === 'defective');
  const pendingMrf = stats.materialRequests.filter((r) => r.status === 'pending');
  const criticalAssets = stats.assets.filter((a) => Number(a.health_score) < 15 || a.condition === 'dispose' || a.condition === 'needs_replacement');
  const openIncidents = stats.incidents.filter(isOpen);
  const draftAdvisories = stats.advisories.filter((a) => a.status !== 'published' && a.status !== 'approved');
  const pendingPurchases = stats.materialRequests.filter((r) => r.request_type === 'purchase' && r.status === 'pending');
  const overduePayments = stats.payments.filter((p) => p.status === 'overdue' || p.status === 'late');
  const pendingSupplies = stats.materialRequests.filter((r) => r.request_type === 'general' && r.status === 'pending');

  // Which sidebar view each alert kind opens, per role.
  const incView = role === 'general-manager' ? 'incidents' : role === 'zone-specialist' ? 'investigations' : 'joborders';
  const matView = role === 'general-manager' ? 'inventory' : 'materials';
  const mrfView = role === 'general-manager' ? 'requests' : 'mrf';

  if (role === 'customer') {
    const mine = stats.incidents.filter((i) => String(i.reported_by).toLowerCase() === fullName.toLowerCase() && isOpen(i));
    mine.forEach((i) =>
      alerts.push({
        key: `inc:${i.id}:${i.status}`,
        view: 'complaints',
        icon: 'message-square',
        title: `Complaint ${i.ref_code} is ${incidentStatusLabel(i.status)}`,
        detail: String(i.description ?? ''),
        tone: 'info',
      }),
    );
    const mySupplies = stats.materialRequests.filter((r) => r.request_type === 'general' && String(r.requested_by ?? '').toLowerCase() === fullName.toLowerCase() && r.status !== 'released');
    mySupplies.forEach((s) =>
      alerts.push({ key: `supply:${s.id}:${s.status}`, view: 'requests', icon: 'package', title: `Request ${s.ref_code} is ${s.status}`, detail: String(s.material_name ?? ''), tone: s.status === 'rejected' ? 'danger' : 'info' }),
    );
    stats.advisories
      .filter((a) => a.status === 'published' || a.status === 'approved')
      .slice(0, 3)
      .forEach((a) => alerts.push({ key: `adv:${a.id}`, view: 'advisories', icon: 'megaphone', title: String(a.title), detail: String(a.area ?? ''), tone: a.type === 'emergency' ? 'danger' : 'info' }));
    return alerts;
  }

  if (['inventory-officer', 'general-manager'].includes(role)) {
    if (outOfStock.length) alerts.push({ key: aggKey('outofstock', outOfStock), view: matView, icon: 'package-x', title: `${outOfStock.length} material(s) out of stock`, detail: outOfStock.map((m) => m.name).slice(0, 3).join(', '), tone: 'danger' });
    if (lowStock.length) alerts.push({ key: aggKey('lowstock', lowStock), view: matView, icon: 'alert-triangle', title: `${lowStock.length} material(s) low on stock`, detail: lowStock.map((m) => m.name).slice(0, 3).join(', '), tone: 'warn' });
    if (defective.length) alerts.push({ key: aggKey('defective', defective), view: matView, icon: 'package-x', title: `${defective.length} defective item(s)`, detail: 'Flagged for disposal / review', tone: 'danger' });
    if (pendingMrf.length) alerts.push({ key: aggKey('mrf', pendingMrf), view: mrfView, icon: 'file-input', title: `${pendingMrf.length} material request(s) pending`, detail: 'Awaiting approval / release', tone: 'warn' });
    if (pendingPurchases.length) alerts.push({ key: aggKey('purchase', pendingPurchases), view: 'purchase', icon: 'shopping-cart', title: `${pendingPurchases.length} purchase request(s) pending`, detail: 'Awaiting approval', tone: 'warn' });
  }

  // Per-incident alerts for staff roles — each new complaint gets its own key
  // so the bell lights up immediately when a new one arrives, even if the user
  // has already seen previous incidents.
  if (['zone-specialist', 'technical-team', 'general-manager'].includes(role)) {
    openIncidents.forEach((i) =>
      alerts.push({
        key: `inc:${i.id}:${i.status}`,
        view: incView,
        icon: 'message-square',
        title: `Complaint ${i.ref_code} — ${incidentStatusLabel(i.status)}`,
        detail: `${String(i.urgency ?? 'medium')} urgency · ${String(i.location ?? i.description ?? '')}`.slice(0, 80),
        tone: urgencyTone(i.urgency),
      }),
    );
    if (criticalAssets.length) alerts.push({ key: aggKey('asset', criticalAssets), view: 'assets', icon: 'wrench', title: `${criticalAssets.length} asset(s) need attention`, detail: criticalAssets.map((a) => a.name).slice(0, 3).join(', '), tone: 'warn' });
  }

  if (role === 'general-manager') {
    if (draftAdvisories.length) alerts.push({ key: aggKey('draftadv', draftAdvisories), view: 'advisories', icon: 'megaphone', title: `${draftAdvisories.length} advisory(ies) awaiting publish`, detail: 'Review and approve', tone: 'info' });
    if (overduePayments.length) alerts.push({ key: aggKey('overdue', overduePayments), view: 'payments', icon: 'credit-card', title: `${overduePayments.length} payment(s) overdue`, detail: 'Follow up required', tone: 'danger' });
    if (pendingSupplies.length) alerts.push({ key: aggKey('supplies', pendingSupplies), view: 'requests', icon: 'package', title: `${pendingSupplies.length} supply request(s) pending`, detail: 'Awaiting fulfillment', tone: 'warn' });
  }
  return alerts;
}

const ids = (rows: EntityRow[]) => rows.map((r) => String(r.id));

/**
 * The item ids contributing to each sidebar badge, keyed by view id. Tracking
 * ids (not just counts) lets the notification layer mark a tab's items as seen
 * when it's opened, so the badge clears until genuinely new items arrive.
 */
export function buildBadgeItems(stats: DashboardStats, role: string, fullName: string): Record<string, string[]> {
  const open = ids(stats.incidents.filter(isOpen));
  const pendingMrf = ids(stats.materialRequests.filter((r) => r.status === 'pending'));
  const outOfStock = ids(stats.materials.filter((m) => m.status === 'out_of_stock' || Number(m.quantity) === 0));
  const lowStock = ids(stats.materials.filter((m) => m.status === 'low_stock'));
  const activeJobs = ids(stats.jobOrders.filter((j) => j.status === 'pending' || j.status === 'in_progress'));
  const draftAdv = ids(stats.advisories.filter((a) => a.status !== 'published' && a.status !== 'approved'));
  const pendingPurchases = ids(stats.materialRequests.filter((r) => r.request_type === 'purchase' && r.status === 'pending'));
  const overduePayments = ids(stats.payments.filter((p) => p.status === 'overdue' || p.status === 'late'));
  const pendingSupplies = ids(stats.materialRequests.filter((r) => r.request_type === 'general' && r.status === 'pending'));

  switch (role) {
    case 'customer':
      return {
        complaints: ids(stats.incidents.filter((i) => String(i.reported_by).toLowerCase() === fullName.toLowerCase() && isOpen(i))),
        requests: ids(stats.materialRequests.filter((r) => r.request_type === 'general' && String(r.requested_by ?? '').toLowerCase() === fullName.toLowerCase() && r.status !== 'released')),
      };
    case 'zone-specialist':
      return { investigations: open };
    case 'technical-team':
      return { joborders: activeJobs };
    case 'inventory-officer':
      return { materials: [...outOfStock, ...lowStock], mrf: [...pendingMrf, ...pendingPurchases] };
    case 'general-manager':
      return { incidents: open, requests: [...pendingMrf, ...pendingSupplies, ...pendingPurchases], advisories: draftAdv, payments: overduePayments, inventory: [...outOfStock, ...lowStock] };
    default:
      return {};
  }
}
