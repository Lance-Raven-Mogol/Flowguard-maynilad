/**
 * AccountSettings — real, working account page for every role: change profile
 * photo (Supabase Storage), update display name, change password, OTP settings,
 * and location (barangay). Sections are stacked so the page fills naturally.
 */
import { useRef, useState, useEffect } from 'react';
import { Camera, Shield, MapPin } from 'lucide-react';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { ROLES } from '../../models/types';
import { avatarFor } from './Topbar';
import { ToggleSwitch } from '../components/ToggleSwitch';

const BARANGAYS = [
  'Boac', 'Bagsangan', 'Buenavista', 'Buhangin', 'Burnay', 'Buyabod',
  'Cabanbanan', 'Calatrava', 'Camating', 'Canuto', 'Capayang', 'Cogan',
  'Daykitin', 'Del Carmen', 'Guinsiguiban', 'Imelda', 'Mabuhay',
  'Malapad', 'Mataas na Bayan', 'Maysalang', 'Pajo', 'Palale',
  'Pinggan', 'Quirino', 'Rizal', 'Sabang', 'San Isidro', 'San Jose',
  'San Miguel', 'San Vicente', 'Tagumpay', 'Tugtug', 'Umabang',
];

export function AccountSettings() {
  const { user, updateProfile, changePassword, updateAvatar } = useAuth();
  const { notify } = useToast();
  const roleLabel = ROLES.find((r) => r.value === user!.role)?.label ?? user!.role;

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [fullName, setFullName] = useState(user!.fullName);
  const [barangay, setBarangay] = useState(user!.barangay ?? 'Boac');
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
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Sync OTP state with user object
  useEffect(() => {
    setOtpEnabled(user!.otpEnabled ?? true);
  }, [user!.otpEnabled]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => setOtpCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

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
      await updateProfile({ fullName: fullName.trim() });
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
      // When enabling, send OTP first and open verification modal
      setOtpLoading(true);
      try {
        const { authService } = await import('../../services/authService');
        await authService.generateOtp();
        setOtpModalOpen(true);
        setOtpCode('');
        setOtpCooldown(60);
        notify('OTP sent to your email. Enter the code to enable 2FA.', 'success');
      } catch (err) {
        notify(err instanceof ApiError ? err.message : 'Could not send OTP.', 'error');
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
        notify('OTP disabled. You will no longer be asked for a code on sign-in.');
      } catch (err) {
        notify(err instanceof ApiError ? err.message : 'Could not update OTP settings.', 'error');
      } finally {
        setOtpLoading(false);
      }
    }
  };

  const handleOtpVerify = async () => {
    if (!otpCode || otpCode.length !== 6) {
      notify('Please enter a valid 6-digit code.', 'error');
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
        notify('OTP enabled! You will be asked for a code on every sign-in.', 'success');
      } else {
        notify('Invalid OTP code. Please try again.', 'error');
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'OTP verification failed.', 'error');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0) return;
    try {
      const { authService } = await import('../../services/authService');
      await authService.generateOtp();
      setOtpCooldown(60);
      notify('OTP resent to your email!', 'success');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to resend OTP.', 'error');
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
              <label><MapPin size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Barangay (Default Location)</label>
              <select value={barangay} onChange={(e) => setBarangay(e.target.value)}>
                {BARANGAYS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
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

      {/* OTP Verification Modal */}
      {otpModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'var(--panel)', borderRadius: 12, padding: 32,
            width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Verify OTP to Enable 2FA</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>
              Enter the 6-digit code sent to your email.
            </p>
            <div className="input-shell">
              <label className="input-copy" htmlFor="settings-otp">
                <span className="input-label">OTP Code</span>
                <input
                  id="settings-otp"
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
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={handleOtpVerify}
                disabled={otpVerifying || otpCode.length !== 6}
              >
                {otpVerifying ? 'Verifying…' : 'Verify & Enable'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => { setOtpModalOpen(false); setOtpCode(''); }}
              >
                Cancel
              </button>
            </div>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              {otpCooldown > 0 ? (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Resend OTP in {otpCooldown}s</p>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13 }}
                >
                  Resend OTP
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
