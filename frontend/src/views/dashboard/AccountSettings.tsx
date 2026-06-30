/**
 * AccountSettings — real, working account page for every role: change profile
 * photo (Supabase Storage), update display name, and change password. All form
 * state lives at the top level so inputs never lose focus while typing.
 */
import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { ROLES } from '../../models/types';
import { avatarFor } from './Topbar';

export function AccountSettings() {
  const { user, updateProfile, changePassword, updateAvatar } = useAuth();
  const { notify } = useToast();
  const roleLabel = ROLES.find((r) => r.value === user!.role)?.label ?? user!.role;

  const [tab, setTab] = useState<'profile' | 'security'>('profile');

  // Avatar
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Profile
  const [fullName, setFullName] = useState(user!.fullName);
  const [savingProfile, setSavingProfile] = useState(false);

  // Security
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPw, setSavingPw] = useState(false);

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

  return (
    <div className="account">
      <div className="panel account-card">
        <header className="account-head">
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
        </header>

        <div className="account-tabs">
          <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
            Profile
          </button>
          <button className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')}>
            Password &amp; Security
          </button>
        </div>

        {tab === 'profile' ? (
          <div className="account-form">
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
                <input value={new Date(user!.createdAt).toLocaleDateString('en-GB')} readOnly style={{ background: 'var(--panel-soft)' }} />
              </div>
            </div>
            <div className="account-actions">
              <button className="btn-primary" disabled={savingProfile || fullName.trim() === user!.fullName || fullName.trim().length < 2} onClick={saveProfile}>
                {savingProfile ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="account-form" style={{ maxWidth: 440 }}>
            <div className="form-group">
              <label>Current Password</label>
              <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="account-actions">
              <button className="btn-primary" disabled={savingPw || !current || !next} onClick={savePassword}>
                {savingPw ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
