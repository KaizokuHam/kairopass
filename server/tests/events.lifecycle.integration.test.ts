import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Event, Reservation } from '../src/models/index.js';
import { useDisposableDatabase } from './helpers/database.js';
import { actor, createDraft, eventInput, eventsApp, eventTime, origin, type EventsApp } from './helpers/events.js';

useDisposableDatabase();
let app: EventsApp;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(eventTime); app = eventsApp();
});
afterEach(() => { vi.useRealTimers(); });
const base = '/api/organizer/events';
function patch(cookie: string, id: string, body: object) {
  return request(app).patch(`${base}/${id}`).set('Origin', origin).set('Cookie', cookie).send(body);
}
function transition(cookie: string, id: string, action: 'publish' | 'cancel') {
  return request(app).post(`${base}/${id}/${action}`).set('Origin', origin).set('Cookie', cookie);
}
async function draft() {
  const owner = await actor(app);
  const response = await createDraft(app, owner.cookie).expect(201);
  return { ...owner, eventId: response.body.data.event.id as string };
}

describe('safe edits and lifecycle transitions', () => {
  it('edits all draft fields, validates the merged document, and increments the concurrency version', async () => {
    const owner = await draft();
    const before = await Event.findById(owner.eventId).orFail();
    const changes = { ...eventInput, title: 'Edited Workshop', venue: 'New venue', description: '', pricePaise: 0, capacity: 150 };
    const edited = await patch(owner.cookie, owner.eventId, changes).expect(200);
    expect(edited.body.data.event).toMatchObject({ ...changes, status: 'DRAFT', reservedCount: 0, organizerId: owner.id });
    const after = await Event.findById(owner.eventId).orFail();
    expect(after.__v).toBe(before.__v + 1);
    expect(after.createdAt).toEqual(before.createdAt);
    await patch(owner.cookie, owner.eventId, { startAt: '2040-03-01T10:00:00Z' }).expect(400);
    expect((await Event.findById(owner.eventId).orFail()).startAt.toISOString()).toBe(eventInput.startAt);
  });

  it.each([{}, { capacity: 0 }, { registrationDeadline: eventInput.endAt }, { startAt: '2039-01-01T00:00:00Z' }])('rejects empty/invalid partial edit (case %#)', async (changes) => {
    const owner = await draft();
    await patch(owner.cookie, owner.eventId, changes).expect(400);
    expect((await Event.findById(owner.eventId).orFail()).__v).toBe(0);
  });

  it.each(['_id', 'organizerId', 'reservedCount', 'status', 'createdAt', 'updatedAt', '__v', '$inc'])('rejects protected update field %s', async (field) => {
    const owner = await draft();
    await patch(owner.cookie, owner.eventId, { [field]: 1 }).expect(400);
    expect((await Event.findById(owner.eventId).orFail()).reservedCount).toBe(0);
  });

  it('publishes a valid draft, allows descriptive edits, and rejects repeated publication', async () => {
    const owner = await draft();
    const published = await transition(owner.cookie, owner.eventId, 'publish').expect(200);
    expect(published.body.data.event).toMatchObject({ id: owner.eventId, status: 'PUBLISHED', reservedCount: 0 });
    const edited = await patch(owner.cookie, owner.eventId, { title: 'Published title', venue: 'Updated room', description: 'Updated description' }).expect(200);
    expect(edited.body.data.event).toMatchObject({ title: 'Published title', pricePaise: eventInput.pricePaise, capacity: eventInput.capacity, status: 'PUBLISHED' });
    const repeated = await transition(owner.cookie, owner.eventId, 'publish').expect(409);
    expect(repeated.body.error.code).toBe('INVALID_EVENT_STATE');
  });

  it.each(['capacity', 'pricePaise', 'startAt', 'endAt', 'registrationDeadline'])('freezes published field %s even for no-op values', async (field) => {
    const owner = await draft();
    await transition(owner.cookie, owner.eventId, 'publish').expect(200);
    const response = await patch(owner.cookie, owner.eventId, { [field]: eventInput[field as keyof typeof eventInput] }).expect(409);
    expect(response.body.error.code).toBe('INVALID_EVENT_STATE');
  });

  it.each([
    { registrationDeadline: eventTime.toISOString() },
    { startAt: '2039-01-01T00:00:00Z', registrationDeadline: '2038-12-31T00:00:00Z' },
    { title: 'x' }
  ])('refuses publication of expired or legacy-invalid data (case %#)', async (changes) => {
    const owner = await draft();
    // Fixtures deliberately bypass API validation to represent elapsed or old data.
    const stored = { ...changes, ...('startAt' in changes ? { startAt: new Date(changes.startAt!) } : {}),
      ...('registrationDeadline' in changes ? { registrationDeadline: new Date(changes.registrationDeadline!) } : {}) };
    await Event.collection.updateOne({ _id: (await Event.findById(owner.eventId).orFail())._id }, { $set: stored });
    const response = await transition(owner.cookie, owner.eventId, 'publish').expect(409);
    expect(response.body.error.code).toBe('EVENT_NOT_PUBLISHABLE');
    expect((await Event.findById(owner.eventId).orFail()).status).toBe('DRAFT');
  });

  it.each(['DRAFT', 'PUBLISHED'])('cancels an unoccupied %s without deleting history or touching inventory', async (state) => {
    const owner = await draft();
    if (state === 'PUBLISHED') await transition(owner.cookie, owner.eventId, 'publish').expect(200);
    const cancelled = await transition(owner.cookie, owner.eventId, 'cancel').expect(200);
    expect(cancelled.body.data.event).toMatchObject({ status: 'CANCELLED', reservedCount: 0, capacity: 100 });
    expect(await Event.countDocuments()).toBe(1);
    await request(app).get(`${base}/${owner.eventId}`).set('Cookie', owner.cookie).expect(200);
    expect((await transition(owner.cookie, owner.eventId, 'cancel').expect(409)).body.error.code).toBe('INVALID_EVENT_STATE');
    await transition(owner.cookie, owner.eventId, 'publish').expect(409);
    await patch(owner.cookie, owner.eventId, { title: 'Cannot reopen' }).expect(409);
  });

  it('blocks cancellation on occupied inventory even when no reservation document is found', async () => {
    const owner = await draft();
    await Event.updateOne({ _id: owner.eventId }, { $set: { reservedCount: 1 } });
    const response = await transition(owner.cookie, owner.eventId, 'cancel').expect(409);
    expect(response.body.error.code).toBe('EVENT_HAS_ACTIVE_RESERVATIONS');
    expect((await Event.findById(owner.eventId).orFail()).reservedCount).toBe(1);
  });

  it.each(['HELD', 'CONFIRMED'] as const)('defensively blocks a %s booking when the counter is inconsistent', async (status) => {
    const owner = await draft();
    const attendee = await actor(app, 'ATTENDEE', 'attendee@example.test');
    await Reservation.create({ eventId: owner.eventId, userId: attendee.id, status, amountPaise: 19900, expiresAt: new Date('2039-12-31T00:00:00Z') });
    const response = await transition(owner.cookie, owner.eventId, 'cancel').expect(409);
    expect(response.body.error.code).toBe('EVENT_HAS_ACTIVE_RESERVATIONS');
    expect((await Event.findById(owner.eventId).orFail()).status).toBe('DRAFT');
    expect(await Reservation.countDocuments()).toBe(1);
  });

  it('retains historical reservations while allowing safe cancellation', async () => {
    const owner = await draft();
    const attendee = await actor(app, 'ATTENDEE', 'attendee@example.test');
    for (const status of ['EXPIRED', 'CANCELLED'] as const) await Reservation.create({ eventId: owner.eventId, userId: attendee.id, status, amountPaise: 19900, expiresAt: eventTime });
    await transition(owner.cookie, owner.eventId, 'cancel').expect(200);
    expect(await Reservation.countDocuments()).toBe(2);
  });

  it('enforces ownership, authentication, roles, and trusted Origins for every mutation', async () => {
    const owner = await draft();
    const other = await actor(app, 'ORGANIZER', 'other@example.test');
    const attendee = await actor(app, 'ATTENDEE', 'attendee@example.test');
    for (const operation of ['edit', 'publish', 'cancel']) {
      const mutation = (cookie?: string, trusted = true) => {
        const req = operation === 'edit' ? request(app).patch(`${base}/${owner.eventId}`).send({ title: 'Forbidden edit' })
          : request(app).post(`${base}/${owner.eventId}/${operation}`);
        if (cookie) req.set('Cookie', cookie);
        return req.set('Origin', trusted ? origin : 'https://untrusted.example');
      };
      await mutation().expect(401);
      await mutation(attendee.cookie).expect(403);
      const hidden = await mutation(other.cookie).expect(404);
      expect(hidden.body.error.code).toBe('EVENT_NOT_FOUND');
      expect((await mutation(owner.cookie, false).expect(403)).body.error.code).toBe('UNTRUSTED_ORIGIN');
    }
    expect((await Event.findById(owner.eventId).orFail()).status).toBe('DRAFT');
  });

  it('rejects lifecycle payloads, malformed ids, and partial capacity below occupied inventory', async () => {
    const owner = await draft();
    for (const action of ['publish', 'cancel'] as const) {
      await transition(owner.cookie, owner.eventId, action).send({ status: 'PUBLISHED' }).expect(400);
      await transition(owner.cookie, 'bad-id', action).expect(400);
    }
    await Event.updateOne({ _id: owner.eventId }, { $set: { reservedCount: 3 } });
    await patch(owner.cookie, owner.eventId, { capacity: 2 }).expect(400);
    expect((await Event.findById(owner.eventId).orFail()).reservedCount).toBe(3);
  });
});
