import { Link, useSearchParams } from 'react-router';
import { ArrowRight, CalendarDays, MapPin, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReservationStatusBadge } from '@/components/reservations/ReservationStatusBadge';
import { reservationStatusLabel } from '@/lib/reservation-format';
import { useReservations } from '@/hooks/useReservations';
import { reservationStatuses, type ReservationStatus } from '@/types/reservations';
import { formatEventDate, formatPrice, localTimezone } from '@/lib/event-format';

export function MyReservationsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('status') ?? '', status = reservationStatuses.includes(raw as ReservationStatus) ? raw as ReservationStatus : '';
  const page = /^[1-9]\d{0,4}$/.test(params.get('page') ?? '') && Number(params.get('page')) <= 10_000 ? Number(params.get('page')) : 1;
  const resource = useReservations(page, status), data = resource.data;
  function update(nextPage: number, nextStatus = status) { setParams({ page: String(nextPage), ...(nextStatus ? { status: nextStatus } : {}) }); }
  return <div className="reservations-page"><header className="reservation-heading"><p className="eyebrow"><span className="eyebrow-line" />A LITTLE ROOM FOR WHAT’S NEXT</p><h1>My Reservations<span>.</span></h1><p>Your holds and history, all in one place. Times shown in {localTimezone()}.</p></header>
    <div className="reservation-toolbar"><label>Status<select value={status} onChange={(event) => update(1, event.target.value as ReservationStatus | '')}><option value="">All reservations</option>{reservationStatuses.map((value) => <option key={value} value={value}>{reservationStatusLabel[value]}</option>)}</select></label><Button variant="ghost" onClick={resource.reload}>Refresh reservations</Button></div>
    {resource.loading ? <div className="reservation-feedback" role="status">Loading reservations…</div> : resource.error ? <div className="reservation-feedback" role="alert"><h2>We couldn’t load your reservations.</h2><p>{resource.error.message}</p><Button onClick={resource.reload}>Retry loading reservations</Button></div> : data && <>
      {!data.reservations.length ? <div className="reservation-feedback"><Ticket size={30} /><h2>{status ? 'No reservations with this status.' : 'Your next experience starts here.'}</h2><p>{status ? 'Try another status to see your reservation history.' : 'Explore upcoming events and hold one ticket for 10 minutes.'}</p><Link className="button button-primary" to="/events">Explore Events<ArrowRight size={15} /></Link></div> : <div className="reservation-list">{data.reservations.map((reservation) => <article className="reservation-card" key={reservation.id}><div><ReservationStatusBadge status={reservation.status} /><h2>{reservation.event?.title ?? 'Event details unavailable'}</h2><p><MapPin size={15} />{reservation.event?.venue ?? 'The reservation remains in your history.'}</p>{reservation.event && <p><CalendarDays size={15} /><time dateTime={reservation.event.startAt}>{formatEventDate(reservation.event.startAt)}</time></p>}{reservation.status === 'HELD' && <p>Hold deadline: {formatEventDate(reservation.expiresAt)}</p>}</div><div className="reservation-card-action"><strong>{formatPrice(reservation.amountPaise)}</strong><Link className="text-link" to={'/attendee/reservations/' + reservation.id}>View Details<ArrowRight size={15} /></Link></div></article>)}</div>}
      <nav className="reservation-pagination" aria-label="Reservation pages"><Button variant="ghost" disabled={page <= 1} onClick={() => update(page - 1)}>Previous</Button><span>Page {page} · {data.pagination.total} reservations</span><Button variant="ghost" disabled={page >= data.pagination.totalPages} onClick={() => update(page + 1)}>Next</Button></nav>
    </>}
  </div>;
}
