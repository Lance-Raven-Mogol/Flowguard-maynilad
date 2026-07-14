import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';

const BARANGAYS = [
  'Boac', 'Bagsangan', 'Buenavista', 'Buhangin', 'Burnay', 'Buyabod',
  'Cabanbanan', 'Calatrava', 'Camating', 'Canuto', 'Capayang', 'Cogan',
  'Daykitin', 'Del Carmen', 'Guinsiguiban', 'Imelda', 'Mabuhay',
  'Malapad', 'Mataas na Bayan', 'Maysalang', 'Pajo', 'Palale',
  'Pinggan', 'Quirino', 'Rizal', 'Sabang', 'San Isidro', 'San Jose',
  'San Miguel', 'San Vicente', 'Tagumpay', 'Tugtug', 'Umabang',
];

export function SignupPage() {
  const { register } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [barangay, setBarangay] = useState('Boac');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim() || !email.trim() || !password) {
      notify('Please fill in all fields.', 'error');
      return;
    }
    if (password.length < 6) {
      notify('Password must be at least 6 characters.', 'error');
      return;
    }
    if (password !== confirm) {
      notify('Passwords do not match.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      // Use regular registration (creates account immediately)
      await register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      });
      notify('Account created successfully! Welcome to FlowGuard!', 'success');
      navigate('/dashboard');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Registration failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      label="Create account"
      subtitle="Join FlowGuard as a customer in a few seconds."
    >
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

        <PasswordInput id="signup-password" value={password} onChange={setPassword} placeholder="Create a password (min. 6 characters)" autoComplete="new-password" />

        <PasswordInput id="signup-confirm" label="Confirm Password" value={confirm} onChange={setConfirm} placeholder="Confirm your password" autoComplete="new-password" />

        <div className="input-shell">
          <label className="input-copy" htmlFor="barangay">
            <span className="input-label">Barangay</span>
            <select id="barangay" value={barangay} onChange={(e) => setBarangay(e.target.value)}>
              {BARANGAYS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="auth-hint">
          You'll be registered as a <strong>Customer</strong>. Staff accounts and roles are
          provisioned by your administrator.
        </p>

        <button className="primary-submit" type="submit" disabled={submitting}>
          {submitting ? 'Creating Account…' : 'Create Account'}
        </button>
      </form>

      <p className="card-footer">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthCard>
  );
}
