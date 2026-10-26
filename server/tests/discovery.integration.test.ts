import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
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
