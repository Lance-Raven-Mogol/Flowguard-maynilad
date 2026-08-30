/**
 * AccountSettings — real, working account page for every role: change profile
 * photo (Supabase Storage), update display name, change password, OTP settings,
 * and location (barangay). Sections are stacked so the page fills naturally.
 */
import { useRef, useState, useEffect } from 'react';
import { Camera, Shield, MapPin, Copy, Check, BookOpen, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { ROLES } from '../../models/types';
import { avatarFor } from './Topbar';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { AddressInput } from '../components/BarangayCombobox';

// ── Installation Guide images ──────────────────────────────────────────────
import img1 from '../../assets/images/1.png';
import img25a from '../../assets/images/2-5.png';
import img3 from '../../assets/images/3.png';
import img4 from '../../assets/images/4.png';
import img25b from '../../assets/images/2-5.png';
import img6 from '../../assets/images/6.png';
import img7 from '../../assets/images/7.png';
import img8 from '../../assets/images/8.png';
import img9 from '../../assets/images/9.png';

const GUIDE_STEPS = [
  {
    image: img1,
    title: 'Open your Extensions',
    desc: 'Click the Extensions button in your browser toolbar to see all installed extensions.',
  },
  {
    image: img25a,
    title: 'Get Extensions',
    desc: 'Click "Get extensions for Microsoft Edge" (or the equivalent for your browser) to open the add-on store.',
  },
  {
    image: img3,
    title: 'Install an Authenticator',
    desc: 'Search for and install any authenticator extension — Web2FA, Authenticator, or whichever you prefer.',
  },
  {
    image: img4,
    title: 'Copy Your Secret Key',
    desc: 'Back in the 2FA setup modal, copy the secret key shown under "Can\'t scan?" — you\'ll paste it into the authenticator.',
  },
  {
    image: img25b,
    title: 'Open the Authenticator',
    desc: 'Click your installed authenticator in the extensions list to open its interface.',
  },
  {
    image: img6,
    title: 'Add a New Account',
    desc: 'Click the three-dot menu (or "+" button) inside the authenticator, then choose Add / Manual entry.',
  },
  {
    image: img7,
    title: 'Enter Account Details',
    desc: 'Give it a name like "Flowguard OTP", paste the secret key you copied earlier, then save.',
  },
  {
    image: img8,
    title: 'Your OTP is Ready',
    desc: 'The authenticator now shows a 6-digit code that refreshes every 30 seconds — this is your OTP pin.',
  },
  {
    image: img9,
    title: 'Accessing Your Code',
    desc: 'Whenever you\'re asked for an OTP pin, just click the authenticator extension in your toolbar to view your current code.',
  },
];


export function AccountSettings() {
  const { user, updateProfile, changePassword, updateAvatar } = useAuth();
  const { notify } = useToast();
  const roleLabel = ROLES.find((r) => r.value === user!.role)?.label ?? user!.role;

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [fullName, setFullName] = useState(user!.fullName);
  const [barangay, setBarangay] = useState(user!.barangay ?? 'Isok II Poblacion, Boac');
  const [savingProfile, setSavingProfile] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  // OTP state - toggle with verification
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpEnabled, setOtpEnabled] = useState(user!.otpEnabled ?? true);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Installation guide carousel state
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);

  const openGuide = () => { setGuideStep(0); setGuideOpen(true); };
  const closeGuide = () => setGuideOpen(false);
  const guidePrev = () => setGuideStep((s) => Math.max(0, s - 1));
  const guideNext = () => setGuideStep((s) => Math.min(GUIDE_STEPS.length - 1, s + 1));

  // Sync OTP state with user object
  useEffect(() => {
    setOtpEnabled(user!.otpEnabled ?? true);
  }, [user!.otpEnabled]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return notify('Please choose an image file.', 'error');
    if (file.size > 3 * 1024 * 1024) return notify('Image must be under 3MB.', 'error');
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await updateAvatar(dataUrl);
      notify('Profile photo updated!');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not update photo.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateProfile({ fullName: fullName.trim(), barangay });
      notify('Profile updated successfully!');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not update profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    if (next.length < 6) return notify('New password must be at least 6 characters.', 'error');
    if (next !== confirm) return notify('New passwords do not match.', 'error');
    setSavingPw(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      notify('Password changed successfully!');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not change password.', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  const toggleOtp = async (enabled: boolean) => {
    if (enabled) {
      // Generate TOTP secret + QR code, open the verification modal
      setOtpLoading(true);
      try {
        const { authService } = await import('../../services/authService');
        const result = await authService.generateOtp();
        setQrCodeDataUrl(result.qrCodeDataUrl);
        setManualKey(result.manualKey);
        setOtpModalOpen(true);
        setOtpCode('');
      } catch (err) {
        notify(err instanceof ApiError ? err.message : 'Could not generate QR code.', 'error');
      } finally {
        setOtpLoading(false);
      }
    } else {
      // When disabling, no verification needed
      setOtpLoading(true);
      try {
        const { authService } = await import('../../services/authService');
        await authService.disableOtp();
        setOtpEnabled(false);
        notify('Two-factor authentication disabled.');
      } catch (err) {
        notify(err instanceof ApiError ? err.message : 'Could not update 2FA settings.', 'error');
      } finally {
        setOtpLoading(false);
      }
    }
  };

  const handleOtpVerify = async () => {
    if (!otpCode || otpCode.length !== 6) {
      notify('Please enter the 6-digit code from your authenticator app.', 'error');
      return;
    }
    setOtpVerifying(true);
    try {
      const { authService } = await import('../../services/authService');
      const result = await authService.verifyOtp(otpCode);
      if (result.valid) {
        await authService.enableOtp();
        setOtpEnabled(true);
        setOtpModalOpen(false);
        setOtpCode('');
        notify('Two-factor authentication enabled! You will be asked for a code on every sign-in.', 'success');
      } else {
        notify('Invalid code. Please check your authenticator app and try again.', 'error');
        setOtpCode('');
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Verification failed.', 'error');
    } finally {
      setOtpVerifying(false);
    }
  };

  const copyManualKey = () => {
    navigator.clipboard.writeText(manualKey.replace(/\s/g, '')).then(() => {
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    });
  };

  return (
    <div className="account">
      <header className="panel account-head">
        <div className="account-avatar">
          <img src={avatarFor(user!, 96)} alt={user!.fullName} />
          <button className="account-avatar-edit" onClick={() => fileRef.current?.click()} disabled={uploading} title="Change photo">
            <Camera size={15} className={uploading ? 'animate-spin' : ''} />
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onFile} />
        </div>
        <div className="account-id">
          <h2>{user!.fullName}</h2>
          <p>{user!.email}</p>
          <span className="account-role">{roleLabel}</span>
        </div>
        <button className="account-photo-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Change Photo'}
        </button>
      </header>

      <div className="account-cols">
        <section className="panel account-section">
          <div className="account-section-head">
            <h3>Profile Information</h3>
            <p>Update your display name and location. Your email and role are managed by your administrator.</p>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input value={user!.email} readOnly style={{ background: 'var(--panel-soft)' }} />
            </div>
            <div className="form-group">
              <label>Role</label>
              <input value={roleLabel} readOnly style={{ background: 'var(--panel-soft)' }} />
            </div>
            <div className="form-group">
              <label>Member Since</label>
              <input value={user!.startDate ? new Date(user!.startDate).toLocaleDateString('en-GB') : new Date(user!.createdAt).toLocaleDateString('en-GB')} readOnly style={{ background: 'var(--panel-soft)' }} />
            </div>
            <div className="form-group">
              <label><MapPin size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Address</label>
              <AddressInput
                value={barangay}
                onChange={setBarangay}
                variant="dashboard"
              />
            </div>
          </div>
          <div className="account-actions">
            <button className="btn-primary" disabled={savingProfile || (fullName.trim() === user!.fullName && barangay === user!.barangay) || fullName.trim().length < 2} onClick={saveProfile}>
              {savingProfile ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </section>

        <section className="panel account-section">
          <div className="account-section-head">
            <h3>Password &amp; Security</h3>
            <p>Use at least 6 characters. Keep your password private.</p>
          </div>
          <div className="form-group">
            <label>Current Password</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <div className="account-actions">
            <button className="btn-primary" disabled={savingPw || !current || !next} onClick={savePassword}>
              {savingPw ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </section>

        <section className="panel account-section">
          <div className="account-section-head">
            <h3><Shield size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />Two-Factor Authentication (OTP)</h3>
            <p>Add an extra layer of security to your account.</p>
          </div>
          <ToggleSwitch
            checked={otpEnabled}
            onChange={toggleOtp}
            disabled={otpLoading}
            label={otpEnabled ? 'OTP is enabled' : 'OTP is disabled'}
            description={otpEnabled
              ? 'You will be asked for a verification code when signing in.'
              : 'Enable OTP for additional security during sign-in.'
            }
          />
        </section>
      </div>

      {/* ── TOTP Setup Modal — scan QR code to enable 2FA ── */}
      {otpModalOpen && (
        <div
          className="otp-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) { setOtpModalOpen(false); setOtpCode(''); } }}
        >
          <div className="otp-modal-card totp-modal-card">

            {/* Header */}
            <div className="totp-setup-header" style={{ marginBottom: '20px' }}>
              <div className="totp-shield-icon">🔐</div>
              <div>
                <h3 className="totp-setup-title">Set Up Two-Factor Authentication</h3>
                <p className="totp-setup-sub">Secure your account with an authenticator app.</p>
              </div>
            </div>

            {/* 2-col body */}
            <div className="totp-setup-body" style={{ marginBottom: '20px' }}>

              {/* Steps */}
              <div className="totp-steps-col">

                {/* Step 1 */}
                <div className="totp-step-row">
                  <span className="totp-step-num">1</span>
                  <div className="totp-step-content">
                    <p className="totp-step-title">Install an authenticator app</p>
                    <p className="totp-step-desc">
                      On your <strong>phone:</strong> Google Authenticator, Microsoft Authenticator, or any TOTP app.<br />
                      On your <strong>PC/browser:</strong> any authenticator browser extension (e.g.{' '}
                      <a
                        href="https://chromewebstore.google.com/detail/web2fa-authenticator/bnfooenhhgamdmakfmmchfhgheaohona"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="totp-ext-link"
                      >
                        Web2FA
                      </a>
                      ,{' '}
                      <a
                        href="https://chromewebstore.google.com/detail/authenticator/bhghoamapcdpbohphigoooaddinpkbai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="totp-ext-link"
                      >
                        Authenticator
                      </a>
                      ).
                    </p>
                    {/* Installation guide trigger */}
                    <button
                      type="button"
                      className="install-guide-btn"
                      onClick={openGuide}
                    >
                      <BookOpen size={13} />
                      Installation Guide
                    </button>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="totp-step-row">
                  <span className="totp-step-num">2</span>
                  <div className="totp-step-content">
                    <p className="totp-step-title">Scan the QR code</p>
                    <p className="totp-step-desc">
                      Tap <strong>"+"</strong> → <strong>"Scan QR Code"</strong> in your app.
                    </p>
                  </div>
                </div>

                {/* Step 2 fallback */}
                <div className="totp-step-row totp-step-row--sub">
                  <span className="totp-step-num totp-step-num--sub">—</span>
                  <div className="totp-step-content">
                    <p className="totp-step-desc" style={{ marginBottom: '6px' }}>
                      Can't scan? Choose <strong>"Enter a setup key"</strong>:
                    </p>
                    <div className="totp-manual-key-row">
                      <span className="totp-manual-key-text">{manualKey}</span>
                      <button type="button" className="totp-copy-btn" onClick={copyManualKey}>
                        {keyCopied ? <Check size={14} /> : <Copy size={14} />}
                        {keyCopied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="totp-step-row">
                  <span className="totp-step-num">3</span>
                  <div className="totp-step-content">
                    <p className="totp-step-title">Enter the 6-digit code</p>
                    <p className="totp-step-desc" style={{ marginBottom: '8px' }}>Codes refresh every 30 seconds.</p>
                    <div className="otp-input-group" style={{ justifyContent: 'flex-start' }}>
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
                            const chars = otpCode.split('');
                            chars[i] = val;
                            const joined = chars.join('').slice(0, 6);
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
                  </div>
                </div>

              </div>

              {/* QR code */}
              <div className="totp-qr-col">
                {qrCodeDataUrl && (
                  <div className="totp-qr-wrap">
                    <img src={qrCodeDataUrl} alt="TOTP QR code" className="totp-qr-img" />
                  </div>
                )}
                <p className="totp-qr-hint">Scan with your authenticator app</p>
              </div>

            </div>

            {/* Actions */}
            <div className="totp-setup-actions">
              <button
                className="primary-submit"
                type="button"
                onClick={handleOtpVerify}
                disabled={otpVerifying || otpCode.length !== 6}
              >
                {otpVerifying ? 'Verifying…' : 'Verify & Enable 2FA'}
              </button>
              <button
                type="button"
                className="otp-link-btn otp-back"
                style={{ textAlign: 'center' }}
                onClick={() => { setOtpModalOpen(false); setOtpCode(''); }}
              >
                ← Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Installation Guide Carousel Modal ── */}
      {guideOpen && (
        <div
          className="guide-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) closeGuide(); }}
        >
          <div className="guide-card">

            {/* Close button */}
            <button className="guide-close" onClick={closeGuide} aria-label="Close guide">
              <X size={18} />
            </button>

            {/* Step counter pill */}
            <div className="guide-counter">
              Step {guideStep + 1} of {GUIDE_STEPS.length}
            </div>

            {/* Screenshot */}
            <div className="guide-img-wrap">
              <img
                key={guideStep}
                src={GUIDE_STEPS[guideStep].image}
                alt={GUIDE_STEPS[guideStep].title}
                className="guide-img"
              />
            </div>

            {/* Title + description */}
            <div className="guide-text">
              <h4 className="guide-title">{GUIDE_STEPS[guideStep].title}</h4>
              <p className="guide-desc">{GUIDE_STEPS[guideStep].desc}</p>
            </div>

            {/* Dot indicators */}
            <div className="guide-dots">
              {GUIDE_STEPS.map((_, i) => (
                <button
                  key={i}
                  className={`guide-dot${i === guideStep ? ' guide-dot--active' : ''}`}
                  onClick={() => setGuideStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>

            {/* Prev / Next navigation */}
            <div className="guide-nav">
              <button
                className="guide-nav-btn"
                onClick={guidePrev}
                disabled={guideStep === 0}
                aria-label="Previous step"
              >
                <ChevronLeft size={20} />
                Back
              </button>

              {guideStep < GUIDE_STEPS.length - 1 ? (
                <button
                  className="guide-nav-btn guide-nav-btn--primary"
                  onClick={guideNext}
                  aria-label="Next step"
                >
                  Next
                  <ChevronRight size={20} />
                </button>
              ) : (
                <button
                  className="guide-nav-btn guide-nav-btn--done"
                  onClick={closeGuide}
                >
                  Done ✓
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
