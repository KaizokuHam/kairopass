import { Link } from 'react-router';
import { ArrowUpRight, Clock3, MapPin } from 'lucide-react';
import { formatEventDate, formatPrice } from '@/lib/event-format';
import { EventAvailability } from './EventAvailability';
import type { PublicEvent } from '@/types/discovery';

export function PublicEventCard({ event, search, now }: { event: PublicEvent; search: string; now: number }) {
  const date = new Date(event.startAt);
  return <article className="discovery-card" aria-label={event.title}>
    <div className="discovery-card-art" aria-hidden="true"><span className="discovery-date"><small>{new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date)}</small><strong>{date.getDate().toString().padStart(2, '0')}</strong></span><span className="discovery-card-motif">✳</span><span className="discovery-art-note">MAKE ROOM FOR<br />SOMETHING GOOD.</span></div>
    <div className="discovery-card-body"><div className="discovery-card-top"><span className="discovery-category">{event.pricePaise === 0 ? 'FREE EVENT' : 'PAID EVENT'}</span><EventAvailability event={event} now={now} /></div>
      <h2>{event.title}</h2><p className="discovery-card-meta"><MapPin size={14} aria-hidden="true" />{event.venue}</p>
      <p className="discovery-card-meta"><Clock3 size={14} aria-hidden="true" /><time dateTime={event.startAt}>{formatEventDate(event.startAt)}</time></p>
      <p className="discovery-capacity">{event.capacity - event.reservedCount} remaining · {event.capacity} capacity</p>
      <div className="discovery-card-footer"><div><strong>{formatPrice(event.pricePaise)}</strong><small>{event.pricePaise === 0 ? 'Free entry' : 'per ticket'}</small></div><Link className="text-link" to={'/events/' + event.id + '?' + search} aria-label={'View details for ' + event.title}>View details <ArrowUpRight size={16} /></Link></div>
    </div>
  </article>;
}
