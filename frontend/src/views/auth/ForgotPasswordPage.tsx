import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../controllers/ToastContext';
import { authService } from '../../services/authService';
import { ApiError } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';
import { OtpCodeInput, ResendCodeButton } from './OtpCodeInput';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useToast();
  const navigate = useNavigate();

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await authService.requestPasswordReset(email.trim());
      notify(result.message);
      setOtpCode('');
      setStep('reset');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not send the reset code. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    try {
      const result = await authService.requestPasswordReset(email.trim());
      notify(result.message);
      return true;
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not resend the code.', 'error');
      return false;
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (password.length < 6) return notify('New password must be at least 6 characters.', 'error');
    if (password !== confirmPassword) return notify('Passwords do not match.', 'error');
    setSubmitting(true);
    try {
      const result = await authService.resetPassword({ email: email.trim(), otpCode, newPassword: password });
      notify(result.message);
      navigate('/login', { replace: true });
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Password reset failed. Please try again.', 'error');
      setOtpCode('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      label="Reset your password"
      subtitle={step === 'email' ? 'We will email you a 6-digit reset code.' : 'Enter the code we sent to your email.'}
    >
      {step === 'email' ? (
        <form className="login-form" onSubmit={sendCode}>
          <div className="input-shell">
            <label className="input-copy" htmlFor="reset-email">
              <span className="input-label">Email</span>
              <input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your account email" />
            </label>
          </div>
          <button className="primary-submit" type="submit" disabled={submitting || !email.trim()}>{submitting ? 'Sending code…' : 'Send reset code'}</button>
        </form>
      ) : (
        <form className="login-form" onSubmit={handleSubmit}>
          <p className="otp-step-desc">
            If an account exists for <strong>{email.trim()}</strong>, a 6-digit code was sent to it. The code expires in 10 minutes.
          </p>
          <OtpCodeInput value={otpCode} onChange={setOtpCode} />
          <PasswordInput id="new-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
          <PasswordInput id="confirm-password" label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
          <button className="primary-submit" type="submit" disabled={submitting || otpCode.length !== 6}>{submitting ? 'Resetting password…' : 'Reset password'}</button>
          <div className="otp-actions">
            <ResendCodeButton onResend={resendCode} />
            <button type="button" className="otp-link-btn otp-back" onClick={() => { setStep('email'); setOtpCode(''); }}>
              ← Use a different email
            </button>
          </div>
        </form>
      )}
      <p className="card-footer"><Link to="/login">Back to sign in</Link></p>
    </AuthCard>
  );
}
