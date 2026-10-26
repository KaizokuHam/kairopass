import { CircleCheck, CircleHelp, CircleX, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatEventDate } from '@/lib/event-format';
import type { VerificationState } from '@/types/checkin';
import { useEffect, useRef } from 'react';
export function CheckInResult({ state, next, retry }: { state: VerificationState; next: () => void; retry: () => void }) {
  const result = useRef<HTMLElement>(null);
  useEffect(() => { if (state.phase !== 'IDLE' && state.phase !== 'VERIFYING') result.current?.focus(); }, [state.phase]);
  if (state.phase === 'IDLE') return <section className="checkin-result is-idle" aria-live="polite"><CircleHelp size={28} /><div><h2>Ready for the next arrival.</h2><p>Scan a QR or paste its complete signed credential. Only a confirmed server result approves entry.</p></div></section>;
  if (state.phase === 'VERIFYING') return <section className="checkin-result is-verifying" role="status"><LoaderCircle className="checkin-spinner" size={34} /><div><h2>Verifying admission…</h2><p>Camera paused. Wait for the server before admitting anyone.</p></div></section>;
  const approved = state.phase === 'APPROVED', uncertain = state.phase === 'UNCERTAIN';
  const heading = approved ? 'Entry Approved' : uncertain ? 'Admission Not Confirmed' : state.code === 'TICKET_ALREADY_USED' ? 'Already Checked In — Entry Denied' : state.code === 'TICKET_REVOKED' ? 'Ticket Revoked — Entry Denied' :
    ['CHECKIN_NOT_OPEN', 'CHECKIN_CLOSED', 'EVENT_CANCELLED', 'EVENT_NOT_PUBLISHED'].includes(state.code) ? 'Check-In Not Available at This Time' : state.code === 'RATE_LIMITED' ? 'Verification Paused' : ['INVALID_QR_PAYLOAD', 'INVALID_TICKET'].includes(state.code) ? 'Invalid Ticket — Entry Denied' : 'Entry Denied';
  const Icon = approved ? CircleCheck : uncertain ? CircleHelp : CircleX;
  return <section ref={result} tabIndex={-1} className={'checkin-result is-' + (approved ? 'approved' : uncertain ? 'uncertain' : 'rejected')} role={approved ? 'status' : 'alert'}><Icon size={42} /><div><p className="eyebrow">{approved ? 'ADMISSION RECORDED' : uncertain ? 'CHECK THE PERSISTED HISTORY' : 'DO NOT ADMIT THIS PRESENTATION'}</p><h2>{heading}</h2>{approved ? <><strong>{state.result.attendeeName}</strong><p>{state.result.eventTitle}</p><p className="checkin-reference">{state.result.ticketId}</p><p>Checked in {formatEventDate(state.result.checkedInAt)}</p></> : <><p>{uncertain ? 'The request may have completed. Do not assume approval or rejection. Check history, or explicitly retry the same credential.' : state.message}</p>{state.checkedInAt && <p>Previously checked in {formatEventDate(state.checkedInAt)}</p>}</>}
    <div className="checkin-controls"><Button onClick={next}>Scan Next Ticket</Button>{uncertain && <Button variant="ghost" onClick={retry}>Retry same credential</Button>}</div></div></section>;
}
