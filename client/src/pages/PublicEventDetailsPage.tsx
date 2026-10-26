import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, CalendarDays, Clock3, MapPin, RefreshCw, Ticket, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventAvailability } from '@/components/discovery/EventAvailability';
import { DiscoveryError, DiscoverySkeleton } from '@/components/discovery/DiscoveryFeedback';
import { usePublicEvent } from '@/hooks/usePublicEvents';
import { useAvailabilityClock } from '@/hooks/useAvailabilityClock';
import { formatEventDate, formatPrice, localTimezone } from '@/lib/event-format';
import { discoveryQueryString, parseDiscoverySearch } from '@/lib/discovery-query';
import { ReserveButton } from '@/components/reservations/ReserveButton';

export function PublicEventDetailsPage() {
  const { id = '' } = useParams(), [params] = useSearchParams();
  const resource = usePublicEvent(id), event = resource.data;
  const now = useAvailabilityClock(event ? [event] : []);
  const back = '/events' + (params.size ? '?' + discoveryQueryString(parseDiscoverySearch(params).query) : '');
  return <section className="public-event-page" aria-labelledby={event ? 'public-event-title' : undefined}>
    <Link className="text-link discovery-back" to={back}><ArrowLeft size={16} />Back to Explore Events</Link>
    {resource.loading ? <DiscoverySkeleton detail /> : resource.error ? <DiscoveryError error={resource.error} retry={resource.reload} /> : event && <>
      <header className="public-event-heading"><p className="eyebrow"><span className="eyebrow-line" />A LITTLE CLOSER TO BEING THERE</p><h1 id="public-event-title">{event.title}</h1><p><MapPin size={17} aria-hidden="true" />{event.venue}</p><EventAvailability event={event} now={now} /></header>
      <div className="public-event-layout"><div className="public-event-content"><section className="public-event-about"><p className="eyebrow">THE EXPERIENCE</p><h2>Something to look forward to.</h2><p>{event.description || 'The organizer hasn’t added a description yet.'}</p></section>
        <section className="public-event-schedule" aria-labelledby="public-event-schedule"><p className="eyebrow">MAKE A LITTLE ROOM</p><h2 id="public-event-schedule">The details that matter.</h2><p className="public-event-timezone">All times shown in {localTimezone()}.</p>
          <dl><div><dt><CalendarDays size={17} aria-hidden="true" />Starts</dt><dd><time dateTime={event.startAt}>{formatEventDate(event.startAt)}</time></dd></div><div><dt><Clock3 size={17} aria-hidden="true" />Ends</dt><dd><time dateTime={event.endAt}>{formatEventDate(event.endAt)}</time></dd></div><div><dt><Clock3 size={17} aria-hidden="true" />Registration deadline</dt><dd><time dateTime={event.registrationDeadline}>{formatEventDate(event.registrationDeadline)}</time></dd></div><div><dt><MapPin size={17} aria-hidden="true" />Venue</dt><dd>{event.venue}</dd></div></dl>
        </section></div>
        <aside className="public-event-booking" aria-label="Event availability"><span className="public-event-ticket"><Ticket size={22} strokeWidth={1.4} aria-hidden="true" /></span><p className="eyebrow">{event.pricePaise === 0 ? 'FREE EVENT' : 'TICKET PRICE'}</p><p className="public-event-price">{formatPrice(event.pricePaise)}</p><p className="public-event-price-note">{event.pricePaise === 0 ? 'A good experience, open to all.' : 'per ticket · INR'}</p>
          <div className="public-event-inventory"><Users size={17} aria-hidden="true" /><dl><div><dt>Remaining capacity</dt><dd>{event.capacity - event.reservedCount}</dd></div><div><dt>Total capacity</dt><dd>{event.capacity}</dd></div></dl></div>
          <EventAvailability event={event} now={now} /><ReserveButton event={event} now={now} refresh={resource.reload} /><Button variant="ghost" onClick={resource.reload}><RefreshCw size={14} />Refresh availability</Button>
        </aside>
      </div>
    </>}
  </section>;
}
