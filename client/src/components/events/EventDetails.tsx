import type { OrganizerEvent } from '@/types/events';
import { formatEventDate, formatPrice, localTimezone } from '@/lib/event-format';
import { CalendarDays, MapPin, Ticket } from 'lucide-react';
export function EventDetails({ event }: { event: OrganizerEvent }) {
  return <div className="event-detail-grid"><section className="event-info-card"><h2><CalendarDays size={18} />The details</h2><dl className="event-detail-list">
    <div><dt>Venue</dt><dd><MapPin size={13} />{event.venue}</dd></div><div><dt>Starts</dt><dd><time dateTime={event.startAt}>{formatEventDate(event.startAt)}</time></dd></div><div><dt>Ends</dt><dd><time dateTime={event.endAt}>{formatEventDate(event.endAt)}</time></dd></div><div><dt>Registration closes</dt><dd><time dateTime={event.registrationDeadline}>{formatEventDate(event.registrationDeadline)}</time></dd></div>
    </dl><p className="event-form-hint">Times shown in {localTimezone()}.</p><div className="event-description"><h3>About this event</h3><p>{event.description || 'No description added yet.'}</p></div></section>
    <section className="event-info-card"><h2><Ticket size={18} />Tickets & capacity</h2><p className="event-price">{formatPrice(event.pricePaise)}<small>per ticket{event.pricePaise === 0 ? ' · Free event' : ''}</small></p>
      <dl className="event-detail-list"><div><dt>Capacity</dt><dd>{event.capacity.toLocaleString('en-IN')}</dd></div><div><dt>Reserved</dt><dd>{event.reservedCount.toLocaleString('en-IN')}</dd></div><div><dt>Remaining capacity</dt><dd>{(event.capacity - event.reservedCount).toLocaleString('en-IN')}</dd></div></dl>
      <p className="event-form-hint">Capacity reflects the current event record. Reservations arrive in a future release.</p>
    </section><section className="event-history"><span>Created {formatEventDate(event.createdAt)}</span><span>Last updated {formatEventDate(event.updatedAt)}</span></section></div>;
}
