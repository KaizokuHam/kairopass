import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTickets } from '@/hooks/useTickets';
import { useReservationMutation } from '@/hooks/useReservations';
import { ticketsApi } from '@/services/tickets';
import { ApiRequestError } from '@/services/api';
export function TicketAction({ reservationId }: { reservationId: string }) {
  const resource = useTickets(1, '', reservationId), mutation = useReservationMutation(), navigate = useNavigate();
  const [failure, setFailure] = useState('');
  async function generate() {
    if (mutation.pending) return;
    setFailure('');
    try { const result = await mutation.run((signal) => ticketsApi.issue(reservationId, signal)); navigate('/attendee/tickets/' + result.ticket.id); }
    catch (error) { if (error instanceof ApiRequestError && !['BUSY', 'CANCELLED'].includes(error.code)) { setFailure(error.message); resource.reload(); } }
  }
  const ticket = resource.data?.tickets[0];
  return <section className="ticket-action"><div><p className="eyebrow"><Ticket size={16} />YOUR DIGITAL PASS</p><h2>Your next experience, in your pocket.</h2><p>Generate your ticket from this confirmed reservation. Your payment and confirmation stay saved if ticket generation needs a retry.</p></div>
    {failure && <p role="alert">{failure} Check My Tickets, then explicitly retry if no ticket appears.</p>}
    {resource.loading ? <p role="status">Checking for your ticket…</p> : resource.error ? <div role="alert"><p>{resource.error.message}</p><Button onClick={resource.reload}>Retry ticket lookup</Button></div> : ticket ? <Link className="button button-primary" to={'/attendee/tickets/' + ticket.id}>View Ticket</Link> : <Button disabled={mutation.pending} onClick={() => { void generate(); }}>{mutation.pending ? 'Generating ticket…' : 'Generate Ticket'}</Button>}
    <Link className="text-link" to="/attendee/tickets">My Tickets</Link>
  </section>;
}
