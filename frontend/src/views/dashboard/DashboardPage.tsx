/**
 * Dashboard page — the authenticated shell. Owns the active view / search /
 * logout state and delegates rendering of the active view to the role's
 * declarative config. All operational data is loaded live by the views
 * themselves (see StatsContext + LiveModule).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../controllers/AuthContext';
import { StatsProvider, useStats, buildBadges } from '../../controllers/StatsContext';
import { ROLE_CONFIG } from '../../config/roleViews';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Modal } from '../components/Modal';

export function DashboardPage() {
  return (
    <StatsProvider>
      <DashboardShell />
    </StatsProvider>
  );
}

function DashboardShell() {
  const { user, logout } = useAuth();
  const { stats } = useStats();
  const navigate = useNavigate();

  const config = ROLE_CONFIG[user!.role];
  const [activeId, setActiveId] = useState('overview');
  const [filter, setFilter] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);

  const activeView = useMemo(() => config.views.find((v) => v.id === activeId), [config, activeId]);

  return (
    <div className="dashboard">
      <Sidebar
        config={config}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          setFilter('');
        }}
        onLogout={() => setConfirmLogout(true)}
        badges={buildBadges(stats, user!.role, user!.fullName)}
      />

      <main className="main-panel">
        <Topbar config={config} filter={filter} onFilter={setFilter} />
        <section className="view-section active-view">{activeView?.render({ filter })}</section>
      </main>

      <Modal
        title="Confirm Logout"
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onSubmit={() => {
          logout();
          navigate('/login');
        }}
        submitText="Log Out"
      >
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Are you sure you want to log out? You will need to sign in again to access your dashboard.
        </p>
      </Modal>
    </div>
  );
}
