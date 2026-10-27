import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { App } from '@/App';
import { AuthProvider } from '@/context/AuthProvider';
import '@/pages/organizer/OrganizerAnalyticsPage';
import '@/pages/organizer/EventCheckInPage';
import { attendee, failure, json, organizer, userResponse } from './fixtures';
import { eventResponse, eventsResponse, sampleEvent } from './events-fixtures';
import { publicDetail, publicList } from './discovery-fixtures';
import { reservationList, reservationResponse } from './reservations-fixtures';
import { ticketList, summary } from './tickets-fixtures';
import { analyticsResponse } from './analytics-fixtures';
import { historyResponse } from './checkin-fixtures';

describe('automated semantic accessibility at the real app/provider/HTTP boundary', () => {
  it.each([
    ['/', 'guest', /Your next/], ['/login', 'guest', 'Welcome back.'], ['/register', 'guest', 'Make yourself at home.'],
    ['/events', 'guest', 'Explore Events'], [`/events/${sampleEvent.id}`, 'guest', sampleEvent.title],
    ['/organizer/events/new', 'organizer', /Create an event/], ['/organizer/events', 'organizer', 'My Events.'],
    ['/organizer/analytics', 'organizer', 'Analytics.'],
    [`/organizer/events/${sampleEvent.id}/check-in`, 'organizer', 'Event check-in.'],
    ['/attendee/reservations', 'attendee', 'My Reservations.'],
    [`/attendee/reservations/707f1f77bcf86cd799439011`, 'attendee', sampleEvent.title],
    ['/attendee/tickets', 'attendee', 'My Tickets.']
  ] as const)('%s (%s) has no detected semantic violations', async (path, identity, heading) => {
    // Preserve jsdom's unavailable renderer (null), without its console warning.
    // axe can mark rendering-dependent checks incomplete; this is no contrast proof.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/auth/me') return identity === 'guest' ? failure(401) : userResponse(identity === 'organizer' ? organizer : attendee);
      if (url === '/api/health') return json({ success: true, message: 'KairoPass API is running' });
      if (url.startsWith('/api/organizer/analytics/')) return analyticsResponse();
      if (url.includes('/check-ins?')) return historyResponse();
      if (url === '/api/organizer/events/' + sampleEvent.id) return eventResponse();
      if (url.startsWith('/api/organizer/events?')) return eventsResponse();
      if (url === '/api/events/' + sampleEvent.id) return publicDetail();
      if (url.startsWith('/api/events?')) return publicList();
      if (url.startsWith('/api/reservations?')) return reservationList();
      if (url === '/api/reservations/707f1f77bcf86cd799439011') return reservationResponse();
      if (url.startsWith('/api/reservations/') && url.includes('/payments?')) return json({ success: true, data: { payments: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } } });
      if (url.startsWith('/api/tickets?')) return ticketList([summary()]);
      throw new Error('Unexpected accessibility fixture route: ' + url);
    }));
    render(<MemoryRouter useTransitions={false} initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
    await screen.findByRole('heading', { name: heading });
    if (path === '/organizer/analytics') await screen.findByRole('region', { name: 'Simulated Gross Revenue' });
    if (path.endsWith('/check-in')) await screen.findByLabelText('Signed QR credential');
    if (path === '/attendee/tickets' || path === '/attendee/reservations') await screen.findByRole('heading', { name: sampleEvent.title });
    await waitFor(() => expect(screen.queryByText(/Loading (your analytics|your tickets|your reservations|events|admission context)…/)).not.toBeInTheDocument());
    // jsdom cannot evaluate rendered color contrast. Actual browser layout,
    // keyboard and selected color pairs are audited separately, not claimed here.
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map(({ id, nodes }) => ({ id, elements: nodes.map((node) => node.target) }))).toEqual([]);
  });
});
