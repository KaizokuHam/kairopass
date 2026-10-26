import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { Event, Reservation, PaymentAttempt, Ticket, User } from '../src/models/index.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import { expireReservation } from '../src/modules/reservations/reservations.service.js';
import { preparePayment, finalizePayment } from '../src/modules/payments/payments.service.js';
import { useDisposableDatabase } from './helpers/database.js';
import { actor, createDraft, eventsApp, eventTime, origin, type EventsApp } from './helpers/events.js';

const database = useDisposableDatabase();
let app: EventsApp;
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(eventTime); app = eventsApp(); });
afterEach(() => { vi.useRealTimers(); });
async function fixture(pricePaise = 19900) {
  const organizer = await actor(app);
  const event = await createDraft(app, organizer.cookie, { capacity: 1, pricePaise }).expect(201);
  const eventId = event.body.data.event.id as string;
  await request(app).post(`/api/organizer/events/${eventId}/publish`).set('Origin', origin).set('Cookie', organizer.cookie).expect(200);
  const attendee = await actor(app, 'ATTENDEE', 'attendee@example.test');
  const hold = await request(app).post('/api/reservations').set('Origin', origin).set('Cookie', attendee.cookie).send({ eventId }).expect(201);
  return { ...attendee, organizer, eventId, reservationId: hold.body.data.reservation.id as string, hold: hold.body.data.reservation };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const path = (f: Fixture) => `/api/reservations/${f.reservationId}/payments`;
const pay = (f: Fixture, key: string = randomUUID(), simulationOutcome = 'SUCCESS') => request(app).post(path(f)).set('Origin', origin).set('Cookie', f.cookie).set('Idempotency-Key', key).send({ simulationOutcome });
async function invariant(f: Fixture, status: string) {
  const session = await mongoose.connection.startSession();
  try {
    await session.withTransaction(async () => {
      const event = await Event.findById(f.eventId).session(session).orFail();
      const reservation = await Reservation.findById(f.reservationId).session(session).orFail();
      const active = await Reservation.countDocuments({ eventId: f.eventId, status: { $in: ['HELD', 'CONFIRMED'] } }).session(session);
      const successes = await PaymentAttempt.countDocuments({ reservationId: f.reservationId, status: 'SUCCESS' }).session(session);
      expect(reservation.status).toBe(status); expect(event.reservedCount).toBe(active);
      expect(active).toBe(['HELD', 'CONFIRMED'].includes(status) ? 1 : 0);
      expect(successes).toBe(status === 'CONFIRMED' ? 1 : 0);
      expect(reservation.amountPaise).toBe(f.hold.amountPaise); expect(reservation.expiresAt.toISOString()).toBe(f.hold.expiresAt);
      expect(await Ticket.countDocuments().session(session)).toBe(0);
    }, { readConcern: { level: 'snapshot' } });
  } finally { await session.endSession(); }
}
function barrier() {
  let arrived!: () => void, release!: () => void;
  const ready = new Promise<void>((resolve) => { arrived = resolve; }), gate = new Promise<void>((resolve) => { release = resolve; });
  return { ready, gate, arrived, release };
}

describe('real payment idempotency and confirmation', () => {
  it('same key / 20 concurrent requests persist one successful payment and one confirmation', async () => {
    const f = await fixture(), key = randomUUID();
    const responses = await Promise.all(Array.from({ length: 20 }, () => pay(f, key)));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(new Set(responses.map((r) => r.body.data.payment.id)).size).toBe(1);
    expect(new Set(responses.map((r) => r.body.data.payment.transactionId)).size).toBe(1);
    expect(responses.every((r) => r.body.data.payment.status === 'SUCCESS' && r.body.data.reservation.status === 'CONFIRMED')).toBe(true);
    expect(await PaymentAttempt.countDocuments()).toBe(1); await invariant(f, 'CONFIRMED');
  });
  it('20 different keys racing one reservation produce only one successful attempt', async () => {
    const f = await fixture(); const responses = await Promise.all(Array.from({ length: 20 }, () => pay(f)));
    expect(responses.filter((r) => r.status === 200 && r.body.data.payment.status === 'SUCCESS')).toHaveLength(1);
    expect(responses.every((r) => r.status === 409 || (r.status === 200 && ['SUCCESS', 'FAILED'].includes(r.body.data.payment.status)))).toBe(true);
    expect(await PaymentAttempt.countDocuments({ status: 'PENDING' })).toBe(0); await invariant(f, 'CONFIRMED');
  });
  it('rejects same-key outcome changes and replays the unchanged successful result', async () => {
    const f = await fixture(), key = randomUUID();
    const first = await pay(f, key).expect(200);
    expect((await pay(f, key, 'FAILURE').expect(409)).body.error.code).toBe('PAYMENT_IDEMPOTENCY_CONFLICT');
    expect((await pay(f, key).expect(200)).body.data.payment).toEqual(first.body.data.payment);
    expect(await PaymentAttempt.countDocuments()).toBe(1); await invariant(f, 'CONFIRMED');
  });
  it('failure stays FAILED on replay; a deliberate retry with a new key succeeds', async () => {
    const f = await fixture(), failedKey = randomUUID();
    const first = await pay(f, failedKey, 'FAILURE').expect(200);
    expect(first.body.data.payment).toMatchObject({ status: 'FAILED', failureReason: 'SIMULATED_PAYMENT_FAILURE', amountPaise: 19900, simulated: true });
    await invariant(f, 'HELD');
    expect((await pay(f, failedKey, 'FAILURE').expect(200)).body.data.payment).toEqual(first.body.data.payment);
    expect((await pay(f, failedKey, 'SUCCESS').expect(409)).body.error.code).toBe('PAYMENT_IDEMPOTENCY_CONFLICT');
    const second = await pay(f).expect(200); expect(second.body.data.payment.status).toBe('SUCCESS');
    expect(second.body.data.payment.id).not.toBe(first.body.data.payment.id);
    expect((await pay(f, failedKey, 'FAILURE').expect(200)).body.data.payment).toEqual(first.body.data.payment);
    expect(await PaymentAttempt.countDocuments()).toBe(2); await invariant(f, 'CONFIRMED');
  });
  it('zero-price checkout persists a zero-value success without reallocating or issuing tickets', async () => {
    const f = await fixture(0); expect(f.hold.status).toBe('HELD');
    expect((await pay(f).expect(200)).body.data.payment).toMatchObject({ status: 'SUCCESS', amountPaise: 0, simulated: true }); await invariant(f, 'CONFIRMED');
  });
  it('charges the reservation snapshot even if event price subsequently differs', async () => {
    const f = await fixture(Number.MAX_SAFE_INTEGER);
    await Event.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.eventId) }, { $set: { pricePaise: 1 } });
    expect((await pay(f).expect(200)).body.data.payment.amountPaise).toBe(Number.MAX_SAFE_INTEGER); await invariant(f, 'CONFIRMED');
  });
  it('persists PENDING before processing and recovers one terminal result through 20 same-key requests', async () => {
    const f = await fixture(), key = randomUUID();
    vi.spyOn(PaymentAttempt, 'findOneAndUpdate').mockRejectedValueOnce(new Error('private simulated process interruption'));
    const response = await pay(f, key).expect(500); expect(JSON.stringify(response.body)).not.toContain('private simulated');
    expect(await PaymentAttempt.countDocuments({ status: 'PENDING' })).toBe(1); await invariant(f, 'HELD');
    const replies = await Promise.all(Array.from({ length: 20 }, () => pay(f, key)));
    expect(replies.every((r) => r.status === 200 && r.body.data.payment.status === 'SUCCESS')).toBe(true);
    expect(await PaymentAttempt.countDocuments()).toBe(1); await invariant(f, 'CONFIRMED');
  });
  it('rolls back payment SUCCESS when the subsequent reservation transition fails', async () => {
    const f = await fixture(), key = randomUUID();
    vi.spyOn(Reservation, 'findOneAndUpdate').mockRejectedValueOnce(new Error('forced confirmation failure'));
    await pay(f, key).expect(500);
    expect(await PaymentAttempt.countDocuments({ status: 'PENDING' })).toBe(1); await invariant(f, 'HELD');
    await pay(f, key).expect(200); expect(await PaymentAttempt.countDocuments()).toBe(1); await invariant(f, 'CONFIRMED');
  });
});

