/**
 * Dashboard page — the authenticated shell. Loads the role's dashboard data,
 * owns the active view / search / modal state, and delegates rendering of the
 * active view to its declarative config.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData, TableRow } from '../../models/types';
import { dashboardService } from '../../services/dashboardService';
import { ApiError } from '../../services/apiClient';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ROLE_CONFIG } from '../../config/roleViews';
import { MODALS, type ModalKey } from '../../config/modals';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { FormModal } from '../components/FormModal';
import { Modal } from '../components/Modal';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const config = ROLE_CONFIG[user!.role];
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState('overview');
  const [filter, setFilter] = useState('');
  const [modalKey, setModalKey] = useState<ModalKey | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    dashboardService
      .get()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load dashboard.'));
  }, []);

  const activeView = useMemo(() => config.views.find((v) => v.id === activeId), [config, activeId]);

  const handleCreated = (tableId: string, row: TableRow) => {
    setData((prev) => {
      if (!prev) return prev;
      const table = prev.tables[tableId];
      if (!table) return prev;
      return { ...prev, tables: { ...prev.tables, [tableId]: { ...table, rows: [row, ...table.rows] } } };
    });
  };

  if (error) {
    return (
      <div className="dashboard">
        <main className="main-panel" style={{ display: 'grid', placeItems: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>{error}</p>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dashboard">
        <main className="main-panel" style={{ display: 'grid', placeItems: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>Loading dashboard…</p>
        </main>
      </div>
    );
  }

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
      />

      <main className="main-panel">
        <Topbar greeting={data.greeting} config={config} filter={filter} onFilter={setFilter} />
        <section className="view-section active-view">
          {activeView?.render({ data, filter, openModal: setModalKey, notify })}
        </section>
      </main>

      <FormModal
        key={modalKey ?? 'none'}
        config={modalKey ? MODALS[modalKey] : null}
        onClose={() => setModalKey(null)}
        onCreated={handleCreated}
      />

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
