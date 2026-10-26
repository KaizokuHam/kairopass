import { describe, expect, it, vi } from 'vitest';
import { eventsApi } from '@/services/events';
import { eventResponse, eventsResponse, sampleEvent } from './events-fixtures';
import { failure, json } from './fixtures';

const signal = () => new AbortController().signal;
const input = { title: sampleEvent.title, description: sampleEvent.description, venue: sampleEvent.venue, startAt: sampleEvent.startAt,
  endAt: sampleEvent.endAt, registrationDeadline: sampleEvent.registrationDeadline, capacity: 100, pricePaise: 19900 };
describe('typed organizer event API', () => {
  it('uses actual relative endpoints, PATCH, same-origin cookies, and allowlisted mutation fields', async () => {
    const fetcher = vi.fn().mockImplementation((path: string) => Promise.resolve(path.includes('?') ? eventsResponse() : eventResponse()));
    vi.stubGlobal('fetch', fetcher);
    await eventsApi.createEvent({ ...input, organizerId: 'forged', status: 'PUBLISHED' } as typeof input, signal());
    await eventsApi.getOrganizerEvents({ status: 'DRAFT', search: '[cloud]', page: 2, limit: 10, sort: 'oldest' }, signal());
    await eventsApi.getOrganizerEvent(sampleEvent.id, signal());
    await eventsApi.updateEvent(sampleEvent.id, { title: 'Changed', reservedCount: 900 } as { title: string }, signal());
    await eventsApi.publishEvent(sampleEvent.id, signal()); await eventsApi.cancelEvent(sampleEvent.id, signal());
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/organizer/events', '/api/organizer/events?page=2&limit=10&sort=oldest&status=DRAFT&search=%5Bcloud%5D',
      `/api/organizer/events/${sampleEvent.id}`, `/api/organizer/events/${sampleEvent.id}`, `/api/organizer/events/${sampleEvent.id}/publish`, `/api/organizer/events/${sampleEvent.id}/cancel`]);
    expect(fetcher.mock.calls[3]?.[1]).toMatchObject({ method: 'PATCH', credentials: 'same-origin', body: JSON.stringify({ title: 'Changed' }) });
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual(input);
    for (const [, options] of fetcher.mock.calls) {
      expect(options.headers).not.toHaveProperty('Origin'); expect(options.headers).not.toHaveProperty('Authorization');
    }
  });
  it.each([
    { ...sampleEvent, status: 'ARCHIVED' }, { ...sampleEvent, reservedCount: 101 }, { ...sampleEvent, pricePaise: 1.2 },
    { ...sampleEvent, startAt: 'not-a-date' }, { ...sampleEvent, __v: 1 }, { ...sampleEvent, organizerId: 'bad' }
  ])('rejects malformed or private event responses (case %#)', async (event) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ success: true, data: { event } })));
    await expect(eventsApi.getOrganizerEvent(sampleEvent.id, signal())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('rejects inconsistent pagination and invalid resource IDs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(eventsResponse([], { total: 10, totalPages: 1 })));
    await expect(eventsApi.getOrganizerEvents({}, signal())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(() => eventsApi.getOrganizerEvent('../private', signal())).toThrow('event address is invalid');
  });
  it.each(['EVENT_UPDATE_CONFLICT', 'EVENT_HAS_ACTIVE_RESERVATIONS', 'EVENT_NOT_PUBLISHABLE', 'INVALID_EVENT_STATE'])('provides a safe domain message for %s', async (code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failure(409, code)));
    await expect(eventsApi.publishEvent(sampleEvent.id, signal())).rejects.toMatchObject({ code, status: 409 });
    await expect(eventsApi.publishEvent(sampleEvent.id, signal())).rejects.not.toHaveProperty('message', expect.stringContaining('secret-bearing'));
  });
  it('retains only allowlisted validation field paths, never raw server messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ success: false, error: { code: 'INVALID_EVENT_INPUT', details: [
      { field: 'title', message: 'secret-bearing message' }, { field: 'passwordHash', message: 'private' }
    ] } }, 400)));
    await expect(eventsApi.createEvent(input, signal())).rejects.toMatchObject({ fields: ['title'], message: 'Please review the event details and highlighted fields.' });
  });
});