describe('payment races with terminal reservation transitions', () => {
  it('expiration winning while a payment transaction is paused prevents SUCCESS', async () => {
    const f = await fixture(), key = randomUUID();
    const id = await preparePayment(f.id, f.reservationId, key, { simulationOutcome: 'SUCCESS' });
    const gate = barrier(), find = PaymentAttempt.findOne.bind(PaymentAttempt);
    vi.spyOn(PaymentAttempt, 'findOne').mockImplementationOnce(() => {
      const query = find({ _id: id }), exec = query.exec.bind(query);
      vi.spyOn(query, 'exec').mockImplementationOnce(async () => { const result = await exec(); gate.arrived(); await gate.gate; return result; }); return query;
    });
    const pending = finalizePayment(f.id, f.reservationId, id); await gate.ready;
    try { vi.setSystemTime(new Date(f.hold.expiresAt)); expect(await expireReservation(f.reservationId)).toBe(true); } finally { gate.release(); }
    const result = await pending; expect(result.payment).toMatchObject({ status: 'FAILED', failureReason: 'RESERVATION_EXPIRED' }); await invariant(f, 'EXPIRED');
  });
  it('confirmed payment survives later expiration without releasing its unit', async () => {
    const f = await fixture(); await pay(f).expect(200); vi.setSystemTime(new Date(f.hold.expiresAt));
    expect(await expireReservation(f.reservationId)).toBe(false); await invariant(f, 'CONFIRMED');
  });
  it('payment versus cancellation has one legal winner with matching payment/inventory state', async () => {
    const f = await fixture(); const [payment, cancellation] = await Promise.all([
      pay(f), request(app).post(`/api/reservations/${f.reservationId}/cancel`).set('Cookie', f.cookie).set('Origin', origin)
    ]);
    const reservation = await Reservation.findById(f.reservationId).orFail();
    console.info(`Payment/cancellation observed: payment HTTP ${payment.status}, cancellation HTTP ${cancellation.status}, reservation ${reservation.status}.`);
    if (reservation.status === 'CONFIRMED') { expect(payment.status).toBe(200); expect(payment.body.data.payment.status).toBe('SUCCESS'); expect(cancellation.status).toBe(409); }
    else { expect(reservation.status).toBe('CANCELLED'); expect(cancellation.status).toBe(200); expect(payment.status === 409 || payment.body.data.payment.status === 'FAILED').toBe(true); }
    await invariant(f, reservation.status);
  });
  it.each(['EXPIRED', 'CANCELLED'] as const)('resolves an interrupted pending attempt as FAILED after %s', async (status) => {
    const f = await fixture(), key = randomUUID(); await preparePayment(f.id, f.reservationId, key, { simulationOutcome: 'SUCCESS' });
    if (status === 'EXPIRED') vi.setSystemTime(new Date(f.hold.expiresAt));
    else await request(app).post(`/api/reservations/${f.reservationId}/cancel`).set('Cookie', f.cookie).set('Origin', origin).expect(200);
    const response = await pay(f, key).expect(200);
    expect(response.body.data.payment).toMatchObject({ status: 'FAILED', failureReason: 'RESERVATION_' + status }); await invariant(f, status);
  });
  it('revalidates expiry AFTER writing tentative payment success and aborts both tentative transitions', async () => {
    const f = await fixture(); const update = PaymentAttempt.findOneAndUpdate.bind(PaymentAttempt);
    vi.spyOn(PaymentAttempt, 'findOneAndUpdate').mockImplementationOnce((...args) => {
      const query = update(...args), exec = query.exec.bind(query);
      vi.spyOn(query, 'exec').mockImplementationOnce(async () => { const result = await exec(); vi.setSystemTime(new Date(f.hold.expiresAt)); return result; }); return query;
    });
    const result = await pay(f).expect(200);
    expect(result.body.data.payment).toMatchObject({ status: 'FAILED', failureReason: 'RESERVATION_EXPIRED' }); await invariant(f, 'EXPIRED');
  });
  it('blocks an invalid event at finalization without creating success', async () => {
    const f = await fixture(), key = randomUUID(); await preparePayment(f.id, f.reservationId, key, { simulationOutcome: 'SUCCESS' });
    await Event.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.eventId) }, { $set: { status: 'CANCELLED' } });
    expect((await pay(f, key).expect(200)).body.data.payment).toMatchObject({ status: 'FAILED', failureReason: 'EVENT_NOT_PAYABLE' }); await invariant(f, 'HELD');
  });
  it('allows an existing unexpired hold to complete after the admission deadline closes', async () => {
    const f = await fixture(); await Event.updateOne({ _id: f.eventId }, { $set: { registrationDeadline: eventTime } });
    await pay(f).expect(200); await invariant(f, 'CONFIRMED');
  });
  it('fails a corrupted pending amount without confirming or repairing its price', async () => {
    const f = await fixture(), key = randomUUID(), id = await preparePayment(f.id, f.reservationId, key, { simulationOutcome: 'SUCCESS' });
    await PaymentAttempt.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { amountPaise: 1 } });
    expect((await pay(f, key).expect(200)).body.data.payment).toMatchObject({ status: 'FAILED', failureReason: 'PAYMENT_AMOUNT_MISMATCH', amountPaise: 1 }); await invariant(f, 'HELD');
  });
});

