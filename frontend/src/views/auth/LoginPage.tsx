import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROLES, type Role } from '../../models/types';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';

export function LoginPage() {
  const { login } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing: string[] = [];
    if (!email) missing.push('Email');
    if (!password) missing.push('Password');
    if (!role) missing.push('Role');
    if (missing.length) {
      notify(`Missing: ${missing.join(', ')}`, 'error');
      return;
    }
    setSubmitting(true);
    try {
      await login({ email, password, role: role as Role });
      navigate('/dashboard');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Login failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard label="Sign in" subtitle="Please enter your details to sign in.">
      <form className="login-form" noValidate onSubmit={handleSubmit}>
        <div className="input-shell">
          <label className="input-copy" htmlFor="email">
            <span className="input-label">Email</span>
            <input id="email" type="email" placeholder="Enter your email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>

        <PasswordInput id="password" value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" />

        <div className="input-shell role-shell">
          <label className="input-copy" htmlFor="role">
            <span className="input-label">Role</span>
            <select id="role" required value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="" disabled>Select role</option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="remember-option">
          <input className="remember-input" type="checkbox" name="remember" />
          <span className="checkbox-indicator" aria-hidden="true" />
          <span className="remember-text">Remember me</span>
        </label>

        <button className="primary-submit" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="card-footer">
        Don&apos;t have an account? <Link to="/signup">Create Account</Link>
      </p>
    </AuthCard>
  );
}
