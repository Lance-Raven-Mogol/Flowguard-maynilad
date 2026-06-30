import { useEffect, useRef, useState } from 'react';
import { Bell, Search } from 'lucide-react';
import type { RoleConfig } from '../../config/roleViews';
import { ROLES } from '../../models/types';
import { useAuth } from '../../controllers/AuthContext';
import { useStats, buildAlerts } from '../../controllers/StatsContext';
import { Icon } from '../components/Icon';

interface TopbarProps {
  config: RoleConfig;
  filter: string;
  onFilter: (value: string) => void;
}

const TONE_COLOR: Record<string, string> = { info: '#2f6bff', warn: '#e0982f', danger: '#e25577' };

export function avatarFor(user: { fullName: string; avatarUrl?: string | null }, size = 44): string {
  return (
    user.avatarUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName)}&background=2f6bff&color=fff&size=${size * 2}&rounded=true&bold=true`
  );
}

export function Topbar({ config, filter, onFilter }: TopbarProps) {
  const { user } = useAuth();
  const { stats } = useStats();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const prefix = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const today = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const roleLabel = ROLES.find((r) => r.value === user!.role)?.label ?? user!.role;
  const alerts = buildAlerts(stats, user!.role, user!.fullName);
  const avatarUrl = avatarFor(user!);

  // Close the popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <header className="topbar">
      <div className="topbar-greet">
        <h1 className="greeting">
          <span className="greeting-pre">{prefix},</span> {user!.fullName}
        </h1>
        <p className="topbar-sub">{today}</p>
      </div>
      <div className="top-actions">
        <label className="search-box">
          <Search size={18} />
          <input
            type="search"
            placeholder={config.searchPlaceholder}
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
          />
        </label>

        <div className="popover-wrapper" ref={wrapRef}>
          <button className="icon-btn bell" type="button" aria-label="Notifications" onClick={() => setOpen((o) => !o)}>
            <Bell size={20} />
            {alerts.length > 0 && <span className="notif-count">{alerts.length}</span>}
          </button>
          <div className={`static-popover${open ? ' is-active' : ''}`}>
            <div className="popover-header">
              <h4>Notifications</h4>
              <span>{alerts.length} new</span>
            </div>
            <div className="popover-body">
              {alerts.length === 0 ? (
                <div className="popover-item" style={{ cursor: 'default' }}>
                  <div className="item-content">
                    <p>You're all caught up. No alerts right now.</p>
                  </div>
                </div>
              ) : (
                alerts.map((a, i) => (
                  <div className="popover-item" key={i}>
                    <div className="item-icon" style={{ background: `${TONE_COLOR[a.tone]}1a`, color: TONE_COLOR[a.tone] }}>
                      <Icon name={a.icon} size={18} />
                    </div>
                    <div className="item-content">
                      <strong>{a.title}</strong>
                      <p>{a.detail}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="profile">
          <img src={avatarUrl} alt={user!.fullName} className="avatar" />
          <div style={{ lineHeight: 1.3 }}>
            <strong>{user!.fullName}</strong>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{roleLabel}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
