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
}

const EMPTY: DashboardStats = {
  incidents: [],
  jobOrders: [],
  materials: [],
  materialRequests: [],
  assets: [],
  advisories: [],
};

const ENTITIES: [keyof DashboardStats, string][] = [
  ['incidents', 'incidents'],
  ['jobOrders', 'job-orders'],
  ['materials', 'materials'],
  ['materialRequests', 'material-requests'],
  ['assets', 'assets'],
  ['advisories', 'advisories'],
];

interface StatsValue {
  stats: DashboardStats;
  loading: boolean;
  reload: () => Promise<void>;
}

const StatsContext = createContext<StatsValue | null>(null);

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<DashboardStats>(EMPTY);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    reload();
  }, [reload]);

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

/** Role-aware notification feed derived from the live snapshot. */
export function buildAlerts(stats: DashboardStats, role: string, fullName: string): Alert[] {
  const alerts: Alert[] = [];
  const lowStock = stats.materials.filter((m) => m.status === 'low_stock');
  const defective = stats.materials.filter((m) => m.status === 'defective');
  const pendingMrf = stats.materialRequests.filter((r) => r.status === 'pending');
  const criticalAssets = stats.assets.filter((a) => Number(a.health_score) < 15 || a.condition === 'dispose' || a.condition === 'needs_replacement');
  const openIncidents = stats.incidents.filter(isOpen);
  const draftAdvisories = stats.advisories.filter((a) => a.status !== 'published');

  // Which sidebar view each alert kind opens, per role.
  const incView = role === 'general-manager' ? 'incidents' : role === 'zone-specialist' ? 'investigations' : 'joborders';
  const matView = role === 'general-manager' ? 'inventory' : 'materials';
  const mrfView = role === 'general-manager' ? 'requests' : 'mrf';

  if (role === 'customer') {
    const mine = stats.incidents.filter((i) => String(i.reported_by).toLowerCase() === fullName.toLowerCase() && isOpen(i));
    mine.forEach((i) =>
      alerts.push({ key: `inc:${i.id}:${i.status}`, view: 'complaints', icon: 'message-square', title: `Complaint ${i.ref_code} is ${String(i.status).replace(/_/g, ' ')}`, detail: String(i.description ?? ''), tone: 'info' }),
    );
    stats.advisories
      .filter((a) => a.status === 'published')
      .slice(0, 3)
      .forEach((a) => alerts.push({ key: `adv:${a.id}`, view: 'advisories', icon: 'megaphone', title: String(a.title), detail: String(a.area ?? ''), tone: a.type === 'emergency' ? 'danger' : 'info' }));
    return alerts;
  }

  if (['inventory-officer', 'general-manager'].includes(role)) {
    if (lowStock.length) alerts.push({ key: aggKey('lowstock', lowStock), view: matView, icon: 'alert-triangle', title: `${lowStock.length} material(s) low on stock`, detail: lowStock.map((m) => m.name).slice(0, 3).join(', '), tone: 'warn' });
    if (defective.length) alerts.push({ key: aggKey('defective', defective), view: matView, icon: 'package-x', title: `${defective.length} defective item(s)`, detail: 'Flagged for disposal / review', tone: 'danger' });
    if (pendingMrf.length) alerts.push({ key: aggKey('mrf', pendingMrf), view: mrfView, icon: 'file-input', title: `${pendingMrf.length} material request(s) pending`, detail: 'Awaiting approval / release', tone: 'warn' });
  }
  if (['zone-specialist', 'technical-team', 'general-manager'].includes(role)) {
    if (openIncidents.length) alerts.push({ key: aggKey('openinc', openIncidents), view: incView, icon: 'message-square', title: `${openIncidents.length} open incident(s)`, detail: `${openIncidents.filter((i) => i.urgency === 'high').length} high urgency`, tone: openIncidents.some((i) => i.urgency === 'high') ? 'danger' : 'info' });
    if (criticalAssets.length) alerts.push({ key: aggKey('asset', criticalAssets), view: 'assets', icon: 'wrench', title: `${criticalAssets.length} asset(s) need attention`, detail: criticalAssets.map((a) => a.name).slice(0, 3).join(', '), tone: 'warn' });
  }
  if (role === 'general-manager' && draftAdvisories.length) {
    alerts.push({ key: aggKey('draftadv', draftAdvisories), view: 'advisories', icon: 'megaphone', title: `${draftAdvisories.length} advisory(ies) awaiting publish`, detail: 'Review and approve', tone: 'info' });
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
  const lowStock = ids(stats.materials.filter((m) => m.status === 'low_stock'));
  const activeJobs = ids(stats.jobOrders.filter((j) => j.status === 'pending' || j.status === 'in_progress'));
  const draftAdv = ids(stats.advisories.filter((a) => a.status !== 'published'));

  switch (role) {
    case 'customer':
      return { complaints: ids(stats.incidents.filter((i) => String(i.reported_by).toLowerCase() === fullName.toLowerCase() && isOpen(i))) };
    case 'zone-specialist':
      return { investigations: open };
    case 'technical-team':
      return { joborders: activeJobs };
    case 'inventory-officer':
      return { materials: lowStock, mrf: pendingMrf };
    case 'general-manager':
      return { incidents: open, requests: pendingMrf, advisories: draftAdv };
    default:
      return {};
  }
}
