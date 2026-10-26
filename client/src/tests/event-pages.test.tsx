import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthProvider } from '@/context/AuthProvider';
import { safeAuthDestination } from '@/lib/auth-navigation';
import { initialEventValues } from '@/lib/event-form';
import { attendee, deferred, failure, json, organizer, userResponse } from './fixtures';
import { eventResponse, eventsResponse, sampleEvent } from './events-fixtures';
import type { AuthUser } from '@/types/auth';

function show(path = '/organizer/events') {
  return render(<MemoryRouter useTransitions={false} initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}
function boundary(respond: (path: string, options: RequestInit) => Response | Promise<Response> = () => eventsResponse(), user: AuthUser | null = organizer) {
  const fetcher = vi.fn((path: string, options: RequestInit) => Promise.resolve(path === '/api/auth/me' ? user ? userResponse(user) : failure(401)
    : path === '/api/health' ? json({ success: true, message: 'KairoPass API is running' }) : respond(path, options)));
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
const listCalls = (fetcher: ReturnType<typeof boundary>) => fetcher.mock.calls.filter(([path]) => path.startsWith('/api/organizer/events?'));
describe('organizer event pages in the protected application', () => {
  it('shows loading before a real empty state and offers creation', async () => {
    const pending = deferred<Response>(); boundary(() => pending.promise); show();
    expect(await screen.findByText('Loading your events…')).toBeInTheDocument();
    expect(screen.queryByText('Your first event starts here.')).not.toBeInTheDocument();
    await act(async () => { pending.resolve(eventsResponse([])); });
    expect(await screen.findByRole('heading', { name: 'Your first event starts here.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your first event' })).toHaveAttribute('href', '/organizer/events/new');
  });
  it('displays API event details, status, exact price, and actual remaining capacity', async () => {
    boundary(); show();
    const card = await screen.findByRole('article', { name: sampleEvent.title });
    expect(within(card).getByText('Draft')).toBeInTheDocument();
    expect(within(card).getByText('₹199.00')).toBeInTheDocument();
    expect(within(card).getByText('97')).toBeInTheDocument();
    expect(within(card).getByText(sampleEvent.venue)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Manage event' })).toHaveAttribute('href', '/organizer/events/' + sampleEvent.id);
  });
  it('debounces search, resets pagination, and applies supported status and sort controls', async () => {
    const fetcher = boundary(() => eventsResponse([])); show('/organizer/events?page=3&status=DRAFT&sort=oldest');
    await screen.findByRole('heading', { name: 'No events match this view.' });
    const before = listCalls(fetcher).length;
    await userEvent.type(screen.getByLabelText('Search by title'), 'Cloud');
    expect(listCalls(fetcher)).toHaveLength(before);
    await waitFor(() => expect(listCalls(fetcher).at(-1)?.[0]).toContain('search=Cloud'));
    expect(listCalls(fetcher).at(-1)?.[0]).toContain('page=1');
    expect(listCalls(fetcher).at(-1)?.[0]).toContain('status=DRAFT');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'PUBLISHED');
    await waitFor(() => expect(listCalls(fetcher).at(-1)?.[0]).toContain('status=PUBLISHED'));
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'newest');
    await waitFor(() => expect(listCalls(fetcher).at(-1)?.[0]).toContain('sort=newest'));
    expect(listCalls(fetcher).at(-1)?.[0]).toContain('search=Cloud');
    expect(screen.getByLabelText('Search by title')).toHaveValue('Cloud');
  });
  it('uses server pagination metadata and preserves filters between pages', async () => {
    const events = Array.from({ length: 11 }, (_, index) => ({ ...sampleEvent,
      id: (BigInt('0x' + sampleEvent.id) + BigInt(index)).toString(16), title: 'Workshop ' + index }));
    const fetcher = boundary((path) => {
      const params = new URL(path, 'https://example.test').searchParams;
      const page = Number(params.get('page') ?? 1);
      return eventsResponse(events.slice((page - 1) * 10, page * 10), { page, total: 11, totalPages: 2 });
    });
    show('/organizer/events?status=DRAFT&search=Workshop');
    await screen.findByRole('article', { name: 'Workshop 0' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('article', { name: 'Workshop 10' })).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(listCalls(fetcher).at(-1)?.[0]).toContain('status=DRAFT&search=Workshop');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByRole('article', { name: 'Workshop 0' });
  });
  it('distinguishes service failure from an empty collection and retries', async () => {
    let unavailable = true; boundary(() => unavailable ? failure(503, 'DATABASE_UNAVAILABLE') : eventsResponse()); show();
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
    expect(screen.queryByText('Your first event starts here.')).not.toBeInTheDocument();
    unavailable = false; await userEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    await screen.findByRole('article', { name: sampleEvent.title });
  });
  it('displays owned detail data and reads cancelled events without edit actions', async () => {
    boundary(() => eventResponse({ ...sampleEvent, status: 'CANCELLED' })); show('/organizer/events/' + sampleEvent.id);
    expect(await screen.findByRole('heading', { name: sampleEvent.title })).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText(sampleEvent.description)).toBeInTheDocument();
    expect(screen.getByText('97')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit draft' })).not.toBeInTheDocument();
  });
  it.each([sampleEvent.id, 'malformed'])('handles unavailable or invalid resources safely (%s)', async (id) => {
    const fetcher = boundary(() => failure(404, 'EVENT_NOT_FOUND')); show('/organizer/events/' + id);
    expect(await screen.findByRole('heading', { name: 'Event not found.' })).toBeInTheDocument();
    expect(screen.queryByText(sampleEvent.description)).not.toBeInTheDocument();
    if (id === 'malformed') expect(fetcher.mock.calls.some(([path]) => path.startsWith('/api/organizer/events'))).toBe(false);
  });
  it.each(['/organizer/events', '/organizer/events/new', '/organizer/events/' + sampleEvent.id, '/organizer/events/' + sampleEvent.id + '/edit'])('blocks unauthenticated access to %s', async (path) => {
    const fetcher = boundary(() => eventsResponse(), null); show(path);
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(fetcher.mock.calls.some(([url]) => url.startsWith('/api/organizer/events'))).toBe(false);
  });
  it.each(['/organizer/events', '/organizer/events/new', '/organizer/events/' + sampleEvent.id + '/edit'])('blocks attendee access to %s', async (path) => {
    const fetcher = boundary(() => eventsResponse(), attendee); show(path);
    expect(await screen.findByRole('heading', { name: 'This space belongs to another role.' })).toBeInTheDocument();
    expect(fetcher.mock.calls.some(([url]) => url.startsWith('/api/organizer/events'))).toBe(false);
  });
  it('creates through the complete app and then fetches the actual persisted detail', async () => {
    let saved = sampleEvent;
    const fetcher = boundary((_path, options) => {
      if (options.method === 'POST') { saved = { ...sampleEvent, ...JSON.parse(String(options.body)), reservedCount: 0 }; return eventResponse(saved, 201); }
      return eventResponse(saved);
    });
    show('/organizer/events/new'); await screen.findByRole('heading', { name: 'Create an event.' });
    const values = initialEventValues(sampleEvent);
    for (const key of Object.keys(values) as Array<keyof typeof values>) {
      const input = document.querySelector('[name="' + key + '"]');
      if (input) fireEvent.change(input, { target: { value: values[key] } });
    }
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('heading', { name: sampleEvent.title })).toBeInTheDocument();
    expect(screen.getByText('Event created successfully. Your draft is ready.')).toBeInTheDocument();
    expect(fetcher.mock.calls.some(([path, options]) => path === '/api/organizer/events/' + sampleEvent.id && options.method === 'GET')).toBe(true);
  });
  it('allows only real organizer return routes after authentication', () => {
    for (const path of ['/organizer/events?status=DRAFT', '/organizer/events/new', '/organizer/events/' + sampleEvent.id + '/edit']) {
      expect(safeAuthDestination('ORGANIZER', path)).toBe(path);
      expect(safeAuthDestination('ATTENDEE', path)).toBe('/attendee/dashboard');
    }
    expect(safeAuthDestination('ORGANIZER', '/organizer/events/../../login')).toBe('/organizer/dashboard');
  });
});
