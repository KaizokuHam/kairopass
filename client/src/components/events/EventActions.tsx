import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Pencil, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEventMutation } from '@/hooks/useEventMutation';
import { ApiRequestError } from '@/services/api';
import { eventsApi } from '@/services/events';
import type { OrganizerEvent } from '@/types/events';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { EventError } from './EventFeedback';

export function EventActions({ event, changed, reload }: { event: OrganizerEvent; changed: (message: string) => void; reload: () => void }) {
  const [action, setAction] = useState<'publish' | 'cancel' | null>(null);
  const [failure, setFailure] = useState<ApiRequestError | null>(null);
  const [checkedAt] = useState(() => Date.now());
  const { pending, run } = useEventMutation(); const alive = useRef(false); const locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const expired = Date.parse(event.startAt) <= checkedAt || Date.parse(event.registrationDeadline) <= checkedAt;
  async function confirm() {
    if (!action || locked.current) return;
    const operation = action; locked.current = true; setFailure(null);
    try {
      await run((signal) => operation === 'publish' ? eventsApi.publishEvent(event.id, signal) : eventsApi.cancelEvent(event.id, signal));
      if (alive.current) { setAction(null); changed(operation === 'publish' ? 'Event published successfully.' : 'Event cancelled successfully. Its record has been retained.'); }
    } catch (error) {
      if (alive.current) setFailure(error instanceof ApiRequestError ? error : new ApiRequestError('This change could not be confirmed. Reload the event.'));
    } finally { locked.current = false; }
  }
  if (event.status === 'CANCELLED') return null;
  return <><div className="event-detail-actions"><Link className={'button button-primary ' + (pending ? 'event-action-disabled' : '')} aria-disabled={pending} tabIndex={pending ? -1 : undefined} onClick={(click) => { if (pending) click.preventDefault(); }} to={'/organizer/events/' + event.id + '/edit'}><Pencil size={15} />{event.status === 'PUBLISHED' ? 'Edit event information' : 'Edit draft'}</Link>
    {event.status === 'DRAFT' && <Button disabled={pending || expired} onClick={() => { setFailure(null); setAction('publish'); }}><Send size={14} />Publish event</Button>}
    <Button variant="ghost" className="event-cancel-button" disabled={pending || event.reservedCount > 0} onClick={() => { setFailure(null); setAction('cancel'); }}><X size={15} />Cancel event</Button></div>
    {event.status === 'DRAFT' && expired && <p className="event-lock-note">Update the start and registration deadline before publishing.</p>}
    {event.reservedCount > 0 && <p className="event-lock-note">Active reserved inventory prevents cancellation.</p>}
    {action && <ConfirmActionDialog title={action === 'publish' ? 'Publish this event?' : 'Cancel this event?'} confirmLabel={action === 'publish' ? 'Confirm publication' : 'Confirm cancellation'} pending={pending} blocked={failure?.status === 409} danger={action === 'cancel'} close={() => { if (!pending) setAction(null); }} confirm={() => void confirm()}>
      {action === 'publish' ? <><p>Publication makes this event visible in public discovery while its start is in the future.</p><p>Ticket price, capacity, schedule, and registration deadline become locked. You can still edit the title, description, and venue.</p></>
        : <><p>Cancellation is permanent. This event will become read-only and remain in your records.</p><p>Events with active HELD or CONFIRMED reservations cannot be cancelled through this action. No refunds are performed here.</p></>}
      {failure && <EventError error={failure} compact mutation retry={() => { setAction(null); reload(); }} />}
    </ConfirmActionDialog>}
  </>;
}
