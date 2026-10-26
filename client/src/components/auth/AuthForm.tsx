import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowRight, Check, Layers3, LoaderCircle, LockKeyhole, Ticket } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { FormField } from './FormField';
import { ApiRequestError, isRecord } from '@/services/api';
import { safeAuthDestination } from '@/lib/auth-navigation';
import { validateAuthForm, type AuthFormErrors, type AuthFormValues } from '@/lib/auth-validation';

export function AuthForm({ registering }: { registering: boolean }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState<AuthFormValues>({ name: '', email: '', password: '', confirmPassword: '', role: 'ATTENDEE' });
  const [errors, setErrors] = useState<AuthFormErrors>({});
  const [failure, setFailure] = useState<ApiRequestError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  const alive = useRef(false);
  const locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (failure) alert.current?.focus(); }, [failure]);
  const disabled = submitting || auth.pendingAction !== null;
  const update = (field: keyof AuthFormValues, value: string) => setValues((previous) => ({ ...previous, [field]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || auth.pendingAction) return;
    const invalid = validateAuthForm(values, registering);
    setErrors(invalid); setFailure(null);
    const first = Object.keys(invalid)[0];
    if (first) { const input = form.current?.elements.namedItem(first); if (input instanceof HTMLElement) input.focus(); return; }
    locked.current = true; setSubmitting(true);
    try {
      const input = { email: values.email.trim().toLowerCase(), password: values.password };
      const user = registering ? await auth.register({ ...input, name: values.name.trim(), role: values.role }) : await auth.login(input);
      if (!alive.current) return;
      setValues((previous) => ({ ...previous, password: '', confirmPassword: '' }));
      const state: unknown = location.state;
      const requested = isRecord(state) ? state.from : new URLSearchParams(location.search).get('redirect');
      navigate(safeAuthDestination(user.role, requested), { replace: true });
    } catch (error) {
      if (alive.current) setFailure(error instanceof ApiRequestError ? error : new ApiRequestError('Sign-in is temporarily unavailable. Please try again.'));
    } finally {
      locked.current = false;
      if (alive.current) setSubmitting(false);
    }
  }

  return <>
    <p className="eyebrow">{registering ? 'YOUR NEXT CHAPTER / 01' : 'RIGHT WHERE YOU BELONG'}</p>
    <h2>{registering ? 'Make yourself at home.' : 'Welcome back.'}</h2>
    <p className="auth-intro">{registering ? 'Create your account. Be part of what’s next.' : 'Sign in and pick up where you left off.'}</p>
    {auth.status === 'UNAVAILABLE' && !failure && <div className="form-notice" role="status">We couldn’t verify your session. You can try signing in, or <button type="button" onClick={() => void auth.refreshSession()} disabled={disabled}>check again</button>.</div>}
    <form ref={form} onSubmit={(event) => void submit(event)} noValidate aria-busy={submitting}>
      {failure && <div className="form-alert" role="alert" tabIndex={-1} ref={alert}><strong>We couldn’t {registering ? 'create your account' : 'sign you in'}.</strong><p>{failure.message}</p>
        {failure.retryAfterSeconds !== undefined && <p>Try again in {Math.max(1, Math.ceil(failure.retryAfterSeconds / 60))} {failure.retryAfterSeconds > 60 ? 'minutes' : 'minute'}.</p>}
        {failure.requestId && <small>Reference: {failure.requestId}</small>}
      </div>}
      <fieldset disabled={disabled} className="form-fields">
        {registering && <FormField label="Full name" id="name" name="name" autoComplete="name" required maxLength={100} value={values.name} onChange={(event) => update('name', event.target.value)} error={errors.name} />}
        <FormField label="Email address" id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={values.email} onChange={(event) => update('email', event.target.value)} error={errors.email} />
        <FormField label="Password" id="password" name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} required maxLength={128} value={values.password} onChange={(event) => update('password', event.target.value)} error={errors.password} {...(registering ? { hint: 'At least 8 characters. Make it your own.' } : {})} />
        {registering && <FormField label="Confirm password" id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={128} value={values.confirmPassword} onChange={(event) => update('confirmPassword', event.target.value)} error={errors.confirmPassword} />}
        {registering && <fieldset className="role-picker"><legend>I’m here as an</legend><div className="role-options">
          {([{ role: 'ATTENDEE', title: 'Attendee', copy: 'Discover events. Make memories.', icon: Ticket }, { role: 'ORGANIZER', title: 'Organizer', copy: 'Bring people together.', icon: Layers3 }] as const).map(({ role, title, copy, icon: Icon }) =>
            <label className={`role-option ${values.role === role ? 'selected' : ''}`} key={role}><input type="radio" name="role" value={role} checked={values.role === role} onChange={() => update('role', role)} /><Icon size={20} /><span><strong>{title}</strong><small>{copy}</small></span>{values.role === role && <Check size={14} className="role-check" />}</label>)}
        </div></fieldset>}
        <Button type="submit" className="auth-submit" disabled={disabled}>{submitting ? <><LoaderCircle size={17} className="spin" />{registering ? 'Creating your account…' : 'Signing in…'}</> : <>{registering ? 'Create account' : 'Sign in'}<ArrowRight size={17} /></>}</Button>
      </fieldset>
    </form>
    <p className="auth-alternative">{registering ? 'Already have an account?' : 'New to KairoPass?'} <Link to={`${registering ? '/login' : '/register'}${location.search}`} state={location.state}>{registering ? 'Sign in' : 'Create an account'} <ArrowRight size={12} /></Link></p>
    <p className="auth-security"><LockKeyhole size={12} />A little peace of mind. Your password stays private.</p>
  </>;
}
