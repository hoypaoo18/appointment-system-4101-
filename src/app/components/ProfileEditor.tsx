import { useState } from 'react';
import { toast } from 'sonner';
import type { AppUser } from '../App';
import { STATIC_PREVIEW } from '../preview-data';

export function ProfileEditor({ user, onSaved }: { user: AppUser; onSaved: (user: AppUser) => void }) {
  const [name, setName] = useState(user.name), [organization, setOrganization] = useState(user.organization || ''), [phone, setPhone] = useState(user.phone || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const client = user.role === 'client';
  const dirty = name !== user.name || client && (organization !== user.organization || phone !== user.phone);
  return <form onSubmit={async event => {
    event.preventDefault(); if (busy || !dirty || STATIC_PREVIEW) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, ...(client ? { organization, phone } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save your profile');
      onSaved(data.user); setName(data.user.name); setOrganization(data.user.organization || ''); setPhone(data.user.phone || ''); toast.success('Profile saved');
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save your profile. Please retry.'); }
    finally { setBusy(false); }
  }}>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
      <label className="text-sm text-slate-600">Display Name<input required maxLength={255} autoComplete="name" value={name} onChange={event => setName(event.target.value)} disabled={busy} className="ui-input w-full mt-2 px-3 py-2.5 rounded-xl" /></label>
      {client && <>
        <label className="text-sm text-slate-600">Organization<input required maxLength={255} autoComplete="organization" value={organization} onChange={event => setOrganization(event.target.value)} disabled={busy} className="ui-input w-full mt-2 px-3 py-2.5 rounded-xl" /></label>
        <label className="text-sm text-slate-600">Phone<input required type="tel" maxLength={64} autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} disabled={busy} className="ui-input w-full mt-2 px-3 py-2.5 rounded-xl" /></label>
      </>}
      {[{ label: 'Email', value: user.email }, { label: 'Title', value: user.title }, { label: 'Role', value: user.role }].map(field => <label key={field.label} className="text-sm text-slate-600">{field.label} <span className="text-xs text-slate-400">(read-only)</span><input readOnly value={field.value} className="ui-input w-full mt-2 px-3 py-2.5 rounded-xl bg-slate-50" /></label>)}
      {client && <p className="text-sm text-slate-500">Email verification: {user.emailVerified ? 'Verified' : user.emailVerificationRequired ? 'Not verified' : 'Not required'}</p>}
    </div>
    <p className="text-xs text-slate-500 mb-4">Account email, title and role are managed by the office. Existing appointment records retain their original contact details.</p>
    {error && <p role="alert" className="text-sm text-red-600 mb-3">{error}</p>}
    <button type="submit" disabled={busy || !dirty || STATIC_PREVIEW} className="ui-button-primary px-4 py-2 text-sm font-medium rounded-xl disabled:opacity-50">{busy ? 'Saving…' : 'Save Changes'}</button>
  </form>;
}
