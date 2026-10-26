import { StrictMode } from 'react';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthProvider } from '@/context/AuthProvider';
import { usePublicEvent } from '@/hooks/usePublicEvents';
import { useAvailabilityClock } from '@/hooks/useAvailabilityClock';
import { eventAvailability } from '@/lib/event-availability';
import { attendee, deferred, failure, json, userResponse } from './fixtures';
import { publicDetail, publicEvent, publicList } from './discovery-fixtures';

function show(path = '/events/' + publicEvent.id) {
  return render(<MemoryRouter useTransitions={false} initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}
function boundary(respond: (path: string, options: RequestInit) => Response | Promise<Response> = () => publicDetail(), auth: Response | Promise<Response> = failure(401)) {
  const fetcher = vi.fn((path: string, options: RequestInit) => Promise.resolve(path === '/api/auth/me' ? auth
    : path === '/api/health' ? json({ success: true, message: 'KairoPass API is running' }) : respond(path, options)));
  vi.stubGlobal('fetch', fetcher); return fetcher;
}

describe('public event details and navigation', () => {
  it('displays real event fields and a disabled reservation control without writes or storage persistence', async () => {
    const fetcher = boundary(), storage = vi.spyOn(Storage.prototype, 'setItem'); show();
    expect(await screen.findByRole('heading', { name: publicEvent.title })).toBeInTheDocument();
    expect(screen.getByText(publicEvent.description)).toBeInTheDocument();
    const booking = screen.getByRole('complementary', { name: 'Event availability' });
    expect(within(booking).getByText('₹199.00')).toBeInTheDocument();
    expect(within(booking).getByText('97')).toBeInTheDocument(); expect(within(booking).getByText('100')).toBeInTheDocument();
    expect(screen.getByText(/All times shown in/)).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: 'Reservations coming soon' }); expect(cta).toBeDisabled();
    await userEvent.click(cta); expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    expect(storage).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Book now|Reserve ticket/i })).not.toBeInTheDocument();
  });
  it('carries the discovery URL into details and restores it on return', async () => {
    boundary((path) => path.startsWith('/api/events?') ? publicList([publicEvent], { limit: 1 }) : publicDetail());
    show('/events?q=Cloud&price=paid&sort=latest&limit=1');
    await userEvent.click(await screen.findByRole('link', { name: /View details for/ }));
    await screen.findByRole('heading', { name: publicEvent.title });
    const back = screen.getByRole('link', { name: 'Back to Explore Events' });
    expect(back).toHaveAttribute('href', expect.stringContaining('q=Cloud')); expect(back).toHaveAttribute('href', expect.stringContaining('sort=latest'));
    await userEvent.click(back); await screen.findByRole('article', { name: publicEvent.title });
    expect(screen.getByRole('searchbox', { name: 'Search events by title or venue' })).toHaveValue('Cloud');
    expect(screen.getByLabelText('Ticket price')).toHaveValue('paid');
  });
  it.each(['malformed', publicEvent.id])('shows safe not-found UI for invalid, unpublished, cancelled, or missing details (%s)', async (id) => {
    const fetcher = boundary(() => failure(404, 'EVENT_NOT_FOUND')); show('/events/' + id);
    expect(await screen.findByRole('heading', { name: 'Event not available.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reservations coming soon' })).not.toBeInTheDocument();
    if (id === 'malformed') expect(fetcher.mock.calls.some(([path]) => path === '/api/events/malformed')).toBe(false);
  });
  it('recovers a public detail read after a service failure', async () => {
    let unavailable = true; boundary(() => unavailable ? failure(503) : publicDetail()); show();
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
    unavailable = false; await userEvent.click(screen.getByRole('button', { name: 'Retry loading events' }));
    await screen.findByRole('heading', { name: publicEvent.title });
  });
  it.each([
    { event: { ...publicEvent, registrationDeadline: '2020-01-01T00:00:00.000Z' }, label: 'Registration closed' },
    { event: { ...publicEvent, reservedCount: 100 }, label: 'Sold out' },
    { event: { ...publicEvent, startAt: '2020-01-02T00:00:00.000Z', endAt: '2020-01-03T00:00:00.000Z', registrationDeadline: '2020-01-01T00:00:00.000Z' }, label: 'Event started / unavailable' }
  ])('displays $label and never enables reservations', async ({ event, label }) => {
    boundary(() => publicDetail(event)); show(); await screen.findByRole('heading', { name: publicEvent.title });
    const booking = screen.getByRole('complementary', { name: 'Event availability' });
    expect(within(booking).getByText(label)).toBeInTheDocument(); expect(within(booking).getByRole('button', { name: 'Reservations coming soon' })).toBeDisabled();
  });
  it('revalidates visibility when refreshing availability after cancellation', async () => {
    let cancelled = false; boundary(() => cancelled ? failure(404, 'EVENT_NOT_FOUND') : publicDetail()); show();
    await screen.findByRole('heading', { name: publicEvent.title }); cancelled = true;
    await userEvent.click(screen.getByRole('button', { name: 'Refresh availability' }));
    await screen.findByRole('heading', { name: 'Event not available.' }); expect(screen.queryByText(publicEvent.description)).not.toBeInTheDocument();
  });
  it('lets an attendee reach discovery from the account dashboard', async () => {
    boundary(() => publicList(), userResponse(attendee)); show('/attendee/dashboard');
    await screen.findByText(attendee.email);
    const link = within(screen.getByRole('main')).getAllByRole('link', { name: 'Explore Events' })[0]!;
    await userEvent.click(link); await screen.findByRole('article', { name: publicEvent.title });
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/attendee/dashboard');
  });
  it('makes the existing home exploration CTA functional without requiring sign-in', async () => {
    boundary(() => publicList()); show('/');
    await userEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Explore Events' }));
    await screen.findByRole('article', { name: publicEvent.title });
  });
  it('loads discovery while authentication is still unresolved', async () => {
    const auth = deferred<Response>(); boundary(() => publicList(), auth.promise); show('/events');
    await screen.findByRole('article', { name: publicEvent.title }); expect(screen.getByText('Checking session')).toBeInTheDocument();
    await act(async () => auth.resolve(failure(401)));
  });
});

