import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';
import { OtpCodeInput, ResendCodeButton } from './OtpCodeInput';
import { AddressInput } from '../components/BarangayCombobox';

type Step = 'form' | 'verify';

export function SignupPage() {
  const { initiateRegistration, completeRegistration, resendOtp } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [barangay, setBarangay] = useState('Isok II Poblacion, Boac');
  const [submitting, setSubmitting] = useState(false);

  // Email verification step state
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

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
      setCode('');
      setStep('verify');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Registration failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      notify('Please enter the 6-digit code sent to your email.', 'error');
      return;
    }

    setVerifying(true);
    try {
      await completeRegistration(email.trim(), code);
      notify('Account created! Welcome to FlowGuard!', 'success');
      navigate('/dashboard');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Verification failed.', 'error');
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    try {
      const res = await resendOtp(email.trim());
      notify(res.message);
      return true;
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not resend the code.', 'error');
      return false;
    }
  };

  return (
    <AuthCard
      label={step === 'form' ? 'Create account' : 'Verify your email'}
      subtitle={step === 'form'
        ? 'Join FlowGuard as a customer in a few seconds.'
        : 'Enter the code we sent to your email.'
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

          <AddressInput
            value={barangay}
            onChange={setBarangay}
            variant="auth"
          />

          <p className="auth-hint">
            You'll be registered as a <strong>Customer</strong>. Staff accounts and roles are
            provisioned by your administrator.
          </p>

          <button className="primary-submit" type="submit" disabled={submitting}>
            {submitting ? 'Setting up…' : 'Continue'}
          </button>
        </form>
      ) : (
        <div className="login-form otp-step">
          <div className="otp-icon-wrap">
            <MailCheck size={32} strokeWidth={1.8} />
          </div>
          <p className="otp-step-desc">
            We sent a 6-digit code to<br />
            <strong>{email.trim()}</strong>. It expires in 10 minutes.
          </p>

          <OtpCodeInput value={code} onChange={setCode} />

          <button
            className="primary-submit"
            type="button"
            onClick={handleVerify}
            disabled={verifying || code.length !== 6}
          >
            {verifying ? 'Verifying…' : 'Verify and create account'}
          </button>

          <div className="otp-actions">
            <ResendCodeButton onResend={handleResend} />
            <button
              type="button"
              className="otp-link-btn otp-back"
              onClick={() => { setStep('form'); setCode(''); }}
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
