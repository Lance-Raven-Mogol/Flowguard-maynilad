/**
 * AccountSettings — real, working account page for every role: change profile
 * photo (Supabase Storage), update display name, change password, OTP settings,
 * and location (barangay). Sections are stacked so the page fills naturally.
 */
import { useRef, useState, useEffect } from 'react';
import { Camera, Shield, MapPin, MailCheck } from 'lucide-react';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { ROLES } from '../../models/types';
import { avatarFor } from './Topbar';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { AddressInput } from '../components/BarangayCombobox';
import { OtpCodeInput, ResendCodeButton } from '../auth/OtpCodeInput';

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
      // Email a confirmation code, then open the verification modal
      setOtpLoading(true);
      try {
        const { authService } = await import('../../services/authService');
        await authService.generateOtp();
        setOtpModalOpen(true);
        setOtpCode('');
      } catch (err) {
        notify(err instanceof ApiError ? err.message : 'Could not send the verification code.', 'error');
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
      notify('Please enter the 6-digit code sent to your email.', 'error');
      return;
    }
    setOtpVerifying(true);
    try {
      const { authService } = await import('../../services/authService');
      await authService.verifyOtp(otpCode);
      setOtpEnabled(true);
      setOtpModalOpen(false);
      setOtpCode('');
      notify('Two-factor authentication enabled! A code will be emailed to you on every sign-in.', 'success');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Verification failed.', 'error');
      setOtpCode('');
    } finally {
      setOtpVerifying(false);
    }
  };

  const resendOtp = async () => {
    try {
      const { authService } = await import('../../services/authService');
      const result = await authService.generateOtp();
      notify(result.message);
      return true;
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not resend the code.', 'error');
      return false;
    }
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
          <div className="account-id-tags">
            <span className="account-role">{roleLabel}</span>
            {user!.role === 'customer' && user!.serialNumber && (
              <span className="account-serial">{user!.serialNumber}</span>
            )}
          </div>
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
            {user!.role === 'customer' && (
              <div className="form-group">
                <label>Customer Serial No.</label>
                <div className="serial-field">
                  <span className="serial-field-dot" />
                  <input
                    value={user!.serialNumber ?? '—'}
                    readOnly
                    tabIndex={-1}
                    style={{ fontFamily: 'monospace', letterSpacing: '0.06em', fontWeight: 700, cursor: 'default' }}
                  />
                </div>
              </div>
            )}
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
              ? 'A verification code will be emailed to you when signing in.'
              : 'Enable OTP for additional security during sign-in.'
            }
          />
        </section>
      </div>

      {/* ── Email OTP modal — confirm the emailed code to turn 2FA on ── */}
      {otpModalOpen && (
        <div
          className="otp-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) { setOtpModalOpen(false); setOtpCode(''); } }}
        >
          <div className="otp-modal-card otp-step">
            <div className="otp-icon-wrap">
              <MailCheck size={32} strokeWidth={1.8} />
            </div>
            <h3 className="otp-modal-title">Turn on two-factor authentication</h3>
            <p className="otp-step-desc">
              We sent a 6-digit code to<br />
              <strong>{user!.email}</strong>. It expires in 10 minutes.
            </p>

            <OtpCodeInput value={otpCode} onChange={setOtpCode} />

            <button
              className="primary-submit"
              type="button"
              onClick={handleOtpVerify}
              disabled={otpVerifying || otpCode.length !== 6}
            >
              {otpVerifying ? 'Verifying…' : 'Verify & Enable 2FA'}
            </button>
            <div className="otp-actions">
              <ResendCodeButton onResend={resendOtp} />
              <button
                type="button"
                className="otp-link-btn otp-back"
                onClick={() => { setOtpModalOpen(false); setOtpCode(''); }}
              >
                ← Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
