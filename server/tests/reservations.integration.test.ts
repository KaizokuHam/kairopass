import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { Event, Reservation, PaymentAttempt, Ticket } from '../src/models/index.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import { createReservation, expireReservation } from '../src/modules/reservations/reservations.service.js';
import { createExpirationWorker } from '../src/modules/reservations/reservation-expiration.js';
import { useDisposableDatabase } from './helpers/database.js';
import { actor, createDraft, eventsApp, eventTime, origin, type EventsApp } from './helpers/events.js';

const database = useDisposableDatabase();
let app: EventsApp;
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(eventTime); app = eventsApp(); });
afterEach(() => { vi.useRealTimers(); });
const base = '/api/reservations';
const book = (cookie: string, eventId: string, extra = {}) => request(app).post(base).set('Origin', origin).set('Cookie', cookie).send({ eventId, ...extra });
const cancel = (cookie: string, id: string) => request(app).post(`${base}/${id}/cancel`).set('Origin', origin).set('Cookie', cookie);
async function published(capacity = 5, pricePaise = 19900) {
  const owner = await actor(app);
  const created = await createDraft(app, owner.cookie, { capacity, pricePaise }).expect(201);
  const id = created.body.data.event.id as string;
  await request(app).post(`/api/organizer/events/${id}/publish`).set('Cookie', owner.cookie).set('Origin', origin).expect(200);
  return { ...owner, eventId: id };
}
/** Read both sides from ONE snapshot, rather than comparing two independently advancing reads. */
async function invariant(eventId: string, expected?: number) {
  const session = await mongoose.connection.startSession();
  try {
    await session.withTransaction(async () => {
      const event = await Event.findById(eventId).session(session).orFail();
      const active = await Reservation.countDocuments({ eventId, status: { $in: ['HELD', 'CONFIRMED'] } }).session(session);
      expect(event.reservedCount).toBe(active); expect(active).toBeGreaterThanOrEqual(0); expect(active).toBeLessThanOrEqual(event.capacity);
      if (expected !== undefined) expect(active).toBe(expected);
    }, { readConcern: { level: 'snapshot' } });
  } finally { await session.endSession(); }
}

