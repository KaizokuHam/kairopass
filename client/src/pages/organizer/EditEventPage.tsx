import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useOrganizerEvent } from '@/hooks/useOrganizerEvents';
import { EventForm } from '@/components/events/EventForm';
import { EventError, EventLoading } from '@/components/events/EventFeedback';

export function EditEventPage() {
  const { id = '' } = useParams(); const resource = useOrganizerEvent(id);
  if (resource.loading) return <EventLoading message="Loading your event…" />;
  if (resource.error) return <EventError error={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const event = resource.data;
  return <><Link className="text-link event-back" to={'/organizer/events/' + id}><ArrowLeft size={14} />Event details</Link>
    <header className="events-heading"><p className="eyebrow">A LITTLE ROOM TO REFINE</p><h1>{event.status === 'CANCELLED' ? 'This event is read-only.' : 'Edit your event.'}</h1>
      <p>{event.status === 'CANCELLED' ? 'Cancelled events are kept for your records and cannot be edited or reopened.' : event.status === 'PUBLISHED' ? 'Update the story and venue. Your published schedule and ticket settings stay locked.' : 'Fine-tune the details before you publish.'}</p></header>
    {event.status !== 'CANCELLED' && <EventForm key={event.id + ':' + event.updatedAt} event={event} reload={resource.reload} />}
  </>;
}
