import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './controllers/AuthContext';
import { ToastProvider } from './controllers/ToastContext';
import { ProtectedRoute } from './views/components/ProtectedRoute';
import { LoginPage } from './views/auth/LoginPage';
import { SignupPage } from './views/auth/SignupPage';
import { DashboardPage } from './views/dashboard/DashboardPage';

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
