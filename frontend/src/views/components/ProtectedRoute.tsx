import { Navigate } from 'react-router-dom';
import { useAuth } from '../../controllers/AuthContext';

/** Gate that redirects unauthenticated users to the login page. */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="page-shell">
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </main>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
