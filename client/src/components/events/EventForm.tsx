import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, CalendarDays, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { eventsApi } from '@/services/events';
import { ApiRequestError } from '@/services/api';
import { useEventMutation } from '@/hooks/useEventMutation';
import { changedEventFields, initialEventValues, validateEventForm, type EventFormErrors, type EventFormValues } from '@/lib/event-form';
import { localTimezone } from '@/lib/event-format';
import type { OrganizerEvent } from '@/types/events';
import { EventError } from './EventFeedback';

function Field({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string }) {
  return <div className="event-field"><label htmlFor={props.id}>{label}</label><input {...props} aria-invalid={Boolean(error)} aria-describedby={error ? props.id + '-error' : undefined} />
    {error && <p className="field-error" id={props.id + '-error'}>{error}</p>}</div>;
}
export function EventForm({ event, reload }: { event?: OrganizerEvent; reload?: () => void }) {
  const published = event?.status === 'PUBLISHED';
  const [values, setValues] = useState(() => initialEventValues(event));
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [failure, setFailure] = useState<ApiRequestError | null>(null);
  const [notice, setNotice] = useState('');
  const { pending, run } = useEventMutation();
  const navigate = useNavigate(); const form = useRef<HTMLFormElement>(null);
  const summary = useRef<HTMLDivElement>(null); const alive = useRef(false); const locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (failure) summary.current?.focus(); }, [failure]);
  const update = (field: keyof EventFormValues, value: string) => setValues((old) => ({ ...old, [field]: value }));
  async function submit(action: FormEvent<HTMLFormElement>) {
    action.preventDefault(); if (locked.current || pending) return;
    setFailure(null); setNotice('');
    const result = validateEventForm(values, published); setErrors(result.errors);
    const first = Object.keys(result.errors)[0];
    if (first) { const input = form.current?.elements.namedItem(first); if (input instanceof HTMLElement) input.focus(); return; }
    if (!result.input) return;
    const changes = event ? changedEventFields(result.input, event) : null;
    if (changes && !Object.keys(changes).length) { setNotice('Nothing has changed yet.'); return; }
    locked.current = true;
    try {
      const input = result.input;
      const saved = await run((signal) => event ? eventsApi.updateEvent(event.id, changes!, signal) : eventsApi.createEvent(input, signal));
      if (alive.current) navigate('/organizer/events/' + saved.id, { replace: true, state: { notice: event ? 'updated' : 'created' } });
    } catch (error) {
      if (!alive.current) return;
      const failed = error instanceof ApiRequestError ? error : new ApiRequestError('The event change could not be confirmed. Reload before retrying.');
      setFailure(failed);
      setErrors(Object.fromEntries(failed.fields.map((field) => [field, 'The server rejected this field. Review the value and event requirements.'])));
    } finally { locked.current = false; }
  }
  if (failure?.status === 404) return <EventError error={failure} />;
  const field = (id: keyof EventFormValues, label: string, options: InputHTMLAttributes<HTMLInputElement> = {}) => <Field {...options} id={id} name={id} label={label} value={values[id]} onChange={(action) => update(id, action.target.value)} {...(errors[id] ? { error: errors[id] } : {})} />;
  return <form ref={form} onSubmit={(action) => void submit(action)} className="event-form" noValidate aria-busy={pending}>
    {failure && <div tabIndex={-1} ref={summary} className="event-form-summary"><EventError error={failure} compact mutation {...(reload ? { retry: reload } : {})} />
      {failure.status === 409 && <p>Reloading replaces unsaved changes. Review the latest event before saving again.</p>}</div>}
    {notice && <p role="status" className="event-notice">{notice}</p>}
    <fieldset disabled={pending || failure?.status === 409}>
      <section className="event-form-section"><div className="event-section-heading"><span>01</span><div><h2>The essentials</h2><p>Give people a reason to show up.</p></div></div>
        {field('title', 'Event title', { required: true, maxLength: 120, placeholder: 'A name worth remembering' })}
        <div className="event-field"><label htmlFor="description">Description <span>Optional</span></label><textarea id="description" name="description" rows={5} maxLength={10000} value={values.description} onChange={(action) => update('description', action.target.value)} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'description-error' : undefined} placeholder="What makes this experience special?" />
          <small>{values.description.length.toLocaleString('en-IN')} / 10,000 characters</small>{errors.description && <p className="field-error" id="description-error">{errors.description}</p>}</div>
        {field('venue', 'Venue', { required: true, maxLength: 200, placeholder: 'Where it all comes together' })}
      </section>
      <section className="event-form-section"><div className="event-section-heading"><span>02</span><div><h2>A time and a place</h2><p>Times are in {localTimezone()} — your local timezone.</p></div><CalendarDays size={18} /></div>
        {published && <p className="event-lock-note"><LockKeyhole size={14} />Schedule, capacity, and price are locked after publication.</p>}
        <div className="event-form-grid">{field('startAt', 'Start date and time', { type: 'datetime-local', step: '0.001', required: true, readOnly: published })}
          {field('endAt', 'End date and time', { type: 'datetime-local', step: '0.001', required: true, readOnly: published })}</div>
        {field('registrationDeadline', 'Registration deadline', { type: 'datetime-local', step: '0.001', required: true, readOnly: published })}
      </section>
      <section className="event-form-section"><div className="event-section-heading"><span>03</span><div><h2>Make room for your people</h2><p>One ticket price. A clear capacity.</p></div></div>
        <div className="event-form-grid">{field('capacity', 'Capacity', { inputMode: 'numeric', type: 'text', required: true, maxLength: 7, readOnly: published, placeholder: '100' })}
          {field('pricePaise', 'Ticket price (INR)', { inputMode: 'decimal', type: 'text', required: true, maxLength: 24, readOnly: published, placeholder: '199.00' })}</div>
        <p className="event-form-hint">Enter rupees with up to two decimal places. ₹0.00 is a free event. No payments are collected here.</p>
      </section>
      <div className="event-form-actions"><Button variant="ghost" onClick={() => navigate(event ? '/organizer/events/' + event.id : '/organizer/events')}><ArrowLeft size={15} />Back without saving</Button>
        <Button type="submit">{pending ? <><LoaderCircle size={16} className="spin" />Saving…</> : <>{event ? 'Save changes' : 'Save draft'}<ArrowRight size={16} /></>}</Button></div>
    </fieldset>
  </form>;
}
