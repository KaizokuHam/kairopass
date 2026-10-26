import { Link, useLocation, useParams } from 'react-router';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useOrganizerEvent } from '@/hooks/useOrganizerEvents';
import { isRecord } from '@/services/api';
import { EventDetails } from '@/components/events/EventDetails';
import { EventStatusBadge } from '@/components/events/EventStatusBadge';
import { EventError, EventLoading } from '@/components/events/EventFeedback';
export function OrganizerEventDetailsPage() {
  const { id = '' } = useParams(); const resource = useOrganizerEvent(id); const location = useLocation();
  if (resource.loading) return <EventLoading message="Loading your event…" />;
  if (resource.error) return <EventError error={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const event = resource.data; const state: unknown = location.state;
  const notice = isRecord(state) && state.notice === 'created' ? 'Event created successfully. Your draft is ready.' : isRecord(state) && state.notice === 'updated' ? 'Event updated successfully.' : '';
  return <><Link className="text-link event-back" to="/organizer/events"><ArrowLeft size={14} />My Events</Link>
    {notice && <p className="event-notice" role="status">{notice}</p>}
    <header className="events-heading"><EventStatusBadge status={event.status} /><h1 id="event-title" tabIndex={-1}>{event.title}</h1><p>Your event, from the first idea to the moment it happens.</p></header>
    {event.status !== 'CANCELLED' ? <div className="event-detail-actions"><Link className="button button-primary" to={'/organizer/events/' + id + '/edit'}><Pencil size={15} />{event.status === 'PUBLISHED' ? 'Edit event information' : 'Edit draft'}</Link></div>
      : <p className="event-notice">This event is cancelled. Its details remain available for your records.</p>}
    <EventDetails event={event} />
  </>;
}
