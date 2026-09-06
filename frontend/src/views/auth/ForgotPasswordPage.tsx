import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../controllers/ToastContext';
import { authService } from '../../services/authService';
import { ApiError } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (password.length < 6) return notify('New password must be at least 6 characters.', 'error');
    if (password !== confirmPassword) return notify('Passwords do not match.', 'error');
    setSubmitting(true);
    try {
      const result = await authService.resetPassword({ email, otpCode, newPassword: password });
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
    <AuthCard label="Reset your password" subtitle="Verify your identity using your authenticator app.">
      <form className="login-form" onSubmit={handleSubmit}>
        <p className="otp-step-desc">Use the FlowGuard authenticator you linked during signup or two-factor setup. Enter its current 6-digit code; codes refresh every 30 seconds.</p>
        <div className="input-shell">
          <label className="input-copy" htmlFor="reset-email">
            <span className="input-label">Email</span>
            <input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your account email" />
          </label>
        </div>
        <div className="input-shell">
          <label className="input-copy" htmlFor="reset-code">
            <span className="input-label">Authenticator code</span>
            <input id="reset-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" />
          </label>
        </div>
        <PasswordInput id="new-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
        <PasswordInput id="confirm-password" label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
        <button className="primary-submit" type="submit" disabled={submitting || otpCode.length !== 6}>{submitting ? 'Resetting password...' : 'Reset password'}</button>
        <p className="otp-step-desc">If you no longer have access to your authenticator or have not enabled two-factor authentication, contact your administrator for help.</p>
      </form>
      <p className="card-footer"><Link to="/login">Back to sign in</Link></p>
    </AuthCard>
  );
}
