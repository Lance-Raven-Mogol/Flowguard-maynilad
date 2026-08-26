import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';

type Step = 'credentials' | 'otp';

export function LoginPage() {
  const { login, verifyLoginOtp } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // TOTP state
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [loginToken, setLoginToken] = useState('');
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      notify('Please enter your email and password.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const result = await login({ email, password, remember });
      if (result.otpRequired && result.loginToken) {
        setLoginToken(result.loginToken);
        setStep('otp');
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
      await verifyLoginOtp(loginToken, otpCode, remember);
      notify('Signed in successfully!');
      navigate('/dashboard');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Verification failed.', 'error');
      setOtpCode('');
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <AuthCard
      label={step === 'credentials' ? 'Welcome back' : 'Verify your identity'}
      subtitle={step === 'credentials'
        ? 'Sign in to your FlowGuard account.'
        : 'Enter the code from your authenticator app.'
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
        <div className="login-form otp-step">
          <div className="otp-icon-wrap">
            <ShieldCheck size={32} strokeWidth={1.8} />
          </div>
          <p className="otp-step-desc">
            Open your <strong>authenticator app</strong> and enter<br />
            the 6-digit code for <strong>FlowGuard</strong>.
          </p>

          <div className="otp-input-group">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                className="otp-digit"
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={otpCode[i] ?? ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  const next = otpCode.split('');
                  next[i] = val;
                  const joined = next.join('').slice(0, 6);
                  setOtpCode(joined);
                  if (val && i < 5) otpRefs.current[i + 1]?.focus();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !otpCode[i] && i > 0) {
                    otpRefs.current[i - 1]?.focus();
                  }
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = (e.clipboardData.getData('text') ?? '').replace(/\D/g, '').slice(0, 6);
                  setOtpCode(pasted);
                  otpRefs.current[Math.min(pasted.length, 5)]?.focus();
                }}
              />
            ))}
          </div>
          <p className="otp-cooldown" style={{ textAlign: 'center', marginTop: '0.3rem' }}>Codes change every 30 seconds.</p>

          <button
            className="primary-submit"
            type="button"
            onClick={handleOtpVerify}
            disabled={otpLoading || otpCode.length !== 6}
          >
            {otpLoading ? 'Verifying…' : 'Verify & Sign In'}
          </button>

          <div className="otp-actions">
            <button
              type="button"
              className="otp-link-btn otp-back"
              onClick={() => { setStep('credentials'); setOtpCode(''); setLoginToken(''); }}
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