describe('payment authorization, validation, history and recovery', () => {
  it('guards every endpoint by session and persisted attendee role', async () => {
    const f = await fixture();
    for (const suffix of ['', '/000000000000000000000000']) {
      await request(app).get(path(f) + suffix).expect(401);
      await request(app).get(path(f) + suffix).set('Cookie', f.organizer.cookie).expect(403);
    }
    await request(app).post(path(f)).set('Origin', origin).set('Idempotency-Key', randomUUID()).send({ simulationOutcome: 'SUCCESS' }).expect(401);
    await pay({ ...f, cookie: f.organizer.cookie }).expect(403);
    await User.updateOne({ _id: f.id }, { $set: { role: 'ORGANIZER' } }); await pay(f).expect(403);
    expect(await PaymentAttempt.countDocuments()).toBe(0); await invariant(f, 'HELD');
  });
  it('uses identical parent and attempt 404s for missing, malformed and unowned resources', async () => {
    const f = await fixture(), other = await actor(app, 'ATTENDEE', 'other@example.test');
    const payment = (await pay(f).expect(200)).body.data.payment;
    for (const id of [f.reservationId, '000000000000000000000000', 'bad']) {
      const root = `/api/reservations/${id}/payments`;
      for (const suffix of ['', '/' + payment.id]) await request(app).get(root + suffix).set('Cookie', other.cookie).expect(404);
      await request(app).post(root).set('Cookie', other.cookie).set('Origin', origin).set('Idempotency-Key', randomUUID()).send({ simulationOutcome: 'SUCCESS' }).expect(404);
    }
    for (const id of ['000000000000000000000000', 'bad', f.eventId]) {
      expect((await request(app).get(path(f) + '/' + id).set('Cookie', f.cookie).expect(404)).body.error.code).toBe('PAYMENT_ATTEMPT_NOT_FOUND');
    }
    await invariant(f, 'CONFIRMED');
  });
  it('requires a trusted Origin for payment processing', async () => {
    const f = await fixture();
    for (const untrusted of [undefined, 'null', 'https://evil.test']) {
      const pending = request(app).post(path(f)).set('Cookie', f.cookie).set('Idempotency-Key', randomUUID());
      if (untrusted) pending.set('Origin', untrusted);
      await pending.send({ simulationOutcome: 'SUCCESS' }).expect(403);
    }
    expect(await PaymentAttempt.countDocuments()).toBe(0); await invariant(f, 'HELD');
  });
  it.each(['', 'short', 'a'.repeat(500), randomUUID() + ', ' + randomUUID(), '00000000-0000-1000-8000-000000000000'])('rejects invalid/missing idempotency header %#', async (key) => {
    const f = await fixture(), operation = request(app).post(path(f)).set('Cookie', f.cookie).set('Origin', origin);
    if (key) operation.set('Idempotency-Key', key);
    await operation.send({ simulationOutcome: 'SUCCESS' }).expect(400);
    expect(await PaymentAttempt.countDocuments()).toBe(0); await invariant(f, 'HELD');
  });
  it.each(['userId', 'amountPaise', 'transactionId', 'status', 'reservationStatus', 'confirmedAt', 'cardNumber', '$set'])('rejects protected body field %s', async (field) => {
    const f = await fixture();
    await request(app).post(path(f)).set('Cookie', f.cookie).set('Origin', origin).set('Idempotency-Key', randomUUID()).send({ simulationOutcome: 'SUCCESS', [field]: 'forged' }).expect(400);
    expect(await PaymentAttempt.countDocuments()).toBe(0); await invariant(f, 'HELD');
  });
  it.each(['PENDING', 'FAILED', 'PAID', 'success', { $ne: null }, null])('rejects invalid outcome %#', async (simulationOutcome) => {
    const f = await fixture(); await request(app).post(path(f)).set('Cookie', f.cookie).set('Origin', origin).set('Idempotency-Key', randomUUID()).send({ simulationOutcome }).expect(400);
    expect(await PaymentAttempt.countDocuments()).toBe(0);
  });
  it.each(['EXPIRED', 'CANCELLED', 'CONFIRMED'] as const)('does not create a new payment for %s', async (status) => {
    const f = await fixture();
    if (status === 'EXPIRED') vi.setSystemTime(new Date(f.hold.expiresAt));
    else if (status === 'CONFIRMED') await pay(f).expect(200);
    else await request(app).post(`/api/reservations/${f.reservationId}/cancel`).set('Cookie', f.cookie).set('Origin', origin).expect(200);
    await pay(f).expect(409);
    expect(await PaymentAttempt.countDocuments()).toBe(status === 'CONFIRMED' ? 1 : 0); await invariant(f, status);
  });
  it('rejects non-JSON input and direct confirmation PATCH', async () => {
    const f = await fixture(); await request(app).post(path(f)).set('Cookie', f.cookie).set('Origin', origin).set('Idempotency-Key', randomUUID()).type('text').send('simulationOutcome=SUCCESS').expect(400);
    await request(app).patch('/api/reservations/' + f.reservationId).set('Cookie', f.cookie).set('Origin', origin).send({ status: 'CONFIRMED' }).expect(404);
    await invariant(f, 'HELD');
  });
  it.each(['page=0', 'limit=51', 'page=1&page=2', 'status=SUCCESS', 'idempotencyKey[$ne]=x', 'userId=forged'])('rejects unsafe history query %s', async (query) => {
    const f = await fixture(); await request(app).get(path(f) + '?' + query).set('Cookie', f.cookie).expect(400);
  });
  it('returns bounded, newest-stable owned history, exact-key recovery and explicit safe DTOs', async () => {
    const f = await fixture(), keys = [randomUUID(), randomUUID(), randomUUID()];
    const first = await pay(f, keys[0], 'FAILURE').expect(200); const second = await pay(f, keys[1], 'FAILURE').expect(200); const third = await pay(f, keys[2]).expect(200);
    const list = await request(app).get(path(f) + '?limit=2').set('Cookie', f.cookie).expect(200);
    expect(list.body.data.payments.map((p: { id: string }) => p.id)).toEqual([third.body.data.payment.id, second.body.data.payment.id]);
    expect(list.body.data.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(list.headers['cache-control']).toBe('no-store');
    const page = await request(app).get(path(f) + '?limit=2&page=2').set('Cookie', f.cookie).expect(200);
    expect(page.body.data.payments[0]).toEqual(first.body.data.payment);
    const exact = await request(app).get(path(f) + '?idempotencyKey=' + keys[0]).set('Cookie', f.cookie).expect(200);
    expect(exact.body.data.payments).toEqual([first.body.data.payment]);
    const detail = await request(app).get(path(f) + '/' + third.body.data.payment.id).set('Cookie', f.cookie).expect(200);
    expect(detail.body.data.payment).toEqual(third.body.data.payment);
    expect(Object.keys(detail.body.data.payment).sort()).toEqual(['id', 'reservationId', 'transactionId', 'idempotencyKey', 'amountPaise', 'status', 'simulated', 'simulationOutcome', 'failureReason', 'createdAt', 'updatedAt', 'completedAt'].sort());
    expect(detail.body.data.reservation.status).toBe('CONFIRMED'); await invariant(f, 'CONFIRMED');
  });
  it('preserves initialized uniqueness indexes and immutable request binding', async () => {
    const f = await fixture(), key = randomUUID(); const payment = (await pay(f, key, 'FAILURE').expect(200)).body.data.payment;
    const indexes = await PaymentAttempt.collection.indexes();
    expect(indexes.filter((i) => i.unique).map((i) => i.name)).toEqual(expect.arrayContaining(['payment_transaction_unique', 'payment_idempotency_unique']));
    expect(indexes.map((i) => i.name)).toContain('payment_reservation_history_stable');
    await PaymentAttempt.updateOne({ _id: payment.id }, { $set: { amountPaise: 0, simulationOutcome: 'SUCCESS', transactionId: 'forged', idempotencyKey: randomUUID() } });
    expect((await pay(f, key, 'FAILURE').expect(200)).body.data.payment).toEqual(payment);
    expect((await pay(f, key.toUpperCase(), 'FAILURE').expect(200)).body.data.payment.id).toBe(payment.id);
    await invariant(f, 'HELD');
  });
  it('keeps legacy records readable and sanitizes unknown failure details', async () => {
    const f = await fixture(); const legacy = await PaymentAttempt.create({ reservationId: f.reservationId, transactionId: 'sim_legacy', idempotencyKey: randomUUID(), status: 'FAILED', amountPaise: 19900, failureReason: 'private driver failure' });
    const result = await request(app).get(path(f) + '/' + legacy._id).set('Cookie', f.cookie).expect(200);
    expect(result.body.data.payment).toMatchObject({ simulationOutcome: null, completedAt: null, failureReason: 'UNKNOWN_FAILURE' });
    expect(JSON.stringify(result.body)).not.toContain('private driver');
  });
  it('reports a lost final commit response as uncertain, then replays the committed result safely', async () => {
    const f = await fixture(), key = randomUUID(), start = mongoose.connection.startSession.bind(mongoose.connection);
    let calls = 0;
    vi.spyOn(mongoose.connection, 'startSession').mockImplementation(async () => {
      const session = await start(); if (++calls !== 2) return session;
      const transaction = session.withTransaction.bind(session);
      vi.spyOn(session, 'withTransaction').mockImplementationOnce(async (...args) => {
        await transaction(...args); const error = new mongoose.mongo.MongoServerError({ message: 'private lost commit response' }); error.addErrorLabel('UnknownTransactionCommitResult'); throw error;
      }); return session;
    });
    expect((await pay(f, key).expect(503)).body.error.code).toBe('PAYMENT_OUTCOME_UNKNOWN'); await invariant(f, 'CONFIRMED');
    const exact = await request(app).get(path(f) + '?idempotencyKey=' + key).set('Cookie', f.cookie).expect(200);
    const replay = await pay(f, key).expect(200); expect(replay.body.data.payment).toEqual(exact.body.data.payments[0]); expect(await PaymentAttempt.countDocuments()).toBe(1);
  });
  it('bounds repeated checkout processing while retaining read-only status recovery', async () => {
    const f = await fixture(), key = randomUUID();
    for (let i = 0; i < 60; i++) await pay(f, key, 'FAILURE').expect(200);
    const limited = await pay(f, key, 'FAILURE').expect(429); expect(limited.headers['retry-after']).toBe('60');
    expect((await request(app).get(path(f)).set('Cookie', f.cookie).expect(200)).body.data.payments).toHaveLength(1); await invariant(f, 'HELD');
  });
  it('fails closed for unavailable MongoDB and invalid signing configuration', async () => {
    const f = await fixture(); await disconnectDatabase();
    try { await pay(f).expect(503); await request(app).get(path(f)).set('Cookie', f.cookie).expect(503); await request(app).get('/api/health').expect(200); }
    finally { await connectDatabase(database.uri); }
    const unavailable = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: { JWT_SECRET: 'weak' } });
    await request(unavailable).post(path(f)).send({}).expect(503); await request(unavailable).get(path(f)).expect(503);
    await invariant(f, 'HELD');
  });
});
