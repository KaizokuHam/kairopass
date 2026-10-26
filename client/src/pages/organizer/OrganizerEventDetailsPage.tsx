import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useOrganizerEvent } from '@/hooks/useOrganizerEvents';
import { isRecord } from '@/services/api';
import { EventDetails } from '@/components/events/EventDetails';
import { EventStatusBadge } from '@/components/events/EventStatusBadge';
import { EventError, EventLoading } from '@/components/events/EventFeedback';
import { EventActions } from '@/components/events/EventActions';
export function OrganizerEventDetailsPage() {
  const { id = '' } = useParams(); const resource = useOrganizerEvent(id); const location = useLocation(); const navigate = useNavigate();
  const [actionNotice, setActionNotice] = useState<{ id: string; message: string } | null>(null);
  if (resource.loading) return <EventLoading message="Loading your event…" />;
  if (resource.error) return <EventError error={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const event = resource.data; const state: unknown = location.state;
  const notice = isRecord(state) && state.notice === 'created' ? 'Event created successfully. Your draft is ready.' : isRecord(state) && state.notice === 'updated' ? 'Event updated successfully.' : '';
  return <><Link className="text-link event-back" to="/organizer/events"><ArrowLeft size={14} />My Events</Link>
    {(actionNotice?.id === id || notice) && <p className="event-notice" role="status">{actionNotice?.id === id ? actionNotice.message : notice}</p>}
    <header className="events-heading"><EventStatusBadge status={event.status} /><h1 id="event-title" tabIndex={-1}>{event.title}</h1><p>Your event, from the first idea to the moment it happens.</p></header>
    {event.status !== 'CANCELLED' ? <EventActions event={event} reload={resource.reload} changed={(message) => { setActionNotice({ id, message }); navigate(location.pathname + location.search + location.hash, { replace: true, state: null }); resource.reload(); }} />
      : <p className="event-notice">This event is cancelled. Its details remain available for your records.</p>}
    <EventDetails event={event} />
  </>;
}
