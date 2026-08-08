/**
 * Notifications controller — layers "read / seen" state on top of the live
 * stats snapshot. The bell badge and each sidebar tab badge count only the
 * items the user hasn't acknowledged yet:
 *   • opening the bell marks ALL current alerts seen → bubble clears.
 *   • opening a tab marks that tab's items seen → its badge clears.
 * Seen state is persisted per-user in localStorage so unrelated actions (e.g.
 * editing your display name) never silently mark notifications as read.
 *
 * Pruning: only the keys that are still live (present in the current alert
 * list) are kept in localStorage. Stale keys from resolved/old incidents are
 * dropped on every save to prevent unbounded growth.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useStats, buildAlerts, buildBadgeItems, type Alert } from './StatsContext';

interface SeenState {
  alerts: string[];
  badges: Record<string, string[]>;
}

const EMPTY_SEEN: SeenState = { alerts: [], badges: {} };
const storageKey = (userId: string) => `flowguard:seen:${userId}`;

function loadSeen(userId: string): SeenState {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return EMPTY_SEEN;
    const parsed = JSON.parse(raw) as Partial<SeenState>;
    return { alerts: parsed.alerts ?? [], badges: parsed.badges ?? {} };
  } catch {
    return EMPTY_SEEN;
  }
}

/**
 * Prune seen.alerts to only keys that still exist in the live alert list.
 * This prevents the localStorage array from growing forever as incidents
 * get resolved and new ones are filed over time.
 */
function pruneAlerts(seen: SeenState, liveKeys: Set<string>): SeenState {
  const pruned = seen.alerts.filter((k) => liveKeys.has(k));
  if (pruned.length === seen.alerts.length) return seen;
  return { ...seen, alerts: pruned };
}

export interface NotificationItem extends Alert {
  unread: boolean;
}

interface NotificationsValue {
  items: NotificationItem[];
  unreadCount: number;
  /** Mark a single notification read (e.g. when the user clicks it). */
  markAlertSeen: (key: string) => void;
  /** Mark ALL current alerts as seen — call this when the bell is opened. */
  markAllSeen: () => void;
  badges: Record<string, number>;
  markViewSeen: (viewId: string) => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { stats } = useStats();
  const userId = user!.id;
  const role = user!.role;
  const fullName = user!.fullName;

  const [seen, setSeen] = useState<SeenState>(() => loadSeen(userId));

  // Reload (and persist under) the active user's key whenever the user changes.
  useEffect(() => {
    setSeen(loadSeen(userId));
  }, [userId]);

  const alerts = useMemo(() => buildAlerts(stats, role, fullName), [stats, role, fullName]);
  const badgeItems = useMemo(() => buildBadgeItems(stats, role, fullName), [stats, role, fullName]);

  // Live set of alert keys — used for pruning stale entries.
  const liveAlertKeys = useMemo(() => new Set(alerts.map((a) => a.key)), [alerts]);

  // Persist seen state, pruning stale alert keys on every write.
  useEffect(() => {
    try {
      const toPersist = pruneAlerts(seen, liveAlertKeys);
      localStorage.setItem(storageKey(userId), JSON.stringify(toPersist));
    } catch {
      /* storage may be unavailable (private mode) — counts simply won't persist. */
    }
  }, [userId, seen, liveAlertKeys]);

  const items = useMemo<NotificationItem[]>(
    () => alerts.map((a) => ({ ...a, unread: !seen.alerts.includes(a.key) })),
    [alerts, seen.alerts],
  );

  const unreadCount = useMemo(() => items.filter((i) => i.unread).length, [items]);

  const badges = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [viewId, itemIds] of Object.entries(badgeItems)) {
      const acked = seen.badges[viewId] ?? [];
      out[viewId] = itemIds.filter((id) => !acked.includes(id)).length;
    }
    return out;
  }, [badgeItems, seen.badges]);

  const markAlertSeen = useCallback((key: string) => {
    setSeen((s) => {
      if (s.alerts.includes(key)) return s;
      return { ...s, alerts: [...s.alerts, key] };
    });
  }, []);

  /** Mark every currently-visible alert as seen in one shot. */
  const markAllSeen = useCallback(() => {
    setSeen((s) => {
      const incoming = alerts.map((a) => a.key);
      const merged = Array.from(new Set([...s.alerts, ...incoming]));
      if (merged.length === s.alerts.length) return s;
      return { ...s, alerts: merged };
    });
  }, [alerts]);

  const markViewSeen = useCallback(
    (viewId: string) => {
      const itemIds = badgeItems[viewId];
      if (!itemIds || !itemIds.length) return;
      setSeen((s) => {
        const prev = s.badges[viewId] ?? [];
        const merged = Array.from(new Set([...prev, ...itemIds]));
        if (merged.length === prev.length) return s;
        return { ...s, badges: { ...s.badges, [viewId]: merged } };
      });
    },
    [badgeItems],
  );

  const value = useMemo(
    () => ({ items, unreadCount, markAlertSeen, markAllSeen, badges, markViewSeen }),
    [items, unreadCount, markAlertSeen, markAllSeen, badges, markViewSeen],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
}
