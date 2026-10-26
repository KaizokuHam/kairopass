import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useReservationMutation, uncertainReservation } from '@/hooks/useReservations';
import { reservationsApi } from '@/services/reservations';
import { ApiRequestError } from '@/services/api';
import { eventAvailability } from '@/lib/event-availability';
import { Button } from '@/components/ui/button';
import type { PublicEvent } from '@/types/discovery';

export function ReserveButton({ event, now, refresh }: { event: PublicEvent; now: number; refresh: () => void }) {
  const { status, user } = useAuth();
  return <ReserveControl key={status + ':' + (user?.id ?? '')} event={event} now={now} refresh={refresh} />;
}
function ReserveControl({ event, now, refresh }: { event: PublicEvent; now: number; refresh: () => void }) {
  const { status, user, refreshSession } = useAuth(), mutation = useReservationMutation();
  const location = useLocation(), navigate = useNavigate();
  const [failure, setFailure] = useState<ApiRequestError | null>(null);
  const available = eventAvailability(event, now).kind === 'open';
  async function reserve() {
    if (mutation.pending || failure) return;
    try {
      const data = await mutation.run((signal) => reservationsApi.create(event.id, signal));
      refresh();
      void navigate('/attendee/reservations/' + data.reservation.id);
    } catch (error) { if (error instanceof ApiRequestError && !['BUSY', 'CANCELLED'].includes(error.code)) setFailure(error); }
  }
  if (status === 'INITIALIZING') return <Button disabled className="public-event-reserve">Checking account…</Button>;
  if (status === 'UNAVAILABLE') return <><p className="public-event-booking-note">Your account could not be verified.</p><Button onClick={() => { void refreshSession(); }}>Retry account check</Button></>;
  if (user?.role === 'ORGANIZER') return <p className="public-event-booking-note">Reservations require an attendee account. You’re signed in as an organizer.</p>;
  return <>
    {status === 'UNAUTHENTICATED' && available ? <Link className="button button-primary public-event-reserve" to="/login" state={{ from: location.pathname + location.search }}>Sign in to Reserve</Link>
      : <Button className="public-event-reserve" disabled={!available || mutation.pending || !!failure} onClick={() => { void reserve(); }}>{mutation.pending ? 'Reserving…' : available ? 'Reserve Ticket' : 'Reservations unavailable'}</Button>}
    <p className="public-event-booking-note">A reservation holds one ticket for 10 minutes. Availability is checked again when you reserve.</p>
    {failure && <div className="reservation-error" role="alert"><p>{uncertainReservation(failure) ? 'This operation may have completed. Check My Reservations before trying again.' : failure.message}</p></div>}
    {user?.role === 'ATTENDEE' && <Link className="text-link" to="/attendee/reservations">Check My Reservations</Link>}
  </>;
}
