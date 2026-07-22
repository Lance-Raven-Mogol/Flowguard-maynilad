import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';

const RESEND_COOLDOWN = 60;

const BARANGAYS = [
  'Boac', 'Bagsangan', 'Buenavista', 'Buhangin', 'Burnay', 'Buyabod',
  'Cabanbanan', 'Calatrava', 'Camating', 'Canuto', 'Capayang', 'Cogan',
  'Daykitin', 'Del Carmen', 'Guinsiguiban', 'Imelda', 'Mabuhay',
  'Malapad', 'Mataas na Bayan', 'Maysalang', 'Pajo', 'Palale',
  'Pinggan', 'Quirino', 'Rizal', 'Sabang', 'San Isidro', 'San Jose',
  'San Miguel', 'San Vicente', 'Tagumpay', 'Tugtug', 'Umabang',
];

type Step = 'form' | 'otp';

export function SignupPage() {
  const { initiateRegistration, completeRegistration, resendOtp } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [barangay, setBarangay] = useState('Boac');
  const [submitting, setSubmitting] = useState(false);

  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleFormSubmit = async (e: React.FormEvent) => {
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
      await initiateRegistration({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        barangay,
      });
      setStep('otp');
      setCooldown(RESEND_COOLDOWN);
      notify('OTP sent to your email!', 'success');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Registration failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpSubmit = async () => {
    if (!otpCode || otpCode.length !== 6) {
      notify('Please enter a valid 6-digit code.', 'error');
      return;
    }

    setOtpLoading(true);
    try {
      await completeRegistration(email.trim(), otpCode);
      notify('Account created successfully! Welcome to FlowGuard!', 'success');
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
      await resendOtp(email.trim());
      setCooldown(RESEND_COOLDOWN);
      notify('OTP resent to your email!', 'success');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to resend OTP.', 'error');
    }
  };

  return (
    <AuthCard
      label={step === 'form' ? 'Create account' : 'Verify your email'}
      subtitle={step === 'form'
        ? 'Join FlowGuard as a customer in a few seconds.'
        : 'Enter the 6-digit verification code'
      }
    >
      {step === 'form' ? (
        <form className="login-form" noValidate onSubmit={handleFormSubmit}>
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
            {submitting ? 'Sending OTP…' : 'Continue'}
          </button>
        </form>
      ) : (
        <div className="login-form otp-step">
          <div className="otp-icon-wrap">
            <ShieldCheck size={32} strokeWidth={1.8} />
          </div>
          <p className="otp-step-desc">
            We sent a verification code to<br />
            <strong>{email.trim()}</strong>
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
            onClick={handleOtpSubmit}
            disabled={otpLoading || otpCode.length !== 6}
          >
            {otpLoading ? 'Verifying…' : 'Verify & Create Account'}
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
              onClick={() => { setStep('form'); setOtpCode(''); }}
            >
              ← Back to registration
            </button>
          </div>
        </div>
      )}

      <p className="card-footer">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthCard>
  );
}
