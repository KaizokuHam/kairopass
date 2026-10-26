import { StrictMode } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthProvider } from '@/context/AuthProvider';
import { useReservation } from '@/hooks/useReservations';
import { HoldCountdown } from '@/components/reservations/HoldCountdown';
import { useHoldClock } from '@/hooks/useHoldClock';
import { holdRemaining } from '@/lib/reservation-format';
import { attendee, deferred, failure, json, organizer, userResponse } from './fixtures';
import { publicDetail, publicEvent } from './discovery-fixtures';
import { held, reservationList, reservationResponse, serverNow } from './reservations-fixtures';
import type { ReservationStatus } from '@/types/reservations';
import { paymentHistory } from './payments-fixtures';

const details = '/attendee/reservations/' + held.id;
function Probe() {
  const location = useLocation(), navigate = useNavigate();
  return <><output aria-label="Current address">{location.pathname}</output><button onClick={() => { void navigate('/attendee/reservations/707f1f77bcf86cd799439012'); }}>Other reservation</button></>;
}
function show(path = '/events/' + held.eventId) {
  return render(<MemoryRouter useTransitions={false} initialEntries={[path]}><AuthProvider><App /><Probe /></AuthProvider></MemoryRouter>);
}
function boundary(respond: (path: string, options: RequestInit) => Response | Promise<Response> = () => reservationResponse(), auth: () => Response | Promise<Response> = () => userResponse()) {
  let currentReservation = held;
  const fetcher = vi.fn(async (path: string, options: RequestInit) => {
    if (path === '/api/auth/me') return auth();
    if (path === '/api/health') return json({ success: true, message: 'KairoPass API is running' });
    if (path.startsWith('/api/events/')) return publicDetail();
    if (/\/payments\?/.test(path)) return paymentHistory([], {}, currentReservation);
    const response = await respond(path, options);
    if (response.ok) { const body = await response.clone().json(); if (body?.data?.reservation) currentReservation = body.data.reservation; }
    return response;
  });
  vi.stubGlobal('fetch', fetcher); return fetcher;
}

