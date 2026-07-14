import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError, api } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';

export function LoginPage() {
  const { login } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // OTP state
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      notify('Please enter your email and password.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await login({ email, password, remember });
      // Check if OTP is enabled for this user (would come from user object in production)
      // For now, OTP is optional and managed via Account Settings
      navigate('/dashboard');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Login failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpVerify = async () => {
    if (!otpCode || otpCode.length !== 6) {
      notify('Please enter a valid 6-digit code.', 'error');
      return;
    }
    setOtpLoading(true);
    try {
      const res = await api.post<{ valid: boolean }>('/auth/otp/verify', { code: otpCode });
      if (res.valid) {
        notify('OTP verified! Signing in...');
        navigate('/dashboard');
      } else {
        notify('Invalid or expired OTP code.', 'error');
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'OTP verification failed.', 'error');
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <AuthCard label="Welcome back" subtitle="Sign in to your FlowGuard account.">
      {!otpRequired ? (
        <form className="login-form" noValidate onSubmit={handleSubmit}>
          <div className="input-shell">
            <label className="input-copy" htmlFor="email">
              <span className="input-label">Email</span>
              <input id="email" type="email" placeholder="Enter your email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>

          <PasswordInput id="password" value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" />

          <label className="remember-option">
            <input className="remember-input" type="checkbox" name="remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span className="checkbox-indicator" aria-hidden="true" />
            <span className="remember-text">Remember me</span>
          </label>

          <button className="primary-submit" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      ) : (
        <div className="login-form">
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Enter the 6-digit code sent to your email.
          </p>
          <div className="input-shell">
            <label className="input-copy" htmlFor="otp">
              <span className="input-label">OTP Code</span>
              <input id="otp" type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
          <button className="primary-submit" type="button" onClick={handleOtpVerify} disabled={otpLoading || otpCode.length !== 6}>
            {otpLoading ? 'Verifying…' : 'Verify OTP'}
          </button>
          <button type="button" className="link-btn" onClick={() => { setOtpRequired(false); setOtpCode(''); }} style={{ marginTop: 8 }}>
            Back to login
          </button>
        </div>
      )}

      <p className="card-footer">
        Don&apos;t have an account? <Link to="/signup">Create Account</Link>
      </p>
    </AuthCard>
  );
}