describe('transactional reservation concurrency', () => {
  it.each([1, 5])('capacity %i: 20 distinct simultaneous HTTP requests never oversell', async (capacity) => {
    const event = await published(capacity);
    const attendees = await Promise.all(Array.from({ length: 20 }, (_, i) => actor(app, 'ATTENDEE', `race${i}@example.test`)));
    const responses = await Promise.all(attendees.map((user) => book(user.cookie, event.eventId)));
    expect(responses.filter((r) => r.status === 201)).toHaveLength(capacity);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(20 - capacity);
    expect(responses.filter((r) => r.status === 409).every((r) => r.body.error.code === 'EVENT_SOLD_OUT')).toBe(true);
    expect(await Reservation.countDocuments()).toBe(capacity);
    await invariant(event.eventId, capacity);
    expect(await PaymentAttempt.countDocuments()).toBe(0); expect(await Ticket.countDocuments()).toBe(0);
  });
  it('20 simultaneous same-attendee requests share one hold and never extend its expiry', async () => {
    const event = await published(); const attendee = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const responses = await Promise.all(Array.from({ length: 20 }, () => book(attendee.cookie, event.eventId)));
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 200)).toHaveLength(19);
    expect(new Set(responses.map((r) => r.body.data.reservation.id)).size).toBe(1);
    expect(new Set(responses.map((r) => r.body.data.reservation.expiresAt)).size).toBe(1);
    const first = responses[0]!.body.data.reservation;
    expect(Date.parse(first.expiresAt) - Date.parse(first.createdAt)).toBe(600000);
    vi.setSystemTime(new Date(eventTime.getTime() + 300000));
    expect((await book(attendee.cookie, event.eventId).expect(200)).body.data.reservation).toEqual(first);
    await invariant(event.eventId, 1);
  });
  it('two expiration workers release once, retaining history', async () => {
    const event = await published(1); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const id = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation.id as string;
    vi.setSystemTime(new Date(eventTime.getTime() + 600000));
    expect((await Promise.all([expireReservation(id), expireReservation(id)])).sort()).toEqual([false, true]);
    await invariant(event.eventId, 0); expect(await Reservation.findById(id).lean()).toMatchObject({ status: 'EXPIRED' });
  });
  it('cancellation versus expiration releases inventory once', async () => {
    const event = await published(1); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const id = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation.id as string;
    vi.setSystemTime(new Date(eventTime.getTime() + 600000));
    const [response] = await Promise.all([cancel(user.cookie, id), expireReservation(id)]);
    expect(response.status).toBe(200); expect(response.body.data.reservation.status).toBe('EXPIRED');
    await cancel(user.cookie, id).expect(200); await invariant(event.eventId, 0);
  });
  it('real booking versus organizer cancellation has one consistent winner', async () => {
    const event = await published(1); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const [booking, cancellation] = await Promise.all([
      book(user.cookie, event.eventId),
      request(app).post(`/api/organizer/events/${event.eventId}/cancel`).set('Origin', origin).set('Cookie', event.cookie)
    ]);
    const stored = await Event.findById(event.eventId).orFail();
    console.info(`Reservation/cancellation race observed: booking ${booking.status}, organizer cancellation ${cancellation.status}, event ${stored.status}.`);
    if (booking.status === 201) { expect(cancellation.status).toBe(409); expect(stored.status).toBe('PUBLISHED'); await invariant(event.eventId, 1); }
    else { expect(booking.status).toBe(409); expect(cancellation.status).toBe(200); expect(stored.status).toBe('CANCELLED'); await invariant(event.eventId, 0); }
  });
  it('lazy expiration restores capacity and permits a new hold without erasing the old one', async () => {
    const event = await published(1); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const first = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation;
    vi.setSystemTime(new Date(eventTime.getTime() + 600000));
    const next = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation;
    expect(next.id).not.toBe(first.id); expect(next.expiresAt).not.toBe(first.expiresAt);
    expect(await Reservation.findById(first.id).lean()).toMatchObject({ status: 'EXPIRED' });
    expect(await Reservation.countDocuments()).toBe(2); await invariant(event.eventId, 1);
  });
  it('rolls back the increment when reservation insertion fails', async () => {
    const event = await published(1); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    vi.spyOn(Reservation, 'create').mockRejectedValueOnce(new Error('forced private insertion failure'));
    const response = await book(user.cookie, event.eventId).expect(500);
    expect(JSON.stringify(response.body)).not.toContain('private insertion');
    await invariant(event.eventId, 0); expect(await Reservation.countDocuments()).toBe(0);
  });
  it('keeps the exact immutable database price, including free holds', async () => {
    const event = await published(1, Number.MAX_SAFE_INTEGER); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const held = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation;
    expect(held.amountPaise).toBe(Number.MAX_SAFE_INTEGER);
    await Reservation.updateOne({ _id: held.id }, { $set: { amountPaise: 1 } });
    expect((await Reservation.findById(held.id).orFail()).amountPaise).toBe(Number.MAX_SAFE_INTEGER);
    await cancel(user.cookie, held.id).expect(200);
    await Event.updateOne({ _id: event.eventId }, { $set: { pricePaise: 0 } });
    const free = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation;
    expect((await Reservation.findById(held.id).orFail()).amountPaise).toBe(Number.MAX_SAFE_INTEGER);
    expect(free).toMatchObject({ status: 'HELD', amountPaise: 0 }); await invariant(event.eventId, 1);
  });
  it('controlled confirmed fixture retains inventory and rejects cancellation/rebooking', async () => {
    const event = await published(1); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const id = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation.id as string;
    // Test-only fixture; no confirmation/payment endpoint exists in Task 08.
    await Reservation.updateOne({ _id: id }, { $set: { status: 'CONFIRMED' } });
    vi.setSystemTime(new Date(eventTime.getTime() + 600000));
    expect(await expireReservation(id)).toBe(false); await cancel(user.cookie, id).expect(409);
    expect((await book(user.cookie, event.eventId).expect(409)).body.error.code).toBe('ALREADY_BOOKED');
    await invariant(event.eventId, 1);
  });
});

