import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthProvider';
import { CreateEventPage } from '@/pages/organizer/CreateEventPage';
import { EditEventPage } from '@/pages/organizer/EditEventPage';
import { initialEventValues } from '@/lib/event-form';
import { deferred, failure, json, organizer, userResponse } from './fixtures';
import { eventResponse, sampleEvent } from './events-fixtures';

function show(path = '/organizer/events/new') {
  return render(<MemoryRouter useTransitions={false} initialEntries={[path]}><AuthProvider><Routes>
    <Route path="/organizer/events/new" element={<CreateEventPage />} />
    <Route path="/organizer/events/:id/edit" element={<EditEventPage />} />
    <Route path="/organizer/events/:id" element={<h1>Saved event destination</h1>} />
  </Routes></AuthProvider></MemoryRouter>);
}
async function fillCreate() {
  const values = initialEventValues(sampleEvent); const user = userEvent.setup();
  for (const [label, key] of [['Event title', 'title'], ['Venue', 'venue'], ['Capacity', 'capacity'], ['Ticket price (INR)', 'pricePaise']] as const) {
    await user.type(screen.getByLabelText(label), values[key]);
  }
  for (const [label, key] of [['Start date and time', 'startAt'], ['End date and time', 'endAt'], ['Registration deadline', 'registrationDeadline']] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: values[key] } });
  }
  return user;
}
function boundary(respond: (path: string, options: RequestInit) => Response | Promise<Response> = () => eventResponse()) {
  const fetcher = vi.fn((path: string, options: RequestInit) => Promise.resolve(path === '/api/auth/me' ? userResponse(organizer) : respond(path, options)));
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
describe('shared event creation and editing forms', () => {
  it('renders associated fields and required errors without making a write', async () => {
    const fetcher = boundary(); show();
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getByText('Use 3–120 characters for the event title.')).toBeInTheDocument();
    expect(screen.getByLabelText('Event title')).toHaveFocus();
    expect(fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
  });
  it('creates a real draft request, converts rupees, and navigates after success', async () => {
    const fetcher = boundary(() => eventResponse(sampleEvent, 201)); show(); const user = await fillCreate();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('heading', { name: 'Saved event destination' })).toBeInTheDocument();
    const body = JSON.parse(String(fetcher.mock.calls.find(([, options]) => options.method === 'POST')?.[1].body));
    expect(body).toMatchObject({ title: sampleEvent.title, pricePaise: 19900, capacity: 100, startAt: sampleEvent.startAt });
    expect(body).not.toHaveProperty('status'); expect(body).not.toHaveProperty('organizerId');
  });
  it('supports free events and blocks duplicate submissions while pending', async () => {
    const pending = deferred<Response>(); const fetcher = boundary(() => pending.promise); show(); const user = await fillCreate();
    await user.clear(screen.getByLabelText('Ticket price (INR)')); await user.type(screen.getByLabelText('Ticket price (INR)'), '0.00');
    await user.dblClick(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    expect(JSON.parse(String(fetcher.mock.calls.at(-1)?.[1].body)).pricePaise).toBe(0);
    pending.resolve(eventResponse({ ...sampleEvent, pricePaise: 0 }, 201));
    await screen.findByRole('heading', { name: 'Saved event destination' });
  });
  it('shows safe server validation errors and preserves entered values', async () => {
    boundary(() => json({ success: false, error: { code: 'INVALID_EVENT_INPUT', details: [{ field: 'title', message: 'raw secret' }] } }, 400));
    show(); const user = await fillCreate(); await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please review the event details');
    expect(screen.getByLabelText('Event title')).toHaveValue(sampleEvent.title);
    expect(screen.getByLabelText('Event title')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('raw secret')).not.toBeInTheDocument();
  });
  it('sends only permitted changed fields for published edits and locks schedule/economics', async () => {
    const published = { ...sampleEvent, status: 'PUBLISHED' as const };
    const fetcher = boundary(() => eventResponse(published)); show('/organizer/events/' + sampleEvent.id + '/edit');
    const title = await screen.findByLabelText('Event title');
    for (const label of ['Start date and time', 'End date and time', 'Registration deadline', 'Capacity', 'Ticket price (INR)']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('readonly');
    }
    await userEvent.clear(title); await userEvent.type(title, 'Updated published title');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('heading', { name: 'Saved event destination' });
    expect(JSON.parse(String(fetcher.mock.calls.find(([, options]) => options.method === 'PATCH')?.[1].body))).toEqual({ title: 'Updated published title' });
  });
  it('reloads conflicts explicitly and replaces unsaved edits with the latest server state', async () => {
    let latest = sampleEvent;
    boundary((_path, options) => options.method === 'PATCH' ? failure(409, 'EVENT_UPDATE_CONFLICT') : eventResponse(latest));
    show('/organizer/events/' + sampleEvent.id + '/edit');
    const title = await screen.findByLabelText('Event title'); await userEvent.clear(title); await userEvent.type(title, 'Unsaved edit');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The event changed');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    latest = { ...sampleEvent, title: 'New server title', status: 'PUBLISHED' };
    await userEvent.click(screen.getByRole('button', { name: 'Reload latest event' }));
    await waitFor(() => expect(screen.getByLabelText('Event title')).toHaveValue('New server title'));
    expect(screen.getByLabelText('Capacity')).toHaveAttribute('readonly');
  });
  it('makes cancelled events read-only even on direct edit navigation', async () => {
    boundary(() => eventResponse({ ...sampleEvent, status: 'CANCELLED' })); show('/organizer/events/' + sampleEvent.id + '/edit');
    expect(await screen.findByRole('heading', { name: 'This event is read-only.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});