describe('public request and availability lifecycle', () => {
  it('discards an old detail response when the requested ID changes', async () => {
    const old = deferred<Response>(), nextId = '607f1f77bcf86cd799439012';
    vi.stubGlobal('fetch', vi.fn((path: string) => path.endsWith(publicEvent.id) ? old.promise : Promise.resolve(publicDetail({ ...publicEvent, id: nextId, title: 'New event' }))));
    const { result, rerender } = renderHook(({ id }) => usePublicEvent(id), { initialProps: { id: publicEvent.id } });
    rerender({ id: nextId }); expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.title).toBe('New event'));
    await act(async () => old.resolve(publicDetail())); expect(result.current.data?.id).toBe(nextId);
  });
  it('cancels StrictMode cleanup and unmounted reads without displaying their response', async () => {
    const pending = deferred<Response>(), signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) => { signals.push(options.signal as AbortSignal); return pending.promise; }));
    const { unmount } = renderHook(() => usePublicEvent(publicEvent.id), { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> });
    expect(signals.length).toBeGreaterThan(0); unmount(); expect(signals.every((signal) => signal.aborted)).toBe(true);
    await act(async () => pending.resolve(publicDetail()));
  });
  it('updates availability at the exact deadline and event start while a detail page remains open', () => {
    vi.useFakeTimers(); const start = Date.parse('2040-01-01T00:00:00Z'); vi.setSystemTime(start);
    const event = { ...publicEvent, startAt: new Date(start + 2000).toISOString(), endAt: new Date(start + 3000).toISOString(), registrationDeadline: new Date(start + 1000).toISOString() };
    const { result } = renderHook(() => eventAvailability(event, useAvailabilityClock([event])).kind);
    expect(result.current).toBe('open'); act(() => { vi.advanceTimersByTime(1000); }); expect(result.current).toBe('closed');
    act(() => { vi.advanceTimersByTime(1000); }); expect(result.current).toBe('unavailable');
  });
});
