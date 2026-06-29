import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROLES, type Role } from '../../models/types';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';

export function SignupPage() {
  const { register } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing: string[] = [];
    if (!fullName) missing.push('Full Name');
    if (!email) missing.push('Email');
    if (!password) missing.push('Password');
    if (!role) missing.push('Role');
    if (missing.length) {
      notify(`Missing: ${missing.join(', ')}`, 'error');
      return;
    }
    setSubmitting(true);
    try {
      await register({ fullName, email, password, role: role as Role });
      navigate('/dashboard');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Sign up failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard label="Create account" subtitle="Create your account.">
      <form className="login-form" noValidate onSubmit={handleSubmit}>
        <div className="input-shell">
          <label className="input-copy" htmlFor="full-name">
            <span className="input-label">Full Name</span>
            <input id="full-name" type="text" placeholder="Enter your full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
        </div>

        <div className="input-shell">
          <label className="input-copy" htmlFor="signup-email">
            <span className="input-label">Email</span>
            <input id="signup-email" type="email" placeholder="Enter your email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>

        <PasswordInput id="signup-password" value={password} onChange={setPassword} placeholder="Create your password" autoComplete="new-password" />

        <div className="input-shell role-shell">
          <label className="input-copy" htmlFor="signup-role">
            <span className="input-label">Role</span>
            <select id="signup-role" required value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="" disabled>Select role</option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
        </div>

        <button className="primary-submit" type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Account'}
        </button>
      </form>

      <p className="card-footer">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthCard>
  );
}
