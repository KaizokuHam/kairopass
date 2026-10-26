import { Link } from 'react-router';
import { ArrowUpRight, CalendarDays, MapPin } from 'lucide-react';
import type { OrganizerEvent } from '@/types/events';
import { formatEventDate, formatPrice } from '@/lib/event-format';
import { EventStatusBadge } from './EventStatusBadge';
export function EventCard({ event }: { event: OrganizerEvent }) {
  return <article className="event-card" aria-labelledby={'event-' + event.id}>
    <div className="event-card-top"><span className="event-card-icon"><CalendarDays size={21} strokeWidth={1.5} /></span><EventStatusBadge status={event.status} /></div>
    <h2 id={'event-' + event.id}><Link to={'/organizer/events/' + event.id}>{event.title}</Link></h2>
    <p className="event-card-venue"><MapPin size={13} />{event.venue}</p><p className="event-card-date"><time dateTime={event.startAt}>{formatEventDate(event.startAt)}</time></p>
    <dl className="event-card-stats"><div><dt>Ticket price</dt><dd>{formatPrice(event.pricePaise)}</dd></div><div><dt>Capacity</dt><dd>{event.capacity.toLocaleString('en-IN')}</dd></div><div><dt>Remaining</dt><dd>{(event.capacity - event.reservedCount).toLocaleString('en-IN')}</dd></div></dl>
    <div className="event-card-actions"><Link className="text-link" to={'/organizer/events/' + event.id}>Manage event <ArrowUpRight size={14} /></Link>{event.status !== 'CANCELLED' && <Link className="text-link" to={'/organizer/events/' + event.id + '/edit'}>Edit</Link>}</div>
  </article>;
}
