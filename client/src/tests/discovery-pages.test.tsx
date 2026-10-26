import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthProvider } from '@/context/AuthProvider';
import { deferred, failure, json, organizer, userResponse } from './fixtures';
import { publicEvent, publicList } from './discovery-fixtures';

function LocationProbe() {
  const location = useLocation(), navigate = useNavigate();
  return <><output aria-label="Current address">{location.pathname + location.search}</output><button onClick={() => navigate(-1)}>Browser back</button></>;
}
function show(path = '/events') {
  return render(<MemoryRouter useTransitions={false} initialEntries={[path]}><AuthProvider><App /><LocationProbe /></AuthProvider></MemoryRouter>);
}
function boundary(respond: (path: string, options: RequestInit) => Response | Promise<Response> = () => publicList(), auth: Response = failure(401)) {
  const fetcher = vi.fn((path: string, options: RequestInit) => Promise.resolve(path === '/api/auth/me' ? auth : path === '/api/health' ? json({ success: true, message: 'KairoPass API is running' }) : respond(path, options)));
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
const calls = (fetcher: ReturnType<typeof boundary>) => fetcher.mock.calls.filter(([path]) => path.startsWith('/api/events?'));

describe('public event marketplace', () => {
  it('shows loading skeletons until the API resolves, then renders actual card values for anonymous visitors', async () => {
    const pending = deferred<Response>(); boundary(() => pending.promise); show();
    expect(screen.getByRole('status', { name: 'Loading events' })).toBeInTheDocument();
    expect(screen.queryByText('The next good thing is on its way.')).not.toBeInTheDocument();
    await act(async () => pending.resolve(publicList()));
    const card = await screen.findByRole('article', { name: publicEvent.title });
    expect(within(card).getByText('₹199.00')).toBeInTheDocument();
    expect(within(card).getByText('97 remaining · 100 capacity')).toBeInTheDocument();
    expect(within(card).getByText(publicEvent.venue)).toBeInTheDocument();
    expect(within(card).getByText('Registration open')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /View details/ })).toHaveAttribute('href', expect.stringContaining('/events/' + publicEvent.id));
  });
  it('shows a genuine unfiltered empty state', async () => {
    boundary(() => publicList([])); show();
    expect(await screen.findByRole('heading', { name: 'The next good thing is on its way.' })).toBeInTheDocument();
  });
  it.each(['/events?q=Missing', '/events?price=free'])('distinguishes search/filter empty results (%s)', async (path) => {
    boundary(() => publicList([])); show(path);
    expect(await screen.findByRole('heading', { name: path.includes('q=') ? 'No events match your search.' : 'No events match these filters.' })).toBeInTheDocument();
  });
  it('recovers from service failure without presenting it as an empty result', async () => {
    let unavailable = true; boundary(() => unavailable ? failure(503, 'DATABASE_UNAVAILABLE') : publicList()); show();
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
    expect(screen.queryByText('The next good thing is on its way.')).not.toBeInTheDocument();
    unavailable = false; await userEvent.click(screen.getByRole('button', { name: 'Retry loading events' }));
    await screen.findByRole('article', { name: publicEvent.title });
  });
  it('debounces title/venue search, updates the URL, and resets the page', async () => {
    const fetcher = boundary(() => publicList([])); show('/events?page=3&price=paid');
    await screen.findByRole('heading', { name: 'No events match these filters.' }); const before = calls(fetcher).length;
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search events by title or venue' }), 'Cloud');
    expect(calls(fetcher)).toHaveLength(before);
    await waitFor(() => expect(calls(fetcher).at(-1)?.[0]).toContain('q=Cloud'));
    expect(calls(fetcher).at(-1)?.[0]).toContain('page=1'); expect(calls(fetcher).at(-1)?.[0]).toContain('price=paid');
    expect(screen.getByLabelText('Current address')).toHaveTextContent('q=Cloud');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(calls(fetcher).at(-1)?.[0]).not.toContain('q='));
  });
  it('ignores an obsolete search response after the newer query has resolved and aborts its signal', async () => {
    const pending = deferred<Response>(); let oldSignal: AbortSignal | undefined;
    boundary((path, options) => { if (path.includes('q=Old')) { oldSignal = options.signal as AbortSignal; return pending.promise; } return publicList([{ ...publicEvent, title: 'New result' }]); });
    show('/events?q=Old');
    const input = screen.getByRole('searchbox', { name: 'Search events by title or venue' });
    await userEvent.clear(input); await userEvent.type(input, 'New');
    await screen.findByRole('article', { name: 'New result' }); expect(oldSignal?.aborted).toBe(true);
    await act(async () => pending.resolve(publicList([{ ...publicEvent, title: 'Obsolete result' }])));
    expect(screen.queryByText('Obsolete result')).not.toBeInTheDocument();
  });
  it('applies venue, price, and local date filters as real UTC request parameters', async () => {
    const fetcher = boundary(() => publicList([])); show(); await screen.findByText('The next good thing is on its way.');
    await userEvent.selectOptions(screen.getByLabelText('Ticket price'), 'free');
    await userEvent.type(screen.getByLabelText('Venue'), 'Bengaluru');
    fireEvent.change(screen.getByLabelText('Starts from'), { target: { value: '2040-02-01T10:00' } });
    fireEvent.change(screen.getByLabelText('Starts through'), { target: { value: '2040-02-28T23:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(calls(fetcher).at(-1)?.[0]).toContain('venue=Bengaluru'));
    const params = new URL(calls(fetcher).at(-1)![0], 'https://example.test').searchParams;
    expect(params.get('price')).toBe('free');
    expect(params.get('from')).toBe(new Date(2040, 1, 1, 10).toISOString());
    expect(params.get('to')).toBe(new Date(2040, 1, 28, 23).toISOString());
  });
  it('blocks reversed local date filters without issuing another request', async () => {
    const fetcher = boundary(() => publicList([])); show(); await screen.findByText('The next good thing is on its way.'); const before = calls(fetcher).length;
    fireEvent.change(screen.getByLabelText('Starts from'), { target: { value: '2040-03-01T00:00' } });
    fireEvent.change(screen.getByLabelText('Starts through'), { target: { value: '2040-02-01T00:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose valid local dates'); expect(calls(fetcher)).toHaveLength(before);
  });
  it('changes sorting and clears all filters to defaults', async () => {
    const fetcher = boundary(() => publicList([])); show('/events?q=Cloud&venue=Hall&price=paid&page=3&sort=latest');
    await screen.findByText('No events match your search.');
    await userEvent.selectOptions(screen.getByLabelText('Sort events'), 'price_desc');
    await waitFor(() => expect(calls(fetcher).at(-1)?.[0]).toContain('sort=price_desc'));
    expect(calls(fetcher).at(-1)?.[0]).toContain('page=1');
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    await waitFor(() => expect(calls(fetcher).at(-1)?.[0]).toBe('/api/events?page=1&limit=12&sort=soonest&price=all'));
    expect(screen.getByLabelText('Venue')).toHaveValue('');
    expect(screen.getByRole('searchbox', { name: 'Search events by title or venue' })).toHaveValue('');
  });
  it('paginates using actual server metadata and supports browser back with preserved URL filters', async () => {
    const fetcher = boundary((path) => {
      const page = Number(new URL(path, 'https://example.test').searchParams.get('page'));
      return publicList([{ ...publicEvent, title: page === 1 ? 'First result' : 'Second result' }], { page, limit: 1, total: 2, totalPages: 2 });
    }); show('/events?q=Cloud&price=paid&limit=1');
    await screen.findByRole('article', { name: 'First result' }); await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('article', { name: 'Second result' }); expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled(); expect(calls(fetcher).at(-1)?.[0]).toContain('q=Cloud');
    await userEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    await screen.findByRole('article', { name: 'First result' });
    expect(screen.getByRole('searchbox', { name: 'Search events by title or venue' })).toHaveValue('Cloud');
  });
  it('applies pending search at page one if Next is pressed before debounce completes', async () => {
    const fetcher = boundary(() => publicList([publicEvent], { limit: 1, total: 2, totalPages: 2 })); show('/events?limit=1');
    await screen.findByRole('article', { name: publicEvent.title });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search events by title or venue' }), 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(calls(fetcher).at(-1)?.[0]).toContain('q=New'));
    expect(calls(fetcher).some(([path]) => path.includes('page=2'))).toBe(false);
  });
  it('recovers malformed URL values without forwarding invalid parameters', async () => {
    const fetcher = boundary(() => publicList([])); show('/events?price=cheap&limit=999&status=DRAFT&from=not-a-date');
    await screen.findByText('The next good thing is on its way.'); expect(screen.getByText(/Some search parameters were invalid/)).toBeInTheDocument();
    expect(calls(fetcher).at(-1)?.[0]).toBe('/api/events?page=1&limit=12&sort=soonest&price=all');
  });
  it('displays free events and browses even when session restoration is unavailable', async () => {
    boundary(() => publicList([{ ...publicEvent, pricePaise: 0 }]), failure(503)); show();
    const card = await screen.findByRole('article', { name: publicEvent.title });
    expect(within(card).getByText('₹0.00')).toBeInTheDocument(); expect(within(card).getByText('FREE EVENT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Session unavailable/ })).toBeInTheDocument();
  });
  it('allows verified organizers to browse the same public marketplace', async () => {
    boundary(() => publicList(), userResponse(organizer)); show();
    await screen.findByRole('article', { name: publicEvent.title });
    expect(screen.getByRole('link', { name: 'My Events' })).toHaveAttribute('href', '/organizer/events');
  });
});
