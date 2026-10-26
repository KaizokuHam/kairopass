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
