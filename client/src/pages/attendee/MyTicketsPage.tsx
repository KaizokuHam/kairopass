import { Link, useSearchParams } from 'react-router';
import { ArrowUpRight, CalendarDays, MapPin, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTickets } from '@/hooks/useTickets';
import { ticketStatuses, type TicketStatus } from '@/types/tickets';
import { formatEventDate, localTimezone } from '@/lib/event-format';
export function MyTicketsPage() {
  const [params, setParams] = useSearchParams(), raw = params.get('status') ?? '';
  const status = ticketStatuses.includes(raw as TicketStatus) ? raw as TicketStatus : '';
  const page = /^[1-9]\d{0,4}$/.test(params.get('page') ?? '') && Number(params.get('page')) <= 10000 ? Number(params.get('page')) : 1;
  const resource = useTickets(page, status), data = resource.data;
  function update(next: number, filter = status) { setParams({ page: String(next), ...(filter ? { status: filter } : {}) }); }
  return <div className="reservations-page tickets-page"><header className="reservation-heading"><p className="eyebrow">GOOD THINGS AHEAD</p><h1>My Tickets<span>.</span></h1><p>Your experiences, ready to go. Times shown in {localTimezone()}.</p></header>
    <div className="reservation-toolbar"><label>Status<select value={status} onChange={(e) => update(1, e.target.value as TicketStatus | '')}><option value="">All tickets</option>{ticketStatuses.map((s) => <option key={s} value={s}>{s === 'ISSUED' ? 'Issued' : s === 'USED' ? 'Used' : 'Revoked'}</option>)}</select></label><Button variant="ghost" onClick={resource.reload}>Refresh tickets</Button></div>
    {resource.loading ? <div className="reservation-feedback" role="status">Loading tickets…</div> : resource.error ? <div className="reservation-feedback" role="alert"><h2>We couldn’t load your tickets.</h2><p>{resource.error.message}</p><Button onClick={resource.reload}>Retry loading tickets</Button></div> : data && <>
      {!data.tickets.length ? <div className="reservation-feedback"><Ticket size={34} /><h2>{status ? 'No tickets with this status.' : 'Your next experience belongs here.'}</h2><p>Generate a ticket from a confirmed reservation, or discover something new.</p><div className="ticket-empty-actions"><Link className="button button-primary" to="/events">Explore Events</Link><Link className="text-link" to="/attendee/reservations">My Reservations</Link></div></div> : <div className="ticket-wallet">{data.tickets.map((ticket) => <article className="ticket-wallet-card" key={ticket.id}><div className="ticket-wallet-icon"><Ticket size={29} /><span>KAIROPASS</span></div><div><span className={'ticket-status is-' + ticket.status.toLowerCase()}>{ticket.status === 'USED' ? 'Already Used' : ticket.status}</span><h2>{ticket.event?.title ?? 'Event details unavailable'}</h2><p><MapPin size={15} />{ticket.event?.venue ?? 'Ticket history preserved'}</p>{ticket.event && <p><CalendarDays size={15} />{formatEventDate(ticket.event.startAt)}</p>}<small className="ticket-reference">{ticket.id}</small>{!ticket.qrAvailable && <p className="reservation-muted">{ticket.status === 'ISSUED' ? 'Admission unavailable. Open your ticket for details.' : 'Historical ticket · no active QR'}</p>}</div><Link className="text-link" to={'/attendee/tickets/' + ticket.id}>View Ticket<ArrowUpRight size={17} /></Link></article>)}</div>}
      <nav className="reservation-pagination" aria-label="Ticket pages"><Button variant="ghost" disabled={page <= 1} onClick={() => update(page - 1)}>Previous</Button><span>Page {page} · {data.pagination.total} tickets</span><Button variant="ghost" disabled={page >= data.pagination.totalPages} onClick={() => update(page + 1)}>Next</Button></nav>
    </>}
  </div>;
}
