import { describe, expect, it, vi } from 'vitest';
import { reservationsApi } from '@/services/reservations';
import { safeAuthDestination } from '@/lib/auth-navigation';
import { held, reservationList, reservationResponse } from './reservations-fixtures';
import { failure, json } from './fixtures';
const signal = () => new AbortController().signal;
describe('typed reservation HTTP boundary', () => {
  it('uses relative same-origin APIs and sends only eventId on creation', async () => {
    const fetcher = vi.fn(() => Promise.resolve(reservationResponse(held, undefined, 201))); vi.stubGlobal('fetch', fetcher);
    expect((await reservationsApi.create(held.eventId, signal())).reservation).toEqual(held);
    expect(fetcher.mock.calls[0]).toMatchObject(['/api/reservations', { method: 'POST', credentials: 'same-origin', body: JSON.stringify({ eventId: held.eventId }) }]);
  });
  it('parses actual pagination and status query and issues bodyless cancellation', async () => {
    const fetcher = vi.fn((path: string) => Promise.resolve(path.includes('?') ? reservationList() : reservationResponse())); vi.stubGlobal('fetch', fetcher);
    expect((await reservationsApi.list(1, 'HELD', signal())).pagination.total).toBe(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/reservations?page=1&limit=10&status=HELD');
    await reservationsApi.cancel(held.id, signal());
    expect(fetcher.mock.calls[1]).toMatchObject(['/api/reservations/' + held.id + '/cancel', { method: 'POST' }]);
  });
  it.each([
    { ...held, userId: 'private' }, { ...held, status: 'PAID' }, { ...held, amountPaise: -1 },
    { ...held, amountPaise: 1.1 }, { ...held, expiresAt: 'invalid' }, { ...held, event: { ...held.event, organizerId: 'private' } },
    { ...held, event: { ...held.event, id: 'different' } }
  ])('rejects unsafe reservation DTO %#', async (reservation) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ success: true, data: { reservation, serverNow: held.createdAt } }))));
    await expect(reservationsApi.get(held.id, signal())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('accepts retained history when the event is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(reservationResponse({ ...held, status: 'EXPIRED', event: null }))));
    expect((await reservationsApi.get(held.id, signal())).reservation.event).toBeNull();
  });
  it.each(['bad', '//evil.test', '00000000000000000000000g'])('rejects invalid resource %s without HTTP', async (id) => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(() => reservationsApi.get(id, signal())).toThrow('could not be found'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('shows allowlisted errors without reflecting private messages', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(failure(409, 'EVENT_SOLD_OUT'))));
    await expect(reservationsApi.create(held.eventId, signal())).rejects.toMatchObject({ status: 409, code: 'EVENT_SOLD_OUT', message: expect.stringContaining('sold out') });
  });
  it.each(['ATTENDEE', 'ORGANIZER'] as const)('allows a local original event after %s login', (role) => {
    const path = '/events/' + held.eventId + '?price=paid'; expect(safeAuthDestination(role, path)).toBe(path);
    expect(safeAuthDestination(role, '//evil.test/events/' + held.eventId)).toBe(`/${role.toLowerCase()}/dashboard`);
  });
  it('allowlists owned reservation routes only for attendees', () => {
    expect(safeAuthDestination('ATTENDEE', '/attendee/reservations/' + held.id)).toBe('/attendee/reservations/' + held.id);
    expect(safeAuthDestination('ORGANIZER', '/attendee/reservations/' + held.id)).toBe('/organizer/dashboard');
  });
});
