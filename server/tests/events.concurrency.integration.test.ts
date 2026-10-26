import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { Event, Reservation, User } from '../src/models/index.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import { useDisposableDatabase } from './helpers/database.js';
import { actor, createDraft, eventInput, eventsApp, eventTime, origin, type EventsApp } from './helpers/events.js';

const database = useDisposableDatabase();
let app: EventsApp;
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(eventTime); app = eventsApp(); });
afterEach(() => { vi.useRealTimers(); });
const base = '/api/organizer/events';
async function draft(publish = false) {
  const owner = await actor(app);
  const response = await createDraft(app, owner.cookie).expect(201);
  const eventId = response.body.data.event.id as string;
  if (publish) await action(owner.cookie, eventId, 'publish').expect(200);
  return { ...owner, eventId };
}
function action(cookie: string, id: string, operation: 'publish' | 'cancel') {
  return request(app).post(`${base}/${id}/${operation}`).set('Cookie', cookie).set('Origin', origin);
}
function edit(cookie: string, id: string, changes: object) {
  return request(app).patch(`${base}/${id}`).set('Cookie', cookie).set('Origin', origin).send(changes);
}
function barrier() {
  let release!: () => void; let arrived!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { arrived = resolve; });
  return { held, ready, release, arrived };
}
/** Pause after a real database read. All subsequent reads and writes still hit MongoDB. */
function holdEventRead(owner: { id: string; eventId: string }) {
  const gate = barrier(); const find = Event.findOne.bind(Event);
  vi.spyOn(Event, 'findOne').mockImplementationOnce(() => {
    const query = find({ _id: owner.eventId, organizerId: owner.id });
    const exec = query.exec.bind(query);
    vi.spyOn(query, 'exec').mockImplementationOnce(async () => {
      const event = await exec(); gate.arrived(); await gate.held; return event;
    });
    return query;
  });
  return gate;
}

