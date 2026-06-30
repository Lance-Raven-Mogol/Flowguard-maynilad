import { Navigate } from 'react-router-dom';
import { useAuth } from '../../controllers/AuthContext';

/** Gate that redirects unauthenticated users to the login page. */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#fff' }}>
        <p style={{ color: '#7d8aa6', fontFamily: 'Poppins, sans-serif' }}>Loading…</p>
      </main>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
