import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';

const RESEND_COOLDOWN = 60; // seconds

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

  // Form state
  const [step, setStep] = useState<Step>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [barangay, setBarangay] = useState('Boac');
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
      label={step === 'form' ? 'Create account' : 'Verify your email'}
      subtitle={step === 'form'
        ? 'Join FlowGuard as a customer in a few seconds.'
        : `Enter the 6-digit code sent to ${maskEmail(email)}`
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
        <div className="login-form">
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, textAlign: 'center' }}>
            We've sent a verification code to your email. Enter it below to complete your registration.
          </p>

          <div className="input-shell">
            <label className="input-copy" htmlFor="otp-code">
              <span className="input-label">OTP Code</span>
              <input
                id="otp-code"
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
            onClick={handleOtpSubmit}
            disabled={otpLoading || otpCode.length !== 6}
          >
            {otpLoading ? 'Verifying…' : 'Verify & Create Account'}
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
              onClick={() => { setStep('form'); setOtpCode(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}
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
