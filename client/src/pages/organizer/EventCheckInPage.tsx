import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Clock3, MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QRScanner } from '@/components/checkin/QRScanner';
import { CheckInResult } from '@/components/checkin/CheckInResult';
import { useAuth } from '@/hooks/useAuth';
import { useAdmissionClock, useCheckInHistory, useCheckInSubmission } from '@/hooks/useCheckIn';
import { formatEventDate, localTimezone } from '@/lib/event-format';
export function EventCheckInPage() {
  const { id = '' } = useParams(), { user } = useAuth();
  return <EventAdmission key={(user?.id ?? '') + ':' + id} id={id} />;
}
function EventAdmission({ id }: { id: string }) {
  const [params, setParams] = useSearchParams(), raw = params.get('page') ?? '';
  const page = /^[1-9]\d{0,4}$/.test(raw) && Number(raw) <= 10000 ? Number(raw) : 1;
  const history = useCheckInHistory(id, page), data = history.data, estimatedNow = useAdmissionClock(data);
  const [manual, setManual] = useState('');
  const { reload } = history;
  const verification = useCheckInSubmission(id, reload), { submit } = verification;
  const boundaryPassed = !!data && ((data.window.state === 'NOT_OPEN' && estimatedNow >= Date.parse(data.window.opensAt)) || (data.window.state === 'OPEN' && estimatedNow >= Date.parse(data.window.closesAt)));
  const open = !!data && data.window.state === 'OPEN' && !boundaryPassed;
  useEffect(() => { if (boundaryPassed) reload(); }, [boundaryPassed, reload]);
  const detected = useCallback((text: string) => { setManual(''); void submit(text); }, [submit]);
  const idle = verification.state.phase === 'IDLE', pending = verification.state.phase === 'VERIFYING';
  function next() { setManual(''); verification.reset(); }
  return <div className="checkin-page"><Link className="text-link event-back" to={'/organizer/events/' + id}><ArrowLeft size={16} />Event details</Link>
    <header className="events-heading"><p className="eyebrow">BEHIND EVERY PASS, A PERSON</p><h1>Event check-in<span>.</span></h1><p>{data?.event.title ?? 'Verify this event’s admission context before scanning.'}</p>{data && <p className="checkin-venue"><MapPin size={16} />{data.event.venue} · {formatEventDate(data.event.startAt)}</p>}</header>
    {history.error && <div className="event-feedback" role="alert"><h2>{history.error.status === 404 ? 'Event not found.' : 'Admission context unavailable.'}</h2><p>{history.error.message}</p><Button onClick={history.reload}>Retry admission context</Button></div>}
    <div className={'checkin-window' + (open ? ' is-open' : '')}><Clock3 size={22} /><div><strong>{history.loading ? 'Loading admission context…' : !data ? 'Admission unavailable' : open ? 'Check-in is open' : data.window.state === 'NOT_OPEN' ? 'Check-in has not opened yet' : data.window.state === 'CLOSED' ? 'Check-in is closed' : data.window.state === 'CANCELLED' ? 'Event cancelled' : 'Publish this event before admitting attendees'}</strong>{data && <p>Opens {formatEventDate(data.window.opensAt)} · Closes {formatEventDate(data.window.closesAt)} · {localTimezone()}</p>}<small>Server verification decides every admission. Registration deadlines do not control entry.</small></div></div>
    <div className="checkin-workspace"><QRScanner enabled={open && idle} detected={detected} /><section className="checkin-manual"><p className="eyebrow">NO CAMERA? SAME SECURE CHECK.</p><h2>Paste the signed credential.</h2><p>Use the complete QR content from the attendee’s ticket. A ticket reference alone cannot grant entry.</p><form onSubmit={(e) => { e.preventDefault(); if (!open || !idle) return; const value = manual.trim(); setManual(''); void verification.submit(value); }}><label htmlFor="manual-qr">Signed QR credential</label><textarea id="manual-qr" value={manual} maxLength={512} autoComplete="off" spellCheck={false} disabled={!open || !idle} onChange={(e) => setManual(e.target.value)} rows={5} aria-describedby="manual-qr-help" /><small id="manual-qr-help">Handled only for this check. Never saved to browser storage or a URL.</small><Button type="submit" disabled={!open || !idle || !manual.trim()}>{pending ? 'Verifying admission…' : 'Verify & Check In'}</Button></form><div className="checkin-privacy"><ShieldCheck size={21} /><p>One ticket, one admission. Copied QRs cannot approve entry again after the first successful check-in.</p></div></section></div>
    <CheckInResult state={verification.state} next={next} retry={verification.retry} />
    <section className="checkin-history" aria-labelledby="admission-history-heading"><header><div><p className="eyebrow">PERSISTED EVENT HISTORY</p><h2 id="admission-history-heading">Successful check-ins{data ? <span> · {data.pagination.total}</span> : ''}</h2></div><Button variant="ghost" disabled={pending} onClick={history.reload}>Refresh check-in history</Button></header>
      {history.loading ? <p role="status">Loading check-in history…</p> : data && <>{!data.checkIns.length ? <p className="checkin-empty">No successful check-ins yet. Only confirmed server admissions appear here.</p> : <ol className="checkin-history-list">{data.checkIns.map((entry) => <li key={entry.ticketId}><div><strong>{entry.attendeeName}</strong><span className="checkin-reference">{entry.ticketId}</span></div><div><span className="checkin-used">USED</span><time dateTime={entry.checkedInAt}>{formatEventDate(entry.checkedInAt)}</time></div></li>)}</ol>}<nav className="reservation-pagination" aria-label="Check-in history pages"><Button variant="ghost" disabled={page <= 1 || pending} onClick={() => setParams({ page: String(page - 1) })}>Previous admissions</Button><span>Page {page} · {data.pagination.total} checked in</span><Button variant="ghost" disabled={page >= data.pagination.totalPages || pending} onClick={() => setParams({ page: String(page + 1) })}>Next admissions</Button></nav></>}
    </section>
  </div>;
}
