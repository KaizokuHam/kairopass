import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthProvider } from '@/context/AuthProvider';
import { PaymentRecoveryProvider } from '@/context/PaymentRecoveryProvider';
import { usePaymentRecovery } from '@/hooks/usePayment';
import { useAuth } from '@/hooks/useAuth';
import type { PaymentAttempt } from '@/types/payments';
import type { AttendeeReservation } from '@/types/reservations';
import { attendee, deferred, failure, json, userResponse } from './fixtures';
import { held, reservationResponse } from './reservations-fixtures';
import { confirmed, failedPayment, paymentHistory, paymentKey, paymentResponse, pendingPayment, successPayment } from './payments-fixtures';
const base = '/api/reservations/' + held.id + '/payments', details = '/attendee/reservations/' + held.id;
function Probe() { const navigate = useNavigate(); return <><button onClick={() => { void navigate('/attendee/dashboard'); }}>Leave checkout</button><button onClick={() => { void navigate(details); }}>Return to checkout</button></>; }
function show() { return render(<MemoryRouter useTransitions={false} initialEntries={[details]}><AuthProvider><App /><Probe /></AuthProvider></MemoryRouter>); }
function boundary(options: {
  reservation?: AttendeeReservation;
  payments?: PaymentAttempt[];
  process?: (init: RequestInit) => Response | Promise<Response>;
  history?: (path: string) => Response | Promise<Response>;
  me?: () => Response;
} = {}) {
  let reservation = options.reservation ?? held, payments = options.payments ?? [];
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path === '/api/auth/me') return options.me?.() ?? userResponse();
    if (path === '/api/auth/logout') return json({ success: true, message: 'Logged out successfully.' });
    if (path === '/api/health') return json({ success: true, message: 'KairoPass API is running' });
    if (path === '/api/reservations/' + held.id) return reservationResponse(reservation);
    if (path.startsWith(base) && init.method === 'POST') {
      if (options.process) return options.process(init);
      const input = JSON.parse(init.body as string), key = (init.headers as Record<string, string>)['Idempotency-Key'];
      const previous = payments.find((payment) => payment.idempotencyKey === key);
      if (previous) return paymentResponse(previous, reservation);
      const payment: PaymentAttempt = { ...(input.simulationOutcome === 'SUCCESS' ? successPayment : failedPayment),
        id: '807f1f77bcf86cd7994390' + String(payments.length + 11), idempotencyKey: key!, amountPaise: reservation.amountPaise,
        transactionId: 'sim_attempt_' + String(payments.length + 1) };
      payments = [payment, ...payments]; if (payment.status === 'SUCCESS') reservation = { ...reservation, status: 'CONFIRMED' };
      return paymentResponse(payment, reservation);
    }
    if (path.startsWith(base + '?')) return options.history?.(path) ?? paymentHistory(payments.filter((payment) => !path.includes('idempotencyKey=') || new URL(path, 'https://example.test').searchParams.get('idempotencyKey') === payment.idempotencyKey), {}, reservation);
    if (path.startsWith(base + '/')) return paymentResponse(payments.find((payment) => path.endsWith(payment.id)) ?? pendingPayment, reservation);
    throw new Error('Unexpected test HTTP path: ' + path);
  });
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, update: (next: AttendeeReservation, attempts: PaymentAttempt[]) => { reservation = next; payments = attempts; } };
}
const posts = (fetcher: ReturnType<typeof boundary>['fetcher']) => fetcher.mock.calls.filter(([path, init]) => path === base && init.method === 'POST');
const requestKey = (init: RequestInit) => (init.headers as Record<string, string>)['Idempotency-Key'];
async function readyCheckout(name = 'Run Simulated Payment') {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled()); return button;
}

