import { useEffect, useRef } from 'react';
import { Droplets, LogOut, X } from 'lucide-react';
import type { RoleConfig, ViewDef } from '../../config/roleViews';
import { Icon } from '../components/Icon';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  config: RoleConfig;
  activeId: string;
  onSelect: (id: string) => void;
  onLogout: () => void;
  badges?: Record<string, number>;
}

function NavLink({ view, active, onSelect, badge }: { view: ViewDef; active: boolean; onSelect: (id: string) => void; badge?: number | string }) {
  return (
    <a
      href="#"
      className={active ? 'active' : ''}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        onSelect(view.id);
      }}
    >
      <Icon name={view.icon} className="nav-icon" size={18} />
      <span>{view.label}</span>
      {badge ? <b>{badge}</b> : null}
    </a>
  );
}

export function Sidebar({ open, onClose, config, activeId, onSelect, onLogout, badges = {} }: SidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia('(max-width: 1024px)');
    const onResize = () => { if (!media.matches) onClose(); };
    media.addEventListener('change', onResize);
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = sidebarRef.current!;
    sidebar.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const links = Array.from(sidebar.querySelectorAll<HTMLElement>('a, button'));
      const first = links[0], last = links[links.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { media.removeEventListener('change', onResize); document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [open, onClose]);
  const main = config.views.filter((v) => v.group === 'main');
  const support = config.views.filter((v) => v.group === 'support');

  return (
    <>
      {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={onClose} />}
    <aside ref={sidebarRef} id="dashboard-navigation" className={`sidebar${open ? ' is-open' : ''}`}>
      <button type="button" className="mobile-nav-close" onClick={onClose} aria-label="Close navigation"><X size={22} /></button>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <Droplets size={24} strokeWidth={2.2} />
        </span>
        <div>
          <strong>{config.brand.title}</strong>
          <small>{config.brand.subtitle}</small>
        </div>
      </div>

      <p className="menu-title">{config.menuTitle}</p>
      <nav className="nav-list" aria-label="Main menu">
        {main.map((v) => (
          <NavLink key={v.id} view={v} active={v.id === activeId} onSelect={onSelect} badge={badges[v.id] || v.badge} />
        ))}
      </nav>

      <p className="menu-title support-title">{config.supportTitle}</p>
      <nav className="nav-list support" aria-label="Support menu">
        {support.map((v) => (
          <NavLink key={v.id} view={v} active={v.id === activeId} onSelect={onSelect} badge={badges[v.id] || v.badge} />
        ))}
      </nav>

      <a
        className="logout"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onLogout();
        }}
      >
        <LogOut className="nav-icon" size={18} />
        <span>Log Out</span>
      </a>
    </aside>
    </>
  );
}
