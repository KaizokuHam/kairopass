import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Event } from '../src/models/index.js';
import { useDisposableDatabase } from './helpers/database.js';
import { actor, createDraft, eventInput, eventsApp, eventTime, origin, type EventsApp } from './helpers/events.js';

useDisposableDatabase();
let app: EventsApp;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(eventTime);
  app = eventsApp();
});

describe('owned event listing and retrieval', () => {
  it('returns an empty page with validated defaults', async () => {
    const organizer = await actor(app);
    const response = await request(app).get('/api/organizer/events').set('Cookie', organizer.cookie).expect(200);
    expect(response.body).toEqual({ success: true, data: { events: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } } });
  });

  it('isolates ownership, paginates deterministically, filters status, and escapes literal search', async () => {
    const owner = await actor(app);
    const other = await actor(app, 'ORGANIZER', 'other@example.test');
    const ids: string[] = [];
    for (const title of ['Cloud Workshop', 'Cloud [A.*]', 'Third Workshop']) {
      const created = await createDraft(app, owner.cookie, { title }).expect(201);
      ids.push(created.body.data.event.id);
    }
    await createDraft(app, other.cookie, { title: 'Private other workshop' }).expect(201);
    await Event.updateOne({ _id: ids[0]! }, { $set: { status: 'PUBLISHED' } });
    const get = (query: string) => request(app).get(`/api/organizer/events${query}`).set('Cookie', owner.cookie).expect(200);
    const newest = await get('?limit=2');
    expect(newest.body.data.events.map((event: { id: string }) => event.id)).toEqual([ids[2], ids[1]]);
    expect(newest.body.data.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    const second = await get('?limit=2&page=2');
    expect(second.body.data.events.map((event: { id: string }) => event.id)).toEqual([ids[0]]);
    expect((await get('?limit=2&page=3')).body.data.events).toEqual([]);
    expect((await get('?sort=oldest')).body.data.events.map((event: { id: string }) => event.id)).toEqual(ids);
    expect((await get('?status=PUBLISHED')).body.data.events.map((event: { id: string }) => event.id)).toEqual([ids[0]]);
    const literal = await get(`?search=${encodeURIComponent('[a.*]')}`);
    expect(literal.body.data.events.map((event: { id: string }) => event.id)).toEqual([ids[1]]);
    expect(literal.body.data.pagination.total).toBe(1);
    const detail = await request(app).get(`/api/organizer/events/${ids[1]}`).set('Cookie', owner.cookie).expect(200);
    expect(detail.body.data.event).toEqual(literal.body.data.events[0]);
    expect(detail.body.data.event).not.toHaveProperty('__v');
  });

  it('returns the same not-found contract for missing and unowned events', async () => {
    const owner = await actor(app);
    const other = await actor(app, 'ORGANIZER', 'other@example.test');
    const created = await createDraft(app, other.cookie).expect(201);
    for (const id of [created.body.data.event.id, '000000000000000000000000']) {
      const response = await request(app).get(`/api/organizer/events/${id}`).set('Cookie', owner.cookie).expect(404);
      expect(response.body.error).toMatchObject({ code: 'EVENT_NOT_FOUND', message: 'Event not found.' });
    }
  });

  it('protects reads for unauthenticated users and attendees', async () => {
    const attendee = await actor(app, 'ATTENDEE');
    for (const path of ['/api/organizer/events', '/api/organizer/events/000000000000000000000000']) {
      await request(app).get(path).expect(401);
      await request(app).get(path).set('Cookie', attendee.cookie).expect(403);
    }
  });

  it.each(['not-an-id', '00000000000000000000000g', '000000000000'])('rejects malformed event id %s', async (id) => {
    const organizer = await actor(app);
    const response = await request(app).get(`/api/organizer/events/${id}`).set('Cookie', organizer.cookie).expect(400);
    expect(response.body.error.code).toBe('INVALID_EVENT_INPUT');
  });

  it.each(['page=0', 'page=-1', 'page=1.5', 'page=10001', 'limit=51', 'limit=0', 'page=1&page=2', 'status=DELETED', 'sort=title', 'search=' + 'a'.repeat(121), 'organizerId=forged', 'status[$ne]=DRAFT'])('rejects invalid/unsafe query %s', async (query) => {
    const organizer = await actor(app);
    await request(app).get(`/api/organizer/events?${query}`).set('Cookie', organizer.cookie).expect(400);
  });
});
afterEach(() => { vi.useRealTimers(); });

