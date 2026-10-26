import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthProvider } from '@/context/AuthProvider';
import { deferred, failure, json, organizer, userResponse } from './fixtures';
import { eventResponse, eventsResponse, sampleEvent } from './events-fixtures';
import type { OrganizerEvent } from '@/types/events';

function show(path = '/organizer/events/' + sampleEvent.id) {
  return render(<MemoryRouter useTransitions={false} initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}
function backend(handle: (path: string, options: RequestInit) => Response | Promise<Response>) {
  const fetcher = vi.fn((path: string, options: RequestInit) => Promise.resolve(path === '/api/auth/me' ? userResponse(organizer)
    : path === '/api/health' ? json({ success: true, message: 'KairoPass API is running' }) : path === '/api/auth/logout' ? json({ success: true, message: 'Logged out successfully.' }) : handle(path, options)));
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
const draft: OrganizerEvent = { ...sampleEvent, reservedCount: 0 };
describe('confirmed lifecycle actions and organizer workspace', () => {
  it('traps confirmation focus, supports Escape, prevents duplicates, and refreshes after publication', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    let current = draft; const pending = deferred<Response>();
    const fetcher = backend((path) => path.endsWith('/publish') ? pending.promise : eventResponse(current));
    show(); await screen.findByRole('heading', { name: current.title });
    const publish = screen.getByRole('button', { name: 'Publish event' }); await userEvent.click(publish);
    let dialog = screen.getByRole('dialog', { name: 'Publish this event?' });
    expect(dialog).toHaveTextContent('Ticket price, capacity, schedule, and registration deadline become locked');
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    expect(fetcher.mock.calls.some(([path]) => path.endsWith('/publish'))).toBe(false);
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(within(dialog).getByRole('button', { name: 'Confirm publication' })).toHaveFocus();
    await userEvent.keyboard('{Tab}'); expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    await userEvent.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(publish).toHaveFocus();
    await userEvent.click(publish); dialog = screen.getByRole('dialog');
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Confirm publication' }));
    expect(fetcher.mock.calls.filter(([path]) => path.endsWith('/publish'))).toHaveLength(1);
    expect(screen.queryByText('Published')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Confirming…' })).toBeDisabled();
    current = { ...draft, status: 'PUBLISHED' };
    await act(async () => { pending.resolve(eventResponse(current)); });
    expect(await screen.findByText('Event published successfully.')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/organizer/events/' + current.id)).toHaveLength(2);
    expect(storage).not.toHaveBeenCalled();
  });
  it('keeps draft status on failed publication and requires reload after a conflict', async () => {
    backend((path) => path.endsWith('/publish') ? failure(409, 'EVENT_NOT_PUBLISHABLE') : eventResponse(draft)); show();
    await screen.findByRole('heading', { name: draft.title });
    await userEvent.click(screen.getByRole('button', { name: 'Publish event' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm publication' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('still in the future');
    expect(screen.getByText('Draft')).toBeInTheDocument(); expect(screen.queryByText('Event published successfully.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm publication' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reload latest event' })).toBeInTheDocument();
  });
  it('requires explicit cancellation, preserves records, and hides terminal actions after success', async () => {
    let current: OrganizerEvent = { ...draft, status: 'PUBLISHED' };
    const fetcher = backend((path) => {
      if (path.endsWith('/cancel')) current = { ...current, status: 'CANCELLED' };
      return eventResponse(current);
    });
    show(); await screen.findByRole('heading', { name: current.title });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel event' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('No refunds are performed here.');
    await userEvent.click(screen.getByRole('button', { name: 'Keep event' }));
    expect(fetcher.mock.calls.some(([path]) => path.endsWith('/cancel'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel event' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    expect(await screen.findByText('Event cancelled successfully. Its record has been retained.')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel event' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit event information' })).not.toBeInTheDocument();
    expect(screen.getByText(current.description)).toBeInTheDocument();
  });
  it('honors backend active-reservation conflicts without claiming cancellation or refunds', async () => {
    backend((path) => path.endsWith('/cancel') ? failure(409, 'EVENT_HAS_ACTIVE_RESERVATIONS') : eventResponse(draft)); show();
    await screen.findByRole('heading', { name: draft.title });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel event' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This event has active reservations and cannot be cancelled through this action.');
    expect(screen.getByText('Draft')).toBeInTheDocument(); expect(screen.queryByText('Event cancelled successfully.')).not.toBeInTheDocument();
  });
  it('disables known ineligible actions while leaving the server authoritative', async () => {
    backend(() => eventResponse({ ...draft, reservedCount: 1, registrationDeadline: '2020-01-01T00:00:00.000Z' })); show();
    await screen.findByRole('heading', { name: draft.title });
    expect(screen.getByRole('button', { name: 'Publish event' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel event' })).toBeDisabled();
    expect(screen.getByText('Active reserved inventory prevents cancellation.')).toBeInTheDocument();
  });
  it.each([false, true])('disables publication when the deadline elapses with confirmation open=%s', async (openDialog) => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const now = Date.parse('2040-01-01T00:00:00Z'); vi.setSystemTime(now);
    const event = { ...draft, registrationDeadline: new Date(now + 1000).toISOString() };
    const fetcher = backend(() => eventResponse(event));
    await act(async () => { show(); });
    const publish = screen.getByRole('button', { name: 'Publish event' }); expect(publish).toBeEnabled();
    if (openDialog) fireEvent.click(publish);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(publish).toBeDisabled();
    if (openDialog) expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm publication' })).toBeDisabled();
    expect(fetcher.mock.calls.some(([path]) => path.endsWith('/publish'))).toBe(false);
  });
  it('shows real recent dashboard events and bounded API totals, with functional workspace links', async () => {
    const recent = Array.from({ length: 3 }, (_, index) => ({ ...draft, id: draft.id.slice(0, -1) + String(index), title: 'Recent event ' + index }));
    backend(() => eventsResponse(recent, { limit: 3, total: 10, totalPages: 4 })); show('/organizer/dashboard');
    expect(await screen.findByText('10 events in your workspace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recent event 0' })).toHaveAttribute('href', '/organizer/events/' + recent[0]!.id);
    const workspace = screen.getByRole('navigation', { name: 'Organizer workspace' });
    expect(within(workspace).getByRole('link', { name: 'My Events' })).toHaveAttribute('href', '/organizer/events');
    expect(within(workspace).getByRole('link', { name: 'Create Event' })).toHaveAttribute('href', '/organizer/events/new');
    expect(screen.queryByText(/revenue/i)).not.toBeInTheDocument();
  });
  it('refreshes persisted details after an edit instead of relying on local form state', async () => {
    let current = { ...draft, status: 'PUBLISHED' as const };
    const fetcher = backend((_path, options) => {
      if (options.method === 'PATCH') current = { ...current, ...JSON.parse(String(options.body)) };
      return eventResponse(current);
    });
    show('/organizer/events/' + draft.id + '/edit');
    const input = await screen.findByLabelText('Event title'); await userEvent.clear(input); await userEvent.type(input, 'Persisted edited title');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('heading', { name: 'Persisted edited title' })).toBeInTheDocument();
    expect(screen.getByText('Event updated successfully.')).toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([path, options]) => path === '/api/organizer/events/' + draft.id && options.method === 'GET')).toHaveLength(2);
  });
  it('removes event content after confirmed logout', async () => {
    backend(() => eventResponse(draft)); show(); await screen.findByRole('heading', { name: draft.title });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: /Your next/ })).toBeInTheDocument();
    expect(screen.queryByText(draft.description)).not.toBeInTheDocument();
  });
  it('restores a safe event destination through the real login flow', async () => {
    let signedIn = false;
    vi.stubGlobal('fetch', vi.fn((path: string) => {
      if (path === '/api/health') return Promise.resolve(json({ success: true, message: 'KairoPass API is running' }));
      if (path === '/api/auth/me') return Promise.resolve(signedIn ? userResponse(organizer) : failure(401));
      if (path === '/api/auth/login') { signedIn = true; return Promise.resolve(userResponse(organizer)); }
      return Promise.resolve(eventResponse(draft));
    }));
    show(); await screen.findByRole('heading', { name: 'Welcome back.' });
    await userEvent.type(screen.getByLabelText('Email address'), organizer.email);
    await userEvent.type(screen.getByLabelText('Password'), 'Test-only password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: draft.title })).toBeInTheDocument();
  });
  it('revalidates expired sessions and blocks protected content', async () => {
    let checks = 0;
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(path === '/api/health' ? json({ success: true, message: 'KairoPass API is running' })
      : path === '/api/auth/me' ? ++checks === 1 ? userResponse(organizer) : failure(401) : failure(401))));
    show(); expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    await waitFor(() => expect(checks).toBe(2)); expect(screen.queryByText(draft.description)).not.toBeInTheDocument();
  });
});
