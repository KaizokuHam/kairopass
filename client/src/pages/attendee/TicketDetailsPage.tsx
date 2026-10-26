import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Download, MapPin, ShieldCheck, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TicketQr } from '@/components/tickets/TicketQr';
import { useTicket } from '@/hooks/useTickets';
import { useAuth } from '@/hooks/useAuth';
import { downloadTicket } from '@/lib/ticket-qr';
import { formatEventDate, formatPrice, localTimezone } from '@/lib/event-format';
const inactive: Record<string, string> = { USED: 'This ticket has already been used.', REVOKED: 'This ticket has been revoked.', EVENT_CANCELLED: 'The event has been cancelled.', EVENT_UNAVAILABLE: 'The event is unavailable.', RESERVATION_INVALID: 'The reservation is no longer confirmed.', PAYMENT_UNVERIFIED: 'Payment evidence could not be verified. Please try again later.' };
export function TicketDetailsPage() {
  const { id = '' } = useParams(), { user } = useAuth();
  return <TicketDetails key={(user?.id ?? '') + ':' + id} id={id} />;
}
function TicketDetails({ id }: { id: string }) {
  const resource = useTicket(id), { user } = useAuth(), ticket = resource.data?.ticket;
  const [exporting, setExporting] = useState(false), [error, setError] = useState(''), active = useRef<AbortController | null>(null);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; active.current?.abort(); }; }, []);
  // Hide the credential immediately whenever a refresh or identity change invalidates its scope.
  useEffect(() => { if (!ticket) active.current?.abort(); }, [ticket]);
  async function download() {
    if (!ticket || !user || active.current) return;
    const controller = new AbortController(); active.current = controller; setExporting(true); setError('');
    try { await downloadTicket(ticket, user.name, controller.signal); }
    catch { if (!controller.signal.aborted) setError('We couldn’t export your ticket. Please retry the download.'); }
    finally { if (active.current === controller) { active.current = null; if (alive.current) setExporting(false); } }
  }
  return <div className="reservations-page tickets-page"><Link className="text-link" to="/attendee/tickets"><ArrowLeft size={16} />My Tickets</Link>
    {resource.loading ? <div className="reservation-feedback" role="status">Loading ticket…</div> : resource.error ? <div className="reservation-feedback" role="alert"><h1>{resource.error.status === 404 ? 'Ticket not found.' : 'We couldn’t load your ticket.'}</h1><p>{resource.error.message}</p><Button onClick={resource.reload}>Retry loading ticket</Button></div> : ticket && <>
      <header className="reservation-heading"><p className="eyebrow">A LITTLE ROOM FOR MEMORIES</p><h1>Your digital ticket<span>.</span></h1><p>Keep this pass private. Bring it with you to the event.</p></header>
      <article className="digital-ticket"><div className="digital-ticket-main"><div className="digital-ticket-brand"><Ticket size={26} /><strong>KairoPass<span> / ADMIT ONE</span></strong><span className={'ticket-status is-' + ticket.status.toLowerCase()}>{ticket.status === 'USED' ? 'Already Used' : ticket.status}</span></div><h2>{ticket.event?.title ?? 'Event details unavailable'}</h2><p className="ticket-venue"><MapPin size={18} />{ticket.event?.venue ?? 'Your ticket history is preserved.'}</p><dl><div><dt>ATTENDEE</dt><dd>{user?.name}</dd></div><div><dt>ADMISSION</dt><dd>{formatPrice(ticket.amountPaise)} · One person</dd></div>{ticket.event && <><div><dt>STARTS · {localTimezone()}</dt><dd>{formatEventDate(ticket.event.startAt)}</dd></div><div><dt>ENDS</dt><dd>{formatEventDate(ticket.event.endAt)}</dd></div></>}<div><dt>TICKET REFERENCE</dt><dd className="ticket-reference">{ticket.id}</dd></div>{ticket.checkedInAt && <div><dt>CHECKED IN</dt><dd>{formatEventDate(ticket.checkedInAt)}</dd></div>}</dl><Link className="text-link" to={'/attendee/reservations/' + ticket.reservationId}>View reservation</Link></div>
        <div className="digital-ticket-stub">{ticket.qrAvailable && ticket.qrPayload ? <><p className="eyebrow">YOUR ENTRY PASS</p><TicketQr payload={ticket.qrPayload} /><p><ShieldCheck size={16} />Signed by KairoPass</p><small>Admission requires live validation at the venue.</small></> : <div className="ticket-inactive"><ShieldCheck size={30} /><h3>No active QR</h3><p>{inactive[ticket.admissionState] ?? 'This ticket is unavailable for admission.'}</p></div>}</div>
      </article><div className="ticket-controls">{ticket.qrAvailable && <Button disabled={exporting} onClick={() => { void download(); }}><Download size={17} />{exporting ? 'Preparing ticket…' : 'Download Ticket PNG'}</Button>}<Button variant="ghost" onClick={resource.reload}>Refresh ticket</Button></div>{error && <p className="reservation-error" role="alert">{error}</p>}
      <p className="ticket-privacy">A copied QR can be presented by someone else. Share your ticket only with trusted people. A valid signature alone does not guarantee admission.</p>
    </>}
  </div>;
}