describe('organizer event creation', () => {
  it('requires authentication and rejects attendees before persistence', async () => {
    await request(app).post('/api/organizer/events').set('Origin', origin).send(eventInput).expect(401);
    const attendee = await actor(app, 'ATTENDEE');
    const response = await createDraft(app, attendee.cookie).expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(await Event.countDocuments()).toBe(0);
  });

  it('persists an owned draft with zero inventory and an explicit DTO', async () => {
    const organizer = await actor(app);
    const response = await createDraft(app, organizer.cookie, { title: '  A real draft  ', pricePaise: 0 }).expect(201);
    const event = response.body.data.event;
    expect(event).toMatchObject({ organizerId: organizer.id, title: 'A real draft', status: 'DRAFT', reservedCount: 0, pricePaise: 0 });
    expect(Object.keys(event).sort()).toEqual(['capacity', 'createdAt', 'description', 'endAt', 'id', 'organizerId', 'pricePaise', 'registrationDeadline', 'reservedCount', 'startAt', 'status', 'title', 'updatedAt', 'venue']);
    expect(event.createdAt).toBe(eventTime.toISOString());
    const stored = await Event.findById(event.id).orFail();
    expect(stored.organizerId.toHexString()).toBe(organizer.id);
    expect(stored.reservedCount).toBe(0);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('accepts explicit timezone offsets and defaults optional description', async () => {
    const organizer = await actor(app);
    const input: Record<string, unknown> = { ...eventInput, startAt: '2040-02-10T15:30:00+05:30' };
    delete input.description;
    const response = await request(app).post('/api/organizer/events').set('Origin', origin).set('Cookie', organizer.cookie).send(input).expect(201);
    expect(response.body.data.event.startAt).toBe('2040-02-10T10:00:00.000Z');
    expect(response.body.data.event.description).toBe('');
  });

  it.each([
    { title: '' }, { title: 'ab' }, { title: 'a'.repeat(121) }, { venue: ' ' }, { venue: 'v'.repeat(201) },
    { description: 'd'.repeat(10001) }, { capacity: 0 }, { capacity: -1 }, { capacity: 1.5 }, { capacity: 1_000_001 },
    { pricePaise: -1 }, { pricePaise: 1.5 }, { pricePaise: Number.MAX_SAFE_INTEGER + 1 }, { pricePaise: '100' },
    { startAt: '2039-01-01T00:00:00Z' }, { startAt: '2040-02-10T10:00:00' }, { startAt: '2040-02-30T10:00:00Z' },
    { endAt: eventInput.startAt }, { registrationDeadline: eventInput.endAt }
  ])('rejects invalid field boundaries without writing a document (case %#)', async (invalid) => {
    const organizer = await actor(app);
    const response = await createDraft(app, organizer.cookie, invalid).expect(400);
    expect(response.body.error.code).toBe('INVALID_EVENT_INPUT');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    expect(await Event.countDocuments()).toBe(0);
  });

  it.each(['_id', 'organizerId', 'reservedCount', 'status', 'createdAt', 'updatedAt', '__v', '$set'])('rejects protected/unknown field %s', async (field) => {
    const organizer = await actor(app);
    await createDraft(app, organizer.cookie, { [field]: 'forged' }).expect(400);
    expect(await Event.countDocuments()).toBe(0);
  });

  it('rejects missing required fields and non-JSON bodies', async () => {
    const organizer = await actor(app);
    await request(app).post('/api/organizer/events').set('Origin', origin).set('Cookie', organizer.cookie).send({ capacity: 10 }).expect(400);
    await request(app).post('/api/organizer/events').set('Origin', origin).set('Cookie', organizer.cookie)
      .type('text').send(JSON.stringify(eventInput)).expect(400);
    expect(await Event.countDocuments()).toBe(0);
  });

  it.each([undefined, 'null', 'https://untrusted.example'])('requires an exact trusted mutation Origin (case %#)', async (untrusted) => {
    const organizer = await actor(app);
    const operation = request(app).post('/api/organizer/events').set('Cookie', organizer.cookie).send(eventInput);
    if (untrusted) operation.set('Origin', untrusted);
    const response = await operation.expect(403);
    expect(response.body.error.code).toBe('UNTRUSTED_ORIGIN');
    expect(await Event.countDocuments()).toBe(0);
  });
});
