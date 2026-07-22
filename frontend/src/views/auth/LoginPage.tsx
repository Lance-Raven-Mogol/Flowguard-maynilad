import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';

type Step = 'credentials' | 'otp';

export function LoginPage() {
  const { login, verifyLoginOtp, resendLoginOtp } = useAuth();
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
  const [loginToken, setLoginToken] = useState('');
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

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
      if (result.otpRequired && result.loginToken) {
        setLoginToken(result.loginToken);
        setStep('otp');
        setCooldown(60);
        notify('OTP sent to your email!', 'success');
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
      notify('OTP verified! Signing in...');
      navigate('/dashboard');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'OTP verification failed.', 'error');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0) return;
    try {
      await resendLoginOtp(loginToken);
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
        <div className="login-form otp-step">
          <div className="otp-icon-wrap">
            <ShieldCheck size={32} strokeWidth={1.8} />
          </div>
          <p className="otp-step-desc">
            We sent a verification code to<br />
            <strong>{maskEmail(email)}</strong>
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

          <button
            className="primary-submit"
            type="button"
            onClick={handleOtpVerify}
            disabled={otpLoading || otpCode.length !== 6}
          >
            {otpLoading ? 'Verifying…' : 'Verify & Sign In'}
          </button>

          <div className="otp-actions">
            {cooldown > 0 ? (
              <p className="otp-cooldown">Resend code in {cooldown}s</p>
            ) : (
              <button type="button" className="otp-link-btn" onClick={handleResendOtp}>
                Resend code
              </button>
            )}
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