describe('real reserve action', () => {
  it('directs a guest to login and returns to the same event after actual authentication', async () => {
    boundary((path) => path === '/api/auth/login' ? userResponse() : reservationResponse(), () => failure(401)); show();
    await userEvent.click(await screen.findByRole('link', { name: 'Sign in to Reserve' }));
    await userEvent.type(await screen.findByLabelText('Email address'), attendee.email);
    await userEvent.type(screen.getByLabelText('Password'), 'Disposable test password!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: 'Reserve Ticket' }); expect(screen.getByLabelText('Current address')).toHaveTextContent('/events/' + held.eventId);
  });
  it('disables duplicate clicks and navigates only after the persisted hold is returned', async () => {
    const pending = deferred<Response>();
    const fetcher = boundary((_path, options) => options.method === 'POST' ? pending.promise : reservationResponse()); show();
    const button = await screen.findByRole('button', { name: 'Reserve Ticket' });
    fireEvent.click(button); fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Reserving…' })).toBeDisabled();
    expect(screen.getByLabelText('Current address')).toHaveTextContent('/events/');
    expect(fetcher.mock.calls.filter(([path, options]) => path === '/api/reservations' && options.method === 'POST')).toHaveLength(1);
    await act(async () => pending.resolve(reservationResponse(held, serverNow, 201)));
    expect(await screen.findByText('Awaiting Payment')).toBeInTheDocument();
    expect(screen.getByLabelText('Current address')).toHaveTextContent(details);
    expect(screen.getByText(/Complete a simulated checkout below/)).toBeInTheDocument();
    expect(screen.queryByText(/Ticket booked|Payment successful/)).not.toBeInTheDocument();
  });
  it('shows the organizer restriction and never submits a booking', async () => {
    const fetcher = boundary(undefined, () => userResponse(organizer)); show();
    await screen.findByText(/Reservations require an attendee account/);
    expect(screen.queryByRole('button', { name: 'Reserve Ticket' })).not.toBeInTheDocument();
    expect(fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
  });
  it('handles a sold-out API race with a safe refresh and no success', async () => {
    boundary(() => failure(409, 'EVENT_SOLD_OUT')); show();
    await userEvent.click(await screen.findByRole('button', { name: 'Reserve Ticket' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('sold out');
    expect(screen.getByRole('button', { name: 'Reserve Ticket' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh availability' })).toBeEnabled();
  });
  it.each(['NETWORK_ERROR', 'TIMEOUT', 'RESERVATION_OUTCOME_UNKNOWN'])('keeps %s uncertain and points to owned history without retrying', async (kind) => {
    const fetcher = boundary(async (_path, options) => {
      if (kind === 'RESERVATION_OUTCOME_UNKNOWN') return failure(503, kind);
      if (kind === 'TIMEOUT') {
        // The shared HTTP timeout is shortened via fake timers only after the request is pending.
        return new Promise<Response>((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      }
      throw new TypeError('private network detail');
    }); show();
    const button = await screen.findByRole('button', { name: 'Reserve Ticket' });
    if (kind === 'TIMEOUT') {
      vi.useFakeTimers(); fireEvent.click(button); await act(async () => { await vi.advanceTimersByTimeAsync(15001); }); vi.useRealTimers();
    } else await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('may have completed');
    expect(screen.getByRole('link', { name: 'Check My Reservations' })).toHaveAttribute('href', '/attendee/reservations');
    expect(screen.getByRole('button', { name: 'Reserve Ticket' })).toBeDisabled();
    expect(fetcher.mock.calls.filter(([path, options]) => path === '/api/reservations' && options.method === 'POST')).toHaveLength(1);
    expect(screen.queryByText(/private network detail|Ticket booked/)).not.toBeInTheDocument();
  });
  it('revalidates the session after an expired booking credential', async () => {
    let expired = false; boundary(() => { expired = true; return failure(401); }, () => expired ? failure(401) : userResponse()); show();
    await userEvent.click(await screen.findByRole('button', { name: 'Reserve Ticket' }));
    await screen.findByRole('link', { name: 'Sign in to Reserve' });
  });
});

describe('owned reservation list and details', () => {
  it('renders actual list values, filters and server pagination', async () => {
    const fetcher = boundary((path) => reservationList(path.includes('page=2') ? [held] : [held, ...Array.from({ length: 9 }, (_, i) => ({ ...held, id: '707f1f77bcf86cd7994390' + String(i + 12), event: { ...held.event!, title: `Other event ${i}` } }))], { total: 11, totalPages: 2, ...(path.includes('page=2') ? { page: 2 } : {}) }));
    show('/attendee/reservations');
    await screen.findByRole('heading', { name: publicEvent.title });
    const card = screen.getByRole('heading', { name: publicEvent.title }).closest('article')!;
    expect(within(card).getByText('₹199.00')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'View Details' })).toHaveAttribute('href', details);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(fetcher.mock.calls.at(-1)?.[0]).toContain('page=2'));
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'EXPIRED');
    await waitFor(() => expect(fetcher.mock.calls.at(-1)?.[0]).toBe('/api/reservations?page=1&limit=10&status=EXPIRED'));
  });
  it('distinguishes loading and empty history', async () => {
    const pending = deferred<Response>(); boundary(() => pending.promise); show('/attendee/reservations');
    expect(await screen.findByText('Loading reservations…')).toBeInTheDocument();
    expect(screen.queryByText('Your next experience starts here.')).not.toBeInTheDocument();
    await act(async () => pending.resolve(reservationList([])));
    await screen.findByRole('heading', { name: 'Your next experience starts here.' });
  });
  it('retains authentication on database 503 and recovers the list', async () => {
    let unavailable = true; const fetcher = boundary(() => unavailable ? failure(503, 'DATABASE_UNAVAILABLE') : reservationList()); show('/attendee/reservations');
    await screen.findByRole('alert'); expect(screen.queryByText('Your next experience starts here.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    unavailable = false; await userEvent.click(screen.getByRole('button', { name: 'Retry loading reservations' }));
    await screen.findByRole('heading', { name: publicEvent.title });
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/auth/me')).toHaveLength(1);
  });
  it.each([
    ['HELD', 'Awaiting Payment'], ['CONFIRMED', 'Confirmed'], ['EXPIRED', 'Hold Expired'], ['CANCELLED', 'Cancelled']
  ] as [ReservationStatus, string][])('restores %s details from the API on direct navigation', async (status, label) => {
    boundary(() => reservationResponse({ ...held, status })); show(details);
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.getByText(held.id)).toBeInTheDocument(); expect(screen.getByText('₹199.00', { selector: 'dd' })).toBeInTheDocument();
    if (status !== 'HELD') { expect(screen.queryByRole('timer')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Cancel hold' })).not.toBeInTheDocument(); }
    else { expect(screen.getByRole('timer')).toHaveTextContent('10:00'); expect(screen.queryByRole('button', { name: /Pay Now/ })).not.toBeInTheDocument(); }
  });
  it('shows safe missing-event history', async () => {
    boundary(() => reservationResponse({ ...held, status: 'CANCELLED', event: null })); show(details);
    await screen.findByRole('heading', { name: 'Event details unavailable' }); expect(screen.getByText(held.id)).toBeInTheDocument();
  });
  it('handles owned detail 404 without showing a fabricated reservation', async () => {
    boundary(() => failure(404, 'RESERVATION_NOT_FOUND')); show(details);
    await screen.findByRole('heading', { name: 'Reservation not found.' }); expect(screen.queryByText(held.id)).not.toBeInTheDocument();
  });
  it('confirms cancellation explicitly, traps focus, and refetches actual details after success', async () => {
    let cancelled = false;
    const fetcher = boundary((_path, options) => {
      if (options.method === 'POST') cancelled = true;
      return reservationResponse({ ...held, status: cancelled ? 'CANCELLED' : 'HELD' });
    }); show(details); const trigger = await screen.findByRole('button', { name: 'Cancel hold' });
    await userEvent.click(trigger); let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Keep reservation' })).toHaveFocus();
    await userEvent.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
    await userEvent.click(trigger); dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel hold' }));
    expect(await screen.findByText('Cancelled', { selector: '.reservation-status' })).toBeInTheDocument();
    expect(screen.getByText('Your hold was cancelled. Capacity has been released.')).toHaveAttribute('role', 'status');
    expect(fetcher.mock.calls.filter(([path, options]) => path.endsWith('/cancel') && options.method === 'POST')).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/reservations/' + held.id)).toHaveLength(2);
  });
  it('preserves HELD after a rejected cancellation until an explicit reload', async () => {
    boundary((_path, options) => options.method === 'POST' ? failure(409, 'RESERVATION_CONFLICT') : reservationResponse()); show(details);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel hold' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel hold' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('reservation changed');
    expect(screen.getByText('Awaiting Payment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel hold' })).toBeDisabled();
  });
  it('stops hold eligibility at zero and waits for authoritative expiry confirmation', async () => {
    let reads = 0; const pending = deferred<Response>();
    boundary(() => ++reads === 1 ? reservationResponse(held, held.expiresAt) : pending.promise); show(details);
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.queryByText('Hold Expired')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel hold' })).not.toBeInTheDocument();
    await act(async () => pending.resolve(reservationResponse({ ...held, status: 'EXPIRED' }, held.expiresAt)));
    await screen.findByText('Hold Expired'); expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });
  it('does not invent expiry when its reconciliation GET fails', async () => {
    let reads = 0; boundary(() => ++reads === 1 ? reservationResponse(held, held.expiresAt) : failure(503)); show(details);
    await screen.findByRole('alert'); expect(screen.queryByText('Hold Expired')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry loading reservation' })).toBeEnabled();
  });
  it('revalidates an expired private session and redirects to login', async () => {
    let expired = false; boundary(() => { expired = true; return failure(401); }, () => expired ? failure(401) : userResponse()); show(details);
    await screen.findByRole('heading', { name: 'Welcome back.' }); expect(screen.queryByText(held.id)).not.toBeInTheDocument();
  });
  it('aborts stale detail reads and never shows an obsolete response after navigation', async () => {
    const old = deferred<Response>(); let oldSignal: AbortSignal | undefined;
    boundary((path, options) => { if (path.endsWith(held.id)) { oldSignal = options.signal as AbortSignal; return old.promise; } return reservationResponse({ ...held, id: '707f1f77bcf86cd799439012', event: { ...held.event!, title: 'New reservation' } }); });
    show(details); await screen.findByText('Loading reservation…'); await userEvent.click(screen.getByRole('button', { name: 'Other reservation' }));
    await screen.findByRole('heading', { name: 'New reservation' }); expect(oldSignal?.aborted).toBe(true);
    await act(async () => old.resolve(reservationResponse())); expect(screen.queryByRole('heading', { name: held.event!.title })).not.toBeInTheDocument();
  });
  it('clears private data and aborts outstanding reads on successful logout', async () => {
    const pending = deferred<Response>(); let reads = 0, oldSignal: AbortSignal | undefined;
    boundary((path, options) => {
      if (path === '/api/auth/logout') return json({ success: true, message: 'Logged out successfully.' });
      if (++reads === 1) return reservationResponse(); oldSignal = options.signal as AbortSignal; return pending.promise;
    }); show(details); await screen.findByText(held.id);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh reservation' })); await screen.findByText('Loading reservation…');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' })); await screen.findByRole('link', { name: 'Sign in' });
    expect(oldSignal?.aborted).toBe(true); await act(async () => pending.resolve(reservationResponse()));
    expect(screen.queryByText(held.id)).not.toBeInTheDocument(); expect(screen.queryByText('Awaiting Payment')).not.toBeInTheDocument();
  });
  it('cleans up StrictMode and unmounted private GETs', async () => {
    const pending = deferred<Response>(), signals: AbortSignal[] = [];
    boundary((_path, options) => { signals.push(options.signal as AbortSignal); return pending.promise; });
    const view = renderHook(() => useReservation(held.id), { wrapper: ({ children }) => <StrictMode><AuthProvider>{children}</AuthProvider></StrictMode> });
    await waitFor(() => expect(signals.length).toBeGreaterThan(0)); view.unmount(); expect(signals.every((signal) => signal.aborted)).toBe(true);
    await act(async () => pending.resolve(reservationResponse()));
  });
});

describe('informational server-based hold clock', () => {
  it('uses server time even when the device clock differs and cleans up its interval', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-26T00:00:00Z');
    const snapshot = { reservation: held, serverNow, receivedAt: Date.now() }, expired = vi.fn();
    const view = renderHook(() => useHoldClock(snapshot));
    expect(view.result.current).toBe(600000);
    act(() => { vi.advanceTimersByTime(599000); }); expect(view.result.current).toBe(1000);
    const countdown = render(<HoldCountdown remaining={1000} expired={expired} />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:01');
    countdown.rerender(<HoldCountdown remaining={0} expired={expired} />); expect(expired).toHaveBeenCalledTimes(1);
    countdown.rerender(<HoldCountdown remaining={0} expired={expired} />); expect(expired).toHaveBeenCalledTimes(1);
    view.unmount(); countdown.unmount(); expect(vi.getTimerCount()).toBe(0);
    expect(holdRemaining(snapshot, snapshot.receivedAt + 700000)).toBe(0);
  });
});