describe('reservation access, validation, history, and worker', () => {
  it('guards all endpoints by authentication, current role, and mutation Origin', async () => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    for (const path of [base, `${base}/000000000000000000000000`]) {
      await request(app).get(path).expect(401); await request(app).get(path).set('Cookie', event.cookie).expect(403);
    }
    await request(app).post(base).set('Origin', origin).send({ eventId: event.eventId }).expect(401);
    await book(event.cookie, event.eventId).expect(403);
    await request(app).post(base).set('Cookie', user.cookie).send({ eventId: event.eventId }).expect(403);
    await request(app).post(base).set('Origin', 'https://evil.test').set('Cookie', user.cookie).send({ eventId: event.eventId }).expect(403);
    await invariant(event.eventId, 0);
  });
  it.each(['userId', 'status', 'amountPaise', 'expiresAt', 'reservedCount', 'quantity', '$set'])('rejects client-controlled %s', async (field) => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    await book(user.cookie, event.eventId, { [field]: 'forged' }).expect(400); await invariant(event.eventId, 0);
  });
  it.each(['page=0', 'limit=51', 'status=PAID', 'status=HELD&status=EXPIRED', 'userId=x', 'page[$gt]=0'])('rejects unsafe query %s', async (query) => {
    const user = await actor(app, 'ATTENDEE', 'attendee@example.test'); await request(app).get(`${base}?${query}`).set('Cookie', user.cookie).expect(400);
  });
  it('uses identical safe 404s for malformed, nonexistent, and unowned reservation IDs', async () => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test'); const other = await actor(app, 'ATTENDEE', 'other@example.test');
    const id = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation.id as string;
    for (const candidate of [id, '000000000000000000000000', 'invalid']) {
      expect((await request(app).get(`${base}/${candidate}`).set('Cookie', other.cookie).expect(404)).body.error.code).toBe('RESERVATION_NOT_FOUND');
      await cancel(other.cookie, candidate).expect(404);
    }
    await invariant(event.eventId, 1);
  });
  it.each(['DRAFT', 'CANCELLED', 'STARTED', 'CLOSED'] as const)('does not allocate for %s events', async (state) => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    await Event.updateOne({ _id: event.eventId }, { $set: state === 'STARTED' ? { startAt: eventTime } : state === 'CLOSED' ? { registrationDeadline: eventTime } : { status: state } });
    await book(user.cookie, event.eventId).expect(409); await invariant(event.eventId, 0);
  });
  it('owned reads reconcile elapsed holds, retain cancelled history, paginate and allowlist DTOs', async () => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const first = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation;
    await cancel(user.cookie, first.id).expect(200); await cancel(user.cookie, first.id).expect(200);
    const next = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation;
    vi.setSystemTime(new Date(eventTime.getTime() + 600000));
    const read = await request(app).get(`${base}/${next.id}`).set('Cookie', user.cookie).expect(200);
    expect(read.body.data.reservation.status).toBe('EXPIRED');
    const history = await request(app).get(`${base}?limit=1`).set('Cookie', user.cookie).expect(200);
    expect(history.body.data.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(history.body.data.reservations[0].id).toBe(next.id);
    expect(Object.keys(history.body.data.reservations[0]).sort()).toEqual(['id', 'eventId', 'status', 'amountPaise', 'expiresAt', 'createdAt', 'updatedAt', 'event'].sort());
    expect(history.headers['cache-control']).toBe('no-store');
    await Event.deleteOne({ _id: event.eventId }); // test-only missing-event history fixture
    expect((await request(app).get(`${base}?status=CANCELLED`).set('Cookie', user.cookie).expect(200)).body.data.reservations[0].event).toBeNull();
  });
  it('fails closed on corrupt inventory instead of repairing or decrementing it', async () => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const held = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation;
    await Event.collection.updateOne({ _id: new mongoose.Types.ObjectId(event.eventId) }, { $set: { reservedCount: 0 } });
    expect((await cancel(user.cookie, held.id).expect(503)).body.error.code).toBe('INVENTORY_INCONSISTENT');
    expect((await Reservation.findById(held.id).orFail()).status).toBe('HELD');
  });
  it('worker is callable, nonoverlapping, bounded, and safe across multiple instances', async () => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    await book(user.cookie, event.eventId).expect(201);
    const now = new Date(eventTime.getTime() + 600000);
    const a = createExpirationWorker({ now: () => now }), b = createExpirationWorker({ now: () => now });
    const first = a.runOnce(); expect(a.runOnce()).toBe(first);
    expect((await Promise.all([first, b.runOnce()])).reduce((sum, n) => sum + n, 0)).toBe(1);
    await a.stop(); await b.stop(); expect(await a.runOnce()).toBe(0); await invariant(event.eventId, 0);
  });
  it('uses database eligibility rather than trusting callers of the service', async () => {
    const event = await published(); await expect(createReservation(event.id, event.eventId)).rejects.toMatchObject({ status: 403 }); await invariant(event.eventId, 0);
  });
  it.each(['bad', '00000000000000000000000g', { $ne: null }])('rejects malformed/operator event ID %#', async (eventId) => {
    const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    await request(app).post(base).set('Origin', origin).set('Cookie', user.cookie).send({ eventId }).expect(400);
  });
  it('returns safe missing-event errors and rejects non-JSON and nonempty cancel bodies', async () => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    await book(user.cookie, '000000000000000000000000').expect(404);
    await request(app).post(base).set('Origin', origin).set('Cookie', user.cookie).type('text').send('eventId=forged').expect(400);
    const id = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation.id as string;
    await cancel(user.cookie, id).send({ status: 'CONFIRMED' }).expect(400); await invariant(event.eventId, 1);
  });
  it('keeps history user-scoped and expires owned stale holds before status filtering', async () => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const other = await actor(app, 'ATTENDEE', 'other@example.test');
    const a = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation;
    await book(other.cookie, event.eventId).expect(201);
    vi.setSystemTime(new Date(eventTime.getTime() + 600000));
    const list = await request(app).get(`${base}?status=EXPIRED`).set('Cookie', user.cookie).expect(200);
    expect(list.body.data.reservations.map((r: { id: string }) => r.id)).toEqual([a.id]);
    expect(await Reservation.countDocuments({ status: 'HELD' })).toBe(1); await invariant(event.eventId, 1);
  });
  it('allows a different attendee to reuse lazy-expired capacity and preserves both records', async () => {
    const event = await published(1); const a = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const b = await actor(app, 'ATTENDEE', 'other@example.test');
    await book(a.cookie, event.eventId).expect(201); vi.setSystemTime(new Date(eventTime.getTime() + 600000));
    await book(b.cookie, event.eventId).expect(201); await invariant(event.eventId, 1);
    expect(await Reservation.countDocuments({ status: 'EXPIRED' })).toBe(1); expect(await Reservation.countDocuments()).toBe(2);
  });
  it('preserves the unique active index, history indexes, and absence of a TTL', async () => {
    const indexes = await Reservation.collection.indexes();
    expect(indexes.some((index) => index.name === 'reservation_active_user_event_unique' && index.unique)).toBe(true);
    expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining(['reservation_event_expiry', 'reservation_user_history', 'reservation_user_expiry']));
    expect(indexes.every((index) => index.expireAfterSeconds === undefined)).toBe(true);
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const first = (await book(user.cookie, event.eventId).expect(201)).body.data.reservation;
    await expect(Reservation.create({ userId: user.id, eventId: event.eventId, status: 'HELD', amountPaise: 0, expiresAt: new Date(first.expiresAt) })).rejects.toMatchObject({ code: 11000 });
    await invariant(event.eventId, 1);
  });
  it('retries a labelled transient insert failure within the transaction budget without leaking inventory', async () => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const failure = new mongoose.mongo.MongoServerError({ message: 'private transient test failure', code: 112 });
    failure.addErrorLabel('TransientTransactionError');
    vi.spyOn(Reservation, 'create').mockRejectedValueOnce(failure);
    await book(user.cookie, event.eventId).expect(201); await invariant(event.eventId, 1);
    expect(await Reservation.countDocuments()).toBe(1);
  });
  it('reports unresolved commit outcomes safely and lets the next read discover the committed hold', async () => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const startSession = mongoose.connection.startSession.bind(mongoose.connection);
    vi.spyOn(mongoose.connection, 'startSession').mockImplementationOnce(async () => {
      const session = await startSession(); const transaction = session.withTransaction.bind(session);
      vi.spyOn(session, 'withTransaction').mockImplementationOnce(async (...args) => {
        await transaction(...args);
        // Controlled loss of the final response after REAL MongoDB commit. No successful HTTP claim.
        const error = new mongoose.mongo.MongoServerError({ message: 'private commit uncertainty' });
        error.addErrorLabel('UnknownTransactionCommitResult'); throw error;
      });
      return session;
    });
    const uncertain = await book(user.cookie, event.eventId).expect(503);
    expect(uncertain.body.error.code).toBe('RESERVATION_OUTCOME_UNKNOWN');
    expect(JSON.stringify(uncertain.body)).not.toContain('private commit'); await invariant(event.eventId, 1);
    const list = await request(app).get(base).set('Cookie', user.cookie).expect(200);
    expect(list.body.data.reservations).toHaveLength(1);
    expect((await book(user.cookie, event.eventId).expect(200)).body.data.reservation.id).toBe(list.body.data.reservations[0].id);
  });
  it('fails closed during database outage and leaves liveness available', async () => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    await disconnectDatabase();
    try {
      await request(app).get('/api/health').expect(200);
      expect((await book(user.cookie, event.eventId).expect(503)).body.error.code).toBe('DATABASE_UNAVAILABLE');
      await request(app).get(base).set('Cookie', user.cookie).expect(503);
      const worker = createExpirationWorker(); expect(await worker.runOnce()).toBe(0); await worker.stop();
    } finally { await connectDatabase(database.uri); }
    await invariant(event.eventId, 0);
  });
  it('keeps all private reservation routes disabled when signing configuration is invalid', async () => {
    const unconfigured = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: { JWT_SECRET: 'weak' } });
    for (const path of [base, `${base}/000000000000000000000000`]) await request(unconfigured).get(path).expect(503);
    await request(unconfigured).post(base).send({}).expect(503); await request(unconfigured).get('/api/health').expect(200);
  });
  it('processes no more than 50 due holds in one worker batch, then makes further progress', async () => {
    const event = await published(); const user = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const template = (await Event.findById(event.eventId).orFail()).toObject();
    const events = Array.from({ length: 51 }, () => ({ ...template, _id: new mongoose.Types.ObjectId(), reservedCount: 1 }));
    const session = await mongoose.connection.startSession();
    try {
      // Controlled fixtures represent valid allocations; never seed or clean an application database.
      await session.withTransaction(async () => {
        await Event.insertMany(events, { session });
        await Reservation.insertMany(events.map((record) => ({ userId: user.id, eventId: record._id, status: 'HELD', amountPaise: record.pricePaise, expiresAt: eventTime })), { session });
      });
    } finally { await session.endSession(); }
    const worker = createExpirationWorker();
    expect(await worker.runOnce()).toBe(50); expect(await Reservation.countDocuments({ status: 'HELD' })).toBe(1);
    expect(await worker.runOnce()).toBe(1); await worker.stop();
    for (const record of events) await invariant(record._id.toString(), 0);
    expect(await Reservation.countDocuments({ status: 'EXPIRED' })).toBe(51);
  });
  it('starts one explicit minute timer and stops it cleanly', async () => {
    const interval = vi.spyOn(globalThis, 'setInterval'), clear = vi.spyOn(globalThis, 'clearInterval');
    const worker = createExpirationWorker(); expect(interval).not.toHaveBeenCalled();
    worker.start(); worker.start();
    expect(interval).toHaveBeenCalledTimes(1); expect(interval.mock.calls[0]?.[1]).toBe(60000);
    await worker.stop(); expect(clear).toHaveBeenCalledTimes(1); expect(await worker.runOnce()).toBe(0);
  });
  it('stop waits for an in-flight real expiration transaction and skips subsequent candidates', async () => {
    const event = await published(2); const a = await actor(app, 'ATTENDEE', 'attendee@example.test');
    const b = await actor(app, 'ATTENDEE', 'other@example.test');
    await book(a.cookie, event.eventId).expect(201); await book(b.cookie, event.eventId).expect(201);
    vi.setSystemTime(new Date(eventTime.getTime() + 600000));
    let arrived!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => { arrived = resolve; }), gate = new Promise<void>((resolve) => { release = resolve; });
    const find = Event.findById.bind(Event);
    vi.spyOn(Event, 'findById').mockImplementationOnce(() => {
      const query = find(event.eventId), exec = query.exec.bind(query);
      vi.spyOn(query, 'exec').mockImplementationOnce(async () => { const result = await exec(); arrived(); await gate; return result; });
      return query;
    });
    const worker = createExpirationWorker(), running = worker.runOnce(); await ready;
    let stopped = false; const stopping = worker.stop().then(() => { stopped = true; });
    await Promise.resolve(); expect(stopped).toBe(false);
    release(); expect(await running).toBe(1); await stopping;
    expect(stopped).toBe(true); expect(await Reservation.countDocuments({ status: 'HELD' })).toBe(1);
    expect(await worker.runOnce()).toBe(0); await invariant(event.eventId, 1);
  });
});
