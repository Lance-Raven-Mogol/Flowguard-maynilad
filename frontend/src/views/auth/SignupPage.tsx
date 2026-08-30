import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { AuthCard } from './AuthCard';
import { PasswordInput } from './PasswordInput';
import { AddressInput } from '../components/BarangayCombobox';

type Step = 'form' | 'totp';

export function SignupPage() {
  const { initiateRegistration, completeRegistration } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [barangay, setBarangay] = useState('Isok II Poblacion, Boac');
  const [submitting, setSubmitting] = useState(false);

  // TOTP step state
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const totpRefs = useRef<(HTMLInputElement | null)[]>([]);

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
      const result = await initiateRegistration({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        barangay,
      });
      setQrCodeDataUrl(result.qrCodeDataUrl);
      setManualKey(result.manualKey);
      setStep('totp');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Registration failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTotpSubmit = async () => {
    if (!totpCode || totpCode.length !== 6) {
      notify('Please enter the 6-digit code from your authenticator app.', 'error');
      return;
    }

    setTotpLoading(true);
    try {
      await completeRegistration(email.trim(), totpCode);
      notify('Account created! Welcome to FlowGuard!', 'success');
      navigate('/dashboard');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Verification failed.', 'error');
      setTotpCode('');
    } finally {
      setTotpLoading(false);
    }
  };

  const copyManualKey = () => {
    navigator.clipboard.writeText(manualKey.replace(/\s/g, '')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <AuthCard
      label={step === 'form' ? 'Create account' : 'Protect your account'}
      subtitle={step === 'form'
        ? 'Join FlowGuard as a customer in a few seconds.'
        : 'Set up your authenticator app to secure your account.'
      }
      wide={step === 'totp'}
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
        <div className="totp-setup-wrap">

          {/* ── Header ── */}
          <div className="totp-setup-header">
            <div className="totp-shield-icon">🔐</div>
            <div>
              <h2 className="totp-setup-title">Protect your account</h2>
              <p className="totp-setup-sub">
                Authenticator-app verification is required before accessing FlowGuard.
              </p>
            </div>
          </div>

          {/* ── 2-col body: left = steps, right = QR ── */}
          <div className="totp-setup-body">

            {/* LEFT — numbered steps */}
            <div className="totp-steps-col">

              {/* Step 1 */}
              <div className="totp-step-row">
                <span className="totp-step-num">1</span>
                <div className="totp-step-content">
                  <p className="totp-step-title">Install an authenticator app</p>
                  <p className="totp-step-desc">
                    On your <strong>phone:</strong> Google Authenticator or Microsoft Authenticator.<br />
                    On your <strong>PC/browser:</strong> install the{' '}
                    <a
                      href="https://chromewebstore.google.com/detail/web2fa-authenticator/bnfooenhhgamdmakfmmchfhgheaohona"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="totp-ext-link"
                    >
                      Web2FA Authenticator
                    </a>{' '}
                    Chrome/Edge extension.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="totp-step-row">
                <span className="totp-step-num">2</span>
                <div className="totp-step-content">
                  <p className="totp-step-title">Scan the QR code</p>
                  <p className="totp-step-desc">
                    Open the app → tap <strong>"+"</strong> → <strong>"Scan QR Code"</strong>.<br />
                    Point your camera at the QR code on the right.
                  </p>
                </div>
              </div>

              {/* Step 2b — manual key */}
              <div className="totp-step-row totp-step-row--sub">
                <span className="totp-step-num totp-step-num--sub">—</span>
                <div className="totp-step-content">
                  <p className="totp-step-desc" style={{ marginBottom: '6px' }}>
                    Can't scan? Choose <strong>"Enter a setup key"</strong> and type:
                  </p>
                  <div className="totp-manual-key-row">
                    <span className="totp-manual-key-text">{manualKey}</span>
                    <button type="button" className="totp-copy-btn" onClick={copyManualKey} title="Copy key">
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="totp-step-row">
                <span className="totp-step-num">3</span>
                <div className="totp-step-content">
                  <p className="totp-step-title">Enter the 6-digit code</p>
                  <p className="totp-step-desc" style={{ marginBottom: '10px' }}>
                    The code refreshes every 30 seconds.
                  </p>
                  <div className="otp-input-group" style={{ justifyContent: 'flex-start' }}>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <input
                        key={i}
                        ref={(el) => { totpRefs.current[i] = el; }}
                        className="otp-digit"
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={totpCode[i] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          const chars = totpCode.split('');
                          chars[i] = val;
                          const joined = chars.join('').slice(0, 6);
                          setTotpCode(joined);
                          if (val && i < 5) totpRefs.current[i + 1]?.focus();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !totpCode[i] && i > 0) {
                            totpRefs.current[i - 1]?.focus();
                          }
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pasted = (e.clipboardData.getData('text') ?? '').replace(/\D/g, '').slice(0, 6);
                          setTotpCode(pasted);
                          totpRefs.current[Math.min(pasted.length, 5)]?.focus();
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

            </div>{/* end steps col */}

            {/* RIGHT — QR code */}
            <div className="totp-qr-col">
              {qrCodeDataUrl && (
                <div className="totp-qr-wrap">
                  <img src={qrCodeDataUrl} alt="TOTP QR code" className="totp-qr-img" />
                </div>
              )}
              <p className="totp-qr-hint">Scan with your authenticator app</p>
            </div>

          </div>{/* end body */}

          {/* ── Actions ── */}
          <div className="totp-setup-actions">
            <button
              className="primary-submit"
              type="button"
              onClick={handleTotpSubmit}
              disabled={totpLoading || totpCode.length !== 6}
            >
              {totpLoading ? 'Verifying…' : 'Verify and continue'}
            </button>
            <button
              type="button"
              className="otp-link-btn otp-back"
              onClick={() => { setStep('form'); setTotpCode(''); }}
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
