/**
 * AccountSettings — a real, working settings page shared by every role. Shows
 * the actual logged-in user, lets them update their display name, and change
 * their password against the live API. Replaces the old hardcoded fields.
 */
import { useState } from 'react';
import { useAuth } from '../../controllers/AuthContext';
import { useToast } from '../../controllers/ToastContext';
import { ApiError } from '../../services/apiClient';
import { ROLES } from '../../models/types';
import { PanelHead } from '../components/panels';

export function AccountSettings() {
  const { user, updateProfile, changePassword } = useAuth();
  const { notify } = useToast();
  const [tab, setTab] = useState<'profile' | 'security'>('profile');

  const roleLabel = ROLES.find((r) => r.value === user!.role)?.label ?? user!.role;

  return (
    <>
      <PanelHead title="Account Settings" />
      <div className="settings-grid">
        <aside className="panel settings-nav">
          <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
            Profile Information
          </button>
          <button className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')}>
            Password &amp; Security
          </button>
        </aside>

        <div className="panel settings-content">
          {tab === 'profile' ? <ProfileTab roleLabel={roleLabel} /> : <SecurityTab />}
        </div>
      </div>
    </>
  );

  function ProfileTab({ roleLabel }: { roleLabel: string }) {
    const [fullName, setFullName] = useState(user!.fullName);
    const [saving, setSaving] = useState(false);
    const dirty = fullName.trim() !== user!.fullName;

    const save = async () => {
      setSaving(true);
      try {
        await updateProfile({ fullName: fullName.trim() });
        notify('Profile updated successfully!');
      } catch (e) {
        notify(e instanceof ApiError ? e.message : 'Could not update profile.', 'error');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

  function SecurityTab() {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async () => {
      if (next.length < 6) return notify('New password must be at least 6 characters.', 'error');
      if (next !== confirm) return notify('New passwords do not match.', 'error');
      setSaving(true);
      try {
        await changePassword({ currentPassword: current, newPassword: next });
        notify('Password changed successfully!');
        setCurrent('');
        setNext('');
        setConfirm('');
      } catch (e) {
        notify(e instanceof ApiError ? e.message : 'Could not change password.', 'error');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div style={{ maxWidth: 420 }}>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" disabled={saving || !current || !next} onClick={submit}>
            {saving ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </div>
    );
  }
}
