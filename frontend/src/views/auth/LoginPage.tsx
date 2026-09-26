import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';
import { OtpCodeInput, ResendCodeButton } from './OtpCodeInput';

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

  // Emailed sign-in code state
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [loginToken, setLoginToken] = useState('');

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
        setOtpCode('');
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

  const handleResend = async () => {
    try {
      const res = await resendLoginOtp(loginToken);
      notify(res.message);
      return true;
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not resend the code.', 'error');
      return false;
    }
  };

  return (
    <AuthCard
      label={step === 'credentials' ? 'Welcome back' : 'Verify your identity'}
      subtitle={step === 'credentials'
        ? 'Sign in to your FlowGuard account.'
        : 'Enter the code we sent to your email.'
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
          <Link className="otp-link-btn" to="/forgot-password">Forgot password?</Link>

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
            <MailCheck size={32} strokeWidth={1.8} />
          </div>
          <p className="otp-step-desc">
            We sent a 6-digit sign-in code to<br />
            <strong>{email.trim()}</strong>. It expires in 5 minutes.
          </p>

          <OtpCodeInput value={otpCode} onChange={setOtpCode} />

          <button
            className="primary-submit"
            type="button"
            onClick={handleOtpVerify}
            disabled={otpLoading || otpCode.length !== 6}
          >
            {otpLoading ? 'Verifying…' : 'Verify & Sign In'}
          </button>

          <div className="otp-actions">
            <ResendCodeButton onResend={handleResend} />
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
