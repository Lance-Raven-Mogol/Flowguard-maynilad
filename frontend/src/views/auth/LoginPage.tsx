import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      notify('Please enter your email and password.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate('/dashboard');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Login failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard label="Welcome back" subtitle="Sign in to your FlowGuard account.">
      <form className="login-form" noValidate onSubmit={handleSubmit}>
        <div className="input-shell">
          <label className="input-copy" htmlFor="email">
            <span className="input-label">Email</span>
            <input id="email" type="email" placeholder="Enter your email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>

        <PasswordInput id="password" value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" />

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