describe('real database concurrency and security regressions', () => {
  it('rejects a draft edit that races with publication, without changing published economics', async () => {
    const owner = await draft(); const gate = holdEventRead(owner);
    const pending = edit(owner.cookie, owner.eventId, { capacity: 500, pricePaise: 1 }).then((response) => response);
    await gate.ready;
    try { await action(owner.cookie, owner.eventId, 'publish').expect(200); } finally { gate.release(); }
    const conflict = await pending;
    expect(conflict.status).toBe(409); expect(conflict.body.error.code).toBe('EVENT_UPDATE_CONFLICT');
    expect(await Event.findById(owner.eventId).lean()).toMatchObject({ status: 'PUBLISHED', capacity: 100, pricePaise: 19900, reservedCount: 0 });
  });

  it('rejects a competing edit after another edit commits', async () => {
    const owner = await draft(); const gate = holdEventRead(owner);
    const pending = edit(owner.cookie, owner.eventId, { title: 'Stale title' }).then((response) => response);
    await gate.ready;
    try { await edit(owner.cookie, owner.eventId, { title: 'Winning title' }).expect(200); } finally { gate.release(); }
    expect((await pending).status).toBe(409);
    expect((await Event.findById(owner.eventId).orFail()).title).toBe('Winning title');
  });

  it.each(['publish', 'cancel'] as const)('does not let stale publication overwrite a completed %s', async (winner) => {
    const owner = await draft(); const gate = holdEventRead(owner);
    const pending = action(owner.cookie, owner.eventId, 'publish').then((response) => response);
    await gate.ready;
    try { await action(owner.cookie, owner.eventId, winner).expect(200); } finally { gate.release(); }
    expect((await pending).body.error.code).toBe('EVENT_UPDATE_CONFLICT');
    expect((await Event.findById(owner.eventId).orFail()).status).toBe(winner === 'cancel' ? 'CANCELLED' : 'PUBLISHED');
  });

  it('retries a cancellation snapshot after concurrent publication and preserves a legal final state', async () => {
    const owner = await draft(); const gate = holdEventRead(owner);
    const pending = action(owner.cookie, owner.eventId, 'cancel').then((response) => response);
    await gate.ready;
    try { await action(owner.cookie, owner.eventId, 'publish').expect(200); } finally { gate.release(); }
    expect((await pending).status).toBe(200);
    const stored = await Event.findById(owner.eventId).orFail();
    expect(stored.status).toBe('CANCELLED'); expect(stored.__v).toBe(2);
  });

  it('rechecks reservation safety after a real transactional allocation wins the race', async () => {
    const owner = await draft(true);
    const attendee = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const gate = barrier(); const exists = Reservation.exists.bind(Reservation);
    vi.spyOn(Reservation, 'exists').mockImplementationOnce(() => {
      const query = exists({ eventId: owner.eventId, status: { $in: ['HELD', 'CONFIRMED'] } });
      const exec = query.exec.bind(query);
      vi.spyOn(query, 'exec').mockImplementationOnce(async () => {
        const found = await exec(); gate.arrived(); await gate.held; return found;
      });
      return query;
    });
    const cancellation = action(owner.cookie, owner.eventId, 'cancel').then((response) => response);
    await gate.ready;
    try {
      // Test-only simulation of Task 08's required event+reservation transaction.
      await mongoose.connection.transaction(async (session) => {
        const result = await Event.updateOne({ _id: owner.eventId, status: 'PUBLISHED', reservedCount: 0 }, { $inc: { reservedCount: 1 } }, { session });
        if (result.modifiedCount !== 1) throw new Error('Expected test inventory allocation');
        await Reservation.create([{ eventId: owner.eventId, userId: attendee.id, status: 'HELD', amountPaise: 19900, expiresAt: new Date('2040-01-01T00:10:00Z') }], { session });
      });
    } finally { gate.release(); }
    const response = await cancellation;
    expect(response.status).toBe(409); expect(response.body.error.code).toBe('EVENT_HAS_ACTIVE_RESERVATIONS');
    expect(await Event.findById(owner.eventId).lean()).toMatchObject({ status: 'PUBLISHED', reservedCount: 1 });
    expect(await Reservation.countDocuments({ status: 'HELD' })).toBe(1);
  });

  it('never writes reservation-owned inventory during descriptive edits', async () => {
    const owner = await draft(true);
    await Event.updateOne({ _id: owner.eventId }, { $set: { reservedCount: 7 } });
    const response = await edit(owner.cookie, owner.eventId, { description: 'Updated with bookings present' }).expect(200);
    expect(response.body.data.event.reservedCount).toBe(7);
    expect((await Event.findById(owner.eventId).orFail()).reservedCount).toBe(7);
  });

  it('uses current persisted roles and rejects revoked sessions', async () => {
    const owner = await draft();
    await User.updateOne({ _id: owner.id }, { $set: { role: 'ATTENDEE' } });
    await request(app).get(base).set('Cookie', owner.cookie).expect(403);
    await User.updateOne({ _id: owner.id }, { $set: { role: 'ORGANIZER' } });
    await request(app).post('/api/auth/logout').set('Cookie', owner.cookie).set('Origin', origin).expect(200);
    await request(app).get(base).set('Cookie', owner.cookie).expect(401);
  });

  it('fails closed for database and signing configuration failures while health stays independent', async () => {
    const owner = await draft();
    const disabled = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: { JWT_SECRET: 'weak' } });
    expect((await request(disabled).get(base).expect(503)).body.error.code).toBe('AUTH_UNAVAILABLE');
    await disconnectDatabase();
    try {
      for (const method of ['get', 'post', 'patch'] as const) {
        const response = await request(app)[method](method === 'patch' ? `${base}/${owner.eventId}` : base).set('Cookie', owner.cookie).set('Origin', origin).send(method === 'get' ? undefined : eventInput).expect(503);
        expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
      }
      await request(app).get('/api/health').expect(200);
      await request(app).get('/api/ready').expect(503);
    } finally { await connectDatabase(database.uri); }
  });

  it('sanitizes database failures and maps bounded-query timeouts and write conflicts', async () => {
    const owner = await draft(); const raw = 'sensitive internal database failure';
    vi.spyOn(Event, 'create').mockRejectedValueOnce(new Error(raw));
    const response = await createDraft(app, owner.cookie).expect(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain(raw);
    expect(await Event.countDocuments()).toBe(1);
    vi.spyOn(mongoose.Aggregate.prototype, 'exec').mockRejectedValueOnce(new mongoose.mongo.MongoServerError({ message: raw, code: 50 }));
    expect((await request(app).get(base).set('Cookie', owner.cookie).expect(503)).body.error.code).toBe('EVENT_QUERY_TIMEOUT');
    vi.spyOn(Event, 'findOneAndUpdate').mockRejectedValueOnce(new mongoose.mongo.MongoServerError({ message: raw, code: 112 }));
    expect((await edit(owner.cookie, owner.eventId, { title: 'Uncommitted title' }).expect(409)).body.error.code).toBe('EVENT_UPDATE_CONFLICT');
    expect((await Event.findById(owner.eventId).orFail()).title).toBe(eventInput.title);
  });

  it('verifies the event-reservation lookup index and preserves private drafts and future write boundaries', async () => {
    const owner = await draft();
    const index = (await Reservation.collection.listIndexes().toArray()).find((candidate) => candidate.name === 'reservation_event_status');
    expect(index?.key).toEqual({ eventId: 1, status: 1 });
    expect(index?.expireAfterSeconds).toBeUndefined();
    await request(app).delete(`${base}/${owner.eventId}`).set('Cookie', owner.cookie).set('Origin', origin).expect(404);
    const discovery = await request(app).get('/api/events').expect(200);
    expect(discovery.body.data.events).toEqual([]);
    await request(app).post('/api/payments').send({ eventId: owner.eventId }).expect(404);
    expect(await Event.countDocuments()).toBe(1);
  });
});
