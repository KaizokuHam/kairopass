import { Link } from 'react-router';
import { ArrowUpRight, Plus } from 'lucide-react';
import { useOrganizerEvents } from '@/hooks/useOrganizerEvents';
import { formatEventDate } from '@/lib/event-format';
import { EventStatusBadge } from './EventStatusBadge';
import { EventError, EventLoading } from './EventFeedback';

export function OrganizerEventOverview() {
  const resource = useOrganizerEvents({ limit: 3, sort: 'newest' });
  return <section className="organizer-overview" aria-labelledby="recent-events-heading"><div className="overview-heading"><div><p className="eyebrow">BRING PEOPLE TOGETHER</p><h2 id="recent-events-heading">Your events, taking shape.</h2></div><Link className="button button-primary" to="/organizer/events/new"><Plus size={14} />Create Event</Link></div>
    {resource.loading ? <EventLoading /> : resource.error ? <EventError error={resource.error} retry={resource.reload} compact /> : resource.data && <>
      <p className="event-result-count">{resource.data.pagination.total.toLocaleString('en-IN')} {resource.data.pagination.total === 1 ? 'event' : 'events'} in your workspace</p>
      {resource.data.events.length ? <ul className="recent-events">{resource.data.events.map((event) => <li key={event.id}><div><Link to={'/organizer/events/' + event.id}>{event.title}</Link><time dateTime={event.startAt}>{formatEventDate(event.startAt)}</time></div><EventStatusBadge status={event.status} /></li>)}</ul>
        : <p className="overview-empty">No events yet. Start with a draft and shape your next experience.</p>}
      <Link className="text-link overview-all" to="/organizer/events">View all events <ArrowUpRight size={14} /></Link>
      <Link className="text-link overview-all" to="/organizer/analytics">Open analytics dashboard <ArrowUpRight size={14} /></Link>
    </>}
  </section>;
}
