import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { Event } from '../src/models/index.js';
import { useDisposableDatabase } from './helpers/database.js';
import { actor, createDraft, eventInput, eventsApp, eventTime, origin, type EventsApp } from './helpers/events.js';

useDisposableDatabase();
let app: EventsApp;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(eventTime); app = eventsApp();
});

describe('server-side discovery queries', () => {
  it.each(['q=cloud', 'q=CLOUD', 'q=%20cloud%20', 'q=bEngALuRu', 'venue=BENGALURU'])('searches persisted titles and venues, case-insensitively (%s)', async (query) => {
    const match = await persist();
    await persist({ title: 'Art After Hours', venue: 'Mumbai' });
    await persist({ title: eventInput.title, status: 'DRAFT' });
    await persist({ title: eventInput.title, status: 'CANCELLED' });
    expect(ids(await request(app).get('/api/events?' + query).expect(200))).toEqual([match.id]);
  });
  it.each(['q', 'venue'])('treats regex syntax as a literal substring in %s', async (field) => {
    const event = await persist({ title: 'Cloud [A.*] Workshop', venue: 'Room [A.*]' });
    await persist({ title: 'Cloud ABC Workshop', venue: 'Room ABC' });
    expect(ids(await request(app).get('/api/events').query({ [field]: '[a.*]' }).expect(200))).toEqual([event.id]);
    expect(ids(await request(app).get('/api/events').query({ [field]: '.*' }).expect(200))).toEqual([event.id]);
    expect(ids(await request(app).get('/api/events').query({ [field]: '$ne' }).expect(200))).toEqual([]);
  });
  it.each(['', 'q=', 'q=%20%20&venue=%20', 'price=all'])('treats an empty search/all price as unfiltered (%s)', async (query) => {
    const event = await persist();
    expect(ids(await request(app).get('/api/events?' + query).expect(200))).toEqual([event.id]);
  });
  it('filters free and paid events without rounding integer paise', async () => {
    const free = await persist({ pricePaise: 0 }); const paid = await persist({ pricePaise: 1 });
    expect(ids(await request(app).get('/api/events?price=free').expect(200))).toEqual([free.id]);
    expect(ids(await request(app).get('/api/events?price=paid').expect(200))).toEqual([paid.id]);
  });
  it('uses inclusive ISO date boundaries, honors offsets, and combines all filters', async () => {
    const match = await persist();
    await persist({ pricePaise: 0 }); await persist({ venue: 'Mumbai' });
    await persist({ startAt: '2040-03-10T10:00:00Z', endAt: '2040-03-10T13:00:00Z' });
    const response = await request(app).get('/api/events').query({ q: 'Cloud', venue: 'Bengaluru', price: 'paid',
      from: '2040-02-10T15:30:00+05:30', to: '2040-02-10T10:00:00Z' }).expect(200);
    expect(ids(response)).toEqual([match.id]);
    const outside = await request(app).get('/api/events').query({ to: '2040-02-10T09:59:59.999Z' }).expect(200);
    expect(ids(outside)).toEqual([]);
  });
  it('does not allow an old from boundary to include past events', async () => {
    await persist({ startAt: '2039-12-01T00:00:00Z', endAt: '2039-12-02T00:00:00Z', registrationDeadline: '2039-11-30T00:00:00Z' });
    const upcoming = await persist();
    expect(ids(await request(app).get('/api/events?from=2039-01-01T00:00:00Z').expect(200))).toEqual([upcoming.id]);
  });
  it('sorts soonest/latest and both price orders with stable date and ObjectId tie-breakers', async () => {
    const first = await persist({ pricePaise: 500 });
    const second = await persist({ pricePaise: 500 });
    const later = await persist({ pricePaise: 0, startAt: '2040-02-11T10:00:00Z', endAt: '2040-02-11T13:00:00Z' });
    for (const [sort, expected] of [
      ['soonest', [first.id, second.id, later.id]], ['latest', [later.id, second.id, first.id]],
      ['price_asc', [later.id, first.id, second.id]], ['price_desc', [second.id, first.id, later.id]]
    ] as const) {
      expect(ids(await request(app).get('/api/events?sort=' + sort).expect(200))).toEqual(expected);
    }
  });
  it('counts all persisted matches, paginates on the server, and handles pages beyond the end', async () => {
    const events = [];
    for (let index = 0; index < 14; index++) events.push(await persist({ title: 'Persistent meetup ' + index }));
    await persist({ title: 'Hidden meetup', status: 'DRAFT' });
    const first = await request(app).get('/api/events?q=Persistent').expect(200);
    expect(ids(first)).toEqual(events.slice(0, 12).map((event) => event.id));
    expect(first.body.data.pagination).toEqual({ page: 1, limit: 12, total: 14, totalPages: 2 });
    const second = await request(app).get('/api/events?q=Persistent&page=2').expect(200);
    expect(ids(second)).toEqual(events.slice(12).map((event) => event.id));
    const outside = await request(app).get('/api/events?q=Persistent&page=3').expect(200);
    expect(ids(outside)).toEqual([]);
    expect(outside.body.data.pagination).toEqual({ page: 3, limit: 12, total: 14, totalPages: 2 });
    const bounded = await request(app).get('/api/events?limit=1&page=2').expect(200);
    expect(ids(bounded)).toEqual([events[1]!.id]);
  });
  it.each(['page=0', 'page=-1', 'page=1.5', 'page=10001', 'page=01', 'page=1&page=2', 'limit=0', 'limit=51',
    'limit=1e2', 'sort=popular', 'price=cheap', 'q=' + 'x'.repeat(121), 'venue=' + 'x'.repeat(201),
    'q[$ne]=private', 'venue[$regex]=.*', 'status=DRAFT', 'organizerId=forged', 'q=a&q=b',
    'from=2040-02-30T00:00:00Z', 'from=2040-02-10', 'from=2040-02-10T10:00:00', 'to=not-a-date',
    'from=2040-03-01T00:00:00Z&to=2040-02-01T00:00:00Z'])('rejects malformed, unbounded, or injected query %s', async (query) => {
    const response = await request(app).get('/api/events?' + query).expect(400);
    expect(response.body.error.code).toBe('INVALID_DISCOVERY_QUERY');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });
  it('verifies additive schedule and price indexes without removing the established index', async () => {
    const indexes = await Event.collection.listIndexes().toArray();
    expect(indexes.find((index) => index.name === 'event_discovery')?.key).toEqual({ status: 1, startAt: 1 });
    expect(indexes.find((index) => index.name === 'event_public_schedule')?.key).toEqual({ status: 1, startAt: 1, _id: 1 });
    expect(indexes.find((index) => index.name === 'event_public_price')?.key).toEqual({ status: 1, pricePaise: 1, startAt: 1, _id: 1 });
  });
  it('reports query timeouts and database failures as safe failures rather than empty results', async () => {
    const timeout = vi.spyOn(Event, 'aggregate').mockImplementationOnce(() => { throw new mongoose.mongo.MongoServerError({ code: 50, message: 'private driver query' }); });
    const response = await request(app).get('/api/events').expect(503);
    expect(response.body.error.code).toBe('EVENT_QUERY_TIMEOUT');
    expect(JSON.stringify(response.body)).not.toContain('private driver query'); timeout.mockRestore();
    const unavailable = vi.spyOn(Event, 'findOne').mockImplementationOnce(() => { const error = new Error('mongodb://private:password@host'); error.name = 'MongoNetworkError'; throw error; });
    const detail = await request(app).get('/api/events/' + '0'.repeat(24)).expect(503);
    expect(detail.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(JSON.stringify(detail.body)).not.toContain('password'); unavailable.mockRestore();
  });
});
afterEach(() => vi.useRealTimers());

async function persist(overrides: Record<string, unknown> = {}) {
  return Event.create({ ...eventInput, organizerId: new Types.ObjectId(), status: 'PUBLISHED', ...overrides });
}
const ids = (response: { body: { data: { events: { id: string }[] } } }) => response.body.data.events.map((event) => event.id);

describe('anonymous upcoming event visibility', () => {
  it('returns a genuine empty page with public defaults and no-store caching', async () => {
    const response = await request(app).get('/api/events').expect(200);
    expect(response.body).toEqual({ success: true, data: { events: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } } });
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('exposes an organizer-created event only after publication and hides it again after cancellation', async () => {
    const organizer = await actor(app);
    const draft = await createDraft(app, organizer.cookie).expect(201);
    const id = draft.body.data.event.id as string;
    expect(ids(await request(app).get('/api/events').expect(200))).toEqual([]);
    await request(app).get('/api/events/' + id).expect(404);
    await request(app).post(`/api/organizer/events/${id}/publish`).set('Origin', origin).set('Cookie', organizer.cookie).expect(200);
    expect(ids(await request(app).get('/api/events').expect(200))).toEqual([id]);
    await request(app).get('/api/events/' + id).expect(200);
    await request(app).post(`/api/organizer/events/${id}/cancel`).set('Origin', origin).set('Cookie', organizer.cookie).expect(200);
    expect(ids(await request(app).get('/api/events').expect(200))).toEqual([]);
    await request(app).get('/api/events/' + id).expect(404);
    const history = await request(app).get('/api/organizer/events/' + id).set('Cookie', organizer.cookie).expect(200);
    expect(history.body.data.event.status).toBe('CANCELLED');
  });
  it.each(['DRAFT', 'CANCELLED'])('hides %s from both public endpoints', async (status) => {
    const event = await persist({ status });
    expect(ids(await request(app).get('/api/events').expect(200))).toEqual([]);
    await request(app).get('/api/events/' + event.id).expect(404);
  });
  it.each([-1, 0])('excludes an event whose start is now or earlier (%s ms)', async (offset) => {
    const startAt = new Date(eventTime.getTime() + offset);
    const event = await persist({ startAt, endAt: new Date(startAt.getTime() + 3600000), registrationDeadline: startAt });
    expect(ids(await request(app).get('/api/events').expect(200))).toEqual([]);
    await request(app).get('/api/events/' + event.id).expect(404);
  });
  it('keeps upcoming registration-closed and sold-out events visible', async () => {
    const closed = await persist({ registrationDeadline: eventTime });
    const sold = await persist({ reservedCount: eventInput.capacity });
    expect(ids(await request(app).get('/api/events').expect(200))).toEqual([closed.id, sold.id]);
    for (const id of [closed.id, sold.id]) await request(app).get('/api/events/' + id).expect(200);
  });
  it('does not depend on valid JWT configuration, cookies, or Origin for public reads', async () => {
    await persist();
    const publicApp = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: {} });
    const response = await request(publicApp).get('/api/events').set('Cookie', 'kairopass_session=invalid').set('Origin', 'https://untrusted.example').expect(200);
    await request(publicApp).get('/api/events/' + response.body.data.events[0].id).expect(200);
    await request(publicApp).get('/api/organizer/events').expect(503);
  });
  it('returns the identical safe 404 contract for malformed, missing, and private identifiers', async () => {
    const privateEvent = await persist({ status: 'DRAFT' });
    for (const id of ['not-an-id', '0'.repeat(23) + 'g', '0'.repeat(24), privateEvent.id]) {
      const response = await request(app).get('/api/events/' + id).expect(404);
      expect(response.body.error).toMatchObject({ code: 'EVENT_NOT_FOUND', message: 'Event not found.' });
      expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    }
  });
  it('projects only the dedicated public DTO in list and detail, without organizer or database metadata', async () => {
    const event = await persist();
    const listing = await request(app).get('/api/events').expect(200);
    const detail = await request(app).get('/api/events/' + event.id).expect(200);
    const dto = detail.body.data.event;
    expect(dto).toEqual(listing.body.data.events[0]);
    expect(Object.keys(dto).sort()).toEqual(['capacity', 'createdAt', 'description', 'endAt', 'id', 'pricePaise', 'registrationDeadline', 'reservedCount', 'startAt', 'status', 'title', 'venue']);
    expect(dto).toMatchObject({ status: 'PUBLISHED', pricePaise: 19900, reservedCount: 0 });
    expect(JSON.stringify(dto)).not.toContain(event.organizerId.toHexString());
  });
  it('keeps organizer reads and writes protected, and public endpoints read-only', async () => {
    const event = await persist(); const attendee = await actor(app, 'ATTENDEE');
    await request(app).get('/api/organizer/events').expect(401);
    await request(app).get('/api/organizer/events').set('Cookie', attendee.cookie).expect(403);
    await request(app).patch('/api/events/' + event.id).send({ title: 'Forged' }).expect(404);
    await request(app).post('/api/events').send(eventInput).expect(404);
    expect((await Event.findById(event.id).orFail()).title).toBe(eventInput.title);
  });
});
