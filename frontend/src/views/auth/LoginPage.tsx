import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError, api } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';

type Step = 'credentials' | 'otp';

export function LoginPage() {
  const { login } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // OTP state
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown timer for resend OTP
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      notify('Please enter your email and password.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const result = await login({ email, password, remember });
      if (result.otpRequired) {
        setStep('otp');
        setCooldown(60);
        notify('OTP sent to your email.', 'success');
      } else {
        navigate('/dashboard');
      }
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
      // Verify OTP - the token is already set from login
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

  const handleResendOtp = async () => {
    if (cooldown > 0) return;
    try {
      // Generate new OTP for the current user
      await api.post('/auth/otp/generate', {});
      setCooldown(60);
      notify('OTP resent to your email!', 'success');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to resend OTP.', 'error');
    }
  };

  const maskEmail = (e: string) => {
    const [name, domain] = e.split('@');
    if (!domain) return e;
    const masked = name.length > 2
      ? name[0] + '***' + name[name.length - 1]
      : name[0] + '***';
    return `${masked}@${domain}`;
  };

  return (
    <AuthCard
      label={step === 'credentials' ? 'Welcome back' : 'Verify your identity'}
      subtitle={step === 'credentials'
        ? 'Sign in to your FlowGuard account.'
        : `Enter the 6-digit code sent to ${maskEmail(email)}`
      }
    >
      {step === 'credentials' ? (
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
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, textAlign: 'center' }}>
            For your security, please enter the verification code to continue.
          </p>

          <div className="input-shell">
            <label className="input-copy" htmlFor="otp">
              <span className="input-label">OTP Code</span>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8 }}
              />
            </label>
          </div>

          <button
            className="primary-submit"
            type="button"
            onClick={handleOtpVerify}
            disabled={otpLoading || otpCode.length !== 6}
          >
            {otpLoading ? 'Verifying…' : 'Verify & Sign In'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            {cooldown > 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                Resend OTP in {cooldown}s
              </p>
            ) : (
              <button
                type="button"
                className="link-btn"
                onClick={handleResendOtp}
                style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13 }}
              >
                Resend OTP
              </button>
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button
              type="button"
              className="link-btn"
              onClick={() => { setStep('credentials'); setOtpCode(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}
            >
              ← Back to login
            </button>
          </div>
        </div>
      )}

      <p className="card-footer">
        Don&apos;t have an account? <Link to="/signup">Create Account</Link>
      </p>
    </AuthCard>
  );
}
