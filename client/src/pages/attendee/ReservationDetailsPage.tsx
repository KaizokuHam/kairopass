import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Clock3, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/events/ConfirmActionDialog';
import { ReservationStatusBadge } from '@/components/reservations/ReservationStatusBadge';
import { HoldCountdown } from '@/components/reservations/HoldCountdown';
import { useHoldClock } from '@/hooks/useHoldClock';
import { useReservation, useReservationMutation, uncertainReservation } from '@/hooks/useReservations';
import { reservationsApi } from '@/services/reservations';
import { ApiRequestError } from '@/services/api';
import { formatEventDate, formatPrice, localTimezone } from '@/lib/event-format';

export function ReservationDetailsPage() {
  const { id = '' } = useParams();
  return <ReservationDetails key={id} id={id} />;
}
function ReservationDetails({ id }: { id: string }) {
  const resource = useReservation(id), mutation = useReservationMutation();
  const [dialog, setDialog] = useState(false), [failure, setFailure] = useState<ApiRequestError | null>(null), [notice, setNotice] = useState('');
  const snapshot = resource.data, reservation = snapshot?.reservation, remaining = useHoldClock(snapshot);
  async function cancel() {
    if (mutation.pending || !reservation || remaining <= 0) return;
    try {
      const result = await mutation.run((signal) => reservationsApi.cancel(id, signal));
      setDialog(false); setFailure(null);
      setNotice(result.reservation.status === 'CANCELLED' ? 'Your hold was cancelled. Capacity has been released.' : 'The server confirmed that your hold has expired.');
      resource.reload();
    } catch (error) { if (error instanceof ApiRequestError && !['BUSY', 'CANCELLED'].includes(error.code)) { setFailure(error); setDialog(false); } }
  }
  function refresh() { setDialog(false); setFailure(null); resource.reload(); }
  function expired() { setDialog(false); resource.reload(); }
  return <div className="reservations-page"><Link className="text-link" to="/attendee/reservations"><ArrowLeft size={16} />My Reservations</Link>
    {notice && <p role="status" className="reservation-notice">{notice}</p>}
    {resource.loading ? <div className="reservation-feedback" role="status">Loading reservation…</div> : resource.error ? <div className="reservation-feedback" role="alert"><h1>{resource.error.status === 404 ? 'Reservation not found.' : 'We couldn’t load this reservation.'}</h1><p>{resource.error.message}</p><Button onClick={refresh}>Retry loading reservation</Button></div> : reservation && <>
      <header className="reservation-heading"><p className="eyebrow">YOUR NEXT EXPERIENCE</p><h1>{reservation.event?.title ?? 'Event details unavailable'}</h1><ReservationStatusBadge status={reservation.status} /><p><MapPin size={16} />{reservation.event?.venue ?? 'Your reservation history is preserved.'}</p></header>
      <div className="reservation-detail-grid"><section className="reservation-information"><h2>The details that matter.</h2><p className="reservation-muted">Times shown in {localTimezone()}.</p><dl><div><dt>Reservation reference</dt><dd className="reservation-reference">{reservation.id}</dd></div><div><dt>Amount</dt><dd>{formatPrice(reservation.amountPaise)}</dd></div>{reservation.event && <><div><dt>Event starts</dt><dd>{formatEventDate(reservation.event.startAt)}</dd></div><div><dt>Event ends</dt><dd>{formatEventDate(reservation.event.endAt)}</dd></div><div><dt>Event status</dt><dd>{reservation.event.status === 'CANCELLED' ? 'Cancelled by organizer' : reservation.event.status === 'PUBLISHED' ? 'Published' : 'Draft'}</dd></div></>}<div><dt>Created</dt><dd>{formatEventDate(reservation.createdAt)}</dd></div><div><dt>Hold deadline</dt><dd>{formatEventDate(reservation.expiresAt)}</dd></div></dl><Button variant="ghost" disabled={mutation.pending} onClick={refresh}>Refresh reservation</Button></section>
        <aside className="reservation-hold-panel"><Clock3 size={25} aria-hidden="true" />{reservation.status === 'HELD' ? <><HoldCountdown remaining={remaining} expired={expired} /><p>Payment processing will be available in the next milestone.</p><p className="reservation-muted">This is a temporary hold for one ticket.</p><Button className="button-danger" disabled={remaining <= 0 || mutation.pending || !!failure} onClick={() => setDialog(true)}>{mutation.pending ? 'Cancelling…' : 'Cancel hold'}</Button></> : <><h2>{reservation.status === 'EXPIRED' ? 'A little room for a new plan.' : reservation.status === 'CANCELLED' ? 'Your hold is cancelled.' : 'Your reservation is confirmed.'}</h2><p>{reservation.status === 'CONFIRMED' ? 'This reservation no longer has a hold countdown.' : 'This reservation remains in your history. Explore events to reserve again.'}</p><Link className="button button-primary" to="/events">Explore Events</Link></>}</aside>
      </div>
      {failure && <div className="reservation-error" role="alert"><p>{uncertainReservation(failure) ? 'This operation may have completed. Check My Reservations or refresh this reservation before trying again.' : failure.message}</p><Button onClick={refresh}>Refresh reservation state</Button></div>}
      {dialog && <ConfirmActionDialog title="Cancel this hold?" confirmLabel="Cancel hold" dismissLabel="Keep reservation" danger pending={mutation.pending} blocked={remaining <= 0} close={() => setDialog(false)} confirm={() => { void cancel(); }}><p>Release your ticket hold for {reservation.event?.title ?? 'this event'}? You can reserve again if capacity is available.</p>{remaining <= 0 && <p>The deadline has passed. Refreshing the server state.</p>}</ConfirmActionDialog>}
    </>}
  </div>;
}