describe('simulated checkout product flow', () => {
  it('shows the real hold countdown, exact cost and explicit simulation choices without financial fields', async () => {
    boundary(); show(); await readyCheckout();
    await screen.findByText('No payment attempts yet.');
    expect(screen.getByRole('timer')).toHaveTextContent('10:00');
    expect(screen.getByRole('radio', { name: 'Simulate Successful Payment' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Simulate Failed Payment' })).toBeEnabled();
    expect(screen.getByText(/No money will be collected. These payment outcomes/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/card|CVV|UPI PIN/i)).not.toBeInTheDocument();
    expect(screen.getByText('No payment attempts yet.')).toBeInTheDocument();
  });
  it('persists success through the typed API, updates confirmation and shows the transaction reference', async () => {
    const { fetcher } = boundary(); show(); await userEvent.click(await readyCheckout());
    expect(await screen.findByText('Confirmed', { selector: '.reservation-status' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Reservation Confirmed', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByText('sim_attempt_1').length).toBeGreaterThan(0);
    expect(screen.getByText(/Digital ticket generation is the next milestone/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run Simulated Payment' })).not.toBeInTheDocument();
    expect(posts(fetcher)).toHaveLength(1); expect(requestKey(posts(fetcher)[0]![1])).toMatch(/^[a-f\d-]{36}$/i);
    expect(JSON.parse(posts(fetcher)[0]![1].body as string)).toEqual({ simulationOutcome: 'SUCCESS' });
  });
  it('failed simulation preserves HELD and a deliberate retry uses a new key and retains both records', async () => {
    const { fetcher } = boundary(); show();
    await userEvent.click(await screen.findByRole('radio', { name: 'Simulate Failed Payment' }));
    await userEvent.click(screen.getByRole('button', { name: 'Run Simulated Payment' }));
    await screen.findByRole('heading', { name: 'Simulated Payment Failed' });
    expect(screen.getByText('Awaiting Payment')).toBeInTheDocument();
    await userEvent.click(await readyCheckout('Retry Payment'));
    await screen.findByText('Confirmed', { selector: '.reservation-status' });
    expect(requestKey(posts(fetcher)[0]![1])).not.toBe(requestKey(posts(fetcher)[1]![1]));
    expect(await screen.findByText('Simulated Failure')).toBeInTheDocument(); expect(await screen.findByText('Simulated Success')).toBeInTheDocument();
  });
  it('blocks duplicate clicks and does not show confirmation until the response arrives', async () => {
    const pending = deferred<Response>(); const { fetcher } = boundary({ process: () => pending.promise }); show();
    const trigger = await readyCheckout(); fireEvent.click(trigger); fireEvent.click(trigger);
    expect(posts(fetcher)).toHaveLength(1); expect(screen.getByRole('heading', { name: 'Processing simulated payment…' })).toBeInTheDocument();
    expect(screen.queryByText('Confirmed', { selector: '.reservation-status' })).not.toBeInTheDocument();
    await act(async () => pending.resolve(paymentResponse()));
  });
  it('a free reservation uses zero-value confirmation wording and the same checkout service', async () => {
    const { fetcher } = boundary({ reservation: { ...held, amountPaise: 0 } }); show();
    await userEvent.click(await readyCheckout('Confirm Free Reservation'));
    await screen.findByText('Confirmed', { selector: '.reservation-status' });
    expect(posts(fetcher)).toHaveLength(1); expect(screen.getAllByText('₹0.00').length).toBeGreaterThan(0);
  });
  it.each(['EXPIRED', 'CANCELLED', 'CONFIRMED'] as const)('does not offer new checkout for %s', async (status) => {
    boundary({ reservation: { ...held, status }, ...(status === 'CONFIRMED' ? { payments: [successPayment] } : {}) }); show();
    await screen.findByRole('heading', { name: 'Payment history' });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run Simulated Payment' })).not.toBeInTheDocument();
    if (status === 'EXPIRED') expect(screen.getByRole('heading', { name: 'Your reservation hold has expired.' })).toBeInTheDocument();
  });
  it('restores actual confirmation and history on a direct reload', async () => {
    boundary({ reservation: confirmed, payments: [successPayment, { ...failedPayment, id: '807f1f77bcf86cd799439012' }] }); const first = show();
    await screen.findByText('Simulated Success'); first.unmount(); show();
    await screen.findByText('Simulated Success'); expect(screen.getByText('Confirmed', { selector: '.reservation-status' })).toBeInTheDocument();
    expect(screen.getByText('Simulated Failure')).toBeInTheDocument();
  });
});

describe('uncertain payment and pending recovery', () => {
  it('network failure remains uncertain; checking status resolves the exact original attempt', async () => {
    const state = boundary({ process: () => { throw new TypeError('private connection detail'); } }); show();
    await userEvent.click(await readyCheckout());
    await screen.findByRole('heading', { name: 'Payment outcome is uncertain' });
    expect(screen.queryByRole('heading', { name: 'Simulated Payment Failed' })).not.toBeInTheDocument();
    const key = requestKey(posts(state.fetcher)[0]![1])!;
    state.update(confirmed, [{ ...successPayment, idempotencyKey: key }]);
    await userEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
    await screen.findByText('Confirmed', { selector: '.reservation-status' }); expect(posts(state.fetcher)).toHaveLength(1);
    expect(state.fetcher.mock.calls.some(([path]) => path.includes('idempotencyKey=' + key))).toBe(true);
    expect(screen.queryByText('private connection detail')).not.toBeInTheDocument();
  });
  it('timeout retains the key; an explicit resume sends the identical request', async () => {
    let interrupted = true;
    const { fetcher, update } = boundary({ process: (init) => interrupted ? new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) : paymentResponse({ ...successPayment, idempotencyKey: requestKey(init)! }) }); show();
    const trigger = await readyCheckout(); vi.useFakeTimers(); fireEvent.click(trigger);
    await act(async () => { await vi.advanceTimersByTimeAsync(15001); }); vi.useRealTimers();
    await screen.findByRole('heading', { name: 'Payment outcome is uncertain' });
    interrupted = false; update(confirmed, []);
    await userEvent.click(screen.getByRole('button', { name: 'Resume same payment attempt' }));
    await screen.findByText('Confirmed', { selector: '.reservation-status' });
    expect(posts(fetcher)).toHaveLength(2); expect(requestKey(posts(fetcher)[0]![1])).toBe(requestKey(posts(fetcher)[1]![1]));
    expect(posts(fetcher)[0]![1].body).toBe(posts(fetcher)[1]![1].body);
  });
  it('retains the uncertain key across navigation and does not silently begin another attempt', async () => {
    const { fetcher } = boundary({ process: () => failure(503, 'PAYMENT_OUTCOME_UNKNOWN') }); show();
    await userEvent.click(await readyCheckout()); await screen.findByRole('heading', { name: 'Payment outcome is uncertain' });
    await userEvent.click(screen.getByRole('button', { name: 'Leave checkout' })); await screen.findByText(attendee.email);
    await userEvent.click(screen.getByRole('button', { name: 'Return to checkout' })); await screen.findByRole('heading', { name: 'Payment outcome is uncertain' });
    expect(screen.queryByRole('button', { name: 'Run Simulated Payment' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resume same payment attempt' }));
    await waitFor(() => expect(posts(fetcher)).toHaveLength(2));
    expect(requestKey(posts(fetcher)[0]![1])).toBe(requestKey(posts(fetcher)[1]![1]));
  });
  it('an absent recovery result preserves the key and offers a safe same-key resume', async () => {
    const { fetcher } = boundary({ process: () => failure(503, 'DATABASE_UNAVAILABLE') }); show();
    await userEvent.click(await readyCheckout()); await screen.findByRole('heading', { name: 'Payment outcome is uncertain' });
    await userEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
    await screen.findByText(/No attempt is visible yet/); expect(posts(fetcher)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Resume same payment attempt' })).toBeEnabled();
  });
  it('restores a persisted PENDING attempt after refresh and resumes its stored outcome/key', async () => {
    const { fetcher } = boundary({ payments: [pendingPayment] }); show();
    await screen.findByRole('heading', { name: 'Payment attempt pending' });
    await userEvent.click(screen.getByRole('button', { name: 'Resume same payment attempt' }));
    await waitFor(() => expect(posts(fetcher)).toHaveLength(1)); expect(requestKey(posts(fetcher)[0]![1])).toBe(paymentKey);
    expect(JSON.parse(posts(fetcher)[0]![1].body as string)).toEqual({ simulationOutcome: 'SUCCESS' });
  });
  it('shows API conflicts without converting them into simulated payment failures', async () => {
    boundary({ process: () => failure(409, 'PAYMENT_IDEMPOTENCY_CONFLICT') }); show();
    await userEvent.click(await readyCheckout());
    expect(await screen.findByRole('alert')).toHaveTextContent('different payment choice');
    expect(screen.queryByRole('heading', { name: 'Simulated Payment Failed' })).not.toBeInTheDocument();
  });
  it('database failure keeps session and safe recovery controls rather than claiming a declined payment', async () => {
    const { fetcher } = boundary({ process: () => failure(503, 'DATABASE_UNAVAILABLE') }); show();
    await userEvent.click(await readyCheckout());
    await screen.findByRole('heading', { name: 'Payment outcome is uncertain' });
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/auth/me')).toHaveLength(1);
  });
  it('revalidates an expired session during checkout and hides private payment data', async () => {
    let expired = false;
    boundary({ me: () => expired ? failure(401) : userResponse(), process: () => { expired = true; return failure(401); } }); show();
    await userEvent.click(await readyCheckout());
    await screen.findByRole('heading', { name: 'Welcome back.' }); expect(screen.queryByRole('heading', { name: 'Payment history' })).not.toBeInTheDocument();
  });
  it('payment history failures have a retry state, never an empty-history success', async () => {
    let unavailable = true; boundary({ history: () => unavailable ? failure(503) : paymentHistory() }); show();
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
    expect(screen.queryByText('No payment attempts yet.')).not.toBeInTheDocument();
    unavailable = false; await userEvent.click(screen.getByRole('button', { name: 'Retry payment history' }));
    await screen.findByText('No payment attempts yet.');
  });
  it('history pagination reads actual pages and preserves failed-attempt details', async () => {
    const firstPage = Array.from({ length: 10 }, (_, i) => ({ ...failedPayment, id: '807f1f77bcf86cd7994390' + String(i + 11), transactionId: 'sim_history_' + i }));
    const { fetcher } = boundary({ history: (path) => path.includes('page=2') ? paymentHistory([failedPayment], { total: 11, totalPages: 2, page: 2 }) : paymentHistory(firstPage, { total: 11, totalPages: 2 }) }); show();
    await userEvent.click(await screen.findByRole('button', { name: 'Next payments' }));
    await screen.findByRole('article', { name: 'Payment ' + failedPayment.transactionId });
    expect(fetcher.mock.calls.some(([path]) => path === base + '?page=2&limit=10')).toBe(true);
    expect(within(screen.getByRole('article', { name: 'Payment ' + failedPayment.transactionId })).getByText(/chosen failure scenario/)).toBeInTheDocument();
  });
  it('clears recovery keys on logout and keeps another verified attendee isolated without browser storage', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem'), other = { ...attendee, id: '507f1f77bcf86cd799439013', email: 'other@example.test' };
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(path === '/api/auth/logout' ? json({ success: true, message: 'Logged out successfully.' }) : userResponse(path === '/api/auth/login' ? other : attendee))));
    const hook = renderHook(() => ({ auth: useAuth(), recovery: usePaymentRecovery() }), { wrapper: ({ children }) => <AuthProvider><PaymentRecoveryProvider>{children}</PaymentRecoveryProvider></AuthProvider> });
    await waitFor(() => expect(hook.result.current.auth.status).toBe('AUTHENTICATED'));
    act(() => hook.result.current.recovery.remember(held.id, { key: paymentKey, outcome: 'SUCCESS', phase: 'UNCERTAIN' }));
    expect(hook.result.current.recovery.attempts[held.id]?.key).toBe(paymentKey);
    await act(async () => { await hook.result.current.auth.logout(); }); expect(hook.result.current.recovery.attempts).toEqual({});
    await act(async () => { await hook.result.current.auth.login({ email: other.email, password: 'Disposable Test Password!' }); });
    expect(hook.result.current.auth.user?.id).toBe(other.id); expect(hook.result.current.recovery.attempts).toEqual({});
    expect(storage).not.toHaveBeenCalled();
  });
  it('aborts an obsolete payment-history GET and ignores its late response after leaving checkout', async () => {
    const old = deferred<Response>(); let oldSignal: AbortSignal | undefined;
    const originalFetch = boundary().fetcher;
    vi.stubGlobal('fetch', vi.fn((path: string, init: RequestInit) => {
      if (path.startsWith(base + '?')) { oldSignal = init.signal as AbortSignal; return old.promise; }
      return originalFetch(path, init);
    })); show();
    await screen.findByText('Loading payment history…'); await userEvent.click(screen.getByRole('button', { name: 'Leave checkout' })); await screen.findByText(attendee.email);
    expect(oldSignal?.aborted).toBe(true); await act(async () => old.resolve(paymentHistory([successPayment], {}, confirmed)));
    expect(screen.queryByText(successPayment.transactionId)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reservation Confirmed' })).not.toBeInTheDocument();
  });
  it('can resolve an existing pending attempt after expiry without enabling a new checkout', async () => {
    const expired = { ...held, status: 'EXPIRED' as const }, failed = { ...failedPayment, idempotencyKey: paymentKey, simulationOutcome: 'SUCCESS' as const, failureReason: 'RESERVATION_EXPIRED' };
    const state = boundary({ reservation: expired, payments: [pendingPayment], process: () => { state.update(expired, [failed]); return paymentResponse(failed, expired); } }); show();
    await screen.findByRole('heading', { name: 'Payment attempt pending' });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resolve pending attempt' }));
    await screen.findByText('Simulated Failure'); expect(requestKey(posts(state.fetcher)[0]![1])).toBe(paymentKey);
    expect(screen.getByRole('heading', { name: 'Your reservation hold has expired.' })).toBeInTheDocument();
  });
});
