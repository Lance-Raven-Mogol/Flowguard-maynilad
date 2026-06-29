import { LogOut } from 'lucide-react';
import type { RoleConfig, ViewDef } from '../../config/roleViews';
import { Icon } from '../components/Icon';
import logo from '../../assets/images/logo.png';

interface SidebarProps {
  config: RoleConfig;
  activeId: string;
  onSelect: (id: string) => void;
  onLogout: () => void;
}

function NavLink({ view, active, onSelect }: { view: ViewDef; active: boolean; onSelect: (id: string) => void }) {
  return (
    <a
      href="#"
      className={active ? 'active' : ''}
      onClick={(e) => {
        e.preventDefault();
        onSelect(view.id);
      }}
    >
      <Icon name={view.icon} className="nav-icon" size={18} />
      <span>{view.label}</span>
      {view.badge && <b>{view.badge}</b>}
    </a>
  );
}

export function Sidebar({ config, activeId, onSelect, onLogout }: SidebarProps) {
  const main = config.views.filter((v) => v.group === 'main');
  const support = config.views.filter((v) => v.group === 'support');

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={logo} alt="FlowGuard Logo" className="brand-logo" />
        <div>
          <strong>{config.brand.title}</strong>
          <small>{config.brand.subtitle}</small>
        </div>
      </div>

      <p className="menu-title">{config.menuTitle}</p>
      <nav className="nav-list" aria-label="Main menu">
        {main.map((v) => (
          <NavLink key={v.id} view={v} active={v.id === activeId} onSelect={onSelect} />
        ))}
      </nav>

      <p className="menu-title support-title">{config.supportTitle}</p>
      <nav className="nav-list support" aria-label="Support menu">
        {support.map((v) => (
          <NavLink key={v.id} view={v} active={v.id === activeId} onSelect={onSelect} />
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
  );
}
