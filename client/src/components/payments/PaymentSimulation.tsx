import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Check, FlaskConical, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePaymentHistory, usePaymentRecovery } from '@/hooks/usePayment';
import type { useReservationMutation } from '@/hooks/useReservations';
import { paymentsApi, paymentKeyPattern } from '@/services/payments';
import { ApiRequestError } from '@/services/api';
import { formatEventDate, formatPrice } from '@/lib/event-format';
import { paymentFailureMessage } from '@/lib/payment-format';
import type { ReservationSnapshot } from '@/types/reservations';
import type { LogicalPayment, PaymentAttempt, PaymentResult, SimulationOutcome } from '@/types/payments';
import { PaymentStatusBadge } from './PaymentStatusBadge';

export function PaymentSimulation({ snapshot, remaining, run, pending, changed }: {
  snapshot: ReservationSnapshot; remaining: number; run: ReturnType<typeof useReservationMutation>['run'];
  pending: boolean; changed: (result?: PaymentResult) => void;
}) {
  const reservation = snapshot.reservation, id = reservation.id;
  const [page, setPage] = useState(1), [outcome, setOutcome] = useState<SimulationOutcome>('SUCCESS');
  const [failure, setFailure] = useState<ApiRequestError | null>(null), [message, setMessage] = useState('');
  const history = usePaymentHistory(id, page), recovery = usePaymentRecovery(), saved = recovery.attempts[id];
  const alive = useRef(false), lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (history.data && history.data.reservation.status !== reservation.status) changed();
  }, [history.data, reservation.status, changed]);
  const serverPending = history.data?.payments.find((payment) => payment.status === 'PENDING' && payment.simulationOutcome && paymentKeyPattern.test(payment.idempotencyKey));
  const unresolved: LogicalPayment | undefined = saved && ['UNCERTAIN', 'PENDING'].includes(saved.phase) ? saved : serverPending ? {
    key: serverPending.idempotencyKey, outcome: serverPending.simulationOutcome!, phase: 'PENDING', paymentId: serverPending.id
  } : undefined;
  const successful = history.data?.payments.find((payment) => payment.status === 'SUCCESS');
  const lastFailed = history.data?.payments.find((payment) => payment.status === 'FAILED');
  const eligible = reservation.status === 'HELD' && remaining > 0 && reservation.event?.status === 'PUBLISHED';
  const rememberResult = (logical: LogicalPayment, result: PaymentResult) => {
    recovery.remember(id, { ...logical, phase: result.payment.status, paymentId: result.payment.id });
  };
  async function process(logical?: LogicalPayment) {
    if (lock.current || pending || (!logical && (!eligible || history.loading || history.error || unresolved))) return;
    lock.current = true; setFailure(null); setMessage('');
    try {
      const attempt = logical ?? { key: crypto.randomUUID(), outcome, phase: 'UNCERTAIN' as const };
      // Save BEFORE sending. Navigation, timeout and malformed responses retain this logical attempt.
      recovery.remember(id, { ...attempt, phase: 'UNCERTAIN' });
      const result = await run((signal) => paymentsApi.process(id, attempt.key, attempt.outcome, signal));
      rememberResult(attempt, result);
      if (alive.current) { history.reload(); changed(result); }
    } catch (error) {
      const errorResult = error instanceof ApiRequestError ? error : new ApiRequestError('Checkout could not start securely. Reload the page and try again.', undefined, 'PAYMENT_UNAVAILABLE');
      if (alive.current && !['BUSY', 'CANCELLED'].includes(errorResult.code)) setFailure(errorResult);
    } finally { lock.current = false; }
  }
  async function check() {
    if (!unresolved || lock.current || pending) return;
    lock.current = true; setFailure(null); setMessage('');
    try {
      const attempt = unresolved;
      const result = await run(async (signal) => {
        if (attempt.paymentId) return paymentsApi.get(id, attempt.paymentId, signal);
        const list = await paymentsApi.history(id, 1, signal, attempt.key);
        const payment = list.payments.find((item) => item.idempotencyKey === attempt.key);
        return payment ? { ...list, payment } : null;
      });
      if (!alive.current) return;
      if (result) { rememberResult(attempt, result); history.reload(); changed(result); }
      else setMessage('No attempt is visible yet. Resume the same attempt to safely create or finish it with its original key.');
    } catch (error) { if (alive.current && error instanceof ApiRequestError && !['BUSY', 'CANCELLED'].includes(error.code)) setFailure(error); }
    finally { lock.current = false; }
  }
  return <section className="payment-section" aria-labelledby="payment-heading"><header className="payment-heading"><span><FlaskConical size={19} aria-hidden="true" />DEMONSTRATION CHECKOUT</span><h2 id="payment-heading">{reservation.status === 'CONFIRMED' ? 'Reservation Confirmed' : 'A little closer to being there.'}</h2><p>No money will be collected. These payment outcomes are simulated and saved to your reservation history.</p></header>
    {reservation.status === 'CONFIRMED' ? <div className="payment-result is-success" role="status"><Check size={20} /><div><h3>Reservation Confirmed</h3><p>Your confirmation is persisted. Digital ticket generation is the next milestone.</p>{successful && <><p>Simulated transaction <strong className="payment-reference">{successful.transactionId}</strong></p><p>{formatPrice(successful.amountPaise)}{successful.completedAt && <> · Confirmed {formatEventDate(successful.completedAt)}</>}</p></>}</div></div>
      : reservation.status === 'EXPIRED' ? <div className="payment-result"><h3>Your reservation hold has expired.</h3><p>Checkout is closed. You can reserve again if capacity remains.</p><Link className="text-link" to={'/events/' + reservation.eventId}>Return to event</Link></div>
        : reservation.status === 'CANCELLED' ? <div className="payment-result"><h3>This reservation is cancelled.</h3><p>Checkout is closed.</p></div> : <>
          {lastFailed && !unresolved && <div className="payment-result is-failed" role="status"><h3>Simulated Payment Failed</h3><p>{paymentFailureMessage[lastFailed.failureReason ?? 'UNKNOWN_FAILURE']}</p></div>}
          {!unresolved && <div className="payment-checkout"><div className="payment-cost"><span>{reservation.amountPaise === 0 ? 'FREE RESERVATION' : 'SIMULATED TOTAL'}</span><strong>{formatPrice(reservation.amountPaise)}</strong><small>One ticket · no real charge</small></div><fieldset disabled={pending || !eligible || history.loading || !!history.error}><legend>Choose a simulated outcome</legend><label><input type="radio" name={'payment-outcome-' + id} checked={outcome === 'SUCCESS'} onChange={() => setOutcome('SUCCESS')} />Simulate Successful Payment</label><label><input type="radio" name={'payment-outcome-' + id} checked={outcome === 'FAILURE'} onChange={() => setOutcome('FAILURE')} />Simulate Failed Payment</label></fieldset><Button disabled={pending || !eligible || history.loading || !!history.error} onClick={() => { void process(); }}>{pending ? 'Processing simulated payment…' : reservation.amountPaise === 0 ? 'Confirm Free Reservation' : lastFailed ? 'Retry Payment' : 'Run Simulated Payment'}</Button></div>}
        </>}
    {unresolved && <div className="payment-recovery" role="status"><h3>{pending ? 'Processing simulated payment…' : unresolved.phase === 'PENDING' ? 'Payment attempt pending' : 'Payment outcome is uncertain'}</h3><p>{unresolved.phase === 'PENDING' ? 'The original request is persisted. Check its status or safely resume it.' : 'An interrupted response does not prove success or failure. Keep this original attempt until its status is known.'}</p><div><Button variant="ghost" disabled={pending} onClick={() => { void check(); }}>Check payment status</Button><Button disabled={pending} onClick={() => { void process(unresolved); }}>{reservation.status === 'HELD' && remaining > 0 ? 'Resume same payment attempt' : 'Resolve pending attempt'}</Button></div></div>}
    {message && <p role="status" className="payment-notice">{message}</p>}
    {failure && <div className="reservation-error" role="alert"><p>{failure.message}</p><p>The payment outcome is unverified. Check its status before resuming the same attempt.</p></div>}
    <section className="payment-history" aria-labelledby="payment-history-heading"><header><h3 id="payment-history-heading">Payment history</h3><Button variant="ghost" disabled={pending} onClick={history.reload}><RefreshCw size={13} />Refresh payments</Button></header>
      {history.loading ? <p role="status">Loading payment history…</p> : history.error ? <div role="alert"><p>{history.error.message}</p><Button onClick={history.reload}>Retry payment history</Button></div> : history.data && <>
        {!history.data.payments.length ? <p>{history.data.pagination.total ? 'No payment attempts on this page.' : 'No payment attempts yet.'}</p> : <div className="payment-attempts">{history.data.payments.map((payment: PaymentAttempt) => <article key={payment.id} aria-label={'Payment ' + payment.transactionId}><div><PaymentStatusBadge status={payment.status} /><strong>{formatPrice(payment.amountPaise)}</strong></div><p className="payment-reference">{payment.transactionId}</p><p>{formatEventDate(payment.createdAt)}</p>{payment.failureReason && <p>{paymentFailureMessage[payment.failureReason]}</p>}{payment.status === 'PENDING' && payment.simulationOutcome && paymentKeyPattern.test(payment.idempotencyKey) && <Button variant="ghost" disabled={pending} onClick={() => { void process({ key: payment.idempotencyKey, outcome: payment.simulationOutcome!, paymentId: payment.id, phase: 'PENDING' }); }}>Resolve this pending attempt</Button>}</article>)}</div>}
        <nav className="reservation-pagination" aria-label="Payment history pages"><Button variant="ghost" disabled={pending || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous payments</Button><span>Page {page} · {history.data.pagination.total} attempts</span><Button variant="ghost" disabled={pending || page >= history.data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next payments</Button></nav>
      </>}
    </section>
  </section>;
}
