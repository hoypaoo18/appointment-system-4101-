import { useState, type FormEvent } from 'react';
import { Calendar, Eye, EyeOff, ArrowLeft, MailCheck, CheckCircle2 } from 'lucide-react';
import type { AppUser } from '../App';

type Mode = 'register' | 'resend' | 'verify';
export function ClientAccess({ initialMode, verificationRequired, onRegistered, onBack }: { initialMode: Mode; verificationRequired: boolean; onRegistered: (user: AppUser) => void; onBack: () => void }) {
  const [mode, setMode] = useState(initialMode);
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('verify') || '');
  const [form, setForm] = useState({ name: '', email: '', organization: '', phone: '', password: '', confirm: '' });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState('');
  const [verified, setVerified] = useState(false);
  const input = 'ui-input w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm';
  const change = (key: keyof typeof form, value: string) => { setForm(previous => ({ ...previous, [key]: value })); setError(''); };
  const back = () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    onBack();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setError(''); setMessage(''); setPreview('');
    if (mode === 'register' && form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode === 'register' ? 'register' : mode === 'resend' ? 'resend-verification' : 'verify-email'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'register' ? { name: form.name, email: form.email, organization: form.organization, phone: form.phone, password: form.password } : mode === 'resend' ? { email: form.email } : { token }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Unable to process your request. Please try again.');
      if (mode === 'register' && data.user) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        onRegistered(data.user);
        return;
      }
      setMessage(data.message);
      setPreview(data.developmentVerificationUrl || '');
      setForm(previous => ({ ...previous, password: '', confirm: '' }));
      if (mode === 'verify') {
        setVerified(true);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } else setMode('resend');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to connect. Please try again.'); }
    finally { setBusy(false); }
  };
  const verificationDisabled = mode !== 'register' && !verificationRequired;
  const title = verificationDisabled ? 'Ready to sign in' : verified ? 'Email verified' : mode === 'register' ? 'Create client account' : mode === 'verify' ? 'Verify your email' : 'Check your email';
  return <div className="login-page client-access min-h-screen flex items-center justify-center p-4 sm:p-8 app-background">
    <div className="login-layout w-full">
      <section className="login-intro">
        <div className="flex items-center gap-3"><div className="brand-mark w-11 h-11 rounded-xl flex items-center justify-center"><Calendar className="w-6 h-6 text-white" /></div><div><div className="text-xl font-bold text-slate-900">Meridian.</div><p className="text-xs text-slate-500 mt-0.5">Client appointment portal</p></div></div>
        <div className="login-intro-copy"><span className="eyebrow">Your next appointment</span><h2>A simpler way<br /><span>to meet.</span></h2><p>Create your account, choose an available time and keep track of your appointments in one place.</p></div>
        <p className="text-xs text-slate-500">Your account gives you access to your own appointments.</p>
      </section>
      <div className="login-form-panel">
        <button type="button" onClick={back} className="flex items-center gap-2 text-xs font-medium text-blue-700 mb-6"><ArrowLeft className="w-3.5 h-3.5" />Back to sign in</button>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{title}</h1>
        <p className="text-sm text-slate-500 mt-2 mb-6">{mode === 'register' ? verificationRequired ? 'Register to book and manage your appointments.' : 'Create your account and go straight to your dashboard.' : verificationDisabled ? 'Email verification is not required. Sign in with your email and password.' : verified ? 'Your account is ready. Sign in to book your first appointment.' : mode === 'verify' ? 'Confirm your email address to activate client booking.' : 'Open the verification link in your inbox. Links expire after 24 hours.'}</p>
        {message && <div role="status" className="client-access-message"><MailCheck className="w-5 h-5 shrink-0" /><p>{message}</p></div>}
        {preview && <div className="verification-preview"><strong>Development verification link</strong><p>Email is not configured on this local server.</p><a href={preview} onClick={() => { setToken(new URL(preview).hash.slice('#verify='.length)); setMode('verify'); setMessage(''); setError(''); setPreview(''); }}>Open verification link</a></div>}
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{error}</p>}
        {verified || verificationDisabled ? <button className="ui-button-primary w-full py-3 rounded-lg text-sm font-semibold flex justify-center items-center gap-2" onClick={back}><CheckCircle2 className="w-4 h-4" />Sign In</button> : <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && <>
            <label className="client-access-field">Full name<input className={input} required maxLength={255} autoComplete="name" value={form.name} onChange={e => change('name',e.target.value)} /></label>
            <label className="client-access-field">Organization<input className={input} required maxLength={255} autoComplete="organization" placeholder="Your organization, or Individual" value={form.organization} onChange={e => change('organization',e.target.value)} /></label>
            <label className="client-access-field">Phone number<input className={input} required type="tel" maxLength={64} autoComplete="tel" value={form.phone} onChange={e => change('phone',e.target.value)} /></label>
          </>}
          {mode !== 'verify' && <label className="client-access-field">Email<input className={input} required type="email" maxLength={255} autoComplete="email" value={form.email} onChange={e => change('email',e.target.value)} /></label>}
          {mode === 'register' && <>
            <label className="client-access-field" htmlFor="register-password">Password<span className="login-password-control"><input id="register-password" className={input} required type={visible ? 'text' : 'password'} minLength={12} maxLength={1024} autoComplete="new-password" aria-describedby="register-password-help" value={form.password} onChange={e => change('password',e.target.value)} /><button type="button" className="password-visibility-toggle" aria-controls="register-password" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}</button></span></label>
            <p id="register-password-help" className="text-xs text-slate-500">Use at least 12 characters.</p>
            <label className="client-access-field">Confirm password<input className={input} required type="password" minLength={12} maxLength={1024} autoComplete="new-password" value={form.confirm} onChange={e => change('confirm',e.target.value)} /></label>
          </>}
          <button disabled={busy} className="ui-button-primary w-full py-3 rounded-lg text-sm font-semibold">{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'verify' ? 'Verify email' : 'Resend verification'}</button>
        </form>}
        {mode === 'register' && verificationRequired && <button type="button" className="text-xs text-blue-700 mt-5" onClick={() => { setMode('resend'); setError(''); }}>Already registered? Resend verification</button>}
        {mode === 'verify' && !verified && verificationRequired && <button type="button" className="text-xs text-blue-700 mt-5" onClick={() => { setMode('resend'); setError(''); }}>Link expired? Request a new one</button>}
      </div>
    </div>
  </div>;
}
